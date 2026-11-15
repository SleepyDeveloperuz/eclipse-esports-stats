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

export function createTursoRepository({ client = createTursoClient(), maxAttempts = 5 } = {}) {
  let initPromise = null;

  async function ensureTables() {
    if (!initPromise) {
      initPromise = (async () => {
        await client.execute(`
          CREATE TABLE IF NOT EXISTS team_files (
            name TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);
        await client.execute(`
          CREATE TABLE IF NOT EXISTS team_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
        `);
      })();
    }
    return initPromise;
  }

  async function readAllFiles() {
    await ensureTables();
    const result = await client.execute('SELECT name, content FROM team_files');
    const files = {};
    for (const row of result.rows) {
      files[String(row.name)] = { content: String(row.content) };
    }
    return files;
  }

  async function getRevision() {
    await ensureTables();
    const result = await client.execute("SELECT value FROM team_meta WHERE key = 'storageRevision'");
    const val = result.rows[0]?.value;
    return val ? parseInt(val, 10) : 0;
  }

  return {
    async files() {
      return await readAllFiles();
    },

    async transaction(callback, context) {
      await ensureTables();
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const initialFiles = await readAllFiles();
        const currentRev = await getRevision();
        const scope = { files: structuredClone(initialFiles), dirty: false };

        const result = await context.run(scope, callback);
        if (!scope.dirty) return result;

        const statements = [];
        const currentKeys = new Set(Object.keys(initialFiles));
        const newKeys = new Set(Object.keys(scope.files));

        for (const [name, file] of Object.entries(scope.files)) {
          if (!initialFiles[name] || initialFiles[name].content !== file.content) {
            statements.push({
              sql: "INSERT INTO team_files (name, content, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(name) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at",
              args: [name, file.content || '']
            });
          }
        }

        for (const name of currentKeys) {
          if (!newKeys.has(name)) {
            statements.push({
              sql: 'DELETE FROM team_files WHERE name = ?',
              args: [name]
            });
          }
        }

        const nextRev = currentRev + 1;
        statements.push({
          sql: "INSERT INTO team_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          args: ['storageRevision', String(nextRev)]
        });

        try {
          if (statements.length > 0) {
            await client.batch(statements, 'write');
          }
          return result;
        } catch (err) {
          if (attempt === maxAttempts - 1) {
            throw err;
          }
        }
      }
      throw new Error('Turso tranzaksiyasi yakunlanmadi. Qayta urinib ko‘ring.');
    }
  };
}
