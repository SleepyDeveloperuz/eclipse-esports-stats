import { requirePublicMlbbRead, sendMlbbError, setPublicMlbbHeaders } from '../lib/mlbb/api.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { MLBB_FRESHNESS } from '../lib/mlbb/sync.js';
import { MLBB_RANKS } from '../lib/mlbb/ranks.js';
import { readPublicCohort, readPublicHeroId, findPublicHero, publicMlbbState, publicMlbbHealth } from '../lib/mlbb/public-read.js';
import { heroTimeline, mergeTimelineSources } from '../lib/mlbb/timeline.js';
import { buildEclipseTier, tierMethodology } from '../lib/mlbb/tier.js';
import { buildMetaMovers } from '../lib/mlbb/movers.js';


export default async function handler(req, res) {
  if (!requirePublicMlbbRead(req, res)) return;
  try {
    const { rank, days } = readPublicCohort(req.query);
    const store = createRedisStore();
    if (req.query?.view !== undefined) {
      if (req.query.view === 'movers') {
        const [legacy, current, catalog] = await Promise.all([store.getJSON(MLBB_KEYS.rankHistory), store.getJSON(MLBB_KEYS.rankTimeline(rank, days)), store.getJSON(MLBB_KEYS.catalog)]);
        setPublicMlbbHeaders(res);
        return res.status(200).json({ data: buildMetaMovers(mergeTimelineSources(legacy, current, { rank, days }), { rank, days, names: catalog?.data || [] }) });
      }
      if (req.query.view !== 'timeline') return res.status(400).json({ error: 'View yaroqsiz' });
      const heroId = readPublicHeroId(req.query.id);
      findPublicHero(await store.getJSON(MLBB_KEYS.catalog), heroId);
      const [legacy, current] = await Promise.all([store.getJSON(MLBB_KEYS.rankHistory), store.getJSON(MLBB_KEYS.rankTimeline(rank, days))]);
      const history = mergeTimelineSources(legacy, current, { rank, days });
      setPublicMlbbHeaders(res);
      return res.status(200).json({ data: heroTimeline(history, { heroId, rank, days }) });
    }
    const [value, health] = await Promise.all([
      store.getJSON(MLBB_KEYS.rank(rank, days)),
      store.getJSON(MLBB_KEYS.health)
    ]);
    if (!value?.data) return res.status(503).json({ code: 'MLBB_DATA_NOT_READY', error: 'Meta jadvali hali sync qilinmagan' });
    if (value.data.rank !== rank || String(value.data.days) !== String(days)) return res.status(503).json({ code: 'MLBB_DATA_NOT_READY', error: 'Tanlangan rank ma’lumoti hali tayyor emas' });
    // Re-score a last-known-good snapshot without fabricating fresh source data or movement.
    if (value.data.methodology?.version !== tierMethodology().version) {
      value.data = { ...value.data, eclipse: buildEclipseTier(value.data.official, { updatedAt: value.updatedAt, rank, days }), comparison: null, methodology: tierMethodology() };
    } else if (value.data.eclipse?.some(row => !row.scoreBreakdown)) {
      // Same scoring method: expose its components without changing comparison history.
      const explained = new Map(buildEclipseTier(value.data.official, { updatedAt: value.updatedAt, rank, days }).map(row => [row.heroId, row.scoreBreakdown]));
      value.data = { ...value.data, eclipse: value.data.eclipse.map(row => ({ ...row, scoreBreakdown: row.scoreBreakdown || explained.get(row.heroId) })) };
    }
    if (Date.now() - Date.parse(value.updatedAt) > MLBB_FRESHNESS.rankMs) value.data = { ...value.data,
      eclipse: (value.data.eclipse || []).map(row => row.quality && row.tier !== 'U' ? { ...row, quality: { ...row.quality, status: 'stale' } } : row) };
    setPublicMlbbHeaders(res);
    return res.status(200).json({
      ...publicMlbbState(value, MLBB_FRESHNESS.rankMs),
      availableRanks: MLBB_RANKS,
      health: publicMlbbHealth(health)
    });
  } catch (error) {
    return sendMlbbError(res, error, { publicRead: true });
  }
}
