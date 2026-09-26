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
  const roster = [{ id: 'p1', name: 'Player', primaryRole: 'Gold Laner' }, { id: 'p2', name: 'Second', primaryRole: 'Roamer' }];
  const heroes = [{ id: 1, name: 'Miya', lanes: ['Gold Lane'] }, { id: 2, name: 'Moskov', lanes: ['Gold Lane'] }];
  const db = { getActivePlayers: () => roster, getPlayers: () => roster, getAllPlayers: () => roster, getMatches: () => [] };
  const auth = { isAdmin: () => false, getAccessToken: () => 'fixture-token' };
  const heroDb = { getAll: () => heroes, resolve: name => heroes.find(hero => hero.name === name) };
  for (const name of ['image-upload', 'submissions', 'match-desk']) w.eval(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'));
  const desk = new w.SubmissionManager(auth, db, heroDb, {});
  desk.container = w.document.getElementById('submissionContainer'); desk.renderState();
  desk.images = ['data:image/jpeg;base64,scoreboard', 'data:image/jpeg;base64,damage'];
  desk.portraitMatcher = { references: [{ id: 1 }], async prepare() {}, async match() { return { automatic: true, loaded: 133, total: 133, candidates: [{ name: 'Miya', score: .99 }] }; } };
  w.EclipsePortraitLocator = { async locate() { return { boxes: boxes() }; } };
  return { w, desk, roster, form: desk.container.querySelector('form') };
}

function uploads(w) {
  const readers = [], timers = new Map(); let timerId = 0;
  w.FileReader = class { readAsDataURL() { readers.push(this); } };
  w.setTimeout = fn => { timers.set(++timerId, fn); return timerId; };
  w.clearTimeout = id => timers.delete(id);
  return { readers, flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } };
}
const screenshot = name => ({ name, type: 'image/png', size: 1024 });
const finishRead = (reader, name) => reader.onload({ target: { result: `data:image/png;base64,${name}` } });

domTest('HEIC pair converts before a single auto-scan; stale conversion cannot replace a new image', async () => {
  const { w, desk } = setup();
  try {
    const upload = uploads(w), jobs = [], scans = [];
    w.EclipseImageUpload.toJpeg = (file, options) => { const job = deferred(); jobs.push({ ...job, file, ...options }); return job.promise; };
    desk.scanImages = () => scans.push([...desk.images]);
    const heic = name => ({ name, type: 'image/heic', size: 4000000 });
    desk.readImages([heic('score.heic'), heic('damage.heic')]);
    assert.equal(upload.readers.length, 0); assert.equal(jobs.length, 2);
    jobs[1].resolve(new w.Blob(['jpeg'], { type: 'image/jpeg' })); await Promise.resolve();
    finishRead(upload.readers[0], 'damage'); upload.flush(); assert.equal(scans.length, 0);
    jobs[0].resolve(new w.Blob(['jpeg'], { type: 'image/jpeg' })); await Promise.resolve();
    finishRead(upload.readers[1], 'score'); upload.flush(); assert.equal(scans.length, 1);
    assert.equal(desk.imageNames[0], 'score.heic');
    desk.readImage(heic('stale.heic'), 0);
    desk.readImage(screenshot('new.png'), 0);
    assert.equal(jobs[2].signal.aborted, true);
    jobs[2].resolve(new w.Blob(['jpeg'])); await Promise.resolve();
    assert.equal(upload.readers.length, 3);
    finishRead(upload.readers[2], 'new'); upload.flush();
    assert.deepEqual(scans[1], ['data:image/png;base64,new', null]);
  } finally { w.close(); }
});

domTest('scan steps follow actual work and explicit retry preserves screenshots and typed notes', async () => {
  const { w, desk, form } = setup();
  try {
    const pending = deferred(); w.fetch = () => pending.promise;
    const note = form.querySelector('textarea'); note.value = 'Keep my note';
    const originalImages = [...desk.images];
    const work = desk.scanImages();
    assert.equal(desk.container.querySelector('.submission-scan-steps [aria-current]').textContent, '2. AI o‘qishi');
    pending.resolve({ ok: false, async json() { return { error: 'Vaqtincha aloqa yo‘q' }; } }); await work;
    assert.equal(note.value, 'Keep my note'); assert.deepEqual([...desk.images], originalImages);
    assert.equal(desk.container.querySelector('.submission-scan-steps').dataset.state, 'error');
    const retry = desk.container.querySelector('[data-scan-retry]'); assert.ok(retry); assert.equal(retry.disabled, false);
    w.fetch = async () => ({ ok: true, async json() { return { data: { result: 'win', players: [player(3)] } }; } });
    const scan = desk.scanImages.bind(desk); let retried;
    desk.scanImages = () => (retried = scan()); retry.click(); await retried;
    assert.equal(desk.container.querySelector('[data-scan-retry]'), null);
    assert.equal(desk._scanStage, 'ready');
    assert.ok(['done', 'review'].includes(desk.container.querySelector('.submission-scan-steps').dataset.state));
    desk.invalidateOcrWork(); assert.equal(desk.container.querySelector('.submission-scan-steps').hidden, true);
  } finally { w.close(); }
});

domTest('HEIC failure blocks auto-scan and preserves existing typed fields', async () => {
  const { w, desk, form } = setup();
  try {
    const upload = uploads(w); let scanned = false;
    desk.scanImages = () => { scanned = true; };
    w.EclipseImageUpload.toJpeg = async () => { throw new Error('HEIC buzilgan.'); };
    form.querySelector('[data-field="kills"]').value = '7';
    desk.readImage({ name: 'bad.HEIF', type: '', size: 100 }, 0);
    await Promise.resolve(); await Promise.resolve(); upload.flush();
    assert.equal(scanned, false); assert.equal(desk._imageReadFailed[0], true);
    assert.equal(form.querySelector('[data-field="kills"]').value, '7');
    assert.match(form.querySelector('#practiceScanStatus').textContent, /HEIC buzilgan/);
  } finally { w.close(); }
});

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

domTest('OCR plus valid local matches is immediately submit-ready without confirmation or edits', async () => {
  const { w, desk } = setup();
  try {
    desk.portraitMatcher.match = async () => ({ automatic: false, loaded: 133, total: 133, candidates: [{ name: 'Wrong AI hero', score: .99 }, { name: 'Miya', score: .91 }, { name: 'Moskov', score: .88 }] });
    w.fetch = async () => ({ ok: true, async json() { return { data: { result: 'win', players: [player(3)] } }; } });
    await desk.scanImages();
    const row = desk.container.querySelector('.submission-player-row');
    assert.equal(row.querySelector('[data-field="heroUsed"]').value, 'Miya'); assert.equal(row.dataset.heroSource, 'portrait');
    assert.equal(desk.collectDraft().draft.playerStats[0].heroUsed, 'Miya');
    assert.equal(desk.collectDraft().draft.playerStats[0].medal, 'gold');
    assert.equal(desk.collectDraft().claimedPlayerId, 'p1');
    assert.equal(row.querySelector('[data-confirm-hero], [data-confirm-medal]'), null);
    assert.equal(row.querySelector('[data-hero-corrections]').open, false);
    assert.doesNotMatch(row.querySelector('[data-hero-candidates]').textContent, /%/);
    assert.match(desk.container.querySelector('#practiceScanStatus').textContent, /Yuborishga tayyor/);
    assert.equal(desk.container.querySelector('[data-scan-summary]').dataset.detailsOpen, 'false');
    assert.match(desk.container.querySelector('[data-scan-overview]').textContent, /Sana:.*Tur:.*formadagi tanlov/);
    const saved = w.localStorage.getItem(desk.draftKey());
    assert.ok(!saved.includes('data:image')); assert.ok(!saved.includes('portraitCrop')); assert.ok(!saved.includes('ocrMeta'));
    assert.ok(!saved.includes('heroReviewRequired')); assert.ok(!saved.includes('medalReviewRequired'));
    assert.equal(desk.collectDraft().draft.playerStats[0].heroSource, undefined);
  } finally { w.close(); }
});

domTest('optional edits accept another candidate or a manual hero immediately', async () => {
  const { w, desk, form } = setup();
  try {
    desk.portraitMatcher.match = async () => ({ candidates: [{ name: 'Miya', score: .95 }, { name: 'Moskov', score: .92 }] });
    await desk.applyOcrData({ result: 'win', players: [player(3)] });
    form.querySelector('[data-scan-summary] button').click();
    assert.equal(form.querySelector('[data-scan-summary]').dataset.detailsOpen, 'true');
    const row = form.querySelector('.submission-player-row');
    row.querySelector('[data-hero-corrections]').open = true;
    row.querySelectorAll('[data-hero-candidates] button')[1].click();
    assert.equal(desk.collectDraft().draft.playerStats[0].heroUsed, 'Moskov');
    assert.equal(row.dataset.heroSource, 'manual');
    const input = row.querySelector('[data-field="heroUsed"]'); input.value = 'Miya'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(desk.collectDraft().draft.playerStats[0].heroUsed, 'Miya');
    assert.match(row.querySelector('[data-hero-status]').textContent, /Qo‘lda tanlandi/);
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

domTest('restored automatic drafts and legacy review flags never require confirmation', async () => {
  const { w, desk, form } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(3)] });
    const saved = desk.rawDraft(); saved.playerStats[0].heroReviewRequired = true; saved.playerStats[0].medalReviewRequired = true;
    desk.restoreDraft(saved);
    assert.equal(form.querySelector('[data-confirm-hero], [data-confirm-medal]'), null);
    assert.equal(desk.collectDraft().draft.playerStats[0].heroUsed, 'Miya');
    assert.equal(desk.collectDraft().draft.playerStats[0].medal, 'gold');
    assert.equal(form.querySelector('.submission-player-row').dataset.heroSource, 'portrait');
  } finally { w.close(); }
});

domTest('duplicate MVP still blocks submission and opens its editable fields', async () => {
  const { w, desk, form } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { medal: 'mvp' }), player(5, 'p2', { medal: 'mvp' })] });
    assert.throws(() => desk.collectDraft(), /faqat bitta MVP/);
    assert.notEqual(form.querySelector('#practicePlayerRows').style.display, 'none');
  } finally { w.close(); }
});

domTest('roles use catalog lanes with roster roles, never a blind primary-role default', async () => {
  const { w, desk, form, roster } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { rolePlayed: null })] });
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, 'Gold Laner');
    assert.equal(desk.collectDraft().draft.playerStats[0].roleSource, 'inferred');
    assert.match(form.querySelector('[data-role-status]').textContent, /Taxmin/);
    assert.match(form.querySelector('[data-scan-summary]').textContent, /Taxmin/);
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { rolePlayed: 'Roamer' })] });
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, 'Roamer');
    assert.match(form.querySelector('[data-role-status]').textContent, /Skrinshotdan/);
    delete roster[0].primaryRole;
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { rolePlayed: 'Marksman' })] });
    assert.equal(form.querySelector('[data-field="rolePlayed"]').value, 'Gold Laner');
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, 'Gold Laner');
    assert.equal(desk.collectDraft().draft.playerStats[0].roleSource, 'inferred');
    assert.match(form.querySelector('[data-scan-summary]').textContent, /heroning yagona layni/);
  } finally { w.close(); }
});

domTest('an unreadable hero stays unresolved with a clear correction path', async () => {
  const { w, desk, form } = setup();
  try {
    desk.portraitMatcher.match = async () => ({ candidates: [{ name: 'Invented hero', score: .999 }] });
    await desk.applyOcrData({ result: 'win', players: [player(3)] });
    assert.equal(form.querySelector('[data-field="heroUsed"]').value, '');
    assert.match(form.querySelector('[data-hero-status]').textContent, /Tiniqroq skrinshot/);
    assert.throws(() => desk.collectDraft(), /Qahramon aniqlanmadi/);
    assert.equal(form.querySelector('[data-scan-summary]'), null);
  } finally { w.close(); }
});

domTest('lane selection prefers compatible primary, then secondary, then a unique hero lane', async () => {
  const { w, desk, roster } = setup();
  try {
    roster[0].primaryRole = 'Roamer'; roster[0].secondaryRole = 'Gold Laner';
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { rolePlayed: null })] });
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, 'Gold Laner');
    const hero = desk.heroDb.resolve('Miya');
    hero.lanes = ['Gold Lane', 'Roam'];
    const row = desk.container.querySelector('.submission-player-row'); desk.heroPreview(row);
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, 'Roamer');
    hero.lanes = ['Jungle']; desk.heroPreview(row);
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, 'Jungler');
    assert.match(row.querySelector('[data-role-status]').textContent, /roldan tashqari/);
    hero.lanes = ['Jungle', 'EXP Lane']; desk.heroPreview(row);
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, '');
    assert.match(row.querySelector('[data-role-status]').textContent, /mos emas/);
    hero.lanes = []; hero.role = 'Marksman'; desk.heroPreview(row);
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, '');
    // A class label must never substitute for lane metadata.
  } finally { w.close(); }
});

domTest('provider aliases normalize without turning hero classes into lanes', () => {
  const { w } = setup();
  try {
    const suggest = w.SubmissionManager.roleSuggestion;
    assert.equal(suggest({ lanes: [' Roaming '] }, { primaryRole: 'Roamer' }).role, 'Roamer');
    assert.equal(suggest({ lanes: ['Gold   Lane'] }, { primaryRole: 'Roamer', secondaryRole: 'Gold Laner' }).role, 'Gold Laner');
    assert.equal(suggest({ lanes: [], role: 'Marksman', roles: ['Assassin'] }, { primaryRole: 'Roamer' }).role, '');
    assert.equal(suggest(null, { primaryRole: 'Roamer' }).role, '');
  } finally { w.close(); }
});

domTest('OCR fills missing catalog lanes from selected hero details before finishing', async () => {
  const { w, desk, roster } = setup();
  try {
    desk.heroDb.resolve('Miya').lanes = [];
    roster[0].primaryRole = 'Roamer'; roster[0].secondaryRole = 'Gold Laner';
    let calls = 0;
    w.fetch = async (url, options) => {
      calls++; assert.equal(url, '/api/mlbb-heroes?id=1&rank=mythic&days=7');
      assert.equal(options.credentials, 'omit'); assert.equal(options.headers, undefined);
      return { ok: true, json: async () => ({ data: { id: 1, lanes: ['Gold Lane'] } }) };
    };
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { rolePlayed: null })] });
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, 'Gold Laner');
    assert.equal(desk.collectDraft().draft.playerStats[0].roleSource, 'inferred');
    assert.match(desk.container.querySelector('[data-scan-summary]').textContent, /Gold Laner/);
    desk.heroPreview(desk.container.querySelector('.submission-player-row'));
    assert.equal(calls, 1);
  } finally { w.close(); }
});

domTest('late lane metadata preserves manual corrections and never overwrites a changed hero', async () => {
  const { w, desk } = setup();
  try {
    desk.heroDb.resolve('Miya').lanes = [];
    const jobs = []; w.fetch = () => { const job = deferred(); jobs.push(job); return job.promise; };
    desk.addParticipantRow({ playerId: 'p1', heroUsed: 'Miya' });
    const row = desk.container.querySelector('#practicePlayerRows').lastElementChild;
    const role = row.querySelector('[data-field="rolePlayed"]');
    role.value = 'Roamer'; role.dispatchEvent(new w.Event('change', { bubbles: true }));
    jobs[0].resolve({ ok: true, json: async () => ({ data: { id: 1, lanes: ['Gold Lane'] } }) });
    await row._roleLookupPromise;
    assert.equal(role.value, 'Roamer'); assert.equal(row.dataset.roleSource, 'manual');

    desk._roleMetadata.clear();
    row.dataset.roleSource = 'unknown'; desk.heroPreview(row);
    const pending = row._roleLookupPromise;
    const hero = row.querySelector('[data-field="heroUsed"]'); hero.value = 'Moskov';
    desk.heroDb.resolve('Moskov').lanes = ['Jungle'];
    hero.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal(role.value, 'Jungler');
    jobs[1].resolve({ ok: true, json: async () => ({ data: { id: 1, lanes: ['Gold Lane'] } }) });
    await pending;
    assert.equal(role.value, 'Jungler');
  } finally { w.close(); }
});

domTest('missing or mismatched detail metadata remains unknown without repeated requests', async () => {
  for (const response of [{ ok: false }, { ok: true, json: async () => ({ data: { id: 2, lanes: ['Gold Lane'] } }) }]) {
    const { w, desk } = setup();
    try {
      desk.heroDb.resolve('Miya').lanes = [];
      let calls = 0; w.fetch = async () => { calls++; return response; };
      await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { rolePlayed: null })] });
      const row = desk.container.querySelector('.submission-player-row'); desk.heroPreview(row);
      assert.equal(calls, 1);
      assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, '');
      assert.equal(row._roleLoading, false);
    } finally { w.close(); }
  }
});

domTest('lane lookup has a bounded timeout and cannot prevent finishing OCR', async () => {
  const { w, desk } = setup();
  try {
    desk.heroDb.resolve('Miya').lanes = [];
    let signal;
    w.fetch = (_, options) => { signal = options.signal; return new Promise(() => {}); };
    const schedule = w.setTimeout.bind(w);
    w.setTimeout = (fn, ms, ...args) => schedule(fn, ms === 8000 ? 0 : ms, ...args);
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { rolePlayed: null })] });
    assert.equal(signal.aborted, true);
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, '');
  } finally { w.close(); }
});

domTest('submit waits for pending lane inference and serializes the inferred role', async () => {
  const { w, desk } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { rolePlayed: null })] });
    desk.heroDb.resolve('Miya').lanes = [];
    const pending = deferred(); w.fetch = () => pending.promise;
    const row = desk.container.querySelector('.submission-player-row'); desk.heroPreview(row);
    const writes = [];
    desk.request = async (method, body) => { writes.push(body); return {}; };
    desk.render = async () => {};
    const submit = desk.submitForm({ preventDefault() {} });
    assert.equal(writes.length, 0);
    pending.resolve({ ok: true, json: async () => ({ data: { id: 1, lanes: ['Gold Lane'] } }) });
    await submit;
    assert.equal(writes.length, 1);
    assert.equal(writes[0].draft.playerStats[0].rolePlayed, 'Gold Laner');
    assert.equal(writes[0].draft.playerStats[0].roleSource, 'inferred');
  } finally { w.close(); }
});

domTest('manual role corrections and deliberately unknown roles survive portrait completion', async () => {
  const { w, desk } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { rolePlayed: null })] });
    const row = desk.container.querySelector('.submission-player-row'), select = row.querySelector('[data-field="rolePlayed"]');
    select.value = 'Roamer'; select.dispatchEvent(new w.Event('change', { bubbles: true }));
    desk.heroPreview(row);
    assert.equal(desk.collectDraft().draft.playerStats[0].rolePlayed, 'Roamer');
    assert.match(row.querySelector('[data-role-status]').textContent, /captain tekshirsin/);
    select.value = ''; select.dispatchEvent(new w.Event('change', { bubbles: true }));
    desk.heroPreview(row);
    assert.equal(select.value, '');
    assert.equal(select.required, false);
  } finally { w.close(); }
});

domTest('history edits preserve old roles and mark unknown provenance for review', () => {
  const { w, desk } = setup();
  try {
    desk.editingMatch = { id: 'old-match' };
    desk.addParticipantRow({ playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Roamer' });
    const row = desk.container.querySelector('#practicePlayerRows').lastElementChild;
    desk.heroPreview(row);
    assert.equal(row.querySelector('[data-field="rolePlayed"]').value, 'Roamer');
    assert.match(row.querySelector('[data-role-status]').textContent, /Oldingi rol/);
  } finally { w.close(); }
});

domTest('an unreadable result in a new scan never reuses the previous match result', async () => {
  const { w, desk, form } = setup();
  try {
    await desk.applyOcrData({ result: 'win', durationFormatted: '12:00', players: [player(3)] });
    assert.equal(desk.collectDraft().draft.result, 'win');
    await desk.applyOcrData({ result: null, players: [player(3)] });
    assert.equal(form.querySelector('[name="practice-result"]:checked'), null);
    assert.equal(form.querySelector('#practiceDuration').value, '');
    assert.throws(() => desk.collectDraft(), /maydonlarni tekshiring/);
    assert.notEqual(form.querySelector('.submission-result-fieldset').style.display, 'none');
  } finally { w.close(); }
});

domTest('highest score never fabricates an MVP when the medal is unknown', async () => {
  const { w, desk } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(3, 'p1', { medal: null, inGameScore: 19.9 })] });
    assert.equal(desk.collectDraft().draft.playerStats[0].medal, null);
  } finally { w.close(); }
});

domTest('two screenshot reads coalesce into one automatic scan and require no input to submit', async () => {
  const { w, desk, form } = setup();
  try {
    const upload = uploads(w), scans = [], requests = []; desk.images = [null, null];
    const scan = desk.scanImages.bind(desk); desk.scanImages = options => { const work = scan(options); scans.push(work); return work; };
    w.fetch = async (_, options) => { requests.push(JSON.parse(options.body)); return { ok: true, async json() { return { data: { result: 'win', players: [player(3)] } }; } }; };
    desk.readImages([screenshot('scoreboard.png'), screenshot('damage.png')]);
    finishRead(upload.readers[1], 'damage'); upload.flush();
    assert.equal(requests.length, 0);
    finishRead(upload.readers[0], 'scoreboard'); upload.flush();
    assert.equal(requests.length, 1); await scans[0];
    assert.deepEqual(requests[0].images, ['data:image/png;base64,scoreboard', 'data:image/png;base64,damage']);
    assert.equal(desk.collectDraft().draft.playerStats[0].heroUsed, 'Miya');
    assert.equal(form.querySelector('[data-file-index="0"]').multiple, true);
  } finally { w.close(); }
});

domTest('replacing a primary screenshot alone clears stale damage and its pending read', () => {
  const { w, desk, form } = setup();
  try {
    const upload = uploads(w), scans = [];
    desk.scanImages = () => { scans.push([...desk.images]); };
    desk.readImage(screenshot('old-damage.png'), 1);
    desk.readImage(screenshot('new-scoreboard.png'), 0);
    assert.equal(desk.images[1], null); assert.equal(desk.imageNames[1], '');
    assert.equal(form.querySelector('[data-drop-index="1"] .submission-dropzone__preview').hidden, true);
    assert.equal(form.querySelector('[data-drop-index="1"] img').getAttribute('src'), '');
    finishRead(upload.readers[0], 'late-old-damage');
    assert.equal(desk.images[1], null);
    finishRead(upload.readers[1], 'new-scoreboard'); upload.flush();
    assert.deepEqual(scans, [['data:image/png;base64,new-scoreboard', null]]);
  } finally { w.close(); }
});

domTest('a first primary screenshot preserves damage selected before it', () => {
  const { w, desk } = setup();
  try {
    const upload = uploads(w), scans = [];
    desk.images = [null, 'data:image/png;base64,damage-first'];
    desk.scanImages = () => { scans.push([...desk.images]); };
    desk.readImage(screenshot('scoreboard.png'), 0); finishRead(upload.readers[0], 'scoreboard'); upload.flush();
    assert.deepEqual(scans, [['data:image/png;base64,scoreboard', 'data:image/png;base64,damage-first']]);
  } finally { w.close(); }
});

domTest('a two-file replacement retains the new secondary and scans only the new pair', () => {
  const { w, desk } = setup();
  try {
    const upload = uploads(w), scans = [];
    desk.scanImages = () => { scans.push([...desk.images]); };
    desk.readImages([screenshot('new-scoreboard.png'), screenshot('new-damage.png')]);
    finishRead(upload.readers[1], 'new-damage'); upload.flush(); assert.equal(scans.length, 0);
    finishRead(upload.readers[0], 'new-scoreboard'); upload.flush();
    assert.deepEqual(scans, [['data:image/png;base64,new-scoreboard', 'data:image/png;base64,new-damage']]);
  } finally { w.close(); }
});

domTest('a replacement removes the old ready summary immediately and read failure preserves manual fields', async () => {
  const { w, desk, form } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(3)] });
    const kills = form.querySelector('[data-field="kills"]'); kills.value = '17'; kills.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.ok(form.querySelector('[data-scan-summary]'));
    const upload = uploads(w); let scans = 0; desk.scanImages = () => { scans++; };
    desk.readImage(screenshot('unreadable.png'), 0);
    assert.equal(form.querySelector('[data-scan-summary]'), null);
    assert.notEqual(form.querySelector('#practicePlayerRows').style.display, 'none');
    assert.doesNotMatch(form.querySelector('#practiceScanStatus').textContent, /Yuborishga tayyor/);
    upload.readers[0].onerror(); upload.flush();
    assert.equal(scans, 0); assert.equal(kills.value, '17');
    assert.equal(desk.images[0], null); assert.equal(desk.images[1], null);
    assert.match(form.querySelector('#practiceScanStatus').textContent, /Rasm ochilmadi/);
    assert.equal(form.querySelector('[data-scan-summary]'), null);
  } finally { w.close(); }
});

domTest('a failed new scan cannot display the previous screenshot as ready', async () => {
  const { w, desk, form } = setup();
  try {
    await desk.applyOcrData({ result: 'win', players: [player(3)] });
    const upload = uploads(w), scans = [];
    const scan = desk.scanImages.bind(desk); desk.scanImages = options => { const work = scan(options); scans.push(work); return work; };
    w.fetch = async () => ({ ok: false, async json() { return { error: 'Rasm o‘qilmadi' }; } });
    desk.readImage(screenshot('unreadable.png'), 0); finishRead(upload.readers[0], 'unreadable');
    assert.equal(form.querySelector('[data-scan-summary]'), null);
    upload.flush(); await scans[0];
    assert.equal(form.querySelector('[data-scan-summary]'), null);
    assert.doesNotMatch(form.querySelector('#practiceScanStatus').textContent, /Yuborishga tayyor/);
    assert.equal(form.querySelector('[data-field="kills"]').value, '1');
  } finally { w.close(); }
});

domTest('a new image during scanning aborts stale work and starts exactly one latest scan', async () => {
  const { w, desk, form } = setup();
  try {
    const upload = uploads(w), first = deferred(), second = deferred(), scans = [], requests = []; desk.images = [null, null];
    const scan = desk.scanImages.bind(desk); desk.scanImages = options => { const work = scan(options); scans.push(work); return work; };
    w.fetch = (_, options) => { requests.push(options); return requests.length === 1 ? first.promise : second.promise; };
    desk.readImage(screenshot('scoreboard.png'), 0); finishRead(upload.readers[0], 'scoreboard'); upload.flush();
    assert.equal(requests.length, 1); assert.equal(desk.scanning, true);
    assert.equal(form.querySelector('[data-file-index="1"]').disabled, false);
    assert.equal(form.querySelector('[data-select-index="1"]').disabled, false);
    desk.readImage(screenshot('damage.png'), 1); finishRead(upload.readers[1], 'damage'); upload.flush();
    assert.equal(requests[0].signal.aborted, true); assert.equal(requests.length, 1);
    desk.readImage(screenshot('better-damage.png'), 1); finishRead(upload.readers[2], 'better-damage'); upload.flush();
    first.resolve({ ok: true, async json() { return { data: { result: 'loss', players: [player(3, 'p1', { kills: 88 })] } }; } }); await scans[0];
    assert.equal(requests.length, 2);
    assert.deepEqual(JSON.parse(requests[1].body).images, ['data:image/png;base64,scoreboard', 'data:image/png;base64,better-damage']);
    second.resolve({ ok: true, async json() { return { data: { result: 'win', players: [player(3)] } }; } }); await scans[1];
    assert.equal(desk.collectDraft().draft.playerStats[0].kills, '1');
    upload.flush(); assert.equal(requests.length, 2);
  } finally { w.close(); }
});

domTest('automatic uploads preserve a manually edited form and cancel queued processing', async () => {
  const { w, desk, form } = setup();
  try {
    const upload = uploads(w); let scans = 0; desk.scanImages = () => { scans++; };
    desk.readImage(screenshot('scoreboard.png'), 0); finishRead(upload.readers[0], 'scoreboard');
    const kills = form.querySelector('[data-field="kills"]'); kills.value = '17'; kills.dispatchEvent(new w.Event('input', { bubbles: true }));
    upload.flush(); assert.equal(scans, 0);
    desk.readImage(screenshot('damage.png'), 1); finishRead(upload.readers[1], 'damage'); upload.flush();
    assert.equal(scans, 0); assert.equal(kills.value, '17');
    assert.match(form.querySelector('#practiceScanStatus').textContent, /tuzatishlaringiz saqlandi/);
  } finally { w.close(); }
});

domTest('detail montage is optional, shares the abort signal, and preserves the original pair', async () => {
  const { w, desk } = setup();
  try {
    let signals, sent;
    w.EclipseScanDetails = { async create(images, options) { signals = options.signal; assert.deepEqual([...images], [...desk.images]); return 'data:image/jpeg;base64,details'; } };
    w.fetch = async (_, options) => { sent = JSON.parse(options.body); assert.equal(options.signal, signals); return { ok: true, async json() { return { data: { result: 'win', players: [player(3)] } }; } }; };
    await desk.scanImages();
    assert.equal(sent.detailImage, 'data:image/jpeg;base64,details'); assert.deepEqual(sent.images, [...desk.images]);
    w.EclipseScanDetails.create = async () => { throw new Error('Canvas unavailable'); };
    w.fetch = async (_, options) => { sent = JSON.parse(options.body); return { ok: true, async json() { return { data: { result: 'win', players: [player(3)] } }; } }; };
    await desk.scanImages(); assert.equal(sent.detailImage, undefined); assert.equal(desk.collectDraft().draft.playerStats[0].heroUsed, 'Miya');
  } finally { w.close(); }
});

domTest('a stale candidate cannot overwrite a later manual choice or player mapping', async () => {
  for (const field of ['heroUsed', 'playerId']) {
    const { w, desk, form } = setup();
    try {
      await desk.applyOcrData({ result: 'win', players: [player(3)] });
      const oldCandidate = form.querySelector('[data-hero-candidates] button');
      const input = form.querySelector(`[data-field="${field}"]`); input.value = field === 'heroUsed' ? 'Moskov' : 'p2';
      input.dispatchEvent(new w.Event('change', { bubbles: true })); oldCandidate.click();
      assert.equal(input.value, field === 'heroUsed' ? 'Moskov' : 'p2');
      assert.equal(form.querySelector('[data-hero-candidates]'), null);
    } finally { w.close(); }
  }
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
