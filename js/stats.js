window.StatsEngine = class StatsEngine {
  constructor(dataStore) {
    this.db = dataStore;
  }

  static ROLES = ['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer'];

  static ROLE_ICONS = {
    'EXP Laner': 'fa-shield',
    'Jungler': 'fa-bolt',
    'Mid Laner': 'fa-wand-magic-sparkles',
    'Gold Laner': 'fa-coins',
    'Roamer': 'fa-compass'
  };

  static ROLE_COLORS = {
    'EXP Laner': '#f59e0b',
    'Jungler': '#a855f7',
    'Mid Laner': '#e7c36b',
    'Gold Laner': '#d98245',
    'Roamer': '#10b981'
  };

  static ECLIPSE_INDEX_VERSION = '1.1';

  static ECLIPSE_INDEX_FORMULA = {
    name: 'Eclipse Index',
    version: '1.1',
    baseline: 100,
    description: '100 × in-game score / shu rol va o‘yin kontekstidagi boshqa a’zolar bahosi medianasi. Kamida 2 tengdosh, 6 baho va 3 xil kun kerak. O‘z baholari baselinega kirmaydi.',
    exclusions: 'K/D/A, medal va natija qayta qo‘shilmaydi — in-game score signali ikki marta hisoblanmaydi.'
  };

  static normalizeHeroKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9]+/g, '');
  }

  static getHeroIdentity(stat = {}) {
    const rawId = Number(stat?.heroId);
    const inputName = String(stat?.heroNameSnapshot || stat?.heroUsed || '').trim();
    const heroDb = typeof window !== 'undefined' ? window.EclipseApp?.heroDb : null;
    const resolved = Number.isInteger(rawId) && rawId > 0
      ? heroDb?.findById?.(rawId)
      : heroDb?.resolve?.(inputName) || null;
    const heroId = Number.isInteger(rawId) && rawId > 0 ? rawId : Number(resolved?.id) || null;
    const heroName = resolved?.name || inputName;
    if (!heroId && !heroName) return null;
    return {
      key: heroId ? `id:${heroId}` : `name:${StatsEngine.normalizeHeroKey(heroName)}`,
      heroId,
      heroName
    };
  }

  static numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  static sumOrNull(values) {
    const valid = values.map(StatsEngine.numberOrNull).filter(value => value !== null);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) : null;
  }

  static completeSumOrNull(values) {
    if (!Array.isArray(values) || !values.length) return null;
    const normalized = values.map(StatsEngine.numberOrNull);
    return normalized.every(value => value !== null)
      ? normalized.reduce((sum, value) => sum + value, 0)
      : null;
  }

  static completeAverageOrNull(values) {
    const total = StatsEngine.completeSumOrNull(values);
    return total === null ? null : total / values.length;
  }

  static averageOrNull(values) {
    const valid = values.map(StatsEngine.numberOrNull).filter(value => value !== null);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  }

  static roundOrNull(value, digits = 2) {
    const number = StatsEngine.numberOrNull(value);
    if (number === null) return null;
    const factor = 10 ** digits;
    return Math.round((number + Number.EPSILON) * factor) / factor;
  }

  static formatLargeNumber(num) {
    const n = StatsEngine.numberOrNull(num);
    if (n === null) return '—';
    if (n >= 1000000000) return `${(n / 1000000000).toFixed(2)}B`;
    if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  }

  static formatDateFormatted(dateString) {
    if (!dateString) return '-';
    try {
      const value = String(dateString);
      const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!parts) return value;
      const year = Number(parts[1]);
      const month = Number(parts[2]);
      const day = Number(parts[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return value;
      const weekdays = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
      const months = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
      return `${weekdays[date.getUTCDay()]}, ${String(day).padStart(2, '0')}-${months[month - 1]}, ${year}`;
    } catch (error) {
      return dateString;
    }
  }

  static formatDuration(totalSeconds) {
    const secondsValue = StatsEngine.numberOrNull(totalSeconds);
    if (secondsValue === null || secondsValue <= 0) return '-';
    const total = Math.round(secondsValue);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = value => String(value).padStart(2, '0');
    return hours > 0 ? `${hours}h ${pad(minutes)}m ${pad(seconds)}s` : `${minutes}m ${pad(seconds)}s`;
  }

  static parseDurationToSeconds(durationValue) {
    const direct = StatsEngine.numberOrNull(durationValue);
    if (typeof durationValue === 'number') return direct !== null && direct > 0 ? direct : null;
    if (!durationValue) return null;
    const parts = String(durationValue).trim().split(':');
    if (parts.length === 2) {
      const minutes = Number(parts[0]);
      const seconds = Number(parts[1]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) return null;
      const total = (minutes * 60) + seconds;
      return total > 0 ? total : null;
    }
    return direct !== null && direct > 0 ? direct * 60 : null;
  }

  static normalizeRole(role) {
    const value = String(role || '').trim();
    const aliases = {
      EXP: 'EXP Laner', 'EXP Lane': 'EXP Laner',
      Jungle: 'Jungler',
      Mid: 'Mid Laner', 'Mid Lane': 'Mid Laner',
      Gold: 'Gold Laner', 'Gold Lane': 'Gold Laner',
      Roam: 'Roamer'
    };
    return StatsEngine.ROLES.includes(value) ? value : (aliases[value] || 'Unknown');
  }

  static getMatchScope(match) {
    const raw = String(match?.scope || match?.matchScope || '').trim().toLowerCase();
    const aliases = {
      team: 'team5', official: 'team5', full: 'team5', five: 'team5', '5v5': 'team5',
      partial: 'squad', scrim: 'team5', solo: 'individual'
    };
    if (['team5', 'squad', 'individual', 'unclassified'].includes(raw)) return raw;
    if (aliases[raw]) return aliases[raw];
    return 'unclassified';
  }

  static getTrackedRosterCount(match) {
    return new Set((Array.isArray(match?.playerStats) ? match.playerStats : [])
      .map(stat => String(stat?.playerId || '').trim())
      .filter(Boolean)).size;
  }

  static inferScopeFromTrackedCount(count) {
    if (count === 5) return 'team5';
    if (count >= 2 && count <= 4) return 'squad';
    if (count === 1) return 'individual';
    return null;
  }

  static isScopeParticipantConsistent(match) {
    const inferredScope = StatsEngine.inferScopeFromTrackedCount(StatsEngine.getTrackedRosterCount(match));
    return inferredScope !== null && StatsEngine.getMatchScope(match) === inferredScope;
  }

  static hasOfficialTeamContext(match) {
    const playerStats = Array.isArray(match?.playerStats) ? match.playerStats : [];
    const guestStats = Array.isArray(match?.guestStats) ? match.guestStats : [];
    return StatsEngine.getMatchScope(match) === 'team5'
      && StatsEngine.isScopeParticipantConsistent(match)
      && playerStats.length === 5
      && guestStats.length === 0;
  }

  static filterMatchesByScope(matches, scope = 'team5') {
    const list = (Array.isArray(matches) ? matches : []).filter(match =>
      match?.validForAnalytics !== false
      && match?.needsReview !== true
      && StatsEngine.isScopeParticipantConsistent(match));
    if (scope === null || scope === undefined || scope === 'all') return [...list];
    const allowed = new Set(Array.isArray(scope) ? scope : [scope]);
    return list.filter(match => allowed.has(StatsEngine.getMatchScope(match)));
  }

  static filterAnalyticsMatches(matches, mode = 'team5') {
    const eligible = (Array.isArray(matches) ? matches : []).filter(match => match?.status !== 'draft');
    if (mode === 'team5') {
      return eligible.filter(match =>
        match?.validForAnalytics !== false
        && match?.needsReview !== true
        && StatsEngine.hasOfficialTeamContext(match));
    }
    if (mode === 'squad') return StatsEngine.filterMatchesByScope(eligible, ['individual', 'squad']);
    return [];
  }

  static sortMatchesChronologically(matches) {
    return [...(Array.isArray(matches) ? matches : [])].sort((a, b) => {
      const dateOrder = String(a?.date || '').localeCompare(String(b?.date || ''));
      if (dateOrder !== 0) return dateOrder;
      const createdOrder = String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''));
      if (createdOrder !== 0) return createdOrder;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });
  }

  static parseIsoDateUtc(value) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!parts) return null;
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }

  static toIsoDateUtc(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  static addUtcDays(date, days) {
    const copy = new Date(date.getTime());
    copy.setUTCDate(copy.getUTCDate() + Number(days || 0));
    return copy;
  }

  static formatWindowLabel(from, to) {
    const short = value => {
      const parsed = StatsEngine.parseIsoDateUtc(value);
      if (!parsed) return value || '—';
      return `${String(parsed.getUTCDate()).padStart(2, '0')}.${String(parsed.getUTCMonth() + 1).padStart(2, '0')}.${parsed.getUTCFullYear()}`;
    };
    return `${short(from)} — ${short(to)}`;
  }

  /**
   * Returns two equal rolling windows anchored to the latest eligible match,
   * so an older import never pretends to describe the device's current week.
   */
  static getPeriodWindows(matches, period = 'week', options = {}) {
    const sizes = { week: 7, month: 30, year: 365 };
    const normalizedPeriod = Object.prototype.hasOwnProperty.call(sizes, period) ? period : 'week';
    const today = StatsEngine.parseIsoDateUtc(options?.today)
      || StatsEngine.parseIsoDateUtc(new Date().toISOString().slice(0, 10));
    const forcedAnchor = StatsEngine.parseIsoDateUtc(options?.anchorDate);
    const eligibleDates = (Array.isArray(matches) ? matches : [])
      .map(match => StatsEngine.parseIsoDateUtc(match?.date))
      .filter(date => date && (!today || date <= today))
      .sort((a, b) => a - b);
    const anchor = forcedAnchor || eligibleDates[eligibleDates.length - 1] || null;
    if (!anchor) return null;

    const days = sizes[normalizedPeriod];
    const currentFromDate = StatsEngine.addUtcDays(anchor, -(days - 1));
    const previousToDate = StatsEngine.addUtcDays(currentFromDate, -1);
    const previousFromDate = StatsEngine.addUtcDays(previousToDate, -(days - 1));
    const current = {
      from: StatsEngine.toIsoDateUtc(currentFromDate),
      to: StatsEngine.toIsoDateUtc(anchor)
    };
    const previous = {
      from: StatsEngine.toIsoDateUtc(previousFromDate),
      to: StatsEngine.toIsoDateUtc(previousToDate)
    };
    current.label = StatsEngine.formatWindowLabel(current.from, current.to);
    previous.label = StatsEngine.formatWindowLabel(previous.from, previous.to);
    return {
      period: normalizedPeriod,
      days,
      anchorDate: StatsEngine.toIsoDateUtc(anchor),
      current,
      previous
    };
  }

  static filterMatchesByDateWindow(matches, window) {
    if (!window?.from || !window?.to) return [];
    return StatsEngine.sortMatchesChronologically(matches).filter(match => {
      const date = StatsEngine.parseIsoDateUtc(match?.date);
      if (!date) return false;
      const iso = StatsEngine.toIsoDateUtc(date);
      return iso >= window.from && iso <= window.to;
    });
  }

  static getDatasetQuality(matches) {
    const list = Array.isArray(matches) ? matches : [];
    const requiredPlayerFields = [
      'heroUsed', 'rolePlayed', 'kills', 'deaths', 'assists', 'inGameScore',
      'damageDealt', 'damageReceived', 'turretDamage', 'teamfightParticipation', 'goldEarned'
    ];
    const rows = list.flatMap(match => Array.isArray(match?.playerStats) ? match.playerStats : []);
    const isPresent = value => value !== null && value !== undefined && value !== '';
    const completeRows = rows.filter(row => requiredPlayerFields.every(field => isPresent(row?.[field]))).length;
    const totalCells = rows.length * requiredPlayerFields.length;
    const completeCells = rows.reduce((total, row) => total + requiredPlayerFields.filter(field => isPresent(row?.[field])).length, 0);
    const verifiedMatches = list.filter(match => match?.verificationStatus === 'verified').length;
    const legacyMatches = list.filter(match => match?.dataSource === 'legacy').length;
    const fullMatches = list.filter(match => {
      const playerStats = Array.isArray(match?.playerStats) ? match.playerStats : [];
      return playerStats.length > 0 && playerStats.every(row => requiredPlayerFields.every(field => isPresent(row?.[field])));
    }).length;
    const contractMatches = list.filter(match => {
      const fields = match.entryMode === 'practice_lite'
        ? ['heroUsed', 'rolePlayed', 'kills', 'deaths', 'assists'] : requiredPlayerFields;
      return match.playerStats?.length > 0 && match.playerStats.every(row => fields.every(field => isPresent(row?.[field])));
    }).length;
    const contractRate = list.length ? contractMatches / list.length * 100 : 0;
    const matchMetricFields = ['durationSeconds', 'teamTurtles', 'teamLords', 'teamTurrets'];
    const matchMetricCoverage = Object.fromEntries(matchMetricFields.map(field => [
      field,
      list.filter(match => isPresent(match?.[field])).length
    ]));
    const sampleConfidence = StatsEngine.getSampleConfidence(list.length, list);
    const verifiedRate = list.length ? (verifiedMatches / list.length) * 100 : 0;
    const fullRate = list.length ? (fullMatches / list.length) * 100 : 0;
    let readiness = 'empty';
    let label = 'Match kutilmoqda';
    if (list.length) {
      if (contractRate < 80) {
        readiness = 'review';
        label = 'Data qisman';
      } else if (verifiedRate < 80) {
        readiness = 'unverified';
        label = 'Hisoblashga tayyor · manba tasdiqlanmagan';
      } else if (list.length < 6) {
        readiness = 'early';
        label = 'Dastlabki sample';
      } else {
        readiness = 'ready';
        label = list.every(match => match.entryMode === 'practice_lite') ? 'Lite ma’lumotlari to‘liq' : 'Tahlilga tayyor';
      }
    }
    return {
      totalMatches: list.length,
      contractMatches,
      contractRate: StatsEngine.roundOrNull(contractRate, 1),
      trackedRows: rows.length,
      completeRows,
      completeCells,
      totalCells,
      metricCoverageRate: totalCells ? StatsEngine.roundOrNull((completeCells / totalCells) * 100, 1) : null,
      fullMatches,
      fullRate: StatsEngine.roundOrNull(fullRate, 1),
      verifiedMatches,
      verifiedRate: StatsEngine.roundOrNull(verifiedRate, 1),
      legacyMatches,
      matchMetricCoverage,
      sampleConfidence,
      readiness,
      label
    };
  }

  static getAnalyticsScopeComparison(matches) {
    const summarize = mode => {
      const scoped = StatsEngine.filterAnalyticsMatches(matches, mode);
      const wins = scoped.filter(match => match?.result === 'win').length;
      const losses = scoped.filter(match => match?.result === 'loss').length;
      const decided = wins + losses;
      const matchTypes = {};
      const compositions = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      scoped.forEach(match => {
        const type = String(match?.matchType || 'unknown').toLowerCase();
        if (!matchTypes[type]) matchTypes[type] = { total: 0, wins: 0, losses: 0 };
        matchTypes[type].total += 1;
        if (match?.result === 'win') matchTypes[type].wins += 1;
        if (match?.result === 'loss') matchTypes[type].losses += 1;
        const tracked = StatsEngine.getTrackedRosterCount(match);
        if (Object.prototype.hasOwnProperty.call(compositions, tracked)) compositions[tracked] += 1;
      });
      Object.values(matchTypes).forEach(type => {
        const typeDecided = type.wins + type.losses;
        type.winRate = typeDecided ? (type.wins / typeDecided) * 100 : null;
      });
      const dominantEntry = Object.entries(compositions).sort((a, b) => b[1] - a[1])[0];
      return {
        mode,
        matches: scoped,
        totalMatches: scoped.length,
        wins,
        losses,
        decidedMatches: decided,
        winRate: decided ? StatsEngine.roundOrNull((wins / decided) * 100, 1) : null,
        matchTypes,
        compositions,
        dominantComposition: dominantEntry && dominantEntry[1] > 0 ? Number(dominantEntry[0]) : null,
        quality: StatsEngine.getDatasetQuality(scoped),
        confidence: StatsEngine.getSampleConfidence(scoped.length, scoped)
      };
    };

    const team5 = summarize('team5');
    const squad = summarize('squad');
    const rawDelta = team5.winRate !== null && squad.winRate !== null
      ? StatsEngine.roundOrNull(squad.winRate - team5.winRate, 1)
      : null;
    const sharedTypes = Object.keys(team5.matchTypes).filter(type => squad.matchTypes[type]);
    const standardizedTypes = sharedTypes.filter(type =>
      team5.matchTypes[type].total >= 3 && squad.matchTypes[type].total >= 3);
    const comparable = team5.totalMatches >= 10
      && squad.totalMatches >= 10
      && team5.quality.verifiedRate >= 80
      && squad.quality.verifiedRate >= 80
      && standardizedTypes.length > 0;
    let adjustedTeamWinRate = null;
    let adjustedSquadWinRate = null;
    let adjustedDelta = null;
    if (comparable) {
      const pooledTotal = standardizedTypes.reduce((total, type) =>
        total + team5.matchTypes[type].total + squad.matchTypes[type].total, 0);
      adjustedTeamWinRate = standardizedTypes.reduce((total, type) => {
        const pooledWeight = (team5.matchTypes[type].total + squad.matchTypes[type].total) / pooledTotal;
        return total + (team5.matchTypes[type].winRate * pooledWeight);
      }, 0);
      adjustedSquadWinRate = standardizedTypes.reduce((total, type) => {
        const pooledWeight = (team5.matchTypes[type].total + squad.matchTypes[type].total) / pooledTotal;
        return total + (squad.matchTypes[type].winRate * pooledWeight);
      }, 0);
      adjustedTeamWinRate = StatsEngine.roundOrNull(adjustedTeamWinRate, 1);
      adjustedSquadWinRate = StatsEngine.roundOrNull(adjustedSquadWinRate, 1);
      adjustedDelta = StatsEngine.roundOrNull(adjustedSquadWinRate - adjustedTeamWinRate, 1);
    }
    return {
      team5,
      squad,
      rawDelta,
      comparable,
      status: comparable ? 'comparable' : 'early',
      sharedTypes,
      standardizedTypes,
      adjustedTeamWinRate,
      adjustedSquadWinRate,
      adjustedDelta
    };
  }

  static getSampleConfidence(sampleSize, matches = []) {
    const n = Math.max(0, Number(sampleSize) || 0);
    const days = new Set(matches.map(match => match.date).filter(Boolean)).size;
    const base = { sampleSize: n, minStable: 15, distinctDays: days };
    if (n < 3) return { ...base, level: 'insufficient', label: 'Yetarli emas' };
    if (n < 6) return { ...base, level: 'provisional', label: 'Dastlabki signal' };
    if (n < 15 || days < 3) return { ...base, level: 'provisional', label: 'Kuzatuvga tayyor' };
    return { ...base, level: 'stable', label: 'Kengroq kuzatuv' };
  }

  static median(values) {
    const sorted = values.map(StatsEngine.numberOrNull).filter(value => value !== null).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  static recentTeamResults(matches = []) {
    const sorted = StatsEngine.sortMatchesChronologically(StatsEngine.filterAnalyticsMatches(matches, 'team5')).reverse();
    const recent = sorted.slice(0, 5);
    const previous = sorted.slice(5, 10);
    const rate = rows => rows.length ? Math.round(rows.filter(match => match.result === 'win').length / rows.length * 100) : null;
    const comparable = recent.length === 5 && previous.length === 5;
    return { recent, previous, recentRate: rate(recent), previousRate: rate(previous), comparable,
      delta: comparable ? rate(recent) - rate(previous) : null };
  }

  getRosterCoverage(matches, players, options = {}) {
    const scoped = this._filter(matches, options, 'team5');
    return StatsEngine.ROLES.map(role => {
      const observations = (players || []).filter(player => player.active !== false).map(player => {
        const rows = scoped.flatMap(match => (match.playerStats || []).filter(stat => stat.playerId === player.id && StatsEngine.normalizeRole(stat.rolePlayed) === role));
        return { playerId: player.id, name: player.name, matches: rows.length,
          assigned: StatsEngine.normalizeRole(player.primaryRole) === role,
          heroes: new Set(rows.map(stat => StatsEngine.getHeroIdentity(stat)?.key).filter(Boolean)).size };
      }).filter(item => item.matches > 0 || item.assigned).sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
      return { role, observations, observedPlayers: observations.filter(item => item.matches > 0).length };
    });
  }

  static comparisonContext(match, role) {
    return `${match.scope || 'unclassified'}:${match.matchType || 'unknown'}:${match.playerStats?.length || 0}:${role}`;
  }

  static resolveScope(options, fallback) {
    if (typeof options === 'string' || Array.isArray(options)) return options;
    if (options && Object.prototype.hasOwnProperty.call(options, 'scope')) return options.scope;
    return fallback;
  }

  static wilsonLowerBound(wins, total) {
    if (!total) return 0;
    const z = 1.96;
    const proportion = wins / total;
    const denominator = 1 + ((z ** 2) / total);
    const centre = proportion + ((z ** 2) / (2 * total));
    const spread = z * Math.sqrt(((proportion * (1 - proportion)) / total) + ((z ** 2) / (4 * total ** 2)));
    return (centre - spread) / denominator;
  }

  _filter(matches, options, fallbackScope) {
    return StatsEngine.filterMatchesByScope(matches, StatsEngine.resolveScope(options, fallbackScope));
  }

  _metricSummary(values, digits = null) {
    const valid = values.map(StatsEngine.numberOrNull).filter(value => value !== null);
    const total = valid.length ? valid.reduce((sum, value) => sum + value, 0) : null;
    const average = valid.length ? total / valid.length : null;
    return {
      total: digits === null ? total : StatsEngine.roundOrNull(total, digits),
      average: digits === null ? average : StatsEngine.roundOrNull(average, digits),
      sampleSize: valid.length
    };
  }

  _eclipseIndex(matches, playerId, targetRole = null, referenceMatches = matches) {
    const roleScores = new Map();
    const playerObservations = [];

    (referenceMatches || []).forEach(match => {
      (match.playerStats || []).forEach(stat => {
        const score = StatsEngine.numberOrNull(stat.inGameScore);
        if (score === null) return;
        const role = StatsEngine.normalizeRole(stat.rolePlayed);
        if (stat.playerId === playerId || !StatsEngine.ROLES.includes(role)) return;
        const key = StatsEngine.comparisonContext(match, role);
        if (!roleScores.has(key)) roleScores.set(key, []);
        roleScores.get(key).push({ score, playerId: stat.playerId, date: match.date });
      });
    });

    (matches || []).forEach(match => {
      (match.playerStats || []).forEach(stat => {
        const score = StatsEngine.numberOrNull(stat.inGameScore);
        if (score === null) return;
        const role = StatsEngine.normalizeRole(stat.rolePlayed);
        if (stat.playerId === playerId && (!targetRole || role === targetRole)) {
          playerObservations.push({ score, role, matchId: match.id || null, context: StatsEngine.comparisonContext(match, role) });
        }
      });
    });

    const components = playerObservations.map(observation => {
      const peers = roleScores.get(observation.context) || [];
      if (peers.length < 6 || new Set(peers.map(item => item.playerId)).size < 2 || new Set(peers.map(item => item.date).filter(Boolean)).size < 3) return null;
      const roleBaseline = StatsEngine.median(peers.map(item => item.score));
      if (roleBaseline === null || roleBaseline <= 0) return null;
      return {
        ...observation,
        roleBaseline,
        value: Math.max(0, Math.min(200, (observation.score / roleBaseline) * 100))
      };
    }).filter(Boolean);

    const value = StatsEngine.averageOrNull(components.map(component => component.value));
    return {
      value: StatsEngine.roundOrNull(value, 2),
      sampleSize: components.length,
      confidence: StatsEngine.getSampleConfidence(components.length, matches),
      reason: components.length ? null : 'Shu rol va tarkibda boshqa a’zolarning taqqoslanadigan ma’lumoti yetarli emas',
      formula: StatsEngine.ECLIPSE_INDEX_FORMULA,
      components
    };
  }

  getTeamStats(matches, options = {}) {
    const scopedMatches = this._filter(matches, options, 'team5');
    const matchMetricValues = {
      teamTurtles: [], teamLords: [], teamTurrets: [], durationSeconds: []
    };
    const playerMetricValues = {
      damageDealt: [], damageReceived: [], turretDamage: [], goldEarned: [],
      kills: [], deaths: [], assists: []
    };
    const dpmValues = [];
    const gpmValues = [];
    const savageList = [];
    const maniacList = [];
    let wins = 0;
    let losses = 0;

    scopedMatches.forEach(match => {
      if (match.result === 'win') wins++;
      if (match.result === 'loss') losses++;
      Object.keys(matchMetricValues).forEach(key => matchMetricValues[key].push(match[key]));

      const duration = StatsEngine.numberOrNull(match.durationSeconds);
      const roster = [
        ...(Array.isArray(match.playerStats) ? match.playerStats : []),
        ...(Array.isArray(match.guestStats) ? match.guestStats : [])
      ];
      const matchDamage = StatsEngine.completeSumOrNull(roster.map(stat => stat.damageDealt));
      const matchGold = StatsEngine.completeSumOrNull(roster.map(stat => stat.goldEarned));
      if (duration !== null && duration > 0) {
        const minutes = duration / 60;
        if (matchDamage !== null) dpmValues.push(matchDamage / minutes);
        if (matchGold !== null) gpmValues.push(matchGold / minutes);
      }

      roster.forEach(stat => {
        Object.keys(playerMetricValues).forEach(key => playerMetricValues[key].push(stat[key]));
        if (stat.savage === true) savageList.push({ playerId: stat.playerId, heroUsed: stat.heroUsed, date: match.date, matchId: match.id });
        if (stat.maniac === true) maniacList.push({ playerId: stat.playerId, heroUsed: stat.heroUsed, date: match.date, matchId: match.id });
      });
    });

    const matchSummaries = Object.fromEntries(Object.entries(matchMetricValues).map(([key, values]) => [key, this._metricSummary(values)]));
    const playerSummaries = Object.fromEntries(Object.entries(playerMetricValues).map(([key, values]) => [key, this._metricSummary(values)]));
    const metricTotal = key => {
      const values = playerMetricValues[key];
      return values.length && values.every(value => StatsEngine.numberOrNull(value) !== null)
        ? playerSummaries[key].total
        : null;
    };
    const decidedMatches = wins + losses;
    const totalDurationSeconds = matchSummaries.durationSeconds.total;
    const avgDurationSeconds = matchSummaries.durationSeconds.average === null ? null : Math.round(matchSummaries.durationSeconds.average);
    const scope = StatsEngine.resolveScope(options, 'team5');

    return {
      scope,
      excludedMatches: Math.max(0, (Array.isArray(matches) ? matches.length : 0) - scopedMatches.length),
      totalMatches: scopedMatches.length,
      decidedMatches,
      wins,
      losses,
      winRate: decidedMatches ? ((wins / decidedMatches) * 100).toFixed(1) : null,
      totalTurtles: matchSummaries.teamTurtles.total,
      totalLords: matchSummaries.teamLords.total,
      totalTurrets: matchSummaries.teamTurrets.total,
      totalSavages: savageList.length,
      totalManiacs: maniacList.length,
      savageList,
      maniacList,
      teamTotalDamageDealt: metricTotal('damageDealt'),
      teamTotalDamageReceived: metricTotal('damageReceived'),
      teamTotalTurretDamage: metricTotal('turretDamage'),
      teamTotalGold: metricTotal('goldEarned'),
      teamTotalKills: metricTotal('kills'),
      teamTotalDeaths: metricTotal('deaths'),
      teamTotalAssists: metricTotal('assists'),
      teamDamagePerMinute: StatsEngine.roundOrNull(StatsEngine.averageOrNull(dpmValues), 1),
      teamGoldPerMinute: StatsEngine.roundOrNull(StatsEngine.averageOrNull(gpmValues), 1),
      totalDurationSeconds,
      totalDurationFormatted: StatsEngine.formatDuration(totalDurationSeconds),
      avgDurationSeconds,
      avgDurationFormatted: StatsEngine.formatDuration(avgDurationSeconds),
      matchesWithDuration: matchSummaries.durationSeconds.sampleSize,
      metricCoverage: {
        teamTurtles: matchSummaries.teamTurtles.sampleSize,
        teamLords: matchSummaries.teamLords.sampleSize,
        teamTurrets: matchSummaries.teamTurrets.sampleSize,
        damageDealt: playerSummaries.damageDealt.sampleSize,
        damageReceived: playerSummaries.damageReceived.sampleSize,
        turretDamage: playerSummaries.turretDamage.sampleSize,
        goldEarned: playerSummaries.goldEarned.sampleSize,
        duration: matchSummaries.durationSeconds.sampleSize
      },
      confidence: StatsEngine.getSampleConfidence(scopedMatches.length, scopedMatches)
    };
  }

  getMatchInsights(match, matches = [], players = []) {
    if (!match
      || match.validForAnalytics === false
      || match.needsReview === true
      || !StatsEngine.isScopeParticipantConsistent(match)) return [];
    const scope = StatsEngine.getMatchScope(match);
    const hasOfficialTeamContext = StatsEngine.hasOfficialTeamContext(match);
    const sameScope = StatsEngine.sortMatchesChronologically(StatsEngine.filterMatchesByScope(matches, scope)
      .filter(item => item.matchType === match.matchType && StatsEngine.getTrackedRosterCount(item) === StatsEngine.getTrackedRosterCount(match)));
    const matchIndex = sameScope.findIndex(item => item.id === match.id);
    const previous = matchIndex > 0 ? sameScope.slice(Math.max(0, matchIndex - 10), matchIndex) : [];
    const roster = [
      ...(Array.isArray(match.playerStats) ? match.playerStats : []),
      ...(Array.isArray(match.guestStats) ? match.guestStats : [])
    ];
    const playerNames = new Map((players || []).map(player => [player.id, player.name]));

    const totals = {
      kills: hasOfficialTeamContext ? StatsEngine.completeSumOrNull(roster.map(stat => stat.kills)) : null,
      deaths: hasOfficialTeamContext ? StatsEngine.completeSumOrNull(roster.map(stat => stat.deaths)) : null,
      assists: hasOfficialTeamContext ? StatsEngine.completeSumOrNull(roster.map(stat => stat.assists)) : null,
      damage: hasOfficialTeamContext ? StatsEngine.completeSumOrNull(roster.map(stat => stat.damageDealt)) : null,
      teamfight: hasOfficialTeamContext ? StatsEngine.completeAverageOrNull(roster.map(stat => stat.teamfightParticipation)) : null
    };
    const duration = StatsEngine.numberOrNull(match.durationSeconds);
    const deathsPerMinute = totals.deaths !== null && duration ? totals.deaths / (duration / 60) : null;
    const previousDeathRates = previous.map(item => {
      if (!StatsEngine.hasOfficialTeamContext(item)) return null;
      const participants = [...(item.playerStats || []), ...(item.guestStats || [])];
      const itemDeaths = StatsEngine.completeSumOrNull(participants.map(stat => stat.deaths));
      const itemDuration = StatsEngine.numberOrNull(item.durationSeconds);
      return itemDeaths !== null && itemDuration ? itemDeaths / (itemDuration / 60) : null;
    }).filter(value => value !== null);
    const previousDeathsPerMinute = StatsEngine.averageOrNull(previousDeathRates);
    const previousTurretValues = previous
      .filter(StatsEngine.hasOfficialTeamContext)
      .map(item => StatsEngine.numberOrNull(item.teamTurrets))
      .filter(value => value !== null);
    const previousTurrets = StatsEngine.averageOrNull(previousTurretValues);
    const deathBaselineSampleSize = previousDeathRates.length;
    const turretBaselineSampleSize = previousTurretValues.length;
    const scoreCandidates = roster.map(stat => ({ stat, score: StatsEngine.numberOrNull(stat.inGameScore) })).filter(item => item.score !== null);
    scoreCandidates.sort((a, b) => b.score - a.score);
    const topImpact = scoreCandidates[0] || null;
    const topName = topImpact ? (playerNames.get(topImpact.stat.playerId) || 'Yetakchi o‘yinchi') : 'Tarkib';
    const damageLeader = roster.filter(stat => StatsEngine.numberOrNull(stat.damageDealt) !== null).sort((a, b) => Number(b.damageDealt) - Number(a.damageDealt))[0];
    const topDamage = damageLeader ? StatsEngine.numberOrNull(damageLeader.damageDealt) : null;
    const damageLeaderName = playerNames.get(damageLeader?.playerId) || 'Damage yetakchisi';
    const topDamageShare = hasOfficialTeamContext && topDamage !== null && totals.damage && totals.damage > 0
      ? (topDamage / totals.damage) * 100
      : null;
    const turtles = StatsEngine.numberOrNull(match.teamTurtles);
    const lords = StatsEngine.numberOrNull(match.teamLords);
    const turrets = StatsEngine.numberOrNull(match.teamTurrets);
    const metricSamples = {
      deathsPerMinute: deathBaselineSampleSize,
      turrets: turretBaselineSampleSize
    };

    let worked;
    if (hasOfficialTeamContext && match.result === 'win' && [turtles, lords, turrets].some(value => value !== null && value > 0)) {
      worked = {
        title: 'Map nazorati natijaga aylandi',
        body: `Objective yozuvi: ${turtles ?? '—'} Turtle · ${lords ?? '—'} Lord · ${turrets ?? '—'} Turret. Bu sabab emas, tekshirilishi kerak bo‘lgan signal.`,
        metric: `${turrets ?? '—'} TOWER`,
        reasonCodes: ['RESULT_WIN', 'OBJECTIVE_SIGNAL'],
        reasons: ['Match g‘alaba bilan tugagan', 'Kamida bitta ijobiy objective qiymati qayd etilgan'],
        baselineMatches: 0,
        baselineMetric: 'current-objectives'
      };
    } else if (topImpact) {
      worked = {
        title: `${topName} kuchli individual signal berdi`,
        body: `In-game score ${topImpact.score.toFixed(1)}. Bu ko‘rsatkich rol va VOD kontekstisiz yakuniy hukm emas.`,
        metric: `${topImpact.score.toFixed(1)} SCORE`,
        reasonCodes: ['TOP_INGAME_SCORE'],
        reasons: ['Roster ichidagi eng yuqori mavjud in-game score'],
        baselineMatches: 0,
        baselineMetric: 'current-score'
      };
    } else {
      worked = {
        title: 'Ijobiy signal uchun ma’lumot yetarli emas',
        body: 'In-game score yoki objective qiymatlari tasdiqlanmaguncha avtomatik xulosa chiqarilmaydi.',
        metric: 'VERIFY',
        reasonCodes: ['MISSING_PRIMARY_METRICS'],
        reasons: ['Asosiy metrikalar mavjud emas'],
        baselineMatches: 0,
        baselineMetric: 'none'
      };
    }

    let risk;
    let focus;
    if (deathsPerMinute !== null && previousDeathsPerMinute !== null && deathBaselineSampleSize >= 3 && deathsPerMinute >= previousDeathsPerMinute * 1.15) {
      risk = {
        title: 'Death tempi baseline’dan yuqori',
        body: `${deathsPerMinute.toFixed(2)} death/min, metrikasi to‘liq oldingi ${deathBaselineSampleSize} ta shu turdagi match baseline’i ${previousDeathsPerMinute.toFixed(2)}. VODda fight boshlanish sababini tekshiring.`,
        metric: `${deathsPerMinute.toFixed(2)} D/M`,
        reasonCodes: ['DEATHS_PER_MINUTE_UP'],
        reasons: ['Match davomiyligiga normallashtirilgan death tempi baseline’dan kamida 15% yuqori'],
        baselineMatches: deathBaselineSampleSize,
        baselineMetric: 'deaths-per-minute'
      };
      focus = {
        title: 'Reset va re-engage vaqtini tekshiring',
        body: 'Captain VODda takroriy deathlar fight davomidanmi yoki noto‘g‘ri resetdanmi, tasdiqlashi kerak.',
        metric: 'VOD CHECK',
        reasonCodes: ['REVIEW_RESET_TIMING'],
        reasons: ['Death/min signal sabab emas; VOD tekshiruvi talab qilinadi'],
        baselineMatches: deathBaselineSampleSize,
        baselineMetric: 'deaths-per-minute'
      };
    } else if (hasOfficialTeamContext && turrets !== null && previousTurrets !== null && turretBaselineSampleSize >= 3 && turrets < previousTurrets - 1) {
      risk = {
        title: 'Turret conversion baseline’dan past',
        body: `${turrets} turret, oldingi shu turdagi matchlar o‘rtachasi ${previousTurrets.toFixed(1)}. Pick yoki Lord’dan keyingi map qarorini VODda tekshiring.`,
        metric: `${turrets} TOWER`,
        reasonCodes: ['TURRET_CONVERSION_DOWN'],
        reasons: ['Turret soni oldingi scope baseline’idan bir donadan ko‘proq past'],
        baselineMatches: turretBaselineSampleSize,
        baselineMetric: 'turrets'
      };
      focus = {
        title: 'Yutuqdan keyingi qarorni belgilang',
        body: 'Keyingi Briefingda fightdan so‘ng turret, neutral objective yoki resetdan bittasini oldindan call qiling.',
        metric: 'WIN → MAP',
        reasonCodes: ['DEFINE_POST_FIGHT_CALL'],
        reasons: ['Conversion signali uchun aniq captain call tavsiya qilindi'],
        baselineMatches: turretBaselineSampleSize,
        baselineMetric: 'turrets'
      };
    } else if (topDamageShare !== null && topDamageShare >= 48) {
      risk = {
        title: 'Damage output bir manbaga bog‘langan bo‘lishi mumkin',
        body: `${damageLeaderName} mavjud Damage’ning ${topDamageShare.toFixed(0)}% qismini bergan. Draft va fight vazifalarini VOD bilan tasdiqlang.`,
        metric: `${topDamageShare.toFixed(0)}% SHARE`,
        reasonCodes: ['DAMAGE_CONCENTRATION'],
        reasons: ['Bitta o‘yinchining Damage share’i 48% yoki undan yuqori'],
        baselineMatches: 0,
        baselineMetric: 'current-damage-share'
      };
      focus = {
        title: 'Ikkinchi output oynasini tekshiring',
        body: 'VODda ikkinchi carry resurs, positioning yoki peel sabab output bera olmaganini ajrating.',
        metric: '2ND SOURCE',
        reasonCodes: ['REVIEW_SECOND_DAMAGE_SOURCE'],
        reasons: ['Damage concentration sababini VOD orqali aniqlash kerak'],
        baselineMatches: 0,
        baselineMetric: 'current-damage-share'
      };
    } else {
      const conservativeBaselineSize = Math.min(deathBaselineSampleSize, turretBaselineSampleSize);
      risk = {
        title: 'Kuchli risk signali hali tasdiqlanmadi',
        body: 'Mavjud raqamlar keskin og‘ishni ko‘rsatmaydi yoki baseline yetarli emas. “Muammo yo‘q” degan xulosa chiqarilmaydi.',
        metric: StatsEngine.getSampleConfidence(conservativeBaselineSize).level === 'insufficient' ? 'LOW SAMPLE' : 'NO SPIKE',
        reasonCodes: ['NO_CONFIRMED_OUTLIER'],
        reasons: [`Death/min sample: ${deathBaselineSampleSize}`, `Turret sample: ${turretBaselineSampleSize}`],
        baselineMatches: conservativeBaselineSize,
        baselineMetric: 'minimum-valid-metric-sample'
      };
      focus = {
        title: 'Captain bitta VOD fokusini tanlaydi',
        body: 'Auto signal taxmin bo‘lib qoladi; captain uni tahrirlab, tasdiqlab yoki rad etib Briefingga yuboradi.',
        metric: 'CAPTAIN REVIEW',
        reasonCodes: ['CAPTAIN_REVIEW_REQUIRED'],
        reasons: ['Avtomatik insight yakuniy taktik hukm emas'],
        baselineMatches: conservativeBaselineSize,
        baselineMetric: 'minimum-valid-metric-sample'
      };
    }

    const decorate = (type, label, icon, insight) => {
      const baselineMatches = Math.max(0, Number(insight.baselineMatches) || 0);
      const baselineMetric = insight.baselineMetric || 'none';
      const evidence = previous.filter(item => {
        if (!StatsEngine.hasOfficialTeamContext(item)) return false;
        const hasDeaths = StatsEngine.numberOrNull(item.durationSeconds) > 0 && StatsEngine.completeSumOrNull([...(item.playerStats || []), ...(item.guestStats || [])].map(stat => stat.deaths)) !== null;
        const hasTurrets = StatsEngine.numberOrNull(item.teamTurrets) !== null;
        return baselineMetric === 'deaths-per-minute' ? hasDeaths : baselineMetric === 'turrets' ? hasTurrets : baselineMetric === 'minimum-valid-metric-sample' ? hasDeaths && hasTurrets : false;
      });
      const { baselineMatches: _baselineMatches, baselineMetric: _baselineMetric, ...visibleInsight } = insight;
      return {
        id: `auto:${match.id || match.date || 'match'}:${type}:v3`,
        type,
        label,
        icon,
        ...visibleInsight,
        insightKind: 'auto-hypothesis',
        isHypothesis: true,
        scope,
        sample: { currentMatches: 1, baselineMatches, baselineMetric, metricSamples },
        confidence: StatsEngine.getSampleConfidence(baselineMatches, evidence),
        approval: { state: 'pending', approvedBy: null, approvedAt: null, note: '' },
        captainActions: { approvable: true, editable: true, rejectable: true, pinnableToBriefing: true }
      };
    };

    return [
      decorate('positive', 'AUTO SIGNAL · NIMA ISHLADI', 'fa-bolt', worked),
      decorate('risk', 'AUTO TAXMIN · TEKSHIRISH', 'fa-wave-square', risk),
      decorate('focus', 'CAPTAIN REVIEW · KEYINGI FOKUS', 'fa-crosshairs', focus)
    ];
  }

  getPlayerStats(matches, playerId, options = {}) {
    const scope = StatsEngine.resolveScope(options, 'all');
    const scopedMatches = StatsEngine.filterMatchesByScope(matches, scope);
    const targetRole = options && typeof options === 'object' && options.role
      ? StatsEngine.normalizeRole(options.role)
      : null;
    const appearances = [];

    scopedMatches.forEach(match => {
      const stat = (match.playerStats || []).find(item => item.playerId === playerId);
      if (!stat) return;
      const role = StatsEngine.normalizeRole(stat.rolePlayed);
      if (targetRole && role !== targetRole) return;
      appearances.push({ match, stat, role });
    });

    const metrics = {
      kills: [], deaths: [], assists: [], inGameScore: [], damageDealt: [],
      damageReceived: [], turretDamage: [], teamfightParticipation: [], goldEarned: []
    };
    const damagePerMinute = [];
    const goldPerMinute = [];
    const damageShares = [];
    const goldShares = [];
    const turretDamageShares = [];
    const completeKdaRows = [];
    const rolesPlayed = {};
    const heroMap = new Map();
    let wins = 0;
    let losses = 0;
    let mvpCount = 0;
    let goldCount = 0;
    let silverCount = 0;
    let bronzeCount = 0;
    let savageCount = 0;
    let maniacCount = 0;

    appearances.forEach(({ match, stat, role }) => {
      Object.keys(metrics).forEach(key => metrics[key].push(stat[key]));
      if (match.result === 'win') wins++;
      if (match.result === 'loss') losses++;
      if (stat.medal === 'mvp') mvpCount++;
      if (stat.medal === 'gold') goldCount++;
      if (stat.medal === 'silver') silverCount++;
      if (stat.medal === 'bronze') bronzeCount++;
      if (stat.savage === true) savageCount++;
      if (stat.maniac === true) maniacCount++;
      if (role !== 'Unknown') rolesPlayed[role] = (rolesPlayed[role] || 0) + 1;

      const kills = StatsEngine.numberOrNull(stat.kills);
      const deaths = StatsEngine.numberOrNull(stat.deaths);
      const assists = StatsEngine.numberOrNull(stat.assists);
      if (kills !== null && deaths !== null && assists !== null) completeKdaRows.push({ kills, deaths, assists });

      const duration = StatsEngine.numberOrNull(match.durationSeconds);
      const damage = StatsEngine.numberOrNull(stat.damageDealt);
      const gold = StatsEngine.numberOrNull(stat.goldEarned);
      if (duration !== null && duration > 0) {
        const minutes = duration / 60;
        if (damage !== null) damagePerMinute.push(damage / minutes);
        if (gold !== null) goldPerMinute.push(gold / minutes);
      }

      const roster = [...(match.playerStats || []), ...(match.guestStats || [])];
      const hasTeamContext = roster.length === 5;
      const teamDamage = hasTeamContext ? StatsEngine.completeSumOrNull(roster.map(item => item.damageDealt)) : null;
      const teamGold = hasTeamContext ? StatsEngine.completeSumOrNull(roster.map(item => item.goldEarned)) : null;
      const teamTurretDamage = hasTeamContext ? StatsEngine.completeSumOrNull(roster.map(item => item.turretDamage)) : null;
      const playerTurretDamage = StatsEngine.numberOrNull(stat.turretDamage);
      if (damage !== null && teamDamage !== null && teamDamage > 0) damageShares.push((damage / teamDamage) * 100);
      if (gold !== null && teamGold !== null && teamGold > 0) goldShares.push((gold / teamGold) * 100);
      if (playerTurretDamage !== null && teamTurretDamage !== null && teamTurretDamage > 0) turretDamageShares.push((playerTurretDamage / teamTurretDamage) * 100);

      const heroIdentity = StatsEngine.getHeroIdentity(stat);
      if (heroIdentity) {
        if (!heroMap.has(heroIdentity.key)) heroMap.set(heroIdentity.key, { ...heroIdentity, timesUsed: 0, wins: 0, losses: 0, dates: [] });
        const hero = heroMap.get(heroIdentity.key);
        hero.timesUsed++;
        hero.dates.push({ date: match.date });
        if (match.result === 'win') hero.wins++;
        if (match.result === 'loss') hero.losses++;
      }
    });

    const summaries = Object.fromEntries(Object.entries(metrics).map(([key, values]) => [key, this._metricSummary(values)]));
    const decidedMatches = wins + losses;
    const kdaTotals = completeKdaRows.length ? completeKdaRows.reduce((sum, row) => ({
      kills: sum.kills + row.kills,
      deaths: sum.deaths + row.deaths,
      assists: sum.assists + row.assists
    }), { kills: 0, deaths: 0, assists: 0 }) : null;
    const referenceMatches = options && typeof options === 'object' && Array.isArray(options.referenceMatches)
      ? StatsEngine.filterMatchesByScope(options.referenceMatches, scope)
      : scopedMatches;
    const eclipse = this._eclipseIndex(scopedMatches, playerId, targetRole, referenceMatches);
    const heroesUsed = [...heroMap.values()].map(hero => ({
      ...hero,
      winRate: (hero.wins + hero.losses) ? ((hero.wins / (hero.wins + hero.losses)) * 100).toFixed(1) : null,
      useRate: appearances.length ? ((hero.timesUsed / appearances.length) * 100).toFixed(1) : null,
      confidence: StatsEngine.getSampleConfidence(hero.timesUsed, hero.dates)
    })).sort((a, b) => b.timesUsed - a.timesUsed);

    const toFixedOrNull = (value, digits) => value === null ? null : value.toFixed(digits);
    const totalMetricSlots = appearances.length * Object.keys(metrics).length;
    const populatedMetricSlots = Object.values(summaries).reduce((sum, summary) => sum + summary.sampleSize, 0);

    return {
      scope,
      role: targetRole,
      matchesPlayed: appearances.length,
      decidedMatches,
      wins,
      losses,
      winRate: decidedMatches ? ((wins / decidedMatches) * 100).toFixed(1) : null,
      totalKills: summaries.kills.total,
      totalDeaths: summaries.deaths.total,
      totalAssists: summaries.assists.total,
      avgKills: toFixedOrNull(summaries.kills.average, 1),
      avgDeaths: toFixedOrNull(summaries.deaths.average, 1),
      avgAssists: toFixedOrNull(summaries.assists.average, 1),
      kdaRatio: kdaTotals ? ((kdaTotals.kills + kdaTotals.assists) / Math.max(kdaTotals.deaths, 1)).toFixed(2) : null,
      kdaSampleSize: completeKdaRows.length,
      avgInGameScore: toFixedOrNull(summaries.inGameScore.average, 1),
      totalDamageDealt: summaries.damageDealt.total,
      avgDamageDealt: summaries.damageDealt.average === null ? null : Math.round(summaries.damageDealt.average),
      totalDamageReceived: summaries.damageReceived.total,
      avgDamageReceived: summaries.damageReceived.average === null ? null : Math.round(summaries.damageReceived.average),
      totalTurretDamage: summaries.turretDamage.total,
      avgTurretDamage: summaries.turretDamage.average === null ? null : Math.round(summaries.turretDamage.average),
      totalGoldEarned: summaries.goldEarned.total,
      avgGoldEarned: summaries.goldEarned.average === null ? null : Math.round(summaries.goldEarned.average),
      avgTeamfightParticipation: toFixedOrNull(summaries.teamfightParticipation.average, 1),
      avgDamagePerMinute: StatsEngine.roundOrNull(StatsEngine.averageOrNull(damagePerMinute), 1),
      avgGoldPerMinute: StatsEngine.roundOrNull(StatsEngine.averageOrNull(goldPerMinute), 1),
      avgDamageShare: StatsEngine.roundOrNull(StatsEngine.averageOrNull(damageShares), 1),
      avgGoldShare: StatsEngine.roundOrNull(StatsEngine.averageOrNull(goldShares), 1),
      avgTurretDamageShare: StatsEngine.roundOrNull(StatsEngine.averageOrNull(turretDamageShares), 1),
      rateSampleSizes: {
        damagePerMinute: damagePerMinute.length,
        goldPerMinute: goldPerMinute.length,
        damageShare: damageShares.length,
        goldShare: goldShares.length,
        turretDamageShare: turretDamageShares.length
      },
      mvpCount,
      goldCount,
      silverCount,
      bronzeCount,
      savageCount,
      maniacCount,
      heroesUsed,
      favoriteHero: heroesUsed[0]?.heroName || 'Ma’lumot yo‘q',
      uniqueHeroCount: heroesUsed.length,
      rolesPlayed,
      eclipseIndex: eclipse.value,
      eclipseIndexReason: eclipse.reason,
      eclipseIndexConfidence: eclipse.confidence,
      eclipseIndexFormula: eclipse.formula,
      // Backward-compatible name: this is the documented Eclipse Index,
      // not the removed K/D/A + medal composite.
      performanceScore: eclipse.value,
      performanceScoreLabel: 'Eclipse Index',
      confidence: StatsEngine.getSampleConfidence(appearances.length, appearances.map(item => item.match)),
      metricSampleSizes: Object.fromEntries(Object.entries(summaries).map(([key, summary]) => [key, summary.sampleSize])),
      dataCompleteness: totalMetricSlots ? StatsEngine.roundOrNull((populatedMetricSlots / totalMetricSlots) * 100, 1) : null
    };
  }

  getPlayerHeroAnalytics(matches, playerId, options = {}) {
    const scope = StatsEngine.resolveScope(options, 'all');
    const scopedMatches = StatsEngine.filterMatchesByScope(matches, scope);
    const playerMatches = scopedMatches.filter(match => (match.playerStats || []).some(stat => stat.playerId === playerId));
    const heroIdentities = new Map();
    playerMatches.forEach(match => {
      const stat = (match.playerStats || []).find(item => item.playerId === playerId);
      const identity = StatsEngine.getHeroIdentity(stat);
      if (identity && !heroIdentities.has(identity.key)) heroIdentities.set(identity.key, identity);
    });
    const totalMatches = playerMatches.length;

    const heroes = [...heroIdentities.values()].map(identity => {
      const heroName = identity.heroName;
      const heroMatches = playerMatches.filter(match => (match.playerStats || []).some(stat => {
        if (stat.playerId !== playerId) return false;
        return StatsEngine.getHeroIdentity(stat)?.key === identity.key;
      }));
      const stats = this.getPlayerStats(heroMatches, playerId, { scope: 'all' });
      const timesUsed = stats.matchesPlayed;
      const winRateNum = stats.winRate === null ? null : Number(stats.winRate);
      // Match history is evidence of use, not proof of hero mastery.
      const masteryTier = '—';
      const masteryLabel = `${timesUsed} MATCH KUZATILGAN`;
      const masteryColor = '#857d70';
      return {
        heroId: identity.heroId,
        heroName,
        timesUsed,
        wins: stats.wins,
        losses: stats.losses,
        winRate: stats.winRate,
        winRateNum,
        useRate: totalMatches ? ((timesUsed / totalMatches) * 100).toFixed(1) : null,
        useRateNum: totalMatches ? (timesUsed / totalMatches) * 100 : null,
        totalKills: stats.totalKills,
        totalDeaths: stats.totalDeaths,
        totalAssists: stats.totalAssists,
        kdaRatio: stats.kdaRatio,
        avgKills: stats.avgKills,
        avgDeaths: stats.avgDeaths,
        avgAssists: stats.avgAssists,
        avgScore: stats.avgInGameScore,
        avgDamageDealt: stats.avgDamageDealt,
        avgDamageReceived: stats.avgDamageReceived,
        avgTurretDamage: stats.avgTurretDamage,
        avgGold: stats.avgGoldEarned,
        avgTf: stats.avgTeamfightParticipation,
        avgDamagePerMinute: stats.avgDamagePerMinute,
        avgGoldPerMinute: stats.avgGoldPerMinute,
        avgDamageShare: stats.avgDamageShare,
        mvpCount: stats.mvpCount,
        goldCount: stats.goldCount,
        silverCount: stats.silverCount,
        bronzeCount: stats.bronzeCount,
        savageCount: stats.savageCount,
        maniacCount: stats.maniacCount,
        rolesPlayed: stats.rolesPlayed,
        eclipseIndex: stats.eclipseIndex,
        masteryTier,
        masteryLabel,
        masteryColor,
        confidence: StatsEngine.getSampleConfidence(timesUsed, heroMatches)
      };
    }).sort((a, b) => b.timesUsed - a.timesUsed || ((b.winRateNum ?? -1) - (a.winRateNum ?? -1)));

    const eligibleWinRate = heroes.filter(hero => hero.timesUsed >= 3 && hero.winRateNum !== null)
      .sort((a, b) => b.winRateNum - a.winRateNum || b.timesUsed - a.timesUsed);
    return {
      scope,
      totalMatches,
      uniqueHeroesCount: heroes.length,
      heroes,
      mostPicked: heroes[0] || null,
      highestWinRate: eligibleWinRate[0] || null,
      minimumWinRateSample: 3
    };
  }

  getTeamHeroAnalytics(matches, players, options = {}) {
    const scope = StatsEngine.resolveScope(options, 'team5');
    const scopedMatches = StatsEngine.filterMatchesByScope(matches, scope);
    const heroMap = new Map();
    scopedMatches.forEach(match => {
      (match.playerStats || []).forEach(stat => {
        const identity = StatsEngine.getHeroIdentity(stat);
        if (!identity) return;
        if (!heroMap.has(identity.key)) heroMap.set(identity.key, { ...identity, matches: [], pilots: new Map() });
        const entry = heroMap.get(identity.key);
        entry.matches.push({ match, stat });
        if (!entry.pilots.has(stat.playerId)) entry.pilots.set(stat.playerId, []);
        entry.pilots.get(stat.playerId).push({ match, stat });
      });
    });

    const heroes = [...heroMap.values()].map(entry => {
      const { heroId, heroName } = entry;
      const totalPicks = entry.matches.length;
      const wins = entry.matches.filter(item => item.match.result === 'win').length;
      const losses = entry.matches.filter(item => item.match.result === 'loss').length;
      const decided = wins + losses;
      const metric = key => this._metricSummary(entry.matches.map(item => item.stat[key]));
      const kills = metric('kills');
      const deaths = metric('deaths');
      const assists = metric('assists');
      const score = metric('inGameScore');
      const damage = metric('damageDealt');
      const turretDamage = metric('turretDamage');
      const pilots = [...entry.pilots.entries()].map(([playerId, appearances]) => {
        const pilotWins = appearances.filter(item => item.match.result === 'win').length;
        const pilotLosses = appearances.filter(item => item.match.result === 'loss').length;
        const pilot = (players || []).find(player => player.id === playerId);
        return {
          playerId,
          playerName: pilot?.name || 'Unknown',
          picks: appearances.length,
          wins: pilotWins,
          losses: pilotLosses,
          winRate: (pilotWins + pilotLosses) ? ((pilotWins / (pilotWins + pilotLosses)) * 100).toFixed(1) : null,
          confidence: StatsEngine.getSampleConfidence(appearances.length, appearances.map(item => item.match))
        };
      }).sort((a, b) => b.picks - a.picks);
      const completeKda = [kills.total, deaths.total, assists.total].every(value => value !== null);
      const winRateNum = decided ? (wins / decided) * 100 : null;
      return {
        heroId,
        heroName,
        totalPicks,
        wins,
        losses,
        winRate: winRateNum === null ? null : winRateNum.toFixed(1),
        winRateNum,
        useRate: scopedMatches.length ? ((totalPicks / scopedMatches.length) * 100).toFixed(1) : null,
        useRateNum: scopedMatches.length ? (totalPicks / scopedMatches.length) * 100 : null,
        totalKills: kills.total,
        totalDeaths: deaths.total,
        totalAssists: assists.total,
        kdaRatio: completeKda ? ((kills.total + assists.total) / Math.max(deaths.total, 1)).toFixed(2) : null,
        avgDamageDealt: damage.average === null ? null : Math.round(damage.average),
        avgTurretDamage: turretDamage.average === null ? null : Math.round(turretDamage.average),
        avgScore: score.average === null ? null : score.average.toFixed(1),
        pilots,
        metaTier: '—',
        confidence: StatsEngine.getSampleConfidence(totalPicks, entry.matches.map(item => item.match))
      };
    }).sort((a, b) => b.totalPicks - a.totalPicks || ((b.winRateNum ?? -1) - (a.winRateNum ?? -1)));

    return {
      scope,
      totalMatches: scopedMatches.length,
      totalHeroesPicked: heroes.length,
      heroes,
      topMetaHero: heroes.find(hero => hero.totalPicks >= 3) || null,
      minimumMetaSample: 3
    };
  }

  getSynergyStats(matches, players, options = {}) {
    const minimumMatches = Number(options?.minimumMatches) || 5;
    const scope = StatsEngine.resolveScope(options, 'team5');
    const scopedMatches = StatsEngine.filterMatchesByScope(matches, scope);
    const lineupSignatures = new Set();
    const duoMap = new Map();
    const trioMap = new Map();

    scopedMatches.forEach(match => {
      const activeStats = [...new Map((match.playerStats || []).filter(stat => stat.playerId).map(stat => [stat.playerId, stat])).values()];
      const activeIds = activeStats.map(stat => stat.playerId).sort();
      if (activeIds.length >= 2) lineupSignatures.add(activeIds.join('|'));
      const result = match.result;

      const addCombination = (map, ids) => {
        const key = ids.join('|');
        if (!map.has(key)) map.set(key, { ids, matchesTogether: 0, wins: 0, losses: 0, kdaRows: [], dates: [] });
        const entry = map.get(key);
        entry.matchesTogether++;
        entry.dates.push({ date: match.date });
        if (result === 'win') entry.wins++;
        if (result === 'loss') entry.losses++;
        const rows = ids.map(id => activeStats.find(stat => stat.playerId === id));
        if (rows.every(row => ['kills', 'deaths', 'assists'].every(keyName => StatsEngine.numberOrNull(row?.[keyName]) !== null))) {
          entry.kdaRows.push(rows);
        }
      };

      for (let first = 0; first < activeIds.length; first++) {
        for (let second = first + 1; second < activeIds.length; second++) {
          addCombination(duoMap, [activeIds[first], activeIds[second]]);
          for (let third = second + 1; third < activeIds.length; third++) {
            addCombination(trioMap, [activeIds[first], activeIds[second], activeIds[third]]);
          }
        }
      }
    });

    const createRows = (map, size) => [...map.values()].filter(entry => entry.matchesTogether >= minimumMatches).map(entry => {
      const decided = entry.wins + entry.losses;
      const winRateNum = decided ? (entry.wins / decided) * 100 : null;
      const totals = entry.kdaRows.length ? entry.kdaRows.flat().reduce((sum, stat) => ({
        kills: sum.kills + Number(stat.kills),
        deaths: sum.deaths + Number(stat.deaths),
        assists: sum.assists + Number(stat.assists)
      }), { kills: 0, deaths: 0, assists: 0 }) : null;
      const rosterPlayers = entry.ids.map(id => (players || []).find(player => player.id === id) || { id, name: 'Unknown' });
      const row = {
        ids: entry.ids,
        matchesTogether: entry.matchesTogether,
        wins: entry.wins,
        losses: entry.losses,
        winRate: winRateNum === null ? null : winRateNum.toFixed(1),
        winRateNum,
        wilsonScore: decided ? StatsEngine.wilsonLowerBound(entry.wins, decided) : 0,
        combinedKda: totals ? ((totals.kills + totals.assists) / Math.max(totals.deaths, 1)).toFixed(2) : null,
        confidence: StatsEngine.getSampleConfidence(entry.matchesTogether, entry.dates)
      };
      if (size === 2) {
        row.player1 = rosterPlayers[0];
        row.player2 = rosterPlayers[1];
        row.comboLabel = `${rosterPlayers[0].name} + ${rosterPlayers[1].name}`;
      } else {
        row.players = rosterPlayers;
      }
      return row;
    }).sort((a, b) => b.wilsonScore - a.wilsonScore || b.matchesTogether - a.matchesTogether);

    const hasLineupVariance = lineupSignatures.size >= 2;
    const enoughMatches = scopedMatches.length >= minimumMatches;
    const duos = hasLineupVariance && enoughMatches ? createRows(duoMap, 2) : [];
    const trios = hasLineupVariance && enoughMatches ? createRows(trioMap, 3) : [];
    const available = hasLineupVariance && enoughMatches && (duos.length > 0 || trios.length > 0);
    let reason = null;
    if (!enoughMatches) reason = `Synergy uchun kamida ${minimumMatches} ta team5 match kerak.`;
    else if (!hasLineupVariance) reason = 'Tarkib o‘zgarmagan: barcha juftliklar bir xil natijani meros qiladi.';
    else if (!available) reason = `Hech bir kombinatsiya ${minimumMatches} ta match sample’iga yetmagan.`;

    return {
      available,
      reason,
      scope,
      minimumMatches,
      lineupVariance: lineupSignatures.size,
      duos,
      trios,
      topDuo: available ? (duos[0] || null) : null,
      mostPlayedDuo: available ? ([...duos].sort((a, b) => b.matchesTogether - a.matchesTogether)[0] || null) : null,
      topTrio: available ? (trios[0] || null) : null
    };
  }

  getPlayerComparison(matches, player1Id, player2Id, options = {}) {
    return {
      available: false,
      deprecated: true,
      reason: 'Turli rollardagi jamoadoshlarni bitta umumiy 1v1 reytingida solishtirish adolatli emas. Self-progress va role coverage’dan foydalaning.',
      replacement: 'self-progress',
      p1Stats: this.getPlayerStats(matches, player1Id, options),
      p2Stats: this.getPlayerStats(matches, player2Id, options),
      p1Roles: this.getPlayerRoleBreakdown(matches, player1Id, options),
      p2Roles: this.getPlayerRoleBreakdown(matches, player2Id, options),
      metrics: [],
      p1WinsCount: 0,
      p2WinsCount: 0,
      overallWinner: null,
      sharedHeroes: []
    };
  }

  getPlayerStatsForRole(matches, playerId, targetRole, options = {}) {
    const scope = StatsEngine.resolveScope(options, 'all');
    return this.getPlayerStats(matches, playerId, { ...((options && typeof options === 'object') ? options : {}), scope, role: targetRole });
  }

  getPlayerRoleBreakdown(matches, playerId, options = {}) {
    const roleStatsList = StatsEngine.ROLES.map(role => this.getPlayerStatsForRole(matches, playerId, role, options));
    const playedRoles = roleStatsList.filter(stats => stats.matchesPlayed > 0);
    const primaryRole = [...playedRoles].sort((a, b) => b.matchesPlayed - a.matchesPlayed)[0]?.role || 'Flex';
    return {
      roles: roleStatsList,
      primaryRole,
      bestRole: primaryRole,
      totalRolesPlayed: playedRoles.length,
      bestRoleAvailable: false,
      minimumBestRoleSample: 3
    };
  }

  getTeamOfPeriod(matches, players, options = {}) {
    const minimumRoleMatches = Number(options?.minimumRoleMatches) || 6;
    const scope = StatsEngine.resolveScope(options, 'team5');
    const scopedMatches = StatsEngine.filterMatchesByScope(matches, scope);
    const empty = reason => ({
      available: false,
      reason,
      scope,
      minimumRoleMatches,
      lineup: {},
      avgLineupScore: null,
      avgEclipseIndex: null,
      candidatesFound: 0,
      confidence: StatsEngine.getSampleConfidence(scopedMatches.length, scopedMatches)
    });
    if (!players?.length) return empty('Roster mavjud emas.');
    if (scopedMatches.length < minimumRoleMatches) return empty(`Dream Team uchun kamida ${minimumRoleMatches} ta team5 match kerak.`);

    const candidatesByRole = Object.fromEntries(StatsEngine.ROLES.map(role => [role, players.map(player => {
      const stats = this.getPlayerStatsForRole(scopedMatches, player.id, role, { scope: 'all' });
      return { player, stats, role };
    }).filter(candidate => candidate.stats.matchesPlayed >= minimumRoleMatches && candidate.stats.eclipseIndex !== null)
      .sort((a, b) => b.stats.eclipseIndex - a.stats.eclipseIndex)]));
    const missingRoles = StatsEngine.ROLES.filter(role => candidatesByRole[role].length === 0);
    if (missingRoles.length) return { ...empty(`Yetarli sample yo‘q: ${missingRoles.join(', ')}.`), missingRoles };

    let best = null;
    const search = (roleIndex, usedPlayers, lineup, totalScore) => {
      if (roleIndex === StatsEngine.ROLES.length) {
        if (!best || totalScore > best.totalScore) best = { lineup: { ...lineup }, totalScore };
        return;
      }
      const role = StatsEngine.ROLES[roleIndex];
      candidatesByRole[role].forEach(candidate => {
        if (usedPlayers.has(candidate.player.id)) return;
        usedPlayers.add(candidate.player.id);
        lineup[role] = candidate;
        search(roleIndex + 1, usedPlayers, lineup, totalScore + candidate.stats.eclipseIndex);
        delete lineup[role];
        usedPlayers.delete(candidate.player.id);
      });
    };
    search(0, new Set(), {}, 0);
    if (!best) return empty('Besh rol uchun takrorlanmaydigan o‘yinchilar tarkibini tuzib bo‘lmadi.');

    const avgEclipseIndex = best.totalScore / StatsEngine.ROLES.length;
    return {
      available: true,
      reason: null,
      scope,
      minimumRoleMatches,
      lineup: best.lineup,
      avgLineupScore: avgEclipseIndex.toFixed(2),
      avgEclipseIndex: StatsEngine.roundOrNull(avgEclipseIndex, 2),
      candidatesFound: StatsEngine.ROLES.length,
      uniquePlayers: new Set(Object.values(best.lineup).map(candidate => candidate.player.id)).size,
      confidence: Object.values(best.lineup).map(candidate => candidate.stats.confidence).sort((a, b) => ({ insufficient: 0, provisional: 1, stable: 2 })[a.level] - ({ insufficient: 0, provisional: 1, stable: 2 })[b.level] || a.sampleSize - b.sampleSize || a.distinctDays - b.distinctDays)[0],
      formula: StatsEngine.ECLIPSE_INDEX_FORMULA
    };
  }

  getCareerTotals(allMatches, players, options = {}) {
    const scope = StatsEngine.resolveScope(options, 'all');
    return (players || []).map(player => ({
      player,
      stats: this.getPlayerStats(allMatches, player.id, { scope })
    })).filter(item => item.stats.matchesPlayed > 0);
  }

  getPlayerOfPeriod(matches, players, options = {}) {
    const minimumMatches = Number(options?.minimumMatches) || 6;
    const scope = StatsEngine.resolveScope(options, 'team5');
    const scopedMatches = StatsEngine.filterMatchesByScope(matches, scope);
    const eligible = (players || []).map(player => ({
      player,
      stats: this.getPlayerStats(scopedMatches, player.id, { scope: 'all' })
    })).filter(item => item.stats.matchesPlayed >= minimumMatches && item.stats.eclipseIndex !== null
      && item.stats.eclipseIndexConfidence?.sampleSize >= minimumMatches
      && new Set(scopedMatches.filter(match => match.playerStats?.some(stat => stat.playerId === item.player.id)).map(match => match.date).filter(Boolean)).size >= 3)
      .sort((a, b) => b.stats.eclipseIndex - a.stats.eclipseIndex);
    if (!eligible.length) return null;
    return {
      ...eligible[0],
      label: 'Eclipse Index yetakchisi',
      selectionMetric: 'eclipseIndex',
      minimumMatches,
      confidence: eligible[0].stats.eclipseIndexConfidence
    };
  }

  getMostMvps(matches, players, options = {}) {
    const scope = StatsEngine.resolveScope(options, 'team5');
    const scopedMatches = StatsEngine.filterMatchesByScope(matches, scope);
    const ranked = (players || []).map(player => ({
      player,
      stats: this.getPlayerStats(scopedMatches, player.id, { scope: 'all' })
    })).filter(item => item.stats.matchesPlayed > 0 && item.stats.mvpCount > 0)
      .map(item => ({ ...item, mvpCount: item.stats.mvpCount, mvpRate: (item.stats.mvpCount / item.stats.matchesPlayed) * 100 }))
      .sort((a, b) => b.mvpCount - a.mvpCount || b.mvpRate - a.mvpRate || ((b.stats.eclipseIndex ?? -Infinity) - (a.stats.eclipseIndex ?? -Infinity)));
    if (!ranked.length) return null;
    const top = ranked[0];
    const ties = ranked.filter(item => item.mvpCount === top.mvpCount && item.mvpRate === top.mvpRate);
    return {
      ...top,
      ties,
      label: 'MVP medallari yetakchisi',
      selectionMetric: 'mvpCount',
      confidence: top.stats.confidence
    };
  }

  getPlayerTrends(allMatches, players, period = 'week', options = {}) {
    if (period && typeof period === 'object') {
      options = period;
      period = options.period || 'week';
    }
    const scope = StatsEngine.resolveScope(options, 'team5');
    const sorted = StatsEngine.sortMatchesChronologically(StatsEngine.filterMatchesByScope(allMatches, scope));
    const periodWindow = StatsEngine.getPeriodWindows(sorted, period, options);
    const currentDataset = periodWindow ? StatsEngine.filterMatchesByDateWindow(sorted, periodWindow.current) : [];
    const previousDataset = periodWindow ? StatsEngine.filterMatchesByDateWindow(sorted, periodWindow.previous) : [];
    const referenceMatches = StatsEngine.sortMatchesChronologically([...previousDataset, ...currentDataset]);
    return (players || []).map(player => {
      const currentMatches = currentDataset.filter(match => (match.playerStats || []).some(stat => stat.playerId === player.id));
      const previousMatches = previousDataset.filter(match => (match.playerStats || []).some(stat => stat.playerId === player.id));
      const currStats = this.getPlayerStats(currentMatches, player.id, { scope: 'all', referenceMatches });
      const prevStats = this.getPlayerStats(previousMatches, player.id, { scope: 'all', referenceMatches });
      const observations = list => list.flatMap(match => (match.playerStats || [])
        .filter(stat => stat.playerId === player.id && StatsEngine.numberOrNull(stat.inGameScore) !== null && StatsEngine.ROLES.includes(stat.rolePlayed))
        .map(stat => ({ score: Number(stat.inGameScore), context: StatsEngine.comparisonContext(match, stat.rolePlayed) })));
      const currentObservations = observations(currentMatches);
      const previousObservations = observations(previousMatches);
      const currentValidSamples = currentObservations.length;
      const previousValidSamples = previousObservations.length;
      const baselineByContext = new Map();
      previousObservations.forEach(item => {
        if (!baselineByContext.has(item.context)) baselineByContext.set(item.context, []);
        baselineByContext.get(item.context).push(item.score);
      });
      const relativeScores = currentObservations.map(item => {
        const baseline = baselineByContext.get(item.context) || [];
        const median = StatsEngine.median(baseline);
        return baseline.length >= 3 && median > 0 ? 100 * item.score / median : null;
      }).filter(value => value !== null);
      const comparisonAvailable = currentValidSamples >= 3 && previousValidSamples >= 3
        && relativeScores.length >= 3 && relativeScores.length === currentValidSamples;
      const currentScore = comparisonAvailable ? StatsEngine.averageOrNull(relativeScores) : null;
      const prevScore = comparisonAvailable ? 100 : null;
      const diff = comparisonAvailable ? currentScore - prevScore : null;
      const growthPct = comparisonAvailable && prevScore !== 0 ? (diff / prevScore) * 100 : null;
      let status = 'insufficient';
      if (comparisonAvailable) {
        if (growthPct >= 12) status = 'spiking';
        else if (growthPct >= 4) status = 'growing';
        else if (growthPct <= -12) status = 'falling';
        else if (growthPct <= -4) status = 'declining';
        else status = 'stable';
      }
      const weakestSample = Math.min(currentValidSamples, previousValidSamples);
      const reasonCode = comparisonAvailable
        ? null
        : currentValidSamples < 3 && previousValidSamples < 3
          ? 'BOTH_WINDOWS_LOW_SAMPLE'
          : currentValidSamples < 3
            ? 'CURRENT_WINDOW_LOW_SAMPLE'
            : previousValidSamples < 3 ? 'PREVIOUS_WINDOW_LOW_SAMPLE' : 'CONTEXT_NOT_COMPARABLE';
      return {
        player,
        currStats,
        prevStats,
        prevScore,
        currentScore,
        diff: StatsEngine.roundOrNull(diff, 2),
        growthPct: StatsEngine.roundOrNull(growthPct, 1),
        status,
        comparisonAvailable,
        isComparedToCareer: false,
        comparisonMode: `rolling-${periodWindow?.days || 7}-days`,
        requestedPeriod: periodWindow?.period || 'week',
        reasonCode,
        window: {
          period: periodWindow?.period || 'week',
          days: periodWindow?.days || 7,
          anchorDate: periodWindow?.anchorDate || null,
          currentLabel: periodWindow?.current?.label || '—',
          previousLabel: periodWindow?.previous?.label || '—',
          currentFrom: periodWindow?.current?.from || null,
          currentTo: periodWindow?.current?.to || null,
          previousFrom: periodWindow?.previous?.from || null,
          previousTo: periodWindow?.previous?.to || null,
          currentMatches: currentMatches.length,
          previousMatches: previousMatches.length,
          currentValidSamples,
          previousValidSamples,
          currentDatasetMatches: currentDataset.length,
          previousDatasetMatches: previousDataset.length
        },
        currentConfidence: StatsEngine.getSampleConfidence(currentValidSamples, currentMatches),
        previousConfidence: StatsEngine.getSampleConfidence(previousValidSamples, previousMatches),
        confidence: StatsEngine.getSampleConfidence(weakestSample, previousMatches.concat(currentMatches))
      };
    }).sort((a, b) => {
      if (a.comparisonAvailable !== b.comparisonAvailable) return a.comparisonAvailable ? -1 : 1;
      return (b.diff ?? -Infinity) - (a.diff ?? -Infinity);
    });
  }

  getMatchDurationStats(matches, options = {}) {
    const scope = StatsEngine.resolveScope(options, 'team5');
    const scopedMatches = StatsEngine.filterMatchesByScope(matches, scope);
    const validMatches = scopedMatches.filter(match => StatsEngine.numberOrNull(match.durationSeconds) > 0);
    if (!validMatches.length) {
      return {
        hasData: false, scope, count: 0,
        totalDurationSeconds: null, totalDurationFormatted: '-',
        avgDurationSeconds: null, avgDurationFormatted: '-',
        longestMatch: null, shortestMatch: null, fastestWin: null, longestWin: null
      };
    }
    const sorted = [...validMatches].sort((a, b) => Number(a.durationSeconds) - Number(b.durationSeconds));
    const wins = sorted.filter(match => match.result === 'win');
    const totalDurationSeconds = sorted.reduce((sum, match) => sum + Number(match.durationSeconds), 0);
    const avgDurationSeconds = Math.round(totalDurationSeconds / sorted.length);
    return {
      hasData: true,
      scope,
      count: sorted.length,
      totalDurationSeconds,
      totalDurationFormatted: StatsEngine.formatDuration(totalDurationSeconds),
      avgDurationSeconds,
      avgDurationFormatted: StatsEngine.formatDuration(avgDurationSeconds),
      longestMatch: sorted[sorted.length - 1],
      shortestMatch: sorted[0],
      fastestWin: wins[0] || null,
      longestWin: wins[wins.length - 1] || null,
      confidence: StatsEngine.getSampleConfidence(sorted.length, sorted)
    };
  }

  getAllTimeRecords(allMatches, players, options = {}) {
    const scope = StatsEngine.resolveScope(options, 'team5');
    const sorted = StatsEngine.sortMatchesChronologically(StatsEngine.filterMatchesByScope(allMatches, scope));
    const records = {
      highestKills: null,
      highestAssists: null,
      highestDamage: null,
      highestGold: null,
      highestInGameScore: null
    };
    let currentStreak = { type: null, count: 0 };
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let runningType = null;
    let runningCount = 0;

    const updateRecord = (key, value, base) => {
      const number = StatsEngine.numberOrNull(value);
      if (number === null) return;
      if (!records[key] || number > records[key].value) records[key] = { value: number, ...base };
    };

    sorted.forEach(match => {
      if (match.result === 'win' || match.result === 'loss') {
        if (runningType === match.result) runningCount++;
        else { runningType = match.result; runningCount = 1; }
        if (match.result === 'win') longestWinStreak = Math.max(longestWinStreak, runningCount);
        else longestLossStreak = Math.max(longestLossStreak, runningCount);
        currentStreak = { type: runningType, count: runningCount };
      }
      (match.playerStats || []).forEach(stat => {
        const player = (players || []).find(item => item.id === stat.playerId);
        const base = {
          playerName: player?.name || 'Unknown',
          heroUsed: stat.heroUsed || null,
          rolePlayed: StatsEngine.normalizeRole(stat.rolePlayed),
          date: match.date,
          matchId: match.id
        };
        updateRecord('highestKills', stat.kills, base);
        updateRecord('highestAssists', stat.assists, base);
        updateRecord('highestDamage', stat.damageDealt, base);
        updateRecord('highestGold', stat.goldEarned, base);
        updateRecord('highestInGameScore', stat.inGameScore, base);
      });
    });

    const duration = this.getMatchDurationStats(sorted, { scope: 'all' });
    return {
      scope,
      ...records,
      longestWinStreak,
      longestLossStreak,
      currentStreak,
      longestMatch: duration.longestMatch,
      shortestMatch: duration.shortestMatch,
      fastestWin: duration.fastestWin,
      confidence: StatsEngine.getSampleConfidence(sorted.length, sorted)
    };
  }

  getLeaderboard(matches, players, options = {}) {
    const scope = StatsEngine.resolveScope(options, 'team5');
    const scopedMatches = StatsEngine.filterMatchesByScope(matches, scope);
    return (players || []).map(player => ({
      player,
      stats: this.getPlayerStats(scopedMatches, player.id, { scope: 'all' })
    })).filter(item => item.stats.matchesPlayed > 0)
      .map(item => ({ ...item, rankEligible: item.stats.matchesPlayed >= 6
        && item.stats.eclipseIndex !== null && item.stats.eclipseIndexConfidence?.sampleSize >= 6
        && new Set(scopedMatches.filter(match => match.playerStats?.some(stat => stat.playerId === item.player.id)).map(match => match.date).filter(Boolean)).size >= 3 }))
      .sort((a, b) => {
        if (a.rankEligible !== b.rankEligible) return a.rankEligible ? -1 : 1;
        if (!a.rankEligible) return a.player.name.localeCompare(b.player.name);
        if (a.stats.eclipseIndex === null && b.stats.eclipseIndex !== null) return 1;
        if (b.stats.eclipseIndex === null && a.stats.eclipseIndex !== null) return -1;
        return (b.stats.eclipseIndex ?? 0) - (a.stats.eclipseIndex ?? 0);
      });
  }
};
