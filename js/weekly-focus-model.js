import { eligibleMatches, metricValue, weekRange } from './progress-model.js';

export const FOCUS_METRICS = { deathsPerMinute: 'Deaths / min', damagePerMinute: 'Damage / min', goldPerMinute: 'Gold / min' };
const roles = new Set(['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer']);
export function adjacentWeek(date, offset) {
  const day = new Date(`${weekRange(date).start}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset * 7);
  return day.toISOString().slice(0, 10);
}
// Equal weight per identical player / hero / lane / party-size cohort. Guests,
// casual matches and unknown lanes never become evidence of team improvement.
export function focusBaseline(data, date, scope, metric) {
  if (!['team5', 'squad'].includes(scope) || !Object.hasOwn(FOCUS_METRICS, metric)) throw new Error('Fokus tanlovi noto‘g‘ri.');
  const range = weekRange(date), groups = new Map();
  const matches = eligibleMatches(data, scope).filter(m => m.matchType === 'ranked' && m.date >= range.start && m.date <= range.end);
  for (const match of matches) for (const row of match.playerStats) {
    if (!row.heroUsed || !roles.has(row.rolePlayed)) continue;
    const value = metricValue({ match, row }, metric);
    if (value === null) continue;
    const key = JSON.stringify([row.playerId, row.heroUsed, row.rolePlayed, match.playerStats.length]);
    const group = groups.get(key) || { key, n: 0, sum: 0 };
    group.n++; group.sum += value; groups.set(key, group);
  }
  return { ...range, scope, metric, matches: matches.length, sourceRevision: data.revision || 0,
    cohorts: [...groups.values()].filter(g => g.n >= 5).map(g => ({ key: g.key, n: g.n, mean: g.sum / g.n })) };
}
export function compareFocus(before, after) {
  if (!before || !after || before.scope !== after.scope || before.metric !== after.metric || adjacentWeek(before.start, 1) !== after.start) return null;
  const pairs = before.cohorts.map(a => ({ a, b: after.cohorts.find(b => b.key === a.key) })).filter(p => p.b);
  if (!pairs.length) return null;
  const previous = pairs.reduce((n, p) => n + p.a.mean, 0) / pairs.length;
  const current = pairs.reduce((n, p) => n + p.b.mean, 0) / pairs.length;
  return { metric: before.metric, previous, current, delta: current - previous, cohorts: pairs.length,
    beforeN: pairs.reduce((n, p) => n + p.a.n, 0), afterN: pairs.reduce((n, p) => n + p.b.n, 0) };
}
export function focusSignals(data, date, scope) {
  const comparisons = Object.keys(FOCUS_METRICS).map(metric => compareFocus(
    focusBaseline(data, adjacentWeek(date, -1), scope, metric), focusBaseline(data, date, scope, metric))).filter(Boolean);
  const direction = c => c.delta * (c.metric === 'deathsPerMinute' ? -1 : 1);
  // Fixed order, not a cherry-picked largest percent change. These are signals,
  // never a causal diagnosis or a statistical significance claim.
  return { positive: comparisons.find(c => direction(c) > 0.0001) || null,
    review: comparisons.find(c => direction(c) < -0.0001) || null };
}
