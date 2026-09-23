import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
let JSDOM;
try { ({ JSDOM } = await import(process.env.ECLIPSE_JSDOM_PATH || 'jsdom')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const domTest = JSDOM ? test : (name, fn) => test(name, { skip: 'Set ECLIPSE_JSDOM_PATH.' }, fn);
const html = readFileSync(new URL('../meta-lab.html', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const catalog = [{ id: 1, name: 'Miya', roles: ['Marksman'], lanes: ['Gold'], skills: [], images: {} }];
const snapshot = data => ({ status: 'fresh', updatedAt: '2026-09-18T03:00:00Z', data });
function setup(fail = false) {
  const w = new JSDOM(html, { url: 'https://fixture.invalid/meta-lab', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  const calls = [], downloads = [], revoked = [];
  // Prove the public entry never reads existing admin credentials or team cache.
  Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('Private sessions must not be read'); } });
  Object.defineProperty(w, 'localStorage', { get() { throw new Error('Private data cache must not be read'); } });
  w.fetch = async (path, options) => {
    calls.push({ path, options });
    assert.equal(options?.headers?.Authorization, undefined);
    assert.equal(options?.method || 'GET', 'GET');
    const url = new URL(path, w.location.href);
    if (fail) return { ok: false, status: 503, json: async () => ({ error: 'Meta vaqtincha tayyor emas' }) };
    let data;
    if (url.pathname === '/api/mlbb-heroes') data = snapshot(url.searchParams.has('id') ? { ...catalog[0], skills: [{ name: 'Moon Arrow', description: 'Fixture skill' }], matchups: { rank: url.searchParams.get('rank'), days: 7 } } : catalog);
    else if (url.pathname === '/api/mlbb-meta') data = snapshot({ rank: url.searchParams.get('rank'), days: 7, eclipse: [{ heroId: 1, name: 'Miya', tier: 'A', eclipseRank: 1, officialRank: 1, eclipseScore: 75 }], official: [] });
    else if (url.pathname === '/api/mlbb-patches') data = snapshot([]);
    else if (url.pathname === '/api/mlbb-image') return { ok: true, blob: async () => new w.Blob(['fixture']) };
    else throw new Error(`Private or unexpected endpoint: ${path}`);
    return { ok: true, json: async () => data };
  };
  w.structuredClone = structuredClone;
  w.Image = class { async decode() {} };
  w.URL.createObjectURL = () => 'blob:public-png'; w.URL.revokeObjectURL = url => revoked.push(url);
  w.HTMLAnchorElement.prototype.click = function() { downloads.push(this.download); };
  for (const script of w.document.querySelectorAll('script[src]')) w.eval(readFileSync(new URL('..' + new URL(script.src).pathname, import.meta.url), 'utf8'));
  return { w, calls, downloads, revoked };
}
test('public entry contains only public readers and all its local dependencies exist', () => {
  assert.doesNotMatch(html, /js\/(?:app|auth|cloud|data|submissions|progress|batch|image-upload)\.js/);
  assert.doesNotMatch(html, /access-locked|admin-only|page-dashboard|page-players/);
  for (const match of html.matchAll(/(?:src|href)="(\/(?:js|css|assets)\/[^"?]+)(?:\?[^\"]*)?"/g)) assert.ok(existsSync(new URL('..' + match[1], import.meta.url)), match[1]);
  const routes = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url))).rewrites;
  assert.ok(routes.some(route => route.source === '/meta-lab' && route.destination === '/meta-lab.html'));
});
domTest('anonymous visitors load all rank views, dossier and PNG without private storage or API requests', async () => {
  const { w, calls, downloads, revoked } = setup();
  try {
    await tick();
    const root = w.document.getElementById('metaLabContainer');
    assert.ok(root.querySelector('.solar-tier-board'));
    assert.equal(root.querySelector('[data-meta-action="sync"]'), null);
    assert.equal(root.querySelectorAll('[data-meta-rank]').length, 4);
    for (const rank of ['epic', 'legend', 'mythic', 'glory']) {
      const selector = root.querySelector(`[data-meta-rank="${rank}"]`);
      assert.ok(selector, `${rank} picker exists`);
      selector.click(); await tick(); assert.equal(root.querySelector(`[data-meta-rank="${rank}"]`).getAttribute('aria-pressed'), 'true');
    }
    root.querySelector('[data-hero-id="1"]').click(); await tick();
    assert.match(w.document.querySelector('.meta-dossier').textContent, /Moon Arrow/);
    w.document.querySelector('[data-dossier-close]').click();
    assert.equal(w.document.querySelector('.meta-dossier'), null);
    // The existing PNG renderer is separately tested; here verify public fetch/auth and download flow.
    w.MlbbDataManager.prototype.drawTierPoster = () => ({ toBlob: callback => callback(new w.Blob(['png'])) });
    root.querySelector('[data-tier-export]').click(); await tick(); await tick();
    assert.equal(downloads.length, 1); assert.match(downloads[0], /^Eclipse-tier-/);
    assert.ok(calls.some(call => call.path.startsWith('/api/mlbb-image')));
    const before = revoked.length;
    w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: true }));
    assert.equal(revoked.length, before, 'Back/forward cache preserves the downloadable PNG');
    w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: false }));
    assert.equal(revoked.length, before + 1, 'Leaving permanently releases the PNG');
    assert.ok(calls.filter(call => !call.path.startsWith('/api/mlbb-image')).every(call => call.options.cache === 'default'));
    root.querySelector('[data-meta-view="patches"]').click(); assert.ok(root.textContent.includes('Patch radar kutilmoqda'));
  } finally { w.close(); }
});
domTest('public dataset failure has retry but never exposes login or admin sync', async () => {
  const { w } = setup(true);
  try {
    await tick();
    assert.ok(w.document.querySelector('[data-meta-action="retry"]'));
    assert.equal(w.document.querySelector('[data-meta-action="sync"]'), null);
    assert.match(w.document.querySelector('[role="alert"]').textContent, /Meta vaqtincha tayyor emas/);
  } finally { w.close(); }
});
domTest('private login and auth outage both offer public Meta Lab without unlocking the team app', () => {
  const w = new JSDOM('<main class="app-container"></main><div id="modalOverlay"><div id="modalContent"></div></div>', { url: 'https://fixture.invalid', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  try {
    w.eval(readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8'));
    const auth = new w.AuthManager({}); auth.lockViewerSurface();
    auth.showViewerLoginModal(null, { mandatory: true });
    assert.equal(w.document.querySelector('.public-meta-link').getAttribute('href'), '/meta-lab');
    assert.ok(w.document.querySelector('.app-container').hasAttribute('inert'));
    auth.showViewerUnavailableModal('Fixture outage');
    assert.equal(w.document.querySelector('.public-meta-link').getAttribute('href'), '/meta-lab');
    assert.equal(w.document.documentElement.dataset.viewerAccess, 'locked');
  } finally { w.close(); }
});
