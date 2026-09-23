// Pure, shared calculations: the browser preview and published report use the same rules.
export const METRICS = {
  deathsPerMinute: 'Deaths / min', damagePerMinute: 'Damage / min',
  goldPerMinute: 'Gold / min', teamfightParticipation: 'Teamfight %', inGameScore: 'Match rating'
};
export function numeric(value) {
  return ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}
export function eligibleMatches(data, scope = 'team5') {
  const roster = new Set((data.players || []).map(p => p.id));
  return (data.matches || []).filter(m => {
    const rows = m.playerStats || [], ids = new Set(rows.map(r => r.playerId));
    const inferred = rows.length === 5 ? 'team5' : rows.length === 1 ? 'individual' : rows.length >= 2 && rows.length <= 4 ? 'squad' : '';
    return m.status !== 'draft' && m.validForAnalytics !== false && m.needsReview !== true
      && ['win', 'loss'].includes(m.result) && /^\d{4}-\d{2}-\d{2}$/.test(m.date || '')
      && rows.length === ids.size && rows.every(r => roster.has(r.playerId)) && m.scope === inferred
      && (scope === 'team5' ? inferred === 'team5' && !(m.guestStats || []).length : ['individual', 'squad'].includes(inferred));
  }).sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id));
}
export function observations(matches, { playerId, hero = '', role = '', matchType = '' } = {}) {
  return matches.filter(m => !matchType || m.matchType === matchType).flatMap(match => (match.playerStats || [])
    .filter(r => r.playerId === playerId && (!hero || r.heroUsed === hero) && (!role || r.rolePlayed === role))
    .map(row => ({ match, row })));
}
export function metricValue(observation, field) {
  const { row, match } = observation;
  const rateFields = { deathsPerMinute: 'deaths', damagePerMinute: 'damageDealt', goldPerMinute: 'goldEarned' };
  if (!rateFields[field]) return numeric(row[field]);
  const value = numeric(row[rateFields[field]]), seconds = numeric(match.durationSeconds);
  return value !== null && seconds > 0 ? value * 60 / seconds : null;
}
export function summarize(rows) {
  const wins = rows.filter(o => o.match.result === 'win').length;
  return { count: rows.length, wins, winRate: rows.length ? wins * 100 / rows.length : null,
    metrics: Object.fromEntries(Object.keys(METRICS).map(field => {
      const values = rows.map(o => metricValue(o, field)).filter(v => v !== null);
      return [field, { n: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }];
    })) };
}
export function compareResults(rows) {
  const win = summarize(rows.filter(o => o.match.result === 'win')), loss = summarize(rows.filter(o => o.match.result === 'loss'));
  return { win, loss, early: Math.min(win.count, loss.count) < 5,
    differences: Object.fromEntries(Object.keys(METRICS).map(key => [key,
      win.metrics[key].mean === null || loss.metrics[key].mean === null ? null : win.metrics[key].mean - loss.metrics[key].mean])) };
}
export function heroJourney(rows) {
  const size = Math.min(5, Math.floor(rows.length / 2));
  return { count: rows.length, window: size, first: summarize(rows.slice(0, size)),
    recent: summarize(size ? rows.slice(-size) : []), excludedMiddle: rows.length - size * 2,
    best: [...rows].filter(o => numeric(o.row.inGameScore) !== null).sort((a, b) => b.row.inGameScore - a.row.inGameScore).slice(0, 3) };
}
export function weekRange(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Hafta sanasi kerak.');
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) throw new Error('Sana noto‘g‘ri.');
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  const start = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 6);
  return { start, end: day.toISOString().slice(0, 10) };
}
export function weeklyReport(data, date, scope) {
  if (!['team5', 'squad'].includes(scope)) throw new Error('Statistika tarkibi noto‘g‘ri.');
  const range = weekRange(date), all = eligibleMatches(data, scope);
  const matches = all.filter(m => m.date >= range.start && m.date <= range.end);
  const wins = matches.filter(m => m.result === 'win').length;
  const heroes = new Map();
  matches.forEach(m => m.playerStats.forEach(r => { if (r.heroUsed) heroes.set(r.heroUsed, (heroes.get(r.heroUsed) || 0) + 1); }));
  const players = (data.players || []).map(p => {
    const rows = observations(matches, { playerId: p.id });
    return { id: p.id, name: p.name, ...summarize(rows), mvps: rows.filter(o => o.row.medal === 'mvp').length };
  }).filter(p => p.count).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { ...range, scope, count: matches.length, wins, losses: matches.length - wins,
    winRate: matches.length ? wins * 100 / matches.length : null, players,
    heroes: [...heroes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
    matchIds: matches.map(m => m.id), sourceRevision: data.revision || 0 };
}
export function moments(rows) {
  // Records are relative only to the selected, recorded dataset; no invented match narrative.
  const selected = new Map();
  for (const field of ['inGameScore', 'damagePerMinute', 'goldPerMinute']) {
    const known = rows.filter(o => metricValue(o, field) !== null);
    if (known.length < 2) continue;
    const best = Math.max(...known.map(o => metricValue(o, field)));
    const tied = known.filter(o => metricValue(o, field) === best);
    for (const o of tied.slice(-1)) {
      const entry = selected.get(o.match.id) || { ...o, reasons: [] };
      entry.reasons.push(`${METRICS[field]}: ${best.toFixed(1)}${tied.length > 1 ? ' · teng rekord' : ''} (${known.length} match)`);
      selected.set(o.match.id, entry);
    }
  }
  for (const o of rows.filter(o => o.row.medal === 'mvp').slice(-5)) {
    const entry = selected.get(o.match.id) || { ...o, reasons: [] };
    if (!entry.reasons.includes('MVP')) entry.reasons.push('MVP');
    selected.set(o.match.id, entry);
  }
  return [...selected.values()].sort((a, b) => b.match.date.localeCompare(a.match.date));
}
