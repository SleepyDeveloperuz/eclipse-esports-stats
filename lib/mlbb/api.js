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

// These reads contain only normalized, public MLBB source data. Never reuse
// this guard (or its shared-cache headers) for team data, OCR or mutations.
export function requirePublicMlbbRead(req, res) {
  setPrivateApiHeaders(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  if (!isMlbbMetaEnabled()) {
    res.status(503).json({ code: 'MLBB_META_DISABLED', error: 'Meta Lab vaqtincha o‘chirilgan' });
    return false;
  }
  return true;
}

export function setPublicMlbbHeaders(res, { image = false } = {}) {
  res.setHeader('Cache-Control', image
    ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600'
    : 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
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

export function sendMlbbError(res, error, { publicRead = false } = {}) {
  const known = error instanceof MlbbSyncError
    || error instanceof StorageConfigurationError
    || error instanceof StorageOperationError;
  const status = known && Number.isInteger(error.status) ? error.status : 500;
  if (!known) console.error('MLBB API error:', error);
  if (publicRead) {
    if (error?.code === 'MLBB_REFRESH_BUSY') res.setHeader('Retry-After', '60');
    const safeCodes = new Set(['HERO_NOT_FOUND', 'INVALID_HERO_ID', 'INVALID_COHORT', 'MLBB_DATA_NOT_READY', 'MLBB_REFRESH_BUSY']);
    return res.status(status).json({
      code: safeCodes.has(error?.code) ? error.code : 'MLBB_UNAVAILABLE',
      error: status === 404 ? 'Hero catalogdan topilmadi' : status === 400 ? 'So‘rov parametrlari yaroqsiz' : 'Ma’lumot hozircha mavjud emas. Birozdan keyin qayta urinib ko‘ring.'
    });
  }
  return res.status(status).json({
    code: known ? error.code : 'MLBB_INTERNAL_ERROR',
    error: known ? error.message : 'MLBB ma’lumotlarini ochishda server xatosi yuz berdi'
  });
}

export function setPrivateApiHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
