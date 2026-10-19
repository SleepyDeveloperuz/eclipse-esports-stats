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

domTest('partial manual sync reports failed sources and the retained rank snapshot', async () => {
  const { w, manager, notices } = setup();
  manager.auth = { isAdmin: () => true, getToken: () => 'admin-token' };
  manager.request = async () => ({ data: {
    partial: true,
    errors: {
      catalog: { code: 'UPSTREAM_HTTP_ERROR', message: 'Upstream 503 javobini qaytardi' },
      'rank:mythic': { code: 'UPSTREAM_TIMEOUT', message: 'Upstream so‘rovi vaqtidan oshdi' }
    },
    ranks: { mythic: { updatedAt: '2026-09-29T03:22:26.227Z' } },
    counts: { heroes: 133, rankRows: 133 }
  } });
  manager.render = async () => {};
  try {
    await manager.manualSync({ innerHTML: 'Sync now', disabled: false });
    assert.match(notices[0], /Sync qisman bajarildi/);
    assert.match(notices[0], /catalog \[UPSTREAM_HTTP_ERROR\]: Upstream 503/);
    assert.match(notices[0], /rank mythic \[UPSTREAM_TIMEOUT\]/);
    assert.match(notices[0], /Rank snapshot: 2026-09-29/);
    assert.doesNotMatch(notices[0], /Meta sync tayyor/);
  } finally { w.close(); }
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
    assert.ok(first.storageKeys.every(key => ['eclipse:public:watchlist:v1', 'eclipse:public:meta-preferences:v1'].includes(key)));
    assert.doesNotMatch(first.manager.shareUrl(), /watchIds|%5B2%5D/);
    assert.match(first.w.document.querySelector('.meta-watch-card').textContent, /Tigreal/);
  } finally { first.w.close(); }
  const second = setup('?view=watchlist', { storage: { 'eclipse:public:watchlist:v1': saved } });
  try { await second.manager.render(); assert.deepEqual([...second.manager.watchIds], [2]); second.manager.toggleWatch(2); assert.equal(second.manager.watchIds.length, 0); } finally { second.w.close(); }
  const blocked = setup('?view=watchlist', { blockStorage: true });
  try { await blocked.manager.render(); blocked.manager.toggleWatch(1); assert.equal(blocked.manager.watchPersistent, false); assert.match(blocked.w.document.body.textContent, /faqat shu sessiyada/); } finally { blocked.w.close(); }
});
domTest('rank and display preferences persist but explicit shared links take precedence', async () => {
  const key = 'eclipse:public:meta-preferences:v1';
  for (const [query, expectedRank, expectedDisplay] of [['', 'legend', 'table'], ['?rank=epic', 'epic', 'board'], ['?hero=2', 'mythic', 'board']]) {
    const { w, manager, values } = setup(query, { storage: { [key]: JSON.stringify({ rank: 'legend', display: 'table', token: 'must-not-persist' }) } });
    try {
      assert.equal(manager.selectedRank, expectedRank); assert.equal(manager.tierDisplay, expectedDisplay);
      await manager.render();
      const saved = JSON.parse(values.get(key));
      assert.deepEqual(Object.keys(saved).sort(), ['display', 'rank']);
      assert.equal(saved.rank, expectedRank);
    } finally { w.close(); }
  }
  for (const storage of [{ [key]: '{bad-json' }, { [key]: '{"rank":"invalid","display":"script"}' }]) {
    const { w, manager } = setup('', { storage });
    try { await manager.render(); assert.equal(manager.selectedRank, 'mythic'); assert.notEqual(manager.tierDisplay, 'script'); } finally { w.close(); }
  }
  const { w, manager } = setup('', { blockStorage: true });
  try { await manager.render(); await manager.selectRank('legend'); assert.equal(manager.selectedRank, 'legend'); } finally { w.close(); }
});

domTest('hero dossier closes to the same filtered list, scroll position and focus', async () => {
  const { w, manager } = setup('?q=Miya');
  try {
    await manager.render();
    const root = manager.container, hero = root.querySelector('[data-hero-id="1"]');
    root.scrollTop = 420; root.scrollLeft = 20; hero.focus();
    await manager.openHeroDossier(1);
    root.scrollTop = 0; root.scrollLeft = 0;
    manager.closeDossier();
    assert.equal(root.scrollTop, 420); assert.equal(root.scrollLeft, 20);
    assert.equal(w.document.activeElement, hero); assert.equal(manager.searchQuery, 'Miya');
    assert.equal(root.querySelector('#metaTierSearch').value, 'Miya');
    assert.equal(w.document.querySelector('.meta-dossier-overlay'), null);
  } finally { w.close(); }
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
domTest('tier board lane filtering filters heroes by lane and supports toggling', async () => {
  const customCatalog = [
    { id: 1, name: 'Miya', lanes: ['Gold Lane'] },
    { id: 2, name: 'Tigreal', lanes: ['Roam'] },
    { id: 3, name: 'Ling', lanes: ['Jungle'] },
    { id: 4, name: 'Chou', lanes: ['EXP Lane', 'Roam'] },
    { id: 5, name: 'Eudora', lanes: ['Mid Lane'] }
  ];
  const { w, manager } = setup('?view=tier', {
    fetch: async url => {
      if (url.pathname === '/api/mlbb-heroes') return { ok: true, json: async () => ({ status: 'fresh', data: customCatalog }) };
    }
  });
  try {
    await manager.render(); await tick();
    assert.equal(manager.heroLanes({ lanes: ['EXP Lane'] })[0], 'exp');
    assert.equal(manager.heroLanes({ lanes: ['Mid Lane'] })[0], 'mid');
    assert.equal(manager.heroLanes({ lanes: ['Jungle'] })[0], 'jungle');
    assert.equal(manager.heroLanes({ lanes: ['Roam'] })[0], 'roam');
    assert.equal(manager.heroLanes({ lanes: ['Gold Lane'] })[0], 'gold');
    assert.equal(manager.laneFilter, 'all');

    const expBtn = w.document.querySelector('[data-lane-filter="exp"]');
    assert.ok(expBtn, 'Exp Lane button exists');
    expBtn.click();
    assert.equal(manager.laneFilter, 'exp');
    assert.equal(new URL(manager.shareUrl()).searchParams.get('lane'), 'exp');

    // Click again toggles back to all
    expBtn.click();
    assert.equal(manager.laneFilter, 'all');
    assert.equal(new URL(manager.shareUrl()).searchParams.has('lane'), false);
  } finally { w.close(); }
});

domTest('tier board displays multi-lane flex heroes, tier descriptions, and rising hero highlights', async () => {
  const customCatalog = [
    { id: 4, name: 'Chou', lanes: ['EXP Lane'] },
    { id: 116, name: 'Julian', lanes: ['Jungle'] },
    { id: 73, name: 'Harith', lanes: ['Gold Lane'] },
    { id: 95, name: 'Yu Zhong', lanes: [] }
  ];
  const customRows = [
    { heroId: 4, name: 'Chou', winRate: .54, pickRate: .02, banRate: .1, tier: 'S', eclipseRank: 10, eclipseScore: 65 },
    { heroId: 116, name: 'Julian', winRate: .58, pickRate: .03, banRate: .4, tier: 'SS', eclipseRank: 2, eclipseScore: 78 },
    { heroId: 95, name: 'Yu Zhong', winRate: .49, pickRate: .01, banRate: .01, tier: 'A', eclipseRank: 40, eclipseScore: 50 }
  ];
  const comparison = {
    previousUpdatedAt: '2026-09-28T00:00:00Z',
    changes: [
      { heroId: 4, previousTier: 'A', tier: 'S', rankDelta: 5, isNew: false },
      { heroId: 116, previousTier: 'SS', tier: 'SS', rankDelta: -1, isNew: false }
    ]
  };
  const { w, manager } = setup('?view=tier', {
    fetch: async url => {
      if (url.pathname === '/api/mlbb-heroes') return { ok: true, json: async () => ({ status: 'fresh', data: customCatalog }) };
      if (url.pathname === '/api/mlbb-meta') return {
        ok: true,
        json: async () => ({
          status: 'fresh',
          data: {
            rank: 'mythic',
            days: '7',
            official: customRows,
            eclipse: customRows,
            comparison,
            methodology: { version: 'eclipse-tier-5.0.0' }
          }
        })
      };
    }
  });
  try {
    await manager.render(); await tick();
    // Multi-lane flex verification
    const chouLanes = manager.heroLanes({ id: 4, name: 'Chou', lanes: ['EXP Lane'] });
    assert.ok(chouLanes.includes('exp') && chouLanes.includes('roam'), 'Chou has both EXP and Roam lanes');
    assert.equal(chouLanes[0], 'exp', 'Chou primary lane is exp');

    const julianLanes = manager.heroLanes({ id: 116, name: 'Julian', lanes: ['Jungle'] });
    assert.ok(julianLanes.includes('jungle') && julianLanes.includes('mid') && julianLanes.includes('exp'), 'Julian has 3 lanes');

    const obsidiaLanes = manager.heroLanes({ id: 130, name: 'Obsidia', lanes: ['Mid Lane', 'EXP Lane'] });
    assert.equal(obsidiaLanes.length, 1, 'Obsidia has exactly 1 lane');
    assert.equal(obsidiaLanes[0], 'gold', 'Obsidia is strictly in gold lane only');

    const yuZhongLanes = manager.heroLanes({ id: 95, name: 'Yu Zhong', lanes: [] });
    assert.equal(yuZhongLanes.length, 1, 'Yu Zhong has exactly 1 lane');
    assert.equal(yuZhongLanes[0], 'exp', 'Yu Zhong is strictly in exp lane');

    const yuZhongById = manager.heroLanes(95);
    assert.equal(yuZhongById.length, 1, 'Yu Zhong by ID has exactly 1 lane');
    assert.equal(yuZhongById[0], 'exp', 'Yu Zhong by ID is in exp lane');

    // Tier description tooltips verification
    const ssDesc = manager.tierDescription('SS');
    assert.equal(ssDesc.en, 'Must ban or 1st pick heroes');
    assert.match(w.document.body.innerHTML, /Must ban or 1st pick heroes/);
    assert.match(w.document.body.innerHTML, /Strong heroes\. 1st pick or 2nd pick/);

    // Rising hero highlight and movement badge verification
    const chouBtn = w.document.querySelector('.solar-tier-hero[data-hero-id="4"]');
    assert.ok(chouBtn, 'Chou button rendered');
    assert.ok(chouBtn.classList.contains('is-rising'), 'Chou has is-rising class');
    const chouMovement = chouBtn.querySelector('.solar-tier-hero__movement.is-up');
    assert.ok(chouMovement, 'Chou has upward movement badge');

    const julianBtn = w.document.querySelector('.solar-tier-hero[data-hero-id="116"]');
    assert.ok(julianBtn, 'Julian button rendered');
    assert.ok(julianBtn.classList.contains('is-falling'), 'Julian has is-falling class');
    const julianMovement = julianBtn.querySelector('.solar-tier-hero__movement.is-down');
    assert.ok(julianMovement, 'Julian has downward movement badge');

    // Yu Zhong DOM rendering and badge verification
    const yzBtn = w.document.querySelector('.solar-tier-hero[data-hero-id="95"]');
    assert.ok(yzBtn, 'Yu Zhong button rendered');
    assert.equal(yzBtn.dataset.lane, 'exp', 'Yu Zhong has exp dataset lane');
    const yzBadge = yzBtn.querySelector('.solar-lane-badge.is-exp');
    assert.ok(yzBadge, 'Yu Zhong has exp lane badge rendered');

    // Hero hover quick-preview popover verification
    manager.showHeroPopover(chouBtn, 4);
    const popover = w.document.querySelector('.solar-hero-popover');
    assert.ok(popover, 'Hero popover created in DOM');
    assert.match(popover.innerHTML, /Chou/);
    assert.match(popover.innerHTML, /Score/);
    popover.remove();

    // Toggle highlight movements
    const toggleBtn = w.document.querySelector('[data-tier-highlight-movements]');
    assert.ok(toggleBtn, 'Highlight movements button exists');
    toggleBtn.click(); await tick();
    const board = w.document.querySelector('.solar-tier-board');
    assert.ok(board.classList.contains('is-highlighting-movements'), 'Board has is-highlighting-movements class');
  } finally { w.close(); }
});

domTest('hero lanes correctly resolves lane information for meta lab heroes', async () => {
  const { w, manager } = setup('?view=tier');
  try {
    await manager.render(); await tick();
    const expectations = [
      { name: 'Yi Sun-Shin', lanes: ['jungle', 'gold'], labels: ['Jungle (Asosiy)', 'Gold Lane'] },
      { name: 'Moskov', lanes: ['gold'], labels: ['Gold Lane'] },
      { name: 'Miya', lanes: ['gold'], labels: ['Gold Lane'] },
      { name: 'Brody', lanes: ['gold'], labels: ['Gold Lane'] },
      { name: 'Aamon', lanes: ['jungle'], labels: ['Jungle'] },
      { name: 'Badang', lanes: ['exp', 'roam'], labels: ['Exp Lane (Asosiy)', 'Roam'] },
      { name: 'Clint', lanes: ['gold'], labels: ['Gold Lane'] },
      { name: 'Leomord', lanes: ['jungle', 'exp'], labels: ['Jungle (Asosiy)', 'Exp Lane'] },
      { name: 'Hanabi', lanes: ['gold'], labels: ['Gold Lane'] },
      { name: 'Melissa', lanes: ['gold'], labels: ['Gold Lane'] },
      { name: 'Lesley', lanes: ['gold'], labels: ['Gold Lane'] },
      { name: 'Cici', lanes: ['exp', 'gold'], labels: ['Exp Lane (Asosiy)', 'Gold Lane'] },
      { name: 'Hanzo', lanes: ['jungle'], labels: ['Jungle'] },
      { name: 'Chip', lanes: ['roam'], labels: ['Roam'] },
      { name: 'Franco', lanes: ['roam'], labels: ['Roam'] },
      { name: 'Franko', lanes: ['roam'], labels: ['Roam'] },
      { name: 'Hilda', lanes: ['roam', 'exp'], labels: ['Roam (Asosiy)', 'Exp Lane'] },
      { name: 'Luo Yi', lanes: ['mid'], labels: ['Mid Lane'] },
      { name: 'Grock', lanes: ['roam'], labels: ['Roam'] },
      { name: 'Lancelot', lanes: ['jungle'], labels: ['Jungle'] }
    ];

    for (const exp of expectations) {
      const heroObj = { name: exp.name, lanes: [] };
      const resolvedLanes = manager.heroLanes(heroObj);
      assert.deepEqual(Array.from(resolvedLanes), exp.lanes, `${exp.name} lanes mismatch`);
      const resolvedLabels = manager.heroLanesLabels(heroObj);
      assert.deepEqual(Array.from(resolvedLabels), exp.labels, `${exp.name} labels mismatch`);
    }
  } finally { w.close(); }
});
