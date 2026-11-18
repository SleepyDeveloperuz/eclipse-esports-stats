import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramSecretMatches, getTelegramCaptainId, telegramUpdateAccess } from '../lib/telegram-security.js';
import { handleTelegramWebhook } from '../lib/telegram-bot.js';

const env = { TELEGRAM_CHAT_ID: '100', TELEGRAM_GROUP_ID: '-1001234567890', TELEGRAM_ALLOWED_USER_IDS: '200, 300' };
const message = (userId, text = '/stats', chat = { id: userId, type: 'private' }) => ({ message: { message_id: 1, from: { id: userId }, chat, text } });
const callback = (userId, data, chat = { id: userId, type: 'private' }) => ({ callback_query: { id: 'callback-test', from: { id: userId }, data, message: { message_id: 1, chat, text: 'Submission' } } });
const group = { id: -1001234567890, type: 'supergroup' };

function configure(t, values = env) {
  const keys = new Set([...Object.keys(values), 'TELEGRAM_CAPTAIN_USER_ID', 'TELEGRAM_CHAT_ID', 'TELEGRAM_GROUP_ID', 'TELEGRAM_ALLOWED_USER_IDS', 'TELEGRAM_BOT_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']);
  const previous = Object.fromEntries([...keys].map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}

test('transport secret comparison rejects missing, array, object, altered and whitespace-only credentials', () => {
  for (const supplied of [undefined, null, '', ['fixture-secret'], { toString: () => 'fixture-secret' }, 'fixture-secret ', 'other']) assert.equal(telegramSecretMatches(supplied, 'fixture-secret'), false);
  for (const expected of [undefined, '', '   ']) assert.equal(telegramSecretMatches(expected, expected), false);
  assert.equal(telegramSecretMatches('fixture-secret', 'fixture-secret'), true);
});

test('private access uses exact user IDs; only the configured group grants group reads', () => {
  for (const userId of [100, 200, 300]) assert.equal(telegramUpdateAccess(message(userId), env).allowed, true);
  assert.equal(telegramUpdateAccess(message(999), env).allowed, false);
  assert.equal(telegramUpdateAccess(message(100, '/stats', { id: 200, type: 'private' }), env).allowed, false);
  assert.equal(telegramUpdateAccess(message(999, '/stats', group), env).allowed, true);
  assert.equal(telegramUpdateAccess(message(100, '/stats', { ...group, id: -1009999999999 }), env).allowed, false);
  assert.equal(telegramUpdateAccess(message(200), { ...env, TELEGRAM_ALLOWED_USER_IDS: '2000,200x,@200' }).allowed, false);
});

test('captain authority never comes from group membership, destination, username or missing configuration', () => {
  assert.equal(getTelegramCaptainId({ TELEGRAM_CHAT_ID: group.id }), '');
  assert.equal(getTelegramCaptainId({ ...env, TELEGRAM_CAPTAIN_USER_ID: '400' }), '400');
  assert.equal(getTelegramCaptainId({ ...env, TELEGRAM_CAPTAIN_USER_ID: 'bad' }), '');
  const actions = ['sub_approve:m1', 'sub_reject:m1', 'sub_edit_hero:m1', 'sub_pk_p:m1:p1', 'sub_st_h:m1:p1:Aulus', 'sub_cancel:m1', 'sub_future_action:m1'];
  for (const data of actions) {
    assert.equal(telegramUpdateAccess(callback(100, data), env).captain, true);
    assert.equal(telegramUpdateAccess(callback(100, data, group), env).allowed, true);
    assert.equal(telegramUpdateAccess(callback(200, data), env).allowed, false);
    assert.equal(telegramUpdateAccess(callback(999, data, group), { ...env, TELEGRAM_CHAT_ID: String(group.id) }).allowed, false);
    assert.equal(telegramUpdateAccess(callback(999, data), {}).allowed, false);
    assert.equal(telegramUpdateAccess(callback(999, data, { id: 100, type: 'private' }), env).allowed, false);
  }
});

test('anonymous senders, bots, channels, unsafe IDs and incomplete callbacks are denied', () => {
  const missingSender = message(100); delete missingSender.message.from;
  const bot = message(100); bot.message.from.is_bot = true;
  const anonymousAdmin = message(100, '/stats', group); anonymousAdmin.message.sender_chat = group;
  const invalidCallback = callback(100, 'sub_approve:m1'); delete invalidCallback.callback_query.from;
  const both = { ...message(100), ...callback(100, 'sub_approve:m1') };
  for (const update of [null, [], missingSender, bot, anonymousAdmin, invalidCallback, both, message(Number.MAX_SAFE_INTEGER + 1), message(100, '/stats', { id: -123, type: 'channel' })]) assert.equal(telegramUpdateAccess(update, env).allowed, false);
});

test('outsiders reach no private reads, photo download, OCR, callback writes or Telegram replies', async t => {
  configure(t, { ...env, TELEGRAM_BOT_TOKEN: 'fixture-token' });
  let effects = 0;
  t.mock.method(globalThis, 'fetch', async () => { effects++; throw new Error('Unexpected network'); });
  const trap = async () => { effects++; throw new Error('Unauthorized effect'); };
  const deps = { getMatches: trap, getPlayers: trap, getMetaLabData: trap, getSubmission: trap, getScoutingTeams: trap, correctSubmissionHero: trap, approveSubmission: trap, rejectSubmission: trap, createSubmissionFromPhoto: trap };
  const updates = ['/stats', '/summary', '/roster', '/pool', '/scout', '/meta', '/upload', '/start'].map(command => message(999, command));
  const photo = message(999); photo.message.photo = [{ file_id: 'private-photo' }]; updates.push(photo);
  for (const data of ['sub_approve:m1', 'sub_reject:m1', 'sub_edit_hero:m1', 'sub_pk_p:m1:p1', 'sub_st_h:m1:p1:Aulus', 'sub_cancel:m1']) updates.push(callback(200, data, group));
  for (const update of updates) assert.equal((await handleTelegramWebhook(update, deps)).reason, 'TELEGRAM_ACCESS_DENIED');
  assert.equal(effects, 0);
});

test('permitted members can read, and captain callbacks invoke the supplied review functions', async t => {
  configure(t, { ...env, TELEGRAM_BOT_TOKEN: 'fixture-token' });
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { sent.push({ url, body: JSON.parse(options.body) }); return new Response('{"ok":true}'); });
  const reads = [], mutations = [];
  const deps = {
    getMatches: async () => { reads.push('matches'); return [{ result: 'win', date: '2026-11-17' }]; },
    getPlayers: async () => { reads.push('players'); return [{ name: 'Fixture Player' }]; },
    approveSubmission: async id => { mutations.push(['approve', id]); },
    rejectSubmission: async id => { mutations.push(['reject', id]); },
    getSubmission: async id => { reads.push(id); return { draft: { playerStats: [{ playerId: 'p1', playerName: 'Fixture Player', heroUsed: 'Aulus' }] } }; },
    correctSubmissionHero: async (id, player, hero) => { mutations.push(['hero', id, player, hero]); return { id, draft: { playerStats: [] }, submitter: {} }; }
  };
  assert.equal((await handleTelegramWebhook(message(200), deps)).command, 'stats');
  assert.equal((await handleTelegramWebhook(message(999, '/roster', group), deps)).command, 'roster');
  assert.equal((await handleTelegramWebhook(callback(100, 'sub_approve:m1'), deps)).action, 'approved');
  assert.equal((await handleTelegramWebhook(callback(100, 'sub_reject:m2'), deps)).action, 'rejected');
  assert.equal((await handleTelegramWebhook(callback(100, 'sub_edit_hero:m3'), deps)).action, 'edit_hero_menu');
  assert.equal((await handleTelegramWebhook(callback(100, 'sub_st_h:m3:p1:Aulus'), deps)).action, 'hero_corrected');
  assert.deepEqual(reads, ['matches', 'players', 'm3']);
  assert.deepEqual(mutations, [['approve', 'm1'], ['reject', 'm2'], ['hero', 'm3', 'p1', 'Aulus']]);
  assert.ok(sent.some(call => call.body.chat_id === 200));
  assert.ok(sent.some(call => call.body.chat_id === group.id));
});

test('allowed private upload reaches OCR while a non-captain receives no approval buttons', async t => {
  configure(t, { ...env, TELEGRAM_BOT_TOKEN: 'fixture-token' });
  const sent = []; let scans = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/getFile?')) return new Response('{"ok":true,"result":{"file_path":"photos/fixture.jpg"}}');
    sent.push(JSON.parse(options.body)); return new Response('{"ok":true}');
  });
  const photo = message(200, ''); photo.message.photo = [{ file_id: 'fixture-photo' }];
  const result = await handleTelegramWebhook(photo, { createSubmissionFromPhoto: async ({ sender, fileUrls }) => {
    scans++; assert.equal(sender.id, 200); assert.equal(fileUrls.length, 1);
    return { submission: { id: 'fixture-submission', draft: { playerStats: [], entryMode: 'full' }, submitter: { name: 'Fixture' } } };
  } });
  assert.equal(result.submissionCreated, true);
  assert.equal(scans, 1);
  assert.ok(sent.some(call => String(call.chat_id) === '100' && call.reply_markup?.inline_keyboard));
  assert.ok(sent.filter(call => call.chat_id === 200).every(call => !(call.reply_markup?.inline_keyboard || []).flat().some(button => button.callback_data?.startsWith('sub_'))));
});
