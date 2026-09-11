import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Like scripts/ui-regression.test.mjs, DOM checks use an external development-only runtime.
let JSDOM;
try { ({ JSDOM } = await import(process.env.ECLIPSE_JSDOM_PATH || 'jsdom')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const domTest = JSDOM ? test : (name, fn) => test(name, { skip: 'Set ECLIPSE_JSDOM_PATH to run DOM regression checks.' }, fn);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const boxes = () => Array.from({ length: 5 }, (_, rowIndex) => ({ rowIndex, bounds: [220 + rowIndex * 120, 140, 310 + rowIndex * 120, 190] }));
const player = (sourceRow, matchedPlayerId = 'p1', extra = {}) => ({ sourceRow, matchedPlayerId, detectedName: matchedPlayerId === 'p1' ? 'Player' : 'Second', heroUsed: 'Wrong AI hero',
  portraitBox: { imageIndex: 0, bounds: [0, 0, 100, 100] }, rolePlayed: 'Roamer', kills: 1, deaths: 2, assists: 3, medal: 'gold', ...extra });

function setup() {
  const w = new JSDOM('<section class="page-section active"><div id="submissionContainer"></div></section>', { url: 'https://fixture.invalid', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  w.confirm = () => true; w.showToast = () => {};
  w.Image = class { constructor() { this.width = 1280; this.height = 576; } async decode() {} };
  w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,crop';
  const roster = [{ id: 'p1', name: 'Player' }, { id: 'p2', name: 'Second' }];
  const heroes = [{ id: 1, name: 'Miya' }, { id: 2, name: 'Moskov' }];
  const db = { getActivePlayers: () => roster, getPlayers: () => roster, getAllPlayers: () => roster, getMatches: () => [] };
  const auth = { isAdmin: () => false, getAccessToken: () => 'fixture-token' };
  const heroDb = { getAll: () => heroes, resolve: name => heroes.find(hero => hero.name === name) };
  for (const name of ['submissions', 'match-desk']) w.eval(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'));
  const desk = new w.SubmissionManager(auth, db, heroDb, {});
  desk.container = w.document.getElementById('submissionContainer'); desk.renderState();
  desk.images = ['data:image/jpeg;base64,scoreboard', 'data:image/jpeg;base64,damage'];
  desk.portraitMatcher = { references: [{ id: 1 }], async prepare() {}, async match() { return { automatic: true, loaded: 133, total: 133, candidates: [{ name: 'Miya', score: .99 }] }; } };
  w.EclipsePortraitLocator = { async locate() { return { boxes: boxes() }; } };
  return { w, desk, form: desk.container.querySelector('form') };
}

domTest('filtered roster rows use original sourceRow, never the filtered form index or AI portraitBox', async () => {
  const { w, desk } = setup();
  try {
    const attached = []; desk.attachPortrait = async (row, box, options) => attached.push({ row: row.dataset.sourceRow, box, options });
    await desk.applyOcrData({ players: [player(1, 'guest', { detectedName: 'Unknown guest' }), player(3), player(5, 'p2')] });
    assert.deepEqual(attached.map(item => [item.row, item.box.bounds[0]]), [['3', 460], ['5', 700]]);
    assert.ok(attached.every(item => item.options.automaticLocation && item.options.prepared));
    assert.ok([...desk.container.querySelectorAll('[data-field="heroUsed"]')].every(input => input.value === ''));
    assert.equal(desk.ocrExcludedRows, 1);
  } finally { w.close(); }
});

domTest('missing or duplicate sourceRow falls back to manual crop without catalog requests', async () => {
  for (const rows of [[player(null)], [player(3), player(3, 'p2')]]) {
    const { w, desk } = setup();
    try {
      desk.portraitMatcher.prepare = () => { throw new Error('Should not prepare'); };
      desk.attachPortrait = () => { throw new Error('No index-based crop allowed'); };
      await desk.applyOcrData({ players: rows });
      assert.match(desk.container.querySelector('[data-hero-status]').textContent, /qator aniq emas/);
      assert.ok(desk.container.querySelector('[data-crop-hero]'));
    } finally { w.close(); }
  }
});

domTest('unsupported first image tries the second, while partial layouts never produce crops', async () => {
  const { w, desk } = setup();
  try {
    let calls = 0, prepared = 0; const attached = [];
    desk.portraitMatcher.prepare = async () => { prepared++; };
    w.EclipsePortraitLocator.locate = async () => ({ boxes: ++calls === 1 ? boxes().slice(0, 4) : boxes() });
    desk.attachPortrait = async (_, box) => attached.push(box);
    await desk.applyOcrData({ players: [player(4)] });
    assert.equal(calls, 2); assert.equal(prepared, 1); assert.equal(attached[0].imageIndex, 1); assert.equal(attached[0].bounds[0], 580);
  } finally { w.close(); }
});

domTest('manual hero edit during reference loading is not replaced by localization', async () => {
  const { w, desk } = setup();
  try {
    const ready = deferred(); let attached = 0;
    desk.portraitMatcher.prepare = () => ready.promise;
    desk.attachPortrait = async () => { attached++; };
    const work = desk.applyOcrData({ players: [player(3)] });
    const input = desk.container.querySelector('[data-field="heroUsed"]'); input.value = 'Moskov'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
    ready.resolve(); await work;
    assert.equal(attached, 0); assert.equal(input.value, 'Moskov');
  } finally { w.close(); }
});

domTest('image replacement and form replacement discard pending portrait work', async () => {
  for (const replace of ['image', 'form']) {
    const { w, desk } = setup();
    try {
      const ready = deferred(); let attached = 0;
      desk.portraitMatcher.prepare = () => ready.promise; desk.attachPortrait = async () => { attached++; };
      const work = desk.applyOcrData({ players: [player(3)] });
      if (replace === 'image') desk.images[0] = 'data:image/jpeg;base64,replaced'; else desk.renderState();
      ready.resolve(); await work;
      assert.equal(attached, 0);
    } finally { w.close(); }
  }
});

domTest('even a near-identical match remains blank and pending until the user chooses', async () => {
  const { w, desk } = setup();
  try {
    await desk.applyOcrData({ players: [player(3)] });
    const row = desk.container.querySelector('.submission-player-row');
    assert.equal(row.querySelector('[data-field="heroUsed"]').value, ''); assert.equal(row.dataset.heroReview, 'pending');
    row.querySelector('[data-hero-candidates] button').click();
    assert.equal(row.querySelector('[data-field="heroUsed"]').value, 'Miya'); assert.equal(row.dataset.heroReview, 'confirmed');
    const saved = w.localStorage.getItem(desk.draftKey());
    assert.ok(!saved.includes('data:image')); assert.ok(!saved.includes('portraitCrop')); assert.ok(!saved.includes('ocrMeta'));
  } finally { w.close(); }
});

domTest('manual hero changes invalidate an in-flight match and its old candidate buttons', async () => {
  const { w, desk } = setup();
  try {
    const ready = deferred(); desk.portraitMatcher.match = () => ready.promise;
    const work = desk.applyOcrData({ players: [player(3)] });
    // Allow prepare, locate and image decode to reach the deferred matcher.
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const row = desk.container.querySelector('.submission-player-row');
    const input = row.querySelector('[data-field="heroUsed"]'); input.value = 'Moskov'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
    ready.resolve({ candidates: [{ name: 'Miya', score: .99 }], automatic: true, loaded: 1, total: 1 }); await work;
    assert.equal(input.value, 'Moskov'); assert.equal(row.querySelector('[data-hero-candidates]'), null);
  } finally { w.close(); }
});

domTest('medal review survives draft restore and blocks save until explicitly reviewed', async () => {
  const { w, desk, form } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(null)] });
    let row = form.querySelector('.submission-player-row'); row.querySelector('[data-field="heroUsed"]').value = 'Miya'; row.dataset.heroReview = 'confirmed';
    assert.throws(() => desk.collectDraft(), /medallarni tekshiring/);
    desk.restoreDraft(desk.rawDraft()); row = form.querySelector('.submission-player-row');
    assert.equal(row.dataset.medalReview, 'pending');
    row.querySelector('[data-confirm-medal]').click();
    assert.equal(row.dataset.medalReview, 'confirmed');
    assert.equal(desk.collectDraft().draft.playerStats[0].medal, 'gold');
  } finally { w.close(); }
});

domTest('duplicate MVP is rejected even after manual review', async () => {
  const { w, desk, form } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(null, 'p1', { medal: 'mvp' }), player(null, 'p2', { medal: 'mvp' })] });
    for (const row of form.querySelectorAll('.submission-player-row')) {
      row.querySelector('[data-field="heroUsed"]').value = 'Miya'; row.dataset.heroReview = 'confirmed'; row.dataset.medalReview = 'confirmed';
    }
    assert.throws(() => desk.collectDraft(), /faqat bitta MVP/);
  } finally { w.close(); }
});

domTest('OCR metadata is text-only and never part of the persisted draft', async () => {
  const { w, desk } = setup();
  try {
    w.fetch = async () => ({ ok: true, async json() { return { data: { players: [player(null)] }, ocrMeta: { model: '<img src=x onerror=alert(1)>', modelVersion: 'revision', durationMs: 1200, attempts: [{ model: 'first', status: 503, durationMs: 400 }] } }; } });
    await desk.scanImages();
    const meta = desk.container.querySelector('[data-ocr-meta]');
    assert.ok(meta); assert.equal(meta.querySelector('img'), null); assert.match(meta.textContent, /1.2s/); assert.match(meta.textContent, /first: 503/);
    assert.ok(!JSON.stringify(desk.rawDraft()).includes('modelVersion'));
  } finally { w.close(); }
});

domTest('navigating away aborts a pending OCR response without applying it after return', async () => {
  const { w, desk, form } = setup();
  try {
    const ready = deferred(); let signal;
    w.fetch = (_, options) => { signal = options.signal; return ready.promise; };
    const work = desk.scanImages(); const page = form.closest('.page-section');
    page.classList.remove('active'); await Promise.resolve(); page.classList.add('active');
    ready.resolve({ ok: true, async json() { return { data: { players: [player(3)] } }; } }); await work;
    assert.equal(signal.aborted, true); assert.equal(form.querySelector('[data-field="kills"]').value, '');
  } finally { w.close(); }
});

domTest('a manual field edit during the provider request is never replaced by its response', async () => {
  const { w, desk, form } = setup();
  try {
    const ready = deferred(); let signal;
    w.fetch = (_, options) => { signal = options.signal; return ready.promise; };
    const work = desk.scanImages();
    const kills = form.querySelector('[data-field="kills"]'); kills.value = '17'; kills.dispatchEvent(new w.Event('input', { bubbles: true }));
    ready.resolve({ ok: true, async json() { return { data: { players: [player(3)] } }; } }); await work;
    assert.equal(signal.aborted, true); assert.equal(kills.value, '17');
    assert.match(form.querySelector('#practiceScanStatus').textContent, /Forma o‘zgartirildi/);
  } finally { w.close(); }
});

domTest('an older base scan finishing cannot unlock the button owned by a newer scan', async () => {
  const { w, desk, form } = setup();
  try {
    const first = deferred(), second = deferred(); let calls = 0;
    w.fetch = () => ++calls === 1 ? first.promise : second.promise;
    const scan = Object.getPrototypeOf(Object.getPrototypeOf(desk)).scanImages;
    const a = scan.call(desk), b = scan.call(desk);
    first.resolve({ ok: true, async json() { return { data: { players: [player(null)] } }; } }); await a;
    assert.equal(form.querySelector('#practiceScanBtn').disabled, true);
    second.resolve({ ok: true, async json() { return { data: { players: [player(null)] } }; } }); await b;
    assert.equal(form.querySelector('#practiceScanBtn').disabled, false);
  } finally { w.close(); }
});
