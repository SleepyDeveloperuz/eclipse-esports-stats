import { fetchJson } from '../http.js';
import {
  MOONTON_GMS_SOURCE_DESCRIPTOR,
  normalizeCounterPayload,
  normalizeHeroCatalog,
  normalizeHeroDetail,
  normalizeRankPayload,
  ValidationError
} from '../normalize.js';
import { MLBB_DAY_VALUES, MLBB_RANK_VALUES } from '../ranks.js';

const DEFAULT_GMS_BASE_URL = 'https://api.gms.moontontech.com/api/gms/source/2669606';
const APP_ID = '2669606';
const ACT_ID = '2669607';
const HERO_SOURCE_ID = '2756564';

const STATS_SOURCE_BY_DAYS = Object.freeze({
  '1': '2756567',
  '3': '2756568',
  '7': '2756569',
  '15': '2756565',
  '30': '2756570'
});

const RANK_CODES = Object.freeze({
  all: '101',
  epic: '5',
  legend: '6',
  mythic: '7',
  honor: '8',
  glory: '9'
});

const REQUEST_HEADERS = Object.freeze({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-AppId': APP_ID,
  'X-ActId': ACT_ID,
  'X-Lang': 'en',
  'User-Agent': 'Eclipse-Command-Room/2.20'
});

let gateQueue = Promise.resolve();
let lastRequestStartTime = 0;

export function resetGmsGate() {
  gateQueue = Promise.resolve();
  lastRequestStartTime = 0;
}

function getGmsBaseUrl(env = process.env) {
  const custom = env?.MLBB_GMS_BASE_URL;
  if (custom) {
    try {
      const parsed = new URL(custom);
      if (parsed.protocol === 'https:') {
        return custom.replace(/\/+$/, '');
      }
    } catch (_) {}
  }
  return DEFAULT_GMS_BASE_URL;
}

function scheduleGmsRequest(fn, options = {}) {
  const gapMs = options.requestGapMs !== undefined ? options.requestGapMs : 700;
  const next = gateQueue.then(async () => {
    if (typeof options.checkBreaker === 'function' && options.checkBreaker()) {
      const err = new Error('Circuit breaker is open');
      err.code = 'CIRCUIT_BREAKER_OPEN';
      throw err;
    }
    const now = Date.now();
    const elapsed = now - lastRequestStartTime;
    if (gapMs > 0 && elapsed < gapMs) {
      await new Promise(resolve => setTimeout(resolve, gapMs - elapsed));
    }
    if (typeof options.checkBreaker === 'function' && options.checkBreaker()) {
      const err = new Error('Circuit breaker is open');
      err.code = 'CIRCUIT_BREAKER_OPEN';
      throw err;
    }
    lastRequestStartTime = Date.now();
    return fn();
  });
  gateQueue = next.catch(() => {});
  return next;
}

function postSource(sourceId, body, options = {}) {
  return scheduleGmsRequest(() => {
    const baseUrl = getGmsBaseUrl(options.env || process.env);
    const url = `${baseUrl}/${sourceId}`;
    return fetchJson(url, {
      method: 'POST',
      headers: REQUEST_HEADERS,
      body: JSON.stringify(body),
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs ?? 8_000,
      retries: options.retries ?? 1,
      maxBytes: options.maxBytes || 7_000_000
    });
  }, options);
}

export async function fetchHeroCatalog(options = {}) {
  const body = {
    pageSize: 180,
    pageIndex: 1,
    sorts: [{ data: { field: 'hero_id', order: 'asc' }, type: 'sequence' }],
    fields: ['hero_id', 'hero.data.head', 'hero.data.name', 'hero.data.smallmap']
  };
  const payload = await postSource(HERO_SOURCE_ID, body, options);
  return normalizeHeroCatalog(payload, {
    now: options.now,
    source: MOONTON_GMS_SOURCE_DESCRIPTOR,
    minRecords: options.minRecords,
    maxRecords: options.maxRecords
  });
}

export async function fetchHeroRank(options = {}) {
  const rank = (options.rank || 'mythic').toLowerCase();
  const days = String(options.days || '7');
  if (!MLBB_RANK_VALUES.has(rank) || !MLBB_DAY_VALUES.has(days) || !RANK_CODES[rank] || !STATS_SOURCE_BY_DAYS[days]) {
    throw new ValidationError('Rank yoki davr yaroqsiz', 'INVALID_COHORT');
  }
  const sourceId = STATS_SOURCE_BY_DAYS[days];
  const body = {
    pageSize: 180,
    pageIndex: 1,
    filters: [
      { field: 'bigrank', operator: 'eq', value: RANK_CODES[rank] },
      { field: 'match_type', operator: 'eq', value: '0' }
    ],
    sorts: [{ data: { field: 'main_hero_win_rate', order: 'desc' }, type: 'sequence' }],
    fields: [
      'main_hero',
      'main_hero_appearance_rate',
      'main_hero_ban_rate',
      'main_hero_channel',
      'main_hero_win_rate',
      'main_heroid',
      'data.sub_hero.hero',
      'data.sub_hero.hero_channel',
      'data.sub_hero.increase_win_rate',
      'data.sub_hero.heroid'
    ]
  };
  const payload = await postSource(sourceId, body, options);
  return normalizeRankPayload(payload, {
    rank,
    days,
    now: options.now,
    minRecords: options.minRecords,
    maxRecords: options.maxRecords
  });
}

export async function fetchHeroDetail(heroId, options = {}) {
  const id = Number(heroId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Hero ID yaroqsiz', 'INVALID_HERO_ID');
  }
  const body = {
    pageSize: 1,
    pageIndex: 1,
    filters: [{ field: 'hero_id', operator: 'eq', value: id }],
    sorts: [],
    object: []
  };
  const payload = await postSource(HERO_SOURCE_ID, body, options);
  return normalizeHeroDetail(payload, {
    catalogHero: options.catalogHero,
    now: options.now,
    source: MOONTON_GMS_SOURCE_DESCRIPTOR
  });
}

export async function fetchHeroMatchups(heroId, options = {}) {
  const id = Number(heroId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Hero ID yaroqsiz', 'INVALID_HERO_ID');
  }
  const rank = (options.rank || 'mythic').toLowerCase();
  const days = String(options.days || '7');
  if (!MLBB_RANK_VALUES.has(rank) || !MLBB_DAY_VALUES.has(days) || !RANK_CODES[rank] || !STATS_SOURCE_BY_DAYS[days]) {
    throw new ValidationError('Rank yoki davr yaroqsiz', 'INVALID_COHORT');
  }
  const sourceId = STATS_SOURCE_BY_DAYS[days];
  const countersBody = {
    pageSize: 1,
    pageIndex: 1,
    filters: [
      { field: 'match_type', operator: 'eq', value: '0' },
      { field: 'main_heroid', operator: 'eq', value: id },
      { field: 'bigrank', operator: 'eq', value: RANK_CODES[rank] }
    ],
    sorts: []
  };
  const compatBody = {
    pageSize: 1,
    pageIndex: 1,
    filters: [
      { field: 'match_type', operator: 'eq', value: '1' },
      { field: 'main_heroid', operator: 'eq', value: id },
      { field: 'bigrank', operator: 'eq', value: RANK_CODES[rank] }
    ],
    sorts: []
  };

  // Run the two calls sequentially
  const countersPayload = await postSource(sourceId, countersBody, options);
  const compatPayload = await postSource(sourceId, compatBody, options);

  return {
    counters: normalizeCounterPayload(countersPayload, { label: 'Hero counters' }),
    compatibility: normalizeCounterPayload(compatPayload, { label: 'Hero compatibility' })
  };
}

export const moontonGmsAttribution = Object.freeze({
  name: 'Mobile Legends public data',
  url: 'https://www.mobilelegends.com',
  official: true
});
