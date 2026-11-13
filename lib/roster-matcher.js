/**
 * Smart Roster Matching Utility for MLBB Screen Recognition
 * Matches noisy in-game names (with clan tags, special symbols, prefixes/suffixes)
 * against the official Eclipse roster.
 *
 * NOTE: This matcher strictly uses the supplied roster (IGNs, real names, and aliases).
 * It does not hardcode arbitrary pub/guest player names.
 */

export function normalizeStr(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function stripClanPrefix(str) {
  if (!str) return '';
  // Remove decorative brackets/parentheses e.g. [TAG], (TAG), <TAG>
  let clean = String(str).replace(/[\[\(\<].*?[\]\)\>]/g, ' ');
  // Remove decorative Unicode symbols & punctuation
  clean = clean.replace(/[◆々亗★•†|~_.:\-]/g, ' ');
  // Remove leading 2-4 character clan tags or "I'm " / "im " followed by space
  clean = clean.replace(/^(?:i['’]?m\s+|[a-z0-9]{2,4}\s+)/i, '');
  return clean.trim();
}

const NOISE_WORDS = new Set([
  'im', 'i', 'm', 'as', 'always', 'mlbb', 'the', 'pro', 'mr', 'god',
  'no', 'is', 'to', 'of', 'and', 'in', 'on', 'at', 'by', 'for'
]);

export function extractNickTokens(str) {
  const stripped = stripClanPrefix(str);
  return stripped
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length >= 3 && !NOISE_WORDS.has(t));
}

export function smartMatchRoster(detectedName, roster = []) {
  if (!detectedName || !Array.isArray(roster) || !roster.length) return null;
  const pNorm = normalizeStr(detectedName);
  if (!pNorm) return null;
  const pStripped = normalizeStr(stripClanPrefix(detectedName));

  // 1. Direct ID match
  const directId = roster.find(r => r.id === detectedName);
  if (directId) return directId;

  // 2. Exact match against IGN, realName, or aliases
  const exact = roster.find(r => {
    if (normalizeStr(r.name) === pNorm || (pStripped && normalizeStr(r.name) === pStripped)) return true;
    if (r.realName) {
      const rnNorm = normalizeStr(r.realName);
      if (rnNorm === pNorm || (pStripped && rnNorm === pStripped)) return true;
    }
    if (Array.isArray(r.aliases) && r.aliases.some(a => {
      const aNorm = normalizeStr(a);
      return aNorm === pNorm || (pStripped && aNorm === pStripped);
    })) return true;
    return false;
  });
  if (exact) return exact;

  // 3. Stripped prefix exact match
  for (const r of roster) {
    const rStripped = normalizeStr(stripClanPrefix(r.name));
    if (pStripped && rStripped && pStripped === rStripped) {
      return r;
    }
  }

  // 4. Significant distinctive tokens (e.g. 'heavenly', 'shadow', 'kenia', 'leader', 'lyza', 'heroine')
  const pTokens = extractNickTokens(detectedName);
  if (pTokens.length) {
    for (const r of roster) {
      const rTokens = extractNickTokens(r.name);
      if (r.realName) {
        const rn = normalizeStr(r.realName);
        if (rn.length >= 3 && !NOISE_WORDS.has(rn)) rTokens.push(rn);
      }
      const common = pTokens.filter(t => rTokens.includes(t));
      if (common.length >= 2) return r;
      if (common.length === 1 && common[0].length >= 4) return r;
    }
  }

  // 5. Whole phrase containment (only if roster name is sufficiently long)
  for (const r of roster) {
    const rNorm = normalizeStr(r.name);
    const rStripped = normalizeStr(stripClanPrefix(r.name));
    if (rNorm.length >= 7 && (pNorm.includes(rNorm) || (rStripped.length >= 5 && pNorm.includes(rStripped)))) {
      return r;
    }
  }

  return null;
}
