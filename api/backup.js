import { isAuthConfigured, verifySession } from './auth.js';
import { readExistingTeamSnapshot } from '../lib/team-store.js';

export function createBackupHandler({ configured = isAuthConfigured, authorize = token => verifySession(token, 'admin'), read = readExistingTeamSnapshot } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Faqat yuklab olish mumkin.' });
    }
    if (!configured()) return res.status(503).json({ error: 'Admin kirishi sozlanmagan.' });
    const authorization = req.headers?.authorization || '';
    const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1] || '';
    try {
      if (!await authorize(token)) return res.status(401).json({ error: 'Admin sifatida kiring.' });
      const snapshot = await read();
      res.setHeader('Content-Disposition', 'attachment; filename="eclipse-team-backup.json"');
      return res.status(200).json(snapshot);
    } catch (error) {
      return res.status(Number(error.status) || 503).json({ error: 'To‘liq zaxirani olib bo‘lmadi. Baza holatini tekshiring.', code: error.code || 'BACKUP_UNAVAILABLE' });
    }
  };
}

export default createBackupHandler();
