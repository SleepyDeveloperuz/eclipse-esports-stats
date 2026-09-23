import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
let JSDOM;
try { ({ JSDOM } = await import(process.env.ECLIPSE_JSDOM_PATH || 'jsdom')); } catch { /* optional DOM test dependency */ }
const domTest = JSDOM ? test : (name, fn) => test(name, { skip: 'Set ECLIPSE_JSDOM_PATH.' }, fn);
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('manifest, both entry points and PNG dimensions form one installable app', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/?source=pwa');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  for (const icon of [...manifest.icons, { src: '/assets/apple-touch-icon.png', sizes: '180x180' }]) {
    const bytes = readFileSync(new URL('..' + icon.src, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  for (const file of ['index.html', 'meta-lab.html']) {
    assert.match(read(file), /rel="manifest" href="\/manifest.webmanifest"/);
    assert.match(read(file), /rel="apple-touch-icon"/);
    assert.match(read(file), /data-pwa-install/);
    assert.match(read(file), /pwa.js\?v=2.30.0/);
  }
  const headers = JSON.parse(read('vercel.json')).headers;
  for (const path of ['/sw.js', '/manifest.webmanifest']) {
    assert.match(headers.find(h => h.source === path).headers.find(h => h.key === 'Cache-Control').value, /max-age=0/);
  }
});

function workerHarness() {
  const events = {}, saved = new Map(), deleted = [], calls = [];
  const cache = {
    async addAll(paths) { for (const path of paths) { assert.ok(existsSync(new URL('..' + path.split('?')[0], import.meta.url))); saved.set(path, new Response(path)); } },
    async match(request) { return saved.get(typeof request === 'string' ? request : new URL(request.url).pathname); }
  };
  const harness = { events, saved, deleted, calls, offline: false };
  vm.runInNewContext(read('sw.js'), {
    self: { location: { origin: 'https://fixture.invalid' }, addEventListener: (name, handler) => { events[name] = handler; } },
    caches: { open: async () => cache, keys: async () => ['eclipse-pwa-shell-2.29.0', 'eclipse-pwa-shell-2.30.0', 'unrelated-cache'], delete: async key => { deleted.push(key); } },
    fetch: async request => { calls.push(request); if (harness.offline) throw new Error('offline'); return new Response('online'); }, URL, Response
  });
  return harness;
}
function dispatchFetch(h, path, options = {}) {
  let response;
  h.events.fetch({ request: { url: new URL(path, 'https://fixture.invalid').href, method: 'GET', mode: 'cors', headers: new Headers(), ...options }, respondWith: value => { response = value; } });
  return response;
}

test('worker caches only finite public assets and deletes only its obsolete shell', async () => {
  const h = workerHarness(); let work;
  h.events.install({ waitUntil: promise => { work = promise; } }); await work;
  assert.equal(h.saved.size, 6);
  assert.ok([...h.saved.keys()].every(path => /^\/(offline.html|css\/pwa.css|js\/offline.js|assets\/)/.test(path)));
  h.events.activate({ waitUntil: promise => { work = promise; } }); await work;
  assert.deepEqual(h.deleted, ['eclipse-pwa-shell-2.29.0']);
  assert.doesNotMatch(read('sw.js'), /skipWaiting\(|clients\.claim\(/);
});

test('worker ignores API, authenticated, cross-origin and mutation requests', () => {
  const h = workerHarness();
  assert.equal(dispatchFetch(h, '/api/sync', { mode: 'navigate' }), undefined);
  assert.equal(dispatchFetch(h, '/api'), undefined);
  assert.equal(dispatchFetch(h, '/', { method: 'POST', mode: 'navigate' }), undefined);
  assert.equal(dispatchFetch(h, 'https://other.invalid/'), undefined);
  assert.equal(dispatchFetch(h, '/', { headers: new Headers({ Authorization: 'Bearer fixture' }), mode: 'navigate' }), undefined);
  assert.equal(dispatchFetch(h, '/js/data.js'), undefined);
  assert.equal(h.calls.length, 0);
});

test('navigation is network-only, with a public offline fallback, never a saved team page', async () => {
  const h = workerHarness(); let work;
  h.events.install({ waitUntil: promise => { work = promise; } }); await work;
  assert.equal(await (await dispatchFetch(h, '/', { mode: 'navigate' })).text(), 'online');
  assert.equal(h.saved.has('/'), false);
  h.offline = true;
  assert.equal(await (await dispatchFetch(h, '/meta-lab?rank=epic', { mode: 'navigate' })).text(), '/offline.html');
  h.saved.delete('/offline.html');
  assert.equal((await dispatchFetch(h, '/', { mode: 'navigate' })).status, 503);
});

function dom(options = {}) {
  const w = new JSDOM('<button data-pwa-install>Install</button><main class="app-container"></main><div id="modalOverlay"><div id="modalContent"></div></div>', { url: 'https://fixture.invalid/', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  Object.defineProperty(w.navigator, 'userAgent', { value: options.ua || 'Android Chrome' });
  Object.defineProperty(w.navigator, 'standalone', { value: options.standalone || false });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; this.querySelector('button')?.focus(); };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  return w;
}

domTest('native install is user-triggered; dismissal does not reprompt and installed mode hides controls', async () => {
  const w = dom();
  try {
    w.eval(read('js/pwa.js'));
    let prompted = 0;
    const event = new w.Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { prompted++; };
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    w.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true); assert.equal(prompted, 0);
    w.document.querySelector('button').click(); await tick();
    assert.equal(prompted, 1); assert.equal(w.document.querySelector('dialog'), null);
    w.document.querySelector('button').click();
    assert.equal(w.document.querySelector('dialog').open, true);
    assert.match(w.document.querySelector('dialog').textContent, /Chrome/);
    w.dispatchEvent(new w.Event('appinstalled'));
    assert.equal(w.document.querySelector('dialog').open, false);
    assert.ok(w.document.documentElement.classList.contains('pwa-installed'));
  } finally { w.close(); }
});

domTest('iOS installation explains Safari and does not unlock the mandatory team gate', () => {
  const w = dom({ ua: 'iPhone Safari' });
  try {
    w.eval(read('js/auth.js'));
    const auth = new w.AuthManager({}); auth.lockViewerSurface(); auth.showViewerLoginModal(null, { mandatory: true });
    w.eval(read('js/pwa.js'));
    const trigger = w.document.querySelector('#modalContent [data-pwa-install]'); trigger.click();
    const dialog = w.document.querySelector('dialog');
    assert.match(dialog.textContent, /Safari/); assert.match(dialog.textContent, /Add to Home Screen/);
    const escape = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    dialog.querySelector('button').dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, false, 'Native dialog cancellation must be allowed');
    dialog.querySelector('button').click();
    assert.equal(w.document.activeElement, trigger);
    assert.ok(w.document.querySelector('.app-container').hasAttribute('inert'));
    assert.equal(auth.viewerPromptMandatory, true);
    const gateEscape = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    trigger.dispatchEvent(gateEscape); assert.equal(gateEscape.defaultPrevented, true);
  } finally { w.close(); }
});

domTest('worker registration and update notice never reload or force activation', async () => {
  const w = dom();
  try {
    let registrationArgs;
    Object.defineProperty(w, 'isSecureContext', { value: true });
    Object.defineProperty(w.navigator, 'serviceWorker', { value: { controller: {}, register: async (...args) => {
      registrationArgs = args; return { waiting: {}, addEventListener() {} };
    } } });
    w.eval(read('js/pwa.js')); await tick();
    assert.equal(registrationArgs[0], '/sw.js');
    assert.equal(registrationArgs[1].updateViaCache, 'none');
    assert.match(w.document.querySelector('#pwaUpdateNotice').textContent, /oynalarini yoping/);
    w.document.querySelector('#pwaUpdateNotice button').click();
    assert.equal(w.document.querySelector('#pwaUpdateNotice'), null);
    assert.doesNotMatch(read('js/pwa.js'), /location\.reload|skipWaiting|postMessage|controllerchange/);
  } finally { w.close(); }
});

domTest('standalone mode and unsupported service workers keep the website usable', () => {
  const w = dom({ standalone: true });
  try { w.eval(read('js/pwa.js')); assert.ok(w.document.documentElement.classList.contains('pwa-standalone')); }
  finally { w.close(); }
});
