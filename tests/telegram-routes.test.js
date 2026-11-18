import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamRepository } from '../lib/team-store.js';
import { createMemoryStore } from '../lib/mlbb/store.js';

// Each test file has an isolated Node worker. Never load local credentials.
for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL']) delete process.env[key];
Object.assign(process.env, {
  ADMIN_PASSWORD: 'fixture-telegram-admin', VIEWER_PASSWORD: 'fixture-telegram-viewer',
  SESSION_SECRET: 'fixture-telegram-secret-with-at-least-thirty-two-characters', GIST_ID: 'fixture-telegram',
  TELEGRAM_BOT_TOKEN: 'fixture-bot-token', TELEGRAM_WEBHOOK_SECRET: 'fixture-webhook-secret',
  TELEGRAM_CHAT_ID: '100', TELEGRAM_CAPTAIN_USER_ID: '', TELEGRAM_ALLOWED_USER_IDS: '200', TELEGRAM_GROUP_ID: '-1001234567890'
});
const [{ default: submissions }, { default: sync }, { default: auth }] = await Promise.all([
  import('../api/submissions.js'), import('../api/sync.js'), import('../api/auth.js')
]);
const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
const call = async (handler, overrides = {}) => {
  const res = response();
  await handler({ method: 'POST', query: {}, headers: {}, body: {}, socket: {}, ...overrides }, res);
  return res;
};
const photo = userId => ({ update_id: 10, message: { chat: { id: userId, type: 'private' }, from: { id: userId }, photo: [{ file_id: 'fixture' }] } });
const validHeaders = () => ({ 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET });
const login = async role => {
  const result = await call(auth, { body: { role, password: role === 'admin' ? process.env.ADMIN_PASSWORD : process.env.VIEWER_PASSWORD, voterId: 'fixture_telegram_device_123' } });
  assert.equal(result.statusCode, 200); return result.body.token;
};
const repo = () => createTeamRepository({ store: createMemoryStore(), key: 'fixture', seed: async () => ({
  'eclipse_data.json': { content: JSON.stringify({ revision: 1, players: [{ id: 'p1', name: 'Fixture Player' }], matches: [{ id: 'm1', date: '2026-11-17', result: 'win', playerStats: [] }] }) }
}) });

test('every webhook entry rejects missing or incorrect transport credentials before I/O', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async url => { outgoing.push(url); throw new Error('No external calls expected'); });
  const variants = [{ query: { telegram: 'webhook' } }, { query: { source: 'telegram' } }, { url: '/api/telegram' }, {}];
  for (const variant of variants) {
    for (const secret of ['', 'wrong', ['fixture-webhook-secret']]) {
      const result = await call(submissions, { ...variant, body: photo(100), headers: { 'x-telegram-bot-api-secret-token': secret } });
      assert.equal(result.statusCode, 401);
    }
  }
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  try {
    for (const unset of ['', '   ']) {
      process.env.TELEGRAM_WEBHOOK_SECRET = unset;
      assert.equal((await call(submissions, { body: photo(100), headers: { 'x-telegram-bot-api-secret-token': expected } })).statusCode, 503);
    }
  } finally { process.env.TELEGRAM_WEBHOOK_SECRET = expected; }
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    assert.equal((await call(submissions, { body: photo(100), headers: validHeaders() })).statusCode, 503);
  } finally { process.env.TELEGRAM_BOT_TOKEN = bot; }
  assert.equal(outgoing.length, 0);
});

test('valid transport credentials cannot grant an outsider or team member captain actions', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async url => { outgoing.push(url); throw new Error('No external calls expected'); });
  const updates = [photo(999), { message: { chat: { id: 999, type: 'private' }, from: { id: 999 }, text: '/roster' } }];
  for (const data of ['sub_approve:m1', 'sub_reject:m1', 'sub_edit_hero:m1', 'sub_pk_p:m1:p1', 'sub_st_h:m1:p1:Aulus', 'sub_cancel:m1']) updates.push({ callback_query: { id: 'cb', data, from: { id: 200 }, message: { chat: { id: -1001234567890, type: 'supergroup' }, message_id: 1 } } });
  for (const body of updates) {
    const result = await call(submissions, { query: { telegram: 'webhook' }, body, headers: validHeaders() });
    assert.equal(result.statusCode, 200); assert.equal(result.body.reason, 'TELEGRAM_ACCESS_DENIED');
  }
  assert.equal(outgoing.length, 0);
  for (const body of [null, [], 'not-json']) assert.equal((await call(submissions, { query: { telegram: 'webhook' }, body, headers: validHeaders() })).statusCode, 400);
});

test('authorized group commands read the team snapshot through the real HTTP router', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { outgoing.push({ url, body: JSON.parse(options.body) }); return new Response('{"ok":true}'); });
  const repository = repo();
  const result = await repository.transaction(() => call(submissions, { query: { telegram: 'webhook' }, headers: validHeaders(), body: { message: { from: { id: 333 }, chat: { id: -1001234567890, type: 'supergroup' }, text: '/roster' } } }));
  assert.equal(result.statusCode, 200); assert.equal(result.body.command, 'roster');
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].body.chat_id, -1001234567890);
  assert.ok(outgoing[0].body.text.includes('Fixture Player'));
  assert.deepEqual(Object.keys(await repository.files()), ['eclipse_data.json']);
});

test('bot service credentials only read roster/matches and never permit writes or full exports', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async url => { outgoing.push(url); throw new Error('No external calls expected'); });
  const repository = repo();
  const headers = { 'x-telegram-bot-token': process.env.TELEGRAM_BOT_TOKEN };
  for (const collection of ['roster', 'matches']) {
    const result = await repository.transaction(() => call(sync, { method: 'GET', query: { collection }, headers }));
    assert.equal(result.statusCode, 200);
    assert.equal((result.body[collection === 'roster' ? 'players' : 'matches']).length, 1);
    assert.equal((await call(sync, { method: 'GET', query: { collection }, headers: { 'x-telegram-bot-token': 'wrong' } })).statusCode, 401);
  }
  for (const collection of [undefined, 'all', ['matches']]) assert.equal((await call(sync, { method: 'GET', query: { collection }, headers })).statusCode, 401);
  assert.equal((await call(sync, { method: 'POST', headers, body: { matches: [] } })).statusCode, 401);
  assert.equal(outgoing.length, 0);
});

test('daily summary requires a current admin session; viewer, bot and revoked sessions cannot send it', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { outgoing.push({ url, body: JSON.parse(options.body) }); return new Response('{"ok":true}'); });
  const admin = await login('admin'), viewer = await login('viewer');
  const query = { source: 'telegram' }, body = { action: 'send_daily_summary', date: '2026-11-17' };
  for (const token of ['', viewer, process.env.TELEGRAM_BOT_TOKEN]) {
    assert.equal((await call(submissions, { query, body, headers: { authorization: `Bearer ${token}` } })).statusCode, 403);
  }
  assert.equal(outgoing.length, 0);
  const repository = repo();
  assert.equal((await repository.transaction(() => call(submissions, { query, body, headers: { authorization: `Bearer ${admin}` } }))).statusCode, 200);
  assert.equal(outgoing.length, 1);
  const revoked = await call(auth, { method: 'PATCH', body: { action: 'revoke_all' }, headers: { authorization: `Bearer ${admin}` } });
  assert.equal(revoked.statusCode, 200);
  assert.equal((await call(submissions, { query, body, headers: { authorization: `Bearer ${admin}` } })).statusCode, 403);
  assert.equal(outgoing.length, 1);
});
