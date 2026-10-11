import { fetchJson } from '../http.js';
import {
  normalizeCounterPayload,
  normalizeHeroCatalog,
  normalizeHeroDetail,
  normalizeRankPayload
} from '../normalize.js';

const DEFAULT_BASE_URL = 'https://arena.rone.dev';
let currentAlternativeHost = null;

export function resetAlternativeHost() {
  currentAlternativeHost = null;
}

function getRoneBaseUrl(env = process.env) {
  if (currentAlternativeHost) return currentAlternativeHost;
  const custom = env?.RONE_BASE_URL;
  if (custom) {
    try {
      const parsed = new URL(custom);
      if (parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch (_) {}
  }
  return DEFAULT_BASE_URL;
}

function isValidAlternative(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'https:') return false;
    const hostname = url.hostname.toLowerCase();
    return hostname.endsWith('.fastapicloud.dev') || hostname === 'fastapicloud.dev' ||
           hostname.endsWith('.rone.dev') || hostname === 'rone.dev';
  } catch (_) {
    return false;
  }
}

function endpoint(path, params = {}, baseUrl = DEFAULT_BASE_URL) {
  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

async function request(path, params, options = {}) {
  const base = getRoneBaseUrl(options.env || process.env);
  const targetUrl = endpoint(path, params, base);
  try {
    return await fetchJson(targetUrl, {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs || 8_000,
      retries: options.retries !== undefined ? options.retries : 1,
      headers: { Accept: 'application/json', 'User-Agent': 'Eclipse-Command-Room/2.20' }
    });
  } catch (error) {
    if (!options._isAlternativeRetry && error?.upstreamStatus === 503) {
      const altCandidate = error.details?.details?.alternative_endpoint || error.details?.alternative_endpoint;
      if (typeof altCandidate === 'string' && isValidAlternative(altCandidate)) {
        const altOrigin = new URL(altCandidate).origin;
        currentAlternativeHost = altOrigin;
        const retryUrl = endpoint(path, params, altOrigin);
        return await fetchJson(retryUrl, {
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs || 8_000,
          retries: 0,
          headers: { Accept: 'application/json', 'User-Agent': 'Eclipse-Command-Room/2.20' },
          _isAlternativeRetry: true
        });
      }
    }
    throw error;
  }
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
