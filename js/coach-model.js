import { eligibleMatches, metricValue, numeric } from './progress-model.js';

export const COACH_RULES = {
  deathsPerMinute: { label: 'Deaths / min', direction: -1, relative: .2, absolute: .1, action: 'Keyingi 5 mos matchda o‘limlardan oldingi vaziyatlarni VOD orqali tekshiring: maqsad, jamoaning joylashuvi va chiqish yo‘lini qayd eting.' },
  teamfightParticipation: { label: 'Teamfight %', direction: 1, relative: 0, absolute: 10, action: 'Keyingi 5 mos matchda jamoa janglariga qatnashgan va qatnashmagan vaziyatlarni ko‘rib chiqing. Split-push yoki boshqa maqsad bo‘lganini alohida qayd eting.' },
  goldPerMinute: { label: 'Gold / min', direction: 1, relative: .15, absolute: 50, action: 'Keyingi 5 mos matchda farm va rotatsiya vaqtlarini VOD orqali ko‘rib chiqing. Gold farqining sababini scoreboardning o‘zidan aniqlab bo‘lmaydi.' },
  damagePerMinute: { label: 'Damage / min', direction: 1, relative: .15, absolute: 300, action: 'Keyingi 5 mos matchda asosiy janglarda damage berish imkoniyatlarini tekshiring. Xavfsiz damage, raqib tarkibi va jamoaviy vazifani hisobga oling.' },
  turretPerMinute: { label: 'Turret damage / min', direction: 1, relative: .2, absolute: 100, action: 'Keyingi 5 mos matchda ustunlikdan keyin turret olish imkoniyatlarini ko‘rib chiqing. Turret damage butun objective o‘yinini o‘lchamaydi.' }
};
const roles = new Set(['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer']);
const types = new Set(['ranked', 'scrim', 'tournament', 'casual']);
const DAY = 86400000;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function coachContexts(data, playerId, scope, matchType, today) {
  if (!['team5', 'squad'].includes(scope) || !types.has(matchType) || !validDate(today)) throw new Error('Coach filtrlari noto‘g‘ri.');
  const groups = new Map(), seen = new Set(); let unknownLane = 0;
  for (const match of eligibleMatches(data, scope)) {
    if (seen.has(match.id) || match.matchType !== matchType || !validDate(match.date) || match.date > today) continue;
    seen.add(match.id);
    const row = match.playerStats.find(r => r.playerId === playerId);
    if (!row) continue;
    if (!row.heroUsed || !roles.has(row.rolePlayed)) { unknownLane++; continue; }
    const key = JSON.stringify([row.heroUsed, row.rolePlayed, match.playerStats.length]);
    const group = groups.get(key) || { key, hero: row.heroUsed, role: row.rolePlayed, party: match.playerStats.length, rows: [] };
    group.rows.push({ match, row }); groups.set(key, group);
  }
  return { unknownLane, groups: [...groups.values()].sort((a, b) => b.rows.at(-1).match.date.localeCompare(a.rows.at(-1).match.date)
    || String(b.rows.at(-1).match.createdAt || '').localeCompare(String(a.rows.at(-1).match.createdAt || '')) || a.key.localeCompare(b.key)) };
}
function value(o, metric) {
  if (metric !== 'turretPerMinute') return metricValue(o, metric);
  const turret = numeric(o.row.turretDamage), seconds = numeric(o.match.durationSeconds);
  return turret !== null && seconds > 0 ? turret * 60 / seconds : null;
}
function summary(rows) {
  return { wins: rows.filter(o => o.match.result === 'win').length, losses: rows.filter(o => o.match.result === 'loss').length,
    metrics: Object.fromEntries(Object.keys(COACH_RULES).map(metric => {
      const values = rows.map(o => value(o, metric)).filter(v => v !== null);
      return [metric, { n: values.length, mean: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null }];
    })) };
}
export function coachReport(group, today) {
  const rows = group?.rows || [], count = rows.length, completed = Math.floor(count / 5) * 5;
  const report = { count, status: 'collecting', previous: null, recent: null, primary: null, extras: [], pending: count < 10 ? count : count - completed,
    remaining: count < 10 ? 10 - count : 5 - (count - completed), evidence: [], metrics: [] };
  if (count < 10) return report;
  const window = rows.slice(completed - 10, completed), previousRows = window.slice(0, 5), recentRows = window.slice(5);
  report.evidence = window.map(o => ({ id: o.match.id, date: o.match.date, result: o.match.result, period: previousRows.includes(o) ? 'previous' : 'recent' }));
  report.previous = summary(previousRows); report.recent = summary(recentRows);
  report.from = window[0].match.date; report.to = window.at(-1).match.date;
  report.inferredRoles = window.filter(o => !['manual', 'ocr'].includes(o.row.roleSource)).length;
  report.metrics = Object.entries(COACH_RULES).map(([key, rule]) => {
    const before = report.previous.metrics[key], after = report.recent.metrics[key];
    return { key, label: rule.label, before, after, delta: before.n === 5 && after.n === 5 ? after.mean - before.mean : null };
  });
  // Old cross-patch history should not silently become current coaching.
  if (!validDate(today) || Date.parse(today) - Date.parse(report.to) > 30 * DAY || Date.parse(report.to) - Date.parse(report.from) > 90 * DAY) {
    report.status = 'stale'; return report;
  }
  report.status = 'observed';
  const signals = report.metrics.flatMap(metric => {
    if (metric.delta === null) return [];
    // Resources and turret output remain descriptive for roam; no carry target.
    if (group.role === 'Roamer' && ['damagePerMinute', 'goldPerMinute', 'turretPerMinute'].includes(metric.key)) return [];
    const rule = COACH_RULES[metric.key], threshold = Math.max(rule.absolute, metric.before.mean * rule.relative);
    if (Math.abs(metric.delta) + 1e-9 < threshold) return [];
    return [{ ...metric, kind: metric.delta * rule.direction < 0 ? 'review' : 'positive', action: rule.action }];
  });
  // A fixed transparent priority, never a worst-player or largest-percent rank.
  report.primary = signals.find(s => s.kind === 'review') || null;
  report.extras = signals.filter(s => s !== report.primary).slice(0, 2);
  return report;
}
