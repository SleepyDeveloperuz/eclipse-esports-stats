import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DATA_LIMITS } from '../lib/data-capacity.js';

class Storage {
  values = new Map();
  reject = () => false;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    value = String(value);
    if (this.reject(key, value)) throw Object.assign(new Error('fixture quota'), { name: 'QuotaExceededError' });
    this.values.set(key, value);
  }
  removeItem(key) { this.values.delete(key); }
  snapshot() { return Object.fromEntries(this.values); }
}
const players = [{ id: 'p1', name: 'Player' }];
const matches = count => Array.from({ length: count }, (_, i) => ({ id: `m${i}`, date: '2026-11-17',
  matchType: 'ranked', result: 'win', scope: 'individual', createdAt: '2026-11-17T01:00:00.000Z',
  playerStats: [{ playerId: 'p1', heroUsed: 'Miya', kills: 3, deaths: 1, assists: 5 }] }));
function setup({ initial, fetchImpl = async () => { throw new Error('Unexpected request'); } } = {}) {
  const storage = new Storage();
  for (const [key, value] of Object.entries(initial || {})) storage.setItem(key, value);
  const window = { dispatchEvent() {}, EclipseApp: { authManager: { getToken: () => 'fixture', getAccessToken: () => 'fixture' }, heroDb: { heroes: [], getAll() { return this.heroes; } } } };
  const context = vm.createContext({ window, localStorage: storage, navigator: { onLine: true }, fetch: fetchImpl,
    console: { warn() {}, error() {} }, CustomEvent: class {}, Date });
  for (const name of ['date-utils', 'data', 'cloud']) vm.runInContext(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), context);
  const db = new window.DataStore();
  const cloud = new window.CloudSync(db);
  return { storage, db, cloud, window };
}
function populated(options = {}) {
  const fixture = setup(options);
  fixture.db.replaceSnapshot({ players, matches: matches(1), heroes: [{ name: 'Miya' }] });
  fixture.storage.setItem('eclipse_cloud_revision', '4');
  fixture.storage.setItem('eclipse_last_cloud_sync', 'previous-sync');
  for (const key of ['eclipse_full_match_draft_v1_admin', 'eclipse_ocr_fixture', 'eclipse_last_backup']) fixture.storage.setItem(key, 'unsaved fixture');
  return fixture;
}
const response = data => ({ ok: true, status: 200, json: async () => data });
const remote = () => ({ revision: 5, players: [{ id: 'p1', name: 'Remote' }], matches: matches(2), heroes: [{ name: 'Fanny' }], heroCatalogInitialized: true });

for (const kind of ['matches', 'players']) {
  test(`migration preserves the entire over-capacity ${kind} history and permits export`, async () => {
    const raw = { players, matches: matches(1) };
    if (kind === 'matches') raw.matches = matches(2501).map(m => ({ ...m, legacyEvidence: { untouched: true } }));
    else raw.players = Array.from({ length: 51 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, legacyField: true }));
    const initial = { eclipse_players: JSON.stringify(raw.players, null, 2), eclipse_matches: JSON.stringify(raw.matches, null, 2), eclipse_data_meta: '{"schemaVersion":1}', eclipse_last_backup: 'backup' };
    let requests = 0;
    const { storage, db, cloud } = setup({ initial, fetchImpl: async () => { requests++; return response(remote()); } });
    assert.equal(db.migrationError.code, 'DATA_CAPACITY_EXCEEDED');
    assert.deepEqual(storage.snapshot(), initial);
    assert.deepEqual(JSON.parse(db.exportData()).matches, raw.matches);
    assert.deepEqual(JSON.parse(db.exportData()).players, raw.players);
    assert.throws(() => db.saveMatches([]), /chegarasi/);
    assert.equal(cloud.getStatus().state, 'error');
    assert.equal(await cloud.syncDown(), false);
    assert.equal(requests, 0, 'a cloud read cannot replace the preserved history');
    assert.deepEqual(storage.snapshot(), initial);
  });
}

test('the supported 2500-match boundary survives reload without truncation', () => {
  const { db, window } = populated();
  assert.equal(window.DataStore.CAPACITY.matches, DATA_LIMITS.matches);
  db.replaceSnapshot({ players, matches: matches(DATA_LIMITS.matches) });
  const reloaded = new window.DataStore();
  assert.equal(reloaded.migrationError, null);
  assert.equal(reloaded.getMatches().length, 2500);
  assert.equal(reloaded.getMatches().at(-1).id, 'm2499');
});

test('over-capacity imports reject all collections before writing any keys', () => {
  const { db, storage } = populated();
  const before = storage.snapshot();
  for (const kind of ['players', 'matches', 'heroes']) {
    const payload = { players: [{ id: 'p1', name: 'Replacement' }], matches: [], heroes: [] };
    payload[kind] = Array.from({ length: DATA_LIMITS[kind] + 1 }, (_, i) => ({ id: `fixture${i}`, name: 'Fixture' }));
    assert.equal(db.importData(JSON.stringify(payload)), false);
    assert.match(db.lastImportError, /qisqartirilmadi/);
    assert.deepEqual(storage.snapshot(), before);
  }
});

for (const key of ['eclipse_matches', 'eclipse_heroes']) {
  test(`import rolls back earlier writes on quota failure at ${key}`, () => {
    const { db, storage } = populated();
    const before = storage.snapshot();
    storage.reject = (candidate, value) => candidate === key && value !== before[key];
    assert.equal(db.importData(JSON.stringify(remote())), false);
    assert.match(db.lastImportError, /xotirasi to‘ldi/);
    assert.deepEqual(storage.snapshot(), before);
  });
}

test('migration quota failure preserves the legacy roster, matches, metadata and drafts', () => {
  const { storage, window } = setup();
  storage.setItem('eclipse_players', JSON.stringify(players));
  storage.setItem('eclipse_matches', JSON.stringify(matches(1)));
  storage.setItem('eclipse_data_meta', '{"schemaVersion":1}');
  storage.setItem('eclipse_full_match_draft_v1_admin', 'unsaved');
  const before = storage.snapshot();
  storage.reject = (key, value) => key === 'eclipse_matches' && value !== before[key];
  const db = new window.DataStore();
  assert.equal(db.migrationError.code, 'LOCAL_STORAGE_FULL');
  assert.deepEqual(storage.snapshot(), before);
  storage.reject = () => false;
  assert.equal(new window.DataStore().migrationError, null);
});

test('ordinary saves never evict an unsaved draft, OCR evidence, backup or pending write', () => {
  const { db, storage } = populated();
  storage.setItem('eclipse_cloud_pending_write', 'true');
  const before = storage.snapshot();
  storage.reject = (key, value) => key === 'eclipse_matches' && value !== before[key];
  assert.throws(() => db.addMatch(matches(1)[0]), { code: 'LOCAL_STORAGE_FULL' });
  assert.deepEqual(storage.snapshot(), before);
});

for (const key of ['eclipse_matches', 'eclipse_cloud_revision', 'eclipse_cloud_baseline', 'eclipse_last_cloud_sync']) {
  test(`cloud download rolls back data and sync metadata on quota failure at ${key}`, async () => {
    const { cloud, storage, window } = populated({ fetchImpl: async () => response(remote()) });
    const before = storage.snapshot(), heroes = JSON.stringify(window.EclipseApp.heroDb.heroes);
    storage.reject = (candidate, value) => candidate === key && value !== before[key];
    assert.equal(await cloud.syncDown(), false);
    assert.equal(cloud.getStatus().state, 'error');
    assert.deepEqual(storage.snapshot(), before);
    assert.equal(JSON.stringify(window.EclipseApp.heroDb.heroes), heroes);
  });
}

test('a compact conflict baseline avoids copying the full history twice when space is low', async () => {
  const { cloud, db, storage } = populated({ fetchImpl: async () => response(remote()) });
  storage.reject = (key, value) => key === 'eclipse_cloud_baseline' && JSON.parse(value).version === 2;
  assert.equal(await cloud.syncDown(), true);
  assert.equal(db.getMatches().length, 2);
  assert.equal(cloud.getRevision(), 5);
  assert.equal(JSON.parse(storage.getItem('eclipse_cloud_baseline')).version, 1);
  assert.ok(cloud.getBaseline(5));
  // Without full originals, a two-sided edit still requires an explicit choice.
  db.updateMatch('m0', { notes: 'local' });
  const conflicting = { ...remote(), revision: 6, matches: db.getMatches().map(m => ({ ...m, notes: 'remote' })) };
  assert.throws(() => cloud.mergeRemoteSnapshot(conflicting), { code: 'LOCAL_MERGE_CONFLICT' });
  assert.equal(db.getMatches()[0].notes, 'local');
});

test('an over-capacity download or merge leaves all local records and revision intact', async () => {
  const excessive = { ...remote(), matches: matches(2501) };
  const { cloud, storage, db } = populated({ fetchImpl: async () => response(excessive) });
  cloud.storeBaseline({ players: db.getPlayers(), matches: db.getMatches() }, 4);
  const before = storage.snapshot();
  assert.equal(await cloud.syncDown(), false);
  assert.deepEqual(storage.snapshot(), before);
  // Use unchanged existing records so this reaches capacity validation, not a data conflict.
  excessive.players = db.getPlayers(); excessive.matches[0] = db.getMatches()[0];
  assert.throws(() => cloud.mergeRemoteSnapshot(excessive), { code: 'DATA_CAPACITY_EXCEEDED' });
  assert.deepEqual(storage.snapshot(), before);
});

test('413 including an HTML gateway response retains pending work across reload', async () => {
  let requests = 0;
  const { cloud, db, storage, window } = populated({ fetchImpl: async () => {
    requests++;
    return { ok: false, status: 413, json: async () => { throw new Error('HTML body'); } };
  } });
  const before = db.exportData();
  assert.equal(await cloud.syncUp(), false);
  assert.equal(cloud.hasPendingWrite(), true);
  assert.equal(cloud.getRevision(), 4);
  assert.equal(storage.getItem('eclipse_cloud_ack_id'), null);
  assert.match(cloud.getStatus().error, /hajm chegarasi/);
  assert.deepEqual(JSON.parse(db.exportData()).matches, JSON.parse(before).matches);
  const reloaded = new window.CloudSync(db);
  assert.equal(reloaded.hasPendingWrite(), true);
  assert.equal(await reloaded.syncDown(), false);
  assert.equal(requests, 1);
});

test('a successful server response cannot clear pending work if local revision persistence fails', async () => {
  const { cloud, db, storage } = populated({ fetchImpl: async () => response({ revision: 5, success: true }) });
  const before = JSON.parse(db.exportData());
  storage.reject = (key, value) => key === 'eclipse_cloud_revision' && value !== '4';
  assert.equal(await cloud.syncUp(), false);
  assert.equal(cloud.hasPendingWrite(), true);
  assert.equal(storage.getItem('eclipse_cloud_ack_id'), null);
  assert.equal(cloud.getRevision(), 4);
  assert.deepEqual(JSON.parse(db.exportData()).matches, before.matches);
  assert.deepEqual(JSON.parse(db.exportData()).players, before.players);
});
