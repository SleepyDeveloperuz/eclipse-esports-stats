import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePayload } from '../api/sync.js';

test('sync keeps missing metrics as null and does not classify missing legacy scope', () => {
  const payload = normalisePayload({
    players: [{ id: 'p1', name: 'Leader', primaryRole: 'Jungler', captain: true }],
    matches: [{
      id: 'm1',
      date: '2026-08-30',
      matchType: 'ranked',
      result: 'win',
      playerStats: [{ playerId: 'p1', heroUsed: 'Hayabusa', kills: '', deaths: 2 }]
    }]
  });
  assert.equal(payload.schemaVersion, 4);
  assert.equal(payload.players[0].captain, true);
  assert.equal(payload.matches[0].playerStats[0].kills, null);
  assert.equal(payload.matches[0].playerStats[0].deaths, 2);
  assert.equal(payload.matches[0].scope, 'unclassified');
  assert.equal(payload.matches[0].suggestedScope, 'individual');
  assert.equal(payload.matches[0].needsReview, true);
});

test('sync distinguishes roster stats from guest slots', () => {
  const payload = normalisePayload({
    matches: [{
      id: 'm2',
      date: '2026-08-30',
      matchType: 'scrim',
      result: 'loss',
      scope: 'squad',
      playerStats: [
        { playerId: 'p1', playerName: 'Leader' },
        { playerId: 'p2', playerName: 'Shadow' }
      ],
      guestStats: [{ guestId: 'guest_mid', guestName: 'Scrim Mid', kills: 4 }]
    }]
  });
  assert.equal(payload.matches[0].scope, 'squad');
  assert.equal(payload.matches[0].guestStats[0].playerId, null);
  assert.equal(payload.matches[0].guestStats[0].guestName, 'Scrim Mid');
});

test('guest slots never promote a missing scope into team5', () => {
  const payload = normalisePayload({
    matches: [{
      id: 'm-guests', date: '2026-08-30', matchType: 'scrim', result: 'win',
      playerStats: [{ playerId: 'p1', playerName: 'Leader' }],
      guestStats: Array.from({ length: 4 }, (_, index) => ({
        guestId: `guest_${index}`,
        guestName: `Guest ${index}`
      }))
    }]
  });
  assert.equal(payload.matches[0].scope, 'unclassified');
  assert.equal(payload.matches[0].suggestedScope, 'individual');
  assert.equal(payload.matches[0].playerStats.length, 1);
  assert.equal(payload.matches[0].guestStats.length, 4);
});

test('sync rejects an explicit team scope that does not match tracked roster count', () => {
  const payload = normalisePayload({
    matches: [{
      id: 'm-scope-mismatch',
      date: '2026-08-30',
      matchType: 'ranked',
      result: 'win',
      scope: 'team5',
      playerStats: [{ playerId: 'p1', playerName: 'Leader' }]
    }]
  });
  const match = payload.matches[0];
  assert.equal(match.scope, 'team5');
  assert.equal(match.suggestedScope, 'individual');
  assert.equal(match.needsReview, true);
  assert.equal(match.validForAnalytics, false);
  assert.ok(match.dataIssues.includes('scope_participant_mismatch'));
});

test('sync rejects impossible calendar dates and never defaults an unknown result to win', () => {
  const payload = normalisePayload({
    matches: [{
      id: 'm-invalid', date: '2026-02-30', matchType: 'ranked', result: 'victory', scope: 'individual',
      durationFormatted: '15:88',
      playerStats: [{ playerId: 'p1', playerName: 'Leader' }]
    }]
  });
  const match = payload.matches[0];
  assert.equal(match.date, '');
  assert.equal(match.result, null);
  assert.equal(match.durationSeconds, null);
  assert.equal(match.durationFormatted, null);
  assert.ok(match.dataIssues.includes('invalid_date'));
  assert.ok(match.dataIssues.includes('unknown_result'));
  assert.ok(match.dataIssues.includes('invalid_duration'));
});

test('sync canonicalizes strict duration and recomputes completeness instead of trusting claims', () => {
  const payload = normalisePayload({
    players: [{ id: 'p1', name: 'Leader' }],
    matches: [{
      id: 'm-duration', date: '2026-08-30', matchType: 'ranked', result: 'win', scope: 'individual',
      durationFormatted: '15:30', dataCompleteness: 'full', dataQuality: 'ocr_verified',
      playerStats: [{ playerId: 'p1', playerName: 'Leader', heroUsed: 'Fanny', kills: 3, deaths: 1, assists: 8 }]
    }]
  });
  const match = payload.matches[0];
  assert.equal(match.durationSeconds, 930);
  assert.equal(match.durationFormatted, '15:30');
  assert.equal(match.dataCompleteness, 'partial');
  assert.equal(match.dataSource, 'ocr');
  assert.equal(match.verificationStatus, 'verified');
});

test('sync deduplicates players, matches, heroes, and participant slots', () => {
  const payload = normalisePayload({
    players: [{ id: 'p1', name: 'Leader' }, { id: 'p1', name: 'Duplicate' }],
    heroes: [{ name: 'Fanny', role: 'Assassin' }, { name: 'fanny', role: 'Assassin' }],
    matches: [
      {
        id: 'm1', date: '2026-08-30', matchType: 'ranked', result: 'win', scope: 'squad',
        playerStats: [{ playerId: 'p1' }, { playerId: 'p1' }]
      },
      { id: 'm1', date: '2026-08-31', matchType: 'ranked', result: 'loss', scope: 'individual' }
    ]
  });
  assert.equal(payload.players.length, 1);
  assert.equal(payload.heroes.length, 1);
  assert.equal(payload.matches.length, 1);
  assert.equal(payload.matches[0].playerStats.length, 1);
  assert.ok(payload.matches[0].dataIssues.includes('duplicate_participant'));
});

test('sync schema v4 preserves canonical hero IDs and safe catalog metadata', () => {
  const payload = normalisePayload({
    heroes: [{
      id: 17,
      name: 'Fanny',
      role: 'Assassin',
      roles: ['Assassin'],
      aliases: ['Steel Cable Queen'],
      lanes: ['Jungle'],
      image: 'https://akmweb.youngjoygame.com/web/some/fanny.png'
    }],
    matches: [{
      id: 'm-canonical', date: '2026-08-31', matchType: 'ranked', result: 'win', scope: 'individual',
      playerStats: [{ playerId: 'p1', heroId: 17, heroNameSnapshot: 'Fanny', heroUsed: 'Fanny' }]
    }]
  });
  assert.equal(payload.schemaVersion, 4);
  assert.equal(payload.heroes[0].id, 17);
  assert.deepEqual(payload.heroes[0].aliases, ['Steel Cable Queen']);
  assert.equal(payload.matches[0].playerStats[0].heroId, 17);
  assert.equal(payload.matches[0].playerStats[0].heroResolution, 'canonical');
});

test('invalid legacy hero names are not returned by sync', () => {
  const payload = normalisePayload({
    heroes: [
      { name: 'Mulan', role: 'Fighter' },
      { name: 'Exor', role: 'Mage' },
      { name: 'Fanny', role: 'Assassin' }
    ]
  });
  assert.deepEqual(payload.heroes.map(hero => hero.name), ['Fanny']);
});

test('sync preserves cloud revision and approved Practice Lite provenance', () => {
  const payload = normalisePayload({
    revision: 7,
    lastMutationId: 'mutation_7',
    players: [{ id: 'p1', name: 'Leader' }],
    heroes: [{ name: 'Fanny', role: 'Assassin' }],
    matches: [{
      id: 'practice_abcd1234',
      date: '2026-08-31',
      matchType: 'ranked',
      result: 'win',
      scope: 'individual',
      dataSource: 'submission',
      entryMode: 'practice_lite',
      sourceSubmissionId: 'sub_abcd1234',
      verificationStatus: 'verified',
      playerStats: [{
        playerId: 'p1', playerName: 'Leader', heroUsed: 'Fanny', rolePlayed: 'Jungler',
        kills: 8, deaths: 2, assists: 7
      }]
    }]
  });

  assert.equal(payload.revision, 7);
  assert.equal(payload.lastMutationId, 'mutation_7');
  assert.equal(payload.matches[0].dataSource, 'submission');
  assert.equal(payload.matches[0].entryMode, 'practice_lite');
  assert.equal(payload.matches[0].sourceSubmissionId, 'sub_abcd1234');
  assert.equal(payload.matches[0].verificationStatus, 'verified');
  assert.equal(payload.matches[0].dataCompleteness, 'partial');
  assert.equal(payload.matches[0].validForAnalytics, true);
});
