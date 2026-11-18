import { createClient } from '@libsql/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTursoRepository } from '../../lib/turso-store.js';

// Real libSQL engine, independent connections, no credentials or remote I/O.
export async function tursoFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'eclipse-turso-test-'));
  const url = pathToFileURL(join(directory, 'team.db')).href;
  const clients = [];
  const connect = () => { const client = createClient({ url }); clients.push(client); return client; };
  t.after(async () => { clients.forEach(client => client.close()); await rm(directory, { recursive: true, force: true }); });
  const client = connect();
  await client.execute('PRAGMA journal_mode = WAL');
  return { url, client, connect, repo: createTursoRepository({ client }) };
}

export const state = (revision, matches = []) => ({ _storageRevision: revision, files: {
  'eclipse_data.json': { content: JSON.stringify({ revision, players: [{ id: 'p1' }], matches }) }
} });
