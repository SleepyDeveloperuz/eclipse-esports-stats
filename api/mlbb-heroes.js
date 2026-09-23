import { requirePublicMlbbRead, sendMlbbError, setPublicMlbbHeaders } from '../lib/mlbb/api.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { MLBB_FRESHNESS } from '../lib/mlbb/sync.js';
import { readPublicHero, readPublicHeroId, readPublicCohort, publicMlbbState } from '../lib/mlbb/public-read.js';
import { cleanText } from '../lib/mlbb/normalize.js';

export default async function handler(req, res) {
  if (!requirePublicMlbbRead(req, res)) return;
  try {
    const store = createRedisStore();
    if (req.query?.id !== undefined) {
      const heroId = readPublicHeroId(req.query.id);
      const { rank, days } = readPublicCohort(req.query);
      const value = await readPublicHero(heroId, { store, rank, days });
      setPublicMlbbHeaders(res);
      return res.status(200).json(publicMlbbState(value, MLBB_FRESHNESS.heroMs));
    }

    const value = await store.getJSON(MLBB_KEYS.catalog);
    if (!value?.data) return res.status(503).json({ code: 'MLBB_DATA_NOT_READY', error: 'Hero catalog hali sync qilinmagan' });
    const query = cleanText(req.query?.q, 80).toLocaleLowerCase('en-US');
    const role = cleanText(req.query?.role, 40).toLocaleLowerCase('en-US');
    const lane = cleanText(req.query?.lane, 40).toLocaleLowerCase('en-US');
    const data = value.data.filter(hero => {
      if (query && !`${hero.name} ${(hero.aliases || []).join(' ')}`.toLocaleLowerCase('en-US').includes(query)) return false;
      if (role && !(hero.roles || []).some(item => item.toLocaleLowerCase('en-US') === role)) return false;
      if (lane && !(hero.lanes || []).some(item => item.toLocaleLowerCase('en-US') === lane)) return false;
      return hero.availability !== 'unavailable';
    }).map(hero => ({
      ...hero,
      isNew: false,
      isNewToCatalog: Boolean(hero.discoveredAt) && Date.now() - Date.parse(hero.discoveredAt) <= 14 * 24 * 60 * 60 * 1000
    }));
    setPublicMlbbHeaders(res);
    return res.status(200).json({ ...publicMlbbState(value, MLBB_FRESHNESS.catalogMs), data });
  } catch (error) {
    return sendMlbbError(res, error, { publicRead: true });
  }
}
