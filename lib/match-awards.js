// Observations only: never turn an unknown icon or +N overflow into a medal,
// multikill, role, or rating bonus. Absent legacy evidence remains absent.
export function normaliseAwardEvidence(source = {}) {
  const result = {};
  if (typeof source.afk === 'boolean') result.afk = source.afk;
  if (Array.isArray(source.highlightNotes)) result.highlightNotes = [...new Set(source.highlightNotes
    .filter(value => typeof value === 'string')
    .map(value => value.replace(/[\u0000-\u001f\u007f<>"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80))
    .filter(Boolean))].slice(0, 8);
  if (Number.isInteger(source.highlightOverflow) && source.highlightOverflow >= 0 && source.highlightOverflow <= 20) result.highlightOverflow = source.highlightOverflow;
  return result;
}
