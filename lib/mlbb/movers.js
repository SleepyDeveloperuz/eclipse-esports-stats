const DAY = 86400000;
const rate = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const bands = new Set(['SS', 'S', 'A', 'B', 'C', 'D', 'U']);
function rowsOf(s) {
  if (Array.isArray(s.rows)) return s.rows.filter(Array.isArray).map(r => ({ heroId: r[0], winRate: r[1], pickRate: r[2], banRate: r[3], tier: r[4] }));
  return Array.isArray(s.heroes) ? s.heroes.map(r => ({ ...r, tier: s.tiers?.find(t => t.heroId === r.heroId)?.tier })) : [];
}
export function buildMetaMovers(history, { rank, days, names = [], now = Date.now() }) {
  const base = { rank, days: String(days), rows: [], note: 'Foiz punkt farqi; statistik ahamiyat yoki patch ta’sirining isboti emas. Sanalar — nusxa olingan vaqt; manba kechikishi mumkin.' };
  const points = (Array.isArray(history?.data) ? history.data : []).filter(p => p?.rank === rank && String(p.days) === String(days) && Number.isFinite(Date.parse(p.updatedAt)) && Date.parse(p.updatedAt) <= now).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const latest = points[0], previous = latest && points.find(p => Date.parse(latest.updatedAt) - Date.parse(p.updatedAt) >= Number(days) * DAY);
  if (!previous) return { ...base, available: false, reason: `Kamida ${days} kun oralig‘idagi ikkita saqlangan nusxa kerak. Tarix to‘qib chiqarilmaydi.` };
  const elapsedDays = (Date.parse(latest.updatedAt) - Date.parse(previous.updatedAt)) / DAY;
  if (elapsedDays > Number(days) * 2) return { ...base, available: false, reason: 'Oldingi mos nusxa juda uzoq: oraliq davrdagi o‘zgarishlarni aniqlab bo‘lmaydi.' };
  const comparableTiers = Boolean(latest.patchEpoch) && latest.patchEpoch === previous.patchEpoch && Boolean(latest.methodologyVersion) && latest.methodologyVersion === previous.methodologyVersion;
  const old = new Map(rowsOf(previous).map(r => [Number(r.heroId), r])), labels = new Map(names.map(r => [Number(r.heroId ?? r.id), r.name]));
  const rows = rowsOf(latest).flatMap(r => {
    const before = old.get(Number(r.heroId));
    if (!before || ![r.winRate, r.pickRate, r.banRate, before.winRate, before.pickRate, before.banRate].every(rate)) return [];
    const delta = field => Number(((r[field] - before[field]) * 100).toFixed(3));
    return [{ heroId: Number(r.heroId), name: String(labels.get(Number(r.heroId)) || `Hero ${r.heroId}`).slice(0, 100), winPp: delta('winRate'), pickPp: delta('pickRate'), banPp: delta('banRate'),
      before: { winRate: before.winRate, pickRate: before.pickRate, banRate: before.banRate }, after: { winRate: r.winRate, pickRate: r.pickRate, banRate: r.banRate },
      previousTier: comparableTiers && bands.has(before.tier) ? before.tier : null, tier: comparableTiers && bands.has(r.tier) ? r.tier : null }];
  });
  return { ...base, available: rows.length > 0, rows, latestAt: latest.updatedAt, previousAt: previous.updatedAt, elapsedDays, comparableTiers,
    stale: now - Date.parse(latest.updatedAt) > 36 * 3600000, excludedCount: rowsOf(latest).length - rows.length, reason: rows.length ? null : 'Ikkala nusxada ham to‘liq ko‘rsatkichlari mavjud hero topilmadi.' };
}
