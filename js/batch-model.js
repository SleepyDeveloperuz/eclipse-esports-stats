export function cleanBattleId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{10,24}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:battle\s*id[:\s#]*)?([0-9\s\-]{10,32})/i);
  if (match) {
    const digits = match[1].replace(/[\s\-]/g, '');
    if (/^\d{10,24}$/.test(digits)) return digits;
  }
  return null;
}
export function groupBatchFiles(files) {
  const groups = new Map(), unresolved = [];
  for (const file of files) {
    const id = cleanBattleId(file.battleId);
    if (!id) {
      unresolved.push(file);
      continue;
    }
    const list = groups.get(id) || [];
    list.push(file);
    groups.set(id, list);
  }
  const matches = [];
  for (const [battleId, list] of groups) {
    const scores = list.filter(f => f.kind === 'scoreboard');
    const damage = list.filter(f => f.kind === 'damage');
    const dates = [...new Set(list.map(f => f.date).filter(Boolean))];
    const durations = [...new Set(list.map(f => f.duration).filter(Boolean))];
    const results = [...new Set(list.map(f => f.result).filter(Boolean))];
    if (scores.length !== 1 || damage.length > 1 || list.some(f => f.kind === 'unknown') || dates.length > 1 || durations.length > 1 || results.length > 1) {
      unresolved.push(...list.map(f => ({ ...f, reason: 'Juftlik noaniq yoki takroriy rasm. Avtomatik birlashtirilmadi.' })));
      continue;
    }
    matches.push({ battleId, score: scores[0], damage: damage[0] || null, date: dates[0] || null, duration: durations[0] || null, result: results[0] || null });
  }

  // SECOND PASS: Unambiguous pair matching by duration and result for unassigned files
  if (unresolved.length >= 2) {
    const unassignedScores = unresolved.filter(f => f.kind === 'scoreboard' && !f.reason);
    const unassignedDamage = unresolved.filter(f => f.kind === 'damage' && !f.reason);
    const pairedIndices = new Set();

    for (const score of unassignedScores) {
      if (pairedIndices.has(score.index)) continue;
      const candidates = unassignedDamage.filter(d => {
        if (pairedIndices.has(d.index)) return false;
        if (score.duration && d.duration && score.duration !== d.duration) return false;
        if (score.result && d.result && score.result !== d.result) return false;
        if (score.date && d.date && score.date !== d.date) return false;
        return Boolean(score.duration && d.duration && score.duration === d.duration && score.result && d.result && score.result === d.result);
      });

      if (candidates.length === 1) {
        const damage = candidates[0];
        pairedIndices.add(score.index);
        pairedIndices.add(damage.index);
        const resolvedId = cleanBattleId(score.battleId) || cleanBattleId(damage.battleId) || null;
        matches.push({
          battleId: resolvedId,
          score,
          damage,
          date: score.date || damage.date || null,
          duration: score.duration || damage.duration || null,
          result: score.result || damage.result || null
        });
      }
    }

    if (pairedIndices.size > 0) {
      const remaining = unresolved.filter(f => !pairedIndices.has(f.index));
      unresolved.length = 0;
      unresolved.push(...remaining);
    }
  }

  for (const f of unresolved) {
    if (!f.reason) {
      f.reason = cleanBattleId(f.battleId)
        ? 'Juftlik noaniq yoki mos juft topilmadi.'
        : 'Battle ID o‘qilmadi. Oddiy match yuklash orqali yuboring.';
    }
  }

  return { matches, unresolved };
}
