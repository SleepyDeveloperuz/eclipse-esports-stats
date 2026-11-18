import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

async function setup({ admin = true, held = true } = {}) {
  const w = new JSDOM('<div id="desk"></div>', { url: 'https://fixture.invalid', runScripts: 'outside-only' }).window;
  for (const name of ['date-utils', 'data', 'stats', 'match', 'submissions', 'match-desk']) {
    w.eval(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'));
  }
  const db = new w.DataStore();
  db.savePlayers([{ id: 'p1', name: 'Player', primaryRole: 'Gold Laner' }]);
  db.saveMatches([{ id: 'review-match', date: '2026-11-16', matchType: 'ranked', result: 'win', scope: 'individual',
    durationSeconds: 600, dataIssues: held ? ['duration_conflict'] : [], updatedAt: '2026-11-16T10:00:00.000Z',
    playerStats: [{ playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Gold Laner', kills: 3, deaths: 1, assists: 6 }] }]);
  const hero = { id: 1, name: 'Miya' };
  const desk = new w.SubmissionManager({ isAdmin: () => admin }, db, { getAll: () => [hero], resolve: () => hero }, {});
  desk.request = async () => ({ counts: {}, submissions: [] });
  await desk.render('desk', 'review-match');
  return { w, desk, db };
}

test('held edit explains the issue, requires a fresh unchecked choice and sends only that choice', async () => {
  const { w, desk, db } = await setup();
  try {
    let checkbox = w.document.querySelector('#resolveMatchReview');
    assert.ok(checkbox);
    assert.equal(checkbox.checked, false);
    assert.ok(w.document.querySelector('label[for="resolveMatchReview"]'));
    assert.ok(w.document.getElementById(checkbox.getAttribute('aria-describedby')));
    assert.match(w.document.querySelector('[data-match-review]').textContent, /Davomiylik qiymatlari mos emas/);
    checkbox.checked = true;
    const draft = desk.rawDraft();
    assert.equal(JSON.stringify(draft).includes('resolveReview'), false, 'review consent is never restored from a draft');
    desk.restoreDraft(draft);
    checkbox = w.document.querySelector('#resolveMatchReview');
    assert.equal(checkbox.checked, false);
    const requests = [], toasts = [];
    w.showToast = message => toasts.push(message);
    desk.request = async (method, body) => {
      if (!body) return { counts: {}, submissions: [] };
      requests.push({ method, body });
      return { match: db.getMatches()[0] };
    };
    await desk.submitForm({ preventDefault() {} });
    assert.equal(requests[0].method, 'PATCH');
    assert.equal(requests[0].body.resolveReview, false);
    assert.equal(requests[0].body.action, 'edit_match');
    assert.match(toasts[0], /Hali statistikaga kiritilmadi/);
    await desk.render('desk', 'review-match');
    w.document.querySelector('#resolveMatchReview').checked = true;
    await desk.submitForm({ preventDefault() {} });
    assert.equal(requests[1].body.resolveReview, true);
  } finally { w.close(); }
});

test('review control is absent for valid matches, new entries and viewers', async () => {
  for (const options of [{ held: false }, { admin: false }]) {
    const { w } = await setup(options);
    try { assert.equal(w.document.querySelector('#resolveMatchReview'), null); } finally { w.close(); }
  }
  const { w, desk } = await setup();
  try {
    await desk.render('desk');
    assert.equal(w.document.querySelector('#resolveMatchReview'), null);
  } finally { w.close(); }
});

test('new and edited match forms never collect Lord or Turtle counts', async () => {
  const { w, desk } = await setup({ held: false });
  try {
    for (const edit of [true, false]) {
      if (!edit) await desk.render('desk');
      assert.equal(w.document.querySelector('[data-team-field="teamTurtles"]'), null);
      assert.equal(w.document.querySelector('[data-team-field="teamLords"]'), null);
      const draft = desk.rawDraft();
      assert.equal(Object.hasOwn(draft.team, 'teamTurtles'), false);
      assert.equal(Object.hasOwn(draft.team, 'teamLords'), false);
    }
  } finally { w.close(); }
});
