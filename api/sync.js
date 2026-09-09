import crypto from 'crypto';
import { readTeamFiles, writeTeamFiles, withTeamTransaction } from '../lib/team-store.js';
import {
  isAuthConfigured,
  isViewerAuthConfigured,
  isViewerGateRequested,
  verifySession
} from './auth.js';

const GIST_ID = process.env.GIST_ID;
const SCHEMA_VERSION = 4;
const MATCH_TYPES = new Set(['ranked', 'scrim', 'tournament', 'casual']);
const MATCH_RESULTS = new Set(['win', 'loss']);
const ROLES = new Set(['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer']);
const MEDALS = new Set(['mvp', 'gold', 'silver', 'bronze']);
const MATCH_SCOPES = new Set(['team5', 'squad', 'individual', 'unclassified']);
const DATA_SOURCES = new Set(['manual', 'ocr', 'submission', 'import', 'legacy']);
const ENTRY_MODES = new Set(['full', 'practice_lite']);
const VERIFICATION_STATUSES = new Set(['verified', 'unverified', 'needs_review']);
const MAX_MATCH_SECONDS = (120 * 60) + 59;
const MAX_PARTICIPANTS = 5;

function cleanText(value, maxLength = 200) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>\"]/g, '').trim().slice(0, maxLength)
    : '';
}

function cleanId(value) {
  const id = cleanText(value, 100);
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : '';
}

function cleanOptionalNumber(value, max = 10_000_000, allowDecimals = false) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max) return null;
  if (!allowDecimals && !Number.isInteger(number)) return null;
  return allowDecimals ? Number(number.toFixed(2)) : number;
}

function cleanPositiveInteger(value, max = 10000) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max ? number : null;
}

function normaliseHeroReference(stat = {}) {
  const heroId = cleanPositiveInteger(stat?.heroId);
  const heroNameSnapshot = cleanText(stat?.heroNameSnapshot || stat?.heroUsed, 80) || null;
  const heroUsed = cleanText(stat?.heroUsed || heroNameSnapshot, 80) || null;
  return {
    heroId,
    heroNameSnapshot: heroNameSnapshot || heroUsed,
    heroUsed,
    heroResolution: heroId ? 'canonical' : heroUsed ? 'legacy_name' : 'unresolved'
  };
}

function cleanDate(value) {
  const text = cleanText(value, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
    ? text
    : '';
}

function parseDuration(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= MAX_MATCH_SECONDS ? value : null;
  }
  const text = String(value).trim();
  const clock = text.match(/^(\d{1,3}):([0-5]\d)$/);
  const legacy = text.match(/^(\d{1,3})m\s([0-5]\d)s$/i);
  const hourLegacy = text.match(/^(\d{1,2})h\s([0-5]\d)m\s([0-5]\d)s$/i);
  let total = null;
  if (clock || legacy) total = (Number((clock || legacy)[1]) * 60) + Number((clock || legacy)[2]);
  if (hourLegacy) total = (Number(hourLegacy[1]) * 3600) + (Number(hourLegacy[2]) * 60) + Number(hourLegacy[3]);
  return Number.isInteger(total) && total >= 1 && total <= MAX_MATCH_SECONDS ? total : null;
}

function normaliseDuration(match) {
  const secondsProvided = match?.durationSeconds !== ''
    && match?.durationSeconds !== null
    && match?.durationSeconds !== undefined;
  const formattedValue = match?.durationFormatted ?? match?.duration;
  const formattedProvided = formattedValue !== '' && formattedValue !== null && formattedValue !== undefined;
  const secondsFromNumber = secondsProvided ? parseDuration(match.durationSeconds) : null;
  const secondsFromText = formattedProvided ? parseDuration(formattedValue) : null;
  const issues = [];
  if (secondsProvided && secondsFromNumber === null) issues.push('invalid_duration');
  if (!secondsProvided && formattedProvided && secondsFromText === null) issues.push('invalid_duration');
  if (secondsFromNumber !== null && secondsFromText !== null && secondsFromNumber !== secondsFromText) {
    issues.push('duration_conflict');
  }
  const durationSeconds = secondsFromNumber ?? secondsFromText;
  return {
    durationSeconds,
    durationFormatted: durationSeconds === null
      ? null
      : `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`,
    issues
  };
}

function cleanTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date().toISOString();
}

function optionalTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

function normalisePlayer(player) {
  const id = cleanId(player?.id);
  const name = cleanText(player?.name, 80);
  if (!id || !name) return null;
  const createdAt = cleanTimestamp(player?.createdAt);
  return {
    id,
    name,
    active: player?.active !== false,
    primaryRole: ROLES.has(player?.primaryRole) ? player.primaryRole : null,
    secondaryRole: ROLES.has(player?.secondaryRole) ? player.secondaryRole : null,
    tags: [...new Map((Array.isArray(player?.tags) ? player.tags : []).map(tag => cleanText(tag, 24)).filter(Boolean).map(tag => [tag.toLocaleLowerCase('en-US'), tag])).values()].slice(0, 5),
    captain: player?.captain === true,
    heroPool: [...new Map((Array.isArray(player?.heroPool) ? player.heroPool : []).filter(entry => Number.isSafeInteger(Number(entry?.heroId)) && Number(entry.heroId) > 0 && ['comfort', 'backup', 'learning'].includes(entry.status)).map(entry => [Number(entry.heroId), { heroId: Number(entry.heroId), heroName: cleanText(entry.heroName, 80), status: entry.status }])).values()].slice(0, 20),
    createdAt,
    updatedAt: optionalTimestamp(player?.updatedAt) || createdAt,
    archivedAt: player?.active === false
      ? optionalTimestamp(player?.archivedAt) || optionalTimestamp(player?.updatedAt) || createdAt
      : null,
    schemaVersion: SCHEMA_VERSION
  };
}

function normalisePlayerStat(stat) {
  const playerId = cleanId(stat?.playerId);
  if (!playerId) return null;
  const medalValue = String(stat?.medal || '').toLowerCase();
  const medal = MEDALS.has(medalValue) ? medalValue : null;
  return {
    playerId,
    playerName: cleanText(stat?.playerName, 80) || null,
    rolePlayed: ROLES.has(stat?.rolePlayed) ? stat.rolePlayed : null,
    ...normaliseHeroReference(stat),
    kills: cleanOptionalNumber(stat?.kills, 200),
    deaths: cleanOptionalNumber(stat?.deaths, 200),
    assists: cleanOptionalNumber(stat?.assists, 500),
    inGameScore: cleanOptionalNumber(stat?.inGameScore, 20, true),
    damageDealt: cleanOptionalNumber(stat?.damageDealt),
    damageReceived: cleanOptionalNumber(stat?.damageReceived),
    turretDamage: cleanOptionalNumber(stat?.turretDamage),
    teamfightParticipation: cleanOptionalNumber(stat?.teamfightParticipation, 100),
    goldEarned: cleanOptionalNumber(stat?.goldEarned, 1_000_000),
    medal,
    savage: typeof stat?.savage === 'boolean' ? stat.savage : null,
    maniac: typeof stat?.maniac === 'boolean' ? stat.maniac : null
  };
}

function normaliseGuestStat(stat) {
  const guestName = cleanText(stat?.guestName || stat?.detectedName, 80);
  if (!guestName) return null;
  const guestId = cleanId(stat?.guestId) || `guest_${cryptoSafeId(guestName)}`;
  const normalised = normalisePlayerStat({ ...stat, playerId: guestId });
  if (!normalised) return null;
  return {
    ...normalised,
    playerId: null,
    playerName: null,
    guestId,
    guestName
  };
}

function cryptoSafeId(value) {
  const safe = cleanText(value, 60).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${safe || 'unknown'}_${(hash >>> 0).toString(36)}`;
}

function inferTrackedScope(count) {
  if (count >= 5) return 'team5';
  if (count >= 2) return 'squad';
  if (count === 1) return 'individual';
  return null;
}

function normaliseScope(match, trackedCount) {
  const explicit = String(match?.scope || match?.matchScope || '').trim().toLowerCase();
  if (MATCH_SCOPES.has(explicit)) return explicit;
  const aliases = { team: 'team5', official: 'team5', '5v5': 'team5', solo: 'individual' };
  if (aliases[explicit]) return aliases[explicit];
  // Never infer official team scope for a legacy record. The suggestion below is
  // based only on tracked roster rows; guest slots never promote a match.
  return 'unclassified';
}

function inferCompleteness(playerStats, guestStats) {
  const participants = [...playerStats, ...guestStats];
  if (!participants.length) return 'partial';
  const requiredKeys = [
    'heroUsed', 'kills', 'deaths', 'assists', 'inGameScore',
    'damageDealt', 'damageReceived', 'turretDamage', 'teamfightParticipation', 'goldEarned'
  ];
  return participants.every(stat => requiredKeys.every(key => stat[key] !== null && stat[key] !== ''))
    ? 'full'
    : 'partial';
}

function normaliseMatch(match) {
  const id = cleanId(match?.id);
  const date = cleanDate(match?.date);
  if (!id) return null;
  const issues = [];
  if (!date) issues.push('invalid_date');

  const resultValue = String(match?.result || '').trim().toLowerCase();
  const result = MATCH_RESULTS.has(resultValue) ? resultValue : null;
  if (!result) issues.push('unknown_result');
  const matchTypeValue = String(match?.matchType || '').trim().toLowerCase();
  const matchType = MATCH_TYPES.has(matchTypeValue) ? matchTypeValue : null;
  if (!matchType) issues.push('unknown_match_type');

  const rawPlayerStats = Array.isArray(match?.playerStats) ? match.playerStats : [];
  const rawGuestStats = Array.isArray(match?.guestStats) ? match.guestStats : [];
  if (rawPlayerStats.length + rawGuestStats.length > MAX_PARTICIPANTS) issues.push('too_many_participants');
  const seenPlayerIds = new Set();
  const playerStats = [];
  rawPlayerStats.slice(0, 20).forEach(stat => {
    const normalised = normalisePlayerStat(stat);
    if (!normalised) return;
    if (seenPlayerIds.has(normalised.playerId)) {
      issues.push('duplicate_participant');
      return;
    }
    seenPlayerIds.add(normalised.playerId);
    playerStats.push(normalised);
  });

  const legacyGuests = rawPlayerStats.slice(0, 20)
    .filter(stat => stat && !stat.playerId && (stat.guestName || stat.detectedName));
  const seenGuests = new Set();
  const guestStats = [];
  [...rawGuestStats.slice(0, 20), ...legacyGuests].forEach(stat => {
    const guestName = cleanText(stat?.guestName || stat?.detectedName, 80);
    const key = cleanId(stat?.guestId) || guestName.toLocaleLowerCase('uz-UZ');
    if (!key || seenGuests.has(key)) {
      if (key) issues.push('duplicate_participant');
      return;
    }
    const normalised = normaliseGuestStat(stat);
    if (!normalised) return;
    seenGuests.add(key);
    guestStats.push(normalised);
  });

  const keptPlayerStats = playerStats.slice(0, MAX_PARTICIPANTS);
  const keptGuestStats = guestStats.slice(0, Math.max(0, MAX_PARTICIPANTS - keptPlayerStats.length));
  if (!keptPlayerStats.length && !keptGuestStats.length) issues.push('missing_participants');

  const scope = normaliseScope(match, keptPlayerStats.length);
  const inferredTrackedScope = inferTrackedScope(keptPlayerStats.length);
  const scopeParticipantMismatch = scope !== 'unclassified' && scope !== inferredTrackedScope;
  if (scope === 'unclassified') issues.push('unclassified_scope');
  if (scopeParticipantMismatch) issues.push('scope_participant_mismatch');
  const duration = normaliseDuration(match);
  issues.push(...duration.issues);
  const dataCompleteness = inferCompleteness(keptPlayerStats, keptGuestStats);
  const claimedOcrVerification = match?.dataQuality === 'ocr_verified' || match?.ocrVerified === true;
  const sourceValue = String(match?.dataSource || '').trim().toLowerCase();
  const dataSource = DATA_SOURCES.has(sourceValue)
    ? sourceValue
    : claimedOcrVerification ? 'ocr' : Number(match?.schemaVersion) >= 3 ? 'manual' : 'legacy';
  const entryMode = ENTRY_MODES.has(match?.entryMode)
    ? match.entryMode
    : dataSource === 'submission' ? 'practice_lite' : 'full';
  const uniqueIssues = [...new Set(issues)];
  const needsReview = uniqueIssues.length > 0;
  const requestedVerification = VERIFICATION_STATUSES.has(match?.verificationStatus)
    ? match.verificationStatus
    : claimedOcrVerification ? 'verified' : 'unverified';
  const verificationStatus = needsReview
    ? 'needs_review'
    : requestedVerification === 'needs_review'
      ? claimedOcrVerification ? 'verified' : 'unverified'
      : requestedVerification;
  const ocrVerified = dataSource === 'ocr' && verificationStatus === 'verified';
  const createdAt = cleanTimestamp(match?.createdAt);
  return {
    id,
    date,
    matchType,
    result,
    scope,
    suggestedScope: scope === 'unclassified' || scopeParticipantMismatch ? inferredTrackedScope : null,
    dataSource,
    entryMode,
    sourceSubmissionId: cleanId(match?.sourceSubmissionId) || null,
    verificationStatus,
    ocrVerified,
    needsReview,
    validForAnalytics: !needsReview,
    dataIssues: uniqueIssues,
    dataQuality: ocrVerified ? 'ocr_verified' : dataCompleteness,
    dataCompleteness,
    durationSeconds: duration.durationSeconds,
    durationFormatted: duration.durationFormatted,
    teamTurtles: cleanOptionalNumber(match?.teamTurtles, 10),
    teamLords: cleanOptionalNumber(match?.teamLords, 10),
    teamTurrets: cleanOptionalNumber(match?.teamTurrets, 9),
    notes: cleanText(match?.notes, 600),
    sessionId: cleanId(match?.sessionId) || null,
    sessionLabel: cleanText(match?.sessionLabel, 120) || null,
    playerStats: keptPlayerStats,
    guestStats: keptGuestStats,
    substitutes: Array.isArray(match?.substitutes)
      ? [...new Set(match.substitutes.map(cleanId).filter(Boolean))]
        .filter(playerId => !seenPlayerIds.has(playerId))
        .slice(0, 20)
      : [],
    createdAt,
    updatedAt: optionalTimestamp(match?.updatedAt) || createdAt,
    schemaVersion: SCHEMA_VERSION
  };
}

export function normalisePayload(input) {
  const source = input && typeof input === 'object' ? input : {};
  const invalidHeroes = new Set(['azuma', 'exor', 'mulan']);
  const seenHeroes = new Set();
  const heroes = Array.isArray(source.heroes) ? source.heroes.slice(0, 300).map(hero => {
    const name = cleanText(hero?.name, 80);
    const role = cleanText(hero?.role, 40);
    const key = name.toLocaleLowerCase('en-US');
    if (!name || invalidHeroes.has(key) || seenHeroes.has(key)) return null;
    seenHeroes.add(key);
    const id = cleanPositiveInteger(hero?.id);
    const roles = [...new Set((Array.isArray(hero?.roles) ? hero.roles : [role])
      .map(item => cleanText(item, 40)).filter(Boolean))].slice(0, 5);
    const aliases = [...new Set((Array.isArray(hero?.aliases) ? hero.aliases : [])
      .map(item => cleanText(item, 80)).filter(Boolean))].slice(0, 12);
    const lanes = [...new Set((Array.isArray(hero?.lanes) ? hero.lanes : [])
      .map(item => cleanText(item, 40)).filter(Boolean))].slice(0, 8);
    const image = cleanText(hero?.image, 500);
    return {
      ...(id ? { id } : {}),
      name,
      role: role || roles[0] || '',
      ...(roles.length ? { roles } : {}),
      ...(aliases.length ? { aliases } : {}),
      ...(lanes.length ? { lanes } : {}),
      ...(image.startsWith('https://') ? { image } : {})
    };
  }).filter(Boolean) : [];
  const seenPlayers = new Set();
  if (Array.isArray(source.players) && source.players.length > 50) throw new Error('50 o‘yinchi chegarasi. Roster qisqartirilmadi.');
  const players = (Array.isArray(source.players) ? source.players : [])
    .map(normalisePlayer)
    .filter(player => {
      if (!player || seenPlayers.has(player.id)) return false;
      seenPlayers.add(player.id);
      return true;
    });
  const seenMatches = new Set();
  if (Array.isArray(source.matches) && source.matches.length > 2500) {
    throw new Error('2500 match chegarasi. Hech qanday yozuv qisqartirilmadi; avval backup va arxivlash kerak.');
  }
  const matches = (Array.isArray(source.matches) ? source.matches : [])
    .map(normaliseMatch)
    .filter(match => {
      if (!match || seenMatches.has(match.id)) return false;
      seenMatches.add(match.id);
      return true;
    });
  matches.forEach(match => {
    if (match.playerStats.some(stat => !seenPlayers.has(stat.playerId))) {
      match.dataIssues = [...new Set([...match.dataIssues, 'unknown_roster_player'])];
      match.needsReview = true;
      match.validForAnalytics = false;
      match.verificationStatus = 'needs_review';
      match.ocrVerified = false;
    }
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    revision: Math.max(0, Number.isInteger(source.revision) ? source.revision : 0),
    lastMutationId: cleanId(source.lastMutationId) || null,
    players,
    matches,
    heroes,
    heroCatalogInitialized: source.heroCatalogInitialized === true,
    updatedAt: cleanTimestamp(source.updatedAt)
  };
}

function isSyncConfigured() {
  return Boolean(GIST_ID);
}

function sendConfigurationError(res, message) {
  return res.status(503).json({ error: message });
}

function bearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!isSyncConfigured()) {
      return sendConfigurationError(res, "Cloud sync sozlanmagan. Vercel Environment Variables orqali GIST_ID ni kiriting.");
    }

    // Team read can be protected with the optional VIEWER_PASSWORD gate.
    if (req.method === "GET") {
      if (isViewerGateRequested() && !isViewerAuthConfigured()) {
        return res.status(503).json({
          code: 'VIEWER_AUTH_MISCONFIGURED',
          error: 'Jamoa kirish himoyasi to‘liq sozlanmagan. SESSION_SECRET ni kiriting.'
        });
      }
      if (isViewerAuthConfigured() && !await verifySession(bearerToken(req))) {
        return res.status(401).json({
          code: 'VIEWER_AUTH_REQUIRED',
          error: 'Jamoa ma’lumotlarini ko‘rish uchun kirish talab qilinadi'
        });
      }
      const files = await readTeamFiles();
      const file = files['eclipse_data.json'];
      if (!file || !file.content) {
        return res.status(404).json({ error: "No data found" });
      }
      const data = normalisePayload(JSON.parse(file.content));
      return res.status(200).json(data);
    }

    // 2. PROTECTED WRITE: Only verified Admin with HMAC token can write/modify data!
    if (req.method === "POST") {
      if (!isAuthConfigured()) {
        return sendConfigurationError(res, "Admin xavfsizlik sozlamalari topilmadi. ADMIN_PASSWORD va SESSION_SECRET ni kiriting.");
      }

      const authHeader = req.headers.authorization || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();

      if (!await verifySession(token, 'admin')) {
        return res.status(401).json({
          error: "Ruxsat berilmadi! Ushbu amal faqat jamoa Admini (Murabbiy) uchun ruxsat etilgan."
        });
      }


      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!payload) {
        return res.status(400).json({ error: "Ma'lumot mavjud emas" });
      }

      const result = await withTeamTransaction(async () => {
      const files = await readTeamFiles();
      const currentFile = files['eclipse_data.json'];
      let currentData = normalisePayload({ players: [], matches: [], heroes: [] });
      if (currentFile?.content) {
        try {
          currentData = normalisePayload(JSON.parse(currentFile.content));
        } catch {
          throw new Error('Cloud baza formati buzilgan');
        }
      }
      const baseRevision = Number.isInteger(payload.baseRevision)
        ? payload.baseRevision
        : Number.isInteger(payload.revision) ? payload.revision : 0;
      if (baseRevision !== currentData.revision) {
        return { status: 409, body: {
          code: 'DATA_REVISION_CONFLICT',
          currentRevision: currentData.revision,
          error: 'Cloud ma’lumoti boshqa qurilmada yangilangan. Avval yangiliklar birlashtiriladi.'
        } };
      }

      const nextData = normalisePayload({
        ...payload,
        revision: currentData.revision + 1,
        lastMutationId: crypto.randomUUID(),
        updatedAt: new Date().toISOString()
      });
      const content = JSON.stringify(nextData, null, 2);
      if (Buffer.byteLength(content, 'utf8') > 1_500_000) {
        return { status: 413, body: { error: 'Ma’lumot hajmi ruxsat etilgan chegaradan oshdi' } };
      }

      await writeTeamFiles({ 'eclipse_data.json': { content } });
      return { status: 200, body: {
        success: true,
        revision: nextData.revision,
        updatedAt: nextData.updatedAt
      } };
      });
      return res.status(result.status).json(result.body);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("API Sync error:", error);
    return res.status(error.status || 500).json({ code: error.code || 'SYNC_ERROR', error: 'Cloud saqlash xizmati vaqtincha javob bermadi. Lokal o‘zgarishlarni saqlab, qayta urinib ko‘ring.' });
  }
}
