const RETRYABLE_STATUSES = new Set([429, 502, 503]);

export class UpstreamError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.code = options.code || 'UPSTREAM_ERROR';
    this.status = options.status || 502;
    this.upstreamStatus = options.upstreamStatus || null;
    this.cause = options.cause;
  }
}

function abortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

export async function fetchJson(url, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = 8_000,
    retries = 1,
    maxBytes = 6_000_000,
    ...requestOptions
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new UpstreamError('Fetch API mavjud emas', { code: 'FETCH_UNAVAILABLE', status: 500 });
  }

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...requestOptions, signal: controller.signal });
      if (!response.ok) {
        const error = new UpstreamError(`Upstream ${response.status} javobini qaytardi`, {
          code: 'UPSTREAM_HTTP_ERROR',
          upstreamStatus: response.status
        });
        if (attempt < retries && RETRYABLE_STATUSES.has(response.status)) {
          lastError = error;
          continue;
        }
        throw error;
      }

      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        throw new UpstreamError('Upstream javobi ruxsat etilgan hajmdan katta', {
          code: 'UPSTREAM_RESPONSE_TOO_LARGE'
        });
      }
      try {
        return JSON.parse(text);
      } catch (cause) {
        throw new UpstreamError('Upstream yaroqli JSON qaytarmadi', {
          code: 'UPSTREAM_INVALID_JSON',
          cause
        });
      }
    } catch (error) {
      const normalized = error instanceof UpstreamError
        ? error
        : new UpstreamError(
          abortError(error) ? 'Upstream so‘rovi vaqtidan oshdi' : 'Upstream bilan bog‘lanib bo‘lmadi',
          { code: abortError(error) ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE', cause: error }
        );
      if (attempt < retries && normalized.code === 'UPSTREAM_UNREACHABLE') {
        lastError = normalized;
        continue;
      }
      throw normalized;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new UpstreamError('Upstream so‘rovi bajarilmadi');
}
