import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupHandler } from '../api/backup.js';
import { readExistingTeamSnapshot } from '../lib/team-store.js';
import { parsePatchArticle } from '../lib/mlbb/patch-parser.js';
import { normalisePracticeDraft, normaliseSubmission, practiceFingerprint, toOfficialMatch } from '../api/submissions.js';
import { normalisePayload } from '../api/sync.js';

globalThis.window = {};
globalThis.document = { addEventListener() {} };
await import('../js/stats.js');
await import('../js/briefing.js');
await import('../js/mlbb.js');
await import('../js/players.js');
await import('../js/app.js');
const S = window.StatsEngine;
const app = window.EclipseApp;
const engine = new S({});
const players = S.ROLES.map((role, n) => ({ id: `p${n}`, name: `Player ${n}`, primaryRole: role }));
const base = (id, result = 'win') => ({ id, date: '2026-09-01', scope: 'team5', result, matchType: 'ranked',
  playerStats: players.map((player, n) => ({ playerId: player.id, rolePlayed: S.ROLES[n], heroUsed: 'Fanny', heroId: 17,
    kills: 2, deaths: 1, assists: 5, inGameScore: 8 })) });

test('small Team Pulse groups never emit a misleading comparison delta', () => {
  for (let count = 0; count < 10; count++) {
    const result = S.recentTeamResults(Array.from({ length: count }, (_, n) => base(`m${n}`)));
    assert.equal(result.comparable, false);
    assert.equal(result.delta, null);
    assert.equal(result.recent.length + result.previous.length, count);
  }
  const result = S.recentTeamResults(Array.from({ length: 10 }, (_, n) => base(`m${n}`)));
  assert.equal(result.comparable, true);
  assert.equal(result.delta, 0);
});

test('coverage reports actual roles, unique heroes, and assigned roles without a readiness claim', () => {
  const result = engine.getRosterCoverage([base('one'), base('two')], players);
  assert.equal(result.length, 5);
  assert.equal(result[0].observedPlayers, 1);
  assert.equal(result[0].observations[0].matches, 2);
  assert.equal(result[0].observations[0].heroes, 1);
  assert.equal(result[0].observations[0].assigned, true);
  assert.equal(engine.getPlayerRoleBreakdown([base('one')], 'p0').bestRoleAvailable, false);
  const empty = engine.getRosterCoverage([], players);
  assert.equal(empty[0].observedPlayers, 0);
  assert.equal(empty[0].observations[0].matches, 0);
});

test('hero use count is not auto-promoted to mastery', () => {
  const result = engine.getPlayerHeroAnalytics([base('a'), base('b'), base('c')], 'p0');
  assert.equal(result.heroes[0].masteryTier, '—');
  assert.equal(result.heroes[0].masteryLabel, '3 MATCH KUZATILGAN');
});

test('Team5 short entry survives server normalization, storage, approval and analytics scope', () => {
  const official = { players, heroes: [{ id: 17, name: 'Fanny' }] };
  const draft = normalisePracticeDraft({ ...base('short'), claimedPlayerId: 'p0', scope: 'individual' }, official);
  assert.equal(draft.scope, 'team5', 'server derives context, not client scope');
  const fingerprint = practiceFingerprint(draft);
  const record = normaliseSubmission({ schemaVersion: 1, id: `sub_${fingerprint.slice(0,24)}`, fingerprint,
    status: 'pending', source: 'manual', draft, submitter: { identityHash: 'a'.repeat(64), claimedPlayerId: 'p0' },
    createdAt: '2026-09-01T12:00:00Z' });
  assert.equal(record.draft.playerStats.length, 5);
  const approved = toOfficialMatch(record, official);
  const normalized = normalisePayload({ ...official, matches: [approved] }).matches[0];
  assert.equal(normalized.scope, 'team5');
  assert.equal(normalized.entryMode, 'practice_lite');
  assert.equal(normalized.playerStats[0].damageDealt, null);
  assert.equal(S.filterAnalyticsMatches([normalized], 'team5').length, 1);
  assert.equal(S.filterAnalyticsMatches([normalized], 'squad').length, 0);
});

test('match ledger retains records needing repair while analytics excludes them', () => {
  const valid = base('ok');
  const bad = { ...base('bad'), needsReview: true, validForAnalytics: false };
  const unknown = { ...base('unknown'), scope: 'unclassified' };
  app.currentAnalyticsMode = 'team5';
  app.authManager = { isAdmin: () => true };
  assert.equal(app.getHistoryMatches([valid, bad, unknown]).length, 3);
  assert.equal(app.getAnalyticsMatches([valid, bad, unknown]).length, 1);
  app.authManager = { isAdmin: () => false };
  assert.equal(app.getHistoryMatches([valid, bad, unknown]).length, 2);
});

test('coverage markup is callable and escapes player names and identifiers', () => {
  app.statsEngine = engine;
  const markup = app.renderRosterCoverage([], [{ ...players[0], id: '"evil', name: '<script>bad</script>' }]);
  assert.match(markup, /Rollar bo‘yicha qamrov/);
  assert.ok(!markup.includes('<script>'));
  assert.match(markup, /&lt;script&gt;/);
});

test('statistics, roster and profile templates render in both contexts without missing helpers', () => {
  const container = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  document.getElementById = () => container;
  document.querySelectorAll = () => [];
  const solo = { ...base('solo'), scope: 'individual', playerStats: [base('x').playerStats[0]] };
  app.dataStore = { getPlayers: () => players, getPlayerById: id => players.find(player => player.id === id),
    getMatches: () => [base('team'), solo] };
  app.statsEngine = engine;
  app.authManager = { isAdmin: () => false };
  const manager = new window.PlayerManager(app.dataStore, engine);
  for (const mode of ['team5', 'squad']) {
    app.currentAnalyticsMode = mode;
    app.renderStatistics('all');
    assert.match(container.innerHTML, /O‘yinchilar natijalari/);
    assert.ok(!container.innerHTML.includes('Dream Team'));
    manager.renderPlayersList('roster');
    assert.match(container.innerHTML, /Jamoa tarkibi/);
    manager.renderPlayerProfile('profile', 'p0', app.getAnalyticsMatches(app.dataStore.getMatches()));
    assert.match(container.innerHTML, /Eclipse Index · tajriba/);
    assert.match(container.innerHTML, /O‘rtacha o‘yin bahosi/);
    assert.ok(!container.innerHTML.includes('NaN'));
  }
});

test('meta board is ordered by the source rank rather than experimental score', () => {
  const manager = new window.MlbbDataManager({}, {}, {}, {});
  manager.state.meta = { data: { eclipse: [{ heroId: 1, name: 'ExperimentFirst', officialRank: 20, eclipseRank: 1, tier: 'S', eclipseScore: 99 },
    { heroId: 2, name: 'SourceFirst', officialRank: 1, eclipseRank: 8, tier: 'A', eclipseScore: 80 }] } };
  const markup = manager.tierMarkup();
  assert.ok(markup.indexOf('SourceFirst') < markup.indexOf('ExperimentFirst'));
  assert.match(markup, /Moonton bahosi emas/);
});

test('patch parser cannot claim high confidence just from a long article', () => {
  const parsed = parsePatchArticle({ title: 'Patch Notes 99', body: Array(40).fill('<p>Unrecognized format</p>').join('') });
  assert.equal(parsed.confidence, 'review');
  assert.equal(parsed.parseCoverage, 'partial');
});

test('Briefing relevance counts recent valid matches and respects canonical hero IDs', () => {
  const valid = base('recent');
  const legacy = base('legacy');
  legacy.playerStats = [{ heroUsed: 'FANNY' }];
  const wrongId = base('wrong');
  wrongId.playerStats = [{ heroId: 99, heroUsed: 'Fanny' }];
  const manager = new window.BriefingManager({}, null, { getMatches: () => [valid, legacy, wrongId,
    { ...base('old'), date: '2025-01-01' }, { ...base('invalid'), validForAnalytics: false }] });
  const result = manager.relevantPatchAdjustments({ heroAdjustments: [{ heroId: 17, heroName: 'Fanny', change: 'nerf' },
    { heroId: 102, heroName: 'Mathilda', change: 'buff' }] }, new Date('2026-09-07T12:00:00Z'));
  assert.equal(result.length, 1);
  assert.equal(result[0].matches, 2, 'counts matches, not five participants');
});

test('full backup reads one existing snapshot with all files and never writes or seeds', async () => {
  const state = { _storageRevision: 9, files: { 'eclipse_data.json': { content: '{"players":[],"matches":[]}' },
    'eclipse_briefing.json': { content: '{"focus":[]}' }, 'eclipse_vote_abc.json': { content: '{"choice":"a"}' },
    'eclipse_submission_abc.json': { content: '{"status":"pending"}' } } };
  let reads = 0;
  const snapshot = await readExistingTeamSnapshot({ gistId: 'fixture', store: { async getJSON() { reads++; return state; } } });
  assert.equal(reads, 1);
  assert.equal(snapshot.format, 'eclipse-team-backup-v1');
  assert.deepEqual(snapshot.state, state);
  assert.notEqual(snapshot.state, state);
  await assert.rejects(readExistingTeamSnapshot({ gistId: 'fixture', store: { getJSON: async () => null } }), /Bo‘sh zaxira/);
});

function response() {
  return { headers: {}, statusCode: 0, payload: null, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
}

test('backup API denies anonymous/viewer/write requests without reading private data', async () => {
  let reads = 0;
  const handler = createBackupHandler({ configured: () => true, authorize: token => token === 'admin-fixture',
    read: async () => { reads++; return { format: 'eclipse-team-backup-v1' }; } });
  for (const authorization of ['', 'Bearer viewer-fixture', 'Bearer bad']) {
    const res = response();
    await handler({ method: 'GET', headers: { authorization } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
  const write = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer admin-fixture' } }, write);
  assert.equal(write.statusCode, 405);
  assert.equal(reads, 0);
  const ok = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer admin-fixture' } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(reads, 1);
});
