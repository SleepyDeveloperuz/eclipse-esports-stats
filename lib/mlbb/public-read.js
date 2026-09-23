import { getHeroIntelligence, MLBB_DEFAULT_DAYS, MLBB_DEFAULT_RANK, MLBB_FRESHNESS, MlbbSyncError, publicCacheState } from './sync.js';
import { MLBB_DAY_VALUES, MLBB_RANK_VALUES } from './ranks.js';
import { MLBB_KEYS } from './store.js';
import { setTimeout as delay } from 'node:timers/promises';

const HOUR = 60 * 60 * 1000;
export const PUBLIC_REFRESH_LIMITS = Object.freeze({ dossiersPerHour: 60, portraitsPerHour: 400 });

export function readPublicCohort(query = {}, env = process.env) {
  // Reject arrays/objects, rather than coercing repeated query parameters.
  const rank = query.rank === undefined ? String(env.MLBB_META_RANK || MLBB_DEFAULT_RANK) : query.rank;
  const days = query.days === undefined ? String(env.MLBB_META_DAYS || MLBB_DEFAULT_DAYS) : query.days;
  if (typeof rank !== 'string' || typeof days !== 'string' || !MLBB_RANK_VALUES.has(rank) || !MLBB_DAY_VALUES.has(days)) {
    throw new MlbbSyncError('Rank yoki davr yaroqsiz', { code: 'INVALID_COHORT', status: 400 });
  }
  return { rank, days };
}

export function readPublicHeroId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,4}$/.test(value)) {
    throw new MlbbSyncError('Hero ID yaroqsiz', { code: 'INVALID_HERO_ID', status: 400 });
  }
  return Number(value);
}

export function findPublicHero(catalog, id) {
  if (!Array.isArray(catalog?.data)) throw new MlbbSyncError('Catalog hali tayyor emas', { code: 'MLBB_DATA_NOT_READY', status: 503 });
  const hero = catalog.data.find(item => Number(item.id) === id && item.availability !== 'unavailable');
  if (!hero) throw new MlbbSyncError('Hero catalogdan topilmadi', { code: 'HERO_NOT_FOUND', status: 404 });
  return hero;
}

export function publicMlbbState(value, maxAgeMs) {
  const result = publicCacheState(value, maxAgeMs);
  if (result.data?.matchups?.error) {
    result.data = { ...result.data, matchups: { ...result.data.matchups, error: { code: 'MATCHUPS_TEMPORARILY_UNAVAILABLE' } } };
  }
  return result;
}

export function publicMlbbHealth(value) {
  if (!value?.data) return null;
  const { ok, partial, datasets, ranks, counts, rank, days } = value.data;
  const state = input => ['fresh', 'stale', 'missing', 'partial'].includes(input) ? input : 'missing';
  const count = input => Number.isSafeInteger(input) && input >= 0 ? input : 0;
  return { ...publicMlbbState(value, MLBB_FRESHNESS.rankMs), data: {
    ok: Boolean(ok), partial: Boolean(partial),
    rank: MLBB_RANK_VALUES.has(rank) ? rank : null,
    days: MLBB_DAY_VALUES.has(String(days)) ? String(days) : null,
    datasets: Object.fromEntries(['catalog', 'rank', 'patches'].map(key => [key, state(datasets?.[key])])),
    ranks: Object.fromEntries([...MLBB_RANK_VALUES].filter(key => ranks?.[key]).map(key => [key, {
      status: state(ranks[key].status), rows: count(ranks[key].rows),
      updatedAt: typeof ranks[key].updatedAt === 'string' && Number.isFinite(Date.parse(ranks[key].updatedAt)) ? new Date(ranks[key].updatedAt).toISOString() : null
    }])),
    counts: Object.fromEntries(['heroes', 'rankRows', 'patches'].map(key => [key, count(counts?.[key])]))
  } };
}

function fresh(value, maxAge, epoch, now) {
  const time = Date.parse(value?.updatedAt);
  return Boolean(value?.data) && value.patchEpoch === epoch && Number.isFinite(time) && now - time <= maxAge;
}

const refreshKey = key => `eclipse:mlbb:public:${key}`;

async function settleRefresh(store, key, cooldownMs) {
  // Keep the cooldown after completion/failure, but let other instances know
  // there is no longer an active request to wait for.
  await store.setJSON(refreshKey(key), { state: 'settled' }, { ttlSeconds: Math.ceil(cooldownMs / 1000) });
}

async function reserveRefresh(store, key, cooldownMs, limit) {
  // A failed provider request also consumes its cooldown. No unbounded retry
  // loop, user-controlled Redis key, or per-visitor key is created here.
  if (!await store.acquireLock(refreshKey(key), JSON.stringify({ state: 'pending' }), cooldownMs)) return false;
  const kind = key.split(':')[0];
  try {
    const window = await store.incrementWindow(`eclipse:mlbb:public:budget:${kind}`, HOUR);
    if (Number(window.count) <= limit) return true;
  } catch (error) {
    await settleRefresh(store, key, cooldownMs).catch(() => {});
    throw error;
  }
  await settleRefresh(store, key, cooldownMs);
  return false;
}

async function waitForSharedCache(store, key, read, waitMs = 12000) {
  // Separate serverless instances cannot share an in-memory Promise. The Redis
  // cache is the rendezvous; at most nine polls and a hard deadline, no retry
  // of the upstream fetch and no additional refresh-budget charge.
  const controller = new AbortController();
  let timer;
  const poll = async () => {
    for (const pause of [0, 50, 100, 200, 400, 800, 1600, 3200, 4200]) {
      if (controller.signal.aborted) return null;
      if (pause) await delay(pause, undefined, { signal: controller.signal });
      const cached = await read();
      if (cached || controller.signal.aborted) return cached;
      const marker = await store.getJSON(refreshKey(key));
      // Memory stores return lock tokens literally; Redis parses the JSON.
      const pending = marker?.state === 'pending' || marker === '{"state":"pending"}';
      if (!pending) return read(); // Completion may have raced the last read.
    }
    return null;
  };
  try {
    return await Promise.race([
      poll().catch(error => { if (controller.signal.aborted) return null; throw error; }),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.max(0, Math.min(waitMs, 12000))); })
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}

export async function readPublicHero(id, { store, rank, days, now = Date.now(), intelligence = getHeroIntelligence, fetchImpl, waitMs } = {}) {
  const catalog = await store.getJSON(MLBB_KEYS.catalog);
  findPublicHero(catalog, id); // Must run before ANY provider request or cache write.
  const readSnapshot = () => Promise.all([
    store.getJSON(MLBB_KEYS.hero(id)),
    store.getJSON(MLBB_KEYS.matchups(id, rank, days)),
    store.getJSON(MLBB_KEYS.patchEpoch)
  ]);
  let [detail, matchup, epoch] = await readSnapshot();
  const isCurrent = () => fresh(detail, MLBB_FRESHNESS.heroMs, epoch, now) && fresh(matchup, MLBB_FRESHNESS.rankMs, epoch, now);
  const fallback = () => {
    if (!detail?.data) throw new MlbbSyncError('Hero dossier yangilanmoqda', { code: 'MLBB_REFRESH_BUSY', status: 503 });
    return {
      ...detail,
      ...(!isCurrent() ? { refreshError: { code: 'REFRESH_PENDING' } } : {}),
      data: { ...detail.data, matchups: {
        ...(matchup?.data || {}), rank, days, updatedAt: matchup?.updatedAt || null,
        ...(!fresh(matchup, MLBB_FRESHNESS.rankMs, epoch, now) ? { error: { code: 'MATCHUPS_TEMPORARILY_UNAVAILABLE' } } : {})
      } }
    };
  };
  if (isCurrent()) return fallback();
  const key = `dossier:${id}:${rank}:${days}`;
  const cooldown = 15 * 60 * 1000;
  if (!await reserveRefresh(store, key, cooldown, PUBLIC_REFRESH_LIMITS.dossiersPerHour)) {
    if (!detail?.data) {
      const snapshot = await waitForSharedCache(store, key, async () => {
        const values = await readSnapshot();
        return values[0]?.data ? values : null;
      }, waitMs);
      if (snapshot) [detail, matchup, epoch] = snapshot;
    }
    return fallback();
  }
  try { return await intelligence(id, { store, rank, days, now, fetchImpl }); }
  finally { await settleRefresh(store, key, cooldown).catch(() => {}); }
}

export async function readPublicPortrait(id, url, { store, fetchImpl = globalThis.fetch, waitMs } = {}) {
  const key = `eclipse:mlbb:public:portrait-cache:${id}`;
  const readCached = async () => {
    const cached = await store.getJSON(key);
    if (cached?.url === url.href && ['image/png', 'image/jpeg', 'image/webp'].includes(cached.type) && typeof cached.base64 === 'string') {
      return { type: cached.type, bytes: Buffer.from(cached.base64, 'base64') };
    }
    return null;
  };
  const cached = await readCached();
  if (cached) return cached;
  const refresh = `portrait:${id}`;
  const cooldown = 60 * 1000;
  if (!await reserveRefresh(store, refresh, cooldown, PUBLIC_REFRESH_LIMITS.portraitsPerHour)) {
    const shared = await waitForSharedCache(store, refresh, readCached, waitMs);
    if (shared) return shared;
    throw new MlbbSyncError('Portret yangilanmoqda', { code: 'MLBB_REFRESH_BUSY', status: 503 });
  }
  try {
    const upstream = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const type = (upstream.headers.get('content-type') || '').split(';')[0];
    if (!upstream.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) {
      throw new MlbbSyncError('Portret manbasi javob bermadi');
    }
    const reader = upstream.body.getReader(); const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new MlbbSyncError('Portret hajmi katta', { status: 413 });
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    // Finite canonical IDs, one-day TTL, and small portraits only. Never cache
    // arbitrary remote content or large files in Redis.
    if (bytes.length <= 512 * 1024) await store.setJSON(key, { url: url.href, type, base64: bytes.toString('base64') }, { ttlSeconds: 86400 });
    return { type, bytes };
  } finally { await settleRefresh(store, refresh, cooldown).catch(() => {}); }
}
