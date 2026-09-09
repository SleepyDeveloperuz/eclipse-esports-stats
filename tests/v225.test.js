import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePayload } from '../api/sync.js';
import { normalisePracticeDraft, officialMatchFromDraft } from '../api/submissions.js';
import { applyAdminAction, createEmptyBriefing, normaliseBriefing } from '../api/briefing.js';
import { mergeHeroCatalog, normalizeRankPayload } from '../lib/mlbb/normalize.js';
import { buildEclipseTier } from '../lib/mlbb/tier.js';
import { getHeroIntelligence } from '../lib/mlbb/sync.js';
import { createMemoryStore, MLBB_KEYS } from '../lib/mlbb/store.js';
globalThis.window = {};
await import('../js/stats.js');
const S = window.StatsEngine;
const roster = [{ id: 'p1', name: 'Player' }];
const draft = { entryMode: 'full', claimedPlayerId: 'p1', date: '2026-09-08', matchType: 'ranked', result: 'win', playerStats: [{ playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Gold Laner', kills: 1, deaths: 2, assists: 3, savage: null, maniac: false }] };
const data = { players: roster, heroes: [{ id: 1, name: 'Miya' }] };

test('unknown achievements survive the full submission to persisted match round trip', () => {
  const valid = normalisePracticeDraft(draft, data);
  const match = officialMatchFromDraft(valid, data, { id: 'm1', createdAt: '2026-09-08', updatedAt: '2026-09-08' });
  const persisted = normalisePayload({ ...data, matches: [match] }).matches[0];
  assert.equal(persisted.playerStats[0].savage, null);
  assert.equal(persisted.playerStats[0].maniac, false);
  assert.equal(persisted.playerStats[0].inGameScore, null);
});

test('unknown roster IDs are retained for repair but excluded from analytics', () => {
  const normalized = normalisePayload({ players: [], matches: [{ id: 'm1', ...draft, scope: 'individual' }] });
  assert.equal(normalized.matches.length, 1);
  assert.equal(normalized.matches[0].validForAnalytics, false);
  assert.ok(normalized.matches[0].dataIssues.includes('unknown_roster_player'));
});

test('capacity is an explicit rejection, never silent match truncation', () => {
  assert.throws(() => normalisePayload({ matches: Array.from({ length: 2501 }, (_, i) => ({ id: String(i) })) }), /2500/);
  assert.throws(() => normalisePayload({ players: Array.from({ length: 51 }, (_, i) => ({ id: String(i), name: 'Player' })) }), /50/);
});

test('hero pool preserves captain intent and rejects unknown statuses and duplicate IDs', () => {
  const player = normalisePayload({ players: [{ id: 'p1', name: 'P', captain: true, heroPool: [{ heroId: 134, heroName: 'Hero', status: 'learning' }, { heroId: 134, heroName: 'Hero', status: 'comfort' }, { heroId: 1, status: 'fake' }] }] }).players[0];
  assert.equal(player.captain, true);
  assert.deepEqual(player.heroPool, [{ heroId: 134, heroName: 'Hero', status: 'comfort' }]);
});

test('admin authorship is permitted only through trusted options', () => {
  const input = { ...draft, claimedPlayerId: 'admin' };
  assert.throws(() => normalisePracticeDraft(input, data));
  assert.equal(normalisePracticeDraft(input, data, { adminAuthor: true }).claimedPlayerName, 'Captain');
  assert.throws(() => normalisePracticeDraft({ ...draft, teamTurrets: 10 }, data));
});

test('Briefing preserves all historical and active records beyond the old caps', () => {
  let state = createEmptyBriefing();
  for (let i = 0; i < 25; i++) state = applyAdminAction(state, { action: 'addPoll', question: `Question ${i}`, options: ['A', 'B'] });
  for (let i = 0; i < 55; i++) state = applyAdminAction(state, { action: 'addReview', review: { title: `Review ${i}` } });
  state = normaliseBriefing(state);
  assert.equal(state.polls.length, 25);
  assert.ok(state.polls.some(poll => poll.question === 'Question 0' && poll.active));
  assert.equal(state.reviews.length, 55);
});

test('fresh catalog portraits replace old images while omitted metadata survives', () => {
  const merged = mergeHeroCatalog([{ id: 1, name: 'Miya', images: { portrait: 'old', cover: 'cover' }, roles: ['old'] }], [{ id: 1, name: 'Miya', images: { portrait: 'new' }, roles: ['new'] }]);
  assert.equal(merged[0].images.portrait, 'new');
  assert.equal(merged[0].images.cover, 'cover');
  assert.deepEqual(merged[0].roles, ['new']);
});

test('missing rates and partial ranked pages never become valid fresh data', () => {
  const record = { data: { main_heroid: 1, main_hero: { data: { name: 'Miya' } }, main_hero_win_rate: null, main_hero_appearance_rate: .1, main_hero_ban_rate: .2 } };
  const payload = { code: 0, data: { records: [record], total: 1 } };
  assert.throws(() => normalizeRankPayload(payload, { minRecords: 1 }), /mavjud emas/);
  record.data.main_hero_win_rate = .5; payload.data.total = 2;
  assert.throws(() => normalizeRankPayload(payload, { minRecords: 1 }), /to‘liq/);
});

test('equal tier scores never split solely because of hero names', () => {
  const tiers = buildEclipseTier(Array.from({ length: 20 }, (_, i) => ({ heroId: i + 1, name: `Hero ${i}`, winRate: .5, pickRate: .1, banRate: .1 })));
  assert.equal(new Set(tiers.map(row => row.tier)).size, 1);
});

test('dossier matchup cache is isolated by rank while skills are shared', async () => {
  const now = new Date().toISOString();
  const store = createMemoryStore({
    [MLBB_KEYS.hero(1)]: { updatedAt: now, patchEpoch: null, data: { id: 1, name: 'Miya', skills: [{ name: 'Skill' }] } },
    [MLBB_KEYS.matchups(1, 'epic', '7')]: { updatedAt: now, patchEpoch: null, data: { counters: { favorable: [{ heroId: 2 }] } } },
    [MLBB_KEYS.matchups(1, 'glory', '7')]: { updatedAt: now, patchEpoch: null, data: { counters: { favorable: [{ heroId: 3 }] } } }
  });
  const options = { store, now, fetchImpl: () => { throw new Error('Unexpected request'); } };
  const epic = await getHeroIntelligence(1, { ...options, rank: 'epic' });
  const glory = await getHeroIntelligence(1, { ...options, rank: 'glory' });
  assert.equal(epic.data.matchups.counters.favorable[0].heroId, 2);
  assert.equal(glory.data.matchups.counters.favorable[0].heroId, 3);
  assert.equal(glory.data.matchups.rank, 'glory');
  assert.deepEqual(epic.data.skills, glory.data.skills);
});

test('player sample labels include date diversity and partial squads have no whole-team shares', () => {
  const engine = new S({});
  const matches = Array.from({ length: 20 }, (_, i) => ({ ...draft, scope: 'individual', date: `2026-08-${String(i + 1).padStart(2, '0')}` }));
  assert.equal(engine.getPlayerStats(matches, 'p1').confidence.level, 'stable');
  const squad = { ...draft, scope: 'squad', playerStats: [{ ...draft.playerStats[0], damageDealt: 100 }, { ...draft.playerStats[0], playerId: 'p2', damageDealt: 100 }] };
  assert.equal(engine.getPlayerStats([squad], 'p1').avgDamageShare, null);
});

test('Ranked insights never use Casual games as their comparison baseline', () => {
  const team = Array.from({ length: 5 }, (_, i) => ({ ...draft.playerStats[0], playerId: `p${i}`, inGameScore: 5 }));
  const previous = Array.from({ length: 3 }, (_, i) => ({ id: `m${i}`, date: `2026-09-0${i + 1}`, scope: 'team5', matchType: 'casual', result: 'win', playerStats: team, teamTurrets: 9 }));
  const current = { ...previous[0], id: 'now', date: '2026-09-08', matchType: 'ranked', result: 'loss', teamTurrets: 1 };
  const risk = new S({}).getMatchInsights(current, [...previous, current], roster)[1];
  assert.equal(risk.sample.baselineMatches, 0);
  assert.ok(!risk.reasonCodes.includes('TURRET_CONVERSION_DOWN'));
});
