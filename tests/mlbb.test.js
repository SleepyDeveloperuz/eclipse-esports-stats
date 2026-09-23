import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeHeroCatalog,
  normalizeHeroCatalog,
  normalizeHeroDetail,
  normalizeRankPayload
} from '../lib/mlbb/normalize.js';
import { parsePatchArticle } from '../lib/mlbb/patch-parser.js';
import { buildEclipseTier } from '../lib/mlbb/tier.js';
import { createMemoryStore, createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { syncMlbbData } from '../lib/mlbb/sync.js';

function basicRecord(id, name = `Hero ${id}`) {
  return {
    data: {
      hero_id: id,
      hero: { data: { name, head: `https://akmweb.youngjoygame.com/hero-${id}.png` } },
      relation: { assist: { target_hero_id: [] }, strong: { target_hero_id: [] }, weak: { target_hero_id: [] } }
    }
  };
}

function rankRecord(id) {
  return {
    data: {
      main_heroid: id,
      main_hero: { data: { name: `Hero ${id}`, head: `https://akmweb.youngjoygame.com/hero-${id}.png` } },
      main_hero_win_rate: 0.45 + ((id % 20) / 200),
      main_hero_appearance_rate: 0.001 + (id / 10_000),
      main_hero_ban_rate: (id % 30) / 100
    }
  };
}

test('canonical hero normalization keeps safe media and strips skill markup', () => {
  const catalog = normalizeHeroCatalog({ code: 0, data: { records: [basicRecord(17, 'Fanny'), basicRecord(18, 'Layla')], total: 2 } }, { minRecords: 2 });
  const detail = normalizeHeroDetail({
    code: 0,
    data: {
      total: 1,
      records: [{
        updatedAt: 1_788_000_000_000,
        data: {
          hero_id: 17,
          hero: { data: {
            name: 'Fanny', sortlabel: ['Assassin'], roadsortlabel: ['Jungle'], speciality: ['Chase'],
            heroskilllist: [{ skilllist: [{
              skillid: 1710, skillname: 'Tornado Strike',
              skilldesc: 'Deals <font color="red">Physical Damage</font>.',
              skillicon: 'https://akmweb.youngjoygame.com/skill.png'
            }] }]
          } },
          relation: { weak: { target_hero_id: [62, 78], desc: 'Mobility control.' } }
        }
      }]
    }
  }, { catalogHero: catalog[0] });

  assert.equal(catalog[0].id, 17);
  assert.equal(detail.skills[0].description, 'Deals Physical Damage.');
  assert.deepEqual(detail.roles, ['Assassin']);
  assert.deepEqual(detail.relations.weakAgainst, [62, 78]);
});

test('Eclipse tier keeps exact source rates and labels low visibility separately', () => {
  const rows = normalizeRankPayload({
    code: 0,
    data: { records: Array.from({ length: 20 }, (_, index) => rankRecord(index + 1)), total: 20 }
  }, { minRecords: 20, rank: 'mythic', days: '7' });
  const tier = buildEclipseTier(rows);
  assert.equal(tier.length, 20);
  assert.ok(tier.some(row => row.tier === 'SS'), 'Missing history must not suppress strong heroes');
  assert.ok(tier.some(row => row.visibility === 'low'));
  const source = rows.find(row => row.heroId === tier[0].heroId);
  assert.equal(tier[0].winRate, source.winRate);
  assert.equal(tier[0].pickRate, source.pickRate);
});

test('patch parser detects new heroes and canonical buff/nerf signals without raw HTML', () => {
  const result = parsePatchArticle({
    id: 42,
    title: '2.2.00 PATCH NOTES',
    officialUrl: 'https://www.mobilelegends.com/news/articleldetail?newsid=42',
    body: '<div><strong>From the Designers</strong></div><div>Roam heroes get a clearer identity.</div><div><strong>1. New Hero</strong></div><div>New Hero: Solar Blade - Hero 3</div><div>A fast fighter.</div><div><strong>2. Hero Adjustments</strong></div><div>[Hero 1] (&uarr;)</div><div>Damage increased.</div><div>[Hero 2] (&darr;)</div><div>Cooldown increased.</div>'
  }, [{ id: 1, name: 'Hero 1' }, { id: 2, name: 'Hero 2' }, { id: 3, name: 'Hero 3' }]);
  assert.equal(result.newHeroes[0].heroId, 3);
  assert.deepEqual(result.heroAdjustments.map(item => item.change), ['buff', 'nerf']);
  assert.equal('body' in result, false);
});

test('catalog removal requires three consecutive valid missing snapshots', () => {
  const existing = [{ ...normalizeHeroCatalog({ code: 0, data: { records: [basicRecord(1)], total: 1 } }, { minRecords: 1 })[0], missingSyncs: 0 }];
  const first = mergeHeroCatalog(existing, [], '2026-09-01T00:00:00.000Z');
  const second = mergeHeroCatalog(first, [], '2026-09-02T00:00:00.000Z');
  const third = mergeHeroCatalog(second, [], '2026-09-03T00:00:00.000Z');
  assert.equal(first[0].availability, 'checking');
  assert.equal(second[0].availability, 'checking');
  assert.equal(third[0].availability, 'unavailable');
});

test('shared catalog stays compact after a full hero dossier has been cached', () => {
  const base = normalizeHeroCatalog({
    code: 0,
    data: { records: [basicRecord(17, 'Fanny')], total: 1 }
  }, { minRecords: 1 })[0];
  const merged = mergeHeroCatalog([{
    ...base,
    story: 'Long dossier story',
    skills: [{ id: 1, name: 'Steel Cable', description: 'Long skill detail' }],
    relations: {
      ...base.relations,
      descriptions: { synergies: 'Long relation copy', strongAgainst: '', weakAgainst: '' }
    },
    detailsUpdatedAt: '2026-08-31T00:00:00.000Z'
  }], [base], '2026-09-01T00:00:00.000Z');

  assert.equal(merged[0].story, '');
  assert.deepEqual(merged[0].skills, []);
  assert.equal(merged[0].relations.descriptions.synergies, '');
  assert.equal(merged[0].detailsUpdatedAt, '2026-08-31T00:00:00.000Z');
});

test('Redis store caps response size and never exposes credentials in its error', async () => {
  const token = 'private-upstash-token';
  const store = createRedisStore({
    env: {
      UPSTASH_REDIS_REST_URL: 'https://eclipse-test.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: token
    },
    maxBytes: 8,
    fetchImpl: async () => new Response('{"result":"too-large"}', { status: 200 })
  });
  await assert.rejects(
    () => store.getJSON('catalog'),
    error => error.code === 'MLBB_STORAGE_RESPONSE_TOO_LARGE' && !error.message.includes(token)
  );
});

test('Redis store turns aborted requests into a safe timeout error', async () => {
  const store = createRedisStore({
    env: {
      UPSTASH_REDIS_REST_URL: 'https://eclipse-test.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-token'
    },
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })
  });
  await assert.rejects(
    () => store.getJSON('catalog'),
    error => error.code === 'MLBB_STORAGE_TIMEOUT' && error.status === 503
  );
});

test('Redis store accepts the current Vercel Marketplace KV credential names', async () => {
  const calls = [];
  const store = createRedisStore({
    env: {
      KV_REST_API_URL: 'https://eclipse-marketplace.upstash.io',
      KV_REST_API_TOKEN: 'marketplace-token'
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, authorization: options.headers.Authorization });
      return new Response('{"result":null}', { status: 200 });
    }
  });
  assert.equal(await store.getJSON('catalog'), null);
  assert.equal(calls[0].url, 'https://eclipse-marketplace.upstash.io');
  assert.equal(calls[0].authorization, 'Bearer marketplace-token');
});

test('sync writes validated datasets and keeps last-known-good catalog on malformed refresh', async () => {
  const store = createMemoryStore();
  let breakCatalog = false;
  let breakEpic = false;
  const seenRanks = new Set();
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    let payload;
    if (href.includes('/api/heroes/rank')) {
      const rank = new URL(href).searchParams.get('rank'); seenRanks.add(rank);
      if (rank === 'epic' && breakEpic) return new Response(JSON.stringify({ code: 0, data: { records: [], total: 0 } }), { status: 200 });
      payload = { code: 0, data: { records: Array.from({ length: 100 }, (_, index) => rankRecord(index + 1)), total: 100 } };
      if (rank === 'epic') payload.data.records.forEach(row => { row.data.main_hero_win_rate = 1 - row.data.main_hero_win_rate; });
    } else if (href.includes('/api/heroes?')) {
      payload = { code: 0, data: { records: breakCatalog ? [basicRecord(1)] : Array.from({ length: 100 }, (_, index) => basicRecord(index + 1)), total: breakCatalog ? 1 : 100 } };
    } else if (href.includes('api.gms.moontontech.com')) {
      const body = JSON.parse(options.body || '{}');
      if (body.filters?.some(filter => filter.field === 'id')) {
        payload = { code: 0, data: { total: 1, records: [{ id: 900, data: { title: '2.2.00 PATCH NOTES', body: '<div><strong>From the Designers</strong></div><div>Stable patch data for validation.</div><div>1. New Hero</div><div>More lines.</div>'.repeat(12) } }] } };
      } else {
        payload = { code: 0, data: { total: 1, records: [{ id: 900, data: { title: '2.2.00 PATCH NOTES', brief: 'Patch', kind: 'article', start_time: 1_788_000_000_000, channel: [{ id: 2678956, title: 'Patch' }] } }] } };
      }
    } else {
      throw new Error(`Unexpected URL ${href}`);
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const first = await syncMlbbData({ store, fetchImpl, now: '2026-09-01T00:00:00.000Z' });
  assert.equal(first.data.ok, true);
  assert.deepEqual([...seenRanks].sort(), ['epic', 'glory', 'legend', 'mythic']);
  const epicBefore = await store.getJSON(MLBB_KEYS.rank('epic', '7'));
  const mythicBefore = await store.getJSON(MLBB_KEYS.rank('mythic', '7'));
  assert.notDeepEqual(epicBefore.data.eclipse.map(row => row.heroId), mythicBefore.data.eclipse.map(row => row.heroId));
  assert.ok(mythicBefore.data.eclipse.every(row => row.quality.status !== 'stable'));
  assert.ok(mythicBefore.data.eclipse.some(row => row.tier === 'SS'));
  assert.equal(await store.getJSON(MLBB_KEYS.rankHistory), null, 'Legacy history is not rewritten');
  for (const rank of seenRanks) assert.equal((await store.getJSON(MLBB_KEYS.rankTimeline(rank, '7'))).data.snapshots.length, 1);
  assert.equal((await store.getJSON(MLBB_KEYS.catalog)).data.length, 100);
  assert.ok((await store.getJSON(MLBB_KEYS.catalog)).data.every(hero => hero.discoveredAt === null), 'Initial import must not label every hero as newly discovered');

  breakCatalog = true;
  breakEpic = true;
  const second = await syncMlbbData({ store, fetchImpl, now: '2026-09-02T00:00:00.000Z' });
  assert.equal(second.data.partial, true);
  assert.ok(second.data.errors['rank:epic']);
  assert.deepEqual(await store.getJSON(MLBB_KEYS.rank('epic', '7')), epicBefore);
  assert.equal((await store.getJSON(MLBB_KEYS.rank('glory', '7'))).updatedAt, '2026-09-02T00:00:00.000Z');
  assert.equal((await store.getJSON(MLBB_KEYS.rankTimeline('epic', '7'))).data.snapshots.length, 1);
  for (const rank of ['legend', 'mythic', 'glory']) assert.equal((await store.getJSON(MLBB_KEYS.rankTimeline(rank, '7'))).data.snapshots.length, 2);
  assert.equal(second.data.errors.catalog.code, 'UPSTREAM_SCHEMA_INVALID');
  assert.equal((await store.getJSON(MLBB_KEYS.catalog)).data.length, 100);
});
