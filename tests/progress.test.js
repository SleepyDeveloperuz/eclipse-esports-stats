import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleMatches, observations, compareResults, heroJourney, weeklyReport, weekRange, moments, numeric } from '../js/progress-model.js';
import { groupBatchFiles, cleanBattleId } from '../js/batch-model.js';
import { normalizeBatchIndex, batchIndexRequest } from '../lib/batch-index.js';
import { normalisePracticeDraft, officialMatchFromDraft, probableMatchIds, sameBattleRoster } from '../api/submissions.js';
import { normalisePayload } from '../api/sync.js';
import { requestOcrProvider } from '../lib/ocr-provider.js';
const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
const row = (extra = {}) => ({ playerId: 'p0', heroUsed: 'Miya', heroId: 1, rolePlayed: 'Gold Laner', kills: 5, deaths: 2, assists: 3, damageDealt: 60000, goldEarned: 12000, inGameScore: 8, teamfightParticipation: 50, ...extra });
const match = (i, extra = {}) => ({ id: `m${i}`, date: `2026-09-${String(14 + i).padStart(2, '0')}`, scope: 'individual', result: 'win', matchType: 'ranked', durationSeconds: 600, playerStats: [row()], ...extra });
test('Progress rejects unknown roster, guest team5, review and inconsistent scope records', () => {
  const good = match(0), team = match(1, { scope: 'team5', playerStats: players.map(p => row({ playerId: p.id })) });
  const data = { players, matches: [good, team, match(2, { needsReview: true }), match(3, { scope: 'team5' }), match(4, { playerStats: [row({ playerId: 'ghost' })] }), { ...team, id: 'guest-team', guestStats: [{}] }] };
  assert.deepEqual(eligibleMatches(data, 'team5').map(m => m.id), ['m1']);
  assert.deepEqual(eligibleMatches(data, 'squad').map(m => m.id), ['m0']);
});
test('Win/Loss controls context; unknown metrics and durations never count as zeros', () => {
  const matches = [match(0), match(1, { result: 'loss', durationSeconds: null, playerStats: [row({ damageDealt: null })] }), match(2, { matchType: 'casual' })];
  const selected = observations(matches, { playerId: 'p0', hero: 'Miya', role: 'Gold Laner', matchType: 'ranked' });
  const result = compareResults(selected);
  assert.equal(selected.length, 2); assert.equal(result.win.metrics.damagePerMinute.mean, 6000);
  assert.equal(result.loss.metrics.damagePerMinute.n, 0); assert.equal(result.differences.damagePerMinute, null); assert.equal(result.early, true);
  for (const value of [null, '', ' ', undefined, false, true, NaN, -1, []]) assert.equal(numeric(value), null);
  assert.equal(numeric(0), 0);
});
test('Hero Journey windows never overlap, including 1, 2, 5 and 12 matches', () => {
  for (const count of [1, 2, 5, 12]) {
    const rows = Array.from({ length: count }, (_, i) => ({ match: match(i), row: row({ inGameScore: i + 1 }) }));
    const result = heroJourney(rows), size = Math.min(5, Math.floor(count / 2));
    assert.equal(result.first.count, size); assert.equal(result.recent.count, size);
    if (size) assert.ok(result.first.metrics.inGameScore.mean < result.recent.metrics.inGameScore.mean);
  }
});
test('Weekly uses Monday-Sunday boundaries, separates scopes and matches browser inputs', () => {
  assert.deepEqual(weekRange('2026-09-20'), { start: '2026-09-14', end: '2026-09-20' });
  assert.throws(() => weekRange('2026-02-30'));
  const data = { players, matches: [match(0), match(1, { result: 'loss' }), match(7)] };
  const report = weeklyReport(data, '2026-09-16', 'squad');
  assert.equal(report.count, 2); assert.equal(report.winRate, 50); assert.equal(report.players[0].metrics.damagePerMinute.n, 2);
  assert.equal(weeklyReport(data, '2026-09-16', 'team5').count, 0);
});
test('Moments describe tied known records, not invented comeback or unknown stats', () => {
  assert.deepEqual(moments([{ match: match(0), row: row({ inGameScore: null, damageDealt: null, goldEarned: null }) }]), []);
  const result = moments([0, 1].map(i => ({ match: match(i), row: row() })));
  assert.equal(result.length, 1); assert.ok(result[0].reasons.every(r => r.includes('teng rekord')));
});
test('Batch joins shuffled screenshots only by exact string Battle IDs and refuses ambiguous pairs', () => {
  const id = '950914999598100774';
  const data = [{ index: 0, kind: 'damage', battleId: id }, { index: 1, kind: 'scoreboard', battleId: '949331204637895523' }, { index: 2, kind: 'scoreboard', battleId: id }];
  const grouped = groupBatchFiles(data); assert.equal(grouped.matches.length, 2); assert.equal(grouped.matches[0].score.index, 2);
  assert.equal(groupBatchFiles([...data, { ...data[2], index: 3 }]).unresolved.length, 3);
  assert.equal(groupBatchFiles([{ ...data[0], date: '2026-09-14' }, { ...data[2], date: '2026-09-15' }]).matches.length, 0);
  assert.equal(cleanBattleId(Number(id)), null); assert.equal(cleanBattleId(id), id);
  assert.equal(groupBatchFiles([{ ...data[1], battleId: null }]).matches.length, 0);
});
test('Batch index requires one distinct in-range entry per input; dates must really exist', () => {
  assert.throws(() => normalizeBatchIndex({ files: [{ index: 0 }, { index: 0 }] }, 2));
  assert.throws(() => normalizeBatchIndex({ files: [{ index: 5 }] }, 1));
  const result = normalizeBatchIndex({ files: [{ index: 0, battleId: 123, date: '2026-02-30', duration: '17:80' }] }, 1);
  assert.equal(result.files[0].battleId, null); assert.equal(result.files[0].date, null); assert.equal(result.files[0].duration, null);
  assert.equal(batchIndexRequest([{}]).generationConfig.responseJsonSchema.properties.files.maxItems, 1);
});
test('OCR provider accepts the bounded batch schema while default scans still require players', async () => {
  const files = { files: [{ index: 0, kind: 'scoreboard', battleId: '950914999598100774' }] };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(files) }] } }] }) });
  const batch = await requestOcrProvider({ apiKey: 'fixture', requestBody: batchIndexRequest([{}]), batchCount: 1, fetchImpl, models: ['gemini-fixture'], validate: parsed => normalizeBatchIndex(parsed, 1).files.length === 1 });
  assert.equal(batch.success, true); assert.equal(batch.data.files[0].battleId, '950914999598100774');
  const regular = await requestOcrProvider({ apiKey: 'fixture', requestBody: {}, fetchImpl, models: ['gemini-fixture'] }); assert.equal(regular.success, false);
});
test('Battle ID survives submission, approval and sync without unsafe number conversion', () => {
  const data = { players, heroes: [{ id: 1, name: 'Miya' }], matches: [] };
  const raw = { ...match(0), sourceBattleId: '950914999598100774', claimedPlayerId: 'p0', entryMode: 'full' };
  const draft = normalisePracticeDraft(raw, data), official = officialMatchFromDraft(draft, data, { id: 'm1', createdAt: '2026-09-14T00:00:00Z' });
  assert.equal(normalisePayload({ ...data, matches: [official] }).matches[0].sourceBattleId, raw.sourceBattleId);
  assert.deepEqual(probableMatchIds(draft, [{ ...official, playerStats: [row({ playerId: 'p1' })] }]), ['m1']);
  assert.equal(sameBattleRoster(draft, { ...official, playerStats: [row({ kills: 9 })] }), true);
  assert.equal(sameBattleRoster(draft, { ...official, playerStats: [row({ playerId: 'p1' })] }), false);
});
