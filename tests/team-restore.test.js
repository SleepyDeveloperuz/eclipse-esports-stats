import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMemoryStore } from '../lib/mlbb/store.js';
import { restoreTeamBackup, validateBackup } from '../lib/team-restore.js';
import { readExistingTeamSnapshot } from '../lib/team-store.js';

const gistId = 'restore-fixture';
const key = `eclipse:team:v1:${createHash('sha256').update(gistId).digest('hex').slice(0, 24)}`;
const state = (revision, matches = []) => ({ _storageRevision: revision, files: { 'eclipse_data.json': { content: JSON.stringify({ revision, players: [{ id: 'p1' }], matches }) }, 'eclipse_briefing.json': { content: '{"polls":[]}' } } });
const backup = { format: 'eclipse-team-backup-v1', key, state: state(3, [{ id: 'old-match' }]) };

test('restore defaults to read-only and rejects wrong namespace, revisions and malformed files', async () => {
  const store = createMemoryStore({ [key]: state(10) });
  const before = store.snapshot();
  const result = await restoreTeamBackup({ backup, gistId, store, expectedRevision: 10 });
  assert.equal(result.applied, false);
  assert.equal(result.nextRevision, 11);
  assert.deepEqual(store.snapshot(), before);
  await assert.rejects(restoreTeamBackup({ backup, gistId, store, expectedRevision: 9 }), /revision/);
  assert.throws(() => validateBackup(backup, 'other-team'), /boshqa jamoa/);
  assert.throws(() => validateBackup({ ...backup, state: { ...backup.state, files: { ...backup.state.files, 'unknown.json': { content: '{}' } } } }, gistId), /Noma’lum/);
  assert.throws(() => validateBackup({ ...backup, state: state(3, [{ id: 'same' }, { id: 'same' }]) }, gistId), /Takroriy/);
});

test('restore preserves a private pre-image and increases both revisions', async () => {
  const original = state(10, [{ id: 'new-match' }]);
  const store = createMemoryStore({ [key]: original });
  let saved;
  const result = await restoreTeamBackup({ backup, gistId, store, expectedRevision: 10, apply: true, saveBefore: async value => { saved = value; } });
  assert.equal(result.applied, true);
  assert.deepEqual(saved.state, original);
  const restored = await store.getJSON(key);
  assert.equal(restored._storageRevision, 11);
  const core = JSON.parse(restored.files['eclipse_data.json'].content);
  assert.equal(core.revision, 11);
  assert.equal(core.matches[0].id, 'old-match');
});

test('failed local backup and concurrent writes both prevent restoration', async () => {
  const store = createMemoryStore({ [key]: state(10) });
  await assert.rejects(restoreTeamBackup({ backup, gistId, store, expectedRevision: 10, apply: true, saveBefore: async () => { throw new Error('disk full'); } }), /disk full/);
  assert.equal((await store.getJSON(key))._storageRevision, 10);
  await assert.rejects(restoreTeamBackup({ backup, gistId, store, expectedRevision: 10, apply: true, saveBefore: async () => { await store.setJSON(key, state(11)); } }), /o‘zgardi/);
  assert.equal(JSON.parse((await store.getJSON(key)).files['eclipse_data.json'].content).matches.length, 0);
});

test('explicit missing-database recovery does not seed from Gist', async () => {
  const store = createMemoryStore();
  let before;
  await restoreTeamBackup({ backup, gistId, store, expectedRevision: -1, apply: true, saveBefore: async value => { before = value; } });
  assert.equal(before.format, 'eclipse-team-missing-v1');
  assert.equal((await store.getJSON(key))._storageRevision, 4);
});

test('exported legacy cores use zero only for absent public revisions and restore monotonically', async () => {
  for (const [backupRevision, currentRevision, nextRevision] of [[undefined, undefined, 1], [undefined, 7, 8], [9, undefined, 10]]) {
    const source = state(3, [{ id: 'legacy-match' }]);
    const current = state(10);
    for (const [document, revision] of [[source, backupRevision], [current, currentRevision]]) {
      const core = JSON.parse(document.files['eclipse_data.json'].content);
      if (revision === undefined) delete core.revision;
      else core.revision = revision;
      document.files['eclipse_data.json'].content = JSON.stringify(core);
    }
    const exported = await readExistingTeamSnapshot({ gistId, store: createMemoryStore({ [key]: source }) });
    const unchanged = structuredClone(exported);
    assert.equal(validateBackup(exported, gistId).core.revision, backupRevision ?? 0);
    assert.deepEqual(exported, unchanged, 'validation must not rewrite the original backup');
    const store = createMemoryStore({ [key]: current });
    let preimage;
    await restoreTeamBackup({ backup: exported, gistId, store, expectedRevision: 10, apply: true, saveBefore: async value => { preimage = value; } });
    const restored = await store.getJSON(key);
    assert.equal(restored._storageRevision, 11);
    assert.equal(JSON.parse(restored.files['eclipse_data.json'].content).revision, nextRevision);
    assert.deepEqual(preimage.state, current, 'legacy pre-image remains an exact copy');
  }
});

test('explicit malformed public revisions are refused in the backup and current state', async () => {
  for (const revision of [null, '0', -1, 1.5, Number.MAX_SAFE_INTEGER + 1, {}, []]) {
    const malformed = state(10);
    const core = JSON.parse(malformed.files['eclipse_data.json'].content);
    core.revision = revision;
    malformed.files['eclipse_data.json'].content = JSON.stringify(core);
    assert.throws(() => validateBackup({ ...backup, state: malformed }, gistId), { code: 'RESTORE_REFUSED' });
    const store = createMemoryStore({ [key]: malformed });
    let writes = 0;
    await assert.rejects(restoreTeamBackup({ backup, gistId, store, expectedRevision: 10, apply: true, saveBefore: async () => { writes++; } }), { code: 'RESTORE_REFUSED' });
    assert.equal(writes, 0);
    assert.deepEqual(await store.getJSON(key), malformed);
  }
});
