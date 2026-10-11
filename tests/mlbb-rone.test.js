import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchHeroCatalog,
  fetchHeroRank,
  fetchHeroDetail,
  fetchHeroMatchups,
  resetAlternativeHost
} from '../lib/mlbb/providers/rone.js';
import { safeMediaUrl } from '../lib/mlbb/normalize.js';

test('rone provider retries 503 with valid alternative_endpoint once and remembers host', async () => {
  resetAlternativeHost();
  const calledUrls = [];
  const fetchImpl = async (url) => {
    calledUrls.push(String(url));
    if (calledUrls.length === 1) {
      return new Response(JSON.stringify({
        code: 503,
        details: { alternative_endpoint: 'https://backup-api.rone.dev' }
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      code: 0,
      data: {
        total: 100,
        records: Array.from({ length: 100 }, (_, i) => ({
          data: {
            hero_id: i + 1,
            hero: { data: { name: `Hero ${i + 1}`, head: 'https://akmweb.youngjoygame.com/head.png' } },
            relation: { assist: { target_hero_id: [] }, strong: { target_hero_id: [] }, weak: { target_hero_id: [] } }
          }
        }))
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const catalog = await fetchHeroCatalog({ fetchImpl, retries: 0 });
  assert.equal(catalog.length, 100);
  assert.equal(calledUrls.length, 2);
  assert.ok(calledUrls[0].startsWith('https://arena.rone.dev/api/heroes'));
  assert.ok(calledUrls[1].startsWith('https://backup-api.rone.dev/api/heroes'));

  // Next call in same invocation should reuse remembered alternative host directly
  const detailCalls = [];
  const detailFetch = async (url) => {
    detailCalls.push(String(url));
    return new Response(JSON.stringify({
      code: 0,
      data: {
        total: 1,
        records: [{
          data: {
            hero_id: 1,
            hero: { data: { name: 'Hero 1', head: 'https://akmweb.youngjoygame.com/head.png' } }
          }
        }]
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await fetchHeroDetail(1, { fetchImpl: detailFetch });
  assert.equal(detailCalls.length, 1);
  assert.ok(detailCalls[0].startsWith('https://backup-api.rone.dev/api/heroes/1'));
  resetAlternativeHost();
});

test('rone provider accepts alternative_endpoint on fastapicloud.dev', async () => {
  resetAlternativeHost();
  const calledUrls = [];
  const fetchImpl = async (url) => {
    calledUrls.push(String(url));
    if (calledUrls.length === 1) {
      return new Response(JSON.stringify({
        code: 503,
        details: { alternative_endpoint: 'https://edge.fastapicloud.dev' }
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      code: 0,
      data: {
        total: 1,
        records: [{
          data: {
            hero_id: 1,
            hero: { data: { name: 'Hero 1', head: 'https://akmweb.youngjoygame.com/head.png' } }
          }
        }]
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await fetchHeroDetail(1, { fetchImpl, retries: 0 });
  assert.equal(calledUrls.length, 2);
  assert.ok(calledUrls[1].startsWith('https://edge.fastapicloud.dev/api/heroes/1'));
  resetAlternativeHost();
});

test('rone provider ignores alternative_endpoint if not https or wrong domain and never loops', async () => {
  resetAlternativeHost();
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(JSON.stringify({
      code: 503,
      details: { alternative_endpoint: 'http://insecure.rone.dev' }
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  };

  await assert.rejects(
    () => fetchHeroCatalog({ fetchImpl, retries: 0 }),
    err => err.upstreamStatus === 503
  );
  assert.equal(calls, 1, 'Insecure endpoint must be ignored');

  // Also test non-matching domain
  calls = 0;
  const fetchImplDomain = async () => {
    calls++;
    return new Response(JSON.stringify({
      code: 503,
      details: { alternative_endpoint: 'https://malicious.com' }
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  };

  await assert.rejects(
    () => fetchHeroCatalog({ fetchImpl: fetchImplDomain, retries: 0 }),
    err => err.upstreamStatus === 503
  );
  assert.equal(calls, 1, 'Untrusted domain must be ignored');
  resetAlternativeHost();
});

test('rone provider respects RONE_BASE_URL env override', async () => {
  resetAlternativeHost();
  const calledUrls = [];
  const fetchImpl = async (url) => {
    calledUrls.push(String(url));
    return new Response(JSON.stringify({
      code: 0,
      data: {
        total: 1,
        records: [{
          data: {
            hero_id: 1,
            hero: { data: { name: 'Hero 1', head: 'https://akmweb.youngjoygame.com/head.png' } }
          }
        }]
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await fetchHeroDetail(1, {
    fetchImpl,
    env: { RONE_BASE_URL: 'https://mirror.rone.dev' }
  });

  assert.equal(calledUrls.length, 1);
  assert.ok(calledUrls[0].startsWith('https://mirror.rone.dev/api/heroes/1'));
  resetAlternativeHost();
});

test('safeMediaUrl safely unwraps wsrv.nl URLs and rejects unsafe inner hosts', () => {
  const directUrl = 'https://akmweb.youngjoygame.com/web/svnres/img/hero.png';
  assert.equal(safeMediaUrl(directUrl), directUrl);

  const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(directUrl)}`;
  assert.equal(safeMediaUrl(wsrvUrl), directUrl);

  const weservUrl = `https://images.weserv.nl/?url=${encodeURIComponent(directUrl)}`;
  assert.equal(safeMediaUrl(weservUrl), directUrl);

  // Unsafe inner hosts
  assert.equal(safeMediaUrl('https://wsrv.nl/?url=https%3A%2F%2Fattacker.com%2Fevil.png'), '');
  assert.equal(safeMediaUrl('https://wsrv.nl/?url=http%3A%2F%2Fakmweb.youngjoygame.com%2Fhero.png'), '');
  assert.equal(safeMediaUrl('https://wsrv.nl/?url='), '');
  assert.equal(safeMediaUrl('https://other-proxy.com/?url=https%3A%2F%2Fakmweb.youngjoygame.com%2Fhero.png'), '');
});
