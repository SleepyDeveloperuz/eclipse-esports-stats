import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdminAction,
  applyVote,
  createEmptyBriefing,
  hashVoterId,
  mergeStoredVotes,
  normaliseBriefing,
  toPublicBriefing,
  voteFileName
} from '../api/briefing.js';

test('briefing schema starts empty and versioned', () => {
  const state = createEmptyBriefing();
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.insights, []);
  assert.equal(state.revision, 0);
});

test('VOD review keeps its match link and source signal', () => {
  const next = applyAdminAction(createEmptyBriefing(), {
    action: 'addReview',
    review: {
      title: 'Lord fight review',
      matchId: 'match_204',
      sourceInsight: 'Lorddan oldin vision yo‘qolgan'
    }
  });
  assert.equal(next.reviews[0].matchId, 'match_204');
  assert.match(next.reviews[0].sourceInsight, /vision/);
});

test('raw VOD source signal stays private until captain decides it', () => {
  let state = applyAdminAction(createEmptyBriefing(), {
    action: 'addReview',
    review: {
      title: 'Unverified Lord hypothesis',
      sourceInsight: 'Bu hali VOD bilan tasdiqlanmagan xom signal'
    }
  });

  assert.equal(Object.hasOwn(toPublicBriefing(state).reviews[0], 'sourceInsight'), false);
  assert.match(toPublicBriefing(state, '', true).reviews[0].sourceInsight, /xom signal/);

  state = applyAdminAction(state, {
    action: 'updateReview',
    id: state.reviews[0].id,
    patch: { status: 'decided', decision: 'Lorddan oldin river vision o‘rnatiladi' }
  });
  assert.match(toPublicBriefing(state).reviews[0].sourceInsight, /xom signal/);
});

test('poll can become a final decision in the public decision log', () => {
  let state = applyAdminAction(createEmptyBriefing(), {
    action: 'addPoll',
    question: 'Keyingi scrim fokusi?',
    options: ['Objective setup', 'Lane pressure']
  });
  state = applyAdminAction(state, {
    action: 'finalizePoll',
    id: state.polls[0].id,
    decision: 'Objective setup tanlandi'
  });
  const publicState = toPublicBriefing(state);
  assert.equal(publicState.polls[0].active, false);
  assert.equal(publicState.polls[0].decision, 'Objective setup tanlandi');
  assert.equal(publicState.decisionLog[0].type, 'poll');
});

test('only captain-approved insights are public', () => {
  let state = applyAdminAction(createEmptyBriefing(), {
    action: 'addInsight',
    insight: {
      title: 'Objective signal',
      summary: 'Turtle setup kech boshlangan',
      reasons: ['3 matchdan 2 tasida river vision kech'],
      sampleSize: 3,
      confidence: 'provisional'
    }
  });
  assert.equal(toPublicBriefing(state).insights.length, 0);
  state = applyAdminAction(state, {
    action: 'updateInsight',
    id: state.insights[0].id,
    patch: { status: 'approved' }
  });
  assert.equal(toPublicBriefing(state).insights.length, 1);
  assert.equal(toPublicBriefing(state, '', true).insights[0].status, 'approved');
});

test('publishing the same match insight updates one record instead of duplicating it', () => {
  const originalPayload = {
    action: 'addInsight',
    insight: {
      matchId: 'match_42',
      title: '  Late   Turtle setup ',
      summary: 'Birinchi xulosa',
      status: 'pending'
    }
  };
  let state = applyAdminAction(createEmptyBriefing(), originalPayload);
  const originalId = state.insights[0].id;
  state = applyAdminAction(state, {
    action: 'addInsight',
    insight: {
      matchId: 'match_42',
      title: 'late turtle setup',
      summary: 'VODdan keyingi tasdiqlangan xulosa',
      reasons: ['River vision 20 soniya kech qo‘yilgan'],
      status: 'approved'
    }
  });

  assert.equal(state.insights.length, 1);
  assert.equal(state.insights[0].id, originalId);
  assert.equal(state.insights[0].status, 'approved');
  assert.match(state.insights[0].summary, /tasdiqlangan/);
});

test('captain can reject, approve and delete an insight', () => {
  let state = applyAdminAction(createEmptyBriefing(), {
    action: 'addInsight',
    insight: { title: 'Draft signal', summary: 'VOD tekshiruvi kerak' }
  });
  const id = state.insights[0].id;
  state = applyAdminAction(state, { action: 'updateInsight', id, patch: { status: 'rejected' } });
  assert.equal(state.insights[0].status, 'rejected');
  assert.equal(toPublicBriefing(state).insights.length, 0);
  state = applyAdminAction(state, { action: 'updateInsight', id, patch: { status: 'approved' } });
  assert.equal(toPublicBriefing(state).insights.length, 1);
  state = applyAdminAction(state, { action: 'deleteInsight', id });
  assert.equal(state.insights.length, 0);
});

test('completed VOD without free-text decision remains in decision log', () => {
  let state = applyAdminAction(createEmptyBriefing(), {
    action: 'addReview',
    review: { title: 'Rotation review' }
  });
  state = applyAdminAction(state, {
    action: 'updateReview',
    id: state.reviews[0].id,
    patch: { status: 'done' }
  });
  const [entry] = toPublicBriefing(state).decisionLog;
  assert.equal(entry.type, 'vod');
  assert.equal(entry.decision, 'Bajarildi');
});

test('one anonymous browser cannot vote twice in the same poll', () => {
  const secret = 'test-secret-long-enough';
  let state = applyAdminAction(createEmptyBriefing(), {
    action: 'addPoll',
    question: 'VOD vaqti?',
    options: ['20:00', '21:00']
  });
  const vote = {
    pollId: state.polls[0].id,
    optionId: state.polls[0].options[0].id,
    voterId: 'viewer_device_123456789'
  };
  state = applyVote(state, vote, secret);
  assert.equal(state.polls[0].options[0].votes, 1);
  assert.throws(() => applyVote(state, vote, secret), /avval ovoz/);
});

test('parallel teammates merge from independent vote sidecar files', () => {
  const secret = 'parallel-vote-test-secret';
  const state = applyAdminAction(createEmptyBriefing(), {
    action: 'addPoll',
    question: 'Keyingi VOD qaysi?',
    options: ['Game 1', 'Game 2']
  });
  const poll = state.polls[0];
  const firstHash = hashVoterId('viewer_device_111111111', secret);
  const secondHash = hashVoterId('viewer_device_222222222', secret);
  const firstRecord = {
    pollId: poll.id,
    optionId: poll.options[0].id,
    voterHash: firstHash,
    createdAt: '2026-08-31T08:00:00.000Z'
  };
  const secondRecord = {
    pollId: poll.id,
    optionId: poll.options[1].id,
    voterHash: secondHash,
    createdAt: '2026-08-31T08:00:01.000Z'
  };
  const merged = mergeStoredVotes(state, {
    [voteFileName(poll.id, firstHash)]: { content: JSON.stringify(firstRecord) },
    [voteFileName(poll.id, secondHash)]: { content: JSON.stringify(secondRecord) }
  });

  assert.equal(merged.polls[0].options[0].votes, 1);
  assert.equal(merged.polls[0].options[1].votes, 1);
  assert.deepEqual(new Set(merged.polls[0].voterHashes), new Set([firstHash, secondHash]));
});

test('vote sidecars are filename-bound and never double-count embedded votes', () => {
  const secret = 'sidecar-integrity-test-secret';
  let state = applyAdminAction(createEmptyBriefing(), {
    action: 'addPoll',
    question: 'Scrim vaqti?',
    options: ['20:00', '21:00']
  });
  const poll = state.polls[0];
  const voterId = 'viewer_device_333333333';
  const voterHash = hashVoterId(voterId, secret);
  state = applyVote(state, {
    pollId: poll.id,
    optionId: poll.options[0].id,
    voterId
  }, secret);
  const record = {
    pollId: poll.id,
    optionId: poll.options[0].id,
    voterHash,
    createdAt: '2026-08-31T08:00:00.000Z'
  };
  const merged = mergeStoredVotes(state, {
    [voteFileName(poll.id, voterHash)]: { content: JSON.stringify(record) },
    [`eclipse_vote_tampered_${voterHash}.json`]: {
      content: JSON.stringify({ ...record, optionId: poll.options[1].id })
    }
  });

  assert.equal(merged.polls[0].options[0].votes, 1);
  assert.equal(merged.polls[0].options[1].votes, 0);
  assert.equal(merged.polls[0].voterHashes.length, 1);
});

test('vote sidecars written after a poll cutoff are ignored', () => {
  const secret = 'closed-poll-sidecar-secret';
  const state = applyAdminAction(createEmptyBriefing(), {
    action: 'addPoll',
    question: 'Draft review?',
    options: ['Hozir', 'Keyin'],
    closesAt: '2026-08-31T09:00:00.000Z'
  });
  const poll = state.polls[0];
  const beforeHash = hashVoterId('viewer_device_444444444', secret);
  const afterHash = hashVoterId('viewer_device_555555555', secret);
  const before = {
    pollId: poll.id,
    optionId: poll.options[0].id,
    voterHash: beforeHash,
    createdAt: '2026-08-31T08:59:59.000Z'
  };
  const after = {
    pollId: poll.id,
    optionId: poll.options[1].id,
    voterHash: afterHash,
    createdAt: '2026-08-31T09:00:01.000Z'
  };
  const merged = mergeStoredVotes(state, {
    [voteFileName(poll.id, beforeHash)]: { content: JSON.stringify(before) },
    [voteFileName(poll.id, afterHash)]: { content: JSON.stringify(after) }
  });

  assert.equal(merged.polls[0].options[0].votes, 1);
  assert.equal(merged.polls[0].options[1].votes, 0);
  assert.deepEqual(merged.polls[0].voterHashes, [beforeHash]);
});

test('normalisation strips unsafe URLs and limits focus', () => {
  const state = normaliseBriefing({
    focus: ['Bir', 'Ikki', 'Uch', 'To‘rt'],
    reviews: [{ title: 'Bad link', url: 'javascript:alert(1)' }]
  });
  assert.equal(state.focus.length, 3);
  assert.equal(state.reviews[0].url, '');
});

test('briefing client renders API insights and poll decisions without exposing a waiting raw signal', async () => {
  globalThis.window = {};
  await import('../js/briefing.js');
  const manager = new window.BriefingManager({ isAdmin: () => false });
  const insightHtml = manager.insightsMarkup([{
    id: 'insight_1',
    matchId: 'match_1',
    title: 'Objective timing',
    summary: 'Turtle setup VOD bilan tasdiqlandi',
    reasons: ['River entry kech'],
    sampleSize: 5,
    confidence: 'stable',
    status: 'approved'
  }], false);
  const decisionsHtml = manager.decisionsMarkup([{
    id: 'poll_1',
    type: 'poll',
    title: 'Scrim fokusi',
    decision: 'Objective setup tanlandi'
  }]);
  const waitingReviewHtml = manager.reviewMarkup({
    id: 'review_1',
    title: 'Raw review',
    status: 'waiting',
    sourceInsight: 'VIEWERGA_CHIQMASIN'
  }, false);

  assert.match(insightHtml, /Objective timing/);
  assert.match(insightHtml, /Tasdiqlangan/);
  assert.match(decisionsHtml, /SO‘ROVNOMA/);
  assert.match(decisionsHtml, /Objective setup tanlandi/);
  assert.doesNotMatch(waitingReviewHtml, /VIEWERGA_CHIQMASIN/);
});
