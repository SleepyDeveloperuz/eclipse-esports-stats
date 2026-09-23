import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAdminAction, createEmptyBriefing, toPublicBriefing } from '../api/briefing.js';
import { createMemoryStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { getHeroIntelligence, publicCacheState } from '../lib/mlbb/sync.js';

globalThis.window = {};
await import('../js/stats.js');
await import('../js/submissions.js');
await import('../js/briefing.js');
const S = window.StatsEngine;
const engine = new S({});

function ocrManager(roster) {
  const manager = new window.SubmissionManager({}, { getPlayers: () => roster }, {}, {});
  const fields = { '#practicePlayerRows': {}, '#practiceSubmitter': {}, '#practiceDuration': {} };
  fields['#practicePlayerRows'].querySelector = () => null;
  const form = { querySelector: selector => fields[selector], querySelectorAll: () => [] };
  manager.container = { querySelector: () => form };
  manager.rows = [];
  manager.addParticipantRow = value => manager.rows.push(value);
  return manager;
}

test('solo scoreboard with four guests yields one Eclipse participant', () => {
  const manager = ocrManager([{ id: 'p1', name: 'Leader' }]);
  manager.applyOcrData({ players: [{ matchedPlayerId: 'p1', kills: 8 }, ...Array.from({ length: 4 }, (_, n) => ({ detectedName: `Guest${n}` }))] });
  assert.equal(manager.rows.length, 1);
  assert.equal(manager.rows[0].playerId, 'p1');
  assert.equal(manager.ocrExcludedRows, 4);
});

test('five matched Eclipse members can use the short submission form', () => {
  const roster = Array.from({ length: 5 }, (_, n) => ({ id: `p${n}`, name: `ECL${n}` }));
  const manager = ocrManager(roster);
  manager.applyOcrData({ players: roster.map(player => ({ matchedPlayerId: player.id })) });
  assert.equal(manager.rows.length, 5);
  assert.throws(() => ocrManager(roster).applyOcrData({ players: [{ detectedName: 'unknown' }] }), /ishonchli aniqlanmadi/);
});

test('approved Lite is complete for its contract while deep metric coverage remains partial', () => {
  const matches = Array.from({ length: 6 }, () => ({ entryMode: 'practice_lite', verificationStatus: 'verified',
    playerStats: [{ heroUsed: 'Fanny', rolePlayed: 'Jungler', kills: 8, deaths: 2, assists: 7 }] }));
  const quality = S.getDatasetQuality(matches);
  assert.equal(quality.readiness, 'ready');
  assert.equal(quality.contractRate, 100);
  assert.equal(quality.fullRate, 0);
  assert.match(quality.label, /Lite/);
  matches[0].playerStats[0].kills = null;
  assert.ok(S.getDatasetQuality(matches).contractRate < 100);
});

test('a sole player in a role cannot manufacture an Index of 100', () => {
  const matches = [4, 9, 15].map((score, n) => ({ id: `m${n}`, date: `2026-08-${20+n}`, scope: 'individual', matchType: 'ranked', playerStats: [{ playerId: 'solo', rolePlayed: 'Jungler', inGameScore: score }] }));
  assert.equal(engine._eclipseIndex(matches, 'solo').value, null);
});

test('peer Index excludes own scores and requires context-matched peers over multiple days', () => {
  const make = (id, day, score) => ({ id: `${id}-${day}`, date: `2026-08-${day}`, scope: 'individual', matchType: 'ranked', playerStats: [{ playerId: id, rolePlayed: 'Jungler', inGameScore: score }] });
  const targets = [20,21,22].map(day => make('target', day, 12));
  const peers = ['peer1','peer2'].flatMap(id => [20,21,22].map(day => make(id, day, 8)));
  assert.equal(engine._eclipseIndex(targets, 'target', null, [...targets, ...peers]).value, 150);
  assert.equal(engine._eclipseIndex(targets, 'target', null, peers.map(match => ({ ...match, matchType: 'casual' }))).value, null);
  assert.equal(engine.getLeaderboard([targets[0], ...peers], [{ id: 'target', name: 'Target' }], { scope: 'all' })[0].rankEligible, false);
});

test('confidence needs both sample size and date diversity', () => {
  assert.equal(S.getSampleConfidence(6).level, 'provisional');
  assert.equal(S.getSampleConfidence(30, [{ date: '2026-08-01' }]).level, 'provisional');
  assert.equal(S.getSampleConfidence(15, ['01','02','03'].map(day => ({ date: `2026-08-${day}` }))).level, 'stable');
});

test('reopening a finalized poll removes its obsolete final decision', () => {
  let state = applyAdminAction(createEmptyBriefing(), { action: 'addPoll', question: 'When?', options: ['A','B'] });
  const id = state.polls[0].id;
  state = applyAdminAction(state, { action: 'finalizePoll', id, decision: 'A' });
  state = applyAdminAction(state, { action: 'setPollActive', id, active: true });
  assert.equal(state.polls[0].decision, '');
  assert.equal(toPublicBriefing(state).decisionLog.length, 0);
});

test('unparsed patch counts are unknown instead of zero in Briefing', () => {
  const manager = new window.BriefingManager({ isAdmin: () => false });
  manager.patchState = { data: [{ id: 1, title: 'Patch', parsedAt: null }] };
  const html = manager.patchRadarMarkup();
  assert.match(html, /tahlil kutilmoqda/);
  assert.match(html, /<dd>—<\/dd>/);
  assert.doesNotMatch(html, /<dd>0<\/dd>/);
});

test('patch parsing failures cannot be presented as a fresh complete dataset', () => {
  assert.equal(publicCacheState({ updatedAt: new Date().toISOString(), data: [], processing: { pending: 1, failures: 1 } }, 100000).status, 'partial');
});

test('new patch epoch invalidates a hero cache even inside its seven-day lifetime', async () => {
  const now = '2026-09-07T00:00:00Z';
  const store = createMemoryStore({
    [MLBB_KEYS.hero(17)]: { updatedAt: now, patchEpoch: 'old', data: { id: 17, name: 'Fanny' } },
    [MLBB_KEYS.patchEpoch]: 'new',
    [MLBB_KEYS.catalog]: { data: [{ id: 17, name: 'Fanny' }] }
  });
  let calls = 0;
  const stale = await getHeroIntelligence(17, { store, now, fetchImpl: async () => { calls++; return new Response('{}', { status: 400 }); } });
  assert.equal(stale.data.name, 'Fanny');
  assert.ok(stale.refreshError);
  assert.equal(stale.updatedAt, now, 'failed refresh does not invent freshness');
  assert.ok(calls > 0, 'new provider data is requested');
  await store.setJSON(MLBB_KEYS.patchEpoch, 'old');
  const cached = await getHeroIntelligence(17, { store, now, fetchImpl: () => { throw new Error('should not fetch'); } });
  assert.equal(cached.data.name, 'Fanny');
});
