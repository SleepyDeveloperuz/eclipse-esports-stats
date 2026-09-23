import crypto from 'node:crypto';
import { fetchHeroCatalog, fetchHeroDetail, fetchHeroMatchups, fetchHeroRank } from './providers/rone.js';
import { fetchPatchDetail, fetchPatchFeed } from './providers/moonton-news.js';
import { mergeHeroCatalog } from './normalize.js';
import { parsePatchArticle, PATCH_PARSER_VERSION } from './patch-parser.js';
import { buildEclipseTier, tierMethodology } from './tier.js';
import { appendRankSnapshot } from './timeline.js';
import { createRedisStore, MLBB_KEYS } from './store.js';
import { MLBB_RANKS, MLBB_RANK_VALUES, MLBB_DAY_VALUES } from './ranks.js';

export const MLBB_SCHEMA_VERSION = 1;
export const MLBB_DEFAULT_RANK = 'mythic';
export const MLBB_DEFAULT_DAYS = '7';
export const MLBB_FRESHNESS = Object.freeze({
  catalogMs: 7 * 24 * 60 * 60 * 1000,
  rankMs: 36 * 60 * 60 * 1000,
  patchesMs: 36 * 60 * 60 * 1000,
  heroMs: 7 * 24 * 60 * 60 * 1000
});

export class MlbbSyncError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MlbbSyncError';
    this.code = options.code || 'MLBB_SYNC_FAILED';
    this.status = options.status || 502;
    this.cause = options.cause;
  }
}

export function isMlbbMetaEnabled(env = process.env) {
  return String(env.MLBB_META_ENABLED ?? 'true').toLowerCase() !== 'false';
}

function isoNow(now) {
  if (typeof now === 'string' && !Number.isNaN(Date.parse(now))) return new Date(now).toISOString();
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now.toISOString();
  return new Date().toISOString();
}

function envelope(data, updatedAt, source) {
  return { schemaVersion: MLBB_SCHEMA_VERSION, data, updatedAt, source };
}

function safeError(error) {
  return {
    code: error?.code || 'MLBB_SYNC_FAILED',
    message: String(error?.message || 'Sync bajarilmadi').slice(0, 240)
  };
}

function catalogDetailSummary(base, detail) {
  return {
    ...base,
    id: detail.id,
    key: detail.key || base.key,
    name: detail.name || base.name,
    aliases: [...new Set([...(base.aliases || []), ...(detail.aliases || [])])],
    roles: detail.roles?.length ? detail.roles : base.roles,
    lanes: detail.lanes?.length ? detail.lanes : base.lanes,
    specialties: detail.specialties?.length ? detail.specialties : base.specialties,
    images: {
      ...base.images,
      ...Object.fromEntries(Object.entries(detail.images || {}).filter(([, value]) => value))
    },
    officialUrl: detail.officialUrl || base.officialUrl,
    availability: detail.availability || base.availability,
    lastSeenAt: detail.lastSeenAt || base.lastSeenAt,
    detailsUpdatedAt: detail.detailsUpdatedAt || base.detailsUpdatedAt,
    source: detail.source || base.source,
    story: '',
    skills: []
  };
}

function staleState(value, maxAgeMs, now = Date.now()) {
  if (!value?.updatedAt || Number.isNaN(Date.parse(value.updatedAt))) return 'missing';
  return now - Date.parse(value.updatedAt) > maxAgeMs ? 'stale' : 'fresh';
}

export function publicCacheState(value, maxAgeMs, now = Date.now()) {
  return {
    status: value?.refreshError || value?.processing?.pending > 0 || value?.processing?.failures > 0 || value?.data?.matchups?.error
      ? 'partial' : staleState(value, maxAgeMs, now),
    updatedAt: value?.updatedAt || null,
    data: value?.data ?? null,
    source: value?.source || null,
    processing: value?.processing || null
  };
}

async function syncCatalog(context) {
  const { store, fetchImpl, now } = context;
  const previous = await store.getJSON(MLBB_KEYS.catalog);
  const incoming = await fetchHeroCatalog({ fetchImpl, now });
  const previousHeroes = Array.isArray(previous?.data) ? previous.data : [];
  if (previousHeroes.length && incoming.length < previousHeroes.length * 0.80) {
    throw new MlbbSyncError('Hero catalog keskin qisqardi; last-known-good saqlandi', { code: 'CATALOG_DROP_REJECTED' });
  }
  let merged = mergeHeroCatalog(previousHeroes, incoming, now);
  const oldIds = new Set(previousHeroes.map(hero => Number(hero.id)));
  merged = merged.map(hero => ({ ...hero, discoveredAt: oldIds.has(Number(hero.id))
    ? previousHeroes.find(old => Number(old.id) === Number(hero.id))?.discoveredAt || null
    : previousHeroes.length ? now : null }));

  // Reuse cached lane metadata with bounded reads, without an all-hero provider crawl.
  if (previousHeroes.length) {
    let cursor = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < merged.length) {
        const index = cursor++, hero = merged[index];
        if (hero.lanes?.length) continue;
        try {
          const cached = await store.getJSON(MLBB_KEYS.hero(hero.id));
          if (cached?.data?.id === hero.id && cached.data.lanes?.length) merged[index] = {
            ...hero, lanes: cached.data.lanes, roles: hero.roles?.length ? hero.roles : cached.data.roles || [], laneMetadataUpdatedAt: cached.updatedAt || null
          };
        } catch (_) { /* Optional metadata must not invalidate the catalog. */ }
      }
    }));
  }

  // A full first sync would require one request per hero. Details are hydrated
  // on demand; only heroes discovered after an established catalog are eagerly hydrated.
  if (previousHeroes.length) {
    const previousIds = new Set(previousHeroes.map(hero => Number(hero.id)));
    const newHeroes = merged.filter(hero => !previousIds.has(Number(hero.id))).slice(0, 5);
    const detailed = await Promise.allSettled(newHeroes.map(hero =>
      fetchHeroDetail(hero.id, { fetchImpl, now, catalogHero: hero })
    ));
    const detailsById = new Map(detailed
      .filter(result => result.status === 'fulfilled')
      .map(result => [result.value.id, result.value]));
    merged = merged.map(hero => {
      const detail = detailsById.get(hero.id);
      return detail ? catalogDetailSummary(hero, detail) : hero;
    });
  }

  const value = envelope(merged, now, {
    provider: 'Rone Arena API',
    official: false,
    attributionRequired: true
  });
  await store.setJSON(MLBB_KEYS.catalog, value);
  return value;
}

async function syncRank(context) {
  const { store, fetchImpl, now, rank, days } = context;
  const rows = context.rows || await fetchHeroRank({ fetchImpl, now, rank, days });
  const previous = await store.getJSON(MLBB_KEYS.rank(rank, days));
  const historyKey = MLBB_KEYS.rankTimeline(rank, days);
  const [history, patches] = await Promise.all([store.getJSON(historyKey), store.getJSON(MLBB_KEYS.patches)]);
  const release = patches?.data?.find(item => item.classification === 'official-release'
    || (/patch notes/i.test(item.title || '') && !/preview|advanced server/i.test(item.title || '')));
  const patchEpoch = release?.contentHash && release.classification === 'official-release' && release.parsedAt === patches.updatedAt
    && staleState(patches, MLBB_FRESHNESS.patchesMs, Date.parse(now)) === 'fresh' ? release.id + ':' + release.contentHash : null;
  const patchPublishedAt = release?.publishedAt || null;
  const tiers = buildEclipseTier(rows, { rank, days, updatedAt: now, now: Date.parse(now), previous, history: history?.data, patchEpoch, patchPublishedAt });
  const previousCount = previous?.data?.official?.length || 0;
  if (previousCount && rows.length < previousCount * 0.95) {
    throw new MlbbSyncError('Rank ro‘yxati keskin qisqardi; oxirgi sog‘lom nusxa saqlandi', { code: 'RANK_COVERAGE_DROP' });
  }
  const comparison = buildTierComparison(previous, tiers, { rank, days, now, patchEpoch });
  const value = envelope({
    official: rows,
    eclipse: tiers,
    comparison,
    rank,
    days,
    methodology: tierMethodology(), patchEpoch, patchPublishedAt
  }, now, {
    provider: 'Rone Arena API',
    official: false,
    originalSource: 'Mobile Legends hero rank data'
  });
  await store.setJSON(MLBB_KEYS.rank(rank, days), value);

  // New snapshots are bounded per cohort. Keep the legacy history read-only;
  // public Timeline merges it without migrating/deleting historical records.
  await store.setJSON(historyKey, envelope(appendRankSnapshot(history?.data, tiers, {
    rank, days, updatedAt: now, methodologyVersion: tierMethodology().version, patchEpoch
  }), now, value.source));
  return value;
}

export function buildTierComparison(previous, tiers, { rank, days, now, patchEpoch }) {
  if (patchEpoch !== undefined && (!patchEpoch || previous?.data?.patchEpoch !== patchEpoch)) return null;
  if (!previous?.updatedAt || previous.updatedAt >= now || previous.data?.rank !== rank || Number(previous.data?.days) !== Number(days) || previous.data?.methodology?.version !== tierMethodology().version || !Array.isArray(previous.data?.eclipse)) return null;
  const old = new Map(previous.data.eclipse.map(row => [Number(row.heroId), row]));
  return { previousUpdatedAt: previous.updatedAt, methodologyVersion: tierMethodology().version, changes: tiers.map(row => {
    const before = old.get(Number(row.heroId));
    return { heroId: row.heroId, previousTier: before?.tier || null, tier: row.tier,
      rankDelta: Number.isInteger(before?.eclipseRank) && Number.isInteger(row.eclipseRank) ? before.eclipseRank - row.eclipseRank : null, isNew: !before };
  }) };
}

async function syncPatches(context, catalogValue) {
  const { store, fetchImpl, now } = context;
  const previous = await store.getJSON(MLBB_KEYS.patches);
  const previousItems = Array.isArray(previous?.data) ? previous.data : [];
  const previousById = new Map(previousItems.map(item => [Number(item.id), item]));
  const feed = await fetchPatchFeed({ fetchImpl, now });
  const latestRelease = feed.find(item => !/preview|advanced server/i.test(`${item.title} ${(item.tags || []).join(' ')}`));
  const candidates = feed
    .filter((item, index) => /patch notes/i.test(item.title) && (index === 0 || item.id === latestRelease?.id || previousById.get(item.id)?.parserVersion !== PATCH_PARSER_VERSION))
    .slice(0, previousItems.length ? 5 : 3);
  const detailResults = await Promise.allSettled(candidates.map(async item => {
    const record = await fetchPatchDetail(item.id, { fetchImpl, now });
    return { ...parsePatchArticle({ ...item, body: record.data.body }, catalogValue?.data || [], { now }),
      contentHash: crypto.createHash('sha256').update(record.data.body).digest('hex'), parseStatus: 'ready' };
  }));
  const parsedById = new Map(detailResults
    .filter(result => result.status === 'fulfilled')
    .map(result => [result.value.id, result.value]));
  const items = feed.map(item => parsedById.get(item.id) || previousById.get(item.id) || {
    ...item,
    classification: /preview|advanced server/i.test(`${item.title} ${(item.tags || []).join(' ')}`) ? 'preview' : 'patch-update',
    confidence: 'review',
    overview: [],
    newHeroes: [],
    heroAdjustments: [],
    battlefieldSignals: [],
    changeCounts: { buffs: 0, nerfs: 0, adjustments: 0 },
    parsedAt: null,
    parseStatus: 'pending',
    source: { provider: 'Official Mobile Legends CMS', official: true }
  });
  const value = envelope(items.slice(0, 30), now, {
    provider: 'Official Mobile Legends CMS',
    official: true,
    url: 'https://www.mobilelegends.com/news'
  });
  const failures = detailResults.filter(result => result.status === 'rejected').length;
  value.processing = { ready: items.filter(item => item.parsedAt).length, pending: items.filter(item => !item.parsedAt).length, failures };
  const release = items.find(item => item.classification === 'official-release' && item.contentHash);
  if (release) await store.setJSON(MLBB_KEYS.patchEpoch, `${release.id}:${release.contentHash}`);
  await store.setJSON(MLBB_KEYS.patches, value);
  return value;
}

export async function syncMlbbData(options = {}) {
  const env = options.env || process.env;
  if (!isMlbbMetaEnabled(env)) {
    throw new MlbbSyncError('MLBB Meta Lab feature flag orqali o‘chirilgan', { code: 'MLBB_META_DISABLED', status: 503 });
  }
  const store = options.store || createRedisStore({ env, fetchImpl: options.fetchImpl });
  const now = isoNow(options.now);
  const rank = String(options.rank || env.MLBB_META_RANK || MLBB_DEFAULT_RANK).toLowerCase();
  const days = String(options.days || env.MLBB_META_DAYS || MLBB_DEFAULT_DAYS);
  if (!MLBB_RANK_VALUES.has(rank) || !MLBB_DAY_VALUES.has(days)) throw new MlbbSyncError('Rank yoki davr yaroqsiz', { code: 'INVALID_META_FILTER', status: 400 });
  const ranks = options.rank ? [rank] : [...new Set([...MLBB_RANKS, rank])];
  const lockToken = crypto.randomUUID();
  const locked = await store.acquireLock(MLBB_KEYS.syncLock, lockToken, 240_000);
  if (!locked) throw new MlbbSyncError('Boshqa MLBB sync hozir ishlayapti', { code: 'MLBB_SYNC_LOCKED', status: 409 });

  const results = {};
  const errors = {};
  try {
    try {
      results.catalog = await syncCatalog({ store, fetchImpl: options.fetchImpl, now });
    } catch (error) {
      errors.catalog = safeError(error);
      results.catalog = await store.getJSON(MLBB_KEYS.catalog);
    }
    try {
      results.patches = await syncPatches({ store, fetchImpl: options.fetchImpl, now }, results.catalog);
    } catch (error) {
      errors.patches = safeError(error);
      results.patches = await store.getJSON(MLBB_KEYS.patches);
    }
    const rankStates = {};
    const rankFetches = await Promise.allSettled(ranks.map(cohort => fetchHeroRank({ fetchImpl: options.fetchImpl, now, rank: cohort, days })));
    // Sequential writes preserve every cohort in the shared history under the sync lock.
    for (const [index, cohort] of ranks.entries()) {
      let value;
      try {
        if (rankFetches[index].status === 'rejected') throw rankFetches[index].reason;
        value = await syncRank({ store, fetchImpl: options.fetchImpl, now, rank: cohort, days, rows: rankFetches[index].value });
      } catch (error) {
        errors[`rank:${cohort}`] = safeError(error);
        value = await store.getJSON(MLBB_KEYS.rank(cohort, days));
      }
      rankStates[cohort] = { status: staleState(value, MLBB_FRESHNESS.rankMs, Date.parse(now)), updatedAt: value?.updatedAt || null, rows: value?.data?.official?.length || 0 };
      if (cohort === rank) results.rank = value;
    }
    const succeeded = Object.values(results).filter(Boolean).length;
    const health = envelope({
      ok: Object.keys(errors).length === 0 && !results.patches?.processing?.pending && !results.patches?.processing?.failures,
      partial: succeeded > 0 && (Object.keys(errors).length > 0 || results.patches?.processing?.pending > 0 || results.patches?.processing?.failures > 0),
      patchProcessing: results.patches?.processing || null,
      rank,
      ranks: rankStates,
      days,
      datasets: {
        catalog: staleState(results.catalog, MLBB_FRESHNESS.catalogMs, Date.parse(now)),
        rank: staleState(results.rank, MLBB_FRESHNESS.rankMs, Date.parse(now)),
        patches: staleState(results.patches, MLBB_FRESHNESS.patchesMs, Date.parse(now))
      },
      counts: {
        heroes: results.catalog?.data?.length || 0,
        rankRows: results.rank?.data?.official?.length || 0,
        patches: results.patches?.data?.length || 0
      },
      errors
    }, now, { provider: 'Eclipse MLBB Sync' });
    await store.setJSON(MLBB_KEYS.health, health);
    if (!succeeded) throw new MlbbSyncError('Barcha MLBB manbalari ishlamadi; cache o‘zgarmadi', { code: 'MLBB_ALL_PROVIDERS_FAILED' });
    return health;
  } finally {
    await store.releaseLock(MLBB_KEYS.syncLock, lockToken).catch(() => {});
  }
}

export async function getHeroIntelligence(heroId, options = {}) {
  const env = options.env || process.env;
  const store = options.store || createRedisStore({ env, fetchImpl: options.fetchImpl });
  const id = Number(heroId);
  if (!Number.isInteger(id) || id <= 0) throw new MlbbSyncError('Hero ID yaroqsiz', { code: 'INVALID_HERO_ID', status: 400 });
  const rank = String(options.rank || env.MLBB_META_RANK || MLBB_DEFAULT_RANK).toLowerCase();
  const days = String(options.days || env.MLBB_META_DAYS || MLBB_DEFAULT_DAYS);
  if (!MLBB_RANK_VALUES.has(rank) || !MLBB_DAY_VALUES.has(days)) throw new MlbbSyncError('Rank yoki davr yaroqsiz', { code: 'INVALID_COHORT', status: 400 });
  const cached = await store.getJSON(MLBB_KEYS.hero(id));
  const patchEpoch = await store.getJSON(MLBB_KEYS.patchEpoch);
  const nowDate = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const now = nowDate.toISOString();
  const detailTask = async () => {
    if (!options.force && cached?.patchEpoch === patchEpoch && staleState(cached, MLBB_FRESHNESS.heroMs, nowDate.getTime()) === 'fresh') return cached;
    try {
      const catalog = await store.getJSON(MLBB_KEYS.catalog);
      const catalogHero = catalog?.data?.find(hero => Number(hero.id) === id);
      if (!catalogHero) throw new MlbbSyncError('Hero catalogdan topilmadi', { code: 'HERO_NOT_FOUND', status: 404 });
      const detail = await fetchHeroDetail(id, { fetchImpl: options.fetchImpl, now, catalogHero });
      const value = { ...envelope(detail, now, detail.source), patchEpoch };
      await store.setJSON(MLBB_KEYS.hero(id), value, { ttlSeconds: 30 * 24 * 60 * 60 });
      return value;
    } catch (error) {
      if (!cached?.data) throw error;
      return { ...cached, refreshError: safeError(error) };
    }
  };
  const matchupTask = async () => {
    const key = MLBB_KEYS.matchups(id, rank, days);
    const old = await store.getJSON(key);
    if (!options.force && old?.patchEpoch === patchEpoch && staleState(old, MLBB_FRESHNESS.rankMs, nowDate.getTime()) === 'fresh') return old;
    try {
      const data = await fetchHeroMatchups(id, { fetchImpl: options.fetchImpl, now, rank, days });
      const value = { ...envelope(data, now, null), patchEpoch };
      await store.setJSON(key, value, { ttlSeconds: 30 * 24 * 60 * 60 });
      return value;
    } catch (error) {
      return { ...(old || {}), data: { ...(old?.data || {}), error: safeError(error) } };
    }
  };
  const [detail, matchup] = await Promise.all([detailTask(), matchupTask()]);
  return { ...detail, data: { ...detail.data, matchups: { ...matchup.data, rank, days, updatedAt: matchup.updatedAt || null } } };
}

export async function readMlbbCache(options = {}) {
  const env = options.env || process.env;
  const store = options.store || createRedisStore({ env, fetchImpl: options.fetchImpl });
  const rank = String(options.rank || env.MLBB_META_RANK || MLBB_DEFAULT_RANK).toLowerCase();
  const days = String(options.days || env.MLBB_META_DAYS || MLBB_DEFAULT_DAYS);
  const [catalog, meta, patches, health] = await Promise.all([
    store.getJSON(MLBB_KEYS.catalog),
    store.getJSON(MLBB_KEYS.rank(rank, days)),
    store.getJSON(MLBB_KEYS.patches),
    store.getJSON(MLBB_KEYS.health)
  ]);
  return { catalog, meta, patches, health, rank, days };
}
