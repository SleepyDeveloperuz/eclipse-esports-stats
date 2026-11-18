// Offline recovery rehearsal. The only database opened is a fresh local file;
// production environment variables and database credentials are never used.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { createTursoRepository } from '../lib/turso-store.js';
import { createTeamBackupStore } from '../lib/team-store.js';
import { validateBackup, restoreTeamBackup } from '../lib/team-restore.js';
import { saveRestorePreimage } from '../lib/restore-preimage.js';
import { fingerprint } from '../lib/match-history.js';

const [source, explicitNamespace] = process.argv.slice(2);
let directory, client;
try {
  if (!source) throw new Error('Usage: node scripts/verify-team-recovery.mjs backup.json [legacy-namespace]');
  const originalText = await readFile(source, 'utf8');
  const backup = JSON.parse(originalText);
  const namespace = explicitNamespace || backup.namespace;
  const { core: original } = validateBackup(backup, namespace);
  directory = await mkdtemp(join(tmpdir(), 'eclipse-recovery-'));
  client = createClient({ url: pathToFileURL(join(directory, 'recovery.db')).href });
  const repo = createTursoRepository({ client });
  const store = createTeamBackupStore({ tursoRepository: repo, gistId: namespace, env: {} });
  const dryRun = await restoreTeamBackup({ backup, gistId: namespace, store, expectedRevision: -1 });
  assert.equal(dryRun.applied, false);
  assert.equal(await repo.snapshot(), null);
  const applied = await restoreTeamBackup({ backup, gistId: namespace, store, expectedRevision: -1, apply: true,
    saveBefore: value => saveRestorePreimage({ destination: join(directory, 'before.json'), backup: value }) });
  const restored = await repo.snapshot();
  const { core } = validateBackup({ ...backup, state: restored }, namespace);
  assert.equal(restored._storageRevision, applied.nextRevision);
  assert.equal(core.revision, original.revision + 1);
  assert.deepEqual(core.matches, original.matches);
  assert.deepEqual(core.players, original.players);
  const stable = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['revision', 'updatedAt', 'lastMutationId'].includes(key)));
  assert.deepEqual(stable(core), stable(original));
  assert.deepEqual(Object.keys(restored.files).sort(), Object.keys(backup.state.files).sort());
  for (const [name, file] of Object.entries(backup.state.files)) if (name !== 'eclipse_data.json') assert.equal(restored.files[name].content, file.content);
  assert.equal(await readFile(source, 'utf8'), originalText);
  console.log(JSON.stringify({ verified: true, target: 'temporary local SQLite', remoteWrites: 0,
    matches: core.matches.length, players: core.players.length, files: Object.keys(restored.files).length,
    sourceStorageRevision: backup.state._storageRevision, restoredStorageRevision: restored._storageRevision,
    matchesFingerprint: fingerprint(core.matches), verifiedAt: new Date().toISOString() }, null, 2));
} catch (error) {
  console.error(source ? 'Local recovery verification failed. Source backup was not modified.' : error.message);
  process.exitCode = 1;
} finally {
  client?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
}
