import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { progressOverview } from '../js/progress-model.js';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const heroes = new Map([
  [1, { id: 1, name: 'Miya', image: 'https://akmweb.youngjoygame.com/example.png' }],
  [2, { id: 2, name: 'Layla' }], [3, { id: 3, name: 'Aulus' }], [4, { id: 4, name: 'Chou' }]
]);
const players = Array.from({ length: 7 }, (_, i) => ({ id: 'p' + (i + 1), name: 'Player ' + (i + 1) }));
const resolveHero = row => heroes.get(row.heroId);
const match = (id, heroId = 1, extra = {}) => ({
  id: String(id), date: '2026-11-18', scope: 'individual', matchType: 'ranked', result: 'win',
  playerStats: [{ playerId: 'p1', heroId }], ...extra
});

function browser(markup = '<div id="mount"></div>') {
  const w = new JSDOM(markup, { url: 'https://fixture.invalid', runScripts: 'outside-only' }).window;
  for (const f of ['date-utils', 'stats', 'roster-evidence', 'players']) w.eval(source('js/' + f + '.js'));
  return w;
}

test('hero pool separates eligible plays, unknown heroes and known outcomes with one filter set', () => {
  const w = browser();
  try {
    const duplicate = match('a', 1, { playerStats: [{ playerId: 'p1', heroId: 1 }, { playerId: 'p1', heroId: 2 }] });
    const records = [duplicate, structuredClone(duplicate), match('b', 1, { result: null }), match('c', 2, { result: 'loss' }),
      match('d', 99), match('e', 2, { status: 'draft' }), match('f', 2, { needsReview: true }),
      match('g', 2, { validForAnalytics: false }), match('h', 2, { playerStats: [{ playerId: 'p2', heroId: 2 }], guestStats: [{ playerId: 'p1', heroId: 2 }] }),
      match('i', 2, { date: '2026-11-17' }), match('j', 2, { matchType: 'scrim' }),
      match('k', 2, { scope: 'team5', playerStats: players.slice(0, 5).map(p => ({ playerId: p.id, heroId: 2 })) })];
    const before = structuredClone(records);
    const pool = w.EclipseRosterEvidence.heroPool(records, 'p1', resolveHero, { scope: 'squad', matchType: 'ranked', from: '2026-11-18', to: '2026-11-18' });
    assert.equal(pool.count, 4);
    assert.equal(pool.known, 3);
    assert.equal(pool.unknown, 1);
    const [miya, layla] = pool.heroes;
    assert.equal(miya.count, 2);
    assert.equal(miya.winRate, 100);
    assert.equal(miya.unknown, 1);
    assert.equal(miya.useRate, 200 / 3);
    assert.equal(layla.winRate, 0);
    assert.equal(miya.category, 'limited');
    assert.deepEqual(records, before);
  } finally { w.close(); }
});

test('hero recommendations require known outcomes and compare use and WR within the chosen sample', () => {
  const w = browser();
  try {
    const records = [
      ...Array.from({ length: 8 }, (_, i) => match('m' + i, 1)),
      ...Array.from({ length: 5 }, (_, i) => match('b' + i, 2, { result: i < 4 ? 'win' : 'loss' })),
      ...Array.from({ length: 3 }, (_, i) => match('l' + i, 3, { result: 'loss' })),
      ...Array.from({ length: 8 }, (_, i) => match('u' + i, 4, { result: i < 3 ? 'win' : null }))
    ];
    const list = w.EclipseRosterEvidence.heroPool(records, 'p1', resolveHero).heroes;
    const byId = new Map(list.map(x => [x.hero.id, x]));
    assert.equal(byId.get(1).category, 'comfort');
    assert.equal(byId.get(2).category, 'backup');
    assert.equal(byId.get(3).category, 'learning');
    assert.equal(byId.get(4).category, 'learning');
  } finally { w.close(); }
});

test('captain names and automatic match statistics render independently, with live filter changes', () => {
  const w = browser();
  try {
    const player = { ...players[0], captain: true, heroPool: [{ heroId: 2, heroName: '<b>Layla</b>', status: 'backup' }] };
    const before = structuredClone(player);
    const records = [match('a'), match('b', 2, { matchType: 'scrim', result: 'loss' })];
    w.EclipseApp = { heroDb: { resolve: resolveHero } };
    const view = new w.PlayerManager({ getMatches: () => records }, null);
    const mount = w.document.getElementById('mount');
    view.renderRosterHeroPool(mount, player);
    assert.match(mount.querySelector('.evidence-manual').textContent, /Backup.*<b>Layla<\/b>/s);
    assert.equal(mount.querySelector('.evidence-manual b'), null);
    assert.match(mount.querySelector('[data-pool-preview]').textContent, /Miya/);
    assert.equal(mount.querySelector('img').getAttribute('src'), heroes.get(1).image);
    mount.querySelector('.evidence-pool').open = true;
    const type = mount.querySelector('select[name="matchType"]');
    type.value = 'scrim';
    type.dispatchEvent(new w.Event('change'));
    assert.match(mount.querySelector('[data-pool-list]').textContent, /Layla.*0% WR.*100%/s);
    assert.doesNotMatch(mount.querySelector('[data-pool-list]').textContent, /Miya/);
    assert.deepEqual(player, before);
  } finally { w.close(); }
});

test('a pair beyond the first five roster members has deduplicated, clickable match evidence', () => {
  const w = browser();
  try {
    const records = [match('a', 1, { scope: 'squad', playerStats: [{ playerId: 'p6' }, { playerId: 'p7' }, { playerId: 'p6' }] }),
      match('b', 1, { scope: 'squad', result: 'loss', playerStats: [{ playerId: 'p6' }, { playerId: 'p7' }] }),
      match('c', 1, { scope: 'squad', result: null, playerStats: [{ playerId: 'p6' }, { playerId: 'p7' }] }),
      match('d', 1, { scope: 'squad', needsReview: true, playerStats: [{ playerId: 'p6' }, { playerId: 'p1' }] })];
    records.push(structuredClone(records[0]));
    const calls = [];
    w.EclipseApp = { matchManager: { renderMatchDetailModal: id => calls.push(id) } };
    const view = new w.PlayerManager({ getAllPlayers: () => players }, null);
    view.renderRosterPairs('mount', records);
    const rows = w.document.querySelectorAll('.evidence-pair');
    assert.equal(rows.length, 1);
    assert.match(rows[0].textContent, /Player 6 \+ Player 7.*3 match.*1W.*1L.*50% WR/s);
    rows[0].open = true;
    rows[0].dispatchEvent(new w.Event('toggle'));
    rows[0].querySelector('[data-pair-match="c"]').click();
    assert.deepEqual(calls, ['c']);
  } finally { w.close(); }
});

test('achievement feed uses the highest recorded badge and links directly to the match', () => {
  const w = browser('<div id="matchAchievements"></div>');
  try {
    w.eval(source('js/app.js'));
    const played = [{ playerId: 'p1', heroId: 1, savage: true, maniac: true }];
    const records = [match('a', 1, { playerStats: played, guestStats: [{ playerId: 'p2', savage: true }] }),
      match('b', 1, { playerStats: [{ playerId: 'p1', maniac: true }] }),
      match('c', 1, { needsReview: true, playerStats: played })];
    const calls = [];
    Object.assign(w.EclipseApp, { heroDb: { resolve: resolveHero }, matchManager: { renderMatchDetailModal: id => calls.push(id) } });
    w.EclipseApp.renderAchievements(records, players);
    assert.equal(w.document.querySelectorAll('.evidence-awards li').length, 2);
    assert.match(w.document.getElementById('matchAchievements').textContent, /1 matchda Savage · 1 matchda Maniac/);
    w.document.querySelector('[data-achievement-match="a"]').click();
    assert.deepEqual(calls, ['a']);
  } finally { w.close(); }
});

test('Progress compares equally sized windows, keeps missing measurements and applies filters to both periods', () => {
  const data = { players, matches: [match('a', 1, { date: '2026-11-12' }),
    match('b', 2, { date: '2026-11-11', result: 'loss' }),
    match('c', 3, { matchType: 'scrim' }),
    match('d', 1, { date: '2026-11-04' }),
    match('e', 1, { date: '2026-11-13', needsReview: true })] };
  const report = progressOverview(data, { playerId: 'p1', scope: 'squad', end: '2026-11-18', days: 7, matchType: 'ranked' });
  assert.equal(report.current.from, '2026-11-12');
  assert.equal(report.previous.from, '2026-11-05');
  assert.deepEqual(report.current.matches.map(m => m.id), ['a']);
  assert.deepEqual(report.previous.matches.map(m => m.id), ['b']);
  assert.equal(report.trend.length, 7);
  assert.equal(report.trend.filter(bucket => bucket.count).length, 1);
  assert.deepEqual(report.current.metrics.inGameScore, { n: 0, mean: null });
  assert.equal(progressOverview(data, { scope: 'squad', end: '2026-02-30' }), null);
});

test('real topbar opens the Draft dialog with both app and Draft Assistant bound', () => {
  const w = browser(source('index.html'));
  try {
    w.fetch = async () => ({ json: async () => ({}) });
    w.eval(source('js/draft-helper.js'));
    w.eval(source('js/app.js'));
    w.EclipseApp.bindQolControls();
    const trigger = w.document.getElementById('draftAssistantBtn');
    trigger.focus();
    trigger.click();
    assert.equal(w.document.getElementById('draftAssistantDialog').open, true);
    assert.match(trigger.textContent, /Draft/);
    trigger.click();
    assert.equal(w.document.getElementById('draftAssistantDialog').open, false);
  } finally { w.close(); }
});

test('match evidence opens from its read-only snapshot even when that match is absent locally', () => {
  const w = browser('<div id="modalOverlay" hidden><div id="modalContent"></div></div>');
  try {
    w.eval(source('js/match.js'));
    w.EclipseApp = { authManager: { isAdmin: () => true } };
    const manager = new w.MatchManager({ getMatches: () => [] }, {});
    const remoteMatch = match('remote', 1, { notes: 'Snapshot match' });
    manager.renderMatchDetailModal('remote', players, { snapshot: [remoteMatch] });
    assert.equal(w.document.getElementById('modalOverlay').hidden, false);
    assert.match(w.document.getElementById('modalContent').textContent, /Snapshot match/);
    assert.equal(w.document.getElementById('modalEditBtn'), null);
    w.document.getElementById('modalOkBtn').click();
    assert.equal(w.document.getElementById('modalOverlay').getAttribute('aria-hidden'), 'true');
  } finally { w.close(); }
});
