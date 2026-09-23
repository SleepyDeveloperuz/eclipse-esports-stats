export function cleanBattleId(value) { return typeof value === 'string' && /^\d{10,24}$/.test(value) ? value : null; }
export function groupBatchFiles(files) {
  const groups = new Map(), unresolved = [];
  for (const file of files) {
    const id = cleanBattleId(file.battleId);
    if (!id) { unresolved.push({ ...file, reason: 'Battle ID o‘qilmadi. Oddiy match yuklash orqali yuboring.' }); continue; }
    const list = groups.get(id) || []; list.push(file); groups.set(id, list);
  }
  const matches = [];
  for (const [battleId, list] of groups) {
    const scores = list.filter(f => f.kind === 'scoreboard'), damage = list.filter(f => f.kind === 'damage');
    const dates = [...new Set(list.map(f => f.date).filter(Boolean))];
    const durations = [...new Set(list.map(f => f.duration).filter(Boolean))];
    const results = [...new Set(list.map(f => f.result).filter(Boolean))];
    if (scores.length !== 1 || damage.length > 1 || list.some(f => f.kind === 'unknown') || dates.length > 1 || durations.length > 1 || results.length > 1) {
      unresolved.push(...list.map(f => ({ ...f, reason: 'Juftlik noaniq yoki takroriy rasm. Avtomatik birlashtirilmadi.' }))); continue;
    }
    matches.push({ battleId, score: scores[0], damage: damage[0] || null, date: dates[0] || null, duration: durations[0] || null, result: results[0] || null });
  }
  return { matches, unresolved };
}
