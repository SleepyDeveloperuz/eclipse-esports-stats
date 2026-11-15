// Shared utility functions for Eclipse Esports Stats backend

export function cleanText(value, maxLength = 200) {
  const limit = typeof maxLength === 'number' && maxLength > 0 ? maxLength : 200;
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f<>\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
    : '';
}

export function cleanId(value, maxLength = 100) {
  const limit = typeof maxLength === 'number' && maxLength > 0 ? maxLength : 100;
  const id = cleanText(value, limit);
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
}

export function cleanDate(value) {
  const text = cleanText(value, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
    ? text
    : '';
}

export function nullableNumber(value, { min = null, max = null, integer = false } = {}) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  if (!['number', 'string'].includes(typeof value)) return null;
  const text = typeof value === 'string' ? value.replace(/[,%\s]/g, '').trim() : '';
  if (typeof value === 'string' && (!text || !/^-?\d+(?:\.\d+)?$/.test(text))) return null;
  const parsed = typeof value === 'number' ? value : Number(text);
  if (!Number.isFinite(parsed)) return null;
  if (integer && !Number.isInteger(parsed)) return null;
  if (min !== null && parsed < min) return null;
  if (max !== null && parsed > max) return null;
  return integer ? parsed : Number(parsed.toFixed(2));
}

export function parseDuration(value, maxSeconds = 7259) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= maxSeconds ? value : null;
  }
  const text = String(value).trim();
  const clock = text.match(/^(\d{1,3}):([0-5]\d)$/);
  const legacy = text.match(/^(\d{1,3})m\s([0-5]\d)s$/i);
  const hourLegacy = text.match(/^(\d{1,2})h\s([0-5]\d)m\s([0-5]\d)s$/i);
  let total = null;
  if (clock || legacy) total = (Number((clock || legacy)[1]) * 60) + Number((clock || legacy)[2]);
  if (hourLegacy) total = (Number(hourLegacy[1]) * 3600) + (Number(hourLegacy[2]) * 60) + Number(hourLegacy[3]);
  return Number.isInteger(total) && total >= 1 && total <= maxSeconds ? total : null;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
