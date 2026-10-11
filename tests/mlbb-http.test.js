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

test('fetchJson retries transient upstream gateway/server errors once', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? new Response('gateway timeout', { status: 504 })
      : new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 });
  };

  const result = await fetchJson('https://example.test/data', {
    fetchImpl,
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

test('fetchJson attaches sanitized snippet and parsed details on non-2xx response', async () => {
  const jsonBody = JSON.stringify({ error: 'rate_limited', details: { retry_after: 30 } });
  await assert.rejects(() => fetchJson('https://example.test/data', {
    fetchImpl: async () => new Response(jsonBody, { status: 429, headers: { 'Content-Type': 'application/json' } }),
    retries: 0
  }), error => {
    assert.equal(error.code, 'UPSTREAM_HTTP_ERROR');
    assert.equal(error.upstreamStatus, 429);
    assert.equal(error.snippet, jsonBody);
    assert.deepEqual(error.details, { error: 'rate_limited', details: { retry_after: 30 } });
    return true;
  });
});

test('fetchJson throws UPSTREAM_BLOCKED without retry on 403 or 405 HTML response', async () => {
  let calls403 = 0;
  await assert.rejects(() => fetchJson('https://example.test/data', {
    fetchImpl: async () => {
      calls403 += 1;
      return new Response('<html><head><title>403 Forbidden</title></head><body>WAF Block</body></html>', {
        status: 403,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    },
    retries: 2,
    retryBaseDelayMs: 0
  }), error => {
    assert.equal(error.code, 'UPSTREAM_BLOCKED');
    assert.equal(error.upstreamStatus, 403);
    assert.ok(error.snippet.includes('WAF Block'));
    return true;
  });
  assert.equal(calls403, 1, '403 HTML must not be retried');

  let calls405 = 0;
  await assert.rejects(() => fetchJson('https://example.test/data', {
    fetchImpl: async () => {
      calls405 += 1;
      return new Response('<!DOCTYPE html><html><body>Method Not Allowed</body></html>', {
        status: 405,
        headers: { 'Content-Type': 'text/html' }
      });
    },
    retries: 2,
    retryBaseDelayMs: 0
  }), error => {
    assert.equal(error.code, 'UPSTREAM_BLOCKED');
    assert.equal(error.upstreamStatus, 405);
    return true;
  });
  assert.equal(calls405, 1, '405 HTML must not be retried');
});

