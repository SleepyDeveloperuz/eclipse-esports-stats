import test from 'node:test';
import assert from 'node:assert/strict';
import { readExistingTeamSnapshot, createTeamBackupStore, teamStorageKey, teamNamespace } from '../lib/team-store.js';
import { validateBackup, restoreTeamBackup } from '../lib/team-restore.js';
import { tursoFixture, state } from './helpers/turso-fixture.js';

const gistId = 'local-turso-recovery';
const backend = repo => createTeamBackupStore({ tursoRepository: repo, gistId });

test('Turso-only installations get a database-specific identity without Gist or token-derived keys', () => {
  assert.equal(teamNamespace({ GIST_ID: 'old-team', TURSO_DATABASE_URL: 'libsql://db.turso.io' }), 'old-team');
  assert.equal(teamNamespace({ TEAM_NAMESPACE: 'stable-team', GIST_ID: 'old-team' }), 'stable-team');
  const namespace = teamNamespace({ GIST_ID: '', TURSO_DATABASE_URL: 'libsql://db.turso.io' });
  assert.equal(namespace, teamNamespace({ TURSO_DATABASE_URL: 'https://db.turso.io/?authToken=secret' }));
  assert.notEqual(teamStorageKey(namespace), teamStorageKey(teamNamespace({ TURSO_DATABASE_URL: 'libsql://other.turso.io' })));
  assert.throws(() => teamStorageKey(''), /namespace/);
});

test('configured Turso takes precedence over legacy Redis credentials for backup and restore', async t => {
  const { url, repo } = await tursoFixture(t);
  const original = state(7, [{ id: 'turso-match' }]);
  await repo.replaceSnapshot(-1, original);
  const store = createTeamBackupStore({ gistId, env: {
    TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'local-test',
    UPSTASH_REDIS_REST_URL: 'https://unused-redis.invalid', UPSTASH_REDIS_REST_TOKEN: 'unused'
  } });
  try {
    assert.deepEqual(await store.getJSON(teamStorageKey(gistId)), original);
    const next = state(8, [{ id: 'turso-match' }, { id: 'restored-match' }]);
    assert.equal(await store.restoreJSON(teamStorageKey(gistId), 7, next), true);
    assert.deepEqual(await repo.snapshot(), next);
  } finally { store.close(); }
});

test('Turso export uses the actual revision and shared namespace; local restore preserves every match field', async t => {
  const source = await tursoFixture(t), target = await tursoFixture(t);
  const original = state(651, [{ id: 'm1', sourceBattleId: '1003364882523644224',
    result: 'win', playerStats: [{ playerId: 'p1', heroUsed: 'Aulus', kills: 0, deaths: 4, assists: 6, damageDealt: null }], customLegacyField: { preserved: true } }]);
  original.files['eclipse_submission_a.json'] = { content: '{"status":"pending","untouched":[1,2,3]}' };
  original.files['eclipse_history.json'] = { content: '{"entries":[]}' };
  original.files['eclipse_submission_b.json'] = { content: 'null' };
  await source.repo.replaceSnapshot(-1, original);
  const backup = await readExistingTeamSnapshot({ tursoRepository: source.repo, gistId });
  assert.equal(backup.key, teamStorageKey(gistId));
  assert.equal(backup.state._storageRevision, 651);
  assert.deepEqual(validateBackup(backup, gistId).state, original);
  const store = backend(target.repo);
  const dryRun = await restoreTeamBackup({ backup, gistId, store, expectedRevision: -1 });
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.nextRevision, 652);
  assert.equal((await target.client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.length, 0);
  let preimage;
  await restoreTeamBackup({ backup, gistId, store, expectedRevision: -1, apply: true, saveBefore: async value => { preimage = value; } });
  assert.equal(preimage.format, 'eclipse-team-missing-v1');
  const recovered = await readExistingTeamSnapshot({ tursoRepository: target.repo, gistId });
  const core = JSON.parse(recovered.state.files['eclipse_data.json'].content);
  assert.deepEqual(core.matches, JSON.parse(original.files['eclipse_data.json'].content).matches);
  assert.deepEqual(core.players, JSON.parse(original.files['eclipse_data.json'].content).players);
  assert.equal(core.revision, 652);
  assert.equal(recovered.state._storageRevision, 652);
  for (const name of ['eclipse_submission_a.json', 'eclipse_submission_b.json', 'eclipse_history.json']) assert.equal(recovered.state.files[name].content, original.files[name].content);
  assert.deepEqual(await source.repo.snapshot(), original, 'source database is read-only');
  validateBackup(recovered, gistId);
});

test('Turso restore refuses a stale revision, failed preimage and a write after the preimage', async t => {
  const { repo } = await tursoFixture(t);
  const original = state(9, [{ id: 'current' }]);
  await repo.replaceSnapshot(-1, original);
  const store = backend(repo);
  const backup = { format: 'eclipse-team-backup-v1', key: teamStorageKey(gistId), state: state(3, [{ id: 'old' }]) };
  await assert.rejects(restoreTeamBackup({ backup, gistId, store, expectedRevision: 8, apply: true, saveBefore: async () => {} }), /revision/);
  await assert.rejects(restoreTeamBackup({ backup, gistId, store, expectedRevision: 9, apply: true, saveBefore: async () => { throw new Error('disk full'); } }), /disk full/);
  assert.deepEqual(await repo.snapshot(), original);
  const concurrent = state(10, [{ id: 'current' }, { id: 'new' }]);
  await assert.rejects(restoreTeamBackup({ backup, gistId, store, expectedRevision: 9, apply: true, saveBefore: async () => { await repo.replaceSnapshot(9, concurrent); } }), /o‘zgardi/);
  assert.deepEqual(await repo.snapshot(), concurrent);
});

test('missing or incomplete Turso databases and foreign namespaces cannot produce usable backups', async t => {
  const { client, repo } = await tursoFixture(t);
  await assert.rejects(readExistingTeamSnapshot({ tursoRepository: repo, gistId }), /Bo‘sh zaxira/);
  assert.equal((await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.length, 0);
  await assert.rejects(backend(repo).getJSON(teamStorageKey('other')), { code: 'RESTORE_REFUSED' });
  await client.execute('CREATE TABLE team_files (name TEXT, content TEXT)');
  await assert.rejects(repo.snapshot(), { code: 'TEAM_STORAGE_INVALID' });
});

test('backup never prunes completed submissions while enforcing the size limit', async () => {
  const original = state(9);
  const content = JSON.stringify({ status: 'approved', auditEvidence: 'x'.repeat(3_600_000) });
  original.files['eclipse_submission_a.json'] = { content };
  const backup = await readExistingTeamSnapshot({ gistId, store: { getJSON: async () => original } });
  assert.equal(backup.state.files['eclipse_submission_a.json'].content.length, content.length);
  assert.equal(original.files['eclipse_submission_a.json'].content.length, content.length);
});

test('legacy generic Turso keys are rejected instead of bypassing team ownership checks', () => {
  assert.throws(() => validateBackup({ format: 'eclipse-team-backup-v1', key: 'turso:team', state: state(1) }, gistId), { code: 'RESTORE_REFUSED' });
});

test('only legacy submission tombstones may contain JSON null', () => {
  for (const name of ['eclipse_data.json', 'eclipse_history.json', 'eclipse_briefing.json']) {
    const candidate = state(1);
    candidate.files[name] = { content: 'null' };
    assert.throws(() => validateBackup({ format: 'eclipse-team-backup-v1', key: teamStorageKey(gistId), state: candidate }, gistId), { code: 'RESTORE_REFUSED' });
  }
});
