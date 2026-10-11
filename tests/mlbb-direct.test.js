import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchHeroCatalog,
  fetchHeroRank,
  fetchHeroDetail,
  fetchHeroMatchups,
  resetGmsGate
} from '../lib/mlbb/providers/moonton-gms.js';
import {
  normalizeHeroCatalog,
  normalizeRankPayload,
  normalizeHeroDetail,
  normalizeCounterPayload
} from '../lib/mlbb/normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, 'fixtures/gms');

const fixtureCatalog = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'catalog.json'), 'utf8'));
const fixtureRank = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'rank-mythic-7d.json'), 'utf8'));
const fixtureDetail = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'detail.json'), 'utf8'));
const fixtureCounters = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'counters.json'), 'utf8'));
const fixtureCompat = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'compatibility.json'), 'utf8'));

test('moonton-gms sends exact URL, headers, and body for catalog and matches fixture normalization', async () => {
  resetGmsGate();
  let requestedUrl = null;
  let requestedHeaders = null;
  let requestedBody = null;

  const fetchImpl = async (url, options = {}) => {
    requestedUrl = String(url);
    requestedHeaders = options.headers;
    requestedBody = JSON.parse(options.body || '{}');
    return new Response(JSON.stringify(fixtureCatalog), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const heroes = await fetchHeroCatalog({ fetchImpl, requestGapMs: 0, minRecords: 1 });

  assert.equal(requestedUrl, 'https://api.gms.moontontech.com/api/gms/source/2669606/2756564');
  assert.equal(requestedHeaders['X-AppId'], '2669606');
  assert.equal(requestedHeaders['X-ActId'], '2669607');
  assert.equal(requestedHeaders['X-Lang'], 'en');
  assert.equal(requestedHeaders['User-Agent'], 'Eclipse-Command-Room/2.20');
  assert.deepEqual(requestedBody, {
    pageSize: 180,
    pageIndex: 1,
    sorts: [{ data: { field: 'hero_id', order: 'asc' }, type: 'sequence' }],
    fields: ['hero_id', 'hero.data.head', 'hero.data.name', 'hero.data.smallmap']
  });

  const expected = normalizeHeroCatalog(fixtureCatalog, {
    minRecords: 1,
    maxRecords: 180,
    source: {
      provider: 'Mobile Legends public data',
      providerUrl: 'https://www.mobilelegends.com',
      official: true,
      note: 'Direct Moonton CMS endpoints; access is undocumented and subject to change'
    }
  });
  assert.equal(heroes.length, 3);
  assert.equal(heroes[0].id, expected[0].id);
  assert.equal(heroes[0].name, expected[0].name);
  assert.equal(heroes[0].source.provider, 'Mobile Legends public data');
  assert.equal(heroes[0].source.official, true);
});

test('moonton-gms sends exact URL, body, source id and rank code for rank', async () => {
  resetGmsGate();
  let requestedUrl = null;
  let requestedBody = null;

  const fetchImpl = async (url, options = {}) => {
    requestedUrl = String(url);
    requestedBody = JSON.parse(options.body || '{}');
    return new Response(JSON.stringify(fixtureRank), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const rows = await fetchHeroRank({
    fetchImpl,
    rank: 'mythic',
    days: '7',
    requestGapMs: 0,
    minRecords: 1
  });

  assert.equal(requestedUrl, 'https://api.gms.moontontech.com/api/gms/source/2669606/2756569');
  assert.deepEqual(requestedBody, {
    pageSize: 180,
    pageIndex: 1,
    filters: [
      { field: 'bigrank', operator: 'eq', value: '7' },
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
  });

  const expected = normalizeRankPayload(fixtureRank, {
    rank: 'mythic',
    days: '7',
    minRecords: 1,
    maxRecords: 180
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].heroId, expected[0].heroId);
  assert.equal(rows[0].winRate, expected[0].winRate);
});

test('moonton-gms sends exact URL and body for hero detail', async () => {
  resetGmsGate();
  let requestedUrl = null;
  let requestedBody = null;

  const fetchImpl = async (url, options = {}) => {
    requestedUrl = String(url);
    requestedBody = JSON.parse(options.body || '{}');
    return new Response(JSON.stringify(fixtureDetail), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const detail = await fetchHeroDetail(1, { fetchImpl, requestGapMs: 0 });

  assert.equal(requestedUrl, 'https://api.gms.moontontech.com/api/gms/source/2669606/2756564');
  assert.deepEqual(requestedBody, {
    pageSize: 1,
    pageIndex: 1,
    filters: [{ field: 'hero_id', operator: 'eq', value: 1 }],
    sorts: [],
    object: []
  });

  assert.equal(detail.id, 1);
  assert.equal(detail.name, 'Miya');
  assert.equal(detail.source.provider, 'Mobile Legends public data');
});

test('moonton-gms sends exact URL and bodies for counters and compatibility sequentially', async () => {
  resetGmsGate();
  const calls = [];

  const fetchImpl = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}');
    calls.push({ url: String(url), body, time: Date.now() });
    const matchType = body.filters?.find(f => f.field === 'match_type')?.value;
    const fixture = matchType === '0' ? fixtureCounters : fixtureCompat;
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const matchups = await fetchHeroMatchups(1, {
    fetchImpl,
    rank: 'mythic',
    days: '7',
    requestGapMs: 0
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.gms.moontontech.com/api/gms/source/2669606/2756569');
  assert.equal(calls[1].url, 'https://api.gms.moontontech.com/api/gms/source/2669606/2756569');

  // Counters: match_type 0
  assert.deepEqual(calls[0].body, {
    pageSize: 1,
    pageIndex: 1,
    filters: [
      { field: 'match_type', operator: 'eq', value: '0' },
      { field: 'main_heroid', operator: 'eq', value: 1 },
      { field: 'bigrank', operator: 'eq', value: '7' }
    ],
    sorts: []
  });

  // Compatibility: match_type 1
  assert.deepEqual(calls[1].body, {
    pageSize: 1,
    pageIndex: 1,
    filters: [
      { field: 'match_type', operator: 'eq', value: '1' },
      { field: 'main_heroid', operator: 'eq', value: 1 },
      { field: 'bigrank', operator: 'eq', value: '7' }
    ],
    sorts: []
  });

  assert.ok(matchups.counters.favorable.length > 0);
  assert.ok(matchups.counters.unfavorable.length > 0);
  assert.ok(matchups.compatibility.favorable.length > 0);
});

test('moonton-gms gate serializes requests and spaces them by at least 700 ms', async () => {
  resetGmsGate();
  const startTimes = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const fetchImpl = async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    startTimes.push(Date.now());
    await new Promise(r => setTimeout(r, 20));
    inFlight--;
    return new Response(JSON.stringify(fixtureDetail), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  // Launch 3 requests simultaneously with 50ms gap
  const p1 = fetchHeroDetail(1, { fetchImpl, requestGapMs: 50 });
  const p2 = fetchHeroDetail(2, { fetchImpl, requestGapMs: 50 });
  const p3 = fetchHeroDetail(3, { fetchImpl, requestGapMs: 50 });

  await Promise.all([p1, p2, p3]);

  assert.equal(maxInFlight, 1, 'Never more than one in flight simultaneously');
  assert.equal(startTimes.length, 3);
  assert.ok(startTimes[1] - startTimes[0] >= 45, `Gap 1-0 should be >= 45ms, was ${startTimes[1] - startTimes[0]}`);
  assert.ok(startTimes[2] - startTimes[1] >= 45, `Gap 2-1 should be >= 45ms, was ${startTimes[2] - startTimes[1]}`);
  resetGmsGate();
});
