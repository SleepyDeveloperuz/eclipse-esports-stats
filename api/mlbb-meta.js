import { requireMlbbAccess, sendMlbbError, setPrivateApiHeaders } from '../lib/mlbb/api.js';
import { cleanText } from '../lib/mlbb/normalize.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { MLBB_DEFAULT_DAYS, MLBB_DEFAULT_RANK, MLBB_FRESHNESS, publicCacheState } from '../lib/mlbb/sync.js';
import { MLBB_RANK_VALUES as ALLOWED_RANKS, MLBB_DAY_VALUES as ALLOWED_DAYS, MLBB_RANKS } from '../lib/mlbb/ranks.js';
import { buildEclipseTier, tierMethodology } from '../lib/mlbb/tier.js';


export default async function handler(req, res) {
  setPrivateApiHeaders(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireMlbbAccess(req, res)) return;
  try {
    const requestedRank = cleanText(req.query?.rank, 20).toLowerCase();
    const requestedDays = cleanText(req.query?.days, 3);
    if ((requestedRank && !ALLOWED_RANKS.has(requestedRank)) || (requestedDays && !ALLOWED_DAYS.has(requestedDays))) return res.status(400).json({ error: 'Rank yoki davr yaroqsiz' });
    const rank = ALLOWED_RANKS.has(requestedRank) ? requestedRank : process.env.MLBB_META_RANK || MLBB_DEFAULT_RANK;
    const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : process.env.MLBB_META_DAYS || MLBB_DEFAULT_DAYS;
    const store = createRedisStore();
    const [value, health] = await Promise.all([
      store.getJSON(MLBB_KEYS.rank(rank, days)),
      store.getJSON(MLBB_KEYS.health)
    ]);
    if (!value?.data) return res.status(503).json({ code: 'MLBB_DATA_NOT_READY', error: 'Meta jadvali hali sync qilinmagan' });
    if (value.data.rank !== rank || String(value.data.days) !== String(days)) return res.status(503).json({ code: 'MLBB_DATA_NOT_READY', error: 'Tanlangan rank ma’lumoti hali tayyor emas' });
    // Re-score a last-known-good snapshot without fabricating fresh source data or movement.
    if (value.data.methodology?.version !== tierMethodology().version) {
      value.data = { ...value.data, eclipse: buildEclipseTier(value.data.official), comparison: null, methodology: tierMethodology() };
    }
    return res.status(200).json({
      ...publicCacheState(value, MLBB_FRESHNESS.rankMs),
      availableRanks: MLBB_RANKS,
      health: health ? publicCacheState(health, MLBB_FRESHNESS.rankMs) : null
    });
  } catch (error) {
    return sendMlbbError(res, error);
  }
}
