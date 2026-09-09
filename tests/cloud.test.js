import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const cloudSource = readFileSync(new URL('../js/cloud.js', import.meta.url), 'utf8');

function storageMock(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createCloud({
  fetchImpl,
  heroes = [{ name: 'Fanny', role: 'Assassin' }],
  storage = {},
  sharedStorage,
  sharedState,
  players = [{ id: 'p1', name: 'Leader' }],
  matches = [{ id: 'm1', date: '2026-08-30', result: 'win' }]
}) {
  const localStorage = sharedStorage || storageMock(storage);
  const saved = { players: null, matches: null };
  const state = sharedState || { players: [...players], matches: [...matches] };
  const db = {
    HEROES_KEY: 'eclipse_heroes',
    getPlayers: () => [...state.players],
    getMatches: () => [...state.matches],
    savePlayers: value => {
      state.players = [...value];
      saved.players = [...value];
    },
    saveMatches: value => {
      state.matches = [...value];
      saved.matches = [...value];
    }
  };
  const heroDb = {
    heroes: [...heroes],
    getAll() { return [...this.heroes]; },
    save() { localStorage.setItem(db.HEROES_KEY, JSON.stringify(this.heroes)); }
  };
  const window = {
    EclipseApp: {
      heroDb,
      authManager: {
        getToken: () => 'admin-token',
        getAccessToken: () => 'viewer-token'
      }
    },
    dispatchEvent() {}
  };
  const context = vm.createContext({
    window,
    localStorage,
    fetch: fetchImpl,
    navigator: { onLine: true },
    CustomEvent: class CustomEvent {},
    console,
    Date,
    JSON,
    Object,
    Promise,
    Set
  });
  vm.runInContext(cloudSource, context, { filename: 'cloud.js' });
  return { cloud: new window.CloudSync(db), db, localStorage, heroDb, saved };
}

test('cloud sync ignores legacy cross-origin configuration and uses live hero catalog', async () => {
  const calls = [];
  const { cloud, localStorage } = createCloud({
    storage: { eclipse_firebase_url: 'https://attacker.example/data.json' },
    fetchImpl: async (...args) => {
      calls.push(args);
      return response(200, { success: true, revision: 1 });
    }
  });

  assert.equal(cloud.getEffectiveUrl(), '/api/sync');
  assert.equal(localStorage.getItem('eclipse_firebase_url'), null);
  assert.equal(await cloud.syncUp(), true);
  assert.equal(calls[0][0], '/api/sync');
  const payload = JSON.parse(calls[0][1].body);
  assert.deepEqual(payload.heroes, [{ name: 'Fanny', role: 'Assassin' }]);
  assert.equal(payload.heroCatalogInitialized, true);
  assert.equal(calls[0][1].headers.Authorization, 'Bearer admin-token');
});

test('overlapping cloud writes are serialized and only the newest success clears dirty state', async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  const { cloud, localStorage } = createCloud({
    fetchImpl: (...args) => {
      calls.push(args);
      return calls.length === 1 ? first.promise : second.promise;
    }
  });

  const firstWrite = cloud.syncUp();
  const secondWrite = cloud.syncUp();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(localStorage.getItem(cloud.PENDING_KEY), 'true');

  first.resolve(response(200, { success: true, revision: 1 }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.equal(localStorage.getItem(cloud.PENDING_KEY), 'true');

  second.resolve(response(200, { success: true, revision: 2 }));
  assert.deepEqual(await Promise.all([firstWrite, secondWrite]), [true, true]);
  assert.equal(localStorage.getItem(cloud.PENDING_KEY), null);
  assert.equal(cloud.getStatus().syncing, false);
});

test('an older tab acknowledgement cannot clear another tab failed write or allow GET to erase it', async () => {
  const sharedStorage = storageMock();
  const sharedState = { players: [{ id: 'p1', name: 'Original' }], matches: [] };
  const first = deferred();
  let remote, reads = 0;
  const a = createCloud({ sharedStorage, sharedState, fetchImpl: async (_, options = {}) => {
    if (options.method === 'POST') { remote = JSON.parse(options.body); return first.promise; }
    reads++; return response(200, { ...remote, revision: 1 });
  } });
  let bUnavailable = true;
  const b = createCloud({ sharedStorage, sharedState, fetchImpl: async () => bUnavailable
    ? response(503, { error: 'Fixture unavailable' }) : response(200, { success: true, revision: 2 }) });
  const savingA = a.cloud.syncUp();
  await new Promise(resolve => setImmediate(resolve));
  b.db.savePlayers([{ id: 'p1', name: 'Unsent tab B edit' }]);
  assert.equal(await b.cloud.syncUp(), false);
  first.resolve(response(200, { success: true, revision: 1 }));
  assert.equal(await savingA, true);
  assert.equal(a.cloud.getStatus().pending, true);
  // Even a legacy tab clearing its boolean cannot clear the newer mutation ID.
  sharedStorage.removeItem(a.cloud.PENDING_KEY);
  assert.equal(await a.cloud.syncDown(), false);
  assert.equal(reads, 0);
  assert.equal(a.db.getPlayers()[0].name, 'Unsent tab B edit');
  bUnavailable = false;
  assert.equal(await b.cloud.syncUp(), true);
  assert.equal(a.cloud.getStatus().pending, false);
  assert.equal(b.cloud.getStatus().pending, false);
});

test('a delayed POST never lowers a revision/baseline acknowledged by another tab', async () => {
  const pending = deferred();
  const { cloud, localStorage } = createCloud({ fetchImpl: () => pending.promise });
  const saving = cloud.syncUp();
  await new Promise(resolve => setImmediate(resolve));
  cloud.setRevision(2);
  cloud.storeBaseline({ players: [{ id: 'p2', name: 'Newer saved record' }], matches: [] }, 2);
  const baseline = localStorage.getItem(cloud.BASELINE_KEY);
  pending.resolve(response(200, { success: true, revision: 1 }));
  assert.equal(await saving, true);
  assert.equal(cloud.getRevision(), 2);
  assert.equal(localStorage.getItem(cloud.BASELINE_KEY), baseline);
});

test('a local edit without a new queued write is not acknowledged by an older POST', async () => {
  const pending = deferred();
  const { cloud, db } = createCloud({ fetchImpl: () => pending.promise });
  const saving = cloud.syncUp();
  await new Promise(resolve => setImmediate(resolve));
  db.savePlayers([{ id: 'p1', name: 'Changed while saving' }]);
  pending.resolve(response(200, { success: true, revision: 1 }));
  await saving;
  assert.equal(cloud.getStatus().pending, true);
  assert.equal(await cloud.syncDown(), false);
});

test('a tab sends the shared saved catalog instead of its stale in-memory portraits', async () => {
  let payload;
  const { cloud } = createCloud({
    heroes: [{ name: 'Miya', image: 'old' }],
    storage: { eclipse_heroes: JSON.stringify([{ name: 'Miya', image: 'fresh' }]) },
    fetchImpl: async (_, options) => { payload = JSON.parse(options.body); return response(200, { success: true, revision: 1 }); }
  });
  assert.equal(await cloud.syncUp(), true);
  assert.equal(payload.heroes[0].image, 'fresh');
});

test('an unmarked empty remote hero list cannot wipe built-in heroes', async () => {
  const { cloud, heroDb, localStorage } = createCloud({
    fetchImpl: async () => response(200, { revision: 0, players: [], matches: [], heroes: [] })
  });

  assert.equal(await cloud.syncDown(), true);
  assert.deepEqual(heroDb.heroes, [{ name: 'Fanny', role: 'Assassin' }]);
  assert.equal(localStorage.getItem('eclipse_heroes'), null);
});

test('a missing cloud snapshot reports an empty state instead of a generic error', async () => {
  const { cloud } = createCloud({ fetchImpl: async () => response(404, { error: 'No data found' }) });
  assert.equal(await cloud.syncDown(), false);
  assert.equal(cloud.getStatus().state, 'empty');
  assert.equal(cloud.getStatus().error, '');
});

test('sync down rejects an older remote revision without overwriting local records', async () => {
  const { cloud, localStorage, saved } = createCloud({
    storage: { eclipse_cloud_revision: '5' },
    fetchImpl: async () => response(200, {
      revision: 4,
      players: [{ id: 'remote-player', name: 'Stale' }],
      matches: []
    })
  });

  assert.equal(await cloud.syncDown(), false);
  assert.equal(localStorage.getItem(cloud.REVISION_KEY), '5');
  assert.equal(saved.players, null);
  assert.equal(saved.matches, null);
  assert.equal(cloud.getStatus().state, 'error');
});

test('a successful write without a newer revision stays pending', async () => {
  const { cloud, localStorage } = createCloud({
    fetchImpl: async () => response(200, { success: true })
  });

  assert.equal(await cloud.syncUp(), false);
  assert.equal(localStorage.getItem(cloud.PENDING_KEY), 'true');
  assert.equal(cloud.getStatus().state, 'error');
  assert.match(cloud.getStatus().error, /revision/i);
});

test('revision conflict without a baseline keeps both conflicting records for explicit choice', async () => {
  const calls = [];
  const oldTimestamp = '2026-08-30T08:00:00.000Z';
  const newTimestamp = '2026-08-31T08:00:00.000Z';
  const { cloud, localStorage } = createCloud({
    storage: { eclipse_cloud_revision: '1' },
    players: [{ id: 'p1', name: 'Old local name', updatedAt: oldTimestamp }],
    matches: [],
    fetchImpl: async (url, options = {}) => {
      calls.push([url, options]);
      if (options.method === 'POST' && calls.filter(([, value]) => value.method === 'POST').length === 1) {
        return response(409, { code: 'DATA_REVISION_CONFLICT', currentRevision: 2 });
      }
      if (options.method === 'POST') return response(200, { success: true, revision: 3 });
      return response(200, {
        revision: 2,
        players: [
          { id: 'p1', name: 'New remote name', updatedAt: newTimestamp },
          { id: 'p2', name: 'Remote teammate', updatedAt: newTimestamp }
        ],
        matches: []
      });
    }
  });

  assert.equal(await cloud.syncUp(), false);
  const writes = calls.filter(([, options]) => options.method === 'POST');
  assert.equal(writes.length, 1);
  assert.equal(cloud.getStatus().state, 'conflict');
  assert.equal(cloud.pendingConflict.conflicts[0].local.name, 'Old local name');
  assert.equal(cloud.pendingConflict.conflicts[0].remote.name, 'New remote name');
  assert.equal(localStorage.getItem(cloud.REVISION_KEY), '1');
  assert.equal(localStorage.getItem(cloud.PENDING_KEY), 'true');
});

test('GET never overwrites a local edit made while the response was pending', async () => {
  const pending = deferred();
  const { cloud, db } = createCloud({ fetchImpl: () => pending.promise });
  const reading = cloud.syncDown();
  db.savePlayers([{ id: 'p1', name: 'New local name' }]);
  pending.resolve(response(200, { revision: 1, players: [{ id: 'p1', name: 'Old remote name' }], matches: [] }));
  assert.equal(await reading, false);
  assert.equal(db.getPlayers()[0].name, 'New local name');
});

test('three-way merge combines independent fields, regardless of device timestamps', () => {
  const original = { id: 'p1', name: 'Leader', primaryRole: 'Jungler', tags: [], updatedAt: '2026-08-01' };
  const { cloud, db } = createCloud({ fetchImpl: async () => response(500), players: [original], matches: [] });
  cloud.setRevision(1);
  cloud.storeBaseline({ players: [original], matches: [] }, 1);
  db.savePlayers([{ ...original, primaryRole: 'Roamer', updatedAt: '2099-01-01' }]);
  cloud.mergeRemoteSnapshot({ revision: 2, players: [{ ...original, tags: ['captain'], updatedAt: '2026-09-01' }], matches: [] });
  assert.equal(db.getPlayers()[0].primaryRole, 'Roamer');
  assert.deepEqual(db.getPlayers()[0].tags, ['captain']);
});

test('conflicting fields leave the database untouched until captain selects a copy', () => {
  const original = { id: 'p1', name: 'Leader' };
  const { cloud, db } = createCloud({ fetchImpl: async () => response(500), players: [original], matches: [] });
  cloud.setRevision(1); cloud.storeBaseline({ players: [original], matches: [] }, 1);
  db.savePlayers([{ ...original, name: 'Local' }]);
  const remote = { revision: 2, players: [{ ...original, name: 'Remote' }], matches: [] };
  assert.throws(() => cloud.mergeRemoteSnapshot(remote), /ikki qurilmada/);
  assert.equal(db.getPlayers()[0].name, 'Local');
  cloud.mergeRemoteSnapshot(remote, { 'players:p1': 'remote' });
  assert.equal(db.getPlayers()[0].name, 'Remote');
});

test('three-way conflict merge preserves a local deletion when remote copy is unchanged', async () => {
  const timestamp = '2026-08-30T08:00:00.000Z';
  const p1 = { id: 'p1', name: 'Leader', updatedAt: timestamp };
  const p2 = { id: 'p2', name: 'Removed locally', updatedAt: timestamp };
  const p3 = { id: 'p3', name: 'Added remotely', updatedAt: '2026-08-31T08:00:00.000Z' };
  let step = 0;
  const writes = [];
  const { cloud, db } = createCloud({
    players: [],
    matches: [],
    fetchImpl: async (_url, options = {}) => {
      step += 1;
      if (step === 1) return response(200, { revision: 1, players: [p1, p2], matches: [] });
      if (options.method === 'POST') {
        writes.push(JSON.parse(options.body));
        if (writes.length === 1) return response(409, { code: 'DATA_REVISION_CONFLICT', currentRevision: 2 });
        return response(200, { success: true, revision: 3 });
      }
      return response(200, { revision: 2, players: [p1, p2, p3], matches: [] });
    }
  });

  assert.equal(await cloud.syncDown(), true);
  db.savePlayers([p1]);
  assert.equal(await cloud.syncUp(), true);
  assert.deepEqual(writes[1].players.map(player => player.id).sort(), ['p1', 'p3']);
});
