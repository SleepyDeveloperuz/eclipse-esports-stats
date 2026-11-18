import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isTursoConfigured, createTursoRepository } from '../lib/turso-store.js';
import { tursoFixture, state } from './helpers/turso-fixture.js';

test('Turso requires both URL and token', () => {
  assert.equal(isTursoConfigured({}), false);
  assert.equal(isTursoConfigured({ TURSO_DATABASE_URL: 'libsql://test' }), false);
  assert.equal(isTursoConfigured({ TURSO_DATABASE_URL: 'libsql://test', TURSO_AUTH_TOKEN: 'token' }), true);
});

test('parallel match save and approval on independent SQLite connections preserve both writes', async t => {
  const { client, connect, repo } = await tursoFixture(t);
  await repo.replaceSnapshot(-1, state(10));
  const second = createTursoRepository({ client: connect() });
  const context = new AsyncLocalStorage();
  let reads = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const save = id => async () => {
    const scope = context.getStore();
    const core = JSON.parse(scope.files['eclipse_data.json'].content);
    if (++reads <= 2) { if (reads === 2) release(); await barrier; }
    core.matches.push({ id });
    scope.files['eclipse_data.json'].content = JSON.stringify(core);
    if (id === 'approved') scope.files['eclipse_submission_a.json'] = { content: '{"status":"approved"}' };
    scope.dirty = true;
    return id;
  };
  assert.deepEqual(await Promise.all([repo.transaction(save('manual'), context), second.transaction(save('approved'), context)]), ['manual', 'approved']);
  const final = await repo.snapshot();
  assert.deepEqual(new Set(JSON.parse(final.files['eclipse_data.json'].content).matches.map(match => match.id)), new Set(['manual', 'approved']));
  assert.equal(final.files['eclipse_submission_a.json'].content, '{"status":"approved"}');
  assert.equal(final._storageRevision, 12);
  assert.equal(reads, 3, 'the conflicting callback must replay against the latest files');
  assert.equal((await client.execute("SELECT value FROM team_meta WHERE key='storageRevision'")).rows[0].value, '12');
});

test('a SQL failure rolls back match, submission and revision as one unit without replay', async t => {
  const { client, repo } = await tursoFixture(t);
  const initial = state(4);
  await repo.replaceSnapshot(-1, initial);
  await client.execute("CREATE TRIGGER refuse_approval BEFORE INSERT ON team_files WHEN NEW.name = 'eclipse_submission_a.json' BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END");
  const context = new AsyncLocalStorage(); let calls = 0;
  await assert.rejects(repo.transaction(() => {
    calls++;
    const scope = context.getStore();
    scope.files['eclipse_data.json'].content = '{"matches":[{"id":"lost"}]}';
    scope.files['eclipse_submission_a.json'] = { content: '{"status":"approved"}' };
    scope.dirty = true;
  }, context), /fixture rejection/);
  assert.equal(calls, 1);
  assert.deepEqual(await repo.snapshot(), initial);
});

test('snapshot reads create no schema, and malformed revisions are never coerced', async t => {
  const { client, repo } = await tursoFixture(t);
  assert.equal(await repo.snapshot(), null);
  assert.deepEqual(await repo.files(), {});
  assert.equal((await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.length, 0);
  await repo.replaceSnapshot(-1, state(1));
  for (const value of ['oops', '1.5', '3junk', '-1', '9007199254740992']) {
    await client.execute({ sql: "UPDATE team_meta SET value=? WHERE key='storageRevision'", args: [value] });
    await assert.rejects(repo.snapshot(), { code: 'TEAM_STORAGE_INVALID' });
  }
});

test('files and revision stay consistent when another connection commits during a snapshot read', async t => {
  const { client, connect, repo } = await tursoFixture(t);
  const old = state(3, [{ id: 'old' }]), next = state(4, [{ id: 'new' }]);
  await repo.replaceSnapshot(-1, old);
  const writer = createTursoRepository({ client: connect() });
  let injected = false;
  const reader = createTursoRepository({ client: {
    async transaction(mode) {
      const tx = await client.transaction(mode);
      return new Proxy(tx, { get(target, key) {
        if (key === 'batch') return async statements => {
          const rows = [await target.execute(statements[0])];
          if (!injected) { injected = true; assert.equal(await writer.replaceSnapshot(3, next), true); }
          rows.push(await target.execute(statements[1]));
          return rows;
        };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
    }
  } });
  assert.deepEqual(await reader.snapshot(), old);
  assert.deepEqual(await repo.snapshot(), next);
});

test('a lost commit response is surfaced without replaying an already committed callback', async t => {
  const { client, repo } = await tursoFixture(t);
  await repo.replaceSnapshot(-1, state(1));
  const wrapped = createTursoRepository({ client: {
    transaction: client.transaction.bind(client),
    async batch(statements, mode) {
      const result = await client.batch(statements, mode);
      if (statements.some(statement => statement.sql?.includes('INSERT INTO team_meta'))) throw Object.assign(new Error('lost response'), { code: 'NETWORK_ERROR' });
      return result;
    }
  } });
  const context = new AsyncLocalStorage(); let calls = 0;
  await assert.rejects(wrapped.transaction(() => {
    calls++; const scope = context.getStore(); scope.dirty = true;
    scope.files['eclipse_submission_a.json'] = { content: '{}' };
  }, context), /lost response/);
  assert.equal(calls, 1);
  assert.equal((await repo.snapshot())._storageRevision, 2);
});

test('stale replacement cannot resurrect deleted files or erase a later submission', async t => {
  const { repo } = await tursoFixture(t);
  const initial = state(3);
  initial.files['eclipse_submission_a.json'] = { content: '{}' };
  await repo.replaceSnapshot(-1, initial);
  const changed = state(4);
  changed.files['eclipse_submission_b.json'] = { content: '{}' };
  assert.equal(await repo.replaceSnapshot(3, changed), true);
  assert.equal(await repo.replaceSnapshot(3, { ...initial, _storageRevision: 5 }), false);
  assert.deepEqual(await repo.snapshot(), changed);
});

test('SQL revision predicates reject a commit arriving after the application comparison', async t => {
  const { client, connect, repo } = await tursoFixture(t);
  const original = state(3);
  original.files['eclipse_submission_a.json'] = { content: '{"keep":true}' };
  await repo.replaceSnapshot(-1, original);
  const writer = createTursoRepository({ client: connect() });
  const winning = { ...original, _storageRevision: 4, files: { ...original.files, 'eclipse_submission_c.json': { content: '{}' } } };
  const racing = createTursoRepository({ client: {
    transaction: client.transaction.bind(client),
    async batch(statements, mode) {
      if (statements.some(statement => statement.sql?.includes('INSERT INTO team_meta'))) assert.equal(await writer.replaceSnapshot(3, winning), true);
      return client.batch(statements, mode);
    }
  } });
  const stale = state(4, [{ id: 'stale' }]);
  stale.files['eclipse_submission_b.json'] = { content: '{}' };
  assert.equal(await racing.replaceSnapshot(3, stale), false);
  assert.deepEqual(await repo.snapshot(), winning, 'no stale insert, update or delete may be committed');
});
