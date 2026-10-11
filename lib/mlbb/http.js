const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set(['UPSTREAM_TIMEOUT', 'UPSTREAM_UNREACHABLE']);

export class UpstreamError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.code = options.code || 'UPSTREAM_ERROR';
    this.status = options.status || 502;
    this.upstreamStatus = options.upstreamStatus || null;
    this.cause = options.cause;
    this.snippet = options.snippet || null;
    this.details = options.details !== undefined ? options.details : null;
  }
}

function sanitizeSnippet(text, maxLength = 300) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isHtmlResponse(response, text) {
  const contentType = response?.headers?.get?.('content-type') || '';
  if (/text\/html/i.test(contentType)) return true;
  if (/<(!doctype|html|head|body)\b/i.test(text)) return true;
  return false;
}

function abortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

export async function fetchJson(url, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = 8_000,
    retries = 1,
    retryBaseDelayMs = 250,
    maxBytes = 6_000_000,
    ...requestOptions
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new UpstreamError('Fetch API mavjud emas', { code: 'FETCH_UNAVAILABLE', status: 500 });
  }

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0 && retryBaseDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, Math.min(retryBaseDelayMs * (2 ** (attempt - 1)), 1_000)));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...requestOptions, signal: controller.signal });
      if (!response.ok) {
        let rawText = '';
        try {
          rawText = await response.text();
        } catch (_) {}
        const snippet = sanitizeSnippet(rawText, 300);
        let details = null;
        try {
          details = JSON.parse(rawText);
        } catch (_) {}

        const isBlocked = (response.status === 403 || response.status === 405) && isHtmlResponse(response, rawText);
        if (isBlocked) {
          throw new UpstreamError(`Upstream ${response.status} javobini qaytardi (kirish bloklangan)`, {
            code: 'UPSTREAM_BLOCKED',
            upstreamStatus: response.status,
            snippet,
            details
          });
        }

        const error = new UpstreamError(`Upstream ${response.status} javobini qaytardi`, {
          code: 'UPSTREAM_HTTP_ERROR',
          upstreamStatus: response.status,
          snippet,
          details
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
      if (attempt < retries && RETRYABLE_CODES.has(normalized.code)) {
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
