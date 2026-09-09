import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = {};
await import('../js/date-utils.js');
await import('../js/data.js');
const DataStore = globalThis.window.DataStore;
const dates = globalThis.window.EclipseDateUtils;

test('core import rejects a full server backup or malformed container before any mutation', () => {
  const store = new DataStore();
  const before = store.exportData();
  for (const input of [{ format: 'eclipse-team-backup-v1', state: { files: {} } }, {}, [], { players: [], matches: null }]) {
    assert.equal(store.importData(JSON.stringify(input)), false);
  }
  assert.deepEqual(JSON.parse(store.exportData()).matches, JSON.parse(before).matches);
  assert.deepEqual(JSON.parse(store.exportData()).players, JSON.parse(before).players);
});

test('calendar-only week is Monday through Sunday without UTC shift', () => {
  assert.deepEqual(dates.weekRange('2026-08-30'), {
    start: '2026-08-24',
    end: '2026-08-30'
  });
  assert.equal(dates.addDays('2026-08-30', 1), '2026-08-31');
});

test('calendar-only validation rejects impossible dates exactly', () => {
  assert.equal(dates.isValidDateOnly('2026-02-29'), false);
  assert.equal(dates.isValidDateOnly('2028-02-29'), true);
  assert.equal(dates.formatDateOnly('2026-04-31'), '');
  assert.equal(dates.formatDateOnly('2026-04-30'), '2026-04-30');
});

test('display dates use a stable Eclipse label instead of browser locale artifacts', () => {
  assert.equal(
    dates.formatDisplayDate('2026-09-01T13:05:00', { includeTime: true }),
    '01 SEN · 13:05'
  );
  assert.equal(
    dates.formatDisplayDate('2026-08-31', { includeTime: false, includeYear: true }),
    '31 AVG 2026'
  );
  assert.equal(dates.formatDisplayDate('invalid'), '');
});

test('production datastore starts empty unless demo mode is explicit', () => {
  localStorage.clear();
  const store = new DataStore();
  assert.deepEqual(store.getPlayers(), []);
  assert.deepEqual(store.getMatches(), []);
});

test('legacy data migrates to schema v4, stays unclassified, and keeps missing metrics null', () => {
  localStorage.clear();
  localStorage.setItem('eclipse_players', JSON.stringify([{ id: 'p1', name: 'Leader' }]));
  localStorage.setItem('eclipse_matches', JSON.stringify([{
    id: 'm1', date: '2026-08-30', result: 'win',
    playerStats: [{ playerId: 'p1', kills: 4, deaths: 1, assists: 8 }]
  }]));
  const store = new DataStore();
  const migrated = store.getMatches()[0];
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.scope, 'unclassified');
  assert.equal(migrated.suggestedScope, 'individual');
  assert.equal(migrated.needsReview, true);
  assert.equal(migrated.playerStats[0].damageDealt, null);
  assert.equal(migrated.playerStats[0].kills, 4);
});

test('schema v4 resolves legacy hero names to canonical IDs without losing display compatibility', () => {
  localStorage.clear();
  const store = new DataStore();
  store.savePlayers([{ id: 'p1', name: 'Leader' }]);
  store.saveMatches([{
    id: 'm-hero-ref', date: '2026-08-31', matchType: 'ranked', result: 'win', scope: 'individual',
    playerStats: [{ playerId: 'p1', heroUsed: 'fanny', kills: 3, deaths: 1, assists: 5 }]
  }]);

  assert.equal(store.getMatches()[0].playerStats[0].heroResolution, 'legacy_name');
  assert.equal(store.resolveHeroReferences([{ id: 17, name: 'Fanny', aliases: ['Steel Cable Queen'] }]), 1);
  const stat = store.getMatches()[0].playerStats[0];
  assert.equal(stat.heroId, 17);
  assert.equal(stat.heroNameSnapshot, 'Fanny');
  assert.equal(stat.heroUsed, 'Fanny');
  assert.equal(stat.heroResolution, 'canonical');
});

test('missing five-player legacy scope is never silently promoted to team5', () => {
  localStorage.clear();
  const roster = Array.from({ length: 5 }, (_, index) => ({ id: `p${index + 1}`, name: `Player ${index + 1}` }));
  localStorage.setItem('eclipse_players', JSON.stringify(roster));
  localStorage.setItem('eclipse_matches', JSON.stringify([{
    id: 'legacy-five',
    date: '2026-08-30',
    matchType: 'ranked',
    result: 'win',
    playerStats: roster.map(player => ({ playerId: player.id, playerName: player.name }))
  }]));
  const migrated = new DataStore().getMatches()[0];
  assert.equal(migrated.scope, 'unclassified');
  assert.equal(migrated.suggestedScope, 'team5');
  assert.ok(migrated.dataIssues.includes('unclassified_scope'));
});

test('explicit scope that disagrees with tracked roster count is excluded for review', () => {
  localStorage.clear();
  const store = new DataStore();
  store.savePlayers([{ id: 'p1', name: 'Leader' }]);
  const saved = store.addMatch({
    date: '2026-08-30',
    matchType: 'ranked',
    result: 'win',
    scope: 'team5',
    playerStats: [{ playerId: 'p1', playerName: 'Leader', heroUsed: 'Fanny', kills: 4, deaths: 1, assists: 8 }]
  });
  assert.equal(saved.scope, 'team5');
  assert.equal(saved.suggestedScope, 'individual');
  assert.equal(saved.needsReview, true);
  assert.equal(saved.validForAnalytics, false);
  assert.ok(saved.dataIssues.includes('scope_participant_mismatch'));
});

test('invalid result, impossible date, and malformed duration stay unknown for review', () => {
  localStorage.clear();
  const store = new DataStore();
  store.savePlayers([{ id: 'p1', name: 'Leader' }]);
  const match = store.addMatch({
    date: '2026-02-30',
    matchType: 'ranked',
    result: 'maybe',
    scope: 'individual',
    durationFormatted: '15:99',
    playerStats: [{ playerId: 'p1', playerName: 'Leader' }]
  });
  assert.equal(match.date, '');
  assert.equal(match.result, null);
  assert.equal(match.durationSeconds, null);
  assert.equal(match.durationFormatted, null);
  assert.equal(match.needsReview, true);
  assert.equal(match.validForAnalytics, false);
  assert.ok(match.dataIssues.includes('invalid_date'));
  assert.ok(match.dataIssues.includes('unknown_result'));
  assert.ok(match.dataIssues.includes('invalid_duration'));
});

test('duration is canonical and completeness is recomputed from normalized fields', () => {
  localStorage.clear();
  const store = new DataStore();
  store.savePlayers([{ id: 'p1', name: 'Leader' }]);
  const match = store.addMatch({
    date: '2026-08-30', matchType: 'ranked', result: 'win', scope: 'individual',
    durationFormatted: '15:30', dataCompleteness: 'full', dataQuality: 'ocr_verified',
    playerStats: [{ playerId: 'p1', playerName: 'Leader', heroUsed: 'Fanny', kills: 3, deaths: 2, assists: 5 }]
  });
  assert.equal(match.durationSeconds, 930);
  assert.equal(match.durationFormatted, '15:30');
  assert.equal(match.dataCompleteness, 'partial');
  assert.equal(match.dataSource, 'ocr');
  assert.equal(match.verificationStatus, 'verified');
  assert.equal(match.ocrVerified, true);
  assert.equal(match.validForAnalytics, true);
});

test('duplicate participants are removed and substitutes cannot duplicate an active slot', () => {
  localStorage.clear();
  const store = new DataStore();
  store.savePlayers([{ id: 'p1', name: 'Leader' }, { id: 'p2', name: 'Shadow' }]);
  const match = store.addMatch({
    date: '2026-08-30', matchType: 'ranked', result: 'win', scope: 'squad',
    playerStats: [
      { playerId: 'p1', playerName: 'Leader' },
      { playerId: 'p1', playerName: 'Leader duplicate' },
      { playerId: 'p2', playerName: 'Shadow' }
    ],
    substitutes: ['p1', 'p1']
  });
  assert.deepEqual(match.playerStats.map(stat => stat.playerId), ['p1', 'p2']);
  assert.deepEqual(match.substitutes, []);
  assert.ok(match.dataIssues.includes('duplicate_participant'));
});

test('editing a match preserves createdAt and adds a fresh updatedAt', () => {
  localStorage.clear();
  const store = new DataStore();
  store.savePlayers([{ id: 'p1', name: 'Leader' }]);
  const created = store.addMatch({
    date: '2026-08-30', result: 'win', scope: 'individual',
    playerStats: [{ playerId: 'p1', heroUsed: 'Fanny', kills: 3, deaths: 2, assists: 5 }]
  });
  const updated = store.updateMatch(created.id, { result: 'loss' });
  assert.equal(updated.createdAt, created.createdAt);
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(created.updatedAt));
  assert.equal(updated.result, 'loss');
});

test('player removal is a recoverable archive and old match snapshot survives', () => {
  localStorage.clear();
  const store = new DataStore();
  const player = store.addPlayer('Leader', { primaryRole: 'Jungler', captain: true });
  store.addMatch({
    date: '2026-08-30', result: 'win', scope: 'individual',
    playerStats: [{ playerId: player.id, playerName: player.name, heroUsed: 'Fanny', kills: 3, deaths: 2, assists: 5 }]
  });
  store.deletePlayer(player.id);
  assert.equal(store.getActivePlayers().length, 0);
  assert.equal(store.getArchivedPlayers()[0].name, 'Leader');
  assert.equal(store.getMatches()[0].playerStats[0].playerName, 'Leader');
  store.restorePlayer(player.id);
  assert.equal(store.getActivePlayers()[0].name, 'Leader');
});

test('local datastore preserves approved Practice Lite provenance without inventing full metrics', () => {
  localStorage.clear();
  const store = new DataStore();
  store.savePlayers([{ id: 'p1', name: 'Leader' }]);
  store.saveMatches([{
    id: 'practice_abcdef',
    date: '2026-08-31',
    matchType: 'ranked',
    result: 'win',
    scope: 'individual',
    dataSource: 'submission',
    entryMode: 'practice_lite',
    sourceSubmissionId: 'sub_abcdef',
    verificationStatus: 'verified',
    playerStats: [{
      playerId: 'p1', playerName: 'Leader', heroUsed: 'Fanny', rolePlayed: 'Jungler',
      kills: 8, deaths: 2, assists: 7
    }]
  }]);

  const match = store.getMatches()[0];
  assert.equal(match.dataSource, 'submission');
  assert.equal(match.entryMode, 'practice_lite');
  assert.equal(match.sourceSubmissionId, 'sub_abcdef');
  assert.equal(match.verificationStatus, 'verified');
  assert.equal(match.dataCompleteness, 'partial');
  assert.equal(match.playerStats[0].damageDealt, null);
  assert.equal(match.validForAnalytics, true);
});
