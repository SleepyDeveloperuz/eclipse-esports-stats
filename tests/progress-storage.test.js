import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamRepository, readTeamFiles, writeTeamFiles } from '../lib/team-store.js';
import { createMemoryStore } from '../lib/mlbb/store.js';
import { readHistory, undoCorrection, fingerprint, recordChanges } from '../lib/match-history.js';
import { progressRequest } from '../lib/progress-api.js';
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } });
const match = { id: 'm1', date: '2026-09-16', matchType: 'ranked', scope: 'individual', result: 'win', durationSeconds: 600, playerStats: [{ playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Gold Laner', kills: 5, deaths: 2, assists: 4 }] };
const initial = { revision: 1, players: [{ id: 'p1', name: 'Player' }], matches: [match] };
function fixture() { return createTeamRepository({ store: createMemoryStore(), key: 'team', seed: async () => ({ 'eclipse_data.json': { content: JSON.stringify(initial) } }) }); }
async function mutate(repo, transform) { await repo.transaction(async () => { const files = await readTeamFiles(), data = JSON.parse(files['eclipse_data.json'].content); await writeTeamFiles({ 'eclipse_data.json': { content: JSON.stringify({ ...transform(data), revision: data.revision + 1 }) } }); }); }
test('Edits and deletes record atomic before/after snapshots; creations do not flood journal', async () => {
  const repo = fixture();
  await mutate(repo, data => ({ ...data, matches: [...data.matches, { ...match, id: 'm2' }] }));
  assert.equal(readHistory(await repo.files()).entries.length, 0);
  await mutate(repo, data => ({ ...data, matches: data.matches.map(m => m.id === 'm1' ? { ...m, result: 'loss' } : m) }));
  let history = readHistory(await repo.files()); assert.equal(history.entries.length, 1); assert.equal(history.entries[0].before.result, 'win');
  await assert.rejects(repo.transaction(async () => { await writeTeamFiles({ 'eclipse_data.json': { content: JSON.stringify({ ...initial, matches: [] }) } }); throw new Error('fail'); }));
  assert.deepEqual(readHistory(await repo.files()), history);
  await mutate(repo, data => ({ ...data, matches: data.matches.filter(m => m.id !== 'm1') }));
  history = readHistory(await repo.files()); assert.equal(history.entries[1].action, 'delete');
  const res = response(); await repo.transaction(() => progressRequest({ method: 'PATCH', body: { action: 'undo_match', id: history.entries[1].id, expectedRevision: 4 } }, res, { role: 'admin' }));
  assert.equal(res.statusCode, 200); assert.equal(res.body.revision, 5);
  const files = await repo.files(); assert.equal(JSON.parse(files['eclipse_data.json'].content).matches.find(m => m.id === 'm1').result, 'loss');
  assert.equal(readHistory(files).entries.at(-1).action, 'undo');
  const again = response(); await repo.transaction(() => progressRequest({ method: 'PATCH', body: { action: 'undo_match', id: history.entries[1].id, expectedRevision: 4 } }, again, { role: 'admin' }));
  assert.equal(again.body.revision, 5);
});
test('Undo refuses later mutations, stale revisions and removed roster IDs', () => {
  const after = { ...initial, revision: 2, matches: [{ ...match, result: 'loss' }] };
  const history = recordChanges({ entries: [], pruned: 0 }, initial, after), id = history.entries[0].id;
  assert.throws(() => undoCorrection(after, history, id, 1), /yangilangan/);
  assert.throws(() => undoCorrection({ ...after, players: [] }, history, id, 2), /rosterda/);
  assert.throws(() => undoCorrection({ ...after, matches: [match] }, history, id, 2), /keyinroq/);
  assert.equal(undoCorrection(after, history, id, 2).matches[0].result, 'win');
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
});
test('History has explicit bounded retention without removing actual matches', () => {
  let history = { entries: [], pruned: 0 }, data = initial;
  for (let i = 0; i < 210; i++) { const next = { ...data, matches: [{ ...match, notes: String(i) }] }; history = recordChanges(history, data, next); data = next; }
  assert.equal(history.entries.length, 200); assert.equal(history.pruned, 10); assert.equal(data.matches.length, 1);
});
test('Weekly publish is admin-only, server-computed, revision-guarded, and visible to viewers', async () => {
  const repo = fixture();
  const call = async (req, role = 'admin') => { const res = response(); await repo.transaction(() => progressRequest(req, res, { role })); return res; };
  const body = { action: 'publish_weekly', date: '2026-09-16', scope: 'squad', expectedRevision: 1, count: 999 };
  assert.equal((await call({ method: 'PATCH', body }, 'viewer')).statusCode, 403);
  assert.equal((await call({ method: 'GET', query: { feature: 'history' } }, 'viewer')).statusCode, 403);
  assert.equal((await call({ method: 'PATCH', body: { ...body, expectedRevision: 0 } })).statusCode, 409);
  const first = await call({ method: 'PATCH', body }); assert.equal(first.statusCode, 200); assert.equal(first.body.reports[0].count, 1);
  const second = await call({ method: 'PATCH', body }); assert.equal(second.body.reports.length, 1);
  const visible = await call({ method: 'GET', query: { feature: 'weekly' } }, 'viewer'); assert.equal(visible.body.reports[0].count, 1);
  assert.equal(readHistory(await repo.files()).entries.length, 0);
  const removed = await call({ method: 'PATCH', body: { ...body, action: 'unpublish_weekly' } }); assert.equal(removed.body.reports.length, 0);
});
