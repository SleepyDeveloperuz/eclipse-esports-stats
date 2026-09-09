import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { createRedisStore } from './mlbb/store.js';

const context = new AsyncLocalStorage();

function validateSize(state) {
  const encoded = JSON.stringify(state);
  // Redis REST wraps the stored document in a JSON string; bound both layers.
  if (Buffer.byteLength(encoded, 'utf8') > 4_500_000
    || Buffer.byteLength(JSON.stringify({ result: encoded }), 'utf8') > 5_900_000) {
    throw new TeamStoreError('Baza hajmi chegaraga yetdi. Arxivlash kerak.', 413, 'TEAM_STORAGE_FULL');
  }
}

export class TeamStoreError extends Error {
  constructor(message, status = 503, code = 'TEAM_STORAGE_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// One durable document covers matches, approvals, and Briefing. All writers
// compare the same revision in Redis; process-local queues are not a lock.
export function createTeamRepository({ store, key, seed, maxAttempts = 8 }) {
  async function read() {
    let state = await store.getJSON(key);
    if (!state) {
      const files = await seed();
      const initial = { _storageRevision: 0, files, migratedAt: new Date().toISOString() };
      validateSize(initial);
      await store.compareJSON(key, -1, initial);
      state = await store.getJSON(key);
    }
    if (!Number.isInteger(state?._storageRevision) || !state.files || typeof state.files !== 'object') {
      throw new TeamStoreError('Asosiy baza formati yaroqsiz. Zaxiradan tiklash kerak.');
    }
    return state;
  }
  return {
    async files() { return structuredClone((await read()).files); },
    async transaction(callback) {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const current = await read();
        const draft = structuredClone(current);
        const scope = { files: draft.files, dirty: false };
        const result = await context.run(scope, callback);
        if (!scope.dirty) return result;
        draft._storageRevision = current._storageRevision + 1;
        draft.updatedAt = new Date().toISOString();
        validateSize(draft);
        if (await store.compareJSON(key, current._storageRevision, draft)) return result;
      }
      throw new TeamStoreError('Baza boshqa qurilmada yangilandi. Qayta urinib ko‘ring.', 409, 'TEAM_STORAGE_BUSY');
    }
  };
}

async function seedFromGist() {
  const gistId = process.env.GIST_ID;
  const token = process.env.GITHUB_SYNC_TOKEN;
  if (!gistId || !token) throw new TeamStoreError('Birinchi migratsiya uchun Gist sozlamalari kerak.');
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'EclipseEsports-Migration' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new TeamStoreError('Eski bazani o‘qib bo‘lmadi; migratsiya bajarilmadi.');
  const gist = await response.json();
  if (gist.truncated) throw new TeamStoreError('Gist fayllari to‘liq qaytmadi; migratsiyani tekshiring.');
  const files = {};
  for (const [name, file] of Object.entries(gist.files || {})) {
    if (!/^eclipse_(data|briefing|submission_[a-f0-9]+|vote_[a-zA-Z0-9_-]+)\.json$/.test(name)) continue;
    if (file.truncated || typeof file.content !== 'string') throw new TeamStoreError('Gist mazmuni to‘liq emas; migratsiya to‘xtatildi.');
    try { JSON.parse(file.content); } catch { throw new TeamStoreError('Gist JSON buzilgan; migratsiya to‘xtatildi.'); }
    files[name] = { content: file.content };
  }
  if (!files['eclipse_data.json']) throw new TeamStoreError('Asosiy Gist fayli topilmadi; bo‘sh baza yaratilmaydi.');
  return files;
}

function repository() {
  if (!process.env.GIST_ID) throw new TeamStoreError('Jamoa bazasi sozlanmagan.');
  const namespace = createHash('sha256').update(process.env.GIST_ID).digest('hex').slice(0, 24);
  return createTeamRepository({ store: createRedisStore(), key: `eclipse:team:v1:${namespace}`, seed: seedFromGist });
}

// Backup is deliberately read-only: it must never seed or repair a missing DB.
export async function readExistingTeamSnapshot({ store, gistId = process.env.GIST_ID } = {}) {
  if (!gistId) throw new TeamStoreError('Jamoa bazasi sozlanmagan.');
  const namespace = createHash('sha256').update(gistId).digest('hex').slice(0, 24);
  const key = `eclipse:team:v1:${namespace}`;
  const state = await (store || createRedisStore()).getJSON(key);
  if (!Number.isInteger(state?._storageRevision) || state._storageRevision < 0
    || !state.files || Array.isArray(state.files) || !state.files['eclipse_data.json']) {
    throw new TeamStoreError('To‘liq baza topilmadi. Bo‘sh zaxira yaratilmaydi.');
  }
  for (const file of Object.values(state.files)) {
    if (typeof file?.content !== 'string') throw new TeamStoreError('Zaxira fayli formati buzilgan.');
    try { JSON.parse(file.content); } catch { throw new TeamStoreError('Zaxiradagi JSON buzilgan.'); }
  }
  validateSize(state);
  return { format: 'eclipse-team-backup-v1', exportedAt: new Date().toISOString(), key, state: structuredClone(state) };
}

export async function readTeamFiles() {
  return structuredClone(context.getStore()?.files || await repository().files());
}

export async function writeTeamFiles(files) {
  const scope = context.getStore();
  if (!scope) throw new TeamStoreError('Saqlash transaction ichida bajarilishi kerak.');
  for (const [name, file] of Object.entries(files)) {
    if (file === null) delete scope.files[name];
    else scope.files[name] = { content: file.content };
  }
  scope.dirty = true;
}

export async function withTeamTransaction(callback) {
  if (context.getStore()) return callback();
  return repository().transaction(callback);
}
