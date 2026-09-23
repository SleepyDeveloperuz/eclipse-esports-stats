import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEclipseTier, tierMethodology } from '../lib/mlbb/tier.js';
import { heroTimeline, appendRankSnapshot, mergeTimelineSources } from '../lib/mlbb/timeline.js';
let JSDOM;
try { ({ JSDOM } = await import(process.env.ECLIPSE_JSDOM_PATH || 'jsdom')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const domTest = JSDOM ? test : (name, fn) => test(name, { skip: 'Set ECLIPSE_JSDOM_PATH.' }, fn);
const tick = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const stamp = '2026-09-19T03:00:00.000Z';
const catalog = ['Miya', 'Tigreal', 'Ling', 'Rafaela'].map((name, index) => ({ id: index + 1, name, lanes: ['Gold'], roles: ['Fixture'], images: {} }));
const rows = catalog.map((hero, index) => ({ heroId: hero.id, name: hero.name, officialRank: index + 1, winRate: .51 + index * .01, pickRate: .01 + index * .01, banRate: index * .1 }));
const snapshot = rank => ({ status: rank === 'epic' ? 'stale' : 'fresh', updatedAt: stamp, data: { rank, days: '7', official: rows, eclipse: buildEclipseTier(rows.map(row => ({ ...row, winRate: row.winRate + (rank === 'glory' ? .03 : 0) }))), methodology: tierMethodology() } });
function setup(query = '', options = {}) {
  const w = new JSDOM('<main id="metaLabContainer"></main>', { url: `https://fixture.invalid/meta-lab${query}`, runScripts: 'outside-only', pretendToBeVisual: true }).window;
  const calls = [], storageKeys = [], notices = [], writes = [];
  const values = new Map(Object.entries(options.storage || {}));
  Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('No sessions'); } });
  Object.defineProperty(w, 'localStorage', { value: {
    getItem(key) { storageKeys.push(key); if (options.blockStorage) throw new Error('blocked'); return values.get(key) || null; },
    setItem(key, value) { storageKeys.push(key); if (options.blockStorage) throw new Error('blocked'); values.set(key, value); }
  } });
  w.showToast = message => notices.push(message);
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async value => { writes.push(value); } }, configurable: true });
  w.fetch = async (path, config) => {
    assert.equal(config?.headers?.Authorization, undefined);
    const url = new URL(path, w.location.href); calls.push(url);
    const rank = url.searchParams.get('rank') || 'mythic';
    let body;
    if (options.fetch) { const custom = await options.fetch(url); if (custom) return custom; }
    if (url.pathname === '/api/mlbb-meta' && url.searchParams.get('view') === 'timeline') body = { data: { points: [{ date: '2026-09-18', tier: 'A', winRate: .51, pickRate: .02, banRate: 0, eclipseScore: null, methodologyVersion: 'old-method' }] } };
    else if (url.pathname === '/api/mlbb-meta') body = snapshot(rank);
    else if (url.pathname === '/api/mlbb-heroes') {
      const heroId = Number(url.searchParams.get('id'));
      body = { status: 'fresh', updatedAt: stamp, data: heroId ? { ...catalog.find(h => h.id === heroId), skills: [{ name: `Skill ${heroId}`, description: 'A <b>description</b>', cooldownCost: '8 seconds' }] } : catalog };
    } else if (url.pathname === '/api/mlbb-patches') body = { data: [] };
    else throw new Error('Private or unexpected API: ' + url.pathname);
    return { ok: true, json: async () => body };
  };
  for (const name of ['date-utils', 'mlbb', 'tier-board', 'meta-explore']) w.eval(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'));
  const manager = new w.MlbbDataManager({ getAccessToken: () => '', getToken: () => '', isAdmin: () => false }, null, null, null);
  return { w, manager, calls, storageKeys, notices, writes, values };
}

test('tier explanation reconstructs actual score without changing raw rates', () => {
  for (const row of buildEclipseTier(rows)) {
    const b = row.scoreBreakdown;
    assert.equal(Number((b.winPoints + b.pickPoints + b.banPoints).toFixed(4)), row.eclipseScore);
    assert.equal(b.combinedSignal, .6 * b.absoluteSignal + .4 * b.relativeSignal);
    assert.equal(b.winPoints, (50 + 100 / Math.PI * Math.atan(b.combinedSignal)) * .5);
    assert.equal(b.pickPoints, (100 * row.pickRate / (row.pickRate + b.pickReference)) * .2);
    assert.equal(b.banPoints, (100 * row.banRate / (row.banRate + .1)) * .3);
    assert.equal(row.winRate, rows.find(r => r.heroId === row.heroId).winRate);
    assert.equal(row.quality.confidence, null);
  }
});
test('timeline keeps actual dates, isolates cohort and never manufactures historical score', () => {
  const base = { rank: 'mythic', days: 7, methodologyVersion: 'v1', updatedAt: '2026-09-10T03:00:00Z', heroes: [{ heroId: 1, winRate: .5, pickRate: 0, banRate: null }], tiers: [{ heroId: 1, tier: 'B', eclipseRank: 2 }] };
  const result = heroTimeline({ data: [base, { ...base, rank: 'epic' }, { ...base, days: 1 }, { ...base, updatedAt: 'bad date' }, { ...base, heroes: {} }, { ...base, updatedAt: '2026-09-10T05:00:00Z', methodologyVersion: 'v2' }, { ...base, updatedAt: '2026-09-19T03:00:00Z' }] }, { heroId: 1, rank: 'mythic', days: '7' });
  assert.deepEqual(result.points.map(p => p.date), ['2026-09-10', '2026-09-19']);
  assert.equal(result.points[0].methodologyVersion, 'v2');
  assert.equal(result.points[0].eclipseScore, null);
  assert.equal(result.points[0].pickRate, 0);
  assert.equal(result.points[0].banRate, null);
  assert.deepEqual(heroTimeline(null, { heroId: 1, rank: 'mythic', days: '7' }).points, []);
});
test('timeline caps points and strips unrelated stored fields', () => {
  const data = Array.from({ length: 100 }, (_, index) => ({ updatedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(), rank: 'epic', days: '7', diagnostic: 'secret', heroes: [{ heroId: 1, winRate: 2 }], tiers: [{ heroId: 1, tier: 'INVALID' }] }));
  const result = heroTimeline({ data }, { heroId: 1, rank: 'epic', days: '7' });
  assert.equal(result.points.length, 90);
  assert.equal(result.points[0].winRate, null); assert.equal(result.points[0].tier, null);
  assert.doesNotMatch(JSON.stringify(result), /secret|diagnostic/);
});

test('per-cohort compact history is bounded, deduplicated and merges legacy without rewriting it', () => {
  let history;
  const scored = buildEclipseTier(rows);
  for (let day = 1; day <= 100; day++) history = appendRankSnapshot(history, scored, { rank: 'mythic', days: '7', methodologyVersion: 'v2', updatedAt: new Date(Date.UTC(2026, 0, day)).toISOString() });
  assert.equal(history.snapshots.length, 90);
  history = appendRankSnapshot(history, scored, { rank: 'mythic', days: '7', methodologyVersion: 'v2', updatedAt: history.snapshots.at(-1).updatedAt });
  assert.equal(history.snapshots.length, 90);
  const legacy = { data: [{ rank: 'mythic', days: 7, updatedAt: history.snapshots.at(-1).updatedAt, heroes: [{ heroId: 1, winRate: .3 }], tiers: [{ heroId: 1, tier: 'D' }] }] };
  const before = JSON.stringify(legacy);
  const points = heroTimeline(mergeTimelineSources(legacy, { data: history }, { rank: 'mythic', days: '7' }), { heroId: 1, rank: 'mythic', days: '7' }).points;
  assert.equal(points.length, 90); assert.equal(points.at(-1).winRate, rows[0].winRate);
  assert.equal(points.at(-1).eclipseScore, scored.find(row => row.heroId === 1).eclipseScore);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(mergeTimelineSources(null, { data: history }, { rank: 'epic', days: '7' }).data.length, 0);
  const manyRows = Array.from({ length: 200 }, (_, i) => ({ ...scored[0], heroId: i + 1 }));
  let large;
  for (let day = 1; day <= 90; day++) large = appendRankSnapshot(large, manyRows, { rank: 'epic', days: '7', methodologyVersion: 'v2', updatedAt: new Date(Date.UTC(2026, 0, day)).toISOString() });
  assert.ok(Buffer.byteLength(JSON.stringify({ result: JSON.stringify(large) })) < 2_000_000, 'Ample margin below the 6MB REST read cap');
});

domTest('late lens response cannot overwrite a newer hero selection', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const { w, manager } = setup('?view=lens&lens=1', { fetch: async url => {
    if (url.searchParams.get('view') === 'timeline' && url.searchParams.get('id') === '1') {
      await waiting; return { ok: true, json: async () => ({ data: { points: [{ date: 'OLD-HERO', winRate: .9 }] } }) };
    }
  } });
  try {
    await manager.render(); await tick();
    const select = w.document.querySelector('[data-lens-select]'); select.value = '2'; select.dispatchEvent(new w.Event('change')); await tick();
    release(); await tick();
    assert.match(w.document.querySelector('.meta-explore-hero h4').textContent, /Tigreal/);
    assert.doesNotMatch(w.document.querySelector('.meta-timeline').textContent, /OLD-HERO/);
  } finally { release(); w.close(); }
});
domTest('Rank Lens uses four matching cohorts, exposes exact scoring and genuine timeline', async () => {
  const { w, manager, calls } = setup('?view=lens&lens=2&rank=glory');
  try {
    await manager.render(); await tick();
    assert.equal(w.document.querySelectorAll('.meta-lens-card').length, 4);
    assert.match(w.document.querySelector('.meta-explore-hero h4').textContent, /Tigreal/);
    assert.match(w.document.querySelector('.meta-why').textContent, /Nega|Win hissasi|50%/);
    assert.match(w.document.querySelector('.meta-timeline').textContent, /2026-09-18|old-method/);
    assert.match(w.document.querySelector('.meta-lens-card').textContent, /kechikkan/);
    const requested = calls.filter(url => url.pathname === '/api/mlbb-meta' && !url.searchParams.has('view'));
    assert.equal(new Set(requested.map(url => url.searchParams.get('rank'))).size, 4);
    assert.ok(requested.every(url => url.searchParams.get('days') === '7'));
    assert.equal(manager.formatRate(null), '—'); assert.equal(manager.formatRate(0), '0.00%');
    w.document.querySelector('[data-lens-rank="legend"]').click(); await tick();
    assert.equal(manager.selectedRank, 'legend');
    assert.ok(calls.some(url => url.searchParams.get('view') === 'timeline' && url.searchParams.get('rank') === 'legend'));
  } finally { w.close(); }
});
domTest('Compare loads only selected heroes, bounds selection to three and escapes skill text', async () => {
  const { w, manager, calls, notices } = setup('?view=compare&rank=epic&compare=1,2,2,3,4');
  try {
    await manager.render(); await tick();
    assert.deepEqual([...manager.compareIds], [1, 2, 3]);
    assert.equal(w.document.querySelectorAll('.meta-compare-card').length, 3);
    assert.match(w.document.querySelector('.meta-compare-skill').textContent, /<b>description<\/b>/);
    assert.equal(w.document.querySelector('.meta-compare-skill b'), null);
    const detailCalls = calls.filter(url => url.pathname === '/api/mlbb-heroes' && url.searchParams.has('id'));
    assert.equal(detailCalls.length, 3); assert.ok(detailCalls.every(url => url.searchParams.get('rank') === 'epic'));
    const select = w.document.querySelector('[data-compare-select]'); select.value = '4'; select.dispatchEvent(new w.Event('change'));
    assert.equal(manager.compareIds.length, 3); assert.ok(notices.some(message => message.includes('3 qahramon')));
    w.document.querySelector('[data-compare-remove="2"]').click(); await tick();
    assert.equal(w.document.querySelectorAll('.meta-compare-card').length, 2);
  } finally { w.close(); }
});
domTest('watchlist is local-only, survives reload, and handles blocked storage honestly', async () => {
  const first = setup('?view=watchlist'); let saved;
  try {
    await first.manager.render(); first.manager.toggleWatch(2); await tick();
    saved = first.values.get('eclipse:public:watchlist:v1'); assert.equal(saved, '[2]');
    assert.ok(first.storageKeys.every(key => key === 'eclipse:public:watchlist:v1'));
    assert.doesNotMatch(first.manager.shareUrl(), /watchIds|%5B2%5D/);
    assert.match(first.w.document.querySelector('.meta-watch-card').textContent, /Tigreal/);
  } finally { first.w.close(); }
  const second = setup('?view=watchlist', { storage: { 'eclipse:public:watchlist:v1': saved } });
  try { await second.manager.render(); assert.deepEqual([...second.manager.watchIds], [2]); second.manager.toggleWatch(2); assert.equal(second.manager.watchIds.length, 0); } finally { second.w.close(); }
  const blocked = setup('?view=watchlist', { blockStorage: true });
  try { await blocked.manager.render(); blocked.manager.toggleWatch(1); assert.equal(blocked.manager.watchPersistent, false); assert.match(blocked.w.document.body.textContent, /faqat shu sessiyada/); } finally { blocked.w.close(); }
});
domTest('share links round-trip filters, rank, view, compare and dossier without private parameters', async () => {
  const { w, manager, writes } = setup('?view=tier&rank=legend&tier=A&q=Tigreal&display=table&hero=2&compare=1,2&token=SECRET');
  try {
    await manager.render(); await tick();
    assert.match(w.document.querySelector('.meta-dossier').textContent, /Tigreal/);
    await manager.shareSelection(); const url = new URL(writes[0]);
    assert.equal(url.pathname, '/meta-lab'); assert.equal(url.searchParams.get('hero'), '2');
    assert.equal(url.searchParams.get('q'), 'Tigreal'); assert.equal(url.searchParams.get('rank'), 'legend');
    assert.equal(url.searchParams.get('tier'), 'A'); assert.equal(url.searchParams.get('display'), 'table');
    assert.equal(url.searchParams.get('compare'), '1,2'); assert.equal(url.searchParams.get('token'), null);
    w.document.querySelector('[data-dossier-close]').click(); assert.equal(new URL(manager.shareUrl()).searchParams.get('hero'), null);
    Object.defineProperty(w.navigator, 'clipboard', { value: null }); await manager.shareSelection();
    assert.equal(w.document.querySelector('[data-meta-share-url]').hidden, false);
    w.history.pushState(null, '', '?view=heroes&rank=epic&q=Miya'); w.dispatchEvent(new w.PopStateEvent('popstate')); await tick();
    assert.equal(manager.currentView, 'heroes'); assert.equal(manager.selectedRank, 'epic');
    assert.equal(w.document.querySelector('#metaHeroSearch').value, 'Miya');
  } finally { w.close(); }
});
domTest('tier board filters actually match the shared query and tier', async () => {
  const { w, manager } = setup('?view=tier&q=Tigreal');
  try {
    await manager.render(); await tick();
    const visible = [...w.document.querySelectorAll('.solar-tier-hero')].filter(button => !button.hidden);
    assert.equal(visible.length, 1); assert.match(visible[0].textContent, /Tigreal/);
    const input = w.document.querySelector('#metaTierSearch'); input.value = 'no-match'; input.dispatchEvent(new w.Event('input'));
    assert.equal(w.document.querySelector('[data-board-empty]').hidden, false);
    assert.equal(new URL(manager.shareUrl()).searchParams.get('q'), 'no-match');
  } finally { w.close(); }
});
domTest('missing rank remains missing and failed history is retryable', async () => {
  const { w, manager } = setup('?view=lens&lens=1', { fetch: async url => {
    if (url.pathname === '/api/mlbb-meta' && (url.searchParams.get('rank') === 'glory' || url.searchParams.get('view') === 'timeline')) return { ok: false, status: 503, json: async () => ({ error: 'Unavailable' }) };
  } });
  try {
    await manager.render(); await tick();
    const missing = w.document.querySelector('[data-lens-rank="glory"]').closest('article');
    assert.match(missing.textContent, /mavjud emas/); assert.equal(missing.querySelector('dd').textContent, '—');
    assert.ok(w.document.querySelector('[data-timeline-content] [data-explore-action="retry"]'));
  } finally { w.close(); }
});
