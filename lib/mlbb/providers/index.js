import * as rone from './rone.js';
import * as direct from './moonton-gms.js';

export { roneAttribution } from './rone.js';
export { moontonGmsAttribution } from './moonton-gms.js';

export const RONE_SOURCE = Object.freeze({
  provider: 'Rone Arena API',
  providerUrl: 'https://github.com/ridwaanhall/rone-arena-api',
  license: 'BSD-3-Clause',
  official: false,
  attributionRequired: true
});

export const DIRECT_SOURCE = Object.freeze({
  provider: 'Mobile Legends public data',
  providerUrl: 'https://www.mobilelegends.com',
  official: true,
  attributionRequired: false,
  originalSource: 'Mobile Legends public data',
  note: 'Direct Moonton CMS endpoints; access is undocumented and subject to change'
});

let circuitBreakerOpenUntil = 0;
const BREAKER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function resetCircuitBreaker() {
  circuitBreakerOpenUntil = 0;
}

export function isCircuitBreakerOpen() {
  return Date.now() < circuitBreakerOpenUntil;
}

function tripCircuitBreaker() {
  circuitBreakerOpenUntil = Date.now() + BREAKER_WINDOW_MS;
}

export function getProviderMode(options = {}) {
  const env = options.env || process.env;
  const val = (env.MLBB_PROVIDER || '').trim().toLowerCase();
  if (val === 'direct') return 'direct';
  if (val === 'auto') return 'auto';
  return 'rone';
}

async function runAuto(directCall, roneCall, options) {
  if (isCircuitBreakerOpen()) {
    return roneCall(options);
  }

  try {
    const directOptions = {
      ...options,
      timeoutMs: 4000,
      retries: 0,
      checkBreaker: () => isCircuitBreakerOpen()
    };
    return await directCall(directOptions);
  } catch (error) {
    if (error?.code !== 'CIRCUIT_BREAKER_OPEN') {
      tripCircuitBreaker();
    }
    return roneCall(options);
  }
}

export async function fetchHeroCatalog(options = {}) {
  const mode = getProviderMode(options);
  if (mode === 'direct') {
    const res = await direct.fetchHeroCatalog(options);
    res.source = DIRECT_SOURCE;
    return res;
  }
  if (mode === 'auto') {
    return runAuto(
      async opts => {
        const res = await direct.fetchHeroCatalog(opts);
        res.source = DIRECT_SOURCE;
        return res;
      },
      async opts => {
        const res = await rone.fetchHeroCatalog(opts);
        res.source = RONE_SOURCE;
        return res;
      },
      options
    );
  }
  const res = await rone.fetchHeroCatalog(options);
  res.source = RONE_SOURCE;
  return res;
}

export async function fetchHeroRank(options = {}) {
  const mode = getProviderMode(options);
  const wrapResult = (rows, source) => {
    rows.source = source;
    if (options.withSource) {
      return { rows, source };
    }
    return rows;
  };

  if (mode === 'direct') {
    const rows = await direct.fetchHeroRank(options);
    return wrapResult(rows, DIRECT_SOURCE);
  }
  if (mode === 'auto') {
    return runAuto(
      async opts => {
        const rows = await direct.fetchHeroRank(opts);
        return wrapResult(rows, DIRECT_SOURCE);
      },
      async opts => {
        const rows = await rone.fetchHeroRank(opts);
        return wrapResult(rows, RONE_SOURCE);
      },
      options
    );
  }
  const rows = await rone.fetchHeroRank(options);
  return wrapResult(rows, RONE_SOURCE);
}

export async function fetchHeroDetail(heroId, options = {}) {
  const mode = getProviderMode(options);
  if (mode === 'direct') {
    return direct.fetchHeroDetail(heroId, options);
  }
  if (mode === 'auto') {
    return runAuto(
      opts => direct.fetchHeroDetail(heroId, opts),
      opts => rone.fetchHeroDetail(heroId, opts),
      options
    );
  }
  return rone.fetchHeroDetail(heroId, options);
}

export async function fetchHeroMatchups(heroId, options = {}) {
  const mode = getProviderMode(options);
  const wrapMatchups = (res, source) => {
    res.source = source;
    return res;
  };

  if (mode === 'direct') {
    const res = await direct.fetchHeroMatchups(heroId, options);
    return wrapMatchups(res, DIRECT_SOURCE);
  }
  if (mode === 'auto') {
    return runAuto(
      async opts => wrapMatchups(await direct.fetchHeroMatchups(heroId, opts), DIRECT_SOURCE),
      async opts => wrapMatchups(await rone.fetchHeroMatchups(heroId, opts), RONE_SOURCE),
      options
    );
  }
  const res = await rone.fetchHeroMatchups(heroId, options);
  return wrapMatchups(res, RONE_SOURCE);
}
