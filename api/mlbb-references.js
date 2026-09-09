import { requireMlbbAccess, sendMlbbError, setPrivateApiHeaders } from '../lib/mlbb/api.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';
import { normalizeReferences, REFERENCE_KEY, REFERENCE_VERSION } from '../lib/portrait-references.js';

// Only public portrait descriptors. No scoreboard crops, names of teammates,
// screenshot images or OCR results are accepted or persisted here.
export default async function handler(req, res) {
  setPrivateApiHeaders(res);
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireMlbbAccess(req, res, req.method === 'POST' ? 'admin' : 'viewer')) return;
  try {
    const store = createRedisStore();
    const catalog = await store.getJSON(MLBB_KEYS.catalog);
    if (!Array.isArray(catalog?.data)) return res.status(503).json({ error: 'Catalog unavailable' });
    if (req.method === 'POST') {
      if (!Array.isArray(req.body?.records) || req.body.records.length > 180 || Buffer.byteLength(JSON.stringify(req.body)) > 1_000_000) return res.status(400).json({ error: 'Invalid reference payload' });
      const records = normalizeReferences(req.body.records, catalog.data);
      if (!records.length || records.length !== req.body.records.length) return res.status(400).json({ error: 'Outdated or invalid references' });
      await store.setJSON(REFERENCE_KEY, { version: REFERENCE_VERSION, records }, { ttlSeconds: 7 * 86400 });
      return res.status(200).json({ saved: records.length });
    }
    const cached = await store.getJSON(REFERENCE_KEY);
    return res.status(200).json({ version: REFERENCE_VERSION, records: normalizeReferences(cached?.records, catalog.data) });
  } catch (error) { return sendMlbbError(res, error); }
}
