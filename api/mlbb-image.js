import { requireMlbbAccess, setPrivateApiHeaders, sendMlbbError } from '../lib/mlbb/api.js';
import { createRedisStore, MLBB_KEYS } from '../lib/mlbb/store.js';

export function allowedPortraitUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'akmweb.youngjoygame.com' && !url.username && !url.password && (!url.port || url.port === '443') ? url : null;
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  setPrivateApiHeaders(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireMlbbAccess(req, res)) return;
  const id = Number(req.query?.id);
  if (!Number.isInteger(id) || id < 1 || id > 10000) return res.status(400).json({ error: 'Hero ID kerak' });
  try {
    const catalog = await createRedisStore().getJSON(MLBB_KEYS.catalog);
    const hero = catalog?.data?.find(h => Number(h.id) === id);
    const url = allowedPortraitUrl(hero?.images?.portrait || hero?.image);
    if (!url) return res.status(404).json({ error: 'Portret topilmadi' });
    const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const type = (upstream.headers.get('content-type') || '').split(';')[0];
    if (!upstream.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) return res.status(502).json({ error: 'Portret manbasi javob bermadi' });
    const reader = upstream.body.getReader(); const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); return res.status(413).json({ error: 'Portret hajmi katta' }); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    res.setHeader('Content-Type', type);
    return res.status(200).send(Buffer.concat(chunks));
  } catch (error) { return sendMlbbError(res, error); }
}
