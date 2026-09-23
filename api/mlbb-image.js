import { requirePublicMlbbRead, setPublicMlbbHeaders, sendMlbbError } from '../lib/mlbb/api.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { findPublicHero, readPublicHeroId, readPublicPortrait } from '../lib/mlbb/public-read.js';

export function allowedPortraitUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'akmweb.youngjoygame.com' && !url.username && !url.password && (!url.port || url.port === '443') ? url : null;
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (!requirePublicMlbbRead(req, res)) return;
  try {
    const id = readPublicHeroId(req.query?.id);
    const store = createRedisStore();
    const catalog = await store.getJSON(MLBB_KEYS.catalog);
    const hero = findPublicHero(catalog, id);
    const url = allowedPortraitUrl(hero?.images?.portrait || hero?.image);
    if (!url) return res.status(404).json({ error: 'Portret topilmadi' });
    const { type, bytes } = await readPublicPortrait(id, url, { store });
    setPublicMlbbHeaders(res, { image: true });
    res.setHeader('Content-Type', type);
    return res.status(200).send(bytes);
  } catch (error) { return sendMlbbError(res, error, { publicRead: true }); }
}
