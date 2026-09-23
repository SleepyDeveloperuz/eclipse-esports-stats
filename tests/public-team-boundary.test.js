import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_PASSWORD = 'fixture-private-admin';
process.env.VIEWER_PASSWORD = 'fixture-private-viewer';
process.env.SESSION_SECRET = 'fixture-private-session-secret-with-over-thirty-two-characters';
process.env.GIST_ID = 'fixture-private-team';
const [{ default: sync }, { default: briefing }, { default: submissions }, { default: ocr }] = await Promise.all([
  import('../api/sync.js'), import('../api/briefing.js'), import('../api/submissions.js'), import('../api/ocr.js')
]);
const response = () => ({ headers: {}, statusCode: 200,
  setHeader(name, value) { this.headers[name] = value; },
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; }
});
test('public Meta Lab does not grant anonymous team statistics, Briefing, submissions, history, Weekly or OCR access', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail('Anonymous callers must not reach private storage or AI'); };
  try {
    for (const [handler, method, query] of [[sync, 'GET', {}], [briefing, 'GET', {}], [submissions, 'GET', {}], [submissions, 'GET', { feature: 'history' }], [submissions, 'GET', { feature: 'weekly' }], [ocr, 'POST', {}]]) {
      const res = response();
      await handler({ method, headers: {}, query, body: {}, socket: {} }, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.players, undefined); assert.equal(res.body.matches, undefined);
    }
  } finally { globalThis.fetch = original; }
});
