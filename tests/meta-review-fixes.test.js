import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function setup({ fetchImpl, count = 134, confirm = true, fonts = Promise.resolve() } = {}) {
  const calls = [], downloads = [], posters = [], prompts = [], timers = new Map();
  let nextTimer = 0;
  const controls = [{ disabled: false }, { disabled: false }];
  const button = { disabled: false, textContent: 'PNG' }, cancel = { hidden: true };
  const status = { textContent: '', append() {} };
  const container = {
    querySelectorAll: () => [...controls, button],
    querySelector: selector => selector.includes('cancel') ? cancel : selector.includes('status') ? status : button
  };
  const document = { fonts: { ready: fonts }, body: { append() {} }, createElement: () => ({ click() { downloads.push(this.download); }, remove() {} }) };
  const context = vm.createContext({
    window: { confirm: message => { prompts.push(message); return confirm; }, showToast() {} }, document,
    console, AbortController, structuredClone,
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (...args) => { calls.push(args); return fetchImpl ? fetchImpl(...args) : { ok: true, blob: async () => ({}) }; },
    URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} },
    Image: class { async decode() {} }
  });
  for (const name of ['mlbb', 'tier-board']) vm.runInContext(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), context);
  const meta = new context.window.MlbbDataManager({ getAccessToken: () => 'fixture' }, {}, null, null);
  meta.container = container;
  meta.state.heroes = { data: [{ id: 1, name: 'New canonical name', images: { portrait: 'https://fixture.invalid/fresh.png' } }] };
  meta.state.meta = { updatedAt: '2026-09-09T00:00:00Z', data: { rank: 'epic', days: 7,
    eclipse: Array.from({ length: count }, (_, i) => ({ heroId: i + 1, name: `Hero ${i + 1}`, tier: 'A', eclipseRank: i + 1 })) } };
  meta.drawTierPoster = (rows, images, snapshot) => { posters.push({ rows, images, snapshot }); return { toBlob: callback => callback({}) }; };
  return { meta, context, calls, downloads, posters, prompts, timers, button, cancel, controls, status,
    fire(ms) { const task = [...timers.values()].find(timer => timer.ms === ms); assert.ok(task); task.fn(); } };
}

test('stale dossier keeps canonical identity and portrait without losing skills or rank counters', () => {
  const { meta } = setup();
  const detail = meta.mergeDossierDetail(1, { id: 1, name: 'Old name', image: 'old', images: { portrait: 'old', splash: 'splash' }, skills: [{ name: 'Passive' }], matchups: { rank: 'epic' } });
  assert.equal(detail.name, 'New canonical name');
  assert.equal(detail.images.portrait, 'https://fixture.invalid/fresh.png');
  assert.equal(detail.image, detail.images.portrait);
  assert.equal(detail.images.splash, 'splash');
  assert.equal(detail.skills[0].name, 'Passive');
  assert.equal(detail.matchups.rank, 'epic');
});

test('PNG broad outage stops early and fallback keeps all 134 hero labels and selected rank', async () => {
  const h = setup({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  await h.meta.exportTierPng(h.button);
  assert.ok(h.calls.length <= 24, `Too many requests: ${h.calls.length}`);
  assert.equal(h.posters[0].rows.length, 134);
  assert.equal(h.posters[0].images.size, 0);
  assert.equal(h.posters[0].snapshot.data.rank, 'epic');
  assert.match(h.downloads[0], /epic-7d/);
  assert.equal(h.prompts.length, 1);
  assert.equal(h.meta.exporting, false);
  assert.equal(h.button.disabled, false);
  assert.equal(h.cancel.hidden, true);
  assert.equal(h.timers.size, 0);
});

test('portrait 4xx responses are not retried and expired access stops the export queue', async () => {
  for (const status of [401, 403, 404, 429]) {
    const h = setup({ fetchImpl: async () => ({ ok: false, status }), count: 1 });
    await assert.rejects(h.meta.exportPortrait({ heroId: 1 }), error => error.status === status);
    assert.equal(h.calls.length, 1);
  }
  const h = setup({ fetchImpl: async () => ({ ok: false, status: 401 }), confirm: false });
  await h.meta.exportTierPng(h.button);
  assert.ok(h.calls.length <= 6);
  assert.equal(h.downloads.length, 0);
});

test('cancel during loading aborts requests and never creates a PNG', async () => {
  const h = setup({ fetchImpl: () => new Promise(() => {}) });
  const operation = h.meta.exportTierPng(h.button);
  await tick();
  assert.equal(h.cancel.hidden, false);
  h.meta.cancelTierExport();
  await operation;
  assert.equal(h.downloads.length, 0);
  assert.equal(h.posters.length, 0);
  assert.equal(h.prompts.length, 0);
  assert.ok(h.calls.every(([, options]) => options.signal.aborted));
  assert.equal(h.button.disabled, false);
  assert.equal(h.meta.exporting, false);
  assert.equal(h.timers.size, 0);
});

test('portrait deadline offers fallback, while total deadline releases a stuck font wait', async () => {
  const h = setup({ fetchImpl: () => new Promise(() => {}) });
  const operation = h.meta.exportTierPng(h.button);
  await tick(); h.fire(45000); await operation;
  assert.equal(h.posters[0].rows.length, 134);
  assert.equal(h.downloads.length, 1);
  assert.ok(h.calls.length <= 6);
  const stuck = setup({ fonts: new Promise(() => {}) });
  const waiting = stuck.meta.exportTierPng(stuck.button);
  stuck.fire(60000); await waiting;
  assert.equal(stuck.downloads.length, 0);
  assert.equal(stuck.meta.exporting, false);
  assert.equal(stuck.timers.size, 0);
});

test('successful PNG caches portraits and preserves the rank snapshot', async () => {
  const h = setup({ count: 3 });
  await h.meta.exportTierPng(h.button);
  assert.equal(h.posters[0].images.size, 3);
  assert.equal(h.calls.length, 3);
  await h.meta.exportTierPng(h.button);
  assert.equal(h.calls.length, 3);
  assert.equal(h.downloads.length, 2);
  assert.equal(h.prompts.length, 0);
});
