import { fetchJson } from '../http.js';
import {
  normalizeCounterPayload,
  normalizeHeroCatalog,
  normalizeHeroDetail,
  normalizeRankPayload
} from '../normalize.js';

const BASE_URL = 'https://arena.rone.dev';

function endpoint(path, params = {}) {
  const url = new URL(path, BASE_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

function request(path, params, options = {}) {
  return fetchJson(endpoint(path, params), {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs || 8_000,
    retries: 1,
    headers: { Accept: 'application/json', 'User-Agent': 'Eclipse-Command-Room/2.20' }
  });
}

export async function fetchHeroCatalog(options = {}) {
  const payload = await request('/api/heroes', { size: 180, index: 1, order: 'asc', lang: 'en' }, options);
  return normalizeHeroCatalog(payload, { now: options.now });
}

export async function fetchHeroRank(options = {}) {
  const rank = options.rank || 'mythic';
  const days = String(options.days || '7');
  const payload = await request('/api/heroes/rank', {
    days,
    rank,
    sort_field: 'win_rate',
    sort_order: 'desc',
    size: 180,
    index: 1,
    lang: 'en'
  }, options);
  return normalizeRankPayload(payload, { rank, days, now: options.now });
}

export async function fetchHeroDetail(heroId, options = {}) {
  const payload = await request(`/api/heroes/${encodeURIComponent(String(heroId))}`, { size: 1, index: 1, lang: 'en' }, options);
  return normalizeHeroDetail(payload, { catalogHero: options.catalogHero, now: options.now });
}

export async function fetchHeroMatchups(heroId, options = {}) {
  const params = {
    days: String(options.days || '7'),
    rank: options.rank || 'mythic',
    size: 1,
    index: 1,
    lang: 'en'
  };
  const [countersPayload, compatibilityPayload] = await Promise.all([
    request(`/api/heroes/${encodeURIComponent(String(heroId))}/counters`, params, options),
    request(`/api/heroes/${encodeURIComponent(String(heroId))}/compatibility`, params, options)
  ]);
  return {
    counters: normalizeCounterPayload(countersPayload, { label: 'Hero counters' }),
    compatibility: normalizeCounterPayload(compatibilityPayload, { label: 'Hero compatibility' })
  };
}

export const roneAttribution = Object.freeze({
  name: 'Rone Arena API',
  repository: 'https://github.com/ridwaanhall/rone-arena-api',
  license: 'BSD-3-Clause',
  official: false
});
