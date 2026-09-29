import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as model from '../js/coach-model.js';
import { JSDOM } from 'jsdom';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
function fixture(count = 10) {
  const players = [{ id: 'p1', name: 'Player <script>bad</script>' }, { id: 'p2', name: 'Second' }];
  const matches = Array.from({ length: count }, (_, i) => ({ id: `m${String(i).padStart(2, '0')}`, date: today, scope: 'individual', result: i % 2 ? 'win' : 'loss', matchType: 'ranked', durationSeconds: 600,
    playerStats: [{ playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Gold Laner', roleSource: 'manual', deaths: i < 5 ? 2 : 6, damageDealt: 50000, goldEarned: 10000, turretDamage: 5000, teamfightParticipation: 60 }] }));
  return { players, matches };
}
const report = data => model.coachReport(model.coachContexts(data, 'p1', 'squad', 'ranked', today).groups[0], today);
test('Coach requires ten same-context matches and compares disjoint completed blocks', () => {
  assert.equal(report(fixture(9)).status, 'collecting');
  const r = report(fixture(12));
  assert.equal(r.primary.key, 'deathsPerMinute'); assert.equal(r.primary.before.mean, .2);
  assert.ok(Math.abs(r.primary.after.mean - .6) < 1e-9);
  assert.equal(r.pending, 2); assert.equal(r.remaining, 3);
  assert.equal(new Set(r.evidence.map(e => e.id)).size, 10);
  assert.equal(r.evidence.at(-1).id, 'm09');
  assert.equal(report(fixture(15)).evidence[0].id, 'm05');
});
test('Coach separates actual hero, lane, party size, mode and type, excludes invalid data', () => {
  const d = fixture(); const before = JSON.stringify(d);
  assert.equal(model.coachContexts(d, 'p1', 'team5', 'ranked', today).groups.length, 0);
  assert.equal(model.coachContexts(d, 'p1', 'squad', 'casual', today).groups.length, 0);
  assert.equal(JSON.stringify(d), before);
  d.matches[0].playerStats[0].rolePlayed = 'Roamer';
  d.matches[1].playerStats[0].heroUsed = 'Layla';
  d.matches[2].playerStats.push({ ...d.matches[2].playerStats[0], playerId: 'p2' }); d.matches[2].scope = 'squad';
  d.matches[3].needsReview = true; d.matches[4].playerStats[0].rolePlayed = '';
  const c = model.coachContexts(d, 'p1', 'squad', 'ranked', today);
  assert.equal(c.groups.length, 4); assert.equal(c.unknownLane, 1);
  assert.ok(c.groups.every(g => model.coachReport(g, today).primary === null));
});
test('Unknown metrics and duration never become zero or advice; true zero stays known', () => {
  const d = fixture(); d.matches[9].playerStats[0].deaths = null;
  let r = report(d); assert.equal(r.primary, null); assert.equal(r.metrics[0].after.n, 4);
  d.matches[9].playerStats[0].deaths = 0; r = report(d); assert.equal(r.metrics[0].after.n, 5);
  d.matches[9].durationSeconds = 0; assert.equal(report(d).primary, null);
});
test('Roam resource drops are descriptive, not carry coaching', () => {
  const d = fixture(); d.matches.forEach((m, i) => Object.assign(m.playerStats[0], { rolePlayed: 'Roamer', deaths: 2, damageDealt: i < 5 ? 50000 : 10000, goldEarned: i < 5 ? 10000 : 3000, turretDamage: i < 5 ? 5000 : 0 }));
  assert.equal(report(d).primary, null); assert.equal(report(d).extras.length, 0);
  assert.ok(report(d).metrics.find(m => m.key === 'damagePerMinute').delta < 0);
});
test('Stale history suppresses recommendations; positive signals and evidence remain bounded', () => {
  const d = fixture(); d.matches.forEach(m => { m.date = '2020-01-01'; });
  assert.equal(report(d).status, 'stale'); assert.equal(report(d).primary, null);
  const fresh = fixture(); fresh.matches.forEach((m, i) => { m.playerStats[0].deaths = i < 5 ? 6 : 2; });
  const r = report(fresh); assert.equal(r.primary, null); assert.equal(r.extras[0].kind, 'positive'); assert.ok(r.extras.length <= 2);
});
test('Duplicate IDs and future dates cannot inflate Coach evidence', () => {
  const d = fixture(9); d.matches.push(structuredClone(d.matches[0]));
  assert.equal(report(d).count, 9);
  d.matches.push({ ...structuredClone(d.matches[0]), id: 'future', date: '2999-01-01' });
  assert.equal(report(d).count, 9);
});
function ui(admin = false) {
  const w = new JSDOM('<div id="coach"></div>', { url: 'https://fixture.invalid', runScripts: 'outside-only' }).window;
  Object.assign(w, model); w.eval(readFileSync(new URL('../js/coach.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function'));
  const data = fixture(), calls = [];
  const app = { currentAnalyticsMode: 'squad', dataStore: { getAllPlayers: () => data.players, getMatches: () => data.matches }, authManager: { isAdmin: () => admin }, showPlayerProfile: id => calls.push(id), matchManager: { renderMatchDetailModal: id => calls.push(id) }, navigate: page => calls.push(page) };
  const el = w.document.querySelector('#coach');
  return { w, data, app, el, calls, render: opts => w.EclipseCoach.render(el, app, opts) };
}
test('All teammates see detailed recommendations and evidence, without admin writes or HTML injection', () => {
  const { w, el, calls, render } = ui();
  try {
    render({ playerId: 'p1' }); assert.ok(el.querySelector('.coach-signal'));
    assert.equal(el.querySelectorAll('script').length, 0); assert.match(el.textContent, /Player <script>bad/);
    assert.equal(el.querySelector('[data-coach-weekly]'), null);
    el.querySelector('[data-coach-match]').click(); assert.deepEqual(calls, ['m00']);
    assert.equal(el.querySelectorAll('[data-coach-match]').length, 10);
  } finally { w.close(); }
});
test('Dashboard keeps chosen teammate even when localStorage unavailable; profile opens that teammate', () => {
  const { w, el, calls, render } = ui();
  try {
    Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked'); } });
    render({ compact: true }); const select = el.querySelector('[data-coach-player]'); select.value = 'p2'; select.dispatchEvent(new w.Event('change'));
    const type = el.querySelector('[data-coach-type]'); type.value = 'casual'; type.dispatchEvent(new w.Event('change'));
    assert.equal(el.querySelector('[data-coach-player]').value, 'p2');
    el.querySelector('[data-coach-profile]').click(); assert.deepEqual(calls, ['p2']);
  } finally { w.close(); }
});
test('Weekly action creates only a captain draft and never substitutes an unrelated metric', () => {
  const { w, el, data, app, calls, render } = ui(true);
  try {
    app.progressHub = { focusDrafts: new Map() };
    render({ playerId: 'p1' }); el.querySelector('[data-coach-weekly]').click();
    assert.equal([...app.progressHub.focusDrafts.values()][0].metric, 'deathsPerMinute'); assert.deepEqual(calls, ['progress']);
    render({ playerId: 'p1' }); el.querySelector('[data-coach-weekly]').click(); assert.equal(calls.length, 1); assert.match(el.querySelector('.coach-feedback').textContent, /qoralama bor/);
    data.matches.forEach((m, i) => { m.playerStats[0].deaths = 2; m.playerStats[0].teamfightParticipation = i < 5 ? 80 : 40; });
    render({ playerId: 'p1' }); assert.ok(el.querySelector('.coach-signal')); assert.equal(el.querySelector('[data-coach-weekly]'), null);
  } finally { w.close(); }
});
test('Coach entry points are private-team only and responsive stylesheet is linked', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.match(read('index.html'), /js\/coach.js\?v=2.36.0/); assert.match(read('index.html'), /css\/coach.css/);
  assert.doesNotMatch(read('meta-lab.html'), /js\/coach.js/);
  assert.match(read('js/app.js'), /data-dashboard-coach/); assert.match(read('js/players.js'), /data-player-coach/);
  assert.match(read('css/coach.css'), /max-width: 600px/);
});
test('Dashboard scope updates app context; missing measurements display an explicit insufficient-data state', () => {
  const { w, el, data, app, render } = ui();
  try {
    data.matches.forEach(m => { m.durationSeconds = null; m.playerStats[0].teamfightParticipation = null; });
    render({ compact: true }); assert.match(el.textContent, /metrikalar to‘liq emas/);
    const scope = el.querySelector('[data-coach-scope]'); scope.value = 'team5'; scope.dispatchEvent(new w.Event('change'));
    assert.equal(app.currentAnalyticsMode, 'team5'); assert.equal(w.localStorage.getItem('eclipse_analytics_mode'), 'team5');
    assert.match(el.textContent, /Mos hero va layn ma’lumoti yo‘q/);
  } finally { w.close(); }
});
