export const TIER_METHOD_VERSION = 'eclipse-tier-5.0.0';
const DAY = 86400000;
const rate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const complete = row => [row?.winRate, row?.pickRate, row?.banRate].every(rate) && row.pickRate > 0;
const round = value => Number(value.toFixed(4));
function quantile(sorted, p) {
  const index = (sorted.length - 1) * p, low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}
const WEIGHTS = Object.freeze({ winRate: .5, pickRate: .2, banRate: .3 });
const CUTS = Object.freeze([['SS', 70], ['S', 60], ['A', 50], ['B', 40], ['C', 30]]);
const BAN_REFERENCE = .1, PICK_FLOOR = .001, PICK_FALLBACK = .01;
function tierFor(score) {
  return CUTS.find(([, minimum]) => score >= minimum)?.[0] || 'D';
}

// An explicit draft-priority heuristic, not a copy of a private algorithm or a forecast.
// Saturation prevents one rate from growing without bound. Rates are not match counts.
export function buildEclipseTier(rankRows, options = {}) {
  if (!Array.isArray(rankRows)) return [];
  const eligible = rankRows.filter(complete);
  const winsInRank = eligible.map(row => row.winRate).sort((a, b) => a - b);
  const picksInRank = eligible.map(row => row.pickRate).sort((a, b) => a - b);
  const cohortReady = winsInRank.length >= 10;
  const median = winsInRank.length ? quantile(winsInRank, .5) : null;
  const iqr = winsInRank.length ? quantile(winsInRank, .75) - quantile(winsInRank, .25) : null;
  const center = cohortReady ? median : .5;
  const spread = cohortReady ? Math.max(iqr / 1.349, .005) : .02;
  const medianPickRate = picksInRank.length ? quantile(picksInRank, .5) : null;
  const pickReference = cohortReady ? Math.max(medianPickRate, PICK_FLOOR) : PICK_FALLBACK;
  const current = Date.parse(options.updatedAt), now = Number.isFinite(options.now) ? options.now : Date.now();
  const patchTime = Date.parse(options.patchPublishedAt);
  const fresh = Number.isFinite(current) && current <= now && now - current <= 36 * 3600000;
  const postPatch = Boolean(options.patchEpoch) && Number.isFinite(patchTime) && current - Number(options.days || 7) * DAY >= patchTime;
  const history = options.history, daily = new Map();
  if (history && history.rank === options.rank && String(history.days) === String(options.days)) {
    for (const point of Array.isArray(history.snapshots) ? history.snapshots : []) {
      const time = Date.parse(point.updatedAt);
      // Reuse compatible RAW observations across method versions, never historical scores.
      if (!options.patchEpoch || point.patchEpoch !== options.patchEpoch
        || !Number.isFinite(time) || !Number.isFinite(current) || time >= current || current - time > 7 * DAY
        || !Number.isFinite(patchTime) || time - Number(options.days || 7) * DAY < patchTime) continue;
      const day = new Date(time).toISOString().slice(0, 10);
      if (day === new Date(current).toISOString().slice(0, 10)) continue;
      if (!daily.has(day) || Date.parse(daily.get(day).updatedAt) < time) daily.set(day, point);
    }
  }
  const points = [...daily.values()].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)).slice(-2);
  const scored = rankRows.map(row => {
    const valid = complete(row);
    const absoluteSignal = valid ? (row.winRate - .5) / .02 : null;
    const relativeSignal = valid ? (row.winRate - center) / spread : null;
    const signal = valid ? .6 * absoluteSignal + .4 * relativeSignal : null;
    const winSignal = valid ? 50 + 100 / Math.PI * Math.atan(signal) : null;
    const pickSignal = valid ? 100 * row.pickRate / (row.pickRate + pickReference) : null;
    const banSignal = valid ? 100 * row.banRate / (row.banRate + BAN_REFERENCE) : null;
    const winPoints = valid ? winSignal * WEIGHTS.winRate : null;
    const pickPoints = valid ? pickSignal * WEIGHTS.pickRate : null;
    const banPoints = valid ? banSignal * WEIGHTS.banRate : null;
    const rawScore = valid ? winPoints + pickPoints + banPoints : null;
    const score = valid ? round(rawScore) : null;
    // Tier and order use full precision; display rounding must not promote a hero.
    const tier = valid ? tierFor(rawScore) : 'U';
    const observations = points.map(p => Array.isArray(p.rows) ? p.rows.find(t => Array.isArray(t) && t[0] === row.heroId) : null)
      .filter(p => p && [p[1], p[2], p[3]].every(rate) && p[2] > 0);
    const wins = [...observations.map(p => p[1]), row.winRate];
    const picks = [...observations.map(p => p[2]), row.pickRate];
    const bans = [...observations.map(p => p[3]), row.banRate];
    const range = values => Math.max(...values) - Math.min(...values);
    const stable = valid && fresh && postPatch && observations.length === 2
      && range(wins) <= .015 + 1e-10 && range(picks) <= Math.max(.002, row.pickRate * .25) + 1e-10 && range(bans) <= .05 + 1e-10;
    const borderline = valid && CUTS.some(([, edge]) => Math.abs(rawScore - edge) <= 1);
    return { ...row, tier, rawTier: tier, eclipseScore: score, adjustedWinRate: valid ? row.winRate : null,
      visibility: !valid ? 'unknown' : row.pickRate < .005 ? 'low' : row.pickRate >= .02 ? 'high' : 'normal',
      draftDemand: { pickRate: row.pickRate, banRate: row.banRate },
      quality: { status: !valid ? 'unrated' : !fresh ? 'stale' : stable ? 'stable' : 'provisional', borderline,
        historyDays: observations.length + (valid ? 1 : 0), sampleSize: null, confidence: null,
        patchWindow: postPatch ? 'post-patch' : 'unknown-or-mixed', cohortSize: winsInRank.length, relativeReference: cohortReady ? 'rank' : 'neutral-fallback' },
      scoreBreakdown: { baseline: .5, absoluteScale: .02, absoluteWeight: .6, relativeWeight: .4,
        cohortMedian: median, cohortIqr: iqr, rankCenter: center, rankSpread: spread, cohortSize: winsInRank.length, cohortReady,
        absoluteSignal, relativeSignal, combinedSignal: signal, winSignal, pickSignal, banSignal,
        medianPickRate, pickReference, banReference: BAN_REFERENCE, weights: { ...WEIGHTS },
        winPoints, pickPoints, banPoints, rawScore },
      methodVersion: TIER_METHOD_VERSION };
  }).sort((a, b) => (b.scoreBreakdown.rawScore ?? -Infinity) - (a.scoreBreakdown.rawScore ?? -Infinity)
    || (b.winRate ?? -1) - (a.winRate ?? -1) || String(a.name).localeCompare(String(b.name)));
  return scored.map((row, i) => ({ ...row, eclipseRank: row.tier === 'U' ? null : i + 1 }));
}
export function tierMethodology() {
  return { version: TIER_METHOD_VERSION, experimental: true, purpose: 'draft-priority', weights: { ...WEIGHTS },
    thresholds: Object.fromEntries(CUTS),
    labels: { SS: 'Eng yuqori draft ustuvorligi', S: 'Kuchli erta pick', A: 'Yaxshi tanlov', B: 'Vaziyatga mos tanlov', C: 'Tor vaziyatlar uchun', D: 'Past draft ustuvorligi', U: 'Baholanmagan' },
    bands: { SS: 'Ball ≥70', S: '60 ≤ ball <70', A: '50 ≤ ball <60', B: '40 ≤ ball <50', C: '30 ≤ ball <40', D: 'Ball <30', U: 'Win/Pick/Ban yetishmaydi yoki Pick = 0' },
    references: { ban: BAN_REFERENCE, pickFloor: PICK_FLOOR, pickFallback: PICK_FALLBACK, minimumCohort: 10 },
    shrinkage: 'Manba Win o‘zgartirilmaydi. Pick — ommaboplik, Ban — cheklash talabi; match soni yoki ishonch emas.',
    formula: 'W = 50 + 100/π × atan(0.6 × (Win − 0.5)/0.02 + 0.4 × (Win − median)/max(IQR/1.349, 0.005)); P = 100 × Pick/(Pick + pick tayanchi); B = 100 × Ban/(Ban + 0.10). Ball = 0.50W + 0.20P + 0.30B.',
    note: 'Eclipse tajribaviy draft bahosi, MLBB.GG yoki Moonton formulasi emas. Pick tayanchi = max(rank median Pick, 0.1%); 10 tadan kam hero bo‘lsa 1%, Win tayanchi 50% va yoyilish 2 pp. SS kvotasi yo‘q. Tarix/patch tierni cheklamaydi. Barqarorlik: shu patchdagi 3 kunlik kuzatuvda Win oralig‘i ≤1.5 pp, Pick ≤max(0.2 pp, joriy Pick ×25%), Ban ≤5 pp. Oynalar ustma-ust tushishi mumkin; bu statistik ishonch yoki kelajak prognozi emas.' };
}
