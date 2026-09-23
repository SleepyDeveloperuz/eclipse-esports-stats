import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as model from '../js/progress-model.js';
import { groupBatchFiles } from '../js/batch-model.js';
let JSDOM;
try { ({ JSDOM } = await import(process.env.ECLIPSE_JSDOM_PATH || 'jsdom')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
const domTest = JSDOM ? test : (name, fn) => test(name, { skip: 'Set ECLIPSE_JSDOM_PATH.' }, fn);
function setup(admin = true) {
  const w = new JSDOM('<section class="page-section active"><div id="progressContainer"></div><div id="batchContainer"></div></section>', { url: 'https://fixture.invalid', runScripts: 'outside-only' }).window;
  w.confirm = () => true; w.showToast = () => {}; Object.assign(w, model, { groupBatchFiles });
  w.Image = class { constructor() { this.width = 1280; this.height = 576; } async decode() {} };
  w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,crop';
  for (const file of ['image-upload', 'submissions', 'match-desk', 'progress', 'batch']) {
    const script = readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/export (class|function|async function)/g, '$1'); w.eval(script);
  }
  const players = [{ id: 'p1', name: 'Player <script>', primaryRole: 'Gold Laner' }], heroes = [{ id: 1, name: 'Miya' }];
  const row = { playerId: 'p1', heroId: 1, heroUsed: 'Miya', rolePlayed: 'Gold Laner', kills: 5, deaths: 2, assists: 3, inGameScore: 8, damageDealt: 60000, medal: 'gold' };
  const data = { revision: 1, players, heroes, matches: [{ id: 'm1', date: '2026-09-16', scope: 'individual', result: 'win', matchType: 'ranked', durationSeconds: 600, playerStats: [row] }] };
  const app = { authManager: { isAdmin: () => admin, getAccessToken: () => 'fixture', getToken: () => 'fixture' },
    dataStore: { getPlayers: () => players, getAllPlayers: () => players, getActivePlayers: () => players, getMatches: () => data.matches },
    heroDb: { getAll: () => heroes, resolve: name => heroes.find(h => h.name === name) }, cloudSync: { getStatus: () => ({ pending: false }), async syncDown() {} } };
  return { w, app, data, row };
}
domTest('Batch converts HEIF before creating its preview and sends no raw HEIF', async () => {
  const { w, app } = setup();
  try {
    const jpeg = new w.Blob(['jpeg'], { type: 'image/jpeg' }); let converted = 0, revoked = 0;
    w.EclipseImageUpload.toJpeg = async () => { converted++; return jpeg; };
    w.URL.createObjectURL = blob => { assert.equal(blob, jpeg); return 'blob:converted'; };
    w.URL.revokeObjectURL = () => { revoked++; };
    const batch = new w.BatchUpload(app); batch.render();
    assert.match(batch.container.querySelector('#batchFiles').accept, /\.heic/);
    assert.match(await batch.imageData({ name: 'photo.HEIF', type: '', size: 100 }), /^data:image\/jpeg;/);
    assert.equal(converted, 1); assert.equal(revoked, 1);
  } finally { w.close(); }
});
domTest('Progress all tabs render with escaped names, viewer has no correction or publish controls', () => {
  for (const admin of [true, false]) {
    const { w, app, data } = setup(admin);
    try {
      const hub = new w.ProgressHub(app); hub.container = w.document.getElementById('progressContainer'); hub.data = data; hub.date = '2026-09-16'; hub.scope = 'squad'; hub.playerId = 'p1'; hub.hero = 'Miya';
      hub.reports = [{ ...model.weeklyReport(data, hub.date, hub.scope), id: '2026-09-14_squad', publishedAt: '2026-09-16T00:00:00Z' }];
      hub.history = { entries: [], revision: 1 };
      for (const tab of ['weekly', 'compare', 'journey', 'moments', 'history']) { hub.tab = tab; hub.draw(); assert.ok(hub.container.textContent.length > 100); assert.equal(hub.container.querySelectorAll('script').length, 0); }
      if (!admin) { assert.equal(hub.container.querySelector('[data-progress-tab="history"]'), null); assert.equal(hub.container.querySelector('[data-progress-action="publish"]'), null); }
    } finally { w.close(); }
  }
});
domTest('Weekly and Moment PNG exports create bounded downloadable canvases without remote writes', async () => {
  const { w, app, data, row } = setup(false);
  try {
    const drawings = [], exports = [];
    w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, createRadialGradient: () => ({ addColorStop() {} }), beginPath() {}, arc() {}, stroke() {}, fill() {}, fillText(text, x, y) { drawings.push({ text, x, y }); } });
    w.HTMLCanvasElement.prototype.toBlob = function(callback) { assert.equal(this.width, 1400); assert.ok(this.height >= 760); assert.ok(drawings.every(d => d.y < this.height)); callback(new w.Blob(['png'])); };
    w.URL.createObjectURL = () => 'blob:fixture'; w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function() { exports.push(this.download); };
    w.fetch = async () => { throw new Error('portrait unavailable'); };
    const hub = new w.ProgressHub(app); hub.container = w.document.getElementById('progressContainer'); hub.data = data; hub.scope = 'squad'; hub.playerId = 'p1'; hub.shownReport = model.weeklyReport(data, '2026-09-16', 'squad');
    await hub.action('weekly-png'); assert.ok(drawings.some(d => d.text.includes('PUBLISHED')));
    drawings.length = 0; hub.momentList = [{ match: data.matches[0], row, reasons: ['MVP'] }]; await hub.action('moment-0');
    assert.equal(exports.length, 2); assert.ok(exports[0].startsWith('eclipse-weekly-squad')); assert.ok(exports[1].startsWith('eclipse-moment'));
  } finally { w.close(); }
});
domTest('Batch uses the full existing form, keeps drafts out of localStorage, and submits only once', async () => {
  const { w, app, row } = setup();
  try {
    const batch = new w.BatchUpload(app); batch.render();
    const group = { battleId: '950914999598100774', score: { index: 0 }, damage: { index: 1 }, date: '2026-09-16', result: 'win' };
    batch.addItem(group, ['data:image/jpeg;base64,one', 'data:image/jpeg;base64,two'], [{ name: 'score.jpg' }, { name: 'damage.jpg' }], '2026-09-16', 'ranked');
    const item = batch.items[0], worker = item.worker;
    worker.restoreDraft({ source: 'ocr', playerStats: [row], result: 'win', fields: { practiceSubmitter: 'admin', practiceDate: '2026-09-16', practiceMatchType: 'ranked', practiceDuration: '10:00' } });
    assert.ok(worker.container.querySelector('[data-field="damageDealt"]')); worker.saveDraft(); assert.equal(w.localStorage.length, 0);
    item.state = 'ready'; let writes = 0;
    worker.request = async (method, body) => { writes++; assert.equal(method, 'POST'); assert.equal(body.draft.sourceBattleId, group.battleId); assert.equal(Number(body.draft.playerStats[0].damageDealt), 60000); return { match: { id: 'new' } }; };
    await batch.send(batch.generation); await batch.send(batch.generation);
    assert.equal(writes, 1); assert.equal(item.state, 'sent');
  } finally { w.close(); }
});
domTest('Batch scan autofills heroes/medals through current scanner and retains readable metrics', async () => {
  const { w, app } = setup();
  try {
    const batch = new w.BatchUpload(app); batch.render();
    batch.addItem({ battleId: '950914999598100774', score: { index: 0 }, date: '2026-09-16', result: 'win' }, ['data:image/jpeg;base64,one'], [{ name: 'score.jpg' }], '2026-09-16', 'ranked');
    const worker = batch.items[0].worker;
    worker.locateOcrPortraits = async () => {
      const row = worker.container.querySelector('.submission-player-row'); row.querySelector('[data-field="heroUsed"]').value = 'Miya'; row.dataset.heroSource = 'portrait';
    };
    w.fetch = async () => ({ ok: true, json: async () => ({ data: { result: 'win', durationFormatted: '10:00', duration: '10:00', players: [{ sourceRow: 1, matchedPlayerId: 'p1', detectedName: 'Player <script>', kills: 5, deaths: 2, assists: 3, inGameScore: 8, damageDealt: 65000, medal: 'gold' }] } }) });
    await batch.scan(batch.generation);
    assert.equal(batch.items[0].state, 'ready', batch.items[0].root.textContent);
    const result = worker.collectDraft(); assert.equal(result.draft.playerStats[0].heroUsed, 'Miya'); assert.equal(result.draft.playerStats[0].medal, 'gold');
    assert.equal(result.draft.date, '2026-09-16'); assert.equal(w.localStorage.length, 0);
  } finally { w.close(); }
});
domTest('Batch preserves ready queue on navigation and never resends accepted matches after partial errors', async () => {
  const { w, app, row } = setup();
  try {
    const batch = new w.BatchUpload(app); batch.render();
    for (let i = 0; i < 2; i++) {
      batch.addItem({ battleId: '95091499959810077' + i, score: { index: 0 } }, ['data:image/jpeg;base64,one'], [{ name: 'score.jpg' }], '2026-09-16', 'ranked');
      const item = batch.items[i]; item.worker.restoreDraft({ source: 'ocr', playerStats: [row], result: 'win', fields: { practiceSubmitter: 'admin', practiceDate: '2026-09-16', practiceMatchType: 'ranked' } }); item.state = 'ready';
    }
    let first = 0, second = 0;
    batch.items[0].worker.request = async () => { first++; return { match: {} }; };
    batch.items[1].worker.request = async () => { second++; if (second === 1) throw Object.assign(new Error('try later'), { status: 429 }); return { submission: {} }; };
    await batch.send(batch.generation); batch.render(); await batch.send(batch.generation);
    assert.equal(first, 1); assert.equal(second, 2); assert.ok(batch.items.every(i => i.state === 'sent'));
  } finally { w.close(); }
});
