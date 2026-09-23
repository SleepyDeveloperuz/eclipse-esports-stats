import test from 'node:test';
import assert from 'node:assert/strict';
import { extractionProblems, extractWithRecheck, reconcileRecheck } from '../lib/ocr-recheck.js';
import { normaliseOcrPayload, parseDetailImage, buildOcrRequest } from '../api/ocr.js';

const row = (sourceRow, extra = {}) => ({ sourceRow, detectedName: `Player ${sourceRow}`, kills: 5, deaths: 2, assists: 8, inGameScore: 8.4, goldEarned: 8000, medal: 'gold', ...extra });
const data = players => ({ result: 'win', players, reviewIssues: [] });
const normalize = value => normaliseOcrPayload(value, [], [], { mode: 'scoreboard' });
const requestBody = { contents: [{ parts: [{ text: 'Original extraction instructions' }] }] };
const provider = values => {
  const requests = [];
  return { requests, fetchImpl: async (_, init) => {
    requests.push(JSON.parse(init.body));
    const value = values[requests.length - 1];
    return { ok: true, json: async () => ({ modelVersion: 'fixture', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }) };
  } };
};

test('complete visible values require one request and no recheck', async () => {
  const mock = provider([data([row(1)])]);
  const result = await extractWithRecheck({ apiKey: 'fixture', requestBody, models: ['gemini-fixture'], normalize, ...mock });
  assert.equal(mock.requests.length, 1); assert.equal(result.meta.rechecked, false);
  assert.deepEqual(extractionProblems(result.data), []);
});

test('duplicate MVP automatically rechecks once, preserving already-read numeric values', async () => {
  const mock = provider([data([row(1, { medal: 'mvp' }), row(2, { medal: 'mvp' })]), data([row(1, { medal: 'gold', kills: 99 }), row(2, { medal: 'mvp' })])]);
  const result = await extractWithRecheck({ apiKey: 'fixture', requestBody, models: ['gemini-fixture'], normalize, ...mock });
  assert.equal(mock.requests.length, 2); assert.equal(result.meta.rechecked, true);
  assert.deepEqual(result.data.players.map(row => row.medal), ['gold', 'mvp']);
  assert.equal(result.data.players[0].kills, 5);
  assert.ok(!result.data.reviewIssues.includes('multiple_mvp_medals'));
  assert.deepEqual(result.meta.attempts.map(attempt => attempt.phase), ['initial', 'recheck']);
});

test('unresolved double MVP becomes unknown instead of guessed awards or a mandatory confirmation', async () => {
  const duplicate = data([row(1, { medal: 'mvp' }), row(2, { medal: 'mvp' })]);
  const mock = provider([duplicate, duplicate]);
  const result = await extractWithRecheck({ apiKey: 'fixture', requestBody, models: ['gemini-fixture'], normalize, ...mock });
  assert.equal(mock.requests.length, 2);
  assert.deepEqual(result.data.players.map(row => row.medal), [null, null]);
  assert.ok(result.data.reviewIssues.includes('unresolved_medal'));
});

test('short remaining budget does not start another provider request', async () => {
  const mock = provider([data([row(1, { medal: null })])]);
  const result = await extractWithRecheck({ apiKey: 'fixture', requestBody, models: ['gemini-fixture'], normalize, deadlineMs: 1000, ...mock });
  assert.equal(mock.requests.length, 1); assert.equal(result.meta.rechecked, false);
});

test('recheck cannot substitute a different player or overwrite valid stats', () => {
  const original = data([row(1, { medal: null })]);
  assert.equal(reconcileRecheck(original, data([row(1, { detectedName: 'Somebody else' })])), original);
  const fixed = reconcileRecheck(original, data([row(1, { goldEarned: 1 })]));
  assert.equal(fixed.players[0].goldEarned, 8000); assert.equal(fixed.players[0].medal, 'gold');
  assert.equal(original.players[0].medal, null);
});

test('recheck matches unique identities across reordering and only fills missing KDA', () => {
  const original = data([row(1, { kills: null }), row(2)]);
  const fixed = reconcileRecheck(original, data([row(2, { kills: 99 }), row(1, { kills: 7 })]));
  assert.deepEqual(fixed.players.map(row => row.kills), [7, 5]);
});

test('partial rechecks retain safe repairs even while the same category remains unresolved', () => {
  const original = data([row(1, { kills: null, assists: null }), row(2, { medal: null })]);
  const fixed = reconcileRecheck(original, data([row(1, { kills: 7, assists: null, medal: null }), row(2, { medal: null })]));
  assert.equal(fixed.players[0].kills, 7);
  assert.equal(fixed.players[0].assists, null);
  assert.equal(fixed.players[0].medal, 'gold');
  assert.ok(extractionProblems(fixed).includes('kda'));
});

test('merging rechecked positions never duplicates an already unique original row', () => {
  const original = { ...data([row(1), row(null, { detectedName: 'Second' })]), result: null };
  const fixed = reconcileRecheck(original, data([row(2, { detectedName: 'Player 1' }), row(1, { detectedName: 'Second' })]));
  assert.equal(fixed.result, 'win');
  assert.deepEqual(fixed.players.map(row => row.sourceRow), [1, null]);
});

test('recheck can repair originally duplicate positions using unique identity-aligned rows', () => {
  const original = data([row(1), row(1, { detectedName: 'Second' })]);
  const fixed = reconcileRecheck(original, data([row(2, { detectedName: 'Second' }), row(1)]));
  assert.deepEqual(fixed.players.map(row => row.sourceRow), [1, 2]);
});

test('a partial positional recheck cannot transfer an unresolved collision to another player', () => {
  const original = { ...data([row(1), row(1, { detectedName: 'Second' }), row(null, { detectedName: 'Third' })]), result: null };
  const fixed = reconcileRecheck(original, data([row(null, { detectedName: 'Player 1' }), row(2, { detectedName: 'Second' }), row(1, { detectedName: 'Third' })]));
  assert.equal(fixed.result, 'win');
  assert.deepEqual(fixed.players.map(row => row.sourceRow), [1, 1, null]);
});

test('derived detail image is optional, format checked and separately size-bounded', () => {
  assert.equal(parseDetailImage(undefined), null);
  assert.equal(parseDetailImage(''), null);
  assert.deepEqual(parseDetailImage('data:image/jpeg;base64,YWJj'), { inline_data: { mime_type: 'image/jpeg', data: 'YWJj' } });
  for (const value of [{}, 'https://example.com/image.jpg', 'data:text/html;base64,YWJj', 'data:image/jpeg;base64,a!', 'data:image/jpeg;base64,' + 'a'.repeat(600104)]) assert.throws(() => parseDetailImage(value));
});

test('detail montage supplements full images; it never changes allowed hero-review input', () => {
  const image = { inline_data: { mime_type: 'image/jpeg', data: 'YWJj' } }, detail = parseDetailImage('data:image/jpeg;base64,YWJj');
  const body = buildOcrRequest({ imageParts: [image], detailPart: detail });
  assert.equal(body.contents[0].parts.length, 3); assert.equal(body.contents[0].parts[1], image); assert.equal(body.contents[0].parts[2], detail);
  assert.match(body.contents[0].parts[0].text, /same rows, not additional players/);
  const hero = buildOcrRequest({ mode: 'hero_review', imageParts: [image], detailPart: detail });
  assert.equal(hero.contents[0].parts.length, 2);
});
