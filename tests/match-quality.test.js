import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePayload } from '../api/sync.js';
import { eligibleMatches, weeklyReport } from '../js/progress-model.js';
import { formatTeamOverallStats, formatDailyScrimSummary } from '../lib/telegram-bot.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.window = {};
await import('../js/date-utils.js');
await import('../js/data.js');
await import('../js/stats.js');
const { DataStore, StatsEngine: S } = window;
const players = Array.from({ length: 6 }, (_, index) => ({ id: `p${index}`, name: `Player ${index}` }));
const row = id => ({ playerId: id, heroUsed: 'Miya', kills: 3, deaths: 1, assists: 6 });
const match = (extra = {}) => ({ id: 'quality-match', date: '2026-11-16', matchType: 'ranked', result: 'win',
  scope: 'individual', schemaVersion: 4, createdAt: '2026-11-16T10:00:00.000Z',
  playerStats: [row('p0')], ...extra });
function storeWithRoster() {
  localStorage.clear();
  const store = new DataStore();
  store.savePlayers(players);
  return store;
}
function assertHeld(value, issue) {
  assert.equal(value.needsReview, true);
  assert.equal(value.validForAnalytics, false);
  assert.equal(value.verificationStatus, 'needs_review');
  assert.equal(value.ocrVerified, false);
  assert.notEqual(value.dataQuality, 'ocr_verified');
  if (issue) assert.ok(value.dataIssues.includes(issue), JSON.stringify(value.dataIssues));
  assert.deepEqual(S.filterMatchesByScope([value], 'all'), []);
  assert.deepEqual(eligibleMatches({ players, matches: [value] }, 'squad'), []);
}

const cases = [
  ['duplicate_participant', { playerStats: [row('p0'), row('p0')] }],
  ['too_many_participants', { scope: 'team5', playerStats: players.map(p => row(p.id)) }],
  ['invalid_duration', { durationFormatted: '12:99' }],
  ['duration_conflict', { durationSeconds: 600, durationFormatted: '11:00' }],
  ['unknown_roster_player', { playerStats: [row('absent')] }],
  ['source_disagreement', { dataIssues: ['source_disagreement', 'source_disagreement'] }],
  ['invalid_data_issues', { dataIssues: { source_disagreement: true } }],
  ['invalid_data_issues', { dataIssues: ['', null, 3] }],
  [null, { needsReview: true }],
  [null, { validForAnalytics: false }],
  [null, { verificationStatus: 'needs_review' }]
];
for (const [index, [issue, extra]] of cases.entries()) {
  test(`quality evidence survives add, import, migration and server round trips (${index}: ${issue || Object.keys(extra)[0]})`, () => {
    const store = storeWithRoster();
    const added = store.addMatch(match({ dataSource: 'ocr', ocrVerified: true, dataQuality: 'ocr_verified', ...extra }));
    const id = added.id;
    assertHeld(added, issue);
    assertHeld(store.getMatches()[0], issue); // addMatch normalizes twice internally.
    for (let cycle = 0; cycle < 3; cycle++) {
      const server = normalisePayload(JSON.parse(store.exportData()));
      assert.equal(server.matches.length, 1);
      assertHeld(server.matches[0], issue);
      assert.equal(store.importData(JSON.stringify(server)), true);
      const reloaded = new DataStore().getMatches();
      assert.equal(reloaded.length, 1);
      assert.equal(reloaded[0].id, id);
      assertHeld(reloaded[0], issue);
      assert.equal(new Set(reloaded[0].dataIssues).size, reloaded[0].dataIssues.length);
    }
  });
}

test('server normalization alone never launders canonicalized errors or a draft', () => {
  for (const [issue, extra] of cases) {
    let payload = { players, matches: [match(extra)] };
    for (let cycle = 0; cycle < 3; cycle++) {
      payload = normalisePayload(JSON.parse(JSON.stringify(payload)));
      assertHeld(payload.matches[0], issue);
    }
  }
  const store = storeWithRoster();
  store.saveMatches([match({ status: 'draft' })]);
  for (let cycle = 0; cycle < 3; cycle++) {
    const payload = normalisePayload(JSON.parse(store.exportData()));
    assert.equal(payload.matches[0].status, 'draft');
    assert.equal(store.importData(JSON.stringify(payload)), true);
    assert.equal(new DataStore().getMatches()[0].status, 'draft');
    assert.deepEqual(S.filterMatchesByScope(store.getMatches(), 'all'), []);
  }
});

test('ordinary edits and hero resolution retain old review evidence', () => {
  const store = storeWithRoster();
  store.saveMatches([match({ dataIssues: ['duration_conflict'] })]);
  store.updateMatch('quality-match', { durationSeconds: 600, durationFormatted: '10:00', notes: 'edited',
    dataIssues: [], needsReview: false, validForAnalytics: true, verificationStatus: 'verified' });
  store.resolveHeroReferences([{ id: 1, name: 'Miya' }]);
  const saved = store.getMatches()[0];
  assert.equal(saved.notes, 'edited');
  assert.equal(saved.playerStats[0].heroId, 1);
  assertHeld(saved, 'duration_conflict');
});

test('analytics and weekly reports exclude every independent review flag before normalization', () => {
  for (const scope of ['individual', 'team5']) {
    const mode = scope === 'team5' ? 'team5' : 'squad';
    const good = match({ scope, playerStats: players.slice(0, scope === 'team5' ? 5 : 1).map(p => row(p.id)) });
    const bad = [{ needsReview: true }, { validForAnalytics: false }, { verificationStatus: 'needs_review' },
      { dataIssues: ['source_disagreement'] }, { dataIssues: 'broken' }, { status: 'draft' }]
      .map((flags, index) => ({ ...good, id: `bad-${index}`, result: 'loss', ...flags }));
    const all = [good, ...bad];
    const engine = new S({});
    assert.deepEqual(S.filterAnalyticsMatches(all, mode).map(m => m.id), [good.id]);
    assert.deepEqual(S.filterMatchesByScope(all, 'all').map(m => m.id), [good.id]);
    assert.deepEqual(eligibleMatches({ players, matches: all }, mode).map(m => m.id), [good.id]);
    assert.equal(engine.getPlayerStats(all, 'p0').matchesPlayed, 1);
    assert.equal(weeklyReport({ players, matches: all }, good.date, mode).count, 1);
    assert.equal(formatTeamOverallStats(all), formatTeamOverallStats([good]));
    assert.equal(formatDailyScrimSummary(all, good.date), formatDailyScrimSummary([good], good.date));
    for (const invalid of bad) assert.deepEqual(engine.getMatchInsights(invalid, all, players), []);
    assert.equal(all.length, 7, 'excluded records remain in the history');
  }
});

test('valid partial Practice Lite remains eligible without fabricating optional metrics', () => {
  const store = storeWithRoster();
  const payload = normalisePayload({ players, matches: [match({ entryMode: 'practice_lite', dataSource: 'submission', verificationStatus: 'verified' })] });
  assert.equal(store.importData(JSON.stringify(payload)), true);
  const saved = store.getMatches()[0];
  assert.equal(saved.needsReview, false);
  assert.equal(saved.dataCompleteness, 'partial');
  assert.equal(saved.verificationStatus, 'verified');
  assert.equal(saved.durationSeconds, null);
  assert.equal(saved.playerStats[0].damageDealt, null);
  assert.equal(S.filterAnalyticsMatches([saved], 'squad').length, 1);
});

test('a local manual edit cannot reuse the previous OCR verification', () => {
  const store = storeWithRoster();
  store.saveMatches([match({ dataSource: 'ocr', dataQuality: 'ocr_verified', verificationStatus: 'verified' })]);
  assert.equal(store.getMatches()[0].ocrVerified, true);
  store.updateMatch('quality-match', { playerStats: [row('p0')], notes: 'Manual correction' });
  const saved = store.getMatches()[0];
  assert.equal(saved.verificationStatus, 'unverified');
  assert.equal(saved.ocrVerified, false);
  assert.equal(saved.needsReview, false);
  assert.equal(saved.validForAnalytics, true);
  assert.equal(saved.dataCompleteness, 'partial');
  store.updateMatch(saved.id, { verificationStatus: 'needs_review' });
  assertHeld(store.getMatches()[0]);
});
