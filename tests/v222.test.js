import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePracticeDraft, practiceFingerprint, matchIdentityFingerprint, normaliseSubmission, toOfficialMatch } from '../api/submissions.js';
import { normalisePayload } from '../api/sync.js';
import { normaliseOcrPayload, normalizePortraitBox } from '../api/ocr.js';
import { buildTierComparison } from '../lib/mlbb/sync.js';
import { tierMethodology } from '../lib/mlbb/tier.js';
import { allowedPortraitUrl } from '../api/mlbb-image.js';

const data = { players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, active: true })), heroes: [{ id: 1, name: 'Miya' }], matches: [] };
const row = { playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Gold Laner', kills: 5, deaths: 2, assists: 8, damageDealt: 45000, damageReceived: 20000, turretDamage: 8000, goldEarned: 13000, teamfightParticipation: 72, inGameScore: 9.1, medal: 'mvp', savage: false, maniac: true };
const input = { entryMode: 'full', date: '2026-09-07', result: 'win', matchType: 'ranked', durationFormatted: '15:30', claimedPlayerId: 'p1', teamTurtles: 2, teamLords: 1, teamTurrets: 7, sessionLabel: 'Evening scrim', playerStats: [row], substitutes: ['p6'] };
function record(draft) { const fingerprint = practiceFingerprint(draft); return { schemaVersion: 2, id: `sub_${fingerprint.slice(0, 24)}`, fingerprint, status: 'pending', source: 'manual', submitter: { identityHash: 'a'.repeat(64) }, draft, createdAt: '2026-09-07T00:00:00Z' }; }

test('full submission round trip keeps damage, objectives, session, medals and reserves', () => {
  const draft = normalisePracticeDraft(input, data); const stored = record(draft);
  assert.ok(normaliseSubmission(stored));
  const match = toOfficialMatch(stored, data);
  const final = normalisePayload({ ...data, matches: [match] }).matches[0];
  for (const field of ['damageDealt', 'damageReceived', 'turretDamage', 'goldEarned', 'teamfightParticipation', 'maniac', 'savage']) assert.equal(final.playerStats[0][field], row[field]);
  assert.equal(final.entryMode, 'full'); assert.equal(final.scope, 'individual');
  assert.equal(final.teamLords, 1); assert.equal(final.sessionLabel, 'Evening scrim'); assert.equal(final.sessionId, 'evening-scrim');
  assert.deepEqual(final.substitutes, ['p6']);
});
test('missing full metrics stay null and malformed full metrics are rejected', () => {
  const draft = normalisePracticeDraft({ ...input, playerStats: [{ ...row, damageDealt: '', goldEarned: null }] }, data);
  assert.equal(draft.playerStats[0].damageDealt, null); assert.equal(draft.playerStats[0].goldEarned, null);
  for (const value of [-1, false, '12junk', 1.5]) assert.throws(() => normalisePracticeDraft({ ...input, playerStats: [{ ...row, damageDealt: value }] }, data));
});
test('full fingerprint protects extended facts while legacy match identity remains compatible', () => {
  const draft = normalisePracticeDraft(input, data); const lite = normalisePracticeDraft({ ...input, entryMode: 'practice_lite' }, data);
  assert.equal(matchIdentityFingerprint(draft), practiceFingerprint(lite));
  assert.notEqual(practiceFingerprint(draft), practiceFingerprint(lite));
  const corrupt = record(draft); corrupt.draft = { ...draft, playerStats: [{ ...draft.playerStats[0], damageDealt: 123 }] };
  assert.equal(normaliseSubmission(corrupt), null);
});
test('captain correction preserves original submission and deterministic approved match ID', () => {
  const draft = normalisePracticeDraft(input, data); const original = record(draft);
  const corrected = { ...original, review: { correctedDraft: normalisePracticeDraft({ ...input, playerStats: [{ ...row, kills: 6 }] }, data) } };
  const match = toOfficialMatch(corrected, data);
  assert.equal(match.playerStats[0].kills, 6); assert.equal(original.draft.playerStats[0].kills, 5);
  assert.equal(match.id, toOfficialMatch(original, data).id);
});
test('guest full metrics survive approval without inflating Team5 count', () => {
  const draft = normalisePracticeDraft({ ...input, guestStats: [{ ...row, name: 'Guest', guestId: 'guest_1' }] }, data);
  const final = normalisePayload({ ...data, matches: [toOfficialMatch(record(draft), data)] }).matches[0];
  assert.equal(final.scope, 'individual'); assert.equal(final.guestStats[0].damageDealt, 45000);
  assert.throws(() => normalisePracticeDraft({ ...input, guestStats: Array(5).fill({ ...row, name: 'Guest' }) }, data), /5/);
  assert.throws(() => normalisePracticeDraft({ ...input, substitutes: ['p1'] }, data), /Zaxira/);
});
test('only five tracked roster players produce Team5 in the new full form', () => {
  for (let count = 1; count <= 5; count++) {
    const draft = normalisePracticeDraft({ ...input, playerStats: Array.from({ length: count }, (_, i) => ({ ...row, playerId: `p${i + 1}` })) }, data);
    assert.equal(draft.scope, count === 5 ? 'team5' : count === 1 ? 'individual' : 'squad');
  }
});
test('known hero names never override uncertain visual recognition', () => {
  const result = normaliseOcrPayload({ players: [{ matchedPlayerId: 'p1', heroUsed: 'Miya', heroRecognized: false, heroCandidates: ['Miya', 'Imaginary'], portraitBox: { imageIndex: 0, bounds: [100, 200, 200, 300] } }] }, data.players, data.heroes).players[0];
  assert.equal(result.heroRecognized, false); assert.equal(result.heroCatalogMatch, true); assert.equal(result.heroId, 1);
  assert.deepEqual(result.heroCandidates, ['Miya']); assert.equal(result.heroReviewRequired, true); assert.ok(result.portraitBox);
});
test('unsafe, inverted and missing portrait crop bounds are discarded', () => {
  for (const value of [null, { imageIndex: 0, bounds: [-1, 0, 2, 3] }, { imageIndex: 0, bounds: [3, 2, 1, 0] }, { imageIndex: 9, bounds: [0, 0, 20, 20] }]) assert.equal(normalizePortraitBox(value), null);
});
test('tier comparison requires a real older snapshot in the same cohort and methodology', () => {
  const tiers = [{ heroId: 1, eclipseRank: 2, tier: 'A' }, { heroId: 2, eclipseRank: 1, tier: 'S' }];
  const previous = { updatedAt: '2026-09-06T00:00:00Z', data: { rank: 'mythic', days: 1, methodology: tierMethodology(), eclipse: [{ heroId: 1, eclipseRank: 5, tier: 'B' }] } };
  const options = { rank: 'mythic', days: 1, now: '2026-09-07T00:00:00Z' };
  const comparison = buildTierComparison(previous, tiers, options);
  assert.equal(comparison.changes[0].rankDelta, 3); assert.equal(comparison.changes[0].previousTier, 'B'); assert.equal(comparison.changes[1].isNew, true);
  assert.equal(buildTierComparison(null, tiers, options), null);
  assert.equal(buildTierComparison(previous, tiers, { ...options, days: 7 }), null);
  assert.equal(buildTierComparison(previous, tiers, { ...options, now: previous.updatedAt }), null);
  assert.equal(buildTierComparison({ ...previous, data: { ...previous.data, methodology: { version: 'different' } } }, tiers, options), null);
});
test('PNG portrait proxy accepts only canonical CDN HTTPS images, no arbitrary destinations', () => {
  assert.ok(allowedPortraitUrl('https://akmweb.youngjoygame.com/image.png'));
  for (const url of ['http://akmweb.youngjoygame.com/x', 'https://127.0.0.1/x', 'https://akmweb.youngjoygame.com.evil.test/x', 'https://user@akmweb.youngjoygame.com/x', 'https://akmweb.youngjoygame.com:8443/x']) assert.equal(allowedPortraitUrl(url), null);
});
