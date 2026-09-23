import test from 'node:test';
import assert from 'node:assert/strict';
import metaHandler from '../api/mlbb-meta.js';
import heroesHandler from '../api/mlbb-heroes.js';
import patchesHandler from '../api/mlbb-patches.js';
import imageHandler from '../api/mlbb-image.js';
import syncHandler from '../api/mlbb-sync.js';
import referencesHandler from '../api/mlbb-references.js';
import { createMemoryStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { PUBLIC_REFRESH_LIMITS, publicMlbbHealth, publicMlbbState, readPublicCohort, readPublicHero, readPublicHeroId, readPublicPortrait } from '../lib/mlbb/public-read.js';
import { MLBB_FRESHNESS } from '../lib/mlbb/sync.js';
import { tierMethodology, buildEclipseTier } from '../lib/mlbb/tier.js';

const now = Date.now();
const stamp = new Date(now).toISOString();
const hero = { id: 1, name: 'Miya', availability: 'available', images: { portrait: 'https://akmweb.youngjoygame.com/miya.png' }, skills: [{ name: 'Moon Arrow', description: 'Public skill' }], relations: { weakAgainst: [2] } };
const detail = { data: hero, patchEpoch: 'patch1', updatedAt: stamp, source: { provider: 'Public provider' } };
const matchup = { data: { counters: { favorable: [{ heroId: 2, deltaWinRate: .02 }], unfavorable: [] }, compatibility: { favorable: [] } }, patchEpoch: 'patch1', updatedAt: stamp };
function seed() {
  return {
    [MLBB_KEYS.catalog]: { data: [hero], updatedAt: stamp },
    [MLBB_KEYS.patchEpoch]: 'patch1',
    [MLBB_KEYS.hero(1)]: detail,
    [MLBB_KEYS.matchups(1, 'mythic', '7')]: matchup,
    [MLBB_KEYS.rank('mythic', '7')]: { data: { rank: 'mythic', days: '7', official: [], eclipse: [], methodology: tierMethodology() }, updatedAt: stamp },
    [MLBB_KEYS.patches]: { data: [{ id: 10, title: 'Public patch', heroAdjustments: [{ heroId: 1, change: 'buff' }] }], updatedAt: stamp },
    [MLBB_KEYS.health]: { data: { ok: true, partial: false, rank: 'mythic', days: '7', datasets: { catalog: 'fresh', rank: 'fresh', patches: 'stale' }, ranks: { mythic: { status: 'fresh', rows: 133, updatedAt: stamp, diagnostic: 'secret-internal-diagnostic' } }, counts: { heroes: 133, rankRows: 133, patches: 3 }, errors: { upstream: { message: 'secret-internal-diagnostic' } } }, updatedAt: stamp },
    'eclipse:mlbb:public:portrait-cache:1': { url: hero.images.portrait, type: 'image/png', base64: Buffer.from('test-image').toString('base64') }
  };
}
const response = () => ({ headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });

test('public timeline only reads canonical hero and matching public snapshots', async t => {
  const values = seed();
  values[MLBB_KEYS.rankHistory] = { data: [{ rank: 'mythic', days: '7', updatedAt: stamp,
    methodologyVersion: 'eclipse-tier-2.1.0', heroes: [{ heroId: 1, winRate: .51, pickRate: .02, banRate: 0 }],
    tiers: [{ heroId: 1, tier: 'A', eclipseRank: 8 }], debug: 'private-diagnostic' }] };
  const calls = mockedApi(t, values);
  const res = response(); await metaHandler({ method: 'GET', query: { view: 'timeline', id: '1', rank: 'mythic', days: '7' } }, res);
  assert.equal(res.statusCode, 200); assert.match(res.headers['Cache-Control'], /^public,/);
  assert.equal(res.body.data.points.length, 1); assert.equal(res.body.data.points[0].eclipseScore, null);
  assert.doesNotMatch(JSON.stringify(res.body), /private-diagnostic/);
  assert.ok(calls.every(call => [MLBB_KEYS.catalog, MLBB_KEYS.rankHistory, MLBB_KEYS.rankTimeline('mythic', '7')].includes(call[1])));
});

test('public Movers reads only public history and rejects invalid cohort before storage', async t => {
  const values = seed();
  values[MLBB_KEYS.rankTimeline('mythic', '7')] = { data: { version: 2, rank: 'mythic', days: '7', snapshots: [
    { updatedAt: new Date(now - 7 * 86400000).toISOString(), rows: [[1, .5, .01, .1, 'A', 3, 50]], diagnostic: 'PRIVATE-TEST' },
    { updatedAt: stamp, rows: [[1, .54, .02, .2, 'S', 1, 90]], diagnostic: 'PRIVATE-TEST' }
  ] } };
  const calls = mockedApi(t, values), res = response();
  await metaHandler({ method: 'GET', query: { view: 'movers', rank: 'mythic', days: '7' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.data.rows[0].winPp, 4); assert.equal(res.body.data.rows[0].name, 'Miya');
  assert.equal(res.body.data.comparableTiers, false); assert.doesNotMatch(JSON.stringify(res.body), /PRIVATE-TEST/);
  assert.ok(calls.every(c => c[0] === 'GET' && [MLBB_KEYS.catalog, MLBB_KEYS.rankHistory, MLBB_KEYS.rankTimeline('mythic', '7')].includes(c[1])));
  const before = calls.length, bad = response(); await metaHandler({ method: 'GET', query: { view: 'movers', rank: ['epic'] } }, bad);
  assert.equal(bad.statusCode, 400); assert.equal(calls.length, before);
});

test('timeline validates request before history access and returns honest empty history', async t => {
  const calls = mockedApi(t);
  for (const [query, expected] of [[{ view: 'timeline', id: '../sync' }, 400], [{ view: 'timeline', id: ['1','2'] }, 400], [{ view: 'timeline', id: '99999' }, 404], [{ view: 'other', id: '1' }, 400]]) {
    const res = response(); await metaHandler({ method: 'GET', query }, res); assert.equal(res.statusCode, expected);
  }
  assert.ok(calls.every(call => call[1] !== MLBB_KEYS.rankHistory));
  const res = response(); await metaHandler({ method: 'GET', query: { view: 'timeline', id: '1' } }, res);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body.data.points, []);
});

test('existing cached meta gets exact explanation without changing tier or writing cache', async t => {
  const values = seed();
  const official = [1, 2, 3].map(heroId => ({ heroId, name: 'Hero ' + heroId, winRate: .5 + heroId * .01, pickRate: heroId * .02, banRate: heroId * .1 }));
  const expected = buildEclipseTier(official);
  values[MLBB_KEYS.rank('mythic', '7')].data = { rank: 'mythic', days: '7', official,
    eclipse: expected.map(({ scoreBreakdown, ...row }) => row), comparison: { previousUpdatedAt: stamp, changes: [] }, methodology: tierMethodology() };
  mockedApi(t, values);
  const res = response(); await metaHandler({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body.data.eclipse, expected);
  assert.equal(res.body.data.comparison.previousUpdatedAt, stamp);
});

function mockedApi(t, values = seed()) {
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  const commands = [];
  process.env.MLBB_META_ENABLED = 'true';
  process.env.UPSTASH_REDIS_REST_URL = 'https://public-meta-fixture.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fixture-not-a-real-secret';
  process.env.MLBB_META_RANK = 'mythic'; process.env.MLBB_META_DAYS = '7';
  delete process.env.ADMIN_PASSWORD; delete process.env.VIEWER_PASSWORD; delete process.env.SESSION_SECRET;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), process.env.UPSTASH_REDIS_REST_URL, 'No external provider calls for cached anonymous reads');
    const command = JSON.parse(options.body); commands.push(command);
    assert.equal(command[0], 'GET', 'Cached public reads never write Redis');
    assert.ok(command[1].startsWith('eclipse:mlbb:'), 'Never read private team/auth keys');
    return new Response(JSON.stringify({ result: values[command[1]] === undefined ? null : JSON.stringify(values[command[1]]) }));
  };
  t.after(() => {
    globalThis.fetch = saved.fetch;
    for (const key of Object.keys(process.env)) if (!(key in saved.env)) delete process.env[key];
    Object.assign(process.env, saved.env);
  });
  return commands;
}

test('v4 cache upgrades all four ranks to v5 without waiting for history, changing raw rates or writing storage', async t => {
  const values = seed();
  const official = [rowFor(.55, 1), rowFor(.58, 2)];
  function rowFor(winRate, heroId) { return { heroId, name: 'Hero ' + heroId, winRate, pickRate: .01, banRate: .1 }; }
  for (const rank of ['epic', 'legend', 'mythic', 'glory']) values[MLBB_KEYS.rank(rank, '7')] = {
    updatedAt: stamp, data: { rank, days: '7', official, eclipse: official.map(row => ({ ...row, tier: 'S', eclipseScore: 100 })), methodology: { version: 'eclipse-tier-4.0.0' }, comparison: { changes: [] } }
  };
  const calls = mockedApi(t, values);
  for (const rank of ['epic', 'legend', 'mythic', 'glory']) {
    const res = response(); await metaHandler({ method: 'GET', query: { rank, days: '7', method: '5' } }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.updatedAt, stamp);
    assert.equal(res.body.data.methodology.version, 'eclipse-tier-5.0.0');
    assert.deepEqual(res.body.data.official, official);
    assert.deepEqual(res.body.data.eclipse.map(r => [r.heroId, r.tier, r.eclipseScore]), buildEclipseTier(official).map(r => [r.heroId, r.tier, r.eclipseScore]));
    assert.ok(res.body.data.eclipse.every(row => row.quality.status === 'provisional'));
    assert.ok(res.body.data.eclipse[0].eclipseScore > res.body.data.eclipse[1].eclipseScore);
    assert.equal(res.body.data.comparison, null);
  }
  assert.ok(calls.every(call => call[0] === 'GET'));
});

test('anonymous tier, catalog, full dossier, patches and PNG portraits work without team auth configuration', async t => {
  mockedApi(t);
  for (const [handler, query] of [[metaHandler, {}], [heroesHandler, {}], [heroesHandler, { id: '1' }], [patchesHandler, {}], [imageHandler, { id: '1' }]]) {
    const res = response(); await handler({ method: 'GET', query, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['Cache-Control'], /^public,/);
    assert.doesNotMatch(JSON.stringify(res.body), /fixture-not-a-real-secret|secret-internal-diagnostic/);
    if (handler === heroesHandler && query.id) {
      assert.equal(res.body.data.skills[0].name, 'Moon Arrow');
      assert.deepEqual(res.body.data.relations.weakAgainst, [2]);
      assert.equal(res.body.data.matchups.counters.favorable[0].heroId, 2);
    }
    if (handler === imageHandler) assert.equal(res.body.toString(), 'test-image');
  }
});

test('public reads reject writes, respect feature disable, and do not cache errors', async t => {
  const commands = mockedApi(t);
  for (const handler of [metaHandler, heroesHandler, patchesHandler, imageHandler]) {
    const mutation = response(); await handler({ method: 'POST', query: {}, headers: {} }, mutation);
    assert.equal(mutation.statusCode, 405); assert.match(mutation.headers['Cache-Control'], /no-store/);
  }
  process.env.MLBB_META_ENABLED = 'false';
  const disabled = response(); await heroesHandler({ method: 'GET', query: {}, headers: {} }, disabled);
  assert.equal(disabled.statusCode, 503); assert.match(disabled.headers['Cache-Control'], /no-store/);
  assert.equal(commands.length, 0);
});

test('invalid or nonexistent hero IDs and cohorts cannot reach providers or create cache keys', async t => {
  const commands = mockedApi(t);
  for (const id of ['-1', '1.0', '1e2', ['1', '2'], {}, '', '999999']) {
    const res = response(); await heroesHandler({ method: 'GET', query: { id }, headers: {} }, res);
    assert.equal(res.statusCode, 400); assert.match(res.headers['Cache-Control'], /no-store/);
  }
  for (const query of [{ rank: 'unlimited' }, { days: '999' }, { rank: ['mythic'] }, { days: { value: '7' } }]) {
    const res = response(); await heroesHandler({ method: 'GET', query: { id: '1', ...query }, headers: {} }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(commands.length, 0);
  const unknown = response(); await heroesHandler({ method: 'GET', query: { id: '9999' }, headers: {} }, unknown);
  assert.equal(unknown.statusCode, 404);
  assert.deepEqual(commands, [['GET', MLBB_KEYS.catalog]]);
});

test('sync and portrait-reference APIs remain protected from anonymous callers', async t => {
  const commands = mockedApi(t);
  for (const [handler, method] of [[syncHandler, 'POST'], [referencesHandler, 'GET'], [referencesHandler, 'POST']]) {
    const res = response(); await handler({ method, query: {}, headers: {}, body: {} }, res);
    assert.ok([401, 403, 405, 503].includes(res.statusCode));
    assert.match(res.headers['Cache-Control'], /no-store/);
  }
  assert.equal(commands.length, 0);
});

test('parameter parsing accepts only finite supported cohorts and canonical integer IDs', () => {
  assert.deepEqual(readPublicCohort({ rank: 'glory', days: '7' }), { rank: 'glory', days: '7' });
  assert.equal(readPublicHeroId('133'), 133);
  assert.throws(() => readPublicHeroId('001'));
  assert.throws(() => readPublicCohort({}, { MLBB_META_RANK: 'arbitrary-cache-key' }));
});

test('fresh dossiers do no writes; stale dossiers share a cooldown and retain skills and counters', async () => {
  const values = seed();
  const store = createMemoryStore(values); let calls = 0;
  const intelligence = async () => { calls++; return { ...detail, refreshError: { code: 'PROVIDER_DOWN' } }; };
  const options = { store, rank: 'mythic', days: '7', now, intelligence };
  await readPublicHero(1, options); assert.equal(calls, 0); assert.deepEqual(store.snapshot(), values);
  await store.setJSON(MLBB_KEYS.patchEpoch, 'patch2');
  await readPublicHero(1, options); assert.equal(calls, 1);
  const retry = await readPublicHero(1, options); assert.equal(calls, 1);
  assert.equal(retry.data.skills[0].name, 'Moon Arrow');
  assert.equal(retry.data.matchups.counters.favorable[0].heroId, 2);
  assert.equal(publicMlbbState(retry, MLBB_FRESHNESS.heroMs).status, 'partial');
});

test('global dossier budget stops new upstream work and does not invent an empty fresh dossier', async () => {
  const values = seed(); delete values[MLBB_KEYS.hero(1)];
  values['eclipse:mlbb:public:budget:dossier'] = PUBLIC_REFRESH_LIMITS.dossiersPerHour;
  const store = createMemoryStore(values);
  await assert.rejects(() => readPublicHero(1, { store, rank: 'mythic', days: '7', intelligence: () => assert.fail('Budget must block provider') }), error => error.code === 'MLBB_REFRESH_BUSY');
  assert.equal(await store.getJSON(MLBB_KEYS.hero(1)), null);
});

test('cold canonical dossier refresh is allowed within budget and repeated failures are throttled', async () => {
  const store = createMemoryStore({ [MLBB_KEYS.catalog]: { data: [hero] } }); let calls = 0;
  const options = { store, rank: 'glory', days: '7', intelligence: async () => { calls++; throw new Error('fixture-provider-failure'); } };
  await assert.rejects(() => readPublicHero(1, options), /fixture-provider-failure/);
  await assert.rejects(() => readPublicHero(1, options), error => error.code === 'MLBB_REFRESH_BUSY');
  assert.equal(calls, 1);
  const before = store.snapshot();
  await assert.rejects(() => readPublicHero(999, options), error => error.code === 'HERO_NOT_FOUND');
  assert.deepEqual(store.snapshot(), before);
});

test('public cache response strips raw health and matchup diagnostics but preserves partial state', () => {
  const health = publicMlbbHealth(seed()[MLBB_KEYS.health]);
  assert.equal(health.data.ok, true); assert.equal('errors' in health.data, false);
  assert.deepEqual(health.data.datasets, { catalog: 'fresh', rank: 'fresh', patches: 'stale' });
  assert.deepEqual(health.data.ranks, { mythic: { status: 'fresh', rows: 133, updatedAt: stamp } });
  assert.deepEqual(health.data.counts, { heroes: 133, rankRows: 133, patches: 3 });
  assert.doesNotMatch(JSON.stringify(health), /secret-internal-diagnostic/);
  const state = publicMlbbState({ ...detail, data: { ...hero, matchups: { error: { message: 'private diagnostics', code: 'UPSTREAM_TOKEN' } } } }, MLBB_FRESHNESS.heroMs);
  assert.equal(state.status, 'partial');
  assert.doesNotMatch(JSON.stringify(state), /private diagnostics|UPSTREAM_TOKEN/);
});

test('portrait proxy caches only bounded image bytes and prevents cooldown or budget retries', async () => {
  const store = createMemoryStore(); let calls = 0;
  const url = new URL(hero.images.portrait);
  const fetchImpl = async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); return new Response('png-content', { headers: { 'content-type': 'image/png' } }); };
  assert.equal((await readPublicPortrait(1, url, { store, fetchImpl })).bytes.toString(), 'png-content');
  assert.equal((await readPublicPortrait(1, url, { store, fetchImpl })).type, 'image/png');
  assert.equal(calls, 1);
  const denied = createMemoryStore({ 'eclipse:mlbb:public:budget:portrait': PUBLIC_REFRESH_LIMITS.portraitsPerHour });
  await assert.rejects(() => readPublicPortrait(2, url, { store: denied, fetchImpl }), error => error.code === 'MLBB_REFRESH_BUSY');
  const broken = createMemoryStore(); const badFetch = async () => { calls++; return new Response('bad', { status: 500 }); };
  await assert.rejects(() => readPublicPortrait(2, url, { store: broken, fetchImpl: badFetch }));
  await assert.rejects(() => readPublicPortrait(2, url, { store: broken, fetchImpl: badFetch }), error => error.code === 'MLBB_REFRESH_BUSY');
  assert.equal(calls, 2);
});

test('concurrent cold portraits across separate store clients share the cache and one budget charge', async () => {
  const store = createMemoryStore();
  const url = new URL(hero.images.portrait); let calls = 0;
  const fetchImpl = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 80));
    return new Response('shared-portrait', { headers: { 'content-type': 'image/png' } });
  };
  const results = await Promise.all(Array.from({ length: 4 }, () => readPublicPortrait(1, url, { store: { ...store }, fetchImpl })));
  assert.equal(calls, 1);
  assert.deepEqual(results.map(result => result.bytes.toString()), Array(4).fill('shared-portrait'));
  assert.equal(await store.getJSON('eclipse:mlbb:public:budget:portrait'), 1);
});

test('concurrent cold dossiers wait for shared detail without multiplying provider requests', async () => {
  const values = seed(); delete values[MLBB_KEYS.hero(1)]; delete values[MLBB_KEYS.matchups(1, 'mythic', '7')];
  const store = createMemoryStore(values); let calls = 0;
  const intelligence = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 80));
    await store.setJSON(MLBB_KEYS.hero(1), detail);
    await store.setJSON(MLBB_KEYS.matchups(1, 'mythic', '7'), matchup);
    return { ...detail, data: { ...hero, matchups: matchup.data } };
  };
  const results = await Promise.all(Array.from({ length: 3 }, () => readPublicHero(1, { store: { ...store }, rank: 'mythic', days: '7', now, intelligence })));
  assert.equal(calls, 1);
  assert.equal(await store.getJSON('eclipse:mlbb:public:budget:dossier'), 1);
  for (const result of results) {
    assert.equal(result.data.skills[0].name, 'Moon Arrow');
    assert.equal(result.data.matchups.counters.favorable[0].heroId, 2);
    assert.equal(result.refreshError, undefined);
  }
});

test('a pending refresh wait is bounded and cannot reuse a portrait from a different URL', async () => {
  const store = createMemoryStore({
    'eclipse:mlbb:public:portrait:1': { state: 'pending' },
    'eclipse:mlbb:public:portrait-cache:1': { url: 'https://akmweb.youngjoygame.com/old.png', type: 'image/png', base64: 'b2xk' }
  });
  const start = Date.now();
  await assert.rejects(() => readPublicPortrait(1, new URL(hero.images.portrait), { store, waitMs: 25, fetchImpl: () => assert.fail('A lock waiter cannot fetch') }), error => error.code === 'MLBB_REFRESH_BUSY');
  assert.ok(Date.now() - start < 500, 'Deadline stops a crashed worker wait');
  assert.equal(await store.getJSON('eclipse:mlbb:public:budget:portrait'), null);
});

test('failed concurrent portrait refresh settles waiters without retrying the provider', async () => {
  const store = createMemoryStore(); let calls = 0;
  const fetchImpl = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 30));
    return new Response('unavailable', { status: 503 });
  };
  const results = await Promise.allSettled(Array.from({ length: 2 }, () => readPublicPortrait(1, new URL(hero.images.portrait), { store: { ...store }, fetchImpl })));
  assert.equal(calls, 1);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.deepEqual(await store.getJSON('eclipse:mlbb:public:portrait:1'), { state: 'settled' });
});
