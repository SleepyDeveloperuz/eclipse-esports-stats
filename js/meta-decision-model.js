/* Pure, bounded draft logic: no storage, network or team win probabilities. */
(() => {
  const lanes = ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam'];
  const rate = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  function heroLanes(hero) {
    return [...new Set((hero?.lanes || []).map(v => {
      const t = String(v).toLowerCase();
      return /exp/.test(t) ? 'EXP' : /jung/.test(t) ? 'Jungle' : /mid/.test(t) ? 'Mid' : /gold/.test(t) ? 'Gold' : /roam/.test(t) ? 'Roam' : null;
    }).filter(Boolean))];
  }
  function coverage(heroes) {
    let best = [];
    function visit(i, occupied) {
      if (i === heroes.length) { if (occupied.length > best.length) best = occupied; return; }
      visit(i + 1, occupied);
      for (const lane of heroLanes(heroes[i])) if (!occupied.includes(lane)) visit(i + 1, [...occupied, lane]);
    }
    visit(0, []);
    return { covered: best, missing: lanes.filter(lane => !best.includes(lane)) };
  }
  function draft({ catalog = [], rows = [], allies = [], enemies = [], bans = [], lane = '', pool = null, details = {}, rank, now = Date.now() }) {
    const ids = new Set(catalog.map(h => Number(h.id)));
    const unique = values => [...new Set(values.map(Number).filter(v => ids.has(v)))];
    allies = unique(allies).slice(0, 5); enemies = unique(enemies).slice(0, 5); bans = unique(bans).slice(0, 10);
    if (allies.length >= 5) return [];
    const excluded = new Set([...allies, ...enemies, ...bans]), stats = new Map(rows.map(r => [Number(r.heroId), r]));
    const allyHeroes = allies.map(id => catalog.find(h => Number(h.id) === id)), current = coverage(allyHeroes);
    const matchups = id => {
      const v = details[id]?.data?.matchups, time = Date.parse(v?.updatedAt);
      return !v?.error && v?.rank === rank && String(v.days) === '7' && time <= now && now - time <= 36 * 3600000 ? v : null;
    };
    return catalog.filter(h => h.availability !== 'unavailable' && !excluded.has(Number(h.id)) && (!lane || heroLanes(h).includes(lane)) && (!pool || pool.includes(Number(h.id)))).map(hero => {
      const row = stats.get(Number(hero.id)), reasons = [], risks = [];
      let signals = 0, availableMatchups = 0;
      for (const [group, type] of [[enemies, 'counters'], [allies, 'compatibility']]) {
        for (const id of group) {
          const m = matchups(id)?.[type]; if (!m) continue; availableMatchups++;
          const name = catalog.find(h => Number(h.id) === id)?.name || '#' + id;
          // Counters are from the focal ENEMY's perspective.
          const good = type === 'counters' ? m.unfavorable : m.favorable;
          const bad = type === 'counters' ? m.favorable : m.unfavorable;
          if (good?.some(r => Number(r.heroId) === Number(hero.id))) { signals++; reasons.push(name + (type === 'counters' ? ' qarshisida counter signali' : ' bilan compatibility signali')); }
          if (bad?.some(r => Number(r.heroId) === Number(hero.id))) { signals--; risks.push(name + (type === 'counters' ? ' qarshisida salbiy signal' : ' bilan salbiy compatibility')); }
        }
      }
      const fillsLane = coverage([...allyHeroes, hero]).covered.length > current.covered.length;
      if (fillsLane) reasons.unshift('Layn qamrovini to‘ldiradi: ' + heroLanes(hero).join(' / '));
      if (pool) reasons.push('Jamoaning ishonchli/zaxira hero poolida');
      const usable = row && row.tier !== 'U' && rate(row.winRate) && rate(row.pickRate) && row.pickRate > 0 && rate(row.banRate);
      const metaScore = usable && Number.isFinite(row.eclipseScore) ? row.eclipseScore : -1;
      return { hero, row, signals, fillsLane, reasons, risks, availableMatchups, metaScore, win: usable ? row.winRate : -1 };
    }).sort((a, b) => Number(b.fillsLane) - Number(a.fillsLane) || b.signals - a.signals || b.metaScore - a.metaScore || b.win - a.win || a.hero.name.localeCompare(b.hero.name)).slice(0, 12);
  }
  window.EclipseMetaDecisions = { lanes, heroLanes, coverage, draft };
})();
