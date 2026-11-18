import { createClient } from '@libsql/client';

export function isTursoConfigured(env = process.env) {
  return Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN);
}

export function createTursoClient(env = process.env) {
  if (!isTursoConfigured(env)) {
    throw new Error('Turso ma’lumotlar bazasi sozlanmagan (TURSO_DATABASE_URL va TURSO_AUTH_TOKEN kerak).');
  }
  return createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN
  });
}

export function createTursoRepository({ env = process.env, client = createTursoClient(env), maxAttempts = 5 } = {}) {
  let initPromise = null;
  const busy = error => /^SQLITE_BUSY(?:_|$)/.test(error?.code || '');
  const pause = attempt => new Promise(resolve => setTimeout(resolve, Math.min(25 * (attempt + 1), 100)));
  const invalid = () => Object.assign(new Error('Turso baza yoki revision formati yaroqsiz.'), { code: 'TEAM_STORAGE_INVALID', status: 503 });

  async function ensureTables() {
    if (!initPromise) initPromise = client.batch([
      "CREATE TABLE IF NOT EXISTS team_files (name TEXT PRIMARY KEY, content TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
      'CREATE TABLE IF NOT EXISTS team_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    ], 'write').catch(error => { initPromise = null; throw error; });
    return initPromise;
  }

  async function readState(tx) {
    const tables = await tx.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('team_files', 'team_meta')");
    if (!tables.rows.length) return null;
    if (tables.rows.length !== 2) throw invalid();
    const [documents, revisions] = await tx.batch([
      'SELECT name, content FROM team_files',
      "SELECT value FROM team_meta WHERE key = 'storageRevision'"
    ]);
    const rawRevision = revisions.rows[0]?.value;
    if (rawRevision === undefined && !documents.rows.length) return null;
    const revision = Number(rawRevision);
    if (!/^\d+$/.test(String(rawRevision)) || !Number.isSafeInteger(revision) || revision < 0) throw invalid();
    const files = Object.fromEntries(documents.rows.map(row => [String(row.name), { content: String(row.content) }]));
    return { _storageRevision: revision, files };
  }

  // Files and revision must belong to one committed snapshot. Reads, including
  // backup and dry-run, never create tables or initialize an empty database.
  async function snapshot() {
    const tx = await client.transaction('read');
    try { return await readState(tx); }
    finally { try { await tx.rollback(); } finally { tx.close(); } }
  }

  async function replaceSnapshot(expectedRevision, next) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < -1
      || !Number.isSafeInteger(next?._storageRevision) || next._storageRevision <= expectedRevision
      || !next.files || Array.isArray(next.files) || Object.values(next.files).some(file => typeof file?.content !== 'string')) throw invalid();
    // Only an intentional write may initialize the schema.
    await ensureTables();
    const current = await snapshot();
    if ((current?._storageRevision ?? -1) !== expectedRevision) return false;
    const previous = current?.files || {};
    const statements = [];
    const guard = "COALESCE((SELECT value FROM team_meta WHERE key = 'storageRevision'), '-1') = ?";
    for (const [name, file] of Object.entries(next.files)) {
      if (previous[name]?.content !== file.content) statements.push({
        sql: `INSERT INTO team_files (name, content, updated_at) SELECT ?, ?, datetime('now') WHERE ${guard} ON CONFLICT(name) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`,
        args: [name, file.content, String(expectedRevision)]
      });
    }
    for (const name of Object.keys(previous)) if (!Object.hasOwn(next.files, name)) statements.push({
      sql: `DELETE FROM team_files WHERE name = ? AND ${guard}`, args: [name, String(expectedRevision)]
    });
    statements.push({ sql: `INSERT INTO team_meta (key, value) SELECT 'storageRevision', ? WHERE ${guard} ON CONFLICT(key) DO UPDATE SET value=excluded.value`, args: [String(next._storageRevision), String(expectedRevision)] });
    // Every mutation has the same revision predicate within one write batch.
    // A concurrent commit makes all statements no-ops; a SQL failure rolls back
    // the whole batch. No application callback runs while holding the lock.
    const results = await client.batch(statements, 'write');
    return results.at(-1).rowsAffected === 1;
  }

  return {
    snapshot,
    replaceSnapshot,
    close: () => client.close(),
    async files() { return (await snapshot())?.files || {}; },
    async transaction(callback, context) {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const initial = await snapshot();
        const scope = { files: structuredClone(initial?.files || {}), dirty: false };
        // Compute outside the write lock. A conflict replays against fresh data.
        const result = await context.run(scope, callback);
        if (!scope.dirty) return result;
        try {
          if (await replaceSnapshot(initial?._storageRevision ?? -1, {
            _storageRevision: (initial?._storageRevision ?? 0) + 1, files: scope.files
          })) return result;
        } catch (error) {
          // Only an explicit SQLite lock failure is retryable. Network/unknown
          // commit outcomes are surfaced without replaying a possible success.
          if (!busy(error) || attempt === maxAttempts - 1) throw error;
        }
        await pause(attempt);
      }
      throw Object.assign(new Error('Baza boshqa qurilmada yangilandi. Qayta urinib ko‘ring.'), { status: 409, code: 'TEAM_STORAGE_BUSY' });
    }
  };
}
