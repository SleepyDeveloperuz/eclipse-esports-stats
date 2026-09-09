import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.ADMIN_PASSWORD = 'admin-test-password';
process.env.VIEWER_PASSWORD = 'viewer-test-password';
process.env.SESSION_SECRET = 'session-secret-with-at-least-thirty-two-characters';

const {
  default: authHandler,
  getAccessIdentity,
  isViewerGateRequested,
  verifyAccessToken,
  verifySession,
  verifyToken
} = await import(`../api/auth.js?test=${Date.now()}`);

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function login(role, password) {
  const req = {
    method: 'POST',
    headers: { 'x-forwarded-for': `127.0.0.${role === 'admin' ? '1' : role === 'viewer' ? '2' : '3'}` },
    body: {
      role,
      password,
      ...(role === 'viewer' || role === 'access' ? { voterId: 'device_test_identity_01' } : {})
    },
    socket: {}
  };
  const res = responseRecorder();
  await authHandler(req, res);
  return res;
}

test('admin token grants admin and viewer access', async () => {
  const res = await login('admin', process.env.ADMIN_PASSWORD);
  assert.equal(res.statusCode, 200);
  assert.equal(verifyToken(res.body.token), true);
  assert.ok(verifyAccessToken(res.body.token));
});

test('viewer token grants read access but never admin access', async () => {
  const res = await login('viewer', process.env.VIEWER_PASSWORD);
  assert.equal(res.statusCode, 200);
  assert.equal(verifyToken(res.body.token), false);
  assert.ok(verifyAccessToken(res.body.token));
  assert.deepEqual(getAccessIdentity(res.body.token), {
    role: 'viewer',
    voterId: 'device_test_identity_01'
  });
});

test('initial access gate recognizes the Admin password and mints both scoped sessions', async () => {
  const res = await login('access', process.env.ADMIN_PASSWORD);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.role, 'admin');
  assert.equal(verifyToken(res.body.token), true);
  assert.equal(verifyToken(res.body.viewerToken), false);
  assert.ok(verifyAccessToken(res.body.viewerToken));
  assert.deepEqual(getAccessIdentity(res.body.viewerToken), {
    role: 'viewer',
    voterId: 'device_test_identity_01'
  });
});

test('initial access gate recognizes the viewer password without granting Admin scope', async () => {
  const res = await login('access', process.env.VIEWER_PASSWORD);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.role, 'viewer');
  assert.equal(res.body.viewerToken, undefined);
  assert.equal(verifyToken(res.body.token), false);
  assert.ok(verifyAccessToken(res.body.token));
});

test('explicit Admin elevation never accepts the viewer password', async () => {
  const res = await login('admin', process.env.VIEWER_PASSWORD);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.token, undefined);
});

test('signed tokens reject malformed timestamps, expiry, future skew and tampering', () => {
  const sign = payload => crypto
    .createHmac('sha256', crypto.createHmac('sha256', process.env.SESSION_SECRET).update(`eclipse-session-v2:admin:${process.env.ADMIN_PASSWORD}`).digest())
    .update(payload)
    .digest('hex');
  const now = Date.now();
  const malformedPayload = `admin.${now}abc`;
  const expiredPayload = `admin.${now - (8 * 24 * 60 * 60 * 1000)}`;
  const futurePayload = `admin.${now + (2 * 60 * 1000)}`;

  assert.equal(verifyToken(`${malformedPayload}.${sign(malformedPayload)}`), false);
  assert.equal(verifyToken(`${expiredPayload}.${sign(expiredPayload)}`), false);
  assert.equal(verifyToken(`${futurePayload}.${sign(futurePayload)}`), false);

  const validPayload = `admin.${now}`;
  const validToken = `${validPayload}.${sign(validPayload)}`;
  assert.equal(verifyToken(validToken), true);
  assert.equal(verifyToken(validToken.replace(/^admin/, 'viewer')), false);
  assert.equal(verifyToken(`${validPayload}.not-hex`), false);
});

test('wrong viewer password is rejected', async () => {
  const res = await login('viewer', 'wrong-password');
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.token, undefined);
});

test('viewer scope reports the configured gate and rejects an anonymous request', async () => {
  assert.equal(isViewerGateRequested(), true);
  const req = {
    method: 'GET',
    headers: {},
    query: { scope: 'viewer' },
    socket: {}
  };
  const res = responseRecorder();
  await authHandler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.viewerRequired, true);
  assert.equal(res.body.code, 'VIEWER_AUTH_REQUIRED');
});

test('a requested viewer gate without SESSION_SECRET fails closed', async () => {
  const previousSecret = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  try {
    const misconfigured = await import(`../api/auth.js?misconfigured=${Date.now()}`);
    assert.equal(misconfigured.isViewerGateRequested(), true);
    assert.equal(misconfigured.isViewerAuthConfigured(), false);

    const req = {
      method: 'GET',
      headers: {},
      query: { scope: 'viewer' },
      socket: {}
    };
    const res = responseRecorder();
    await misconfigured.default(req, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'VIEWER_AUTH_MISCONFIGURED');
  } finally {
    process.env.SESSION_SECRET = previousSecret;
  }
});

test('team reads fail closed when VIEWER_PASSWORD is missing', async () => {
  const previousViewerPassword = process.env.VIEWER_PASSWORD;
  delete process.env.VIEWER_PASSWORD;
  try {
    const misconfigured = await import(`../api/auth.js?missing-viewer=${Date.now()}`);
    assert.equal(misconfigured.isViewerGateRequested(), true);
    assert.equal(misconfigured.isViewerAuthConfigured(), false);

    const req = {
      method: 'GET',
      headers: {},
      query: { scope: 'viewer' },
      socket: {}
    };
    const res = responseRecorder();
    await misconfigured.default(req, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'VIEWER_AUTH_MISCONFIGURED');
    assert.equal(res.headers['Cache-Control'], 'no-store');
  } finally {
    process.env.VIEWER_PASSWORD = previousViewerPassword;
  }
});

test('revocation rejects both scoped sessions, and password rotation rejects old signatures', async () => {
  const session = await login('access', process.env.ADMIN_PASSWORD);
  assert.equal(await verifySession(session.body.token, 'admin'), true);
  const forbidden = responseRecorder();
  await authHandler({ method: 'PATCH', headers: { authorization: `Bearer ${session.body.viewerToken}` }, body: { action: 'revoke_all' } }, forbidden);
  assert.equal(forbidden.statusCode, 401);
  const revoked = responseRecorder();
  await authHandler({ method: 'PATCH', headers: { authorization: `Bearer ${session.body.token}` }, body: { action: 'revoke_all' } }, revoked);
  assert.equal(revoked.statusCode, 200);
  assert.equal(await verifySession(session.body.token, 'admin'), false);
  assert.equal(await verifySession(session.body.viewerToken), false);
  const previous = process.env.ADMIN_PASSWORD;
  try {
    process.env.ADMIN_PASSWORD = 'rotated-fixture-password';
    const rotated = await import(`../api/auth.js?rotation=${Date.now()}`);
    assert.equal(rotated.verifyToken(session.body.token), false);
    assert.equal(rotated.verifyAccessToken(session.body.viewerToken), true, 'admin password rotation alone does not rotate viewer password');
  } finally { process.env.ADMIN_PASSWORD = previous; }
});
