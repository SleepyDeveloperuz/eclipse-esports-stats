import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildEclipseTier, tierMethodology, TIER_METHOD_VERSION } from '../lib/mlbb/tier.js';
import { buildMetaMovers } from '../lib/mlbb/movers.js';
import { parsePatchArticle, PATCH_PARSER_VERSION } from '../lib/mlbb/patch-parser.js';
import { normalizeCounterPayload, stripMarkup } from '../lib/mlbb/normalize.js';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const stamp = '2026-09-21T03:00:00.000Z', now = Date.parse(stamp);
const row = (winRate = .535, extra = {}) => ({ heroId: 1, name: 'One', winRate, pickRate: .01, banRate: .2, ...extra });
const context = { rank: 'mythic', days: '7', updatedAt: stamp, now, patchEpoch: 'patch1', patchPublishedAt: '2026-09-01T00:00:00Z' };
const point = (date, win = .535, extra = {}) => ({ rank: 'mythic', days: '7', updatedAt: date, patchEpoch: 'patch1', methodologyVersion: TIER_METHOD_VERSION, rows: [[1, win, .01, .2, 'S', 1, 85]], ...extra });
const history = { rank: 'mythic', days: '7', snapshots: [point('2026-09-19T03:00:00Z'), point('2026-09-20T03:00:00Z')] };
test('equal Win does not hide differences in draft pressure', () => {
  const rows = Array.from({ length: 133 }, (_, i) => row(.5, { heroId: i + 1, name: 'Hero ' + i, pickRate: (i + 1) / 200, banRate: i / 133 }));
  const result = buildEclipseTier(rows, context);
  assert.ok(new Set(result.map(r => r.tier)).size > 1);
  assert.equal(result[0].heroId, 133);
  assert.ok(result[0].scoreBreakdown.pickPoints > 0 && result[0].scoreBreakdown.banPoints > 0);
});
test('missing rates remain unrated; small cohorts disclose a neutral fallback', () => {
  for (const extra of [{ winRate: null }, { pickRate: null }, { banRate: null }, { winRate: NaN }, { winRate: 1.1 }, { pickRate: 0 }]) {
    const r = buildEclipseTier([row(.52, extra)], context)[0];
    assert.equal(r.tier, 'U'); assert.equal(r.eclipseScore, null); assert.equal(r.eclipseRank, null);
  }
  assert.equal(buildEclipseTier([row()], context)[0].quality.relativeReference, 'neutral-fallback');
});
test('SS strength is independent of history, patch availability and freshness', () => {
  const r = buildEclipseTier([row()], { ...context, history })[0];
  assert.equal(r.tier, 'SS'); assert.equal(r.quality.status, 'stable'); assert.equal(r.quality.confidence, null); assert.equal(r.quality.sampleSize, null);
  for (const extra of [{ history: null }, { patchEpoch: null }, { patchPublishedAt: '2026-09-19T00:00:00Z' }, { now: now + 2 * 86400000 },
    { history: { ...history, rank: 'epic' } }, { history: { ...history, days: '1' } },
    { history: { ...history, snapshots: history.snapshots.map(p => ({ ...p, patchEpoch: 'other' })) } }]) {
    const next = buildEclipseTier([row()], { ...context, history, ...extra })[0];
    assert.equal(next.tier, r.tier); assert.equal(next.eclipseScore, r.eclipseScore);
    assert.notEqual(next.quality.status, 'stable');
  }
  assert.equal(buildEclipseTier([row()], { ...context, patchEpoch: null })[0].quality.status, 'provisional');
});
test('quality reuses raw history across methods and uses three dates, not a fragile 48-hour timer', () => {
  const snapshots = ['2026-09-19T23:00:00Z', '2026-09-20T23:00:00Z'].map(date => point(date, .535, { methodologyVersion: 'eclipse-tier-3.0.0' }));
  const result = buildEclipseTier([row()], { ...context, history: { ...history, snapshots } })[0];
  assert.equal(result.quality.historyDays, 3); assert.equal(result.quality.status, 'stable');
  assert.equal(buildEclipseTier([row()], { ...context, history: { ...history, snapshots: [snapshots[0], snapshots[0]] } })[0].quality.status, 'provisional');
});
test('rank context changes scores without forced SS quotas', () => {
  const cohort = center => Array.from({ length: 100 }, (_, i) => row(center + (i - 50) * .0008, { heroId: i + 2, name: 'Peer ' + i }));
  const lower = buildEclipseTier([row(.535), ...cohort(.48)], context).find(r => r.heroId === 1);
  const higher = buildEclipseTier([row(.535), ...cohort(.54)], context).find(r => r.heroId === 1);
  assert.equal(lower.tier, 'SS'); assert.notEqual(higher.tier, 'SS');
  assert.ok(lower.eclipseScore > higher.eclipseScore);
  const flat = Array.from({ length: 100 }, (_, i) => row(.5, { heroId: i + 1 }));
  assert.equal(buildEclipseTier(flat, context).filter(r => r.tier === 'SS').length, 0);
  const weak = buildEclipseTier([row(.4)], context)[0];
  assert.notEqual(weak.tier, 'SS');
});
test('55%, 58% and 60% do not saturate at 100; rounded ties sort by real Win not name', () => {
  const input = [row(.55, { heroId: 1, name: 'A' }), row(.58, { heroId: 2, name: 'Z' }), row(.6, { heroId: 3, name: 'Y' })];
  const result = buildEclipseTier(input, context);
  assert.deepEqual(result.map(r => r.heroId), [3, 2, 1]);
  assert.equal(new Set(result.map(r => r.eclipseScore)).size, 3);
  assert.ok(result.every(r => r.eclipseScore < 100));
  const close = buildEclipseTier([row(.58, { heroId: 1, name: 'A' }), row(.580000001, { heroId: 2, name: 'Z' })], context);
  assert.equal(close[0].heroId, 2);
  const equal = buildEclipseTier(input.map(r => ({ ...r, winRate: .55 })), context);
  assert.equal(new Set(equal.map(r => r.tier)).size, 1);
});
test('Movers uses separated windows and matching rank, never fakes missing history', () => {
  const data = [point(stamp, .55), point('2026-09-20T03:00:00Z', .2), point('2026-09-14T03:00:00Z', .5), point('2026-09-14T04:00:00Z', .1, { rank: 'epic' })];
  const result = buildMetaMovers({ data }, { ...context, names: [{ id: 1, name: 'One' }] });
  assert.equal(result.rows[0].winPp, 5); assert.equal(result.previousAt, '2026-09-14T03:00:00Z'); assert.equal(result.comparableTiers, true);
  assert.equal(buildMetaMovers({ data: data.slice(0, 2) }, context).available, false);
  assert.equal(buildMetaMovers({ data: [data[0], { ...data[2], patchEpoch: null }] }, context).rows[0].tier, null);
  assert.equal(buildMetaMovers({ data: [data[0], point('2026-08-01T03:00:00Z')] }, context).available, false);
});
test('Patch Impact bounds hero sections and preserves skill-arrow headings and preview', () => {
  const p = parsePatchArticle({ id: 1, title: 'PATCH NOTES Preview', body: '<p>[One] (↑)</p><p>[Skill 1] (↑)</p><p>Damage: 100 → 110</p><p>[Two] (↓)</p><p>Cooldown increased.</p><p>3. Battlefield Adjustments</p><p>Global changes.</p>' }, [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]);
  assert.equal(p.parserVersion, PATCH_PARSER_VERSION); assert.equal(p.classification, 'preview'); assert.equal(p.parseCoverage, 'partial');
  assert.deepEqual(p.heroAdjustments[0].changes, [{ skill: 'Skill 1', text: 'Damage: 100 → 110' }]); assert.equal(p.heroAdjustments[1].changes.length, 1);
  const empty = parsePatchArticle({ body: '<p>[One] (↑)</p><p>[Two] (↓)</p><p>Only Two narrative</p>' }, [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]);
  assert.equal(empty.heroAdjustments[0].summary, '');
});
test('missing matchup rates do not become zero; invalid Unicode cannot crash parser', () => {
  const p = { code: 0, data: { records: [{ data: { main_heroid: 1, sub_hero: [{ heroid: 2, hero_win_rate: null, hero_appearance_rate: '', increase_win_rate: 4 }] } }] } };
  const r = normalizeCounterPayload(p).favorable[0];
  assert.equal(r.winRate, null); assert.equal(r.pickRate, null); assert.equal(r.deltaWinRate, null);
  assert.doesNotThrow(() => stripMarkup('&#99999999999; &#xFFFFFFFF;'));
});
const w = {}; vm.runInNewContext(read('js/meta-decision-model.js'), { window: w }); const model = w.EclipseMetaDecisions;
const catalog = [{ id: 1, name: 'Ally', lanes: ['Gold Lane', 'Mid Lane'] }, { id: 2, name: 'Enemy', lanes: ['Gold'] }, { id: 3, name: 'Counter', lanes: ['EXP Lane'] }, { id: 4, name: 'Risk', lanes: ['EXP'] }, { id: 5, name: 'Banned', lanes: ['Jungle'] }];
const rows = catalog.map(h => row(.52, { heroId: h.id, name: h.name, tier: 'S' }));
test('draft excludes picks/bans and correctly reverses focal enemy matchup direction', () => {
  const details = { 2: { data: { matchups: { rank: 'mythic', days: '7', updatedAt: stamp, counters: { favorable: [{ heroId: 4 }], unfavorable: [{ heroId: 3 }] } } } } };
  const options = { catalog, rows, allies: [1], enemies: [2], bans: [5], lane: 'EXP', details, rank: 'mythic', now };
  const r = model.draft(options); assert.deepEqual(Array.from(r, x => x.hero.id), [3, 4]); assert.equal(r[0].signals, 1); assert.equal(r[1].signals, -1); assert.equal('winProbability' in r[0], false);
  assert.equal(model.draft({ ...options, rank: 'epic' })[0].signals, 0); assert.equal(model.draft({ ...options, now: now + 2 * 86400000 })[0].signals, 0);
  details[2].data.matchups.error = { code: 'OLD_PATCH' }; assert.equal(model.draft(options)[0].signals, 0);
  assert.equal(model.draft({ ...options, pool: [] }).length, 0); assert.equal(model.coverage([catalog[0]]).covered.length, 1);
  assert.equal(model.draft({ ...options, allies: [1, 2, 3, 4, 5] }).length, 0);
});
test('draft uses composite priority after lane and matchup fit, not raw Win alone', () => {
  const stats = rows.map(r => ({ ...r, eclipseScore: r.heroId === 4 ? 80 : 40, winRate: r.heroId === 4 ? .49 : .57 }));
  const options = { catalog, rows: stats, allies: [1], enemies: [2], bans: [5], lane: 'EXP', rank: 'mythic', now };
  assert.deepEqual(Array.from(model.draft(options), r => r.hero.id), [4, 3]);
  const details = { 2: { data: { matchups: { rank: 'mythic', days: '7', updatedAt: stamp, counters: { unfavorable: [{ heroId: 3 }] } } } } };
  assert.deepEqual(Array.from(model.draft({ ...options, details }), r => r.hero.id), [3, 4]);
  assert.equal(model.draft({ ...options, rows: stats.map(r => ({ ...r, tier: 'U' })) })[0].metaScore, -1);
});
let JSDOM;
try { ({ JSDOM } = await import(process.env.ECLIPSE_JSDOM_PATH || 'jsdom')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
const domTest = JSDOM ? test : (name, fn) => test(name, { skip: 'Set ECLIPSE_JSDOM_PATH' }, fn);
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
function surface(view = 'draft') {
  const window = new JSDOM('<main id="metaLabContainer"></main>', { url: 'https://fixture.invalid/meta-lab?view=' + view, runScripts: 'outside-only' }).window, calls = [];
  window.fetch = async path => {
    calls.push(path); const url = new URL(path, window.location.href);
    const data = url.pathname.endsWith('mlbb-heroes') ? { data: catalog.map(h => ({ ...h, images: {} })) }
      : url.pathname.endsWith('mlbb-patches') ? { data: [] } : url.searchParams.get('view') === 'movers' ? { data: { available: false, reason: 'Tarix yetarli emas' } }
        : { status: 'fresh', updatedAt: stamp, data: { rank: 'mythic', days: '7', eclipse: buildEclipseTier(rows, context), official: rows } };
    return { ok: true, json: async () => data };
  };
  for (const f of ['date-utils', 'mlbb', 'tier-board', 'meta-explore', 'meta-decision-model', 'meta-decisions']) window.eval(read('js/' + f + '.js'));
  return { window, calls, manager: new window.MlbbDataManager({ getAccessToken: () => '', isAdmin: () => false }, null, null, null) };
}
domTest('public tools navigate without private data and enforce draft exclusions', async () => {
  const { window, manager, calls } = surface();
  try {
    await manager.render(); await tick();
    assert.equal(window.document.querySelectorAll('[data-meta-view]').length, 9); assert.equal(window.document.querySelectorAll('[data-decision-view]').length, 1); assert.equal(window.document.querySelector('[data-draft-pool]'), null);
    manager.addDraft('bans', 5); await tick(); assert.equal(window.document.querySelector('[data-draft-pick="5"]'), null);
    manager.addDraft('allies', 5); assert.match(window.document.querySelector('[data-draft-message]').textContent, /allaqachon/);
    assert.doesNotMatch(manager.shareUrl(), /bans|allies|enemies|pool/);
    const select = window.document.querySelector('[data-decision-view]'); select.value = 'movers'; select.dispatchEvent(new window.Event('change')); await tick();
    assert.match(window.document.querySelector('[data-decision-content]').textContent, /Tarix yetarli emas/);
    assert.ok(calls.every(p => p.startsWith('/api/mlbb-') && !p.includes('id=')));
  } finally { window.close(); }
});

domTest('compact tier workspace groups existing controls with the board without duplicates', async () => {
  const { window, manager } = surface('tier');
  try {
    await manager.render(); await tick();
    const root = manager.container, panel = root.querySelector('.solar-tier-board > .meta-workspace');
    assert.ok(panel);
    for (const selector of ['.meta-lab-commandbar', '.meta-rank-picker', '#metaTierSearch', '[data-tier-export]', '[data-explore-action="share"]', '[data-meta-share-url]']) {
      assert.equal(root.querySelectorAll(selector).length, 1, selector);
      assert.ok(panel.contains(root.querySelector(selector)), selector);
    }
    assert.equal(panel.querySelectorAll('[data-meta-rank]').length, 4);
    assert.equal(panel.querySelectorAll('[data-tier-view]').length, 2);
    assert.equal(panel.querySelectorAll('.meta-tools-menu [data-meta-view]').length, 6);
    assert.equal(root.querySelector('.meta-share-bar'), null);
    assert.equal(root.querySelector('.tier-view-toolbar'), null);
    assert.ok(root.querySelector('.meta-workspace-about .meta-lab-hero'));
    assert.equal(root.querySelector('.meta-workspace-about').open, false);
    assert.match(panel.querySelector('.meta-workspace-info summary').textContent, /tajribaviy/);
    assert.equal(panel.querySelector('[data-meta-clear]').hidden, true);
  } finally { window.close(); }
});

domTest('compact search, reset, display switch, export and share retain their actions', async () => {
  const { window, manager } = surface('tier');
  try {
    await manager.render(); await tick(); const root = manager.container;
    let input = root.querySelector('#metaTierSearch');
    input.value = 'no-matching-hero'; input.dispatchEvent(new window.Event('input')); await tick();
    assert.match(root.querySelector('[data-meta-result-count]').textContent, /^0 \/ /);
    assert.equal(root.querySelector('[data-meta-clear]').hidden, false);
    const table = root.querySelector('[data-tier-view="table"]'); table.focus(); table.click();
    assert.ok(root.querySelector('.meta-tier-console > .meta-workspace'));
    assert.equal(root.querySelectorAll('#metaTierSearch').length, 1);
    assert.equal(root.querySelector('#metaTierSearch').value, 'no-matching-hero');
    assert.equal(window.document.activeElement.dataset.tierView, 'table');
    root.querySelector('[data-meta-clear]').click();
    assert.equal(manager.searchQuery, ''); assert.equal(manager.tierFilter, 'all');
    assert.equal(new URL(manager.shareUrl()).searchParams.has('q'), false);
    assert.equal(window.document.activeElement.id, 'metaTierSearch');
    let exported = false; manager.exportTierPng = () => { exported = true; };
    root.querySelector('[data-tier-export]').click(); assert.equal(exported, true);
    root.querySelector('[data-explore-action="share"]').click(); await tick();
    assert.equal(root.querySelector('[data-meta-share-url]').hidden, false);
    assert.equal(root.querySelector('[data-meta-share-url]').value, manager.shareUrl());
    const info = root.querySelector('.meta-workspace-info'); info.open = true;
    root.querySelector('[data-tier-view="board"]').click();
    assert.equal(root.querySelector('.meta-workspace-info').open, true);
    const menu = root.querySelector('.meta-tools-menu'); menu.open = true;
    const draft = menu.querySelector('[data-meta-view="draft"]'); draft.focus(); draft.click(); await tick();
    assert.equal(manager.currentView, 'draft');
    assert.equal(window.document.activeElement, root.querySelector('.meta-tools-menu > summary'));
    assert.ok(root.querySelector('[data-draft-lane]'));
  } finally { window.close(); }
});

domTest('v5 explanation separates draft priority from evidence and discloses the actual formula', async () => {
  const { window, manager } = surface();
  try {
    const result = buildEclipseTier([row(.58)], context)[0];
    const html = manager.whyMarkup(result, { updatedAt: stamp, data: { rank: 'mythic', days: '7' } });
    assert.match(html, /Nega SS tier/); assert.match(html, /Dastlabki baho/);
    assert.match(html, /50% Win/); assert.match(html, /20% Pick/); assert.match(html, /30% Ban/); assert.match(html, /atan/);
    assert.match(html, /Win hissasi \/ 50/); assert.match(html, /Ban hissasi \/ 30/);
    assert.match(html, /10 tadan kam/);
    assert.doesNotMatch(html, /Hozir S,|SS uchun mos tarix kerak/);
  } finally { window.close(); }
});
domTest('board, table, Why and PNG describe the same method and preserve rank and source date', async () => {
  const { window, manager } = surface('tier');
  try {
    await manager.render(); await tick();
    const ranked = buildEclipseTier([row(.55, { heroId: 3, name: 'High Win', officialRank: 1, pickRate: .0005, banRate: .001 }), row(.5, { heroId: 4, name: 'Contested', officialRank: 2, pickRate: .1, banRate: .9 })], context);
    manager.state.meta = { updatedAt: stamp, data: { rank: 'mythic', days: '7', eclipse: ranked, methodology: tierMethodology() } };
    assert.match(manager.tierMarkup(), /Win 50% · Pick 20% · Ban 30%/);
    manager.tierDisplay = 'table';
    const table = new window.DOMParser().parseFromString(manager.tierMarkup(), 'text/html');
    assert.equal(table.querySelector('tbody tr').dataset.heroId, '4');
    assert.doesNotMatch(table.body.textContent, /Pick va Ban alohida draft talabi/);
    const texts = [];
    const ctx = new Proxy({ measureText: text => ({ width: text.length * 8 }), fillText: text => texts.push(String(text)) }, { get: (target, key) => key in target ? target[key] : () => {} });
    window.HTMLCanvasElement.prototype.getContext = () => ctx;
    manager.drawTierPoster(ranked, new Map());
    assert.ok(texts.some(text => text.includes('Win 50% · Pick 20% · Ban 30%')));
    assert.ok(texts.some(text => text.includes(stamp) && text.includes('MYTHIC')));
    assert.ok(texts.some(text => text.includes(TIER_METHOD_VERSION)));
    assert.deepEqual(Array.from(manager.posterLayout(ranked).bands.filter(b => b.heroes.length), b => b.tier), ['SS', ranked[1].tier]);
    assert.match(manager.tierSummary({ data: { methodology: { weights: { winRate: 1, pickRate: 0, banRate: 0 } } } }), /Win 100% · Pick 0% · Ban 0%/);
  } finally { window.close(); }
});
domTest('patch output escapes provider text and blocks unsafe source links', async () => {
  const { window, manager } = surface('impact');
  try {
    await manager.render(); manager.state.patches = { data: [{ id: 1, title: 'Patch', parsedAt: stamp, classification: 'preview', officialUrl: 'javascript:alert(1)', heroAdjustments: [{ heroId: 1, heroName: '<img onerror=alert(1)>', change: 'buff', summary: '<script>oops</script>', changes: [{ skill: 'Skill', text: '<img src=x>' }] }] }] }; manager.renderState();
    const c = window.document.querySelector('.meta-impact-list'); assert.equal(c.querySelector('script,img'), null); assert.match(c.textContent, /<img/); assert.equal(window.document.querySelector('a[href^="javascript:"]'), null); assert.match(window.document.querySelector('.meta-decision').textContent, /PREVIEW/);
  } finally { window.close(); }
});
domTest('late draft and invalidated cache cannot overwrite new state; PNG keeps unrated heroes', async () => {
  const { window, manager } = surface();
  try {
    await manager.render(); await tick(); const request = manager.request.bind(manager), waiting = [];
    manager.request = path => path.includes('id=') ? new Promise(r => waiting.push(r)) : request(path);
    manager.addDraft('enemies', 2); manager.currentView = 'impact'; manager.renderState();
    for (const done of waiting) done({ data: { matchups: {} } }); await tick(); assert.match(window.document.querySelector('.meta-decision').textContent, /Patch Impact/);
    let done; manager.request = () => new Promise(r => { done = r; }); const pending = manager.cachedRequest('race', '/fixture'); manager.clearCache(); done({ data: 'old' }); await pending; assert.equal(manager.cache.has('race'), false);
    assert.equal(manager.posterLayout(buildEclipseTier([row(.5, { pickRate: null })], context)).bands.find(b => b.tier === 'U').heroes.length, 1);
  } finally { window.close(); }
});
