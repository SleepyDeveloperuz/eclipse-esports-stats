import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_LIMITS, encodeTeamData } from '../lib/data-capacity.js';
import { createMemoryStore } from '../lib/mlbb/store.js';
import { createTeamRepository, readTeamFiles, writeTeamFiles } from '../lib/team-store.js';

for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL']) delete process.env[key];
Object.assign(process.env, { ADMIN_PASSWORD: 'fixture-capacity-admin', SESSION_SECRET: 'fixture-capacity-secret-at-least-thirty-two-chars', GIST_ID: 'fixture-capacity' });
const [{ default: sync, normalisePayload }, { default: auth }] = await Promise.all([import('../api/sync.js'), import('../api/auth.js')]);
const response = () => ({ statusCode: 0, setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
const players = [{ id: 'p1', name: 'Fixture Player' }];
const base = { revision: 7, players, matches: [], heroes: [] };
const fixture = count => ({ ...base, baseRevision: 7, matches: Array.from({ length: count }, (_, index) => ({
  id: `fixture-${index}`, date: '2026-11-17', result: 'win', matchType: 'ranked', scope: 'individual',
  createdAt: '2026-11-17T01:00:00.000Z', updatedAt: '2026-11-17T01:00:00.000Z',
  notes: 'Tekshiruv 🐉'.repeat(20), playerStats: [{ playerId: 'p1', heroUsed: 'Miya', kills: 3, deaths: 1, assists: 5 }]
})) });
function largeFixture(pretty = false) {
  for (let count = 100; count <= 2500; count += 100) {
    const raw = fixture(count), normalized = normalisePayload(raw);
    if (Buffer.byteLength(JSON.stringify(normalized, null, pretty ? 2 : 0)) > DATA_LIMITS.bytes) return { raw, normalized };
  }
  throw new Error('Fixture did not reach the configured boundary');
}
function repository() {
  return createTeamRepository({ store: createMemoryStore(), key: 'capacity-fixture', seed: async () => ({
    'eclipse_data.json': { content: JSON.stringify(base) }, 'eclipse_briefing.json': { content: '{"keep":true}' }
  }) });
}
async function login() {
  const res = response();
  await auth({ method: 'POST', headers: {}, socket: {}, body: { password: process.env.ADMIN_PASSWORD, role: 'admin', voterId: 'fixture_capacity_device' } }, res);
  assert.equal(res.statusCode, 200);
  return res.body.token;
}
async function call(repo, body, token) {
  const res = response();
  await repo.transaction(() => sync({ method: 'POST', headers: { authorization: `Bearer ${token}` }, query: {}, body, socket: {} }, res));
  return res;
}

test('compact UTF-8 size is accepted exactly at the boundary and rejects multibyte overflow', () => {
  const overhead = Buffer.byteLength(JSON.stringify({ notes: '' }));
  const available = DATA_LIMITS.bytes - overhead;
  const data = { notes: '界'.repeat(Math.floor(available / 3)) + 'a'.repeat(available % 3) };
  assert.equal(Buffer.byteLength(encodeTeamData(data)), DATA_LIMITS.bytes);
  assert.throws(() => encodeTeamData({ notes: data.notes + '🐉' }), error => {
    assert.equal(error.status, 413);
    assert.equal(error.code, 'DATA_SIZE_EXCEEDED');
    assert.equal(error.actualBytes, DATA_LIMITS.bytes + 4);
    return true;
  });
});

test('sync stores a compact document that exceeded the former pretty-print limit', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected external call'); });
  const repo = repository(), token = await login();
  const { raw, normalized } = largeFixture(true);
  assert.ok(Buffer.byteLength(JSON.stringify(normalized)) < DATA_LIMITS.bytes);
  const result = await call(repo, raw, token);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.revision, 8);
  const files = await repo.files(), content = files['eclipse_data.json'].content;
  const saved = JSON.parse(content);
  assert.equal(saved.matches.length, raw.matches.length);
  assert.equal(content, JSON.stringify(saved));
  assert.deepEqual(saved.matches, normalized.matches);
  assert.equal(files['eclipse_briefing.json'].content, '{"keep":true}');
});

test('byte and count limit responses are explicit 413s and preserve the entire transaction', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected external call'); });
  const repo = repository(), token = await login(), before = await repo.files();
  const oversized = largeFixture().raw;
  const cases = [[oversized, 'DATA_SIZE_EXCEEDED'], [fixture(2501), 'DATA_CAPACITY_EXCEEDED'],
    [{ ...fixture(1), players: Array.from({ length: 51 }, (_, i) => ({ id: `p${i}`, name: 'Fixture' })) }, 'DATA_CAPACITY_EXCEEDED'],
    [{ ...fixture(1), heroes: Array.from({ length: 301 }, (_, i) => ({ id: i + 1, name: `Hero ${i}` })) }, 'DATA_CAPACITY_EXCEEDED']];
  for (const [body, code] of cases) {
    const result = await call(repo, body, token);
    assert.equal(result.statusCode, 413);
    assert.equal(result.body.code, code);
    assert.match(result.body.error, /qisqartirilmadi/);
    if (code === 'DATA_SIZE_EXCEEDED') assert.ok(result.body.actualBytes > result.body.limitBytes);
    assert.deepEqual(await repo.files(), before);
  }
  const conflict = await call(repo, { ...oversized, baseRevision: 6 }, token);
  assert.equal(conflict.statusCode, 409, 'size handling does not bypass optimistic concurrency');
  assert.deepEqual(await repo.files(), before);
});

test('all normal writers use the same size limit and rollback approvals staged before a rejection', async () => {
  const repo = repository(), before = await repo.files();
  const { normalized } = largeFixture();
  await assert.rejects(repo.transaction(async () => {
    await writeTeamFiles({ 'eclipse_submission_fixture.json': { content: '{"status":"approved"}' } });
    await writeTeamFiles({ 'eclipse_data.json': { content: JSON.stringify(normalized) } });
  }), { status: 413, code: 'DATA_SIZE_EXCEEDED' });
  assert.deepEqual(await repo.files(), before);
  await repo.transaction(async () => {
    const files = await readTeamFiles();
    await writeTeamFiles({ 'eclipse_data.json': { content: JSON.stringify(JSON.parse(files['eclipse_data.json'].content), null, 2) } });
  });
  assert.equal((await repo.files())['eclipse_data.json'].content, JSON.stringify(base));
});
