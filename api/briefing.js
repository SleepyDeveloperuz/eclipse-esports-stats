import crypto from 'crypto';
import { createSessionSecurity } from '../lib/session-security.js';
import { readTeamFiles, writeTeamFiles, withTeamTransaction } from '../lib/team-store.js';
import {
  isAuthConfigured,
  isViewerAuthConfigured,
  isViewerGateRequested,
  getAccessIdentity,
  verifySession,
  verifyToken
} from './auth.js';

const GIST_ID = process.env.GIST_ID;
const SESSION_SECRET = process.env.SESSION_SECRET;
const BRIEFING_FILE = 'eclipse_briefing.json';
const VOTE_FILE_PREFIX = 'eclipse_vote_';
const REVIEW_STATUSES = new Set(['waiting', 'reviewing', 'decided', 'done']);
const INSIGHT_STATUSES = new Set(['pending', 'approved', 'rejected']);
const security = createSessionSecurity();
let mutationQueue = Promise.resolve();

export function createEmptyBriefing() {
  return {
    schemaVersion: 2,
    revision: 0,
    lastMutationId: null,
    summary: '',
    focus: [],
    reviews: [],
    polls: [],
    insights: [],
    updatedAt: null
  };
}

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength)
    : '';
}

function cleanUrl(value) {
  const text = cleanText(value, 500);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function cleanId(value) {
  const id = cleanText(value, 80);
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
}

function safeDate(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return new Date().toISOString();
  return new Date(value).toISOString();
}

function optionalDate(value) {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function queueMutation(callback) {
  const execute = () => withTeamTransaction(callback);
  const run = mutationQueue.then(execute, execute);
  mutationQueue = run.catch(() => undefined);
  return run;
}

export function normaliseBriefing(input) {
  const source = input && typeof input === 'object' ? input : {};
  const summary = cleanText(source.summary, 600);
  const focus = Array.isArray(source.focus)
    ? source.focus.slice(0, 3).map(item => cleanText(typeof item === 'string' ? item : item?.text, 160)).filter(Boolean)
    : [];

  const reviews = Array.isArray(source.reviews) ? source.reviews.map(item => {
    const id = cleanId(item?.id) || crypto.randomUUID();
    const status = REVIEW_STATUSES.has(item?.status) ? item.status : 'waiting';
    return {
      id,
      title: cleanText(item?.title, 140),
      matchId: cleanId(item?.matchId),
      url: cleanUrl(item?.url),
      timestamp: cleanText(item?.timestamp, 40),
      reason: cleanText(item?.reason, 300),
      status,
      decision: cleanText(item?.decision, 400),
      sourceInsight: cleanText(item?.sourceInsight, 500),
      deadline: optionalDate(item?.deadline),
      createdAt: safeDate(item?.createdAt),
      updatedAt: safeDate(item?.updatedAt || item?.createdAt)
    };
  }).filter(item => item.title) : [];

  const polls = Array.isArray(source.polls) ? source.polls.map(item => {
    const options = Array.isArray(item?.options) ? item.options.slice(0, 6).map(option => ({
      id: cleanId(option?.id) || crypto.randomUUID(),
      label: cleanText(option?.label, 80),
      votes: Math.max(0, Math.min(100000, Number.isInteger(option?.votes) ? option.votes : 0))
    })).filter(option => option.label) : [];
    const hashes = Array.isArray(item?.voterHashes)
      ? [...new Set(item.voterHashes.map(hash => cleanText(hash, 128)).filter(hash => /^[a-f0-9]{64}$/.test(hash)))].slice(0, 5000)
      : [];
    return {
      id: cleanId(item?.id) || crypto.randomUUID(),
      question: cleanText(item?.question, 180),
      options,
      voterHashes: hashes,
      active: item?.active !== false,
      decision: cleanText(item?.decision, 400),
      decidedAt: optionalDate(item?.decidedAt),
      closedAt: optionalDate(item?.closedAt),
      closesAt: optionalDate(item?.closesAt),
      createdAt: safeDate(item?.createdAt)
    };
  }).filter(item => item.question && item.options.length >= 2) : [];

  const insights = Array.isArray(source.insights) ? source.insights.map(item => {
    const reasons = Array.isArray(item?.reasons)
      ? item.reasons.slice(0, 6).map(reason => cleanText(reason, 180)).filter(Boolean)
      : [];
    return {
      id: cleanId(item?.id) || crypto.randomUUID(),
      matchId: cleanId(item?.matchId),
      title: cleanText(item?.title, 140),
      summary: cleanText(item?.summary, 500),
      reasons,
      sampleSize: Math.max(0, Math.min(2500, Number.isInteger(item?.sampleSize) ? item.sampleSize : 0)),
      confidence: ['insufficient', 'provisional', 'stable'].includes(item?.confidence)
        ? item.confidence
        : 'insufficient',
      status: INSIGHT_STATUSES.has(item?.status) ? item.status : 'pending',
      createdAt: safeDate(item?.createdAt),
      updatedAt: safeDate(item?.updatedAt || item?.createdAt)
    };
  }).filter(item => item.title && item.summary) : [];

  return {
    schemaVersion: 2,
    revision: Math.max(0, Number.isInteger(source.revision) ? source.revision : 0),
    lastMutationId: cleanId(source.lastMutationId) || null,
    summary,
    focus,
    reviews,
    polls,
    insights,
    updatedAt: typeof source.updatedAt === 'string' && !Number.isNaN(Date.parse(source.updatedAt))
      ? new Date(source.updatedAt).toISOString()
      : null
  };
}

export function hashVoterId(voterId, secret = SESSION_SECRET) {
  if (!secret) throw new Error('SESSION_SECRET mavjud emas');
  return crypto.createHmac('sha256', secret).update(voterId).digest('hex');
}

export function toPublicBriefing(state, voterId = '', includePendingInsights = false) {
  const voterHash = voterId && SESSION_SECRET ? hashVoterId(voterId) : '';
  const votedPollIds = [];
  const polls = state.polls.map(poll => {
    if (voterHash && poll.voterHashes.includes(voterHash)) votedPollIds.push(poll.id);
    return {
      id: poll.id,
      question: poll.question,
      options: poll.options,
      active: poll.active && (!poll.closesAt || Date.parse(poll.closesAt) > Date.now()),
      decision: poll.decision,
      decidedAt: poll.decidedAt,
      closesAt: poll.closesAt,
      createdAt: poll.createdAt,
      totalVotes: poll.options.reduce((sum, option) => sum + option.votes, 0)
    };
  });

  const visibleInsights = includePendingInsights
    ? state.insights
    : state.insights.filter(item => item.status === 'approved');
  const visibleReviews = state.reviews.map(review => {
    if (includePendingInsights || review.status === 'decided' || review.status === 'done') {
      return review;
    }
    const { sourceInsight: _privateSourceInsight, ...publicReview } = review;
    return publicReview;
  });
  const decisionLog = [
    ...state.reviews.filter(item => item.decision || item.status === 'done').map(item => ({
      id: `review_${item.id}`,
      type: 'vod',
      title: item.title,
      decision: item.decision || 'Bajarildi',
      matchId: item.matchId,
      decidedAt: item.updatedAt || item.createdAt
    })),
    ...state.polls.filter(item => item.decision).map(item => ({
      id: `poll_${item.id}`,
      type: 'poll',
      title: item.question,
      decision: item.decision,
      matchId: '',
      decidedAt: item.decidedAt || item.createdAt
    }))
  ].sort((a, b) => Date.parse(b.decidedAt || 0) - Date.parse(a.decidedAt || 0));

  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    summary: state.summary,
    focus: state.focus,
    reviews: visibleReviews,
    polls,
    insights: visibleInsights,
    decisionLog,
    votedPollIds,
    updatedAt: state.updatedAt
  };
}

export function applyAdminAction(state, body) {
  const next = normaliseBriefing(state);
  const action = cleanText(body?.action, 40);

  if (action === 'setFocus') {
    next.focus = Array.isArray(body.items)
      ? body.items.slice(0, 3).map(item => cleanText(item, 160)).filter(Boolean)
      : [];
    if (Object.hasOwn(body, 'summary')) next.summary = cleanText(body.summary, 600);
  } else if (action === 'addReview') {
    const title = cleanText(body.review?.title, 140);
    if (!title) throw new Error('VOD nomi kiritilishi kerak');
    next.reviews.unshift({
      id: crypto.randomUUID(),
      title,
      matchId: cleanId(body.review?.matchId),
      url: cleanUrl(body.review?.url),
      timestamp: cleanText(body.review?.timestamp, 40),
      reason: cleanText(body.review?.reason, 300),
      status: REVIEW_STATUSES.has(body.review?.status) ? body.review.status : 'waiting',
      decision: '',
      sourceInsight: cleanText(body.review?.sourceInsight, 500),
      deadline: optionalDate(body.review?.deadline),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } else if (action === 'updateReview') {
    const id = cleanId(body.id);
    const review = next.reviews.find(item => item.id === id);
    if (!review) throw new Error('VOD topilmadi');
    if (body.patch && Object.hasOwn(body.patch, 'title')) {
      const title = cleanText(body.patch.title, 140);
      if (!title) throw new Error('VOD nomi bo‘sh qolishi mumkin emas');
      review.title = title;
    }
    if (body.patch && Object.hasOwn(body.patch, 'matchId')) review.matchId = cleanId(body.patch.matchId);
    if (body.patch && Object.hasOwn(body.patch, 'url')) review.url = cleanUrl(body.patch.url);
    if (body.patch && Object.hasOwn(body.patch, 'timestamp')) review.timestamp = cleanText(body.patch.timestamp, 40);
    if (body.patch && Object.hasOwn(body.patch, 'reason')) review.reason = cleanText(body.patch.reason, 300);
    if (body.patch && Object.hasOwn(body.patch, 'decision')) review.decision = cleanText(body.patch.decision, 400);
    if (body.patch && Object.hasOwn(body.patch, 'sourceInsight')) review.sourceInsight = cleanText(body.patch.sourceInsight, 500);
    if (body.patch && Object.hasOwn(body.patch, 'deadline')) review.deadline = optionalDate(body.patch.deadline);
    if (body.patch && REVIEW_STATUSES.has(body.patch.status)) review.status = body.patch.status;
    review.updatedAt = new Date().toISOString();
  } else if (action === 'deleteReview') {
    const id = cleanId(body.id);
    const initialLength = next.reviews.length;
    next.reviews = next.reviews.filter(item => item.id !== id);
    if (next.reviews.length === initialLength) throw new Error('VOD topilmadi');
  } else if (action === 'addPoll') {
    const question = cleanText(body.question, 180);
    const labels = Array.isArray(body.options)
      ? [...new Set(body.options.map(option => cleanText(option, 80)).filter(Boolean))].slice(0, 6)
      : [];
    if (!question) throw new Error('So‘rovnoma savoli kiritilishi kerak');
    if (labels.length < 2) throw new Error('Kamida 2 ta javob varianti kerak');
    next.polls.unshift({
      id: crypto.randomUUID(),
      question,
      options: labels.map(label => ({ id: crypto.randomUUID(), label, votes: 0 })),
      voterHashes: [],
      active: true,
      decision: '',
      decidedAt: null,
      closedAt: null,
      closesAt: optionalDate(body.closesAt),
      createdAt: new Date().toISOString()
    });
  } else if (action === 'setPollActive') {
    const id = cleanId(body.id);
    const poll = next.polls.find(item => item.id === id);
    if (!poll) throw new Error('So‘rovnoma topilmadi');
    poll.active = body.active === true;
    if (poll.active) {
      poll.closedAt = null;
      poll.decision = '';
      poll.decidedAt = null;
      if (poll.closesAt && Date.parse(poll.closesAt) <= Date.now()) poll.closesAt = null;
    } else {
      poll.closedAt = new Date().toISOString();
    }
  } else if (action === 'finalizePoll' || action === 'setPollDecision') {
    const id = cleanId(body.id);
    const poll = next.polls.find(item => item.id === id);
    if (!poll) throw new Error('So‘rovnoma topilmadi');
    const decision = cleanText(body.decision, 400);
    if (!decision) throw new Error('Yakuniy qaror matni kerak');
    poll.active = false;
    poll.decision = decision;
    poll.decidedAt = new Date().toISOString();
    poll.closedAt = poll.decidedAt;
  } else if (action === 'deletePoll') {
    const id = cleanId(body.id);
    const initialLength = next.polls.length;
    next.polls = next.polls.filter(item => item.id !== id);
    if (next.polls.length === initialLength) throw new Error('So‘rovnoma topilmadi');
  } else if (action === 'addInsight') {
    const title = cleanText(body.insight?.title, 140);
    const summary = cleanText(body.insight?.summary, 500);
    if (!title || !summary) throw new Error('Insight sarlavhasi va xulosasi kerak');
    const matchId = cleanId(body.insight?.matchId);
    const reasons = Array.isArray(body.insight?.reasons)
      ? body.insight.reasons.slice(0, 6).map(reason => cleanText(reason, 180)).filter(Boolean)
      : [];
    const sampleSize = Math.max(0, Math.min(2500, Math.round(Number(body.insight?.sampleSize) || 0)));
    const confidence = ['insufficient', 'provisional', 'stable'].includes(body.insight?.confidence)
      ? body.insight.confidence
      : 'insufficient';
    const requestedStatus = INSIGHT_STATUSES.has(body.insight?.status) ? body.insight.status : null;
    const canonicalTitle = title.replace(/\s+/g, ' ').toLowerCase();
    const duplicate = next.insights.find(item => (
      item.matchId === matchId
      && item.title.replace(/\s+/g, ' ').toLowerCase() === canonicalTitle
    ));
    const timestamp = new Date().toISOString();

    if (duplicate) {
      duplicate.title = title;
      duplicate.summary = summary;
      duplicate.reasons = reasons;
      duplicate.sampleSize = sampleSize;
      duplicate.confidence = confidence;
      if (requestedStatus) duplicate.status = requestedStatus;
      duplicate.updatedAt = timestamp;
      next.insights = [duplicate, ...next.insights.filter(item => item.id !== duplicate.id)];
    } else {
      next.insights.unshift({
        id: crypto.randomUUID(),
        matchId,
        title,
        summary,
        reasons,
        sampleSize,
        confidence,
        status: requestedStatus || 'pending',
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  } else if (action === 'updateInsight') {
    const id = cleanId(body.id);
    const insight = next.insights.find(item => item.id === id);
    if (!insight) throw new Error('Insight topilmadi');
    if (body.patch && Object.hasOwn(body.patch, 'title')) insight.title = cleanText(body.patch.title, 140) || insight.title;
    if (body.patch && Object.hasOwn(body.patch, 'summary')) insight.summary = cleanText(body.patch.summary, 500) || insight.summary;
    if (body.patch && Object.hasOwn(body.patch, 'matchId')) insight.matchId = cleanId(body.patch.matchId);
    if (body.patch && Array.isArray(body.patch.reasons)) {
      insight.reasons = body.patch.reasons.slice(0, 6).map(reason => cleanText(reason, 180)).filter(Boolean);
    }
    if (body.patch && INSIGHT_STATUSES.has(body.patch.status)) insight.status = body.patch.status;
    insight.updatedAt = new Date().toISOString();
  } else if (action === 'deleteInsight') {
    const id = cleanId(body.id);
    const initialLength = next.insights.length;
    next.insights = next.insights.filter(item => item.id !== id);
    if (next.insights.length === initialLength) throw new Error('Insight topilmadi');
  } else {
    throw new Error('Noma’lum admin amali');
  }

  next.updatedAt = new Date().toISOString();
  return normaliseBriefing(next);
}

export function applyVote(state, body, secret = SESSION_SECRET) {
  const next = normaliseBriefing(state);
  const vote = validateVote(next, body, secret);
  const poll = next.polls.find(item => item.id === vote.pollId);
  const option = poll.options.find(item => item.id === vote.optionId);

  option.votes += 1;
  poll.voterHashes.push(vote.voterHash);
  next.updatedAt = new Date().toISOString();
  return normaliseBriefing(next);
}

export function validateVote(state, body, secret = SESSION_SECRET) {
  const next = normaliseBriefing(state);
  const pollId = cleanId(body?.pollId);
  const optionId = cleanId(body?.optionId);
  const voterId = cleanText(body?.voterId, 120);
  if (!pollId || !optionId || !/^[a-zA-Z0-9_-]{16,120}$/.test(voterId)) {
    const error = new Error('Ovoz ma’lumotlari noto‘g‘ri');
    error.code = 'INVALID_VOTE';
    throw error;
  }

  const poll = next.polls.find(item => item.id === pollId);
  if (!poll) {
    const error = new Error('So‘rovnoma topilmadi');
    error.code = 'POLL_NOT_FOUND';
    throw error;
  }
  if (!poll.active) {
    const error = new Error('Bu so‘rovnoma yopilgan');
    error.code = 'POLL_CLOSED';
    throw error;
  }
  if (poll.closesAt && Date.parse(poll.closesAt) <= Date.now()) {
    const error = new Error('Bu so‘rovnomaning vaqti tugagan');
    error.code = 'POLL_CLOSED';
    throw error;
  }
  const option = poll.options.find(item => item.id === optionId);
  if (!option) {
    const error = new Error('Javob varianti topilmadi');
    error.code = 'OPTION_NOT_FOUND';
    throw error;
  }

  const voterHash = hashVoterId(voterId, secret);
  if (poll.voterHashes.includes(voterHash)) {
    const error = new Error('Bu so‘rovnomada avval ovoz bergansiz');
    error.code = 'ALREADY_VOTED';
    throw error;
  }

  return { pollId, optionId, voterHash };
}

export function voteFileName(pollId, voterHash) {
  const safePollId = cleanId(pollId);
  const safeHash = cleanText(voterHash, 64);
  if (!safePollId || !/^[a-f0-9]{64}$/.test(safeHash)) return '';
  return `${VOTE_FILE_PREFIX}${safePollId}_${safeHash}.json`;
}

function parseVoteRecord(filename, file) {
  if (!filename.startsWith(VOTE_FILE_PREFIX) || !filename.endsWith('.json') || !file?.content) return null;
  try {
    const source = JSON.parse(file.content);
    const pollId = cleanId(source?.pollId);
    const optionId = cleanId(source?.optionId);
    const voterHash = cleanText(source?.voterHash, 64);
    const createdAt = optionalDate(source?.createdAt);
    if (!pollId || !optionId || !createdAt || !/^[a-f0-9]{64}$/.test(voterHash)) return null;
    if (filename !== voteFileName(pollId, voterHash)) return null;
    return { pollId, optionId, voterHash, createdAt };
  } catch {
    return null;
  }
}

export function mergeStoredVotes(state, files = {}) {
  const next = normaliseBriefing(state);
  const seenByPoll = new Map(next.polls.map(poll => [poll.id, new Set(poll.voterHashes)]));

  Object.entries(files || {}).forEach(([filename, file]) => {
    const vote = parseVoteRecord(filename, file);
    if (!vote) return;
    const poll = next.polls.find(item => item.id === vote.pollId);
    const option = poll?.options.find(item => item.id === vote.optionId);
    const seen = seenByPoll.get(vote.pollId);
    if (!poll || !option || !seen || seen.has(vote.voterHash)) return;
    const voteTime = Date.parse(vote.createdAt);
    if (poll.closesAt && voteTime > Date.parse(poll.closesAt)) return;
    if (poll.closedAt && voteTime > Date.parse(poll.closedAt)) return;
    option.votes = Math.min(100000, option.votes + 1);
    poll.voterHashes.push(vote.voterHash);
    seen.add(vote.voterHash);
  });

  return next;
}

async function readBriefingBundle() {
  const gist = { files: await readTeamFiles() };
  const file = gist.files?.[BRIEFING_FILE];
  if (!file?.content) return { state: createEmptyBriefing(), files: gist.files || {} };
  try {
    return {
      state: mergeStoredVotes(JSON.parse(file.content), gist.files || {}),
      files: gist.files || {}
    };
  } catch {
    throw new Error('Briefing bazasi formati buzilgan');
  }
}

async function readBriefing() {
  return (await readBriefingBundle()).state;
}

async function writeGistFiles(files) {
  await writeTeamFiles(files);
}

async function writeBriefing(state) {
  await writeGistFiles({ [BRIEFING_FILE]: { content: JSON.stringify(state, null, 2) } });
}

async function compactEmbeddedVoteFiles() {
  const { files } = await readBriefingBundle();
  const mainFile = files[BRIEFING_FILE];
  if (!mainFile?.content) return;
  let central;
  try {
    central = normaliseBriefing(JSON.parse(mainFile.content));
  } catch {
    return;
  }

  const polls = new Map(central.polls.map(poll => [poll.id, poll]));
  const deletions = {};
  Object.entries(files).forEach(([filename, file]) => {
    const vote = parseVoteRecord(filename, file);
    if (!vote) return;
    const poll = polls.get(vote.pollId);
    const voteTime = Date.parse(vote.createdAt);
    const expired = poll?.closesAt && voteTime > Date.parse(poll.closesAt);
    const closedLate = poll?.closedAt && voteTime > Date.parse(poll.closedAt);
    if (!poll || expired || closedLate || poll.voterHashes.includes(vote.voterHash)) {
      deletions[filename] = null;
    }
  });
  if (Object.keys(deletions).length) await writeGistFiles(deletions);
}

async function persistVote(body, voterId, attempts = 3) {
  let latestError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { state, files } = await readBriefingBundle();
      const requestedPollId = cleanId(body?.pollId);
      const requestedOptionId = cleanId(body?.optionId);
      const requestedVoterHash = hashVoterId(voterId);
      const requestedFilename = voteFileName(requestedPollId, requestedVoterHash);
      const existing = requestedFilename ? parseVoteRecord(requestedFilename, files[requestedFilename]) : null;
      if (existing) {
        if (existing.optionId !== requestedOptionId) {
          const conflict = new Error('Bu so‘rovnomada avval ovoz bergansiz');
          conflict.code = 'ALREADY_VOTED';
          throw conflict;
        }
        const existingPoll = state.polls.find(item => item.id === existing.pollId);
        if (existingPoll?.voterHashes.includes(existing.voterHash)) return state;
        const rejected = new Error(existingPoll ? 'Bu so‘rovnoma yopilgan' : 'So‘rovnoma topilmadi');
        rejected.code = existingPoll ? 'POLL_CLOSED' : 'POLL_NOT_FOUND';
        throw rejected;
      }

      const vote = validateVote(state, { ...body, voterId });
      const filename = voteFileName(vote.pollId, vote.voterHash);
      const record = {
        pollId: vote.pollId,
        optionId: vote.optionId,
        voterHash: vote.voterHash,
        createdAt: new Date().toISOString()
      };
      await writeGistFiles({ [filename]: { content: JSON.stringify(record) } });

      const confirmed = await readBriefingBundle();
      const stored = parseVoteRecord(filename, confirmed.files[filename]);
      if (stored?.optionId !== vote.optionId) {
        const conflict = new Error('Bu so‘rovnomada avval ovoz bergansiz');
        conflict.code = 'ALREADY_VOTED';
        throw conflict;
      }
      const poll = confirmed.state.polls.find(item => item.id === vote.pollId);
      if (poll?.voterHashes.includes(vote.voterHash)) return confirmed.state;
      if (!poll) {
        const missing = new Error('So‘rovnoma topilmadi');
        missing.code = 'POLL_NOT_FOUND';
        throw missing;
      }
      if (!poll.active || (poll.closesAt && Date.parse(poll.closesAt) <= Date.now())) {
        const closed = new Error('Bu so‘rovnoma yopilgan');
        closed.code = 'POLL_CLOSED';
        throw closed;
      }
      latestError = new Error('Ovoz yozuvi tasdiqlanmadi');
    } catch (error) {
      if (error?.code) throw error;
      latestError = error;
    }
  }
  throw latestError || new Error('Ovozni saqlab bo‘lmadi');
}

async function persistMutation(transform, attempts = 3) {
  const mutationId = crypto.randomUUID();
  let latestError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const current = await readBriefing();
      const next = normaliseBriefing(transform(current));
      next.revision = current.revision + 1;
      next.lastMutationId = mutationId;
      next.updatedAt = new Date().toISOString();
      await writeBriefing(next);

      // Reads here see the transaction draft. The repository commits this
      // state with a shared Redis compare-and-swap before replying to the user.
      const confirmed = await readBriefing();
      if (confirmed.lastMutationId === mutationId) return confirmed;
      latestError = new Error('Parallel o‘zgarish aniqlandi');
    } catch (error) {
      latestError = error;
    }
  }
  throw latestError || new Error('Briefing o‘zgarishini saqlab bo‘lmadi');
}

async function requireAdmin(req, res) {
  if (!isAuthConfigured()) {
    res.status(503).json({ error: 'Admin xavfsizlik sozlamalari topilmadi' });
    return false;
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!await verifySession(token, 'admin')) {
    res.status(401).json({ error: 'Bu amal faqat Admin uchun' });
    return false;
  }
  return true;
}

async function requireViewer(req, res) {
  if (isViewerGateRequested() && !isViewerAuthConfigured()) {
    res.status(503).json({
      code: 'VIEWER_AUTH_MISCONFIGURED',
      error: 'Jamoa kirish himoyasi to‘liq sozlanmagan'
    });
    return false;
  }
  if (!isViewerAuthConfigured()) return true;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!await verifySession(token)) {
    res.status(401).json({
      code: 'VIEWER_AUTH_REQUIRED',
      error: 'Briefingni ko‘rish uchun jamoa kirishi talab qilinadi'
    });
    return false;
  }
  return true;
}

function signedVoterId(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const identity = getAccessIdentity(token);
  if (identity?.role === 'viewer') return identity.voterId;
  // Admin is already trusted to mutate the poll itself; retain its local
  // device identity so the Admin UI can also show its own vote state.
  return identity?.role === 'admin' ? cleanText(req.headers['x-eclipse-voter'], 120) : '';
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!GIST_ID) return res.status(503).json({ error: 'Briefing bazasi sozlanmagan' });

    if (req.method === 'GET') {
      if (!await requireViewer(req, res)) return;
      const state = await readBriefing();
      const voterId = signedVoterId(req);
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      return res.status(200).json(toPublicBriefing(state, voterId, verifyToken(token)));
    }

    if (req.method === 'POST') {
      if (!await requireAdmin(req, res)) return;
      const state = await queueMutation(() => persistMutation(current => applyAdminAction(current, req.body || {})));
      try {
        await withTeamTransaction(() => compactEmbeddedVoteFiles());
      } catch (cleanupError) {
        console.error('Briefing vote cleanup error:', cleanupError);
      }
      const voterId = signedVoterId(req);
      return res.status(200).json(toPublicBriefing(state, voterId, true));
    }

    if (req.method === 'PATCH') {
      if (!await requireViewer(req, res)) return;
      if (!SESSION_SECRET) return res.status(503).json({ error: 'Ovoz berish sozlanmagan' });
      const rate = await security.checkAction(req, getAccessIdentity(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()), 'vote', 20, 60000);
      if (rate.limited) { res.setHeader('Retry-After', String(rate.retryAfter)); return res.status(429).json({ error: 'Juda ko‘p urinish. Bir daqiqadan keyin qayta urinib ko‘ring.' }); }
      try {
        const voterId = signedVoterId(req);
        if (!voterId) {
          return res.status(401).json({
            code: 'VIEWER_AUTH_REQUIRED',
            error: 'Ovoz berish uchun viewer sessiyasiga qayta kiring'
          });
        }
        // Sidecars and poll lifecycle changes share one atomic Redis revision.
        const state = await withTeamTransaction(() => persistVote(req.body || {}, voterId));
        return res.status(200).json(toPublicBriefing(state, voterId));
      } catch (error) {
        if (error.code === 'ALREADY_VOTED') return res.status(409).json({ error: error.message });
        if (error.status) throw error;
        if (error.code) return res.status(400).json({ error: error.message });
        throw error;
      }
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Briefing API error:', error);
    return res.status(error.status || 500).json({ code: error.code || 'BRIEFING_ERROR', error: 'Briefing saqlash xizmati vaqtincha javob bermadi. Qayta urinib ko‘ring.' });
  }
}
