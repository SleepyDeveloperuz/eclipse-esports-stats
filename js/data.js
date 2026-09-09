class DataStore {
  static SCHEMA_VERSION = 4;
  static MATCH_SCOPES = new Set(['team5', 'squad', 'individual', 'unclassified']);
  static MATCH_TYPES = new Set(['ranked', 'scrim', 'tournament', 'casual']);
  static MATCH_RESULTS = new Set(['win', 'loss']);
  static ROLES = new Set(['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer']);
  static MEDALS = new Set(['mvp', 'gold', 'silver', 'bronze']);
  static DATA_SOURCES = new Set(['manual', 'ocr', 'submission', 'import', 'legacy']);
  static ENTRY_MODES = new Set(['full', 'practice_lite']);
  static VERIFICATION_STATUSES = new Set(['verified', 'unverified', 'needs_review']);
  static DATA_QUALITIES = new Set(['full', 'partial', 'ocr_verified']);
  static HERO_RESOLUTIONS = new Set(['canonical', 'legacy_name', 'unresolved']);
  static MAX_MATCH_SECONDS = (120 * 60) + 59;
  static MAX_PARTICIPANTS = 5;

  constructor() {
    this.PLAYERS_KEY = 'eclipse_players';
    this.MATCHES_KEY = 'eclipse_matches';
    this.HEROES_KEY = 'eclipse_heroes';
    this.META_KEY = 'eclipse_data_meta';
    this.DEMO_MODE_KEY = 'eclipse_demo_mode';
    this.runMigrations();

    // Production starts empty. Demo data is created only after an explicit opt-in.
    if (this.isDemoModeEnabled() && this.getPlayers().length === 0 && this.getMatches().length === 0) {
      this.seedDemoData();
    }
  }

  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.warn(`Local data repaired for ${key}:`, error.message);
      return [];
    }
  }

  readMeta() {
    try {
      const value = JSON.parse(localStorage.getItem(this.META_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  scrubValue(value, depth = 0) {
    if (depth > 8) return null;
    if (typeof value === 'string') {
      return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>\"]/g, '').trim();
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean' || value === null) return value;
    if (Array.isArray(value)) return value.map(item => this.scrubValue(item, depth + 1));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key))
        .map(([key, item]) => [key, this.scrubValue(item, depth + 1)]));
    }
    return null;
  }

  cleanText(value, maxLength = 120) {
    return String(value ?? '')
      .replace(/[\u0000-\u001f\u007f<>\"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  cleanId(value) {
    const id = this.cleanText(value, 100);
    return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : '';
  }

  nullableNumber(value, { min = null, max = null, integer = false } = {}) {
    if (value === '' || value === null || typeof value === 'undefined') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (integer && !Number.isInteger(parsed)) return null;
    if (min !== null && parsed < min) return null;
    if (max !== null && parsed > max) return null;
    return parsed;
  }

  normalizeTimestamp(value, fallback) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return fallback;
    return new Date(value).toISOString();
  }

  normalizeDateOnly(value) {
    const dateUtils = typeof window !== 'undefined' ? window.EclipseDateUtils : globalThis.EclipseDateUtils;
    if (dateUtils?.formatDateOnly) return dateUtils.formatDateOnly(value);
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
    return candidate.getFullYear() === year
      && candidate.getMonth() === month - 1
      && candidate.getDate() === day
      ? `${match[1]}-${match[2]}-${match[3]}`
      : '';
  }

  parseDuration(value) {
    if (value === '' || value === null || typeof value === 'undefined') return null;
    if (typeof value === 'number') {
      return this.nullableNumber(value, { min: 1, max: DataStore.MAX_MATCH_SECONDS, integer: true });
    }

    const text = String(value).trim();
    const clock = text.match(/^(\d{1,3}):([0-5]\d)$/);
    const legacy = text.match(/^(\d{1,3})m\s([0-5]\d)s$/i);
    const hourLegacy = text.match(/^(\d{1,2})h\s([0-5]\d)m\s([0-5]\d)s$/i);
    let total = null;
    if (clock || legacy) total = (Number((clock || legacy)[1]) * 60) + Number((clock || legacy)[2]);
    if (hourLegacy) total = (Number(hourLegacy[1]) * 3600) + (Number(hourLegacy[2]) * 60) + Number(hourLegacy[3]);
    return this.nullableNumber(total, { min: 1, max: DataStore.MAX_MATCH_SECONDS, integer: true });
  }

  normalizeDuration(source) {
    const secondsProvided = source.durationSeconds !== ''
      && source.durationSeconds !== null
      && typeof source.durationSeconds !== 'undefined';
    const formattedValue = source.durationFormatted ?? source.duration;
    const formattedProvided = formattedValue !== ''
      && formattedValue !== null
      && typeof formattedValue !== 'undefined';
    const secondsFromNumber = secondsProvided ? this.parseDuration(source.durationSeconds) : null;
    const secondsFromText = formattedProvided ? this.parseDuration(formattedValue) : null;
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

  normalizePlayer(player, now = new Date().toISOString()) {
    const source = player && typeof player === 'object' ? player : {};
    const createdAt = this.normalizeTimestamp(source.createdAt, now);
    const active = source.active !== false;
    return {
      id: this.cleanId(source.id) || this.generateId(),
      name: this.cleanText(source.name, 80) || 'Nomsiz o‘yinchi',
      active,
      primaryRole: DataStore.ROLES.has(source.primaryRole) ? source.primaryRole : null,
      secondaryRole: DataStore.ROLES.has(source.secondaryRole) ? source.secondaryRole : null,
      tags: [...new Map((Array.isArray(source.tags) ? source.tags : []).map(tag => this.cleanText(tag, 24)).filter(Boolean).map(tag => [tag.toLocaleLowerCase('en-US'), tag])).values()].slice(0, 5),
      captain: source.captain === true,
      heroPool: [...new Map((Array.isArray(source.heroPool) ? source.heroPool : []).filter(entry => Number.isSafeInteger(Number(entry?.heroId)) && Number(entry.heroId) > 0 && ['comfort', 'backup', 'learning'].includes(entry.status)).map(entry => [Number(entry.heroId), { heroId: Number(entry.heroId), heroName: this.cleanText(entry.heroName, 80), status: entry.status }])).values()].slice(0, 20),
      createdAt,
      updatedAt: this.normalizeTimestamp(source.updatedAt, createdAt),
      archivedAt: active ? null : this.normalizeTimestamp(source.archivedAt, this.normalizeTimestamp(source.updatedAt, now)),
      schemaVersion: DataStore.SCHEMA_VERSION
    };
  }

  normalizePlayerStat(stat, playerById = new Map()) {
    const source = stat && typeof stat === 'object' ? stat : {};
    const playerId = this.cleanId(source.playerId) || null;
    const player = playerId ? playerById.get(playerId) : null;
    const medalValue = String(source.medal || '').toLowerCase();
    const medal = DataStore.MEDALS.has(medalValue) ? medalValue : null;
    return {
      playerId,
      playerName: this.cleanText(source.playerName || player?.name, 80) || null,
      rolePlayed: DataStore.ROLES.has(source.rolePlayed) ? source.rolePlayed : null,
      ...this.normalizeHeroReference(source),
      kills: this.nullableNumber(source.kills, { min: 0, max: 200, integer: true }),
      deaths: this.nullableNumber(source.deaths, { min: 0, max: 200, integer: true }),
      assists: this.nullableNumber(source.assists, { min: 0, max: 500, integer: true }),
      inGameScore: this.nullableNumber(source.inGameScore, { min: 0, max: 20 }),
      damageDealt: this.nullableNumber(source.damageDealt, { min: 0, max: 10_000_000, integer: true }),
      damageReceived: this.nullableNumber(source.damageReceived, { min: 0, max: 10_000_000, integer: true }),
      turretDamage: this.nullableNumber(source.turretDamage, { min: 0, max: 10_000_000, integer: true }),
      teamfightParticipation: this.nullableNumber(source.teamfightParticipation, { min: 0, max: 100, integer: true }),
      goldEarned: this.nullableNumber(source.goldEarned, { min: 0, max: 1_000_000, integer: true }),
      medal,
      savage: typeof source.savage === 'boolean' ? source.savage : null,
      maniac: typeof source.maniac === 'boolean' ? source.maniac : null
    };
  }

  normalizeHeroKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9]+/g, '');
  }

  normalizeHeroReference(source = {}) {
    const heroId = this.nullableNumber(source.heroId, { min: 1, max: 10000, integer: true });
    const heroNameSnapshot = this.cleanText(source.heroNameSnapshot || source.heroUsed, 80) || null;
    const heroUsed = this.cleanText(source.heroUsed || heroNameSnapshot, 80) || null;
    return {
      heroId,
      heroNameSnapshot: heroNameSnapshot || heroUsed,
      // Kept for the existing UI and older exports. New analytics use heroId first.
      heroUsed,
      heroResolution: heroId ? 'canonical' : heroUsed ? 'legacy_name' : 'unresolved'
    };
  }

  normalizeGuestStat(stat) {
    const source = this.normalizePlayerStat(stat);
    const guestName = this.cleanText(stat?.guestName || stat?.detectedName, 80);
    if (!guestName) return null;
    return {
      ...source,
      playerId: null,
      guestId: this.cleanId(stat?.guestId) || this.generateId(),
      guestName,
      playerName: null
    };
  }

  inferTrackedScope(rosterCount) {
    if (rosterCount >= 5) return 'team5';
    if (rosterCount >= 2) return 'squad';
    if (rosterCount === 1) return 'individual';
    return null;
  }

  normalizeScope(match, rosterCount) {
    const explicit = String(match?.scope || match?.matchScope || '').trim().toLowerCase();
    if (DataStore.MATCH_SCOPES.has(explicit)) return explicit;
    const aliases = { team: 'team5', official: 'team5', '5v5': 'team5', solo: 'individual' };
    if (aliases[explicit]) return aliases[explicit];
    // Missing legacy scope is never promoted into official team analytics.
    // The tracked-only suggestion is kept for the review UI, not applied silently.
    return 'unclassified';
  }

  inferCompleteness(playerStats, guestStats) {
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

  normalizeMatch(match, playerById = new Map(), now = new Date().toISOString()) {
    const source = match && typeof match === 'object' ? match : {};
    const rawPlayerStats = Array.isArray(source.playerStats) ? source.playerStats : [];
    const rawGuestStats = Array.isArray(source.guestStats) ? source.guestStats : [];
    const allLegacyStats = rawPlayerStats.slice(0, 20);
    const issues = [];
    if (rawPlayerStats.length + rawGuestStats.length > DataStore.MAX_PARTICIPANTS) {
      issues.push('too_many_participants');
    }
    const seenPlayerIds = new Set();
    const playerStats = [];
    allLegacyStats.filter(stat => stat && stat.playerId).forEach(stat => {
      const normalized = this.normalizePlayerStat(stat, playerById);
      if (!normalized.playerId || seenPlayerIds.has(normalized.playerId)) {
        if (normalized.playerId) issues.push('duplicate_participant');
        return;
      }
      seenPlayerIds.add(normalized.playerId);
      if (!playerById.has(normalized.playerId)) issues.push('unknown_roster_player');
      playerStats.push(normalized);
    });
    const legacyGuests = allLegacyStats
      .filter(stat => stat && !stat.playerId && (stat.guestName || stat.detectedName));
    const guestStats = [];
    const seenGuestKeys = new Set();
    [...rawGuestStats.slice(0, 20), ...legacyGuests].forEach(stat => {
      const rawGuestId = this.cleanId(stat?.guestId);
      const rawGuestName = this.cleanText(stat?.guestName || stat?.detectedName, 80).toLocaleLowerCase('uz-UZ');
      const key = rawGuestId || rawGuestName;
      if (!key || seenGuestKeys.has(key)) {
        if (key) issues.push('duplicate_participant');
        return;
      }
      const normalized = this.normalizeGuestStat(stat);
      if (!normalized) return;
      seenGuestKeys.add(key);
      guestStats.push(normalized);
    });
    const keptPlayerStats = playerStats.slice(0, DataStore.MAX_PARTICIPANTS);
    const keptGuestStats = guestStats.slice(0, Math.max(0, DataStore.MAX_PARTICIPANTS - keptPlayerStats.length));
    if (!keptPlayerStats.length && !keptGuestStats.length) issues.push('missing_participants');

    const normalizedDate = this.normalizeDateOnly(source.date);
    if (!normalizedDate) issues.push('invalid_date');
    const resultValue = String(source.result || '').trim().toLowerCase();
    const result = DataStore.MATCH_RESULTS.has(resultValue) ? resultValue : null;
    if (!result) issues.push('unknown_result');
    const matchTypeValue = String(source.matchType || '').trim().toLowerCase();
    const matchType = DataStore.MATCH_TYPES.has(matchTypeValue) ? matchTypeValue : null;
    if (!matchType) issues.push('unknown_match_type');
    const scope = this.normalizeScope(source, keptPlayerStats.length);
    const inferredTrackedScope = this.inferTrackedScope(keptPlayerStats.length);
    const scopeParticipantMismatch = scope !== 'unclassified' && scope !== inferredTrackedScope;
    if (scope === 'unclassified') issues.push('unclassified_scope');
    if (scopeParticipantMismatch) issues.push('scope_participant_mismatch');
    const duration = this.normalizeDuration(source);
    issues.push(...duration.issues);

    const completeness = this.inferCompleteness(keptPlayerStats, keptGuestStats);
    const claimedOcrVerification = source.dataQuality === 'ocr_verified' || source.ocrVerified === true;
    const sourceValue = String(source.dataSource || '').trim().toLowerCase();
    const dataSource = DataStore.DATA_SOURCES.has(sourceValue)
      ? sourceValue
      : claimedOcrVerification ? 'ocr' : Number(source.schemaVersion) >= 3 ? 'manual' : 'legacy';
    const entryMode = DataStore.ENTRY_MODES.has(source.entryMode)
      ? source.entryMode
      : dataSource === 'submission' ? 'practice_lite' : 'full';
    const uniqueIssues = [...new Set(issues)];
    const needsReview = uniqueIssues.length > 0;
    const requestedVerification = DataStore.VERIFICATION_STATUSES.has(source.verificationStatus)
      ? source.verificationStatus
      : claimedOcrVerification ? 'verified' : 'unverified';
    const verificationStatus = needsReview
      ? 'needs_review'
      : requestedVerification === 'needs_review'
        ? claimedOcrVerification ? 'verified' : 'unverified'
        : requestedVerification;
    const ocrVerified = dataSource === 'ocr' && verificationStatus === 'verified';
    const createdAt = this.normalizeTimestamp(source.createdAt, now);

    return {
      id: this.cleanId(source.id) || this.generateId(),
      date: normalizedDate,
      matchType,
      result,
      scope,
      suggestedScope: scope === 'unclassified' || scopeParticipantMismatch ? inferredTrackedScope : null,
      dataSource,
      entryMode,
      sourceSubmissionId: this.cleanId(source.sourceSubmissionId) || null,
      verificationStatus,
      ocrVerified,
      needsReview,
      validForAnalytics: !needsReview,
      dataIssues: uniqueIssues,
      // Compatibility for existing cards while source and completeness live in separate fields.
      dataQuality: ocrVerified ? 'ocr_verified' : completeness,
      dataCompleteness: completeness,
      durationSeconds: duration.durationSeconds,
      durationFormatted: duration.durationFormatted,
      teamTurtles: this.nullableNumber(source.teamTurtles, { min: 0, max: 10, integer: true }),
      teamLords: this.nullableNumber(source.teamLords, { min: 0, max: 10, integer: true }),
      teamTurrets: this.nullableNumber(source.teamTurrets, { min: 0, max: 9, integer: true }),
      notes: this.cleanText(source.notes, 600),
      sessionId: this.cleanId(source.sessionId || source.trainingSessionId) || null,
      sessionLabel: this.cleanText(source.sessionLabel, 120) || null,
      playerStats: keptPlayerStats,
      guestStats: keptGuestStats,
      substitutes: Array.isArray(source.substitutes)
        ? [...new Set(source.substitutes.map(id => this.cleanId(id)).filter(Boolean))]
          .filter(id => !seenPlayerIds.has(id))
          .slice(0, 20)
        : [],
      createdAt,
      updatedAt: this.normalizeTimestamp(source.updatedAt, createdAt),
      schemaVersion: DataStore.SCHEMA_VERSION
    };
  }

  runMigrations() {
    const now = new Date().toISOString();
    const rawPlayers = this.readArray(this.PLAYERS_KEY);
    const seenPlayerIds = new Set();
    const players = rawPlayers.slice(0, 50)
      .map(player => this.normalizePlayer(player, now))
      .filter(player => {
        if (seenPlayerIds.has(player.id)) return false;
        seenPlayerIds.add(player.id);
        return true;
      });
    const playerById = new Map(players.map(player => [player.id, player]));
    const rawMatches = this.readArray(this.MATCHES_KEY);
    const seenMatchIds = new Set();
    const matches = rawMatches.slice(0, 2500)
      .map(match => this.normalizeMatch(match, playerById, now))
      .filter(match => {
        if (seenMatchIds.has(match.id)) return false;
        seenMatchIds.add(match.id);
        return true;
      });
    const previousVersion = Number(this.readMeta().schemaVersion || 0);
    const needsSave = previousVersion !== DataStore.SCHEMA_VERSION
      || JSON.stringify(rawPlayers) !== JSON.stringify(players)
      || JSON.stringify(rawMatches) !== JSON.stringify(matches);

    if (needsSave) {
      localStorage.setItem(this.PLAYERS_KEY, JSON.stringify(this.scrubValue(players)));
      localStorage.setItem(this.MATCHES_KEY, JSON.stringify(this.scrubValue(matches)));
      localStorage.setItem(this.META_KEY, JSON.stringify({ schemaVersion: DataStore.SCHEMA_VERSION, migratedAt: now }));
    }
  }

  isDemoModeEnabled() {
    return localStorage.getItem(this.DEMO_MODE_KEY) === 'true'
      || (typeof window !== 'undefined' && window.ECLIPSE_DEMO_MODE === true);
  }

  enableDemoMode() {
    localStorage.setItem(this.DEMO_MODE_KEY, 'true');
    if (this.getPlayers().length === 0 && this.getMatches().length === 0) this.seedDemoData();
  }

  disableDemoMode() {
    localStorage.removeItem(this.DEMO_MODE_KEY);
  }

  seedDemoData() {
    const now = new Date().toISOString();
    const players = ['Demo Jungler', 'Demo EXP', 'Demo Mid', 'Demo Gold', 'Demo Roamer']
      .map(name => this.normalizePlayer({ id: this.generateId(), name, active: true, createdAt: now }, now));
    this.savePlayers(players);
    localStorage.setItem(this.META_KEY, JSON.stringify({
      schemaVersion: DataStore.SCHEMA_VERSION,
      demoMode: true,
      migratedAt: now
    }));
  }

  // --- PLAYERS ---
  getPlayers() {
    return this.readArray(this.PLAYERS_KEY);
  }

  getAllPlayers() {
    return this.getPlayers();
  }

  getActivePlayers() {
    return this.getPlayers().filter(player => player.active !== false);
  }

  getArchivedPlayers() {
    return this.getPlayers().filter(player => player.active === false);
  }

  savePlayers(players) {
    if (Array.isArray(players) && players.length > 50) throw new Error('50 o‘yinchi chegarasi. Roster qisqartirilmadi.');
    const now = new Date().toISOString();
    const seen = new Set();
    const normalized = (Array.isArray(players) ? players : [])
      .map(player => this.normalizePlayer(player, now))
      .filter(player => {
        if (seen.has(player.id)) return false;
        seen.add(player.id);
        return true;
      });
    localStorage.setItem(this.PLAYERS_KEY, JSON.stringify(this.scrubValue(normalized)));
  }

  addPlayer(name, profile = {}) {
    const players = this.getPlayers();
    const now = new Date().toISOString();
    const newPlayer = this.normalizePlayer({
      ...profile,
      id: this.generateId(),
      name,
      active: true,
      createdAt: now,
      updatedAt: now
    }, now);
    players.push(newPlayer);
    this.savePlayers(players);
    return newPlayer;
  }

  updatePlayer(id, nameOrPatch) {
    const players = this.getPlayers();
    const index = players.findIndex(player => player.id === id);
    if (index === -1) return null;
    const patch = typeof nameOrPatch === 'string' ? { name: nameOrPatch } : (nameOrPatch || {});
    players[index] = this.normalizePlayer({
      ...players[index],
      ...patch,
      id,
      updatedAt: new Date().toISOString()
    });
    this.savePlayers(players);
    return players[index];
  }

  setPlayerActive(id, active) {
    const now = new Date().toISOString();
    return this.updatePlayer(id, {
      active: active === true,
      archivedAt: active === true ? null : now,
      updatedAt: now
    });
  }

  archivePlayer(id) {
    return this.setPlayerActive(id, false);
  }

  restorePlayer(id) {
    return this.setPlayerActive(id, true);
  }

  // Backward-compatible UI contract: deletion now means recoverable archive.
  deletePlayer(id) {
    return this.archivePlayer(id);
  }

  // --- MATCHES ---
  getMatches() {
    return this.readArray(this.MATCHES_KEY);
  }

  resolveHeroReferences(catalog = []) {
    const byId = new Map();
    const byKey = new Map();
    (Array.isArray(catalog) ? catalog : []).forEach(hero => {
      const id = this.nullableNumber(hero?.id, { min: 1, max: 10000, integer: true });
      const name = this.cleanText(hero?.name, 80);
      if (!id || !name) return;
      const reference = { id, name };
      byId.set(id, reference);
      [name, ...(Array.isArray(hero?.aliases) ? hero.aliases : [])].forEach(alias => {
        const key = this.normalizeHeroKey(alias);
        if (key && !byKey.has(key)) byKey.set(key, reference);
      });
    });
    if (!byId.size) return 0;

    let changed = 0;
    const resolveStat = stat => {
      const currentId = this.nullableNumber(stat?.heroId, { min: 1, max: 10000, integer: true });
      const currentName = this.cleanText(stat?.heroNameSnapshot || stat?.heroUsed, 80);
      const reference = (currentId && byId.get(currentId)) || byKey.get(this.normalizeHeroKey(currentName));
      if (!reference) return stat;
      const next = {
        ...stat,
        heroId: reference.id,
        heroNameSnapshot: reference.name,
        heroUsed: reference.name,
        heroResolution: 'canonical'
      };
      if (stat?.heroId !== next.heroId
        || stat?.heroNameSnapshot !== next.heroNameSnapshot
        || stat?.heroUsed !== next.heroUsed
        || stat?.heroResolution !== next.heroResolution) changed += 1;
      return next;
    };

    const matches = this.getMatches().map(match => ({
      ...match,
      playerStats: (Array.isArray(match?.playerStats) ? match.playerStats : []).map(resolveStat),
      guestStats: (Array.isArray(match?.guestStats) ? match.guestStats : []).map(resolveStat)
    }));
    if (changed) this.saveMatches(matches);
    return changed;
  }

  saveMatches(matches) {
    if (Array.isArray(matches) && matches.length > 2500) throw new Error('2500 match chegarasi. Yozuvlar o‘chirilmadi; avval backup va arxivlash kerak.');
    const playerById = new Map(this.getPlayers().map(player => [player.id, player]));
    const now = new Date().toISOString();
    const seen = new Set();
    const normalized = (Array.isArray(matches) ? matches : [])
      .map(match => this.normalizeMatch(match, playerById, now))
      .filter(match => {
        if (seen.has(match.id)) return false;
        seen.add(match.id);
        return true;
      });
    localStorage.setItem(this.MATCHES_KEY, JSON.stringify(this.scrubValue(normalized)));
  }

  addMatch(matchObj) {
    const matches = this.getMatches();
    const now = new Date().toISOString();
    const playerById = new Map(this.getPlayers().map(player => [player.id, player]));
    const normalized = this.normalizeMatch({
      ...matchObj,
      id: this.generateId(),
      dataSource: matchObj.dataSource || (matchObj.dataQuality === 'ocr_verified' ? 'ocr' : 'manual'),
      createdAt: matchObj.createdAt || now,
      updatedAt: now
    }, playerById, now);
    matches.push(normalized);
    this.saveMatches(matches);
    return normalized;
  }

  updateMatch(id, matchObj) {
    const matches = this.getMatches();
    const index = matches.findIndex(match => match.id === id);
    if (index === -1) return null;
    const existing = matches[index];
    const now = new Date().toISOString();
    const playerById = new Map(this.getPlayers().map(player => [player.id, player]));
    const normalized = this.normalizeMatch({
      ...existing,
      ...matchObj,
      id,
      createdAt: existing.createdAt || matchObj.createdAt || now,
      updatedAt: now
    }, playerById, now);
    matches[index] = normalized;
    this.saveMatches(matches);
    return normalized;
  }

  deleteMatch(id) {
    this.saveMatches(this.getMatches().filter(match => match.id !== id));
  }

  // Date-only comparisons avoid UTC/local day shifts.
  getMatchesByDateRange(startDate, endDate) {
    const dateUtils = typeof window !== 'undefined' ? window.EclipseDateUtils : globalThis.EclipseDateUtils;
    const start = dateUtils?.formatDateOnly(startDate) || String(startDate || '').slice(0, 10);
    const end = dateUtils?.formatDateOnly(endDate) || String(endDate || '').slice(0, 10);
    if (!start || !end) return [];
    return this.getMatches().filter(match => match.date >= start && match.date <= end);
  }

  getMatchesForWeek(dateString) {
    const dateUtils = typeof window !== 'undefined' ? window.EclipseDateUtils : globalThis.EclipseDateUtils;
    const range = dateUtils?.weekRange(dateString);
    if (!range) return [];
    return this.getMatchesByDateRange(range.start, range.end);
  }

  getMatchesForMonth(year, month) {
    const pad = value => String(value).padStart(2, '0');
    const lastDay = new Date(Number(year), Number(month), 0, 12).getDate();
    return this.getMatchesByDateRange(`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(lastDay)}`);
  }

  getMatchesForYear(year) {
    return this.getMatchesByDateRange(`${year}-01-01`, `${year}-12-31`);
  }

  // --- DATA MANAGEMENT ---
  exportData() {
    return JSON.stringify({
      schemaVersion: DataStore.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      players: this.getPlayers(),
      matches: this.getMatches(),
      heroes: localStorage.getItem(this.HEROES_KEY)
        ? JSON.parse(localStorage.getItem(this.HEROES_KEY))
        : []
    }, null, 2);
  }

  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.format || data.state
        || !Array.isArray(data.players) || !Array.isArray(data.matches)) return false;
      if (data.players.length > 50 || data.matches.length > 2500 || (Array.isArray(data.heroes) && data.heroes.length > 300)) return false;
      if (Array.isArray(data.players)) this.savePlayers(data.players);
      if (Array.isArray(data.matches)) {
        this.saveMatches(data.matches.map(match => ({
          ...match,
          dataSource: match?.dataSource || (match?.dataQuality === 'ocr_verified' ? 'ocr' : 'import')
        })));
      }
      if (Array.isArray(data.heroes)) {
        localStorage.setItem(this.HEROES_KEY, JSON.stringify(this.scrubValue(data.heroes.slice(0, 300))));
      }
      this.runMigrations();
      return true;
    } catch (error) {
      console.error('Import failed', error);
      return false;
    }
  }

  clearAll() {
    localStorage.removeItem(this.PLAYERS_KEY);
    localStorage.removeItem(this.MATCHES_KEY);
    localStorage.removeItem(this.HEROES_KEY);
    localStorage.removeItem('eclipse_removed_heroes');
    localStorage.removeItem(this.META_KEY);
    localStorage.removeItem(this.DEMO_MODE_KEY);
    localStorage.removeItem('eclipse_has_initialized');
    localStorage.removeItem('eclipse_last_backup');
    localStorage.removeItem('mlbb-jamoa-dasturi-progress');
    localStorage.removeItem('eclipse_cloud_pending_write');
  }
}

if (typeof window !== 'undefined') window.DataStore = DataStore;
if (typeof module !== 'undefined' && module.exports) module.exports = DataStore;
