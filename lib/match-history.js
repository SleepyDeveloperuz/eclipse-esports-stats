import { createHash, randomUUID } from 'node:crypto';
export const HISTORY_FILE = 'eclipse_history.json';
export function fingerprint(value) {
  const canonical = input => Array.isArray(input) ? input.map(canonical) : input && typeof input === 'object'
    ? Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical(input[key])])) : input;
  return createHash('sha256').update(JSON.stringify(canonical(value ?? null))).digest('hex');
}
export function readHistory(files) {
  if (!files[HISTORY_FILE]) return { version: 1, entries: [], pruned: 0 };
  const result = JSON.parse(files[HISTORY_FILE].content);
  if (!Array.isArray(result.entries)) throw new Error('Correction history formati yaroqsiz.');
  return result;
}
export function recordChanges(history, before, after, { undoOf = null } = {}) {
  const next = structuredClone(history), previous = new Map((before.matches || []).map(m => [m.id, m]));
  const current = new Map((after.matches || []).map(m => [m.id, m]));
  for (const id of new Set([...previous.keys(), ...current.keys()])) {
    const old = previous.get(id) || null, value = current.get(id) || null;
    if ((!old && !undoOf) || fingerprint(old) === fingerprint(value)) continue;
    next.entries.push({ id: randomUUID(), matchId: id, at: new Date().toISOString(), actor: 'Captain / admin session',
      action: undoOf ? 'undo' : value ? 'edit' : 'delete', undoOf, before: old, after: value,
      afterFingerprint: fingerprint(value) });
  }
  if (undoOf) {
    const event = next.entries.find(e => e.id === undoOf);
    if (event) event.undoneAt = new Date().toISOString();
  }
  // Bounded, visible retention; ordinary team data is never truncated.
  while (next.entries.length > 200 || (next.entries.length > 1 && Buffer.byteLength(JSON.stringify(next)) > 900000)) {
    next.entries.shift(); next.pruned = (next.pruned || 0) + 1;
  }
  return next;
}
export function undoCorrection(data, history, id, expectedRevision) {
  const error = message => { throw Object.assign(new Error(message), { status: 409, code: 'UNDO_CONFLICT' }); };
  const event = history.entries.find(e => e.id === id);
  if (!event) error('Yozuv topilmadi yoki retention muddati o‘tgan.');
  if (event.undoneAt) return null; // Idempotent replay, never reapply an old snapshot.
  if (data.revision !== expectedRevision) error('Baza yangilangan. Tarixni yangilab qayta urinib ko‘ring.');
  const later = history.entries.slice(history.entries.indexOf(event) + 1).some(e => e.matchId === event.matchId);
  const current = data.matches.find(m => m.id === event.matchId) || null;
  if (later || fingerprint(current) !== event.afterFingerprint) error('Bu match keyinroq o‘zgargan. Undo yangi tahrirni bosib ketmaydi.');
  if (!event.before) error('Bu yozuvni Undo qilish mumkin emas.');
  const roster = new Set(data.players.map(p => p.id));
  if ((event.before.playerStats || []).some(r => !roster.has(r.playerId))) error('Oldingi tarkibdagi o‘yinchi rosterda yo‘q. Avval uni tiklang.');
  return { ...data, revision: data.revision + 1, lastMutationId: randomUUID(), updatedAt: new Date().toISOString(),
    matches: [...data.matches.filter(m => m.id !== event.matchId), structuredClone(event.before)] };
}
