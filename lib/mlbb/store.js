export const MLBB_KEYS = Object.freeze({
  catalog: 'eclipse:mlbb:catalog:v1',
  patches: 'eclipse:mlbb:patches:v1',
  patchEpoch: 'eclipse:mlbb:patch-epoch:v1',
  health: 'eclipse:mlbb:health:v1',
  rankHistory: 'eclipse:mlbb:rank-history:v1',
  syncLock: 'eclipse:mlbb:sync-lock:v1',
  rank(rank = 'mythic', days = '7') {
    return `eclipse:mlbb:rank:v1:${rank}:${days}`;
  },
  rankTimeline(rank = 'mythic', days = '7') {
    return `eclipse:mlbb:timeline:v2:${rank}:${days}`;
  },
  hero(heroId) {
    return `eclipse:mlbb:hero:v1:${heroId}`;
  },
  matchups(heroId, rank, days) {
    return `eclipse:mlbb:matchups:v1:${heroId}:${rank}:${days}`;
  }
});

export class StorageConfigurationError extends Error {
  constructor(message = 'MLBB cache storage sozlanmagan') {
    super(message);
    this.name = 'StorageConfigurationError';
    this.code = 'MLBB_STORAGE_NOT_CONFIGURED';
    this.status = 503;
  }
}

export class StorageOperationError extends Error {
  constructor(message = 'MLBB cache storage bilan bog‘lanib bo‘lmadi', options = {}) {
    super(message);
    this.name = 'StorageOperationError';
    this.code = options.code || 'MLBB_STORAGE_ERROR';
    this.status = 503;
    this.cause = options.cause;
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

function redisConfig(env = process.env) {
  const url = String(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').replace(/\/+$/, '');
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '');
  if (!url || !token) throw new StorageConfigurationError();
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    throw new StorageConfigurationError('Upstash Redis REST URL yaroqsiz');
  }
  if (parsed.protocol !== 'https:' || !/(^|\.)upstash\.io$/i.test(parsed.hostname)) {
    throw new StorageConfigurationError('Faqat Upstash HTTPS REST manzili qabul qilinadi');
  }
  return { url, token };
}

export function isMlbbStorageConfigured(env = process.env) {
  try {
    redisConfig(env);
    return true;
  } catch (_) {
    return false;
  }
}

export function createRedisStore(options = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    timeoutMs = 6_000,
    maxBytes = 6_000_000
  } = options;
  const config = redisConfig(env);
  if (typeof fetchImpl !== 'function') throw new StorageConfigurationError('Fetch API mavjud emas');

  async function command(parts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(config.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(parts),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new StorageOperationError(`Redis ${response.status} javobini qaytardi`);
      }
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        throw new StorageOperationError('Redis javobi ruxsat etilgan hajmdan katta', {
          code: 'MLBB_STORAGE_RESPONSE_TOO_LARGE'
        });
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch (cause) {
        throw new StorageOperationError('Redis yaroqli JSON qaytarmadi', {
          code: 'MLBB_STORAGE_INVALID_JSON',
          cause
        });
      }
      if (payload?.error) throw new StorageOperationError('Redis buyrug‘i bajarilmadi');
      return payload?.result;
    } catch (error) {
      if (error instanceof StorageOperationError) throw error;
      throw new StorageOperationError(
        isAbortError(error) ? 'Redis so‘rovi vaqtidan oshdi' : 'Redis bilan bog‘lanib bo‘lmadi',
        { code: isAbortError(error) ? 'MLBB_STORAGE_TIMEOUT' : 'MLBB_STORAGE_UNREACHABLE', cause: error }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async incrementWindow(key, ttlMs) {
      const script = 'local count=redis.call("INCR",KEYS[1]); if count==1 then redis.call("PEXPIRE",KEYS[1],ARGV[1]) end; return {count,redis.call("PTTL",KEYS[1])}';
      const [count, remainingMs] = await command(['EVAL', script, '1', key, String(ttlMs)]);
      return { count, remainingMs };
    },
    async setMaximum(key, value) {
      const script = 'local old=tonumber(redis.call("GET",KEYS[1]) or "0"); local next=math.max(old,tonumber(ARGV[1])); redis.call("SET",KEYS[1],tostring(next)); return next';
      return command(['EVAL', script, '1', key, String(value)]);
    },
    async restoreJSON(key, expectedRevision, value) {
      const script = 'local raw=redis.call("GET",KEYS[1]); local revision=-1; if raw then revision=cjson.decode(raw)._storageRevision end; if revision~=tonumber(ARGV[1]) then return 0 end; if raw then redis.call("LPUSH",KEYS[3],raw); redis.call("LTRIM",KEYS[3],0,4) end; redis.call("SET",KEYS[1],ARGV[2]); redis.call("SET",KEYS[2],"1"); return 1';
      return (await command(['EVAL', script, '3', key, `${key}:initialized`, `${key}:backups`, String(expectedRevision), JSON.stringify(value)])) === 1;
    },
    async compareJSON(key, expectedRevision, value) {
      const script = 'local raw=redis.call("GET",KEYS[1]); if not raw and redis.call("EXISTS",KEYS[2])==1 then return -1 end; local revision=-1; if raw then revision=cjson.decode(raw)._storageRevision end; if revision~=tonumber(ARGV[1]) then return 0 end; if raw then redis.call("LPUSH",KEYS[3],raw); redis.call("LTRIM",KEYS[3],0,4) end; redis.call("SET",KEYS[1],ARGV[2]); redis.call("SET",KEYS[2],"1"); return 1';
      const result = await command(['EVAL', script, '3', key, `${key}:initialized`, `${key}:backups`, String(expectedRevision), JSON.stringify(value)]);
      if (result === -1) throw new StorageOperationError('Asosiy baza topilmadi. Zaxiradan tiklash kerak; eski Gist avtomatik yuklanmaydi.');
      return result === 1;
    },
    async getJSON(key, options = {}) {
      const value = await command(['GET', key]);
      if (value === null || typeof value === 'undefined') return null;
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch (_) {
        if (options.strict) throw new StorageOperationError('Saqlangan JSON yaroqsiz');
        return null;
      }
    },
    async setJSON(key, value, options = {}) {
      const parts = ['SET', key, JSON.stringify(value)];
      if (Number.isInteger(options.ttlSeconds) && options.ttlSeconds > 0) {
        parts.push('EX', String(options.ttlSeconds));
      }
      await command(parts);
      return value;
    },
    async delete(key) {
      return command(['DEL', key]);
    },
    async acquireLock(key, token, ttlMs = 240_000) {
      const result = await command(['SET', key, token, 'NX', 'PX', String(ttlMs)]);
      return result === 'OK';
    },
    async releaseLock(key, token) {
      const script = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
      return command(['EVAL', script, '1', key, token]);
    }
  };
}

export function createMemoryStore(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, { value, expiresAt: null }]));
  const read = key => {
    const entry = values.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      values.delete(key);
      return null;
    }
    return structuredClone(entry.value);
  };
  return {
    async incrementWindow(key, ttlMs) {
      const count = (read(key) || 0) + 1;
      const expiresAt = values.get(key)?.expiresAt || Date.now() + ttlMs;
      values.set(key, { value: count, expiresAt });
      return { count, remainingMs: Math.max(0, expiresAt - Date.now()) };
    },
    async setMaximum(key, value) {
      const next = Math.max(read(key) || 0, value);
      values.set(key, { value: next, expiresAt: null });
      return next;
    },
    async restoreJSON(key, expectedRevision, value) {
      if ((read(key)?._storageRevision ?? -1) !== expectedRevision) return false;
      values.set(key, { value: structuredClone(value), expiresAt: null });
      return true;
    },
    async compareJSON(key, expectedRevision, value) {
      const current = read(key);
      if ((current?._storageRevision ?? -1) !== expectedRevision) return false;
      values.set(key, { value: structuredClone(value), expiresAt: null });
      return true;
    },
    async getJSON(key) {
      return read(key);
    },
    async setJSON(key, value, options = {}) {
      const expiresAt = Number.isInteger(options.ttlSeconds) && options.ttlSeconds > 0
        ? Date.now() + (options.ttlSeconds * 1000)
        : null;
      values.set(key, { value: structuredClone(value), expiresAt });
      return value;
    },
    async delete(key) {
      return values.delete(key) ? 1 : 0;
    },
    async acquireLock(key, token, ttlMs = 240_000) {
      if (read(key) !== null) return false;
      values.set(key, { value: token, expiresAt: Date.now() + ttlMs });
      return true;
    },
    async releaseLock(key, token) {
      if (read(key) !== token) return 0;
      values.delete(key);
      return 1;
    },
    snapshot() {
      return Object.fromEntries([...values.keys()].map(key => [key, read(key)]));
    }
  };
}
