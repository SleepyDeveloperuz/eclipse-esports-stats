import { createHash } from 'node:crypto';
import { createMemoryStore, createRedisStore, isMlbbStorageConfigured } from './mlbb/store.js';

const localStore = createMemoryStore();
function configuredStore() {
  if (isMlbbStorageConfigured()) return createRedisStore();
  if (process.env.VERCEL) throw Object.assign(new Error('Session storage unavailable'), { status: 503, code: 'AUTH_STORAGE_UNAVAILABLE' });
  return localStore; // Offline development only; production never falls back.
}
export function createSessionSecurity({ store, namespace = process.env.GIST_ID || 'local' } = {}) {
  const prefix = `eclipse:auth:v1:${createHash('sha256').update(namespace).digest('hex').slice(0, 24)}`;
  const storage = () => store || configuredStore();
  return {
    async checkAction(req, identity, action, limit, ttlMs) {
      const subject = identity?.voterId || String(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const key = `${prefix}:${action}:${createHash('sha256').update(`${identity?.role || 'viewer'}:${subject}`).digest('hex')}`;
      const { count, remainingMs } = await storage().incrementWindow(key, ttlMs);
      return { limited: count > limit, retryAfter: Math.max(1, Math.ceil(remainingMs / 1000)) };
    },
    async checkLogin(req) {
      const ip = String(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const key = `${prefix}:login:${createHash('sha256').update(ip).digest('hex')}`;
      const { count, remainingMs } = await storage().incrementWindow(key, 15 * 60_000);
      // Allows a 15-person team sharing one network to sign in once together.
      return { limited: count > 20, retryAfter: Math.max(1, Math.ceil(remainingMs / 1000)) };
    },
    async validSince(timestamp) {
      const cutoff = await storage().getJSON(`${prefix}:revoked-before`, { strict: true });
      if (cutoff !== null && (!Number.isSafeInteger(cutoff) || cutoff < 0)) throw Object.assign(new Error('Invalid session cutoff'), { status: 503 });
      return timestamp > (cutoff || 0);
    },
    async revokeAll(now = Date.now()) { return storage().setMaximum(`${prefix}:revoked-before`, now); }
  };
}
