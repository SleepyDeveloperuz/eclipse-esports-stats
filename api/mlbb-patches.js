import { requirePublicMlbbRead, sendMlbbError, setPublicMlbbHeaders } from '../lib/mlbb/api.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { MLBB_FRESHNESS } from '../lib/mlbb/sync.js';
import { publicMlbbState } from '../lib/mlbb/public-read.js';

export default async function handler(req, res) {
  if (!requirePublicMlbbRead(req, res)) return;
  try {
    const store = createRedisStore();
    const value = await store.getJSON(MLBB_KEYS.patches);
    if (!value?.data) return res.status(503).json({ code: 'MLBB_DATA_NOT_READY', error: 'Patch Radar hali sync qilinmagan' });
    setPublicMlbbHeaders(res);
    return res.status(200).json(publicMlbbState(value, MLBB_FRESHNESS.patchesMs));
  } catch (error) {
    return sendMlbbError(res, error, { publicRead: true });
  }
}
