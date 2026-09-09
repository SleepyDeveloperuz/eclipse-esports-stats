import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { saveDailyMacBackup } from '../lib/mac-backup.js';

const gistId = 'mac-retention-fixture';
const snapshot = (revision, team = gistId) => ({ format: 'eclipse-team-backup-v1', key: `eclipse:team:v1:${createHash('sha256').update(team).digest('hex').slice(0, 24)}`, exportedAt: new Date().toISOString(), state: { _storageRevision: revision, files: { 'eclipse_data.json': { content: JSON.stringify({ revision, players: [{ id: 'p1' }], matches: [{ id: 'm1' }] }) } } } });
const run = (directory, revision, extra = {}) => saveDailyMacBackup({ destination: directory, gistId, readSnapshot: async () => snapshot(revision), now: new Date(`2026-09-09T12:00:0${revision}.000Z`), ...extra });
async function fixture(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'eclipse-retention-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('only the latest verified automatic backup pair remains; unrelated files survive', async t => {
  const directory = await fixture(t);
  const first = await run(directory, 1);
  await fs.writeFile(join(directory, 'manual-export.json'), JSON.stringify(snapshot(1)));
  await fs.writeFile(join(directory, 'before-restore.json'), JSON.stringify(snapshot(1)));
  const second = await run(directory, 2);
  assert.deepEqual(second.removed, [first.filename]);
  assert.deepEqual((await fs.readdir(directory)).sort(), [second.filename, `${second.filename}.sha256`, 'manual-export.json', 'before-restore.json'].sort());
  assert.equal((await fs.stat(join(directory, second.filename))).mode & 0o777, 0o600);
});

test('a failed source read or invalid new snapshot never removes the previous backup', async t => {
  const directory = await fixture(t); const first = await run(directory, 1);
  await assert.rejects(run(directory, 2, { readSnapshot: async () => { throw new Error('offline'); } }), /offline/);
  await assert.rejects(run(directory, 2, { readSnapshot: async () => ({ format: 'bad' }) }));
  assert.deepEqual((await fs.readdir(directory)).sort(), [first.filename, `${first.filename}.sha256`].sort());
});

test('read-back verification failure removes only the failed new files', async t => {
  const directory = await fixture(t); const first = await run(directory, 1);
  const io = { ...fs, readFile: async (path, ...args) => String(path).endsWith('-r2.json') ? 'corrupted write' : fs.readFile(path, ...args) };
  await assert.rejects(run(directory, 2, { io }), /verification failed/);
  assert.deepEqual((await fs.readdir(directory)).sort(), [first.filename, `${first.filename}.sha256`].sort());
});

test('retention does not delete another team, unverified files or symlinks', async t => {
  const directory = await fixture(t);
  const other = await run(directory, 1, { gistId: 'other', readSnapshot: async () => snapshot(1, 'other') });
  const suspicious = 'eclipse-2026-09-08T12-00-00.000Z-r0.json';
  await fs.writeFile(join(directory, 'important.json'), 'not a backup');
  await fs.symlink(join(directory, 'important.json'), join(directory, suspicious));
  const result = await run(directory, 2);
  assert.equal(result.removed.length, 0);
  assert.ok(result.preserved.includes(other.filename));
  assert.equal(await fs.readFile(join(directory, 'important.json'), 'utf8'), 'not a backup');
  assert.ok((await fs.lstat(join(directory, suspicious))).isSymbolicLink());
});

test('concurrent runs cannot prune one another and revision regressions stop retention', async t => {
  const directory = await fixture(t);
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  const first = run(directory, 2, { readSnapshot: async () => { entered(); await waiting; return snapshot(2); } });
  await started;
  await assert.rejects(run(directory, 3), /running/);
  release(); const original = await first;
  await assert.rejects(run(directory, 1), /older than/);
  assert.ok(await fs.readFile(join(directory, original.filename), 'utf8'));
});
