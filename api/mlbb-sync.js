import { bearerToken, requireMlbbAccess, secretMatches, sendMlbbError, setPrivateApiHeaders } from '../lib/mlbb/api.js';
import { syncMlbbData } from '../lib/mlbb/sync.js';

export default async function handler(req, res) {
  setPrivateApiHeaders(res);
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  if (req.method === 'GET') {
    if (!secretMatches(bearerToken(req), process.env.CRON_SECRET)) {
      return res.status(401).json({ code: 'CRON_AUTH_REQUIRED', error: 'Cron autentifikatsiyasi yaroqsiz' });
    }
  } else if (!await requireMlbbAccess(req, res, 'admin')) {
    return;
  }

  try {
    const result = await syncMlbbData({
      rank: req.body?.rank,
      days: req.body?.days
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendMlbbError(res, error);
  }
}
