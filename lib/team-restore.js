import { createHash } from 'node:crypto';
import { TeamStoreError } from './team-store.js';

const fail = message => { throw new TeamStoreError(message, 409, 'RESTORE_REFUSED'); };
const allowedFile = /^eclipse_(data|briefing|history|weekly|submission_[a-f0-9]+|vote_[a-zA-Z0-9_-]+)\.json$/;

function publicRevision(core, message) {
  if (!core || typeof core !== 'object' || Array.isArray(core)) fail(message);
  // Migrated Gist documents predate public revisions. Only a missing field is
  // legacy zero; an explicitly malformed revision must still fail closed.
  if (!Object.hasOwn(core, 'revision')) return 0;
  if (!Number.isSafeInteger(core.revision) || core.revision < 0) fail(message);
  return core.revision;
}

export function validateBackup(backup, gistId) {
  if (!gistId) fail('Jamoa namespace sozlanmagan.');
  const key = `eclipse:team:v1:${createHash('sha256').update(gistId).digest('hex').slice(0, 24)}`;
  if (backup?.format !== 'eclipse-team-backup-v1' || backup.key !== key) fail('Backup boshqa jamoaga tegishli yoki formati noto‘g‘ri.');
  const state = backup.state;
  if (!Number.isSafeInteger(state?._storageRevision) || state._storageRevision < 0 || !state.files || Array.isArray(state.files)) fail('Backup revision yoki fayllari yaroqsiz.');
  for (const [name, file] of Object.entries(state.files)) {
    if (!allowedFile.test(name) || typeof file?.content !== 'string') fail('Noma’lum yoki buzilgan backup fayli.');
    let data;
    try { data = JSON.parse(file.content); } catch { fail('Backup ichidagi JSON buzilgan.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Backup fayli obyekt bo‘lishi kerak.');
    if (name === 'eclipse_history.json' && (!Array.isArray(data.entries) || data.entries.some(e => !e?.id || !e.matchId || typeof e.afterFingerprint !== 'string'))) fail('Correction history yaroqsiz.');
    if (name === 'eclipse_weekly.json' && (!Array.isArray(data.reports) || data.reports.some(r => !r?.id || !Array.isArray(r.players) || !Array.isArray(r.heroes)))) fail('Weekly hisobotlar yaroqsiz.');
  }
  let core;
  try { core = JSON.parse(state.files['eclipse_data.json'].content); } catch { fail('Asosiy baza topilmadi.'); }
  core.revision = publicRevision(core, 'Asosiy baza sxemasi yaroqsiz.');
  if (!Array.isArray(core.players) || !Array.isArray(core.matches)) fail('Asosiy baza sxemasi yaroqsiz.');
  for (const records of [core.players, core.matches]) {
    const ids = records.map(record => record?.id);
    if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) fail('Takroriy yoki yo‘q ID aniqlandi.');
  }
  const encoded = JSON.stringify(state);
  if (Buffer.byteLength(encoded) > 4_500_000 || Buffer.byteLength(JSON.stringify({ result: encoded })) > 5_900_000) fail('Backup hajmi chegaradan katta.');
  return { key, state: structuredClone(state), core };
}

// Dry-run by default. No HTTP restore endpoint: this is an operator-only tool.
export async function restoreTeamBackup({ backup, gistId, store, expectedRevision, apply = false, saveBefore, now = new Date().toISOString() }) {
  const { key, state, core } = validateBackup(backup, gistId);
  const current = await store.getJSON(key);
  if (current !== null && (!Number.isSafeInteger(current._storageRevision) || !current.files)) fail('Joriy baza buzilgan. Avval alohida diagnostika kerak.');
  const revision = current?._storageRevision ?? -1;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== revision) fail('Joriy revision mos emas. Yangi dry-run bajaring.');
  let currentCore;
  try { currentCore = current && JSON.parse(current.files['eclipse_data.json'].content); } catch { fail('Joriy asosiy JSON buzilgan.'); }
  const currentPublicRevision = current === null ? -1 : publicRevision(currentCore, 'Joriy asosiy revision yaroqsiz.');
  state._storageRevision = Math.max(revision, state._storageRevision) + 1;
  state.updatedAt = now;
  state.restoredAt = now;
  core.revision = Math.max(currentPublicRevision, core.revision) + 1;
  core.updatedAt = now;
  core.lastMutationId = `restore-${state._storageRevision}`;
  state.files['eclipse_data.json'].content = JSON.stringify(core);
  validateBackup({ ...backup, state }, gistId);
  const summary = { applied: false, currentRevision: revision, nextRevision: state._storageRevision, players: core.players.length, matches: core.matches.length, files: Object.keys(state.files).length };
  if (!apply) return summary;
  if (typeof saveBefore !== 'function') fail('Tiklashdan oldingi holatni Mac’ga saqlash talab qilinadi.');
  // Must succeed before any mutation. The CAS below still rejects concurrent writes.
  await saveBefore({ format: current ? 'eclipse-team-backup-v1' : 'eclipse-team-missing-v1', exportedAt: now, key, state: current });
  if (!await store.restoreJSON(key, revision, state)) fail('Baza dry-run’dan keyin o‘zgardi. Hech narsa tiklanmadi.');
  return { ...summary, applied: true };
}
