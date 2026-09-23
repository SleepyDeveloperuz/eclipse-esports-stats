// Project existing daily snapshots; never reconstruct missing historical scores.
const rate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
const tiers = new Set(['SS', 'S', 'A', 'B', 'C', 'D', 'U']);
export function appendRankSnapshot(previous, rows, { rank, days, updatedAt, methodologyVersion, patchEpoch = null }) {
  const old = previous?.rank === rank && String(previous.days) === String(days) && Array.isArray(previous.snapshots) ? previous.snapshots : [];
  const day = updatedAt.slice(0, 10);
  // Compact, versioned tuple: ID, raw Win/Pick/Ban, tier, rank, score.
  const point = { updatedAt, methodologyVersion, patchEpoch,
    rows: rows.map(row => [row.heroId, row.winRate, row.pickRate, row.banRate, row.tier, row.eclipseRank, row.eclipseScore]) };
  return { version: 2, rank, days: String(days), snapshots: [...old.filter(item => typeof item.updatedAt === 'string' && item.updatedAt.slice(0, 10) !== day), point]
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(-90) };
}

export function mergeTimelineSources(legacy, current, { rank, days }) {
  const old = Array.isArray(legacy?.data) ? legacy.data : [];
  const stored = current?.data;
  const fresh = stored?.rank === rank && String(stored.days) === String(days) && stored.version === 2 && Array.isArray(stored.snapshots)
    ? stored.snapshots.map(item => ({ ...item, rank, days })) : [];
  return { data: [...old, ...fresh] };
}
export function heroTimeline(history, { heroId, rank, days }) {
  const daily = new Map();
  for (const item of Array.isArray(history?.data) ? history.data : []) {
    if (item?.rank !== rank || String(item.days) !== String(days) || !Number.isFinite(Date.parse(item.updatedAt))) continue;
    const date = new Date(item.updatedAt).toISOString().slice(0, 10);
    const tuple = Array.isArray(item.rows) ? item.rows.find(row => Array.isArray(row) && row[0] === heroId) : null;
    const hero = tuple ? { winRate: tuple[1], pickRate: tuple[2], banRate: tuple[3] } : Array.isArray(item.heroes) ? item.heroes.find(row => Number(row?.heroId) === heroId) : null;
    if (!hero) continue;
    const tier = tuple ? { tier: tuple[4], eclipseRank: tuple[5], eclipseScore: tuple[6] } : Array.isArray(item.tiers) ? item.tiers.find(row => Number(row?.heroId) === heroId) : null;
    const point = {
      date, updatedAt: new Date(item.updatedAt).toISOString(),
      winRate: rate(hero.winRate), pickRate: rate(hero.pickRate), banRate: rate(hero.banRate),
      tier: tiers.has(tier?.tier) ? tier.tier : null,
      eclipseRank: Number.isSafeInteger(tier?.eclipseRank) && tier.eclipseRank > 0 ? tier.eclipseRank : null,
      eclipseScore: typeof tier?.eclipseScore === 'number' && tier.eclipseScore >= 0 && tier.eclipseScore <= 100 ? tier.eclipseScore : null,
      methodologyVersion: typeof item.methodologyVersion === 'string' ? item.methodologyVersion.slice(0, 80) : null
    };
    if (!daily.has(date) || daily.get(date).updatedAt <= point.updatedAt) daily.set(date, point);
  }
  return { heroId, rank, days: String(days), points: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-90),
    maxPoints: 90, source: 'Rone Arena API',
    note: 'Saqlangan kunlik nusxalar. Bo‘sh kunlar to‘ldirilmaydi; 7 kunlik oynalar bir-birini qoplaydi. Patch sabab bo‘lganini isbotlamaydi.' };
}
