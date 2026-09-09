import crypto from 'crypto';
import { createSessionSecurity } from '../lib/session-security.js';
import { readTeamFiles, writeTeamFiles, withTeamTransaction } from '../lib/team-store.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import {
  getValidAccessIdentity,
  isAuthConfigured,
  isViewerAuthConfigured,
  isViewerGateRequested,
  verifySession
} from './auth.js';
import { normalisePayload } from './sync.js';

const GIST_ID = process.env.GIST_ID;
const SESSION_SECRET = process.env.SESSION_SECRET;
const DATA_FILE = 'eclipse_data.json';
const SUBMISSION_PREFIX = 'eclipse_submission_';
const SUBMISSION_STATUSES = new Set(['pending', 'approved', 'rejected']);
const SUBMISSION_SOURCES = new Set(['manual', 'ocr']);
const MATCH_TYPES = new Set(['ranked', 'scrim', 'tournament', 'casual']);
const MATCH_RESULTS = new Set(['win', 'loss']);
const ROLES = new Set(['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer']);
const MEDALS = new Set(['mvp', 'gold', 'silver', 'bronze']);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_PENDING_PER_IDENTITY = 10;
const MAX_PENDING_TOTAL = 100;
const SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1000;
const SUBMISSION_RATE_LIMIT = 20;
const security = createSessionSecurity();
let mutationQueue = Promise.resolve();

function cleanText(value, maxLength = 200) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f<>\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function cleanId(value, maxLength = 100) {
  const id = cleanText(value, maxLength);
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
}

function cleanDate(value) {
  const text = cleanText(value, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? text
    : '';
}

function nullableNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = typeof value === 'string' ? value.trim() : '';
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = typeof value === 'number' ? value : Number(text);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  if (integer && !Number.isInteger(number)) return null;
  return integer ? number : Number(number.toFixed(2));
}

function normaliseHeroReference(source = {}) {
  const heroId = nullableNumber(source?.heroId, { min: 1, max: 10000, integer: true });
  const heroNameSnapshot = cleanText(source?.heroNameSnapshot || source?.heroUsed, 80) || null;
  const heroUsed = cleanText(source?.heroUsed || heroNameSnapshot, 80) || null;
  return {
    heroId,
    heroNameSnapshot: heroNameSnapshot || heroUsed,
    heroUsed,
    heroResolution: heroId ? 'canonical' : heroUsed ? 'legacy_name' : 'unresolved'
  };
}

function parseDuration(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (Number.isInteger(value)) return value >= 1 && value <= 7259 ? value : null;
  const match = String(value).trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!match) return null;
  const seconds = (Number(match[1]) * 60) + Number(match[2]);
  return seconds >= 1 && seconds <= 7259 ? seconds : null;
}

const EXTENDED_METRICS = { damageDealt: 10000000, damageReceived: 10000000, turretDamage: 10000000, goldEarned: 1000000, teamfightParticipation: 100 };
function extendedStats(row = {}, strict = false) {
  const output = {};
  for (const [field, max] of Object.entries(EXTENDED_METRICS)) {
    output[field] = nullableNumber(row[field], { max, integer: true });
    if (strict && row[field] !== null && row[field] !== undefined && row[field] !== '' && output[field] === null) fail(`${field}: raqam noto‘g‘ri`);
  }
  output.savage = typeof row.savage === 'boolean' ? row.savage : null;
  output.maniac = typeof row.maniac === 'boolean' ? row.maniac : null;
  return output;
}

function fullDraftFields(source, strict = false) {
  if (source.entryMode !== 'full') return {};
  const result = { entryMode: 'full', sessionLabel: cleanText(source.sessionLabel, 80),
    substitutes: [...new Set((Array.isArray(source.substitutes) ? source.substitutes : []).map(id => cleanId(id)).filter(Boolean))],
    guestStats: (Array.isArray(source.guestStats) ? source.guestStats : []).map((row, index) => ({
      guestId: cleanId(row.guestId) || `guest_${index + 1}`, name: cleanText(row.name, 80),
      heroUsed: cleanText(row.heroUsed, 80), rolePlayed: ROLES.has(row.rolePlayed) ? row.rolePlayed : '',
      kills: nullableNumber(row.kills, { max: 200, integer: true }), deaths: nullableNumber(row.deaths, { max: 200, integer: true }),
      assists: nullableNumber(row.assists, { max: 500, integer: true }), inGameScore: nullableNumber(row.inGameScore, { max: 20 }),
      medal: MEDALS.has(row.medal) ? row.medal : null, ...extendedStats(row, strict)
    })) };
  for (const field of ['teamTurtles', 'teamLords', 'teamTurrets']) {
    result[field] = nullableNumber(source[field], { max: field === 'teamTurrets' ? 9 : 10, integer: true });
    if (strict && source[field] !== null && source[field] !== undefined && source[field] !== '' && result[field] === null) fail(`${field}: raqam noto‘g‘ri`);
  }
  return result;
}

function asIso(value, fallback = new Date().toISOString()) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
}

function fail(message, code = 'INVALID_SUBMISSION', status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  throw error;
}

function queueMutation(callback) {
  const execute = () => withTeamTransaction(callback);
  const run = mutationQueue.then(execute, execute);
  mutationQueue = run.catch(() => undefined);
  return run;
}

function bearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function identityHash(identity, secret = SESSION_SECRET) {
  if (!secret || !identity) return '';
  const subject = identity.role === 'viewer' ? `viewer:${identity.voterId}` : 'admin';
  return crypto.createHmac('sha256', secret).update(subject).digest('hex');
}

async function requireAccess(req, res) {
  if (isViewerGateRequested() && !isViewerAuthConfigured()) {
    res.status(503).json({ code: 'VIEWER_AUTH_MISCONFIGURED', error: 'Jamoa kirish himoyasi to‘liq sozlanmagan' });
    return null;
  }
  const identity = await getValidAccessIdentity(bearerToken(req));
  if (!identity) {
    res.status(401).json({ code: 'VIEWER_AUTH_REQUIRED', error: 'Match yuborish uchun jamoa kirishi talab qilinadi' });
    return null;
  }
  return identity;
}

async function requireAdmin(req, res) {
  if (!isAuthConfigured()) {
    res.status(503).json({ error: 'Admin xavfsizlik sozlamalari topilmadi' });
    return false;
  }
  if (!await verifySession(bearerToken(req), 'admin')) {
    res.status(401).json({ error: 'Bu amal faqat Admin uchun' });
    return false;
  }
  return true;
}

export function normalisePracticeDraft(raw, officialData = {}, options = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const roster = (Array.isArray(officialData.players) ? officialData.players : []).filter(player => options.allowArchived || player?.active !== false);
  const rosterById = new Map(roster.map(player => [cleanId(player.id), player]).filter(([id]) => id));
  const heroByKey = new Map();
  (Array.isArray(officialData.heroes) ? officialData.heroes : []).forEach(hero => {
    const name = cleanText(hero?.name, 80);
    if (!name) return;
    const reference = {
      id: nullableNumber(hero?.id, { min: 1, max: 10000, integer: true }),
      name
    };
    [name, ...(Array.isArray(hero?.aliases) ? hero.aliases : [])].forEach(alias => {
      const key = cleanText(alias, 80).toLocaleLowerCase('en-US');
      if (key && !heroByKey.has(key)) heroByKey.set(key, reference);
    });
  });

  const date = cleanDate(source.date);
  if (!date) fail('Match sanasi noto‘g‘ri');
  const matchType = cleanText(source.matchType, 20).toLowerCase();
  if (!MATCH_TYPES.has(matchType)) fail('Match turi noto‘g‘ri');
  const result = cleanText(source.result, 10).toLowerCase();
  if (!MATCH_RESULTS.has(result)) fail('Match natijasi W yoki L bo‘lishi kerak');

  const rawDuration = source.durationSeconds ?? source.durationFormatted ?? source.duration;
  const durationProvided = rawDuration !== '' && rawDuration !== null && rawDuration !== undefined;
  const durationSeconds = parseDuration(rawDuration);
  if (durationProvided && durationSeconds === null) fail('Match davomiyligi MM:SS formatida bo‘lishi kerak');

  const rows = Array.isArray(source.playerStats) ? source.playerStats : [];
  if (rows.length < 1 || rows.length > 5) fail('Match uchun 1–5 ta Eclipse o‘yinchisi kerak');
  const seenPlayers = new Set();
  const playerStats = rows.map((row, index) => {
    const playerId = cleanId(row?.playerId);
    const rosterPlayer = rosterById.get(playerId);
    if (!rosterPlayer) fail(`${index + 1}-qator o‘yinchisi faol rosterda topilmadi`);
    if (seenPlayers.has(playerId)) fail('Bir o‘yinchini bir matchga ikki marta qo‘shib bo‘lmaydi');
    seenPlayers.add(playerId);

    const heroCandidate = cleanText(row?.heroUsed, 80);
    const heroReference = heroByKey.get(heroCandidate.toLocaleLowerCase('en-US')) || null;
    if (!heroReference) fail(`${rosterPlayer.name}: qahramon bazada topilmadi`);
    const rolePlayed = ROLES.has(row?.rolePlayed) ? row.rolePlayed : '';
    if (!rolePlayed) fail(`${rosterPlayer.name}: rolni tanlang`);
    const kills = nullableNumber(row?.kills, { min: 0, max: 200, integer: true });
    const deaths = nullableNumber(row?.deaths, { min: 0, max: 200, integer: true });
    const assists = nullableNumber(row?.assists, { min: 0, max: 500, integer: true });
    if ([kills, deaths, assists].some(value => value === null)) {
      fail(`${rosterPlayer.name}: K/D/A to‘liq va butun sonlarda bo‘lishi kerak`);
    }
    const inGameScore = nullableNumber(row?.inGameScore, { min: 0, max: 20 });
    const medalValue = cleanText(row?.medal, 20).toLowerCase();
    return {
      playerId,
      playerName: cleanText(rosterPlayer.name, 80),
      heroId: heroReference.id,
      heroNameSnapshot: heroReference.name,
      heroUsed: heroReference.name,
      heroResolution: heroReference.id ? 'canonical' : 'legacy_name',
      rolePlayed,
      kills,
      deaths,
      assists,
      inGameScore,
      ...(source.entryMode === 'full' ? extendedStats(row, true) : {}),
      medal: MEDALS.has(medalValue) ? medalValue : null
    };
  });

  const claimedPlayerId = cleanId(source.claimedPlayerId || source.submittedByPlayerId);
  const fullFields = fullDraftFields(source, true);
  if (fullFields.entryMode) {
    if (fullFields.guestStats.length + rows.length > 5) fail('Guestlar bilan birga ko‘pi bilan 5 qatnashchi bo‘lishi mumkin');
    if (new Set(fullFields.guestStats.map(guest => guest.guestId)).size !== fullFields.guestStats.length) fail('Guest ID takrorlangan');
    for (const guest of fullFields.guestStats) {
      if (!guest.name || !heroByKey.has(guest.heroUsed.toLocaleLowerCase('en-US')) || !guest.rolePlayed || [guest.kills, guest.deaths, guest.assists].includes(null)) fail('Guest uchun ism, qahramon, rol va K/D/A kerak');
    }
    if (fullFields.substitutes.some(id => !rosterById.has(id) || seenPlayers.has(id))) fail('Zaxira o‘yinchisi rosterda bo‘lishi va matchda qatnashmagan bo‘lishi kerak');
  }
  const adminAuthor = options.adminAuthor && claimedPlayerId === 'admin';
  if (!adminAuthor && !rosterById.has(claimedPlayerId)) fail('Kim yuborayotganini rosterdan tanlang');
  if (!adminAuthor && !seenPlayers.has(claimedPlayerId)) fail('Yuboruvchi match qatnashchilari ichida bo‘lishi kerak');
  const scope = playerStats.length === 5 ? 'team5' : playerStats.length === 1 ? 'individual' : 'squad';
  return {
    date,
    ...fullDraftFields(source, true),
    matchType,
    result,
    scope,
    trackedCount: playerStats.length,
    durationSeconds,
    durationFormatted: durationSeconds === null
      ? null
      : `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`,
    notes: cleanText(source.notes, 500),
    claimedPlayerId,
    claimedPlayerName: adminAuthor ? 'Captain' : cleanText(rosterById.get(claimedPlayerId)?.name, 80),
    playerStats
  };
}

export function probableMatchIds(draft, matches = []) {
  const key = row => String(row?.heroUsed || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return matches.filter(match => {
    if (match.date !== draft.date || match.result !== draft.result || match.matchType !== draft.matchType) return false;
    if (match.durationSeconds && draft.durationSeconds && Math.abs(match.durationSeconds - draft.durationSeconds) > 30) return false;
    const overlapping = (draft.playerStats || []).map(row => [row, (match.playerStats || []).find(other => other.playerId === row.playerId)]).filter(([, other]) => other);
    return overlapping.length > 0 && overlapping.every(([row, other]) => key(row) && key(row) === key(other)
      && ['kills', 'deaths', 'assists'].every(field => row[field] !== null && other[field] !== null && row[field] !== undefined && other[field] !== undefined && Number(row[field]) === Number(other[field])));
  }).map(match => match.id);
}

export function matchIdentityFingerprint(draft) {
  const canonical = {
    date: draft?.date || '',
    matchType: draft?.matchType || '',
    result: draft?.result || '',
    durationSeconds: Number.isInteger(draft?.durationSeconds) ? draft.durationSeconds : null,
    playerStats: (Array.isArray(draft?.playerStats) ? draft.playerStats : [])
      .map(stat => ({
        playerId: stat.playerId,
        heroUsed: stat.heroUsed,
        rolePlayed: stat.rolePlayed,
        kills: stat.kills,
        deaths: stat.deaths,
        assists: stat.assists,
        inGameScore: stat.inGameScore ?? null,
        medal: stat.medal ?? null
      }))
      .sort((a, b) => a.playerId.localeCompare(b.playerId))
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function practiceFingerprint(draft) {
  const identity = matchIdentityFingerprint(draft);
  if (draft?.entryMode !== 'full') return identity;
  return crypto.createHash('sha256').update(JSON.stringify({ identity,
    ...fullDraftFields(draft),
    participants: [...draft.playerStats].sort((a, b) => a.playerId.localeCompare(b.playerId)).map(row => ({ playerId: row.playerId, ...extendedStats(row) }))
  })).digest('hex');
}

export function submissionFileName(fingerprint) {
  const cleanFingerprint = cleanText(fingerprint, 64).toLowerCase();
  return /^[a-f0-9]{64}$/.test(cleanFingerprint)
    ? `${SUBMISSION_PREFIX}${cleanFingerprint}.json`
    : '';
}

function submissionId(fingerprint) {
  return `sub_${fingerprint.slice(0, 24)}`;
}

function normaliseStoredDraft(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const playerStats = (Array.isArray(source.playerStats) ? source.playerStats : [])
    .slice(0, 5)
    .map(row => {
      const medal = cleanText(row?.medal, 20).toLowerCase();
      return {
        playerId: cleanId(row?.playerId),
        playerName: cleanText(row?.playerName, 80),
        ...normaliseHeroReference(row),
        rolePlayed: ROLES.has(row?.rolePlayed) ? row.rolePlayed : '',
        kills: nullableNumber(row?.kills, { min: 0, max: 200, integer: true }),
        deaths: nullableNumber(row?.deaths, { min: 0, max: 200, integer: true }),
        assists: nullableNumber(row?.assists, { min: 0, max: 500, integer: true }),
        inGameScore: nullableNumber(row?.inGameScore, { min: 0, max: 20 }),
        ...(source.entryMode === 'full' ? extendedStats(row) : {}),
        medal: MEDALS.has(medal) ? medal : null
      };
    });
  const durationSeconds = parseDuration(
    source.durationSeconds ?? source.durationFormatted ?? source.duration
  );
  return {
    date: cleanDate(source.date),
    ...fullDraftFields(source),
    matchType: MATCH_TYPES.has(source.matchType) ? source.matchType : '',
    result: MATCH_RESULTS.has(source.result) ? source.result : '',
    scope: playerStats.length === 5 ? 'team5' : playerStats.length === 1 ? 'individual' : playerStats.length >= 2 ? 'squad' : 'unclassified',
    trackedCount: playerStats.length,
    durationSeconds,
    durationFormatted: durationSeconds === null
      ? null
      : `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`,
    notes: cleanText(source.notes, 500),
    claimedPlayerId: cleanId(source.claimedPlayerId || source.submittedByPlayerId),
    claimedPlayerName: cleanText(source.claimedPlayerName, 80),
    playerStats
  };
}

export function normaliseSubmission(raw, filename = '') {
  const source = raw && typeof raw === 'object' ? raw : {};
  if (![1, 2].includes(source.schemaVersion)) return null;
  const fingerprint = cleanText(source.fingerprint, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) return null;
  if (filename && filename !== submissionFileName(fingerprint)) return null;
  const id = cleanId(source.id);
  if (id !== submissionId(fingerprint)) return null;
  if (!SUBMISSION_STATUSES.has(source.status) || !SUBMISSION_SOURCES.has(source.source)) return null;
  const status = source.status;
  const identity = cleanText(source.submitter?.identityHash, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(identity)) return null;
  const createdAt = asIso(source.createdAt);
  const draft = normaliseStoredDraft(source.draft);
  if (practiceFingerprint(draft) !== fingerprint) return null;
  return {
    schemaVersion: source.schemaVersion,
    id,
    fingerprint,
    status,
    source: source.source,
    idempotencyKey: cleanId(source.idempotencyKey, 120),
    submitter: {
      identityHash: identity,
      role: source.submitter?.role === 'admin' ? 'admin' : 'viewer',
      claimedPlayerId: cleanId(source.submitter?.claimedPlayerId),
      claimedPlayerName: cleanText(source.submitter?.claimedPlayerName, 80)
    },
    draft,
    quality: {
      possibleMatchIds: (Array.isArray(source.quality?.possibleMatchIds) ? source.quality.possibleMatchIds : []).map(id => cleanId(id)).filter(Boolean),
      reviewIssues: Array.isArray(source.quality?.reviewIssues)
        ? source.quality.reviewIssues.slice(0, 12).map(issue => cleanText(issue, 80)).filter(Boolean)
        : []
    },
    review: {
      correctedDraft: source.review?.correctedDraft ? normaliseStoredDraft(source.review.correctedDraft) : null,
      reason: cleanText(source.review?.reason, 400),
      reviewedAt: source.review?.reviewedAt ? asIso(source.review.reviewedAt, null) : null,
      officialMatchId: cleanId(source.review?.officialMatchId)
    },
    createdAt,
    updatedAt: asIso(source.updatedAt, createdAt)
  };
}

export function toOfficialMatch(submission, officialData = {}, now = new Date().toISOString()) {
  const normalizedSubmission = normaliseSubmission(submission);
  if (!normalizedSubmission) fail('Submission yozuvi buzilgan', 'INVALID_STORED_SUBMISSION', 500);
  const draft = normalisePracticeDraft(normalizedSubmission.review.correctedDraft || normalizedSubmission.draft, officialData, { allowArchived: true, adminAuthor: normalizedSubmission.submitter.role === 'admin' });
  const matchId = `practice_${normalizedSubmission.fingerprint.slice(0, 24)}`;
  return officialMatchFromDraft(draft, officialData, { id: matchId, sourceSubmissionId: normalizedSubmission.id, createdAt: normalizedSubmission.createdAt, updatedAt: now });
}

export function officialMatchFromDraft(draft, officialData, metadata) {
  return {
    id: metadata.id,
    date: draft.date,
    matchType: draft.matchType,
    result: draft.result,
    scope: draft.scope,
    entryMode: draft.entryMode === 'full' ? 'full' : 'practice_lite',
    dataSource: 'submission',
    sourceSubmissionId: metadata.sourceSubmissionId || null,
    verificationStatus: 'verified',
    durationSeconds: draft.durationSeconds,
    durationFormatted: draft.durationFormatted,
    teamTurtles: draft.teamTurtles ?? null,
    teamLords: draft.teamLords ?? null,
    teamTurrets: draft.teamTurrets ?? null,
    sessionLabel: draft.sessionLabel || null,
    sessionId: draft.sessionLabel ? draft.sessionLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null : null,
    notes: draft.notes,
    playerStats: draft.playerStats.map(stat => ({
      ...stat,
      ...extendedStats(stat)
    })),
    guestStats: (draft.guestStats || []).map(guest => {
      const hero = (officialData.heroes || []).find(h => [h.name, ...(h.aliases || [])].some(name => String(name).toLowerCase() === guest.heroUsed.toLowerCase()));
      return { ...guest, guestName: guest.name, heroId: hero?.id || null, heroUsed: hero?.name || guest.heroUsed, heroNameSnapshot: hero?.name || guest.heroUsed, heroResolution: hero?.id ? 'canonical' : 'legacy_name' };
    }),
    substitutes: draft.substitutes || [],
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    schemaVersion: 4
  };
}

function toPublicSubmission(submission) {
  return {
    id: submission.id,
    status: submission.status,
    source: submission.source,
    submitter: {
      role: submission.submitter.role,
      claimedPlayerId: submission.submitter.claimedPlayerId,
      claimedPlayerName: submission.submitter.claimedPlayerName
    },
    draft: submission.draft,
    quality: submission.quality,
    review: submission.review,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt
  };
}

async function readBundle({ withCatalog = false } = {}) {
  const files = await readTeamFiles();
  let officialData = normalisePayload({ players: [], matches: [], heroes: [] });
  if (files[DATA_FILE]?.content) {
    try {
      officialData = normalisePayload(JSON.parse(files[DATA_FILE].content));
    } catch {
      fail('Asosiy match bazasi formati buzilgan', 'DATA_FILE_INVALID', 500);
    }
  }
  if (withCatalog) {
    const catalog = await createRedisStore().getJSON(MLBB_KEYS.catalog);
    if (!Array.isArray(catalog?.data) || !catalog.data.length) fail('Hero katalogi vaqtincha mavjud emas. Keyinroq urinib ko‘ring.', 'HERO_CATALOG_UNAVAILABLE', 503);
    officialData.heroes = catalog.data.filter(hero => hero.availability !== 'unavailable');
  }
  const submissions = Object.entries(files)
    .filter(([filename]) => filename.startsWith(SUBMISSION_PREFIX))
    .map(([filename, file]) => {
      try {
        return normaliseSubmission(JSON.parse(file?.content || ''), filename);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  submissions.filter(item => item.status === 'pending').forEach(item => {
    item.quality.possibleMatchIds = probableMatchIds(item.review.correctedDraft || item.draft, officialData.matches);
  });
  return { files, officialData, submissions };
}

async function writeFiles(files) {
  await writeTeamFiles(files);
}

function findSubmission(bundle, id) {
  return bundle.submissions.find(item => item.id === cleanId(id)) || null;
}

function responseList(submissions) {
  const ordered = [...submissions].sort((a, b) => {
    const priority = { pending: 0, rejected: 1, approved: 2 };
    const byStatus = (priority[a.status] ?? 3) - (priority[b.status] ?? 3);
    return byStatus || Date.parse(a.createdAt) - Date.parse(b.createdAt);
  });
  const counts = ordered.reduce((result, item) => {
    result[item.status] += 1;
    result.total += 1;
    return result;
  }, { pending: 0, approved: 0, rejected: 0, total: 0 });
  return { counts, submissions: ordered.map(toPublicSubmission) };
}

async function createSubmission(req, identity) {
  const rawBody = req.body && typeof req.body === 'object' ? req.body : {};
  const encoded = JSON.stringify(rawBody);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_BODY_BYTES) fail('Submission hajmi juda katta', 'BODY_TOO_LARGE', 413);
  if (/data:image\//i.test(encoded) || rawBody.images || rawBody.image || rawBody.screenshot) {
    fail('Skrinshot saqlanmaydi. Avval AI orqali o‘qiting, keyin faqat natijani yuboring');
  }

  const bundle = await readBundle({ withCatalog: true });
  const submitterHash = identityHash(identity);
  const ownPending = bundle.submissions.filter(item => item.status === 'pending' && item.submitter.identityHash === submitterHash).length;
  const totalPending = bundle.submissions.filter(item => item.status === 'pending').length;
  if (ownPending >= MAX_PENDING_PER_IDENTITY) fail('Avval yuborilgan pending matchlar ko‘rib chiqilishini kuting', 'PENDING_LIMIT', 409);
  if (totalPending >= MAX_PENDING_TOTAL) fail('Submission navbati to‘lgan. Admin eski yozuvlarni ko‘rib chiqishi kerak', 'INBOX_FULL', 409);

  const draft = normalisePracticeDraft({ ...(rawBody.draft || {}), claimedPlayerId: rawBody.claimedPlayerId }, bundle.officialData, { adminAuthor: identity.role === 'admin' });
  const fingerprint = practiceFingerprint(draft);
  const filename = submissionFileName(fingerprint);
  const identityFingerprint = matchIdentityFingerprint(draft);
  const existingSubmission = bundle.submissions.find(item => item.fingerprint === fingerprint || (item.status !== 'rejected' && matchIdentityFingerprint(item.review.correctedDraft || item.draft) === identityFingerprint));
  const existingOfficialMatch = bundle.officialData.matches.find(match => (
    match.id === `practice_${fingerprint.slice(0, 24)}`
    || match.sourceSubmissionId === submissionId(fingerprint)
    || matchIdentityFingerprint(match) === identityFingerprint
  ));
  if (existingOfficialMatch || (existingSubmission && existingSubmission.status !== 'rejected')) {
    fail('Bu match avval yuborilgan', 'DUPLICATE_SUBMISSION', 409);
  }
  if (existingSubmission && existingSubmission.submitter.identityHash !== submitterHash) {
    fail('Bu match boshqa jamoadosh tomonidan avval yuborilgan', 'DUPLICATE_SUBMISSION', 409);
  }

  const now = new Date().toISOString();
  const record = normaliseSubmission({
    ...(existingSubmission || {}),
    schemaVersion: 2,
    id: submissionId(fingerprint),
    fingerprint,
    status: 'pending',
    source: SUBMISSION_SOURCES.has(rawBody.source) ? rawBody.source : 'manual',
    idempotencyKey: cleanId(rawBody.idempotencyKey, 120),
    submitter: {
      identityHash: submitterHash,
      role: identity.role,
      claimedPlayerId: draft.claimedPlayerId,
      claimedPlayerName: draft.claimedPlayerName
    },
    draft,
    quality: {
      possibleMatchIds: probableMatchIds(draft, bundle.officialData.matches),
      reviewIssues: Array.isArray(rawBody.reviewIssues) ? rawBody.reviewIssues : []
    },
    review: { reason: '', reviewedAt: null, officialMatchId: '' },
    createdAt: existingSubmission?.createdAt || now,
    updatedAt: now
  }, filename);
  await writeFiles({ [filename]: { content: JSON.stringify(record, null, 2) } });
  return record;
}

async function rejectSubmission(id, reason) {
  const bundle = await readBundle();
  const submission = findSubmission(bundle, id);
  if (!submission) fail('Submission topilmadi', 'SUBMISSION_NOT_FOUND', 404);
  if (submission.status === 'approved') fail('Tasdiqlangan submissionni rad etib bo‘lmaydi', 'INVALID_TRANSITION', 409);
  const reviewReason = cleanText(reason, 400);
  if (!reviewReason) fail('Rad etish sababini yozing');
  const next = {
    ...submission,
    status: 'rejected',
    review: { ...submission.review, reason: reviewReason, reviewedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString()
  };
  await writeFiles({ [submissionFileName(next.fingerprint)]: { content: JSON.stringify(next, null, 2) } });
  return next;
}

async function approveSubmission(id, attempts = 3, options = {}) {
  let latestError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const bundle = await readBundle({ withCatalog: true });
      const submission = findSubmission(bundle, id);
      if (!submission) fail('Submission topilmadi', 'SUBMISSION_NOT_FOUND', 404);
      if (submission.status === 'rejected') fail('Rad etilgan submissionni avval qayta yuborish kerak', 'INVALID_TRANSITION', 409);
      const expectedMatchId = `practice_${submission.fingerprint.slice(0, 24)}`;
      const storedMatch = bundle.officialData.matches.find(item => (
        item.id === expectedMatchId || item.sourceSubmissionId === submission.id
        || (submission.status === 'approved' && item.id === submission.review?.officialMatchId)
      ));
      if (submission.status === 'approved' && storedMatch) {
        return { submission, match: storedMatch, revision: bundle.officialData.revision };
      }
      const now = new Date().toISOString();
      const match = toOfficialMatch(submission, bundle.officialData, now);
      if (!storedMatch && !options.allowProbableDuplicate && probableMatchIds(match, bundle.officialData.matches).length) {
        fail('O‘xshash match topildi. Navbatda mavjud matchga bog‘lang yoki alohida o‘yin ekanini tasdiqlang.', 'PROBABLE_DUPLICATE', 409);
      }
      if (!storedMatch && bundle.officialData.matches.some(item => matchIdentityFingerprint(item) === matchIdentityFingerprint(match))) fail('Bu match statistikada bor', 'DUPLICATE_SUBMISSION', 409);
      const existing = storedMatch;
      const officialMatchId = existing?.id || match.id;
      const nextData = normalisePayload({
        ...bundle.officialData,
        matches: existing
          ? bundle.officialData.matches.map(item => item.id === existing.id ? { ...item, ...match, id: existing.id } : item)
          : [...bundle.officialData.matches, match],
        revision: (Number(bundle.officialData.revision) || 0) + 1,
        lastMutationId: crypto.randomUUID(),
        updatedAt: now
      });
      const approved = {
        ...submission,
        status: 'approved',
        review: { ...submission.review, reason: '', reviewedAt: now, officialMatchId },
        updatedAt: now
      };
      await writeFiles({
        [DATA_FILE]: { content: JSON.stringify(nextData, null, 2) },
        [submissionFileName(submission.fingerprint)]: { content: JSON.stringify(approved, null, 2) }
      });

      const confirmed = await readBundle();
      const confirmedSubmission = findSubmission(confirmed, id);
      const confirmedMatch = confirmed.officialData.matches.find(item => item.id === officialMatchId);
      if (confirmedSubmission?.status === 'approved'
        && confirmedMatch
        && confirmed.officialData.lastMutationId === nextData.lastMutationId) {
        return { submission: confirmedSubmission, match: confirmedMatch, revision: confirmed.officialData.revision };
      }
      latestError = new Error('Parallel o‘zgarish aniqlandi');
    } catch (error) {
      if (error?.status && error.status < 500) throw error;
      latestError = error;
    }
  }
  throw latestError || new Error('Submissionni tasdiqlab bo‘lmadi');
}

async function deleteSubmission(id) {
  const bundle = await readBundle();
  const submission = findSubmission(bundle, id);
  if (!submission) fail('Submission topilmadi', 'SUBMISSION_NOT_FOUND', 404);
  await writeFiles({ [submissionFileName(submission.fingerprint)]: null });
  return submission;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!GIST_ID) return res.status(503).json({ error: 'Submission bazasi sozlanmagan' });

    if (req.method === 'GET') {
      const identity = await requireAccess(req, res);
      if (!identity) return;
      const bundle = await readBundle();
      const visible = identity.role === 'admin'
        ? bundle.submissions
        : bundle.submissions.filter(item => item.submitter.identityHash === identityHash(identity));
      return res.status(200).json(responseList(visible));
    }

    if (req.method === 'POST') {
      const identity = await requireAccess(req, res);
      if (!identity) return;
      const rate = await security.checkAction(req, identity, 'submission', SUBMISSION_RATE_LIMIT, SUBMISSION_RATE_WINDOW_MS);
      if (rate.limited) { res.setHeader('Retry-After', String(rate.retryAfter)); return res.status(429).json({ code: 'RATE_LIMITED', error: 'Juda ko‘p submission yuborildi. Keyinroq urinib ko‘ring.' }); }
      if (req.body?.action === 'save') {
        if (!await requireAdmin(req, res)) return;
        const result = await queueMutation(async () => {
          const created = await createSubmission(req, identity);
          if (created.quality.possibleMatchIds.length) return { submission: created, reviewRequired: true };
          return approveSubmission(created.id);
        });
        return res.status(201).json({ success: true, ...result, submission: toPublicSubmission(result.submission) });
      }
      const submission = await queueMutation(() => createSubmission(req, identity));
      return res.status(201).json({ success: true, submission: toPublicSubmission(submission) });
    }

    if (req.method === 'PATCH') {
      if (!await requireAdmin(req, res)) return;
      if (Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Submission hajmi juda katta' });
      const action = cleanText(req.body?.action, 20);
      const id = cleanId(req.body?.id);
      if (!id) return res.status(400).json({ error: 'Submission ID kerak' });
      if (action === 'link_existing') {
        const result = await queueMutation(async () => {
          const bundle = await readBundle();
          const record = findSubmission(bundle, id);
          const match = bundle.officialData.matches.find(item => item.id === cleanId(req.body.matchId));
          if (!record || !match) fail('Submission yoki match topilmadi', 'MATCH_NOT_FOUND', 404);
          if (record.status === 'approved' && record.review.officialMatchId === match.id) return { submission: record, match };
          if (record.status !== 'pending' || record.updatedAt !== req.body.expectedUpdatedAt) fail('Yozuv o‘zgargan. Navbatni yangilang.', 'SUBMISSION_CONFLICT', 409);
          if (!probableMatchIds(record.review.correctedDraft || record.draft, [match]).length) fail('Bu yozuvlar o‘xshash match sifatida topilmadi');
          const now = new Date().toISOString();
          const linked = { ...record, status: 'approved', updatedAt: now, review: { ...record.review, officialMatchId: match.id, reviewedAt: now, reason: 'Mavjud matchga bog‘landi. Raqamlar avtomatik almashtirilmadi.' } };
          await writeFiles({ [submissionFileName(record.fingerprint)]: { content: JSON.stringify(linked) } });
          return { submission: linked, match };
        });
        return res.status(200).json({ success: true, match: result.match, submission: toPublicSubmission(result.submission) });
      }
      if (action === 'edit_match') {
        const result = await queueMutation(async () => {
          const bundle = await readBundle({ withCatalog: true });
          const existing = bundle.officialData.matches.find(match => match.id === id);
          if (!existing) fail('Match topilmadi', 'MATCH_NOT_FOUND', 404);
          if (existing.updatedAt !== req.body.expectedUpdatedAt) fail('Match boshqa qurilmada o‘zgargan. Yangilab qayta oching.', 'MATCH_CONFLICT', 409);
          const draft = normalisePracticeDraft(req.body.draft, bundle.officialData, { adminAuthor: true, allowArchived: true });
          const now = new Date().toISOString();
          const edited = { ...existing, ...officialMatchFromDraft(draft, bundle.officialData, { ...existing, updatedAt: now }), dataSource: existing.dataSource };
          const next = normalisePayload({ ...bundle.officialData, matches: bundle.officialData.matches.map(match => match.id === id ? edited : match), revision: bundle.officialData.revision + 1, lastMutationId: crypto.randomUUID(), updatedAt: now });
          await writeFiles({ [DATA_FILE]: { content: JSON.stringify(next) } });
          return { match: next.matches.find(match => match.id === id), revision: next.revision };
        });
        return res.status(200).json({ success: true, ...result });
      }
      if (action === 'correct_approve') {
        const result = await queueMutation(async () => {
          const bundle = await readBundle({ withCatalog: true });
          const record = findSubmission(bundle, id);
          if (!record) fail('Submission topilmadi', 'SUBMISSION_NOT_FOUND', 404);
          if (record.status !== 'pending' || record.updatedAt !== req.body.expectedUpdatedAt) fail('Yozuv o‘zgargan. Navbatni yangilang', 'SUBMISSION_CONFLICT', 409);
          const correctedDraft = normalisePracticeDraft(req.body.draft, bundle.officialData, { adminAuthor: record.submitter.role === 'admin', allowArchived: true });
          const duplicate = bundle.officialData.matches.some(match => match.sourceSubmissionId !== record.id && matchIdentityFingerprint(match) === matchIdentityFingerprint(correctedDraft));
          if (duplicate) fail('Bu match statistikada bor', 'DUPLICATE_SUBMISSION', 409);
          const updated = { ...record, review: { ...record.review, correctedDraft }, updatedAt: new Date().toISOString() };
          await writeFiles({ [submissionFileName(record.fingerprint)]: { content: JSON.stringify(updated) } });
          return approveSubmission(id);
        });
        return res.status(200).json({ success: true, ...result, submission: toPublicSubmission(result.submission) });
      }
      if (action === 'approve') {
        const result = await queueMutation(() => approveSubmission(id, 3, { allowProbableDuplicate: req.body.allowProbableDuplicate === true }));
        return res.status(200).json({
          success: true,
          submission: toPublicSubmission(result.submission),
          match: result.match,
          revision: result.revision
        });
      }
      if (action === 'reject') {
        const submission = await queueMutation(() => rejectSubmission(id, req.body?.reason));
        return res.status(200).json({ success: true, submission: toPublicSubmission(submission) });
      }
      return res.status(400).json({ error: 'Noma’lum submission amali' });
    }

    if (req.method === 'DELETE') {
      if (!await requireAdmin(req, res)) return;
      const id = cleanId(req.query?.id || req.body?.id);
      if (!id) return res.status(400).json({ error: 'Submission ID kerak' });
      const removed = await queueMutation(() => deleteSubmission(id));
      return res.status(200).json({ success: true, removedId: removed.id });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('Submission API error:', { code: error?.code || 'UNKNOWN', message: error?.message });
    return res.status(status).json({
      code: error?.code || 'SUBMISSION_ERROR',
      error: status >= 500 ? 'Submission serverida xatolik yuz berdi' : error.message
    });
  }
}
