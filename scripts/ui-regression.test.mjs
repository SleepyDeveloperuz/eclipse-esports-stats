import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { JSDOM } = await import(process.env.ECLIPSE_JSDOM_PATH || 'jsdom');
function setup() {
  const w = new JSDOM('<div id="submissionContainer"></div><div id="briefingContainer"></div>', { url: 'https://fixture.invalid', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  w.confirm = () => true; w.showToast = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  for (const file of ['date-utils', 'data', 'players', 'auth', 'submissions', 'match-desk', 'briefing']) w.eval(readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'));
  const db = new w.DataStore(); db.savePlayers([{ id: 'p1', name: 'Player', primaryRole: 'Roamer' }]);
  const auth = { isAdmin: () => true, getAccessToken: () => 'fixture', showLoginModal() {} };
  const heroDb = { getAll: () => [{ id: 1, name: 'Miya', role: 'Marksman' }], resolve: name => name === 'Miya' ? { id: 1, name: 'Miya' } : null };
  w.EclipseApp = { authManager: auth, heroDb, cloudSync: { isConfigured: () => true, syncUp: async () => true } };
  return { w, db, auth, heroDb };
}
test('roster saves captain, secondary lane and hero pool without granting admin access', async () => {
  const { w, db, auth } = setup();
  try {
    const manager = new w.PlayerManager(db, {}); manager.renderPlayersList = () => {};
    manager.showEditModal('p1'); const form = w.document.querySelector('#rosterProfileDialog form');
    form.elements.pool_comfort.value = 'Miya'; form.elements.secondaryRole.value = 'Gold Laner'; form.elements.captain.checked = true;
    await form.onsubmit({ preventDefault() {}, currentTarget: form });
    assert.equal(db.getPlayers()[0].heroPool[0].heroId, 1);
    assert.equal(db.getPlayers()[0].secondaryRole, 'Gold Laner');
    assert.equal(db.getPlayers()[0].captain, true);
    auth.isAdmin = () => false; manager.showEditModal('p1'); assert.equal(w.document.querySelector('#rosterProfileDialog'), null);
  } finally { w.close(); }
});
test('Briefing drafts survive view changes and warn before closing the page', () => {
  const { w, db, auth } = setup();
  try {
    const manager = new w.BriefingManager(auth, null, db); manager.container = w.document.getElementById('briefingContainer'); manager.renderState();
    const input = manager.container.querySelector('form[id] textarea,form[id] input');
    assert.ok(input); input.value = 'Unsaved captain plan'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
    const name = input.name, id = input.id;
    manager.renderState();
    const restored = [...manager.container.querySelectorAll('input,textarea')].find(item => id ? item.id === id : item.name === name);
    assert.equal(restored.value, 'Unsaved captain plan');
    const leaving = new w.Event('beforeunload', { cancelable: true }); w.dispatchEvent(leaving); assert.equal(leaving.defaultPrevented, true);
  } finally { w.close(); }
});
test('lineup presets keep roster and roles only, clearing match facts on explicit apply', () => {
  const { w, db, auth, heroDb } = setup();
  try {
    const desk = new w.SubmissionManager(auth, db, heroDb, {}); desk.container = w.document.getElementById('submissionContainer'); desk.renderState();
    const row = desk.container.querySelector('.submission-player-row');
    row.querySelector('[data-field="playerId"]').value = 'p1'; row.querySelector('[data-field="rolePlayed"]').value = 'Roamer';
    row.querySelector('[data-field="kills"]').value = '12'; w.prompt = () => 'Main lineup';
    desk.container.querySelector('[data-lineup-save]').click();
    const saved = JSON.parse(w.localStorage.getItem('eclipse_lineup_presets_v1'));
    assert.deepEqual(saved[0].players, [{ playerId: 'p1', rolePlayed: 'Roamer' }]);
    desk.container.querySelector('[data-lineup-picker]').value = '0'; desk.container.querySelector('[data-lineup-apply]').click();
    assert.equal(desk.container.querySelector('[data-field="kills"]').value, '');
    assert.equal(desk.container.querySelector('[data-field="playerId"]').value, 'p1');
  } finally { w.close(); }
});
test('history editor restores archived participants and null achievements', async () => {
  const { w, db, auth, heroDb } = setup();
  try {
    db.savePlayers([{ id: 'p1', name: 'Retired', active: false }]);
    db.saveMatches([{ id: 'm1', date: '2026-09-08', result: 'win', matchType: 'ranked', scope: 'individual', playerStats: [{ playerId: 'p1', heroUsed: 'Miya', kills: 1, deaths: 2, assists: 3, savage: null, maniac: false }], updatedAt: '2026-09-08T12:00:00.000Z' }]);
    const desk = new w.SubmissionManager(auth, db, heroDb, {}); desk.request = async () => ({ submissions: [] });
    await desk.render('submissionContainer', 'm1');
    assert.equal(desk.container.querySelector('[data-field="playerId"]').value, 'p1');
    assert.equal(desk.container.querySelector('[data-field="savage"]').value, '');
    assert.equal(desk.container.querySelector('[data-field="maniac"]').value, 'false');
    assert.equal(desk.container.querySelector('#practiceSubmitter').value, 'admin');
  } finally { w.close(); }
});

function matchFixture(id = 'm1') {
  return { id, date: '2026-09-08', result: 'win', matchType: 'ranked', scope: 'individual',
    playerStats: [{ playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Gold Laner', kills: 1, deaths: 2, assists: 3 }],
    updatedAt: '2026-09-08T12:00:00.000Z' };
}

test('clearing a history edit creates a new draft and submits a new match', async () => {
  const { w, db, auth, heroDb } = setup();
  try {
    db.saveMatches([matchFixture()]);
    const desk = new w.SubmissionManager(auth, db, heroDb, {});
    const writes = [];
    desk.request = async (method = 'GET', body) => {
      if (method !== 'GET') writes.push({ method, body });
      return { submissions: [] };
    };
    await desk.render('submissionContainer', 'm1');
    desk.saveDraft();
    const oldDraftKey = desk.draftKey();
    desk.container.querySelector('[data-clear-draft]').click();
    assert.equal(desk.editingMatch, null);
    assert.equal(desk.editingSubmission, null);
    assert.equal(w.localStorage.getItem(oldDraftKey), null);
    assert.equal(desk.container.querySelector('#submissionHeading').textContent, 'Match yuborish');
    assert.equal(desk.container.querySelector('#practiceSubmitBtn').textContent, 'Matchni saqlash');
    desk.container.querySelector('#practicePlayerRows').innerHTML = '';
    desk.addParticipantRow(matchFixture().playerStats[0]);
    desk.container.querySelector('[name="practice-result"][value="win"]').checked = true;
    desk.saveDraft();
    const saved = JSON.parse(w.localStorage.getItem(desk.draftKey()));
    assert.equal(saved.editingMatch, null);
    assert.equal(saved.editingSubmission, null);
    await desk.submitForm({ preventDefault() {} });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, 'POST');
    assert.equal(writes[0].body.action, 'save');
    assert.equal(writes[0].body.id, undefined);
  } finally { w.close(); }
});

test('archived submitter and substitutes survive correction and saved-draft restore', async () => {
  const { w, db, auth, heroDb } = setup();
  try {
    db.savePlayers([{ id: 'p1', name: 'Active' }, { id: 'p2', name: 'Retired', active: false }, { id: 'p3', name: 'Reserve', active: false }]);
    const record = { id: 'sub1', status: 'pending', source: 'manual', updatedAt: '2026-09-08T12:00:00.000Z',
      submitter: { role: 'viewer', claimedPlayerId: 'p2', claimedPlayerName: 'Retired' },
      draft: { ...matchFixture(), claimedPlayerId: 'p2', substitutes: ['p3'], playerStats: [{ ...matchFixture().playerStats[0], playerId: 'p2' }] } };
    const desk = new w.SubmissionManager(auth, db, heroDb, {});
    desk.request = async () => ({ submissions: [record] });
    await desk.render('submissionContainer');
    desk.container.querySelector('[data-correct]').click();
    const assertRestored = () => {
      assert.equal(desk.container.querySelector('#practiceSubmitter').value, 'p2');
      assert.deepEqual([...desk.container.querySelector('#practiceSubstitutes').selectedOptions].map(option => option.value), ['p3']);
      const submission = desk.collectDraft();
      assert.equal(submission.claimedPlayerId, 'p2');
      assert.equal(submission.draft.playerStats[0].playerId, 'p2');
      assert.deepEqual([...submission.draft.substitutes], ['p3']);
    };
    assertRestored();
    await desk.render('submissionContainer');
    assert.equal([...desk.container.querySelector('#practiceSubmitter').options].some(option => option.value === 'p2'), false);
    desk.container.querySelector('#matchDraftStatus button').click();
    assertRestored();
    assert.equal(desk.editingSubmission.id, 'sub1');
  } finally { w.close(); }
});

test('viewer login replaces the previous admin identity and refreshes protected UI', async () => {
  const { w, db } = setup();
  try {
    w.document.body.insertAdjacentHTML('beforeend', '<div id="topbarAuthContainer"></div><button class="admin-only">Edit</button><section class="page-section active" id="page-add-match"></section>');
    const auth = new w.AuthManager(db);
    w.sessionStorage.setItem(auth.TOKEN_KEY, 'previous-admin');
    w.sessionStorage.setItem(auth.SESSION_KEY, 'true');
    auth.updateUI();
    let navigated;
    w.EclipseApp.navigate = page => { navigated = page; };
    w.fetch = async () => ({ ok: true, json: async () => ({ role: 'viewer', token: 'new-viewer' }) });
    assert.equal(await auth.loginViewer('viewer-password'), true);
    assert.equal(auth.getToken(), '');
    assert.equal(w.sessionStorage.getItem(auth.SESSION_KEY), null);
    assert.equal(auth.isAdmin(), false);
    assert.equal(auth.getAccessToken(), 'new-viewer');
    assert.equal(w.document.querySelector('.admin-only').style.display, 'none');
    assert.match(w.document.querySelector('#topbarAuthContainer').textContent, /KUZATUVCHI/);
    assert.equal(navigated, 'dashboard');
  } finally { w.close(); }
});

test('history filters use the latest matches and roster after foreground refresh', async () => {
  const { w, db, auth } = setup();
  try {
    // Load the app object without starting its unrelated network/bootstrap flow.
    w.eval(readFileSync(new URL('../js/app.js', import.meta.url), 'utf8').replace(/\ndocument\.addEventListener\('DOMContentLoaded',[\s\S]*$/, ''));
    w.scrollTo = () => {};
    w.document.body.insertAdjacentHTML('beforeend', '<section id="page-match-history" class="page-section"><div id="matchHistoryContainer"></div><div id="matchFilterBar"><button class="filter-chip" data-filter="all">All</button><button class="filter-chip" data-filter="scrim">Scrim</button></div></section>');
    db.saveMatches([matchFixture('old-match')]);
    const app = w.EclipseApp;
    const renders = [];
    Object.assign(app, { dataStore: db, authManager: auth, currentAnalyticsMode: 'squad', foregroundInputGeneration: 0,
      updateAnalyticsScopeControl() {}, refreshMotion() {}, rebuildHeroDatabase() {},
      matchManager: { renderMatchHistory: (container, matches, players) => renders.push({ matches, players }) },
      cloudSync: { getStatus: () => ({ pending: false }), syncDown: async () => {
        db.saveMatches([{ ...matchFixture('new-match'), matchType: 'scrim' }]);
        db.savePlayers([{ id: 'p1', name: 'Updated roster name' }]);
        return true;
      } } });
    app.navigate('match-history');
    await app.refreshForeground();
    w.document.querySelector('[data-filter="scrim"]').click();
    assert.deepEqual([...renders.at(-1).matches].map(match => match.id), ['new-match']);
    assert.equal(renders.at(-1).players[0].name, 'Updated roster name');
    w.document.querySelector('[data-filter="all"]').click();
    assert.deepEqual([...renders.at(-1).matches].map(match => match.id), ['new-match']);
  } finally { w.close(); }
});
