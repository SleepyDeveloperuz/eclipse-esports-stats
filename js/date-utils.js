(function attachEclipseDateUtils(root) {
  const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  const DISPLAY_MONTHS = Object.freeze([
    'YAN', 'FEV', 'MAR', 'APR', 'MAY', 'IYN',
    'IYL', 'AVG', 'SEN', 'OKT', 'NOY', 'DEK'
  ]);

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function isValidDateParts(year, month, day) {
    const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
    return candidate.getFullYear() === year
      && candidate.getMonth() === month - 1
      && candidate.getDate() === day;
  }

  function parseDateOnly(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
    }
    const match = String(value || '').match(DATE_ONLY_PATTERN);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function formatDateOnly(value) {
    const date = parseDateOnly(value);
    if (!date) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function isValidDateOnly(value) {
    return parseDateOnly(value) !== null;
  }

  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function addDays(value, amount) {
    const date = parseDateOnly(value);
    if (!date) return '';
    date.setDate(date.getDate() + Number(amount || 0));
    return formatDateOnly(date);
  }

  function startOfWeek(value) {
    const date = parseDateOnly(value);
    if (!date) return '';
    const day = date.getDay();
    date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    return formatDateOnly(date);
  }

  function weekRange(value) {
    const start = startOfWeek(value);
    return start ? { start, end: addDays(start, 6) } : null;
  }

  function compare(a, b) {
    const left = formatDateOnly(a);
    const right = formatDateOnly(b);
    if (!left || !right) return Number.NaN;
    return left.localeCompare(right);
  }

  function formatDisplayDate(value, options = {}) {
    const dateOnly = parseDateOnly(value);
    const candidate = dateOnly || (value instanceof Date ? new Date(value.getTime()) : new Date(value));
    if (!candidate || !Number.isFinite(candidate.getTime())) return '';
    const includeTime = options.includeTime !== false;
    const includeYear = options.includeYear === true;
    const dateLabel = `${pad(candidate.getDate())} ${DISPLAY_MONTHS[candidate.getMonth()]}${includeYear ? ` ${candidate.getFullYear()}` : ''}`;
    return includeTime
      ? `${dateLabel} · ${pad(candidate.getHours())}:${pad(candidate.getMinutes())}`
      : dateLabel;
  }

  const api = Object.freeze({
    isValidDateOnly,
    parseDateOnly,
    formatDateOnly,
    formatDisplayDate,
    today,
    addDays,
    startOfWeek,
    weekRange,
    compare
  });
  root.EclipseDateUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
