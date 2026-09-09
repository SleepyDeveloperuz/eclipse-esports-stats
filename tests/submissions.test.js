import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalisePracticeDraft,
  normaliseSubmission,
  practiceFingerprint,
  submissionFileName,
  toOfficialMatch
} from '../api/submissions.js';

const officialData = {
  players: [
    { id: 'p1', name: 'Leader', active: true },
    { id: 'p2', name: 'Shadow', active: true },
    { id: 'p3', name: 'Archived', active: false }
  ],
  heroes: [
    { id: 17, name: 'Fanny', role: 'Assassin' },
    { id: 102, name: 'Mathilda', role: 'Support' }
  ]
};

function draftInput(overrides = {}) {
  return {
    date: '2026-08-31',
    matchType: 'ranked',
    result: 'win',
    durationFormatted: '15:12',
    claimedPlayerId: 'p1',
    notes: 'Jungle rotation',
    playerStats: [{
      playerId: 'p1',
      heroUsed: 'fanny',
      rolePlayed: 'Jungler',
      kills: '8',
      deaths: '2',
      assists: '7',
      inGameScore: '10.4',
      medal: 'MVP'
    }],
    ...overrides
  };
}

function storedSubmission(draft, overrides = {}) {
  const fingerprint = practiceFingerprint(draft);
  return {
    schemaVersion: 1,
    id: `sub_${fingerprint.slice(0, 24)}`,
    fingerprint,
    status: 'pending',
    source: 'manual',
    idempotencyKey: 'request_01',
    submitter: {
      identityHash: 'a'.repeat(64),
      claimedPlayerId: draft.claimedPlayerId,
      claimedPlayerName: draft.claimedPlayerName
    },
    draft,
    quality: { reviewIssues: [] },
    review: { reason: '', reviewedAt: null, officialMatchId: '' },
    createdAt: '2026-08-31T08:00:00.000Z',
    updatedAt: '2026-08-31T08:00:00.000Z',
    ...overrides
  };
}

test('Practice Lite draft canonicalizes roster, hero, duration, KDA, and server-derived scope', () => {
  const draft = normalisePracticeDraft(draftInput({ notes: '<Focus>  on   invade' }), officialData);

  assert.equal(draft.scope, 'individual');
  assert.equal(draft.trackedCount, 1);
  assert.equal(draft.durationSeconds, 912);
  assert.equal(draft.durationFormatted, '15:12');
  assert.equal(draft.claimedPlayerName, 'Leader');
  assert.equal(draft.playerStats[0].playerName, 'Leader');
  assert.equal(draft.playerStats[0].heroUsed, 'Fanny');
  assert.equal(draft.playerStats[0].heroId, 17);
  assert.equal(draft.playerStats[0].heroResolution, 'canonical');
  assert.deepEqual(
    [draft.playerStats[0].kills, draft.playerStats[0].deaths, draft.playerStats[0].assists],
    [8, 2, 7]
  );
  assert.equal(draft.playerStats[0].inGameScore, 10.4);
  assert.equal(draft.playerStats[0].medal, 'mvp');
  assert.equal(draft.notes, 'Focus on invade');
});

test('Practice Lite rejects coercible non-numeric KDA, inactive roster, duplicates, and oversized six-player rows', () => {
  assert.throws(
    () => normalisePracticeDraft(draftInput({
      playerStats: [{ ...draftInput().playerStats[0], kills: false }]
    }), officialData),
    /K\/D\/A/
  );

  assert.throws(
    () => normalisePracticeDraft(draftInput({
      claimedPlayerId: 'p3',
      playerStats: [{ ...draftInput().playerStats[0], playerId: 'p3' }]
    }), officialData),
    /faol rosterda/
  );

  const duplicate = draftInput().playerStats[0];
  assert.throws(
    () => normalisePracticeDraft(draftInput({ playerStats: [duplicate, duplicate] }), officialData),
    /ikki marta/
  );

  assert.throws(
    () => normalisePracticeDraft(draftInput({ playerStats: Array(6).fill(duplicate) }), officialData),
    /1–5/
  );
});

test('Practice fingerprint is participant-order invariant but changes with match facts', () => {
  const first = normalisePracticeDraft(draftInput({
    playerStats: [
      draftInput().playerStats[0],
      {
        playerId: 'p2', heroUsed: 'Mathilda', rolePlayed: 'Roamer',
        kills: 1, deaths: 3, assists: 12
      }
    ]
  }), officialData);
  const reordered = {
    ...first,
    notes: 'A different note is not match identity',
    playerStats: [...first.playerStats].reverse()
  };
  const changed = {
    ...reordered,
    playerStats: reordered.playerStats.map(stat => (
      stat.playerId === 'p2' ? { ...stat, assists: stat.assists + 1 } : stat
    ))
  };

  assert.equal(practiceFingerprint(first), practiceFingerprint(reordered));
  assert.notEqual(practiceFingerprint(first), practiceFingerprint(changed));
});

test('stored submission is filename-bound, schema-bound, and draft-fingerprint-bound', () => {
  const draft = normalisePracticeDraft(draftInput(), officialData);
  const record = storedSubmission(draft);
  const filename = submissionFileName(record.fingerprint);

  assert.equal(normaliseSubmission(record, filename)?.id, record.id);
  assert.equal(normaliseSubmission(record, `eclipse_submission_${'b'.repeat(64)}.json`), null);
  assert.equal(normaliseSubmission({ ...record, schemaVersion: 3 }, filename), null);
  assert.equal(normaliseSubmission({ ...record, schemaVersion: 2 }, filename)?.schemaVersion, 2);
  assert.equal(normaliseSubmission({ ...record, status: 'unknown' }, filename), null);
  assert.equal(normaliseSubmission({ ...record, source: 'browser' }, filename), null);
  assert.equal(normaliseSubmission({
    ...record,
    draft: { ...record.draft, playerStats: [{ ...record.draft.playerStats[0], kills: 99 }] }
  }, filename), null);
});

test('approval conversion preserves deterministic Practice Lite provenance and only lite metrics', () => {
  const draft = normalisePracticeDraft(draftInput(), officialData);
  const record = storedSubmission(draft, { source: 'ocr' });
  const match = toOfficialMatch(record, officialData, '2026-08-31T09:00:00.000Z');

  assert.equal(match.id, `practice_${record.fingerprint.slice(0, 24)}`);
  assert.equal(match.dataSource, 'submission');
  assert.equal(match.entryMode, 'practice_lite');
  assert.equal(match.sourceSubmissionId, record.id);
  assert.equal(match.verificationStatus, 'verified');
  assert.equal(match.createdAt, record.createdAt);
  assert.equal(match.updatedAt, '2026-08-31T09:00:00.000Z');
  assert.equal(match.schemaVersion, 4);
  assert.equal(match.playerStats[0].heroId, 17);
  assert.equal(match.playerStats[0].damageDealt, null);
  assert.equal(match.playerStats[0].damageReceived, null);
  assert.equal(match.guestStats.length, 0);
});
