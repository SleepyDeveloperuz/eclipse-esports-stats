import crypto from 'node:crypto';
import {
  isAuthConfigured,
  isViewerAuthConfigured,
  verifySession
} from '../../api/auth.js';
import { isMlbbMetaEnabled, MlbbSyncError } from './sync.js';
import { StorageConfigurationError, StorageOperationError } from './store.js';

export function bearerToken(req) {
  return String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

export async function requireMlbbAccess(req, res, scope = 'viewer') {
  if (!isMlbbMetaEnabled()) {
    res.status(503).json({ code: 'MLBB_META_DISABLED', error: 'Meta Lab vaqtincha o‘chirilgan' });
    return false;
  }
  const configured = scope === 'admin' ? isAuthConfigured() : isViewerAuthConfigured();
  if (!configured) {
    res.status(503).json({
      code: scope === 'admin' ? 'ADMIN_AUTH_MISCONFIGURED' : 'VIEWER_AUTH_MISCONFIGURED',
      error: 'MLBB Meta Lab uchun jamoa kirish himoyasi to‘liq sozlanmagan'
    });
    return false;
  }
  let valid;
  try { valid = await verifySession(bearerToken(req), scope); }
  catch (_) { res.status(503).json({ code: 'AUTH_STORAGE_UNAVAILABLE', error: 'Kirish sessiyasini tekshirib bo‘lmadi.' }); return false; }
  if (!valid) {
    res.status(401).json({ code: scope === 'admin' ? 'ADMIN_AUTH_REQUIRED' : 'VIEWER_AUTH_REQUIRED', error: 'Kirish sessiyasi yaroqsiz yoki tugagan' });
    return false;
  }
  return true;
}

export function secretMatches(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = crypto.createHash('sha256').update(input, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export function sendMlbbError(res, error) {
  const known = error instanceof MlbbSyncError
    || error instanceof StorageConfigurationError
    || error instanceof StorageOperationError;
  const status = known && Number.isInteger(error.status) ? error.status : 500;
  if (!known) console.error('MLBB API error:', error);
  return res.status(status).json({
    code: known ? error.code : 'MLBB_INTERNAL_ERROR',
    error: known ? error.message : 'MLBB ma’lumotlarini ochishda server xatosi yuz berdi'
  });
}

export function setPrivateApiHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
