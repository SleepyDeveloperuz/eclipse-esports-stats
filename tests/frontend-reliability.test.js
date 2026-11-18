import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { buildPublic, STATIC_ENTRIES } from '../scripts/build.mjs';
import { buildEclipseTier } from '../lib/mlbb/tier.js';
import { summarizeQuality } from '../lib/scan-quality.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function dom(t, html = read('index.html')) {
  const w = new JSDOM(html, { url: 'https://fixture.invalid', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  t.after(() => w.close());
  w.scrollTo = () => {}; w.matchMedia = () => ({ matches: true, addEventListener() {} });
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.fetch = () => { throw new Error('Unexpected network request'); };
  w.structuredClone = structuredClone;
  return w;
}
function load(w, ...names) { for (const name of names) w.eval(read(`js/${name}.js`)); }
function timers(w) {
  let sequence = 0; const pending = new Map();
  w.setTimeout = (run, ms) => { const id = ++sequence; pending.set(id, { run, ms }); return id; };
  w.clearTimeout = id => pending.delete(id);
  return { pending, fire(ms) {
    const ready = [...pending].filter(([, task]) => task.ms === ms);
    for (const [id, task] of ready) { pending.delete(id); task.run(); }
    return ready.length;
  } };
}
function history(t) {
  const w = dom(t); load(w, 'stats', 'app'); const clock = timers(w), renders = [];
  let rows = [
    { id: 'm1', date: '2026-11-18', scope: 'individual', result: 'win', playerStats: [{ playerId: 'p1', heroUsed: 'Aulus' }] },
    { id: 'm2', date: '2026-11-17', scope: 'individual', result: 'loss', playerStats: [{ playerId: 'p2', heroUsed: 'Miya' }] },
    { id: 'm3', date: '2026-11-16', scope: 'individual', result: 'unknown', playerStats: [{ playerId: 'p2', heroUsed: 'Miya' }] }
  ];
  const roster = [{ id: 'p1', name: 'Shadow as always' }, { id: 'p2', name: 'Archived teammate', active: false }];
  const app = w.EclipseApp;
  Object.assign(app, { currentAnalyticsMode: 'squad', updateAnalyticsScopeControl() {}, refreshMotion() {}, renderDashboard() {},
    authManager: { isAdmin: () => true }, dataStore: { getMatches: () => rows, getPlayers: () => roster, getAllPlayers: () => roster },
    matchManager: { renderMatchHistory: (_, matches, players, options) => renders.push({ matches, players, options }) } });
  app.navigate('match-history');
  const input = w.document.getElementById('matchQuickSearch'); input.focus();
  const type = value => { input.value = value; input.dispatchEvent(new w.InputEvent('input', { bubbles: true })); };
  return { w, app, input, type, clock, renders, setRows: value => { rows = value; } };
}

test('history search batches rapid typing, keeps focus and uses current roster names', t => {
  const h = history(t); const original = h.input;
  h.type('S'); h.type('Shadow'); h.type('Shadow as always');
  assert.equal(h.renders.length, 1);
  assert.equal(h.clock.fire(150), 1);
  assert.equal(h.renders.length, 2);
  assert.deepEqual(h.renders.at(-1).matches.map(row => row.id), ['m1']);
  assert.equal(h.w.document.activeElement, original);
  assert.equal(h.w.document.getElementById('matchQuickSearch'), original);
  assert.equal(h.renders.at(-1).options.filtered, true);
});

test('returning to history keeps query/filter consistent and does not duplicate input listeners', t => {
  const h = history(t);
  h.type('Miya'); h.w.document.querySelector('[data-filter="losses"]').click();
  assert.deepEqual(h.renders.at(-1).matches.map(row => row.id), ['m2']);
  assert.equal(h.clock.fire(150), 0, 'Click flushes the pending query');
  h.app.navigate('dashboard'); h.app.navigate('match-history');
  assert.equal(h.input.value, 'Miya');
  assert.deepEqual(h.renders.at(-1).matches.map(row => row.id), ['m2']);
  const count = h.renders.length; h.type('Archived'); h.clock.fire(150);
  assert.equal(h.renders.length, count + 1);
  assert.deepEqual(h.renders.at(-1).matches.map(row => row.id), ['m2']);
});

test('history ignores incomplete composition, cancels off-page renders and reads fresh records', t => {
  const h = history(t);
  h.input.dispatchEvent(new h.w.CompositionEvent('compositionstart')); h.type('M');
  assert.equal(h.clock.fire(150), 0);
  h.input.value = 'Miya'; h.input.dispatchEvent(new h.w.CompositionEvent('compositionend'));
  h.setRows([{ id: 'fresh', date: '2026-11-18', scope: 'individual', result: 'win', playerStats: [{ playerId: 'p2', heroUsed: 'Miya' }] }]);
  h.clock.fire(150); assert.equal(h.renders.at(-1).matches[0].id, 'fresh');
  h.type('Aulus'); h.app.navigate('dashboard'); const count = h.renders.length;
  assert.equal(h.clock.fire(150), 0); assert.equal(h.renders.length, count);
});

test('Enter and native clear apply search immediately; unknown results are not losses', t => {
  const h = history(t); h.type('Aulus');
  h.input.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.equal(h.renders.at(-1).matches.length, 1); assert.equal(h.clock.fire(150), 0);
  h.input.value = ''; h.input.dispatchEvent(new h.w.Event('search'));
  assert.equal(h.renders.at(-1).matches.length, 3);
  h.w.document.querySelector('[data-filter="losses"]').click();
  assert.deepEqual(h.renders.at(-1).matches.map(row => row.id), ['m2']);
});

test('no query results are distinct from an empty match history', t => {
  const w = dom(t); load(w, 'stats', 'match');
  w.EclipseApp = { authManager: { isAdmin: () => true } };
  const manager = new w.MatchManager({}, {});
  manager.renderMatchHistory('matchHistoryContainer', [], [], { filtered: true });
  assert.match(w.document.getElementById('matchHistoryContainer').textContent, /Mos match topilmadi/);
  assert.equal(w.document.querySelector('[data-action="add-first-match"]'), null);
  manager.renderMatchHistory('matchHistoryContainer', [], []);
  assert.ok(w.document.querySelector('[data-action="add-first-match"]'));
});

test('private and public scripts defer in dependency order and entry buttons work without inline code', t => {
  for (const file of ['index.html', 'meta-lab.html', 'offline.html']) {
    const w = dom(t, read(file));
    for (const element of w.document.querySelectorAll('*')) {
      assert.ok([...element.attributes].every(attr => !/^on/i.test(attr.name)), `${file}: inline handler`);
    }
    for (const script of w.document.querySelectorAll('script')) {
      assert.ok(script.src, `${file}: inline script`);
      if (file !== 'offline.html' && script.type !== 'module') assert.ok(script.defer, script.src);
    }
  }
  const w = dom(t); load(w, 'app'); const visits = [];
  w.EclipseApp.navigate = page => visits.push(page); w.EclipseApp.bindQolControls();
  w.document.querySelector('[data-navigate="submissions"] i').click();
  w.document.querySelector('[data-navigate="batch"]').click();
  assert.deepEqual(visits, ['submissions', 'batch']);
  const csp = JSON.parse(read('vercel.json')).headers.flatMap(row => row.headers).find(row => row.key === 'Content-Security-Policy').value;
  assert.match(csp, /script-src 'self';/);
  assert.doesNotMatch(csp.split('script-src ')[1].split(';')[0], /unsafe-inline|unsafe-eval/);
});

test('bootstrap recovers from missing scripts and rejected init without exposing private content', async t => {
  for (const init of [null, async () => { throw new Error('Fixture startup failure'); }]) {
    const w = dom(t); w.console.error = () => {};
    if (init) w.EclipseApp = { init };
    load(w, 'bootstrap'); await tick();
    assert.equal(w.document.getElementById('bootstrapRetry').hidden, false);
    assert.equal(w.document.getElementById('accessBootstrap').getAttribute('role'), 'alert');
    assert.ok(w.document.querySelector('.app-container').hasAttribute('inert'));
    assert.ok(w.document.documentElement.classList.contains('access-locked'));
  }
});

test('bootstrap starts once after readiness and keeps the access check in charge', async t => {
  const w = dom(t); let count = 0, release;
  w.EclipseApp = { init: () => { count++; return new Promise(resolve => { release = resolve; }); } };
  load(w, 'bootstrap'); await tick();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); assert.equal(count, 1);
  assert.equal(w.document.getElementById('bootstrapRetry').hidden, true);
  assert.ok(w.document.documentElement.classList.contains('access-locked'));
  release(); await tick(); assert.equal(count, 1);
});

test('a deferred bootstrap waits through interactive state for application dependencies', async t => {
  const w = dom(t); let count = 0;
  Object.defineProperty(w.document, 'readyState', { configurable: true, value: 'interactive' });
  load(w, 'bootstrap');
  assert.equal(w.document.getElementById('bootstrapRetry').hidden, true);
  w.EclipseApp = { init: async () => { count++; } };
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await tick();
  assert.equal(count, 1); assert.equal(w.document.getElementById('bootstrapRetry').hidden, true);
});

test('auth timeout fails closed, releases retry, and ignores a late valid response', async t => {
  const w = dom(t); load(w, 'auth'); const clock = timers(w);
  let finish, requestSignal;
  w.fetch = async (_, options) => { requestSignal = options.signal; return new Promise(resolve => { finish = resolve; }); };
  const auth = new w.AuthManager({}); const pending = auth.ensureViewerAccess();
  assert.equal(clock.fire(15000), 1); assert.equal(await pending, false);
  assert.equal(requestSignal.aborted, true); assert.equal(auth.viewerAccessPromise, null);
  assert.ok(w.document.querySelector('#viewer-access-retry'));
  finish({ ok: true, json: async () => ({ valid: true }) }); await tick();
  assert.equal(w.document.documentElement.dataset.viewerAccess, 'locked');
  w.fetch = async () => ({ ok: true, json: async () => ({ valid: true, viewerRequired: true }) });
  assert.equal(await auth.ensureViewerAccess(), true);
  assert.equal(w.document.documentElement.dataset.viewerAccess, 'granted');
  assert.equal([...clock.pending.values()].filter(task => task.ms === 15000).length, 0);
});

test('auth deadline includes response body; late login cannot silently create a session', async t => {
  const w = dom(t); load(w, 'auth'); w.console.error = () => {}; const clock = timers(w);
  let finish;
  w.fetch = async () => ({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) });
  const auth = new w.AuthManager({}); const pending = auth.loginAccess('fixture'); await tick();
  clock.fire(15000); assert.equal(await pending, false);
  finish({ role: 'admin', token: 'late-token' }); await tick();
  assert.equal(auth.getToken(), ''); assert.equal(auth.isAdmin(), false);
});

test('median accepts measured zero and numeric strings but excludes missing and nonnumeric values without mutation', t => {
  const w = dom(t, ''); load(w, 'stats'); const S = w.StatsEngine;
  const input = Object.freeze([20, 2, 10, 0, '4', null, undefined, '', ' ', '\t', true, false, [], {}, NaN, Infinity]);
  assert.equal(S.median(input), 4); assert.equal(S.median([20, 2, 10, 4]), 7);
  assert.equal(S.median([0]), 0); assert.equal(S.median([null, '', ' ', false]), null);
  assert.equal(S.averageOrNull([false, ' ', 2, 4]), 3);
  assert.equal(S.completeSumOrNull([true, 2]), null);
  assert.equal(input[0], 20);
});

test('tier and scan medians average even cohorts and do not reorder source data', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ heroId: i + 1, name: `Hero ${i}`, winRate: .40 + i / 100, pickRate: .01 + i / 1000, banRate: .1 })).reverse();
  const before = JSON.stringify(rows), tiers = buildEclipseTier(rows);
  assert.ok(Math.abs(tiers[0].scoreBreakdown.cohortMedian - .445) < 1e-12);
  assert.equal(JSON.stringify(rows), before);
  const entries = [{ outcome: 'ready', elapsedMs: 20000 }, { outcome: 'review', elapsedMs: 2000 }, { outcome: 'ready', elapsedMs: 4000 }, { outcome: 'review', elapsedMs: 10000 }, { outcome: 'error', elapsedMs: 1 }];
  assert.equal(summarizeQuality({ entries, pruned: 0 }).medianMs, 7000);
  assert.equal(entries[0].elapsedMs, 20000);
});

test('production bundle preserves deferred dependency order and changes cache key only with its content', t => {
  const directory = mkdtempSync(join(tmpdir(), 'eclipse-frontend-build-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const entry of STATIC_ENTRIES) {
    if (['js', 'css'].includes(entry)) cpSync(new URL('../' + entry, import.meta.url), join(directory, entry), { recursive: true });
    else if (['assets', 'vendor'].includes(entry)) mkdirSync(join(directory, entry));
    else writeFileSync(join(directory, entry), read(entry));
  }
  buildPublic(directory);
  const built = () => new JSDOM(readFileSync(join(directory, 'public/index.html'), 'utf8')).window;
  let w = built(); const scripts = [...w.document.querySelectorAll('script')];
  const js = scripts.find(s => s.src.includes('bundle.min.js')); assert.ok(js?.defer);
  assert.ok(scripts.findIndex(s => s.src.includes('bootstrap.js')) < scripts.indexOf(js));
  assert.ok(scripts.indexOf(js) < scripts.findIndex(s => s.type === 'module'));
  assert.equal(scripts.filter(s => s.src.includes('/heroes.js')).length, 0);
  const jsKey = js.src, cssKey = w.document.querySelector('link[href*="bundle.min.css"]').href; w.close();
  const bundle = readFileSync(join(directory, 'public/js/bundle.min.js'), 'utf8');
  new vm.Script(bundle);
  assert.ok(bundle.indexOf('// --- stats.js ---') < bundle.indexOf('// --- app.js ---'));
  writeFileSync(join(directory, 'js/app.js'), read('js/app.js') + '\n// Cache revision fixture\n');
  buildPublic(directory); w = built();
  assert.notEqual(w.document.querySelector('script[src*="bundle.min.js"]').src, jsKey);
  assert.equal(w.document.querySelector('link[href*="bundle.min.css"]').href, cssKey); w.close();
});

test('real application startup renders cached data only after the viewer check succeeds', async t => {
  const w = dom(t);
  Object.defineProperty(w.document, 'readyState', { configurable: true, value: 'interactive' });
  for (const script of w.document.querySelectorAll('script[src]')) {
    if (script.type === 'module') continue;
    w.eval(read(new URL(script.src).pathname.slice(1)));
  }
  w.CloudSync.prototype.isConfigured = () => false;
  const db = new w.DataStore();
  db.savePlayers([{ id: 'p1', name: 'Fixture teammate', primaryRole: 'Jungler' }]);
  db.saveMatches([{ id: 'boot-fixture', date: '2026-11-18', result: 'win', scope: 'individual', matchType: 'ranked',
    durationSeconds: 600, playerStats: [{ playerId: 'p1', heroUsed: 'Aulus', rolePlayed: 'Jungler', kills: 2, deaths: 1, assists: 3, inGameScore: 8 }] }]);
  w.localStorage.setItem('eclipse_analytics_mode', 'squad');
  const before = JSON.stringify(db.getMatches());
  let allow, renders = 0; const app = w.EclipseApp, render = app.renderDashboard;
  app.renderDashboard = (...args) => { renders++; return render.apply(app, args); };
  w.fetch = async path => {
    assert.equal(path, '/api/auth?scope=viewer');
    return new Promise(resolve => { allow = () => resolve({ ok: true, json: async () => ({ valid: true, viewerRequired: true }) }); });
  };
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await tick();
  assert.equal(renders, 0); assert.ok(w.document.querySelector('.app-container').hasAttribute('inert'));
  allow(); await tick();
  assert.equal(renders, 1); assert.equal(w.document.getElementById('bootstrapRetry').hidden, true);
  assert.equal(w.document.documentElement.classList.contains('access-locked'), false);
  assert.equal(w.document.getElementById('accessBootstrap').hidden, true);
  assert.equal(JSON.stringify(app.dataStore.getMatches()), before);
  app.navigate('match-history');
  assert.match(w.document.getElementById('matchHistoryContainer').textContent, /Aulus/);
});

test('Meta read timeout settles loading and a late response cannot poison the cache', async t => {
  const w = dom(t); load(w, 'mlbb'); const clock = timers(w);
  let finish, signal;
  w.fetch = async (_, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); };
  const manager = new w.MlbbDataManager({ getAccessToken: () => '' }, null, null, null);
  const pending = manager.getHeroes(); const rejected = assert.rejects(pending, /javob bermadi/);
  clock.fire(20000); await rejected;
  assert.equal(signal.aborted, true); assert.equal(manager.pending.size, 0);
  finish({ ok: true, json: async () => ({ data: [{ id: 1, name: 'Late stale hero' }] }) }); await tick();
  assert.equal(manager.cache.size, 0);
  w.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: 2, name: 'Fresh hero' }] }) });
  assert.equal((await manager.getHeroes()).data[0].id, 2);
  assert.equal([...clock.pending.values()].filter(task => task.ms === 20000).length, 0);
});

test('an older Meta load cannot rerender a newer search or selected rank', async t => {
  const w = dom(t); load(w, 'mlbb');
  const manager = new w.MlbbDataManager({ getAccessToken: () => '', isAdmin: () => false }, null, null, null);
  let finish; const payload = { data: [{ id: 1, name: 'Fixture' }] };
  manager.getHeroes = () => new Promise(resolve => { finish = resolve; });
  manager.getMeta = async () => ({ data: { rank: 'mythic' } }); manager.getPatches = async () => ({ data: [] });
  manager.closeDossier = () => {}; manager.hydrateClientCatalog = async () => {};
  let renders = 0; manager.renderState = () => { renders++; };
  const old = manager.render();
  manager.getHeroes = async () => payload;
  manager.searchQuery = 'Miya'; manager.selectedRank = 'epic'; manager.getMeta = async () => ({ data: { rank: 'epic' } });
  await manager.render(); assert.equal(renders, 1);
  finish(payload); await old;
  assert.equal(renders, 1); assert.equal(manager.state.meta.data.rank, 'epic'); assert.equal(manager.searchQuery, 'Miya');
});
