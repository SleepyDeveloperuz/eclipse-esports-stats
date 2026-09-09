import crypto from 'crypto';
import { createSessionSecurity } from '../lib/session-security.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;
const MAX_PASSWORD_LENGTH = 256;
const MIN_SESSION_SECRET_BYTES = 32;
const VOTER_ID_PATTERN = /^[a-zA-Z0-9_-]{16,120}$/;
const sessionSecurity = createSessionSecurity();
function signingKey(role) {
  // Rotating a role's password invalidates its already-issued sessions.
  return crypto.createHmac('sha256', SESSION_SECRET).update(`eclipse-session-v2:${role}:${role === 'admin' ? ADMIN_PASSWORD : VIEWER_PASSWORD}`).digest();
}

function passwordMatches(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false;
  const inputDigest = crypto.createHash('sha256').update(input, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(inputDigest, expectedDigest);
}

export function isAuthConfigured() {
  return Boolean(ADMIN_PASSWORD && SESSION_SECRET
    && Buffer.byteLength(SESSION_SECRET, 'utf8') >= MIN_SESSION_SECRET_BYTES);
}

export function isViewerGateRequested() {
  // Eclipse Command Room is an internal team product: reads fail closed unless
  // the shared viewer gate and signing secret are both configured.
  return true;
}

export function isViewerAuthConfigured() {
  return Boolean(VIEWER_PASSWORD && SESSION_SECRET
    && Buffer.byteLength(SESSION_SECRET, 'utf8') >= MIN_SESSION_SECRET_BYTES
    && VIEWER_PASSWORD !== ADMIN_PASSWORD);
}

function sendConfigurationError(res, role = 'admin') {
  const isViewer = role === 'viewer';
  return res.status(503).json({
    code: isViewer ? 'VIEWER_AUTH_MISCONFIGURED' : 'ADMIN_AUTH_MISCONFIGURED',
    error: isViewer
      ? 'Jamoa kirish himoyasi to‘liq sozlanmagan. VIEWER_PASSWORD va kamida 32 baytli SESSION_SECRET kiriting; viewer va Admin parollari turlicha bo‘lsin.'
      : 'Admin xavfsizlik sozlamalari topilmadi. Vercel Environment Variables orqali ADMIN_PASSWORD va SESSION_SECRET ni kiriting.'
  });
}

function generateToken(role = 'admin', voterId = '') {
  const timestamp = Date.now().toString();
  const payload = role === 'viewer'
    ? `${role}.${timestamp}.${voterId}`
    : `${role}.${timestamp}`;
  const signature = crypto
    .createHmac('sha256', signingKey(role))
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

function readToken(token) {
  // Each role is independently bound to its current password and signing key.
  if (!SESSION_SECRET || !token || typeof token !== 'string') return false;
  const parts = token.split('.');
  let role;
  let timestamp;
  let signature;
  let signedPayload;
  let voterId = '';

  if (parts.length === 4) {
    [role, timestamp, voterId, signature] = parts;
    if (role !== 'viewer' || !VOTER_ID_PATTERN.test(voterId)) return false;
    signedPayload = `${role}.${timestamp}.${voterId}`;
  } else if (parts.length === 3) {
    [role, timestamp, signature] = parts;
    if (!['admin', 'viewer'].includes(role)) return false;
    // Viewer sessions issued before signed device identities are deliberately
    // invalidated so a raw X-Eclipse-Voter header cannot define identity.
    if (role === 'viewer') return false;
    signedPayload = `${role}.${timestamp}`;
  } else if (parts.length === 2) {
    // Backward compatibility for already-issued admin sessions.
    [timestamp, signature] = parts;
    role = 'admin';
    signedPayload = timestamp;
  } else {
    return false;
  }

  if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;

  if (role === 'admin' ? !isAuthConfigured() : !isViewerAuthConfigured()) return false;
  const expectedSignature = crypto
    .createHmac('sha256', signingKey(role))
    .update(signedPayload)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  // Check expiration (7 days)
  const tokenTime = Number(timestamp);
  if (!Number.isSafeInteger(tokenTime)) return false;
  if (tokenTime > Date.now() + CLOCK_SKEW_MS) return false;
  if (Date.now() - tokenTime > TOKEN_MAX_AGE_MS) return false;

  return { role, timestamp: tokenTime, voterId };
}

export function verifyToken(token) {
  return readToken(token)?.role === 'admin';
}

export function verifyAccessToken(token) {
  const parsed = readToken(token);
  return parsed && (parsed.role === 'admin' || parsed.role === 'viewer');
}

export function getAccessIdentity(token) {
  const parsed = readToken(token);
  return parsed ? { role: parsed.role, voterId: parsed.voterId || '' } : null;
}

export async function getValidAccessIdentity(token) {
  const parsed = readToken(token);
  if (!parsed || !await sessionSecurity.validSince(parsed.timestamp)) return null;
  return { role: parsed.role, voterId: parsed.voterId || '' };
}

export async function verifySession(token, scope = 'viewer') {
  const identity = await getValidAccessIdentity(token);
  return Boolean(identity && (scope !== 'admin' || identity.role === 'admin'));
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === "POST") {
      const roleRequest = req.body?.role;
      const requestedRole = roleRequest === 'viewer' || roleRequest === 'access'
        ? roleRequest
        : 'admin';
      if (requestedRole === 'viewer' || requestedRole === 'access') {
        if (!isViewerGateRequested()) {
          return res.status(404).json({
            code: 'VIEWER_AUTH_NOT_ENABLED',
            error: 'Jamoa kirish paroli yoqilmagan'
          });
        }
        if (!isViewerAuthConfigured()) {
          return sendConfigurationError(res, 'viewer');
        }
      } else if (!isAuthConfigured()) {
        return sendConfigurationError(res, 'admin');
      }

      const rate = await sessionSecurity.checkLogin(req);
      if (rate.limited) {
        res.setHeader('Retry-After', String(rate.retryAfter));
        return res.status(429).json({ error: "Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring." });
      }
      const { password, voterId = '' } = req.body || {};

      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: "Parol kiritilmadi" });
      }
      if (password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: "Parol formati noto‘g‘ri" });
      }
      if ((requestedRole === 'viewer' || requestedRole === 'access')
        && !VOTER_ID_PATTERN.test(String(voterId))) {
        return res.status(400).json({ error: "Kirish sessiyasi identifikatori noto‘g‘ri" });
      }

      // The initial access gate accepts either credential but only mints the
      // role that the supplied password is entitled to. The separate Admin
      // elevation flow remains admin-only.
      const adminMatch = requestedRole !== 'viewer' && passwordMatches(password, ADMIN_PASSWORD);
      const viewerMatch = requestedRole !== 'admin' && passwordMatches(password, VIEWER_PASSWORD);
      const authenticatedRole = adminMatch ? 'admin' : viewerMatch ? 'viewer' : '';

      if (!authenticatedRole) {
        // Small delay to prevent brute-force speed
        await new Promise(r => setTimeout(r, 400));
        return res.status(401).json({ error: "Noto'g'ri parol! Qaytadan urinib ko'ring." });
      }

      const token = generateToken(authenticatedRole, String(voterId));
      const viewerToken = requestedRole === 'access' && authenticatedRole === 'admin'
        ? generateToken('viewer', String(voterId))
        : '';
      const response = {
        success: true,
        token: token,
        role: authenticatedRole,
        message: authenticatedRole === 'admin' ? 'Admin tasdiqlandi' : 'Jamoa kirishi tasdiqlandi'
      };
      if (viewerToken) response.viewerToken = viewerToken;
      return res.status(200).json(response);
    }

    if (req.method === "GET") {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      const viewerScope = req.query?.scope === 'viewer';
      if (viewerScope) {
        if (!isViewerGateRequested()) {
          return res.status(200).json({ valid: true, viewerRequired: false });
        }
        if (!isViewerAuthConfigured()) {
          return sendConfigurationError(res, 'viewer');
        }
        const valid = await verifySession(token);
        if (valid) {
          return res.status(200).json({ valid: true, viewerRequired: true });
        }
        return res.status(401).json({
          valid: false,
          viewerRequired: true,
          code: 'VIEWER_AUTH_REQUIRED',
          error: "Yaroqsiz yoki muddati o'tgan token"
        });
      }

      if (!isAuthConfigured()) {
        return sendConfigurationError(res, 'admin');
      }
      const valid = await verifySession(token, 'admin');

      if (valid) {
        return res.status(200).json({ valid: true, viewerRequired: isViewerGateRequested() });
      } else {
        return res.status(401).json({
          valid: false,
          viewerRequired: isViewerGateRequested(),
          error: "Yaroqsiz yoki muddati o'tgan token"
        });
      }
    }

    if (req.method === 'PATCH' && req.body?.action === 'revoke_all') {
      const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
      if (!await verifySession(token, 'admin')) return res.status(401).json({ error: 'Admin sifatida kiring.' });
      await sessionSecurity.revokeAll();
      return res.status(200).json({ success: true, message: 'Barcha sessiyalar bekor qilindi. Qayta kiring.' });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Auth API error:', error.code || 'AUTH_ERROR');
    return res.status(error.status === 503 ? 503 : 500).json({ error: 'Kirish xizmatini tekshirib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.' });
  }
}
