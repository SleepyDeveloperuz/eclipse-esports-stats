import { applyVerifiedHeroMatches, mergeRosterScanStats } from '../lib/ocr-evidence.js';
import { buildMedalDetail } from '../lib/ocr-details.js';
import crypto from 'crypto';
import { isProgressRequest, progressRequest } from '../lib/progress-api.js';
import { QUALITY_FILE, qualityEvent, readQuality, recordQuality } from '../lib/scan-quality.js';
import { cleanBattleId } from '../js/batch-model.js';
import { cleanText, cleanId, cleanDate, parseDuration, escapeHtml } from '../lib/utils.js';
import { createSessionSecurity } from '../lib/session-security.js';
import { telegramSecretMatches } from '../lib/telegram-security.js';
import { readTeamFiles, writeTeamFiles, withTeamTransaction, isTursoConfigured } from '../lib/team-store.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import {
  getValidAccessIdentity,
  isAuthConfigured,
  isViewerAuthConfigured,
  isViewerGateRequested,
  verifySession
} from './auth.js';
import { normalisePayload } from './sync.js';
import { normaliseAwardEvidence } from '../lib/match-awards.js';
import { configuredOcrModels, ocrProviderFailure, OCR_PROVIDER_DEADLINE_MS } from '../lib/ocr-provider.js';
import { buildOcrRequest, normaliseOcrPayload } from './ocr.js';
import { extractWithRecheck } from '../lib/ocr-recheck.js';
import { rosterAliases } from '../lib/roster-matcher.js';
import { matchScreenshotHeroes } from '../lib/server-hero-matcher.js';
import {
  notifySubmissionCreated,
  isTelegramConfigured,
  getWebhookSecret,
  getDefaultChatId,
  sendTelegramMessage,
  formatDailyScrimSummary,
  handleTelegramWebhook
} from '../lib/telegram-bot.js';

const GIST_ID = process.env.GIST_ID;
const SESSION_SECRET = process.env.SESSION_SECRET;
const DATA_FILE = 'eclipse_data.json';
const SUBMISSION_PREFIX = 'eclipse_submission_';
const SUBMISSION_STATUSES = new Set(['pending', 'approved', 'rejected']);
const SUBMISSION_SOURCES = new Set(['manual', 'ocr']);
const MATCH_TYPES = new Set(['ranked', 'scrim', 'tournament', 'casual']);
const MATCH_RESULTS = new Set(['win', 'loss']);
const ROLES = new Set(['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer']);
const MEDALS = new Set(['mvp', 'supreme_mvp', 'supreme', 'gold', 'silver', 'bronze']);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_PENDING_PER_IDENTITY = 10;
const MAX_PENDING_TOTAL = 100;
const SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1000;
const SUBMISSION_RATE_LIMIT = 20;
const security = createSessionSecurity();
let mutationQueue = Promise.resolve();

function nullableNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = typeof value === 'string' ? value.replace(/[,%\s]/g, '').trim() : '';
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

const EXTENDED_METRICS = { damageDealt: 10000000, damageReceived: 10000000, turretDamage: 10000000, goldEarned: 1000000, teamfightParticipation: 100 };
function extendedStats(row = {}, strict = false) {
  const output = {};
  for (const [field, max] of Object.entries(EXTENDED_METRICS)) {
    output[field] = nullableNumber(row[field], { max, integer: true });
    if (strict && row[field] !== null && row[field] !== undefined && row[field] !== '' && output[field] === null) fail(`${field}: raqam noto‘g‘ri`);
  }
  output.savage = typeof row.savage === 'boolean' ? row.savage : null;
  output.maniac = typeof row.maniac === 'boolean' ? row.maniac : null;
  if (output.savage === true) output.maniac = true;
  return { ...output, ...normaliseAwardEvidence(row) };
}

function scoreboardTotals(source) {
  const totals = {};
  for (const field of ['teamKills', 'enemyKills']) {
    const value = nullableNumber(source[field], { max: 1000, integer: true });
    if (value !== null) totals[field] = value;
  }
  return totals;
}

function identityReviewRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 4).map(row => ({
    sourceRow: nullableNumber(row?.sourceRow, { min: 1, max: 5, integer: true }),
    detectedName: cleanText(row?.detectedName, 80),
    ...normaliseHeroReference(row),
    rolePlayed: ROLES.has(row?.rolePlayed) ? row.rolePlayed : '',
    roleSource: ROLES.has(row?.rolePlayed) ? 'ocr' : 'unknown',
    kills: nullableNumber(row?.kills, { max: 200, integer: true }),
    deaths: nullableNumber(row?.deaths, { max: 200, integer: true }),
    assists: nullableNumber(row?.assists, { max: 500, integer: true }),
    inGameScore: nullableNumber(row?.inGameScore, { max: 20 }),
    medal: MEDALS.has(row?.medal) ? row.medal : null,
    ...extendedStats(row || {})
  })).filter(row => row.sourceRow && row.detectedName);
}

function fullDraftFields(source, strict = false) {
  if (source.entryMode !== 'full') return {};
  const result = { entryMode: 'full', sessionLabel: cleanText(source.sessionLabel, 80),
    substitutes: [...new Set((Array.isArray(source.substitutes) ? source.substitutes : []).map(id => cleanId(id)).filter(Boolean))],
    guestStats: (Array.isArray(source.guestStats) ? source.guestStats : []).map((row, index) => ({
      guestId: cleanId(row.guestId) || `guest_${index + 1}`, name: cleanText(row.name, 80),
      heroUsed: cleanText(row.heroUsed, 80), rolePlayed: ROLES.has(row.rolePlayed) ? row.rolePlayed : '',
      roleSource: ROLES.has(row.rolePlayed) ? (['manual', 'ocr', 'inferred', 'legacy', 'roster'].includes(row.roleSource) ? row.roleSource : 'legacy') : 'unknown',
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

export function queueMutation(callback) {
  const execute = () => withTeamTransaction(callback);
  const run = mutationQueue.then(execute, execute);
  mutationQueue = run.catch(() => undefined);
  return run;
}

function bearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function identityHash(identity, secret = SESSION_SECRET) {
  if (!identity) return '';
  const secretKey = secret || process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.TELEGRAM_BOT_TOKEN || 'eclipse-session-secret-salt-32b';
  const subject = identity.role === 'viewer' ? `viewer:${identity.voterId}` : `admin:${identity.user || 'admin'}`;
  return crypto.createHmac('sha256', secretKey).update(subject).digest('hex');
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
    if (!heroReference && (!options.allowUnresolvedHero || heroCandidate)) fail(`${rosterPlayer.name}: qahramon bazada topilmadi`);
    const rolePlayed = ROLES.has(row?.rolePlayed) ? row.rolePlayed : '';
    if (row?.rolePlayed && !rolePlayed) fail(`${rosterPlayer.name}: rol noto‘g‘ri`);
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
      ...normaliseHeroReference(heroReference ? { heroId: heroReference.id, heroUsed: heroReference.name } : {}),
      rolePlayed,
      roleSource: rolePlayed ? (['manual', 'ocr', 'inferred', 'legacy', 'roster'].includes(row?.roleSource) ? row.roleSource : 'legacy') : 'unknown',
      kills,
      deaths,
      assists,
      inGameScore,
      ...(source.entryMode === 'full' ? extendedStats(row, true)
        : options.allowUnresolvedHero && row.goldEarned != null ? { goldEarned: extendedStats(row, true).goldEarned } : {}),
      medal: MEDALS.has(medalValue) ? medalValue : null
    };
  });

  const claimedPlayerId = cleanId(source.claimedPlayerId || source.submittedByPlayerId);
  const fullFields = fullDraftFields(source, true);
  if (fullFields.entryMode) {
    if (fullFields.guestStats.length + rows.length > 5) fail('Guestlar bilan birga ko‘pi bilan 5 qatnashchi bo‘lishi mumkin');
    if (new Set(fullFields.guestStats.map(guest => guest.guestId)).size !== fullFields.guestStats.length) fail('Guest ID takrorlangan');
    for (const guest of fullFields.guestStats) {
      if (!guest.name || !heroByKey.has(guest.heroUsed.toLocaleLowerCase('en-US')) || [guest.kills, guest.deaths, guest.assists].includes(null)) fail('Guest uchun ism, qahramon va K/D/A kerak');
    }
    if (fullFields.substitutes.some(id => !rosterById.has(id) || seenPlayers.has(id))) fail('Zaxira o‘yinchisi rosterda bo‘lishi va matchda qatnashmagan bo‘lishi kerak');
  }
  const adminAuthor = options.adminAuthor && claimedPlayerId === 'admin';
  if (!adminAuthor && !rosterById.has(claimedPlayerId)) fail('Kim yuborayotganini rosterdan tanlang');
  if (!adminAuthor && !seenPlayers.has(claimedPlayerId)) fail('Yuboruvchi match qatnashchilari ichida bo‘lishi kerak');
  const scope = playerStats.length === 5 ? 'team5' : playerStats.length === 1 ? 'individual' : 'squad';
  return {
    date,
    sourceBattleId: cleanBattleId(source.sourceBattleId),
    ...scoreboardTotals(source),
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
    if (cleanBattleId(draft.sourceBattleId) && draft.sourceBattleId === match.sourceBattleId) return true;
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

export function sameBattleRoster(first, second) {
  if (!cleanBattleId(first?.sourceBattleId) || first.sourceBattleId !== second?.sourceBattleId) return false;
  const ids = value => (value.playerStats || []).map(row => row.playerId).sort().join('|');
  return ids(first) === ids(second);
}

export function isSameMatchCandidate(first, second) {
  if (!first || !second) return false;
  if (cleanBattleId(first.sourceBattleId) && cleanBattleId(second.sourceBattleId)) {
    return first.sourceBattleId === second.sourceBattleId;
  }
  if (first.date && second.date && first.date !== second.date) return false;
  if (first.result && second.result && first.result !== second.result) return false;
  if (Number.isInteger(first.durationSeconds) && Number.isInteger(second.durationSeconds)) {
    if (Math.abs(first.durationSeconds - second.durationSeconds) > 45) return false;
  }
  const playersA = (first.playerStats || []).map(p => p.playerId).filter(Boolean);
  const playersB = (second.playerStats || []).map(p => p.playerId).filter(Boolean);
  if (!playersA.length || !playersB.length) return false;
  const setA = new Set(playersA);
  const common = playersB.filter(id => setA.has(id));
  return common.length >= 1 && (common.length === playersA.length || common.length === playersB.length);
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
        roleSource: ROLES.has(row?.rolePlayed) ? (['manual', 'ocr', 'inferred', 'legacy', 'roster'].includes(row?.roleSource) ? row.roleSource : 'legacy') : 'unknown',
        kills: nullableNumber(row?.kills, { min: 0, max: 200, integer: true }),
        deaths: nullableNumber(row?.deaths, { min: 0, max: 200, integer: true }),
        assists: nullableNumber(row?.assists, { min: 0, max: 500, integer: true }),
        inGameScore: nullableNumber(row?.inGameScore, { min: 0, max: 20 }),
        ...(source.entryMode === 'full' ? extendedStats(row)
          : row.goldEarned != null ? { goldEarned: extendedStats(row).goldEarned } : {}),
        medal: MEDALS.has(medal) ? medal : null
      };
    });
  const durationSeconds = parseDuration(
    source.durationSeconds ?? source.durationFormatted ?? source.duration
  );
  return {
    date: cleanDate(source.date),
    sourceBattleId: cleanBattleId(source.sourceBattleId),
    ...scoreboardTotals(source),
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
  const reviewRows = identityReviewRows(source.quality?.identityReviewRows);
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
      ...(reviewRows.length ? { identityReviewRows: reviewRows } : {}),
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
  if (normalizedSubmission.quality.identityReviewRows?.length) {
    fail('Noaniq o‘yinchini saytda tanlab, matchni tuzatib tasdiqlang.', 'SUBMISSION_IDENTITY_REVIEW', 409);
  }
  const draft = normalisePracticeDraft(normalizedSubmission.review.correctedDraft || normalizedSubmission.draft, officialData, { allowArchived: true, adminAuthor: normalizedSubmission.submitter.role === 'admin' });
  const matchId = `practice_${normalizedSubmission.fingerprint.slice(0, 24)}`;
  return officialMatchFromDraft(draft, officialData, { id: matchId, sourceSubmissionId: normalizedSubmission.id, createdAt: normalizedSubmission.createdAt, updatedAt: now });
}

export function officialMatchFromDraft(draft, officialData, metadata) {
  return {
    id: metadata.id,
    date: draft.date,
    sourceBattleId: cleanBattleId(draft.sourceBattleId) || cleanBattleId(metadata.sourceBattleId),
    ...scoreboardTotals({ ...metadata, ...draft }),
    matchType: draft.matchType,
    result: draft.result,
    scope: draft.scope,
    entryMode: draft.entryMode === 'full' ? 'full' : 'practice_lite',
    dataSource: 'submission',
    sourceSubmissionId: metadata.sourceSubmissionId || null,
    verificationStatus: 'verified',
    durationSeconds: draft.durationSeconds,
    durationFormatted: draft.durationFormatted,
    teamTurtles: metadata.teamTurtles ?? draft.teamTurtles ?? null,
    teamLords: metadata.teamLords ?? draft.teamLords ?? null,
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

export async function readBundle({ withCatalog = false } = {}) {
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
  await withTeamTransaction(() => writeTeamFiles(files));
}

function findSubmission(bundle, id) {
  return bundle.submissions.find(item => item.id === cleanId(id)) || null;
}

function responseList(submissions, statusFilter = null) {
  const counts = submissions.reduce((result, item) => {
    result[item.status] = (result[item.status] || 0) + 1;
    result.total += 1;
    return result;
  }, { pending: 0, approved: 0, rejected: 0, total: 0 });
  const filtered = statusFilter ? submissions.filter(item => item.status === statusFilter) : submissions;
  const ordered = [...filtered].sort((a, b) => {
    const priority = { pending: 0, rejected: 1, approved: 2 };
    const byStatus = (priority[a.status] ?? 3) - (priority[b.status] ?? 3);
    return byStatus || Date.parse(a.createdAt) - Date.parse(b.createdAt);
  });
  return { counts, submissions: ordered.map(toPublicSubmission) };
}

export async function createSubmission(req, identity, { allowUnresolvedHero = false, unresolvedRows = [] } = {}) {
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

  const draft = normalisePracticeDraft({ ...(rawBody.draft || {}), claimedPlayerId: rawBody.claimedPlayerId }, bundle.officialData, { adminAuthor: identity.role === 'admin', allowUnresolvedHero });
  const fingerprint = practiceFingerprint(draft);
  const filename = submissionFileName(fingerprint);
  const identityFingerprint = matchIdentityFingerprint(draft);
  const existingSubmission = bundle.submissions.find(item => item.fingerprint === fingerprint || (item.status !== 'rejected' && (matchIdentityFingerprint(item.review.correctedDraft || item.draft) === identityFingerprint || sameBattleRoster(draft, item.review.correctedDraft || item.draft))));
  const existingOfficialMatch = bundle.officialData.matches.find(match => (
    match.id === `practice_${fingerprint.slice(0, 24)}`
    || match.sourceSubmissionId === submissionId(fingerprint)
    || matchIdentityFingerprint(match) === identityFingerprint
    || sameBattleRoster(draft, match)
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
      identityReviewRows: unresolvedRows,
      possibleMatchIds: probableMatchIds(draft, bundle.officialData.matches),
      reviewIssues: Array.isArray(rawBody.reviewIssues) ? rawBody.reviewIssues : []
    },
    review: { reason: '', reviewedAt: null, officialMatchId: '' },
    createdAt: existingSubmission?.createdAt || now,
    updatedAt: now
  }, filename);
  const additions = { [filename]: { content: JSON.stringify(record, null, 2) } };
  if (rawBody.source === 'ocr' && rawBody.scanQuality) {
    try {
      const files = await readTeamFiles(), ledger = readQuality(files);
      const next = recordQuality(ledger, rawBody.scanQuality, submitterHash, { submitted: true });
      if (next !== ledger) additions[QUALITY_FILE] = { content: JSON.stringify(next) };
    } catch (_) { /* Optional telemetry must not block a valid match. */ }
  }
  await writeFiles(additions);
  return record;
}

export async function rejectSubmission(id, reason) {
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

export async function approveSubmission(id, attempts = 3, options = {}) {
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

      // Bounded retention: Keep all pending submissions, but prune old approved submissions beyond 50 entries
      // to prevent exceeding Redis/database storage size limits (5.9 MB)
      const approvedSubmissions = bundle.submissions
        .filter(s => s.status === 'approved' && s.id !== submission.id)
        .sort((a, b) => (Date.parse(a.updatedAt || a.createdAt) || 0) - (Date.parse(b.updatedAt || b.createdAt) || 0));

      const prunedDeletions = {};
      if (approvedSubmissions.length >= 50) {
        const excess = approvedSubmissions.slice(0, approvedSubmissions.length - 49);
        for (const oldSub of excess) {
          prunedDeletions[submissionFileName(oldSub.fingerprint)] = null;
        }
      }

      await writeFiles({
        [DATA_FILE]: { content: JSON.stringify(nextData, null, 2) },
        [submissionFileName(submission.fingerprint)]: { content: JSON.stringify(approved, null, 2) },
        ...prunedDeletions
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

export async function correctSubmissionHero(id, targetName, newHeroName) {
  return queueMutation(async () => {
    const bundle = await readBundle({ withCatalog: true });
    const submission = findSubmission(bundle, id);
    if (!submission) throw new Error('Submission topilmadi');
    if (submission.status !== 'pending') throw new Error('Ushbu submission allaqachon ko‘rib chiqilgan');

    const draft = submission.review?.correctedDraft || submission.draft;
    const heroes = bundle.officialData?.heroes || [];
    const cleanHero = String(newHeroName || '').trim().toLowerCase();
    const heroRef = heroes.find(h => String(h.name).trim().toLowerCase() === cleanHero)
      || heroes.find(h => String(h.name).toLowerCase().replace(/[^a-z0-9]/g, '') === cleanHero.replace(/[^a-z0-9]/g, ''));
    const finalHeroName = heroRef ? heroRef.name : newHeroName;
    const finalHeroId = heroRef ? heroRef.id : null;

    let modified = false;
    const playerStats = (draft.playerStats || []).map(p => {
      const matchByName = targetName ? (
        String(p.playerName || '').toLowerCase().includes(String(targetName).toLowerCase()) ||
        String(p.playerId || '').toLowerCase() === String(targetName).toLowerCase() ||
        String(p.realName || '').toLowerCase().includes(String(targetName).toLowerCase())
      ) : true;

      if (matchByName && !modified) {
        modified = true;
        return {
          ...p,
          heroId: finalHeroId,
          heroNameSnapshot: finalHeroName,
          heroUsed: finalHeroName,
          heroResolution: finalHeroId ? 'canonical' : 'legacy_name'
        };
      }
      return p;
    });

    const now = new Date().toISOString();
    const updated = {
      ...submission,
      review: {
        ...submission.review,
        correctedDraft: {
          ...draft,
          playerStats
        }
      },
      updatedAt: now
    };

    await writeFiles({
      [submissionFileName(submission.fingerprint)]: { content: JSON.stringify(updated, null, 2) }
    });

    return updated;
  });
}

export async function upgradePendingSubmission(submissionIdOrFingerprint, fullDraft, { allowUnresolvedHero = false } = {}) {
  return queueMutation(async () => {
    const bundle = await readBundle({ withCatalog: true });
    const submission = bundle.submissions.find(s =>
      s.id === submissionIdOrFingerprint ||
      s.fingerprint === submissionIdOrFingerprint
    );
    if (!submission) fail('Yangilanadigan submission topilmadi', 'SUBMISSION_NOT_FOUND', 404);
    if (submission.status !== 'pending') fail('Ushbu submission allaqachon ko‘rib chiqilgan', 'ALREADY_REVIEWED', 409);

    const prevDraft = submission.review?.correctedDraft || submission.draft;
    if (!sameBattleRoster(fullDraft, prevDraft)
      || (fullDraft.result && prevDraft.result && fullDraft.result !== prevDraft.result)
      || (fullDraft.durationSeconds && prevDraft.durationSeconds && fullDraft.durationSeconds !== prevDraft.durationSeconds)) {
      fail('Qo‘shimcha rasm avvalgi matchga mos emas.', 'MISMATCHED_SCREENSHOTS', 409);
    }
    const heroes = bundle.officialData?.heroes || [];

    // Merge player stats (damage, turret, taken, gold, tf%, medals, savage, maniac, kda)
    const updatedPlayerStats = mergeRosterScanStats(prevDraft.playerStats, fullDraft.playerStats);

    const validGuests = (Array.isArray(fullDraft.guestStats) ? fullDraft.guestStats : (prevDraft.guestStats || []))
      .filter(g =>
        g.name &&
        heroes.some(h => String(h.name).trim().toLowerCase() === String(g.heroUsed).trim().toLowerCase()) &&
        Number.isInteger(g.kills) &&
        Number.isInteger(g.deaths) &&
        Number.isInteger(g.assists)
      );

    const mergedDraft = normalisePracticeDraft({
      ...prevDraft,
      sourceBattleId: cleanBattleId(fullDraft.sourceBattleId) || cleanBattleId(prevDraft.sourceBattleId),
      teamKills: Number.isInteger(fullDraft.teamKills) ? fullDraft.teamKills : prevDraft.teamKills,
      enemyKills: Number.isInteger(fullDraft.enemyKills) ? fullDraft.enemyKills : prevDraft.enemyKills,
      durationSeconds: fullDraft.durationSeconds || prevDraft.durationSeconds,
      durationFormatted: fullDraft.durationFormatted || prevDraft.durationFormatted,
      mathVerified: fullDraft.mathVerified ?? prevDraft.mathVerified,
      scope: updatedPlayerStats.length === 5 ? 'team5' : updatedPlayerStats.length === 1 ? 'individual' : 'squad',
      entryMode: 'full',
      guestStats: validGuests,
      substitutes: prevDraft.substitutes || [],
      playerStats: updatedPlayerStats
    }, bundle.officialData, { adminAuthor: true, allowArchived: true, allowUnresolvedHero });

    const now = new Date().toISOString();
    const updated = {
      ...submission,
      review: {
        ...submission.review,
        correctedDraft: mergedDraft
      },
      updatedAt: now
    };

    await writeFiles({
      [submissionFileName(submission.fingerprint)]: { content: JSON.stringify(updated, null, 2) }
    });

    return updated;
  });
}

export async function createSubmissionFromTelegramPhoto({
  fileUrl, fileUrls, caption, sender, scanDeadline = Date.now() + OCR_PROVIDER_DEADLINE_MS
}) {
  const scanStarted = Date.now();
  const photoFailure = (error, code) => fail(error, code, 422);
  const urls = Array.isArray(fileUrls) && fileUrls.length > 0 ? fileUrls : [fileUrl].filter(Boolean);
  if (!urls.length || urls.length > 2) photoFailure('Bitta match uchun 1–2 ta skrinshot yuboring.', 'TELEGRAM_IMAGE_COUNT');

  const photoBuffers = await Promise.all(urls.map(async url => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      if (Number(response.headers.get('content-length')) > 3 * 1024 * 1024) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      return bytes.length && bytes.length <= 3 * 1024 * 1024 ? bytes : null;
    } catch (error) {
      photoFailure(error?.name === 'TimeoutError'
        ? 'Telegramdan rasmni yuklash vaqti tugadi. Rasmni qayta yuboring.'
        : 'Telegramdan skrinshotni yuklab bo‘lmadi. Rasmni qayta yuboring.', 'TELEGRAM_IMAGE_DOWNLOAD');
    }
  }));
  const imageParts = photoBuffers.map(bytes => {
    if (!bytes) photoFailure('Skrinshot bo‘sh yoki 3 MB dan katta.', 'TELEGRAM_IMAGE_SIZE');
    const mimeType = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
    if (!mimeType) photoFailure('JPEG, PNG yoki WebP skrinshot yuboring.', 'TELEGRAM_IMAGE_FORMAT');
    return { inline_data: { mime_type: mimeType, data: bytes.toString('base64') } };
  });
  const downloadedAt = Date.now();

  // 2. Read bundle for roster and hero catalog
  const bundle = await readBundle({ withCatalog: true });
  const roster = (bundle.officialData?.players || []).filter(player => player.active !== false);
  const heroes = bundle.officialData?.heroes || [];
  if (!roster.length) throw new Error('Faol o‘yinchilar tarkibi topilmadi.');

  // 3. Perform OCR
  const rawApiKey = process.env.GEMINI_API_KEY || '';
  const apiKey = rawApiKey.trim().replace(/^["']|["']$/g, '').trim();
  if (!apiKey) {
    fail('AI skaneri sozlanmagan. Administratorga xabar bering.', 'OCR_PROVIDER_AUTH_ERROR', 503);
  }

  const safeRoster = roster.map(p => ({
    id: p.id,
    name: p.name,
    aliases: rosterAliases(p),
    role: p.primaryRole || p.role || ''
  }));
  const safeHeroes = heroes.map(h => ({ id: h.id, name: h.name, role: h.role || '' }));
  const ocrMode = imageParts.length > 1 ? 'full' : 'smart';

  const requestBody = buildOcrRequest({
    mode: ocrMode,
    purpose: 'practice_submission',
    roster: safeRoster,
    heroes: safeHeroes,
    imageParts, detailPart: buildMedalDetail(imageParts)
  });

  const ocrModels = configuredOcrModels(process.env.GEMINI_OCR_MODELS);
  const providerStarted = Date.now();
  const provider = await extractWithRecheck({
    apiKey, requestBody, models: ocrModels, deadlineMs: Math.max(0, scanDeadline - providerStarted),
    validate: parsed => Array.isArray(parsed?.players),
    normalize: parsed => normaliseOcrPayload(parsed, safeRoster, safeHeroes, { mode: ocrMode, imageCount: imageParts.length })
  });

  if (!provider.success) {
    const failure = ocrProviderFailure(provider.meta);
    console.warn('Telegram OCR failure', { code: failure.code,
      downloadMs: downloadedAt - scanStarted, preparationMs: providerStarted - downloadedAt,
      attempts: provider.meta.attempts.map(({ status, durationMs }) => ({ status, durationMs })) });
    fail(failure.error, failure.code, failure.status);
  }

  const ocrData = provider.data;
  if (ocrData.scanError) photoFailure('Rasmlar bir matchga tegishli emas yoki Battle ID o‘qilmadi. Mos Scoreboard va Data rasmlarini yuboring.', 'TELEGRAM_SCREENSHOT_EVIDENCE');
  const hasScoreboard = ocrData.screenshots.some(image => image.kind === 'scoreboard');
  if (hasScoreboard && Number.isInteger(ocrData.sourceImageIndex)) {
    try {
      const matches = await matchScreenshotHeroes(photoBuffers[ocrData.sourceImageIndex], { heroes: safeHeroes });
      applyVerifiedHeroMatches(ocrData, matches, safeHeroes);
    } catch { applyVerifiedHeroMatches(ocrData, [], safeHeroes); }
  }

  const rosterById = new Map(roster.map(player => [player.id, player]));
  const matchedStats = ocrData.players.filter(row => rosterById.has(row.matchedPlayerId)).map(row => ({
    ...row,
    playerId: row.matchedPlayerId,
    playerName: rosterById.get(row.matchedPlayerId).name,
    heroId: hasScoreboard ? row.heroId : null,
    heroUsed: hasScoreboard ? row.heroUsed : null,
    rolePlayed: row.rolePlayed || '',
    roleSource: row.rolePlayed ? 'ocr' : 'unknown'
  }));

  if (!matchedStats.length) {
    photoFailure('Skrinshotda Eclipse jamoasining birorta ham faol a‘zosi topilmadi. Faqat jamoa a‘zolari qatnashgan matchlarni yuboring.', 'TELEGRAM_NO_ROSTER');
  }

  // 5. Resolve match properties
  // Rule as requested: agar ai 5 team rosterni bitta matchda ko'rsa scrim deb, yo'qsa rank matchlari deb bilsin
  let matchType = matchedStats.length === 5 ? 'scrim' : 'ranked';
  const capLower = String(caption || '').toLowerCase();
  if (capLower.includes('#scrim') || capLower.includes('scrim')) matchType = 'scrim';
  else if (capLower.includes('#rank') || capLower.includes('ranked')) matchType = 'ranked';
  else if (capLower.includes('#turnir') || capLower.includes('#tour') || capLower.includes('tournament')) matchType = 'tournament';
  else if (capLower.includes('#oddiy') || capLower.includes('#casual')) matchType = 'casual';

  let result = (ocrData.result && MATCH_RESULTS.has(ocrData.result)) ? ocrData.result : null;
  if (!result) photoFailure('Match natijasi o‘qilmadi. Victory yoki Defeat ko‘rinadigan rasm yuboring.', 'TELEGRAM_MATCH_RESULT');

  let matchDate;
  try {
    matchDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  } catch (_) {
    matchDate = new Date().toISOString().slice(0, 10);
  }
  const durationSeconds = ocrData.durationSeconds;
  const durationFormatted = ocrData.durationFormatted;
  if (!durationSeconds) photoFailure('Match davomiyligi o‘qilmadi. To‘liq skrinshot yuboring.', 'TELEGRAM_MATCH_DURATION');
  const matchScope = matchedStats.length === 5 ? 'team5' : matchedStats.length === 1 ? 'individual' : 'squad';
  const hasDamageStats = matchedStats.some(stat => Number.isInteger(stat.damageDealt));
  const hasDamage = ocrData.screenshots.some(image => image.kind === 'damage');
  const entryMode = hasScoreboard && hasDamage ? 'full' : 'practice_lite';

  // 6. Create or upgrade official submission
  const simulatedDraft = {
    source: 'telegram',
    entryMode,
    guestStats: [], substitutes: [],
    scope: matchScope,
    sourceBattleId: ocrData.battleId || null,
    teamKills: ocrData.teamKills ?? null,
    enemyKills: ocrData.enemyKills ?? null,
    mathVerified: ocrData.teamKills !== null && ocrData.players.length === 5 && ocrData.players.every(p => Number.isInteger(p.kills)) && ocrData.players.filter(p => Number.isInteger(p.kills)).reduce((s, p) => s + p.kills, 0) === ocrData.teamKills,
    date: matchDate,
    matchType,
    result,
    durationSeconds,
    durationFormatted,
    notes: caption ? `Telegram: ${caption}` : `Telegram skrinshot (${matchedStats.length} kishi / ${matchScope})`,
    playerStats: matchedStats
  };

  const senderId = sender?.id ? String(sender.id) : 'telegram_bot';
  const identity = { role: 'admin', user: `tg_${senderId}` };

  if (hasDamage && hasDamageStats) {
    const latest = await readBundle();
    const pendingSub = latest.submissions.find(item => item.status === 'pending'
      && sameBattleRoster(simulatedDraft, item.review?.correctedDraft || item.draft));

    if (pendingSub && (pendingSub.review?.correctedDraft || pendingSub.draft)?.entryMode !== 'full') {
      const upgraded = await upgradePendingSubmission(pendingSub.id, simulatedDraft, { allowUnresolvedHero: true });
      return { submission: upgraded, isUpgrade: true };
    }
    if (pendingSub && !hasScoreboard) return { submission: pendingSub, isUpgrade: false };
  }

  if (!hasScoreboard) photoFailure('Bu Data skrinshoti uchun mos qoralama topilmadi. Avval Scoreboard rasmini yoki ikkala rasmni albom qilib yuboring.', 'TELEGRAM_SCOREBOARD_REQUIRED');

  const reviewIssues = [];
  if (matchedStats.some(player => !player.heroId)) reviewIssues.push('Qahramon aniqlanmadi. Tasdiqlashdan oldin qahramonni tanlang.');
  if (ocrData.players.some(player => player.identityReviewRequired)) reviewIssues.push('Bir IGN to‘liq o‘qilmadi. Roster qatorlarini skrinshotdan tekshiring.');
  const simulatedReq = { body: { source: 'ocr', claimedPlayerId: matchedStats[0].playerId, draft: simulatedDraft, reviewIssues } };
  const unresolvedRows = ocrData.players.filter(player => player.identityReviewRequired);
  const submission = await queueMutation(() => createSubmission(simulatedReq, identity, { allowUnresolvedHero: true, unresolvedRows }));
  return { submission, isUpgrade: false };
}

export async function handleTelegramRoute(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'Eclipse Telegram Bot Webhook',
      configured: isTelegramConfigured()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Faqat POST so‘rovlari qabul qilinadi' });
  }

  // Handle direct admin action: send daily scrim summary to Telegram chat
  if (req.body?.action === 'send_daily_summary') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    let authorized;
    try { authorized = await verifySession(token, 'admin'); }
    catch { return res.status(503).json({ error: 'Sessiyani tekshirib bo‘lmadi' }); }
    if (!authorized) {
      return res.status(403).json({ error: 'Faqat admin / kapitan hisobot yuborishi mumkin' });
    }
    const bundle = await readBundle();
    const matches = bundle.officialData?.matches || [];
    const text = formatDailyScrimSummary(matches, req.body.date);
    const chatId = req.body.chatId || getDefaultChatId();
    if (!chatId) {
      return res.status(400).json({ error: 'Telegram chat ID sozlanmagan' });
    }
    const sent = await sendTelegramMessage({
      chatId,
      text,
      parseMode: 'HTML'
    });
    return res.status(200).json({ ok: sent.ok, result: sent });
  }

  // Missing transport credentials disable ingestion, rather than allowing
  // unauthenticated updates to impersonate a Telegram user.
  const expectedSecret = getWebhookSecret();
  if (!isTelegramConfigured() || !expectedSecret.trim()) {
    return res.status(503).json({ code: 'TELEGRAM_WEBHOOK_NOT_CONFIGURED', error: 'Telegram webhook xavfsizligi sozlanmagan' });
  }
  if (!telegramSecretMatches(req.headers?.['x-telegram-bot-api-secret-token'], expectedSecret)) {
    return res.status(401).json({ error: 'Noto‘g‘ri webhook maxfiy kaliti' });
  }

  try {
    const update = req.body;
    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      return res.status(400).json({ error: 'Update topilmadi' });
    }

    const result = await handleTelegramWebhook(update, {
      approveSubmission: (id) => queueMutation(() => approveSubmission(id, 3, { allowProbableDuplicate: true })),
      rejectSubmission: (id, reason) => queueMutation(() => rejectSubmission(id, reason)),
      correctSubmissionHero: (id, target, hero) => correctSubmissionHero(id, target, hero),
      getSubmission: async (id) => {
        try {
          const bundle = await readBundle({ withCatalog: true });
          return findSubmission(bundle, id);
        } catch {
          return null;
        }
      },
      getMatches: async () => {
        try {
          const bundle = await readBundle();
          return bundle.officialData?.matches || [];
        } catch {
          return [];
        }
      },
      getPlayers: async () => {
        try {
          const bundle = await readBundle();
          return bundle.officialData?.players || [];
        } catch {
          return [];
        }
      },
      createSubmissionFromPhoto: createSubmissionFromTelegramPhoto
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return res.status(500).json({ error: err.message || 'Telegram xatosi' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query?.source === 'telegram' || req.query?.telegram !== undefined || req.url?.startsWith('/api/telegram')
    || req.body?.update_id || req.body?.message || req.body?.callback_query) {
    return handleTelegramRoute(req, res);
  }
  try {
    if (!isTursoConfigured() && !GIST_ID) return res.status(503).json({ error: 'Submission bazasi sozlanmagan' });

    if (isProgressRequest(req)) {
      const identity = await requireAccess(req, res);
      if (!identity) return;
      return progressRequest(req, res, identity);
    }

    if (req.method === 'GET') {
      const identity = await requireAccess(req, res);
      if (!identity) return;
      const id = req.query?.id;
      if (id !== undefined && (typeof id !== 'string' || !/^sub_[a-f0-9]{24}$/.test(id))) {
        return res.status(404).json({ code: 'SUBMISSION_NOT_FOUND', error: 'Qoralama topilmadi yoki unga kirish yopiq.' });
      }
      const bundle = await readBundle();
      const visible = identity.role === 'admin'
        ? bundle.submissions
        : bundle.submissions.filter(item => item.submitter.identityHash === identityHash(identity));
      if (id !== undefined) {
        const record = visible.find(item => item.id === id);
        if (!record) return res.status(404).json({ code: 'SUBMISSION_NOT_FOUND', error: 'Qoralama topilmadi yoki unga kirish yopiq.' });
        const roster = identity.role === 'admin' && record.status === 'pending'
          ? bundle.officialData.players.map(({ id, name, realName, primaryRole, secondaryRole, aliases, active }) => ({ id, name, realName, primaryRole, secondaryRole, aliases, active }))
          : undefined;
        return res.status(200).json({ submission: toPublicSubmission(record), ...(roster ? { roster } : {}) });
      }
      const statusFilter = req.query?.status || null;
      return res.status(200).json(responseList(visible, statusFilter));
    }

    if (req.method === 'POST') {
      const identity = await requireAccess(req, res);
      if (!identity) return;
      if (req.body?.action === 'scan_quality') {
        if (Buffer.byteLength(JSON.stringify(req.body)) > 4096) return res.status(413).json({ error: 'So‘rov juda katta.' });
        const event = qualityEvent(req.body.event);
        if (!event) return res.status(400).json({ error: 'Skan o‘lchovi noto‘g‘ri.' });
        const rate = await security.checkAction(req, identity, 'scan_quality', 60, 3600000);
        if (rate.limited) { res.setHeader('Retry-After', String(rate.retryAfter)); return res.status(429).json({ error: 'Kuzatuv chegarasi.' }); }
        await queueMutation(async () => {
          const files = await readTeamFiles(), ledger = readQuality(files);
          const next = recordQuality(ledger, event, identityHash(identity));
          if (next !== ledger) await writeFiles({ [QUALITY_FILE]: { content: JSON.stringify(next) } });
        });
        return res.status(200).json({ success: true });
      }
      const rate = await security.checkAction(req, identity, 'submission', SUBMISSION_RATE_LIMIT, SUBMISSION_RATE_WINDOW_MS);
      if (rate.limited) { res.setHeader('Retry-After', String(rate.retryAfter)); return res.status(429).json({ code: 'RATE_LIMITED', error: 'Juda ko‘p submission yuborildi. Keyinroq urinib ko‘ring.' }); }
      if (req.body?.action === 'save') {
        if (!await requireAdmin(req, res)) return;
        const result = await queueMutation(async () => {
          const created = await createSubmission({ body: { ...req.body, claimedPlayerId: 'admin' } }, identity);
          if (created.quality.possibleMatchIds.length) return { submission: created, reviewRequired: true };
          return approveSubmission(created.id);
        });
        return res.status(201).json({ success: true, ...result, submission: toPublicSubmission(result.submission) });
      }
      const submission = await queueMutation(() => createSubmission(req, identity));
      notifySubmissionCreated(submission).catch(() => {});
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
          const edited = {
            ...existing,
            ...officialMatchFromDraft(draft, bundle.officialData, { ...existing, updatedAt: now }),
            dataSource: existing.dataSource,
            // Manual changes cannot inherit an OCR certificate for the previous values.
            verificationStatus: 'unverified', ocrVerified: false, dataQuality: 'partial',
            ...(req.body.resolveReview === true ? { dataIssues: [], needsReview: false, validForAnalytics: true } : {})
          };
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
          const correctedDraft = normalisePracticeDraft({ ...req.body.draft, sourceBattleId: record.draft.sourceBattleId || req.body.draft?.sourceBattleId }, bundle.officialData, { adminAuthor: record.submitter.role === 'admin', allowArchived: true });
          const unresolvedCount = record.quality.identityReviewRows?.length || 0;
          const currentDraft = record.review.correctedDraft || record.draft;
          if (unresolvedCount && correctedDraft.playerStats.length + (correctedDraft.guestStats?.length || 0)
              < currentDraft.playerStats.length + (currentDraft.guestStats?.length || 0) + unresolvedCount) {
            fail('Noaniq qatorlarga roster o‘yinchisi yoki Guest tanlang.', 'SUBMISSION_IDENTITY_REVIEW', 409);
          }
          const duplicate = bundle.officialData.matches.some(match => match.sourceSubmissionId !== record.id && matchIdentityFingerprint(match) === matchIdentityFingerprint(correctedDraft));
          if (duplicate) fail('Bu match statistikada bor', 'DUPLICATE_SUBMISSION', 409);
          const updated = { ...record, quality: { ...record.quality, identityReviewRows: [] },
            review: { ...record.review, correctedDraft }, updatedAt: new Date().toISOString() };
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
