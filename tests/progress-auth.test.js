import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamRepository } from '../lib/team-store.js';
import { createMemoryStore } from '../lib/mlbb/store.js';
process.env.ADMIN_PASSWORD = 'fixture-progress-admin';
process.env.VIEWER_PASSWORD = 'fixture-progress-viewer';
process.env.SESSION_SECRET = 'fixture-progress-secret-not-production';
process.env.GIST_ID = 'fixture-progress';
process.env.UPSTASH_REDIS_REST_URL = 'https://fixture.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fixture';
const { default: handler } = await import('../api/submissions.js');
const { default: auth } = await import('../api/auth.js');
const response = () => ({ statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
test('Real submission router rejects anonymous history and viewer publish/Undo before storage writes', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    if (command[0] === 'GET' && command[1].startsWith('eclipse:auth:')) return new Response('{"result":null}');
    if (command[0] === 'EVAL' && command[3].startsWith('eclipse:auth:')) return new Response('{"result":[1,900000]}');
    throw new Error('Unexpected external call');
  };
  const repo = createTeamRepository({ store: createMemoryStore(), key: 'fixture', seed: async () => ({ 'eclipse_data.json': { content: '{"revision":1,"players":[],"matches":[]}' } }) });
  try {
    const login = response(); await auth({ method: 'POST', headers: {}, socket: {}, body: { role: 'viewer', password: process.env.VIEWER_PASSWORD, voterId: 'fixture_progress_device_123' } }, login);
    assert.equal(login.statusCode, 200);
    const call = async (method, query, body, token) => { const res = response(); await repo.transaction(() => handler({ method, query, body, headers: token ? { authorization: `Bearer ${token}` } : {}, socket: {} }, res)); return res; };
    assert.equal((await call('GET', { feature: 'history' }, null, '')).statusCode, 401);
    assert.equal((await call('GET', { feature: 'history' }, null, login.body.token)).statusCode, 403);
    assert.equal((await call('GET', { feature: 'weekly' }, null, login.body.token)).statusCode, 200);
    for (const action of ['publish_weekly', 'unpublish_weekly', 'undo_match']) assert.equal((await call('PATCH', {}, { action }, login.body.token)).statusCode, 403);
    assert.deepEqual(Object.keys(await repo.files()), ['eclipse_data.json']);
  } finally { globalThis.fetch = oldFetch; }
});
