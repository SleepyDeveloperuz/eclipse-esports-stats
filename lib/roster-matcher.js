// Exact IGN/approved-alias matching; shared words and real names are not evidence.
// These historical aliases were explicitly confirmed by the roster owner.
const CONFIRMED_ALIASES = Object.freeze({
  'cd2969b5-7cfa-4f0d-88bd-0906502a3aba': ['heavenlyyy'],
  '95fa6dbd-bd82-4d7d-88de-23bc01858eac': ['Shado'],
  'bc0f7b6c-4c0d-466e-b17b-ca04c5b583e4': ['elyyysian']
});
export function rosterAliases(player) {
  return [...new Set([...(CONFIRMED_ALIASES[player?.id] || []),
    ...(Array.isArray(player?.aliases) ? player.aliases : [])]
    .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim().slice(0, 80)))].slice(0, 20);
}
export function normalizeStr(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
export function stripClanPrefix(value) {
  return String(value || '').normalize('NFKC').trim()
    .replace(/^(?:\[[^\]]{1,12}\]|\([^)]{1,12}\)|<[^>]{1,12}>)\s*/, '')
    .replace(/^i['’]?m\s+/i, '').trim();
}
export function smartMatchRoster(detectedName, roster = []) {
  if (typeof detectedName !== 'string' || !Array.isArray(roster)) return null;
  const clean = stripClanPrefix(detectedName);
  // A short clan tag is accepted only before the complete known IGN.
  const candidates = new Set([normalizeStr(clean), normalizeStr(clean.replace(/^[a-z0-9]{2,4}\s+/i, ''))].filter(Boolean));
  const matches = roster.filter(player => player?.active !== false && player?.id &&
    [player.name, ...rosterAliases(player)].some(name => {
      const key = normalizeStr(stripClanPrefix(name));
      return key && candidates.has(key);
    }));
  return new Set(matches.map(player => player.id)).size === 1 ? matches[0] : null;
}
