import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchHeroCatalog,
  fetchHeroRank,
  fetchHeroDetail,
  fetchHeroMatchups,
  resetCircuitBreaker,
  isCircuitBreakerOpen,
  getProviderMode
} from '../lib/mlbb/providers/index.js';
import { syncMlbbData } from '../lib/mlbb/sync.js';
import { createMemoryStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { mergeTimelineSources, heroTimeline } from '../lib/mlbb/timeline.js';

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
      main_hero_win_rate: 0.5,
      main_hero_appearance_rate: 0.05,
      main_hero_ban_rate: 0.01
    }
  };
}

test('provider selection defaults to rone when unset or unknown', () => {
  assert.equal(getProviderMode({ env: {} }), 'rone');
  assert.equal(getProviderMode({ env: { MLBB_PROVIDER: '' } }), 'rone');
  assert.equal(getProviderMode({ env: { MLBB_PROVIDER: 'unknown-provider' } }), 'rone');
  assert.equal(getProviderMode({ env: { MLBB_PROVIDER: 'direct' } }), 'direct');
  assert.equal(getProviderMode({ env: { MLBB_PROVIDER: 'auto' } }), 'auto');
});

test('auto mode tries direct first and tags Mobile Legends public data on success', async () => {
  resetCircuitBreaker();
  const calledUrls = [];
  const fetchImpl = async (url) => {
    calledUrls.push(String(url));
    return new Response(JSON.stringify({
      code: 0,
      data: {
        total: 100,
        records: Array.from({ length: 100 }, (_, i) => basicRecord(i + 1))
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const catalog = await fetchHeroCatalog({
    fetchImpl,
    env: { MLBB_PROVIDER: 'auto' },
    requestGapMs: 0
  });

  assert.equal(catalog.length, 100);
  assert.ok(calledUrls[0].includes('api.gms.moontontech.com'));
  assert.equal(catalog.source.provider, 'Mobile Legends public data');
  assert.equal(catalog[0].source.provider, 'Mobile Legends public data');
});

test('auto mode falls back to Rone on direct error and tags Rone Arena API', async () => {
  resetCircuitBreaker();
  const calledUrls = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    calledUrls.push(href);
    if (href.includes('api.gms.moontontech.com')) {
      // Simulate direct failure (500)
      return new Response('Gateway Error', { status: 500 });
    }
    // Rone fallback succeeds
    return new Response(JSON.stringify({
      code: 0,
      data: {
        total: 100,
        records: Array.from({ length: 100 }, (_, i) => basicRecord(i + 1))
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const catalog = await fetchHeroCatalog({
    fetchImpl,
    env: { MLBB_PROVIDER: 'auto' },
    requestGapMs: 0
  });

  assert.equal(catalog.length, 100);
  assert.ok(calledUrls.some(u => u.includes('api.gms.moontontech.com')), 'Must attempt direct first');
  assert.ok(calledUrls.some(u => u.includes('arena.rone.dev')), 'Must fallback to Rone');
  assert.equal(catalog.source.provider, 'Rone Arena API');
  resetCircuitBreaker();
});

test('circuit breaker opens after direct timeout and subsequent calls skip direct', async () => {
  resetCircuitBreaker();
  const calledUrls = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    calledUrls.push(href);
    if (href.includes('api.gms.moontontech.com')) {
      throw new DOMException('Timeout', 'AbortError');
    }
    const isRank = href.includes('/rank');
    return new Response(JSON.stringify({
      code: 0,
      data: {
        total: 100,
        records: Array.from({ length: 100 }, (_, i) => isRank ? rankRecord(i + 1) : basicRecord(i + 1))
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  // Call 1: times out on direct, opens breaker, falls back to Rone
  const res1 = await fetchHeroCatalog({
    fetchImpl,
    env: { MLBB_PROVIDER: 'auto' },
    requestGapMs: 0
  });
  assert.equal(res1.length, 100);
  assert.equal(res1.source.provider, 'Rone Arena API');
  assert.equal(isCircuitBreakerOpen(), true, 'Circuit breaker must be open');

  // Call 2: breaker is open, must NOT attempt direct
  calledUrls.length = 0;
  const res2 = await fetchHeroRank({
    fetchImpl,
    env: { MLBB_PROVIDER: 'auto' },
    requestGapMs: 0,
    rank: 'mythic',
    days: '7'
  });
  assert.equal(res2.length, 100);
  assert.equal(calledUrls.length, 1);
  assert.ok(calledUrls[0].includes('arena.rone.dev'), 'Direct was skipped because breaker is open');
  resetCircuitBreaker();
});

test('syncMlbbData tags dataset envelope with real serving provider', async () => {
  resetCircuitBreaker();
  const store = createMemoryStore();
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    if (href.includes('api.gms.moontontech.com')) {
      const body = JSON.parse(options.body || '{}');
      if (body.filters?.some(f => f.field === 'id')) {
        // Patch detail
        return new Response(JSON.stringify({
          code: 0,
          data: { total: 1, records: [{ id: 900, data: { title: '2.2.00 PATCH NOTES', body: '<div>Patch content</div>'.repeat(20) } }] }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (body.filters?.some(f => f.field === 'data.channel')) {
        // Patch feed
        return new Response(JSON.stringify({
          code: 0,
          data: { total: 1, records: [{ id: 900, data: { title: '2.2.00 PATCH NOTES', start_time: 1_788_000_000_000, channel: [{ id: 2678956, title: 'Patch' }] } }] }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (href.endsWith('2756564')) {
        // Hero catalog
        return new Response(JSON.stringify({
          code: 0,
          data: { total: 100, records: Array.from({ length: 100 }, (_, i) => basicRecord(i + 1)) }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // Rank
      return new Response(JSON.stringify({
        code: 0,
        data: { total: 100, records: Array.from({ length: 100 }, (_, i) => rankRecord(i + 1)) }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected URL ${href}`);
  };

  const health = await syncMlbbData({
    store,
    fetchImpl,
    now: '2026-09-01T00:00:00.000Z',
    env: { MLBB_PROVIDER: 'direct' }
  });

  assert.equal(health.data.ok, true);
  const catalog = await store.getJSON(MLBB_KEYS.catalog);
  assert.equal(catalog.source.provider, 'Mobile Legends public data');
  assert.equal(catalog.source.official, true);

  const rank = await store.getJSON(MLBB_KEYS.rank('mythic', '7'));
  assert.equal(rank.source.provider, 'Mobile Legends public data');
  assert.equal(rank.source.official, true);

  // Timeline check
  const historyKey = MLBB_KEYS.rankTimeline('mythic', '7');
  const history = await store.getJSON(historyKey);
  assert.equal(history.source.provider, 'Mobile Legends public data');

  const mergedTimeline = mergeTimelineSources(null, history, { rank: 'mythic', days: '7' });
  assert.equal(mergedTimeline.source, 'Mobile Legends public data');

  const heroTl = heroTimeline(mergedTimeline, { heroId: 1, rank: 'mythic', days: '7' });
  assert.equal(heroTl.source, 'Mobile Legends public data');
  resetCircuitBreaker();
});
