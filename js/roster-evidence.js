// Read-only views of the official roster and match ledger.
(() => {
  const types = [['', 'Barcha turlar'], ['ranked', 'Ranked'], ['scrim', 'Scrim'], ['tournament', 'Turnir'], ['casual', 'Casual']];
  const scopes = [['all', 'Barcha tarkiblar'], ['team5', 'Team 5'], ['squad', 'Practice · 1–4']];
  const percentage = (part, total) => total ? 100 * part / total : null;
  const rate = value => value === null ? '—' : Number(value.toFixed(1)) + '%';

  function filteredMatches(matches, { scope = 'all', matchType = '', from = '', to = '' } = {}) {
    const stats = window.StatsEngine;
    const eligible = scope === 'all' ? stats.filterMatchesByScope(matches, 'all') : stats.filterAnalyticsMatches(matches, scope);
    const seen = new Set();
    return stats.sortMatchesChronologically(eligible).filter(match => {
      if (!match.id || seen.has(match.id) || (matchType && match.matchType !== matchType)
        || (from && (!match.date || match.date < from)) || (to && (!match.date || match.date > to))) return false;
      seen.add(match.id);
      return true;
    });
  }

  function appearances(match, roster) {
    const rows = new Map();
    for (const row of match.playerStats || []) {
      if (roster.has(row?.playerId) && !rows.has(row.playerId)) rows.set(row.playerId, row);
    }
    return rows;
  }

  function outcome(matches) {
    const wins = matches.filter(m => m.result === 'win').length;
    const losses = matches.filter(m => m.result === 'loss').length;
    return { wins, losses, unknown: matches.length - wins - losses, winRate: percentage(wins, wins + losses) };
  }

  function recommendation(uses, record, playerRecord) {
    const known = record.wins + record.losses;
    if (known < 3) return 'limited';
    if (known >= 8 && uses >= 10 && record.winRate >= playerRecord.winRate) return 'comfort';
    if (known >= 5 && uses >= 5 && record.winRate >= playerRecord.winRate - 10) return 'backup';
    return 'learning';
  }

  function heroPool(matches, playerId, resolveHero, filters) {
    const groups = new Map();
    const played = [];
    let unknown = 0;
    const player = new Set([playerId]);
    for (const match of filteredMatches(matches, filters)) {
      const row = appearances(match, player).get(playerId);
      if (!row) continue;
      played.push(match);
      const hero = resolveHero(row);
      if (!hero?.id || !hero.name) { unknown++; continue; }
      if (!groups.has(hero.id)) groups.set(hero.id, { hero, matches: [] });
      groups.get(hero.id).matches.push(match);
    }
    const known = played.length - unknown, playerRecord = outcome(played);
    const heroes = [...groups.values()].map(({ hero, matches: group }) => {
      const record = outcome(group), useRate = percentage(group.length, known);
      return { hero, count: group.length, useRate, ...record, category: recommendation(useRate, record, playerRecord) };
    }).sort((a, b) => b.count - a.count || a.hero.name.localeCompare(b.hero.name));
    return { heroes, known, unknown, count: played.length, winRate: playerRecord.winRate };
  }

  function pairs(matches, players, filters) {
    const roster = new Map(players.map(p => [p.id, p]));
    const groups = new Map();
    for (const match of filteredMatches(matches, filters)) {
      const ids = [...appearances(match, roster).keys()].sort();
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const key = JSON.stringify([ids[i], ids[j]]);
        if (!groups.has(key)) groups.set(key, { players: [roster.get(ids[i]), roster.get(ids[j])], matches: [] });
        groups.get(key).matches.push(match);
      }
    }
    return [...groups.values()].map(group => ({ ...group, ...outcome(group.matches) }))
      .sort((a, b) => b.matches.length - a.matches.length);
  }

  function achievements(matches, players, filters) {
    const roster = new Map(players.map(p => [p.id, p]));
    return filteredMatches(matches, filters).reverse().flatMap(match =>
      [...appearances(match, roster)].flatMap(([id, row]) => {
        const kind = row.savage === true ? 'Savage' : row.maniac === true ? 'Maniac' : null;
        return kind ? [{ kind, match, row, player: roster.get(id) }] : [];
      }));
  }

  function portrait(hero, escape) {
    const name = hero?.name || 'Qahramon noma’lum';
    const image = hero?.images?.portrait || hero?.image;
    if (typeof image === 'string' && /^https:\/\/akmweb\.youngjoygame\.com\//i.test(image)) {
      return '<img class="evidence-portrait" src="' + escape(image) + '" alt="" width="36" height="36" loading="lazy" decoding="async">';
    }
    return '<span class="evidence-portrait evidence-portrait--fallback" aria-hidden="true">' + escape(name.slice(0, 1)) + '</span>';
  }
  window.EclipseRosterEvidence = { types, scopes, rate, filteredMatches, heroPool, pairs, achievements, portrait };
})();
