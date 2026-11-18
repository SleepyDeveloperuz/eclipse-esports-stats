// Pure, shared calculations: the browser preview and published report use the same rules.
export const METRICS = {
  deathsPerMinute: 'Deaths / min', damagePerMinute: 'Damage / min',
  goldPerMinute: 'Gold / min', teamfightParticipation: 'Teamfight %', inGameScore: 'Match rating'
};
export function numeric(value) {
  return ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}
// Keep this quality gate in parity with the classic-script StatsEngine gate.
export function isAnalyticsEligible(match) {
  return !!match && match.status !== 'draft' && match.validForAnalytics !== false && match.needsReview !== true
    && match.verificationStatus !== 'needs_review'
    && (match.dataIssues == null || (Array.isArray(match.dataIssues) && match.dataIssues.length === 0));
}
export function eligibleMatches(data, scope = 'team5') {
  const roster = new Set((data.players || []).map(p => p.id));
  return (data.matches || []).filter(m => {
    const rows = m.playerStats || [], ids = new Set(rows.map(r => r.playerId));
    const inferred = rows.length === 5 ? 'team5' : rows.length === 1 ? 'individual' : rows.length >= 2 && rows.length <= 4 ? 'squad' : '';
    return isAnalyticsEligible(m)
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
    return { id: p.id, name: p.name, ...summarize(rows), mvps: rows.filter(o => ['mvp', 'supreme_mvp'].includes(o.row.medal)).length };
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
  for (const o of rows.filter(o => ['mvp', 'supreme_mvp'].includes(o.row.medal)).slice(-5)) {
    const entry = selected.get(o.match.id) || { ...o, reasons: [] };
    if (!entry.reasons.includes('MVP')) entry.reasons.push('MVP');
    selected.set(o.match.id, entry);
  }
  return [...selected.values()].sort((a, b) => b.match.date.localeCompare(a.match.date));
}

// Compare adjacent calendar windows. Team counts use matches; averages use known
// player observations, so a missing measurement contributes no value or sample.
export function progressOverview(data, { scope = 'team5', days = 30, end = '', matchType = '', playerId = '', hero = '', role = '' } = {}) {
  const seen = new Set();
  const all = eligibleMatches(data, scope).filter(match => {
    const time = Date.parse(match.date + 'T00:00:00Z');
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== match.date
      || seen.has(match.id) || (matchType && match.matchType !== matchType)) return false;
    seen.add(match.id);
    return true;
  });
  const limit = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const anchor = end || all.at(-1)?.date;
  const anchorDate = new Date(anchor ? anchor + 'T00:00:00Z' : NaN);
  if (!Number.isFinite(anchorDate.getTime()) || anchorDate.toISOString().slice(0, 10) !== anchor) return null;
  const offset = days => new Date(anchorDate.getTime() + days * 86400000).toISOString().slice(0, 10);
  const current = { from: offset(1 - limit), to: anchor };
  const previous = { from: offset(1 - 2 * limit), to: offset(-limit) };
  const collect = (range, id = playerId) => {
    const matches = [], rows = [];
    for (const match of all) {
      if (match.date < range.from || match.date > range.to) continue;
      const subset = match.playerStats.filter(row => (!id || row.playerId === id)
        && (!id || !hero || row.heroUsed === hero) && (!id || !role || row.rolePlayed === role));
      if (!subset.length) continue;
      matches.push(match);
      rows.push(...subset.map(row => ({ match, row })));
    }
    const wins = matches.filter(match => match.result === 'win').length;
    return { ...range, matches, rows, count: matches.length, wins, losses: matches.length - wins,
      winRate: matches.length ? wins * 100 / matches.length : null, metrics: summarize(rows).metrics };
  };
  const currentResult = collect(current), previousResult = collect(previous);
  const chunk = limit === 7 ? 1 : limit === 30 ? 7 : 14;
  const trend = [];
  for (let day = 1 - limit; day <= 0; day += chunk) {
    const from = offset(day), to = offset(Math.min(0, day + chunk - 1));
    const matches = currentResult.matches.filter(match => match.date >= from && match.date <= to);
    trend.push({ from, to, count: matches.length, wins: matches.filter(match => match.result === 'win').length });
  }
  return { current: currentResult, previous: previousResult, trend, players: (data.players || []).map(player => ({
    player, current: collect(current, player.id), previous: collect(previous, player.id)
  })).filter(item => item.current.count || item.previous.count) };
}
