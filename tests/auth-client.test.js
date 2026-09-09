import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const authSource = readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function createManager(fetchImpl) {
  const sessionStorage = createStorage();
  const localStorage = createStorage();
  const context = vm.createContext({
    console,
    fetch: fetchImpl,
    localStorage,
    sessionStorage,
    window: {
      crypto: { randomUUID: () => 'device_client_identity_01' },
      showToast() {}
    }
  });
  vm.runInContext(authSource, context, { filename: 'js/auth.js' });
  return {
    manager: new context.window.AuthManager({}),
    sessionStorage
  };
}

test('initial client login stores Admin and viewer fallback sessions from one password', async () => {
  let submittedBody;
  const { manager, sessionStorage } = createManager(async (_url, options) => {
    submittedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        token: 'signed-admin-token',
        viewerToken: 'signed-viewer-token',
        role: 'admin'
      })
    };
  });

  assert.equal(await manager.loginAccess('admin-entry-value'), true);
  assert.equal(submittedBody.role, 'access');
  assert.equal(submittedBody.voterId, 'device_client_identity_01');
  assert.equal(sessionStorage.getItem('eclipse_admin_token'), 'signed-admin-token');
  assert.equal(sessionStorage.getItem('eclipse_admin_session'), 'true');
  assert.equal(sessionStorage.getItem('eclipse_viewer_token'), 'signed-viewer-token');
});

test('initial client login stores only viewer scope for a viewer response', async () => {
  const { manager, sessionStorage } = createManager(async () => ({
    ok: true,
    json: async () => ({ token: 'signed-viewer-token', role: 'viewer' })
  }));

  assert.equal(await manager.loginAccess('viewer-entry-value'), true);
  assert.equal(sessionStorage.getItem('eclipse_admin_token'), null);
  assert.equal(sessionStorage.getItem('eclipse_admin_session'), null);
  assert.equal(sessionStorage.getItem('eclipse_viewer_token'), 'signed-viewer-token');
  assert.equal(manager.isAdmin(), false);
});
