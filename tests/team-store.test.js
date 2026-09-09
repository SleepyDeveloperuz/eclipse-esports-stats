import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, createRedisStore } from '../lib/mlbb/store.js';
import { createTeamRepository, readTeamFiles, writeTeamFiles } from '../lib/team-store.js';

test('concurrent match save and approval preserve both writes across repository instances', async () => {
  const store = createMemoryStore();
  const seed = async () => ({ 'eclipse_data.json': { content: JSON.stringify({ matches: [] }) } });
  const first = createTeamRepository({ store, key: 'team', seed });
  const second = createTeamRepository({ store, key: 'team', seed });
  await first.files();
  let reads = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const save = id => async () => {
    const files = await readTeamFiles();
    if (++reads <= 2) { if (reads === 2) release(); await barrier; }
    const data = JSON.parse(files['eclipse_data.json'].content);
    data.matches.push({ id });
    await writeTeamFiles({
      'eclipse_data.json': { content: JSON.stringify(data) },
      ...(id === 'approved' ? { 'eclipse_submission_test.json': { content: '{"status":"approved"}' } } : {})
    });
  };
  await Promise.all([first.transaction(save('manual')), second.transaction(save('approved'))]);
  const files = await first.files();
  assert.deepEqual(new Set(JSON.parse(files['eclipse_data.json'].content).matches.map(item => item.id)), new Set(['manual', 'approved']));
  assert.equal(JSON.parse(files['eclipse_submission_test.json'].content).status, 'approved');
  assert.equal((await store.getJSON('team'))._storageRevision, 2);
  assert.equal(reads, 3, 'losing transaction replays against the latest committed state');
});

test('a failed transaction cannot partially approve or change matches', async () => {
  const repository = createTeamRepository({ store: createMemoryStore(), key: 'team', seed: async () => ({ data: { content: 'original' } }) });
  await assert.rejects(repository.transaction(async () => {
    await writeTeamFiles({ data: { content: 'changed' }, approval: { content: 'approved' } });
    throw new Error('validation failed');
  }), /validation failed/);
  assert.deepEqual(await repository.files(), { data: { content: 'original' } });
});

test('an initialized repository never reimports an old Gist snapshot', async () => {
  let seeds = 0;
  const repository = createTeamRepository({ store: createMemoryStore(), key: 'team', seed: async () => { seeds++; return {}; } });
  await repository.transaction(() => writeTeamFiles({ newFile: { content: 'latest' } }));
  assert.equal((await repository.files()).newFile.content, 'latest');
  assert.equal(seeds, 1);
});

test('Redis refuses reinitialization when the durable data key was lost', async () => {
  const store = createRedisStore({ env: { UPSTASH_REDIS_REST_URL: 'https://test.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test' },
    fetchImpl: async () => new Response('{"result":-1}') });
  await assert.rejects(store.compareJSON('team', -1, { _storageRevision: 0, files: {} }), /Zaxiradan tiklash/);
});

test('writes outside a transaction fail closed', async () => {
  await assert.rejects(writeTeamFiles({ data: { content: 'unsafe' } }), /transaction/);
});
