import { requestOcrProvider } from './ocr-provider.js';

const validPosition = value => Number.isInteger(value) && value >= 1 && value <= 5;
const knownMedal = value => ['gold', 'silver', 'bronze', 'mvp'].includes(value);
function unresolvedCount(data) {
  const rows = data.players;
  const positions = rows.map(row => row.sourceRow).filter(validPosition);
  return Number(!['win', 'loss'].includes(data.result)) + Number(!rows.length)
    + rows.length - positions.length + positions.length - new Set(positions).size
    + rows.reduce((sum, row) => sum + ['kills', 'deaths', 'assists'].filter(field => row[field] == null).length + Number(!knownMedal(row.medal)), 0)
    + Math.max(0, rows.filter(row => row.medal === 'mvp').length - 1);
}

export function extractionProblems(data) {
  const rows = Array.isArray(data?.players) ? data.players : [];
  const problems = [];
  if (!['win', 'loss'].includes(data?.result)) problems.push('result');
  if (!rows.length) problems.push('players');
  const sourceRows = rows.map(row => row.sourceRow);
  if (sourceRows.some(row => !Number.isInteger(row) || row < 1 || row > 5) || new Set(sourceRows).size !== sourceRows.length) problems.push('row_positions');
  if (rows.some(row => ['kills', 'deaths', 'assists'].some(field => row[field] === null || row[field] === undefined))) problems.push('kda');
  if (rows.some(row => row.medal === null || row.medal === undefined || row.medal === 'none')) problems.push('medals');
  if (rows.filter(row => row.medal === 'mvp').length > 1) problems.push('duplicate_mvp');
  return problems;
}

export function reconcileRecheck(original, revised) {
  const identity = row => row.matchedPlayerId || String(row.detectedName || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const originalKeys = original.players.map(identity), revisedKeys = revised.players.map(identity);
  if (originalKeys.some(key => !key) || revisedKeys.some(key => !key) || new Set(originalKeys).size !== originalKeys.length
    || new Set(revisedKeys).size !== revisedKeys.length || originalKeys.length !== revisedKeys.length || originalKeys.some(key => !revisedKeys.includes(key))) return original;
  const revisedByKey = new Map(revised.players.map(row => [identity(row), row]));
  const stablePosition = row => validPosition(row.sourceRow) && original.players.filter(other => other.sourceRow === row.sourceRow).length === 1;
  const positions = original.players.map(row => stablePosition(row) ? row.sourceRow : revisedByKey.get(identity(row)).sourceRow);
  const acceptPositions = positions.every(validPosition) && new Set(positions).size === positions.length;
  const duplicateMvp = original.players.filter(row => row.medal === 'mvp').length > 1;
  const medals = original.players.map(row => {
    const next = revisedByKey.get(identity(row));
    return (!knownMedal(row.medal) || (duplicateMvp && row.medal === 'mvp')) && knownMedal(next.medal) ? next.medal : row.medal;
  });
  const acceptMedals = medals.filter(value => value === 'mvp').length <= 1;
  const merged = { ...original, result: ['win', 'loss'].includes(original.result) ? original.result : revised.result, players: original.players.map((row, index) => {
    const next = revisedByKey.get(identity(row));
    // Positions are one atomic assignment: keep unique known positions and
    // require every proposed slot to be valid/distinct before replacing any.
    return { ...row, sourceRow: acceptPositions ? positions[index] : row.sourceRow,
      kills: row.kills ?? next.kills, deaths: row.deaths ?? next.deaths, assists: row.assists ?? next.assists,
      ...(acceptMedals && medals[index] !== row.medal ? { medal: medals[index], medalReviewRequired: false } : {}) };
  }) };
  if (unresolvedCount(merged) >= unresolvedCount(original)) return original;
  const remaining = extractionProblems(merged);
  const resolvedIssue = { unknown_result: 'result', missing_or_invalid_source_row: 'row_positions', duplicate_source_row: 'row_positions', multiple_mvp_medals: 'duplicate_mvp' };
  merged.reviewIssues = (original.reviewIssues || []).filter(issue => !resolvedIssue[issue] || remaining.includes(resolvedIssue[issue]));
  return merged;
}

export async function extractWithRecheck({ apiKey, requestBody, models, normalize, validate, fetchImpl = globalThis.fetch, deadlineMs = 65000 }) {
  const started = Date.now(), budget = Math.min(65000, Math.max(0, deadlineMs));
  const first = await requestOcrProvider({ apiKey, requestBody, models, validate, fetchImpl, deadlineMs: budget });
  if (!first.success) return first;
  let data = normalize(first.data), selected = first;
  const problems = extractionProblems(data), remaining = budget - (Date.now() - started);
  let recheck = null;
  if (problems.length && remaining >= 5000) {
    // One bounded second look, not a loop. Original images remain the only evidence;
    // earlier guessed values are not supplied to bias this independent reading.
    const focused = { ...requestBody, contents: requestBody.contents.map((content, index) => index === 0
      ? { ...content, parts: [...content.parts, { text: `Re-read the original screenshots carefully, especially these unresolved categories: ${problems.join(', ')}. Return the complete schema again. Match original row positions and visible IGNs across screenshots. There can be at most one MVP per team; silver/bronze badges are not absent medals. Do not invent missing values or infer medal from score.` }] }
      : content) };
    recheck = await requestOcrProvider({ apiKey, requestBody: focused, models: [first.meta.model], validate, fetchImpl, deadlineMs: remaining, modelTimeoutMs: Math.min(20000, remaining) });
    if (recheck.success) {
      const merged = reconcileRecheck(data, normalize(recheck.data));
      if (merged !== data) { data = merged; selected = recheck; }
    }
  }
  // An unresolved medal is optional; never publish two MVPs or force a user to
  // decide which guessed MVP was real. A valid manual correction remains possible.
  if (data.players.filter(row => row.medal === 'mvp').length > 1) {
    data = { ...data, players: data.players.map(row => row.medal === 'mvp' ? { ...row, medal: null, medalReviewRequired: false } : row),
      reviewIssues: [...new Set([...(data.reviewIssues || []), 'unresolved_medal'])] };
  }
  return { success: true, data, normalized: true, meta: {
    ...selected.meta, durationMs: Date.now() - started,
    attempts: [...first.meta.attempts.map(attempt => ({ ...attempt, phase: 'initial' })), ...(recheck?.meta.attempts || []).map(attempt => ({ ...attempt, phase: 'recheck' }))],
    rechecked: Boolean(recheck), unresolved: extractionProblems(data)
  } };
}
