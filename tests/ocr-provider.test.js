import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredOcrModels, DEFAULT_OCR_MODELS, parseOcrProviderResponse, requestOcrProvider } from '../lib/ocr-provider.js';

const parsed = { players: [{ detectedName: 'Leader', sourceRow: 1, kills: 4 }] };
const payload = (overrides = {}) => ({
  modelVersion: 'gemini-3.5-flash-lite-07-2026',
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(parsed) }] } }],
  ...overrides
});
const ok = value => ({ ok: true, status: 200, json: async () => value });
const models = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];

test('OCR model allow-list retains pinned defaults and strips paths, duplicates and overflow', () => {
  assert.deepEqual(configuredOcrModels(''), DEFAULT_OCR_MODELS);
  assert.deepEqual(configuredOcrModels('../../secrets,not-a-model'), DEFAULT_OCR_MODELS);
  assert.deepEqual(configuredOcrModels('gemini-3.5-flash-lite,gemini-3.5-flash-lite,gemini-2.5-flash'), models);
  assert.equal(configuredOcrModels('gemini-a,gemini-b,gemini-c,gemini-d').length, 3);
});

test('parser joins multipart non-thought text without consuming hidden thought text', () => {
  const text = JSON.stringify(parsed);
  assert.deepEqual(parseOcrProviderResponse(payload({ candidates: [{ finishReason: 'STOP', content: { parts: [
    { thought: true, text: 'not JSON or public output' }, { text: text.slice(0, 10) },
    { inlineData: { mimeType: 'image/png', data: 'not text' } }, { text: text.slice(10) }
  ] } }] })), parsed);
});

test('HTTP200 blocked, truncated, empty, malformed, or structurally invalid outputs each cause fallback', async t => {
  const cases = [
    ['blocked', payload({ promptFeedback: { blockReason: 'SAFETY' } })],
    ['truncated', payload({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(parsed) }] } }] })],
    ['blocked_or_unfinished', payload({ candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: JSON.stringify(parsed) }] } }] })],
    ['blocked_or_unfinished', payload({ candidates: [{ content: { parts: [{ text: JSON.stringify(parsed) }] } }] })],
    ['empty_response', payload({ candidates: [] })],
    ['empty_response', payload({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'hidden' }] } }] })],
    ['invalid_json', payload({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '```json\n{}\n```' }] } }] })],
    ['invalid_shape', payload({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"players":[]}' }] } }] })],
    ['invalid_shape', payload({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"players":[null]}' }] } }] })]
  ];
  for (const [status, badPayload] of cases) await t.test(status, async () => {
    const replies = [ok(badPayload), ok(payload())];
    const result = await requestOcrProvider({ apiKey: 'private-test-key', requestBody: {}, models, fetchImpl: async () => replies.shift() });
    assert.equal(result.success, true);
    assert.equal(result.meta.model, models[1]);
    assert.equal(result.meta.attempts[0].status, status);
    assert.equal(result.meta.attempts[1].status, 'ok');
    assert.equal(result.meta.modelVersion, 'gemini-3.5-flash-lite-07-2026');
    assert.deepEqual(result.data, parsed);
  });
});

test('provider passes schema and key privately, exposes only safe success provenance', async () => {
  const body = { generationConfig: { responseMimeType: 'application/json', responseJsonSchema: {} } };
  let sent;
  const result = await requestOcrProvider({ apiKey: 'private-test-key', requestBody: body, models, fetchImpl: async (url, options) => {
    sent = { url, options };
    return ok(payload());
  } });
  assert.ok(sent.url.endsWith('gemini-3.5-flash-lite:generateContent'));
  assert.equal(sent.options.headers['x-goog-api-key'], 'private-test-key');
  assert.deepEqual(JSON.parse(sent.options.body), body);
  assert.equal(result.meta.attempts.length, 1);
  assert.equal(result.meta.model, models[0]);
  assert.ok(Number.isFinite(result.meta.durationMs));
  assert.equal(JSON.stringify(result).includes('private-test-key'), false);
});

test('HTTP failure does not read or expose provider error text', async () => {
  let readErrorBody = false;
  const replies = [{ ok: false, status: 429, json: async () => { readErrorBody = true; throw Error('secret'); } }, ok(payload())];
  const result = await requestOcrProvider({ apiKey: 'secret', requestBody: {}, models, fetchImpl: async () => replies.shift() });
  assert.equal(result.success, true);
  assert.equal(readErrorBody, false);
  assert.equal(result.meta.attempts[0].status, 429);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('network exceptions and invalid envelopes are sanitized and fall back', async () => {
  let attempt = 0;
  const result = await requestOcrProvider({ apiKey: 'secret', requestBody: {}, models, fetchImpl: async () => {
    if (++attempt === 1) throw Error('secret request contents');
    return { ok: true, json: async () => { throw Error('secret body'); } };
  } });
  assert.equal(result.success, false);
  assert.deepEqual(result.meta.attempts.map(item => item.status), ['network_error', 'invalid_envelope']);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('a stalled JSON body is bounded by attempt timeout and switches model', async () => {
  let count = 0;
  const result = await requestOcrProvider({ apiKey: 'secret', requestBody: {}, models, modelTimeoutMs: 15, deadlineMs: 500, fetchImpl: async () => {
    if (++count === 1) return { ok: true, json: () => new Promise(() => {}) };
    return ok(payload());
  } });
  assert.equal(result.success, true);
  assert.equal(result.meta.attempts[0].status, 'timeout');
  assert.equal(count, 2);
});

test('total deadline bounds all attempts even if fetch ignores AbortSignal', async () => {
  let count = 0;
  const began = Date.now();
  const result = await requestOcrProvider({ apiKey: 'secret', requestBody: {}, models: [...models, 'gemini-third'], deadlineMs: 35, modelTimeoutMs: 30,
    fetchImpl: () => { count++; return new Promise(() => {}); }
  });
  assert.equal(result.success, false);
  assert.ok(count <= 2);
  assert.ok(Date.now() - began < 350, 'never waits for an unresponsive fetch promise');
  assert.ok(result.meta.attempts.every(attempt => attempt.status === 'timeout'));
});

test('caller contract rejection falls back rather than returning unusable normalized data', async () => {
  let count = 0;
  const result = await requestOcrProvider({ apiKey: 'secret', requestBody: {}, models,
    fetchImpl: async () => { count++; return ok(payload()); }, validate: () => count > 1
  });
  assert.equal(result.success, true);
  assert.equal(result.meta.attempts[0].status, 'invalid_shape');
});

test('modelVersion free text is not reflected in provenance', async () => {
  const result = await requestOcrProvider({ apiKey: 'secret', requestBody: {}, fetchImpl: async () => ok(payload({ modelVersion: 'provider error: secret' })) });
  assert.equal(result.meta.modelVersion, null);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
