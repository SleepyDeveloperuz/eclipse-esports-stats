export const TIER_METHOD_VERSION = 'eclipse-tier-2.1.0';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, value) {
  if (values.length <= 1) return 1;
  const lower = values.filter(item => item < value).length;
  const equal = values.filter(item => item === value).length;
  return (lower + ((equal - 1) / 2)) / (values.length - 1);
}

function tierForIndex(index, total) {
  const ratio = (index + 1) / total;
  if (ratio <= 0.05) return 'SS';
  if (ratio <= 0.15) return 'S';
  if (ratio <= 0.30) return 'A';
  if (ratio <= 0.65) return 'B';
  if (ratio <= 0.90) return 'C';
  return 'D';
}

export function buildEclipseTier(rankRows, options = {}) {
  if (!Array.isArray(rankRows) || rankRows.length < 2) return [];
  const pickValues = rankRows.map(row => row.pickRate);
  const banValues = rankRows.map(row => row.banRate);
  const medianPick = Math.max(median(pickValues), 0.0001);
  const shrunkWins = rankRows.map(row => {
    const visibilityWeight = clamp(Math.sqrt(row.pickRate / medianPick), 0.30, 1);
    return 0.5 + ((row.winRate - 0.5) * visibilityWeight);
  });
  const lowVisibilityCut = [...pickValues].sort((a, b) => a - b)[Math.floor(pickValues.length * 0.33)];
  const highVisibilityCut = [...pickValues].sort((a, b) => a - b)[Math.floor(pickValues.length * 0.67)];

  const scored = rankRows.map((row, index) => {
    const winPercentile = percentile(shrunkWins, shrunkWins[index]);
    const pickPercentile = percentile(pickValues, row.pickRate);
    const banPercentile = percentile(banValues, row.banRate);
    const score = (winPercentile * 0.65) + (pickPercentile * 0.20) + (banPercentile * 0.15);
    return {
      ...row,
      adjustedWinRate: shrunkWins[index],
      eclipseScore: Number((score * 100).toFixed(2)),
      visibility: row.pickRate <= lowVisibilityCut ? 'low' : row.pickRate >= highVisibilityCut ? 'high' : 'normal'
    };
  }).sort((a, b) => b.eclipseScore - a.eclipseScore || b.winRate - a.winRate || a.name.localeCompare(b.name));

  return scored.map((row, index) => {
    const first = scored.findIndex(item => item.eclipseScore === row.eclipseScore);
    const ties = scored.filter(item => item.eclipseScore === row.eclipseScore).length;
    return ({
    ...row,
    eclipseRank: index + 1,
    tier: tierForIndex(first + (ties - 1) / 2, scored.length),
    methodVersion: options.methodVersion || TIER_METHOD_VERSION
    });
  });
}

export function tierMethodology() {
  return {
    version: TIER_METHOD_VERSION,
    weights: { adjustedWinPercentile: 0.65, pickPercentile: 0.20, banPercentile: 0.15 },
    shrinkage: 'Low-pick win rate 50% tomon sqrt visibility og‘irligi bilan qisqartiriladi.',
    bands: { SS: 'top 5%', S: 'next 10%', A: 'next 15%', B: 'next 35%', C: 'next 25%', D: 'bottom 10%' },
    note: 'Tierlar nisbiy guruhlar; teng ballar bir tierda qoladi va ulushlar o‘zgarishi mumkin. Visibility statistik ishonchlilik emas.'
  };
}
