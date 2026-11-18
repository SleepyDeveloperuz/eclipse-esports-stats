import { cleanBattleId } from '../js/batch-model.js';

// LLM portrait names remain suggestions until the shared pixel matcher accepts
// the original roster row. Catalog membership alone never confirms a hero.
export function applyVerifiedHeroMatches(data, matches = [], heroes = []) {
  const byRow = new Map(matches.map(match => [match.sourceRow, match]));
  const catalog = new Map(heroes.map(hero => [hero.name, hero]));
  for (const player of data.players || []) {
    const visual = byRow.get(player.sourceRow);
    const hero = visual?.confident ? catalog.get(visual.hero) : null;
    player.heroUsed = hero?.name || null;
    player.heroId = hero?.id || null;
    player.heroRecognized = Boolean(hero);
    player.heroCatalogMatch = Boolean(hero);
    player.heroReviewRequired = !hero;
    player.heroSource = hero ? 'portrait' : 'unknown';
    player.heroCandidates = [...new Set((visual?.candidates?.map(candidate => candidate.name) || player.heroCandidates || [])
      .filter(name => catalog.has(name)))].slice(0, 3);
  }
  return data;
}

// A Data screenshot can supply metrics without re-reading KDA or a portrait.
// Match only roster IDs; shared heroes or similar names are not player identity.
export function mergeRosterScanStats(previous = [], incoming = []) {
  const byId = new Map(incoming.filter(row => row.playerId).map(row => [row.playerId, row]));
  const merged = previous.map(prior => {
    const next = byId.get(prior.playerId);
    if (!next) return { ...prior };
    const row = { ...prior };
    for (const key of ['kills', 'deaths', 'assists', 'damageDealt', 'damageReceived', 'turretDamage', 'teamfightParticipation', 'goldEarned']) {
      if (Number.isInteger(next[key]) && next[key] >= 0) row[key] = next[key];
    }
    if (Number.isFinite(next.inGameScore) && next.inGameScore >= 0) row.inGameScore = next.inGameScore;
    if (next.medal) row.medal = next.medal;
    if (next.heroId && next.heroUsed) {
      for (const key of ['heroId', 'heroNameSnapshot', 'heroUsed', 'heroResolution']) row[key] = next[key];
    }
    if (next.rolePlayed) {
      row.rolePlayed = next.rolePlayed;
      row.roleSource = next.roleSource;
    }
    for (const key of ['savage', 'maniac']) if (typeof next[key] === 'boolean') row[key] = next[key];
    return row;
  });
  const seen = new Set(previous.map(row => row.playerId));
  for (const row of incoming) if (row.playerId && !seen.has(row.playerId)) {
    merged.push({ ...row });
    seen.add(row.playerId);
  }
  return merged;
}

// Header evidence is independent of player rows. Never merge different matches.
export function checkScreenshotEvidence(value, imageCount, metadata = {}) {
  if (!imageCount && value === undefined) return { error: null, sourceImageIndex: null, screenshots: [] };
  const count = imageCount || value?.length;
  if (!Array.isArray(value) || value.length !== count || ![1, 2].includes(count)) {
    return { error: 'missing_screenshot_evidence', sourceImageIndex: null, screenshots: [] };
  }
  const screenshots = value.map(row => ({
    imageIndex: row?.imageIndex,
    kind: ['scoreboard', 'damage'].includes(row?.kind) ? row.kind : 'unknown',
    battleId: cleanBattleId(row?.battleId),
    duration: typeof row?.duration === 'string' && /^\d{1,3}:[0-5]\d$/.test(row.duration)
      ? `${Number(row.duration.split(':')[0])}:${row.duration.split(':')[1]}` : null,
    result: ['win', 'loss'].includes(row?.result) ? row.result : null
  }));
  let error = null;
  if (screenshots.some(row => !Number.isInteger(row.imageIndex) || row.imageIndex < 0 || row.imageIndex >= count)
    || new Set(screenshots.map(row => row.imageIndex)).size !== count) error = 'invalid_screenshot_indices';
  else if (screenshots.some(row => row.kind === 'unknown')) error = 'not_a_match_screenshot';
  else if (count === 2 && screenshots.some(row => !row.battleId)) error = 'unverified_screenshot_pair';
  else if (['battleId', 'duration', 'result'].some(key => new Set(screenshots.map(row => row[key]).filter(Boolean)).size > 1)) error = 'mismatched_screenshots';
  else if (count === 2 && new Set(screenshots.map(row => row.kind)).size !== 2) error = 'duplicate_screen_kind';
  else if (['battleId', 'duration', 'result'].some(key => metadata[key] && screenshots.some(row => row[key] && row[key] !== metadata[key]))) error = 'conflicting_match_header';
  const anchor = screenshots.find(row => row.kind === 'scoreboard') || screenshots[0];
  return { error, sourceImageIndex: error ? null : anchor.imageIndex, screenshots };
}
