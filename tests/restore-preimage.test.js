import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createMemoryStore } from '../lib/mlbb/store.js';
import { restoreTeamBackup } from '../lib/team-restore.js';
import { saveRestorePreimage } from '../lib/restore-preimage.js';

const gistId = 'durable-restore-fixture';
const key = `eclipse:team:v1:${createHash('sha256').update(gistId).digest('hex').slice(0, 24)}`;
const state = revision => ({ _storageRevision: revision, files: { 'eclipse_data.json': { content: JSON.stringify({ revision, players: [{ id: 'p1' }], matches: [] }) } } });
const backup = { format: 'eclipse-team-backup-v1', key, state: state(3) };

async function fixture(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'eclipse-preimage-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, destination: join(directory, 'before-restore.json') };
}

function observedIO(events, failure) {
  return {
    ...fs,
    async open(path, flags, mode) {
      const handle = await fs.open(path, flags, mode);
      const kind = flags === 'wx' ? 'file' : 'directory';
      return {
        async writeFile(content) {
          events.push('write');
          if (failure === 'write') throw new Error('injected write failure');
          await handle.writeFile(content);
        },
        async sync() {
          events.push(`${kind}-sync`);
          if (failure === `${kind}-sync`) throw new Error(`injected ${kind} sync failure`);
          await handle.sync();
        },
        close: () => handle.close()
      };
    },
    async readFile(path, encoding) {
      events.push('read-back');
      if (failure === 'read-back') return 'corrupt pre-image';
      return fs.readFile(path, encoding);
    }
  };
}

test('restore verifies and flushes an exclusive owner-only pre-image before the CAS', async t => {
  const { destination } = await fixture(t);
  const original = state(10);
  const memory = createMemoryStore({ [key]: original });
  const events = [];
  const store = { ...memory, async restoreJSON(...args) {
    assert.deepEqual(events, ['write', 'file-sync', 'read-back', 'directory-sync']);
    events.push('cas');
    return memory.restoreJSON(...args);
  } };
  await restoreTeamBackup({ backup, gistId, store, expectedRevision: 10, apply: true,
    saveBefore: value => saveRestorePreimage({ destination, backup: value, io: observedIO(events) }) });
  assert.equal(events.at(-1), 'cas');
  assert.deepEqual(JSON.parse(await fs.readFile(destination, 'utf8')).state, original);
  assert.equal((await fs.stat(destination)).mode & 0o777, 0o600);
  assert.equal((await store.getJSON(key))._storageRevision, 11);
});

test('write, fsync and verification failures all stop restore before the CAS', async t => {
  for (const failure of ['write', 'file-sync', 'read-back', 'directory-sync']) {
    await t.test(failure, async t => {
      const { destination } = await fixture(t);
      const original = state(10);
      const memory = createMemoryStore({ [key]: original });
      let casCalls = 0;
      const store = { ...memory, async restoreJSON(...args) { casCalls++; return memory.restoreJSON(...args); } };
      await assert.rejects(restoreTeamBackup({ backup, gistId, store, expectedRevision: 10, apply: true,
        saveBefore: value => saveRestorePreimage({ destination, backup: value, io: observedIO([], failure) }) }));
      assert.equal(casCalls, 0);
      assert.deepEqual(await store.getJSON(key), original);
    });
  }
});

test('pre-images never overwrite existing files or symlinks and reject shared directories', async t => {
  const { directory, destination } = await fixture(t);
  await fs.writeFile(destination, 'keep existing', { mode: 0o600 });
  await assert.rejects(saveRestorePreimage({ destination, backup }), { code: 'EEXIST' });
  const link = join(directory, 'linked-backup.json');
  await fs.symlink(destination, link);
  await assert.rejects(saveRestorePreimage({ destination: link, backup }), { code: 'EEXIST' });
  assert.equal(await fs.readFile(destination, 'utf8'), 'keep existing');
  await fs.chmod(directory, 0o755);
  await assert.rejects(saveRestorePreimage({ destination: join(directory, 'new.json'), backup }), /owner-only directory/);
  assert.deepEqual((await fs.readdir(directory)).sort(), ['before-restore.json', 'linked-backup.json']);
});
