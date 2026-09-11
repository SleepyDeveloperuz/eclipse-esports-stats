// Provider responses are untrusted. A successful HTTP status is not a usable scan.
export const DEFAULT_OCR_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];
export const OCR_PROVIDER_DEADLINE_MS = 65_000;
export const OCR_MODEL_TIMEOUT_MS = 32_000;

export function configuredOcrModels(value) {
  const models = [...new Set(String(value || '').split(',').map(model => model.trim())
    .filter(model => /^gemini-[a-z0-9.-]+$/.test(model)))].slice(0, 3);
  return models.length ? models : [...DEFAULT_OCR_MODELS];
}

function unusable(code) {
  return Object.assign(new Error(code), { code });
}

export function parseOcrProviderResponse(payload) {
  if (payload?.promptFeedback?.blockReason) throw unusable('blocked');
  const candidate = payload?.candidates?.[0];
  if (!candidate) throw unusable('empty_response');
  if (candidate.finishReason !== 'STOP') {
    throw unusable(candidate.finishReason === 'MAX_TOKENS' ? 'truncated' : 'blocked_or_unfinished');
  }
  const text = (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .filter(part => part?.thought !== true && typeof part?.text === 'string')
    .map(part => part.text).join('').trim();
  if (!text) throw unusable('empty_response');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw unusable('invalid_json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || !Array.isArray(parsed.players) || !parsed.players.length || parsed.players.length > 5
    || parsed.players.some(player => !player || typeof player !== 'object' || Array.isArray(player))) {
    throw unusable('invalid_shape');
  }
  return parsed;
}

function safeModelVersion(value) {
  // Never copy provider free text into public metadata or logs.
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(value) ? value : null;
}

export async function requestOcrProvider({
  apiKey, requestBody, models = DEFAULT_OCR_MODELS, fetchImpl = globalThis.fetch,
  deadlineMs = OCR_PROVIDER_DEADLINE_MS, modelTimeoutMs = OCR_MODEL_TIMEOUT_MS,
  validate = () => true
}) {
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(Math.max(0, deadlineMs), OCR_PROVIDER_DEADLINE_MS);
  const attempts = [];
  const modelList = configuredOcrModels(models.join(','));
  for (const model of modelList) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    // Do not spend another provider request when only a token slice of time
    // remains. Test-scale deadlines use the same proportional budget rule.
    if (attempts.length && remaining < Math.min(1000, modelTimeoutMs / 2)) break;
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    let timeout;
    try {
      // Race the entire operation, including response.json(). Abort alone is
      // insufficient for a stalled body reader or a fetch implementation ignoring it.
      const work = async () => {
        const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(requestBody), signal: controller.signal
        });
        if (!response.ok) {
          controller.abort();
          throw unusable(Number.isInteger(response.status) ? response.status : 'http_error');
        }
        let payload;
        try { payload = await response.json(); } catch { throw unusable('invalid_envelope'); }
        const parsed = parseOcrProviderResponse(payload);
        if (!validate(parsed)) throw unusable('invalid_shape');
        return { parsed, modelVersion: safeModelVersion(payload.modelVersion) };
      };
      const timeoutWork = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(unusable('timeout'));
          controller.abort();
        }, Math.min(Math.max(1, modelTimeoutMs), OCR_MODEL_TIMEOUT_MS, remaining));
      });
      const result = await Promise.race([work(), timeoutWork]);
      attempts.push({ model, status: 'ok', durationMs: Date.now() - attemptStartedAt });
      return {
        success: true, data: result.parsed,
        meta: { model, modelVersion: result.modelVersion, durationMs: Date.now() - startedAt, attempts }
      };
    } catch (error) {
      const allowed = new Set(['blocked', 'empty_response', 'truncated', 'blocked_or_unfinished', 'invalid_json', 'invalid_shape', 'invalid_envelope', 'timeout', 'http_error']);
      const status = (Number.isInteger(error?.code) && error.code >= 100 && error.code <= 599)
        || allowed.has(error?.code) ? error.code : 'network_error';
      attempts.push({ model, status, durationMs: Date.now() - attemptStartedAt });
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }
  return { success: false, meta: { model: null, modelVersion: null, durationMs: Date.now() - startedAt, attempts } };
}
