import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamRepository } from '../lib/team-store.js';
import { MLBB_KEYS, createMemoryStore } from '../lib/mlbb/store.js';

// Each test file has an isolated Node worker. Never load local credentials.
for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL']) delete process.env[key];
Object.assign(process.env, {
  ADMIN_PASSWORD: 'fixture-telegram-admin', VIEWER_PASSWORD: 'fixture-telegram-viewer',
  SESSION_SECRET: 'fixture-telegram-secret-with-at-least-thirty-two-characters', GIST_ID: 'fixture-telegram',
  GEMINI_API_KEY: 'fixture-ai-key', TELEGRAM_BOT_TOKEN: 'fixture-bot-token', TELEGRAM_WEBHOOK_SECRET: 'fixture-webhook-secret',
  TELEGRAM_CHAT_ID: '100', TELEGRAM_CAPTAIN_USER_ID: '', TELEGRAM_ALLOWED_USER_IDS: '200', TELEGRAM_GROUP_ID: '-1001234567890'
});
const [{ default: submissions }, { default: sync }, { default: auth }, { default: ocr }] = await Promise.all([
  import('../api/submissions.js'), import('../api/sync.js'), import('../api/auth.js'), import('../api/ocr.js')
]);
const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
const call = async (handler, overrides = {}) => {
  const res = response();
  await handler({ method: 'POST', query: {}, headers: {}, body: {}, socket: {}, ...overrides }, res);
  return res;
};
const photo = userId => ({ update_id: 10, message: { chat: { id: userId, type: 'private' }, from: { id: userId }, photo: [{ file_id: 'fixture' }] } });
const validHeaders = () => ({ 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET });
const login = async role => {
  const result = await call(auth, { body: { role, password: role === 'admin' ? process.env.ADMIN_PASSWORD : process.env.VIEWER_PASSWORD, voterId: 'fixture_telegram_device_123' } });
  assert.equal(result.statusCode, 200); return result.body.token;
};
const repo = () => createTeamRepository({ store: createMemoryStore(), key: 'fixture', seed: async () => ({
  'eclipse_data.json': { content: JSON.stringify({ revision: 1, players: [{ id: 'p1', name: 'Fixture Player' }], matches: [{ id: 'm1', date: '2026-11-17', result: 'win', playerStats: [] }] }) }
}) });

test('every webhook entry rejects missing or incorrect transport credentials before I/O', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async url => { outgoing.push(url); throw new Error('No external calls expected'); });
  const variants = [{ query: { telegram: 'webhook' } }, { query: { source: 'telegram' } }, { url: '/api/telegram' }, {}];
  for (const variant of variants) {
    for (const secret of ['', 'wrong', ['fixture-webhook-secret']]) {
      const result = await call(submissions, { ...variant, body: photo(100), headers: { 'x-telegram-bot-api-secret-token': secret } });
      assert.equal(result.statusCode, 401);
    }
  }
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  try {
    for (const unset of ['', '   ']) {
      process.env.TELEGRAM_WEBHOOK_SECRET = unset;
      assert.equal((await call(submissions, { body: photo(100), headers: { 'x-telegram-bot-api-secret-token': expected } })).statusCode, 503);
    }
  } finally { process.env.TELEGRAM_WEBHOOK_SECRET = expected; }
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    assert.equal((await call(submissions, { body: photo(100), headers: validHeaders() })).statusCode, 503);
  } finally { process.env.TELEGRAM_BOT_TOKEN = bot; }
  assert.equal(outgoing.length, 0);
});

test('valid transport credentials cannot grant an outsider or team member captain actions', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async url => { outgoing.push(url); throw new Error('No external calls expected'); });
  const updates = [photo(999), { message: { chat: { id: 999, type: 'private' }, from: { id: 999 }, text: '/roster' } }];
  for (const data of ['sub_approve:m1', 'sub_reject:m1', 'sub_edit_hero:m1', 'sub_pk_p:m1:p1', 'sub_st_h:m1:p1:Aulus', 'sub_cancel:m1']) updates.push({ callback_query: { id: 'cb', data, from: { id: 200 }, message: { chat: { id: -1001234567890, type: 'supergroup' }, message_id: 1 } } });
  for (const body of updates) {
    const result = await call(submissions, { query: { telegram: 'webhook' }, body, headers: validHeaders() });
    assert.equal(result.statusCode, 200); assert.equal(result.body.reason, 'TELEGRAM_ACCESS_DENIED');
  }
  assert.equal(outgoing.length, 0);
  for (const body of [null, [], 'not-json']) assert.equal((await call(submissions, { query: { telegram: 'webhook' }, body, headers: validHeaders() })).statusCode, 400);
});

test('authorized group commands read the team snapshot through the real HTTP router', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { outgoing.push({ url, body: JSON.parse(options.body) }); return new Response('{"ok":true}'); });
  const repository = repo();
  const result = await repository.transaction(() => call(submissions, { query: { telegram: 'webhook' }, headers: validHeaders(), body: { message: { from: { id: 333 }, chat: { id: -1001234567890, type: 'supergroup' }, text: '/roster' } } }));
  assert.equal(result.statusCode, 200); assert.equal(result.body.command, 'roster');
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].body.chat_id, -1001234567890);
  assert.ok(outgoing[0].body.text.includes('Fixture Player'));
  assert.deepEqual(Object.keys(await repository.files()), ['eclipse_data.json']);
});

test('bot service credentials only read roster/matches and never permit writes or full exports', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async url => { outgoing.push(url); throw new Error('No external calls expected'); });
  const repository = repo();
  const headers = { 'x-telegram-bot-token': process.env.TELEGRAM_BOT_TOKEN };
  for (const collection of ['roster', 'matches']) {
    const result = await repository.transaction(() => call(sync, { method: 'GET', query: { collection }, headers }));
    assert.equal(result.statusCode, 200);
    assert.equal((result.body[collection === 'roster' ? 'players' : 'matches']).length, 1);
    assert.equal((await call(sync, { method: 'GET', query: { collection }, headers: { 'x-telegram-bot-token': 'wrong' } })).statusCode, 401);
  }
  for (const collection of [undefined, 'all', ['matches']]) assert.equal((await call(sync, { method: 'GET', query: { collection }, headers })).statusCode, 401);
  assert.equal((await call(sync, { method: 'POST', headers, body: { matches: [] } })).statusCode, 401);
  assert.equal(outgoing.length, 0);
});

const shadow = { id: '95fa6dbd-bd82-4d7d-88de-23bc01858eac', name: 'Shadow as always' };
const imageBytes = Buffer.from([255, 216, 255, 217]); // JPEG signature; portrait intentionally unresolved.
const matches = [
  { battleId: '958494160887065787', duration: '16:14', sourceRow: 2, kills: 9, deaths: 4, assists: 14, medal: 'supreme_mvp', goldEarned: 13206, damageDealt: 68151 },
  { battleId: '960844113588369136', duration: '17:16', sourceRow: 5, kills: 15, deaths: 3, assists: 5, medal: 'supreme', goldEarned: 14490, damageDealt: 85473 },
  { battleId: '962419713750973796', duration: '19:58', sourceRow: 5, kills: 7, deaths: 5, assists: 16, medal: 'supreme', goldEarned: 15807, damageDealt: 109576 }
];
function scanFixture(images, detectedName = 'FS Shadow as always') {
  const primary = images.find(image => image.kind === 'scoreboard') || images[0];
  const match = matches[primary.match];
  return {
    result: 'win', duration: match.duration, battleId: match.battleId,
    screenshots: images.map((image, imageIndex) => ({ imageIndex, kind: image.kind,
      battleId: matches[image.match].battleId, duration: matches[image.match].duration, result: 'win' })),
    players: [
      { ...match, detectedName, heroUsed: 'Aulus', heroRecognized: true },
      { detectedName: 'No1 Shadow@5279', sourceRow: 1, matchedPlayerId: shadow.id, kills: 7 }
    ]
  };
}
const envelope = parsed => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(parsed) }] } }] });

test('web OCR retains the literal Shadow row, tallies and unassigned partial IGN from two screenshot benchmarks', async t => {
  const token = await login('viewer');
  let fixture;
  t.mock.method(globalThis, 'fetch', async url => {
    assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\//);
    return envelope(fixture);
  });
  const scan = () => call(ocr, {
    headers: { authorization: 'Bearer ' + token },
    body: { mode: 'smart', purpose: 'practice_submission', images: [imageBytes.toString('base64'), imageBytes.toString('base64')], rosterPlayers: [shadow] }
  });
  for (const [index, expected] of matches.entries()) {
    fixture = scanFixture([{ match: index, kind: 'damage' }, { match: index, kind: 'scoreboard' }], index ? 'FSShadow as always' : 'FS · Shadow as always');
    const result = await scan();
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.sourceImageIndex, 1);
    const [row] = result.body.data.players;
    assert.equal(result.body.data.players.length, 1);
    assert.equal(row.matchedPlayerId, shadow.id);
    for (const field of ['sourceRow', 'kills', 'deaths', 'assists', 'medal', 'goldEarned', 'damageDealt']) assert.equal(row[field], expected[field], field);
  }
  fixture = scanFixture([{ match: 1, kind: 'scoreboard' }, { match: 1, kind: 'damage' }], 'Shadow');
  const result = await scan();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data.players.length, 1);
  assert.equal(result.body.data.players[0].identityReviewRequired, true);
  assert.equal(result.body.data.players[0].matchedPlayerId, null);
  assert.equal(result.body.data.players[0].kills, 15);
});

test('Telegram HTTP upload stores pending Shadow drafts, deduplicates updates and attaches only the same battle', async t => {
  const admin = await login('admin');
  const viewer = await login('viewer');
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis-fixture.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fixture-redis';
  t.after(() => { delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; });
  const repository = createTeamRepository({ store: createMemoryStore(), key: 'photo-fixture', seed: async () => ({
    'eclipse_data.json': { content: JSON.stringify({ revision: 1, players: [shadow, { id: 'p2', name: 'Fixture Teammate' }], matches: [] }) }
  }) });
  const photos = { a: { match: 0, kind: 'scoreboard' }, b: { match: 1, kind: 'scoreboard' },
    dataA: { match: 0, kind: 'damage' }, dataB: { match: 1, kind: 'damage' }, quota: { quota: true },
    c: { match: 2, kind: 'scoreboard' }, dataC: { match: 2, kind: 'damage' } };
  const redis = new Map(), outgoing = [];
  let scans = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://redis-fixture.upstash.io') {
      const [command, key, value, ...args] = JSON.parse(options.body);
      if (command === 'GET') return Response.json({ result: key === MLBB_KEYS.catalog ? JSON.stringify({ data: [{ id: 108, name: 'Aulus' }] }) : redis.get(key) ?? null });
      if (command === 'SET') {
        if (args.includes('NX') && redis.has(key)) return Response.json({ result: null });
        redis.set(key, value);
        return Response.json({ result: 'OK' });
      }
      if (command === 'EXISTS') return Response.json({ result: Number(redis.has(key)) });
      if (command === 'RPUSH') {
        const list = redis.get(key) || []; list.push(value); redis.set(key, list);
        return Response.json({ result: list.length });
      }
      if (command === 'EXPIRE') return Response.json({ result: 1 });
      if (command === 'LLEN') return Response.json({ result: redis.get(key)?.length || 0 });
      if (command === 'LRANGE') return Response.json({ result: redis.get(key) || [] });
      if (command === 'DEL') { [key, value, ...args].forEach(item => redis.delete(item)); return Response.json({ result: 1 }); }
      throw new Error(command);
    }
    const target = new URL(url);
    if (target.pathname.endsWith('/getFile')) {
      const id = target.searchParams.get('file_id');
      return Response.json(photos[id] ? { ok: true, result: { file_path: 'photos/' + id } } : { ok: false });
    }
    if (target.pathname.startsWith('/file/')) return new Response(Buffer.concat([imageBytes, Buffer.from(target.pathname.split('/').at(-1))]));
    if (target.hostname === 'generativelanguage.googleapis.com') {
      scans++;
      const images = JSON.parse(options.body).contents[0].parts.filter(part => part.inline_data)
        .map(part => photos[Buffer.from(part.inline_data.data, 'base64').subarray(imageBytes.length).toString()]);
      if (images[0].quota) return new Response('{}', { status: 429 });
      if (images[0].match !== 2) return envelope(scanFixture(images));
      const partial = scanFixture(images, 'Shadow');
      partial.teamKills = 37;
      partial.enemyKills = 37;
      partial.players.push({ detectedName: 'Fixture Teammate', sourceRow: 2, kills: 8, deaths: 3, assists: 23, damageDealt: 39667 });
      return envelope(partial);
    }
    if (target.hostname === 'api.telegram.org') {
      outgoing.push(JSON.parse(options.body));
      return Response.json({ ok: true });
    }
    throw new Error('Unexpected request');
  });
  const upload = (id, name, { document = false, album, user = 200 } = {}) => repository.transaction(() => call(submissions, {
    query: { source: 'telegram' }, headers: validHeaders(),
    body: { update_id: id, message: { chat: { id: user, type: 'private' }, from: { id: user },
      ...(album ? { media_group_id: album } : {}),
      ...(document ? { document: { file_id: name, mime_type: 'image/jpeg' } } : { photo: [{ file_id: name }] }) } }
  }));
  const first = await upload(301, 'a', { document: true });
  const duplicate = await upload(301, 'a', { document: true });
  const second = await upload(302, 'b');
  assert.equal(first.body.submissionCreated, true, JSON.stringify(first.body));
  assert.equal(second.body.submissionCreated, true, JSON.stringify(second.body));
  assert.notEqual(first.body.id, second.body.id);
  assert.equal(duplicate.body.skipped, true);
  assert.equal(scans, 2);
  const links = outgoing.filter(reply => String(reply.chat_id) === '100')
    .flatMap(reply => reply.reply_markup?.inline_keyboard?.flat() || [])
    .filter(button => button.text.includes('Saytda tahrirlash'))
    .map(button => new URL(button.url));
  assert.deepEqual(links.map(url => url.searchParams.get('submission')), [first.body.id, second.body.id]);
  assert.ok(links.every(url => [...url.searchParams.keys()].join(',') === 'submission'));

  const getDraft = (id, token) => repository.transaction(() => call(submissions, {
    method: 'GET', query: { id }, headers: token ? { authorization: `Bearer ${token}` } : {}
  }));
  for (const id of [first.body.id, second.body.id]) {
    const response = await getDraft(id, admin);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(Object.keys(response.body), ['submission', 'roster']);
    assert.equal(response.body.submission.id, id);
    assert.equal(response.body.roster[0].id, shadow.id);
    assert.equal(response.body.submission.submitter.identityHash, undefined);
    assert.equal((await getDraft(id)).statusCode, 401);
    assert.equal((await getDraft(id, viewer)).statusCode, 404);
  }
  assert.deepEqual((await getDraft(first.body.id, viewer)).body, (await getDraft('sub_000000000000000000000000', admin)).body);

  const rejected = await upload(303, 'missing');
  assert.equal(rejected.body.code, 'TELEGRAM_FILE_UNAVAILABLE');
  assert.ok(outgoing.some(reply => reply.chat_id === 200 && reply.text?.includes('Rasmni qayta yuboring')));
  const upgraded = await upload(304, 'dataA');
  assert.equal(upgraded.body.id, first.body.id);

  const files = Object.entries(await repository.files()).filter(([file]) => file.startsWith('eclipse_submission_'));
  const drafts = files.map(([, file]) => JSON.parse(file.content));
  const a = drafts.find(item => item.id === first.body.id), b = drafts.find(item => item.id === second.body.id);
  assert.equal(a.status, 'pending');
  assert.equal(a.review.correctedDraft.playerStats[0].damageDealt, matches[0].damageDealt);
  assert.equal(a.draft.playerStats[0].heroUsed, null);
  assert.equal(a.draft.playerStats[0].goldEarned, matches[0].goldEarned);
  assert.equal(b.review.correctedDraft, null);
  assert.equal(b.draft.playerStats[0].kills, matches[1].kills);
  assert.equal(b.draft.playerStats[0].playerId, shadow.id);
  const approval = await repository.transaction(async () => {
    const { approveSubmission } = await import('../api/submissions.js');
    await assert.rejects(approveSubmission(first.body.id), /qahramon bazada topilmadi/);
  });
  assert.equal(approval, undefined);

  const busy = await upload(305, 'quota');
  assert.equal(busy.body.code, 'OCR_PROVIDER_BUSY');
  assert.ok(outgoing.some(reply => reply.chat_id === 200 && reply.text?.includes('AI xizmati hozir band')));
  assert.equal(outgoing.some(reply => reply.text?.includes('1-skrinshot qabul qilindi va saqlandi')), false);

  const [albumData, albumScore] = await Promise.all([upload(306, 'dataB', { album: 'fixture-album' }), upload(307, 'b', { album: 'fixture-album' })]);
  assert.equal([albumData, albumScore].find(result => result.body.submissionCreated)?.body.id, second.body.id);
  assert.equal([albumData, albumScore].filter(result => result.body.skipped).length, 1);
  assert.ok(outgoing.some(reply => reply.media?.length === 2 && reply.media.every(item => !item.media.includes('://'))));

  const review = await upload(308, 'c');
  assert.equal(review.body.submissionCreated, true);
  assert.equal((await upload(309, 'dataC')).body.id, review.body.id);
  const held = (await getDraft(review.body.id, admin)).body.submission;
  const original = held.review.correctedDraft;
  const [unresolved] = held.quality.identityReviewRows;
  assert.deepEqual([unresolved.detectedName, unresolved.sourceRow, unresolved.kills, unresolved.goldEarned], ['Shadow', 5, 7, 15807]);
  const approve = body => repository.transaction(() => call(submissions, {
    method: 'PATCH', body: { id: held.id, expectedUpdatedAt: held.updatedAt, ...body }, headers: { authorization: `Bearer ${admin}` }
  }));
  assert.equal((await approve({ action: 'approve' })).body.code, 'SUBMISSION_IDENTITY_REVIEW');
  const teammate = { ...original.playerStats[0], heroUsed: 'Aulus' };
  assert.equal((await approve({ action: 'correct_approve', draft: { ...original, playerStats: [teammate] } })).body.code, 'SUBMISSION_IDENTITY_REVIEW');
  const corrected = await approve({ action: 'correct_approve', draft: {
    ...original, playerStats: [teammate, { ...unresolved, playerId: shadow.id, heroUsed: 'Aulus' }]
  } });
  assert.equal(corrected.statusCode, 200, JSON.stringify(corrected.body));
  assert.equal(corrected.body.match.playerStats.find(row => row.playerId === shadow.id).goldEarned, 15807);
  assert.deepEqual([corrected.body.match.teamKills, corrected.body.match.enemyKills], [37, 37]);
});

test('daily summary requires a current admin session; viewer, bot and revoked sessions cannot send it', async t => {
  const outgoing = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { outgoing.push({ url, body: JSON.parse(options.body) }); return new Response('{"ok":true}'); });
  const admin = await login('admin'), viewer = await login('viewer');
  const query = { source: 'telegram' }, body = { action: 'send_daily_summary', date: '2026-11-17' };
  for (const token of ['', viewer, process.env.TELEGRAM_BOT_TOKEN]) {
    assert.equal((await call(submissions, { query, body, headers: { authorization: `Bearer ${token}` } })).statusCode, 403);
  }
  assert.equal(outgoing.length, 0);
  const repository = repo();
  assert.equal((await repository.transaction(() => call(submissions, { query, body, headers: { authorization: `Bearer ${admin}` } }))).statusCode, 200);
  assert.equal(outgoing.length, 1);
  const revoked = await call(auth, { method: 'PATCH', body: { action: 'revoke_all' }, headers: { authorization: `Bearer ${admin}` } });
  assert.equal(revoked.statusCode, 200);
  assert.equal((await call(submissions, { query, body, headers: { authorization: `Bearer ${admin}` } })).statusCode, 403);
  assert.equal(outgoing.length, 1);
});
