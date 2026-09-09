import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../lib/mlbb/store.js';
import { createSessionSecurity } from '../lib/session-security.js';

test('login limits are shared across instances and roles, not process-local', async () => {
  const store = createMemoryStore();
  const first = createSessionSecurity({ store, namespace: 'team' });
  const second = createSessionSecurity({ store, namespace: 'team' });
  const req = { headers: { 'x-forwarded-for': '192.0.2.1' } };
  for (let i = 0; i < 20; i++) assert.equal((await (i % 2 ? first : second).checkLogin(req)).limited, false);
  const blocked = await second.checkLogin(req);
  assert.equal(blocked.limited, true);
  assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 900);
  assert.equal((await first.checkLogin({ headers: { 'x-forwarded-for': '192.0.2.2' } })).limited, false);
});

test('session revocation is durable, monotonic and namespace-isolated', async () => {
  const store = createMemoryStore();
  const first = createSessionSecurity({ store, namespace: 'team' });
  const second = createSessionSecurity({ store, namespace: 'team' });
  assert.equal(await first.validSince(100), true);
  await first.revokeAll(200);
  await second.revokeAll(150);
  assert.equal(await second.validSince(200), false);
  assert.equal(await first.validSince(201), true);
  assert.equal(await createSessionSecurity({ store, namespace: 'other' }).validSince(100), true);
});
