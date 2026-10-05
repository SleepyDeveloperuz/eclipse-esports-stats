import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../lib/mlbb/http.js';

test('fetchJson retries an upstream timeout once and returns the recovered response', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new DOMException('Timed out', 'AbortError');
    return new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 });
  };

  const result = await fetchJson('https://example.test/data', {
    fetchImpl,
    timeoutMs: 100,
    retryBaseDelayMs: 0
  });

  assert.deepEqual(result, { code: 0, data: [] });
  assert.equal(calls, 2);
});

test('fetchJson does not retry non-transient upstream HTTP errors', async () => {
  let calls = 0;
  await assert.rejects(() => fetchJson('https://example.test/data', {
    fetchImpl: async () => {
      calls += 1;
      return new Response('{}', { status: 400 });
    },
    retryBaseDelayMs: 0
  }), error => error.code === 'UPSTREAM_HTTP_ERROR' && error.upstreamStatus === 400);
  assert.equal(calls, 1);
});

test('fetchJson preserves timeout failure after its bounded retry', async () => {
  let calls = 0;
  await assert.rejects(() => fetchJson('https://example.test/data', {
    fetchImpl: async () => {
      calls += 1;
      throw new DOMException('Timed out', 'AbortError');
    },
    timeoutMs: 100,
    retryBaseDelayMs: 0
  }), error => error.code === 'UPSTREAM_TIMEOUT');
  assert.equal(calls, 2);
});
