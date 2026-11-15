import test from 'node:test';
import assert from 'node:assert/strict';
import { isTursoConfigured, createTursoRepository } from '../lib/turso-store.js';

test('isTursoConfigured returns true only when both URL and Token exist', () => {
  assert.equal(isTursoConfigured({}), false);
  assert.equal(isTursoConfigured({ TURSO_DATABASE_URL: 'libsql://test' }), false);
  assert.equal(isTursoConfigured({ TURSO_AUTH_TOKEN: 'token' }), false);
  assert.equal(isTursoConfigured({ TURSO_DATABASE_URL: 'libsql://test', TURSO_AUTH_TOKEN: 'token' }), true);
});

test('createTursoRepository performs atomic batch transactions on mock client', async () => {
  const tables = new Map();
  const meta = new Map();

  const mockClient = {
    async execute(query) {
      const sql = typeof query === 'string' ? query : query.sql;
      const args = typeof query === 'string' ? [] : (query.args || []);

      if (sql.includes('SELECT name, content FROM team_files')) {
        const rows = Array.from(tables.entries()).map(([name, content]) => ({ name, content }));
        return { rows };
      }
      if (sql.includes("SELECT value FROM team_meta WHERE key = 'storageRevision'")) {
        const val = meta.get('storageRevision');
        return { rows: val ? [{ value: val }] : [] };
      }
      return { rows: [] };
    },
    async batch(statements, mode) {
      assert.equal(mode, 'write');
      for (const stmt of statements) {
        if (stmt.sql.includes('INSERT INTO team_files')) {
          tables.set(stmt.args[0], stmt.args[1]);
        } else if (stmt.sql.includes('DELETE FROM team_files')) {
          tables.delete(stmt.args[0]);
        } else if (stmt.sql.includes('INSERT INTO team_meta')) {
          meta.set(stmt.args[0], stmt.args[1]);
        }
      }
    }
  };

  const repo = createTursoRepository({ client: mockClient });
  const mockContext = {
    run(scope, fn) {
      this.currentScope = scope;
      return fn();
    }
  };

  // 1. Initial empty files
  assert.deepEqual(await repo.files(), {});

  // 2. Transaction inserting files
  await repo.transaction(async () => {
    mockContext.currentScope.files['eclipse_data.json'] = { content: '{"matches":[]}' };
    mockContext.currentScope.dirty = true;
  }, mockContext);

  const filesAfter = await repo.files();
  assert.equal(filesAfter['eclipse_data.json'].content, '{"matches":[]}');
  assert.equal(meta.get('storageRevision'), '1');

  // 3. Transaction updating and deleting
  await repo.transaction(async () => {
    delete mockContext.currentScope.files['eclipse_data.json'];
    mockContext.currentScope.files['eclipse_submission_1.json'] = { content: '{"status":"pending"}' };
    mockContext.currentScope.dirty = true;
  }, mockContext);

  const finalFiles = await repo.files();
  assert.equal(finalFiles['eclipse_data.json'], undefined);
  assert.equal(finalFiles['eclipse_submission_1.json'].content, '{"status":"pending"}');
  assert.equal(meta.get('storageRevision'), '2');
});
