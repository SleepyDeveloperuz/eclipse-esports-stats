// This ledger stores field categories and timing only, never images or values.
export const QUALITY_FILE = 'eclipse_scan_quality.json';
export const QUALITY_FIELDS = ['Natija', 'Davomiylik', 'Qatnashchilar', 'O‘yinchi', 'Hero', 'Layn', 'K/D/A', 'Medal', 'Rating', 'Damage', 'Gold', 'Teamfight', 'Highlights', 'Team metrics'];
const outcomes = new Set(['ready', 'review', 'error', 'cancelled']);
export function qualityEvent(input) {
  if (!input || typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.id) || !outcomes.has(input.outcome)
    || !Number.isSafeInteger(input.elapsedMs) || input.elapsedMs < 0 || input.elapsedMs > 600000) return null;
  return { id: input.id, outcome: input.outcome, elapsedMs: input.elapsedMs };
}
export function readQuality(files) {
  return files[QUALITY_FILE] ? JSON.parse(files[QUALITY_FILE].content) : { version: 1, entries: [], pruned: 0 };
}
export function recordQuality(ledger, input, owner, { submitted = false, now = new Date().toISOString() } = {}) {
  const event = qualityEvent(input);
  if (!event || !owner) return ledger;
  const index = ledger.entries.findIndex(e => e.id === event.id);
  const old = ledger.entries[index];
  if (old && old.owner !== owner) return ledger;
  // A later, out-of-order terminal event cannot erase submission evidence.
  if (old?.submittedAt || old && !submitted) return ledger;
  if (submitted && (!['ready', 'review'].includes(event.outcome) || !Array.isArray(input.changedFields)
    || input.changedFields.some(f => !QUALITY_FIELDS.includes(f)) || input.baseline !== true)) return ledger;
  const entry = { ...event, owner, at: old?.at || now, ...(submitted ? { submittedAt: now, changedFields: [...new Set(input.changedFields)].sort() } : {}) };
  const entries = [...ledger.entries];
  if (index < 0) entries.push(entry); else entries[index] = entry;
  const overflow = Math.max(0, entries.length - 300);
  return { version: 1, entries: entries.slice(overflow), pruned: ledger.pruned + overflow };
}
export function summarizeQuality(ledger) {
  const entries = ledger.entries, accepted = entries.filter(e => e.submittedAt).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).slice(-30);
  const durations = entries.filter(e => ['ready', 'review'].includes(e.outcome)).map(e => e.elapsedMs).sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  return { attempts: entries.length, failed: entries.filter(e => e.outcome === 'error').length, cancelled: entries.filter(e => e.outcome === 'cancelled').length,
    medianMs: durations.length ? durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2 : null,
    pruned: ledger.pruned,
    pilot: { count: accepted.length, unchanged: accepted.filter(e => !e.changedFields.length).length,
      fields: QUALITY_FIELDS.map(f => [f, accepted.filter(e => e.changedFields.includes(f)).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]) } };
}
export function validQualityLedger(data) {
  return data?.version === 1 && Number.isSafeInteger(data.pruned) && data.pruned >= 0 && Array.isArray(data.entries) && data.entries.length <= 300
    && new Set(data.entries.map(e => e?.id)).size === data.entries.length
    && data.entries.every(e => qualityEvent(e) && /^[a-f0-9]{64}$/.test(e.owner || '') && Number.isFinite(Date.parse(e.at))
      && (!e.submittedAt || Number.isFinite(Date.parse(e.submittedAt)) && ['ready', 'review'].includes(e.outcome)
        && Array.isArray(e.changedFields) && e.changedFields.every(f => QUALITY_FIELDS.includes(f))));
}
