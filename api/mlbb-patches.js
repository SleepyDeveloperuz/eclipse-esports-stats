import { requireMlbbAccess, sendMlbbError, setPrivateApiHeaders } from '../lib/mlbb/api.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { MLBB_FRESHNESS, publicCacheState } from '../lib/mlbb/sync.js';

export default async function handler(req, res) {
  setPrivateApiHeaders(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireMlbbAccess(req, res)) return;
  try {
    const store = createRedisStore();
    const value = await store.getJSON(MLBB_KEYS.patches);
    if (!value?.data) return res.status(503).json({ code: 'MLBB_DATA_NOT_READY', error: 'Patch Radar hali sync qilinmagan' });
    return res.status(200).json(publicCacheState(value, MLBB_FRESHNESS.patchesMs));
  } catch (error) {
    return sendMlbbError(res, error);
  }
}
