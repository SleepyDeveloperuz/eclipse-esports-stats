import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../lib/mlbb/store.js';
import { createTeamRepository } from '../lib/team-store.js';
process.env.ADMIN_PASSWORD = 'admin-test-v222';
process.env.VIEWER_PASSWORD = 'viewer-test-v222';
process.env.SESSION_SECRET = 'v222-test-session-secret-not-a-production-value';
process.env.GIST_ID = 'fixture-v222';
process.env.UPSTASH_REDIS_REST_URL = 'https://fixture.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fixture';
const { default: handler } = await import('../api/submissions.js');
const { default: auth } = await import('../api/auth.js');
function response() { return { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } }; }
async function login(role) { const res = response(); await auth({ method: 'POST', headers: {}, socket: {}, body: { role, password: process.env[role === 'admin' ? 'ADMIN_PASSWORD' : 'VIEWER_PASSWORD'], voterId: 'v222_test_device_identity' } }, res); assert.equal(res.statusCode, 200); return res.body.token; }
test('full submission API supports viewer review, guarded captain correction and atomic direct save', async () => {
  const initial = { players: [{ id: 'p1', name: 'Leader', active: true }], heroes: [{ id: 1, name: 'Miya' }], matches: [], revision: 0 };
  const repository = createTeamRepository({ store: createMemoryStore(), key: 'v222fixture', seed: async () => ({ 'eclipse_data.json': { content: JSON.stringify(initial) } }) });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    if (command[0] === 'GET' && command[1].startsWith('eclipse:auth:')) return new Response('{"result":null}');
    if (command[0] === 'EVAL' && command[3].startsWith('eclipse:auth:')) return new Response('{"result":[1,900000]}');
    assert.deepEqual(command, ['GET', 'eclipse:mlbb:catalog:v1']);
    return new Response(JSON.stringify({ result: JSON.stringify({ data: initial.heroes }) }));
  };
  async function call(method, body, token) {
    const res = response();
    await repository.transaction(() => handler({ method, body, headers: { authorization: `Bearer ${token}` }, query: {}, socket: {} }, res));
    return res;
  }
  const draft = { entryMode: 'full', date: '2026-09-07', matchType: 'ranked', result: 'win', claimedPlayerId: 'p1', playerStats: [{ playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Gold Laner', kills: 7, deaths: 2, assists: 8, damageDealt: 70000 }] };
  try {
    const admin = await login('admin'); const viewer = await login('viewer');
    const forbidden = await call('POST', { action: 'save', claimedPlayerId: 'p1', draft }, viewer);
    assert.equal(forbidden.statusCode, 401);
    const created = await call('POST', { claimedPlayerId: 'p1', draft }, viewer);
    assert.equal(created.statusCode, 201); assert.equal(created.body.submission.status, 'pending');
    assert.equal(JSON.parse((await repository.files())['eclipse_data.json'].content).matches.length, 0);
    const record = created.body.submission;
    const corrected = { ...draft, playerStats: [{ ...draft.playerStats[0], damageDealt: 71234 }] };
    const denied = await call('PATCH', { action: 'correct_approve', id: record.id, draft: corrected, expectedUpdatedAt: record.updatedAt }, viewer);
    assert.equal(denied.statusCode, 401);
    const stale = await call('PATCH', { action: 'correct_approve', id: record.id, draft: corrected, expectedUpdatedAt: 'stale' }, admin);
    assert.equal(stale.statusCode, 409);
    const approved = await call('PATCH', { action: 'correct_approve', id: record.id, draft: corrected, expectedUpdatedAt: record.updatedAt }, admin);
    assert.equal(approved.statusCode, 200); assert.equal(approved.body.match.playerStats[0].damageDealt, 71234);
    assert.equal(approved.body.submission.draft.playerStats[0].damageDealt, 70000, 'original submitted facts stay available');
    const repeated = await call('PATCH', { action: 'approve', id: record.id }, admin);
    assert.equal(repeated.statusCode, 200); assert.equal(repeated.body.match.id, approved.body.match.id);
    const direct = await call('POST', { action: 'save', claimedPlayerId: 'p1', draft: { ...draft, date: '2026-09-06' } }, admin);
    assert.equal(direct.statusCode, 201); assert.equal(direct.body.submission.status, 'approved');
    const final = JSON.parse((await repository.files())['eclipse_data.json'].content);
    assert.equal(final.matches.length, 2); assert.equal(final.matches[0].playerStats[0].damageDealt, 71234);
    const duplicate = await call('POST', { claimedPlayerId: 'p1', draft: { ...draft, entryMode: 'practice_lite' } }, viewer);
    assert.equal(duplicate.statusCode, 409, 'same match is not duplicated across full/Lite modes');
    const editBody = { action: 'edit_match', id: direct.body.match.id, expectedUpdatedAt: direct.body.match.updatedAt, draft: { ...draft, claimedPlayerId: 'admin', date: '2026-09-06', notes: 'Corrected without inventing score' } };
    assert.equal((await call('PATCH', editBody, viewer)).statusCode, 401);
    assert.equal((await call('PATCH', { ...editBody, expectedUpdatedAt: 'stale' }, admin)).statusCode, 409);
    const edited = await call('PATCH', editBody, admin);
    assert.equal(edited.statusCode, 200);
    assert.equal(edited.body.match.playerStats[0].inGameScore, null);
    assert.equal(edited.body.match.notes, editBody.draft.notes);
    assert.equal(JSON.parse((await repository.files())['eclipse_data.json'].content).matches.length, 2);
    const authored = await call('POST', { action: 'save', claimedPlayerId: 'admin', draft: { ...draft, date: '2026-09-05' } }, admin);
    assert.equal(authored.statusCode, 201);
    assert.equal(authored.body.submission.submitter.role, 'admin');
    const similar = await call('POST', { claimedPlayerId: 'p1', draft: { ...draft, playerStats: [{ ...draft.playerStats[0], inGameScore: 7.5 }] } }, viewer);
    assert.equal(similar.statusCode, 201);
    assert.ok(similar.body.submission.quality.possibleMatchIds.includes(approved.body.match.id));
    assert.equal((await call('PATCH', { action: 'approve', id: similar.body.submission.id }, admin)).statusCode, 409);
    const linked = await call('PATCH', { action: 'link_existing', id: similar.body.submission.id, matchId: approved.body.match.id, expectedUpdatedAt: similar.body.submission.updatedAt }, admin);
    assert.equal(linked.statusCode, 200);
    const repeatLink = await call('PATCH', { action: 'approve', id: similar.body.submission.id }, admin);
    assert.equal(repeatLink.statusCode, 200);
    assert.equal(repeatLink.body.match.id, approved.body.match.id);
    assert.equal(JSON.parse((await repository.files())['eclipse_data.json'].content).matches.length, 3, 'linking does not duplicate or replace recorded facts');
  } finally { globalThis.fetch = oldFetch; }
});
