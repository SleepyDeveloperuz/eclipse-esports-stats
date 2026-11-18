import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRosterSummary, formatHeroPoolSummary, formatTeamOverallStats, formatDailyScrimSummary } from '../lib/telegram-bot.js';

test('empty or archived roster does not manufacture players or hero pools', () => {
  for (const players of [undefined, null, [], {}, [null, 'invalid', [], { name: 'Archived', active: false }]]) {
    for (const formatter of [formatRosterSummary, formatHeroPoolSummary]) {
      const text = formatter(players);
      assert.match(text, /Faol roster o‘yinchilari kiritilmagan/);
      assert.doesNotMatch(text, /heavenly|Shadow|Archived|Mathilda|👑/);
    }
  }
});

test('roster captain, identity and role are recorded values, never inferred from IGN or position', () => {
  const players = [{ name: 'heavenly as always', role: 'Captain & Roamer' },
    { name: 'Second', captain: true }, { name: 'Legacy', isCaptain: true },
    { name: 'Explicit false', captain: false, isCaptain: true }, { name: 'Archived', active: false, captain: true }];
  const before = structuredClone(players);
  const text = formatRosterSummary(players);
  assert.match(text, /👤 <b>heavenly as always<\/b>/);
  assert.match(text, /👑 <b>Second<\/b>/);
  assert.match(text, /👑 <b>Legacy<\/b>/);
  assert.match(text, /👤 <b>Explicit false<\/b>/);
  assert.match(text, /Rol kiritilmagan/);
  assert.doesNotMatch(text, /Husniddin|Archived|Flex/);
  assert.deepEqual(players, before);
});

test('partial hero pools preserve learning status and do not fill absent categories from samples', () => {
  const players = [{ name: 'Shadow as always', heroPool: [{ heroName: 'Aulus', status: 'comfort' },
    { heroName: 'Ling', status: 'learning' }, null, { heroName: 'Unknown category', status: 'other' }] }];
  const before = structuredClone(players), text = formatHeroPoolSummary(players, 'shadow');
  assert.match(text, /Comfort · Qulay:<\/b> <code>Aulus<\/code>/);
  assert.match(text, /Backup · Zaxira:<\/b> <code>Kiritilmagan<\/code>/);
  assert.match(text, /Learning · O‘rganilmoqda:<\/b> <code>Ling<\/code>/);
  assert.doesNotMatch(text, /Roger|Beatrix|Sanjar|S-Tier|Joker|100%|Unknown category/);
  assert.deepEqual(players, before);
});

test('Telegram roster and hero pool escape names, roles, heroes and unsuccessful searches', () => {
  const players = [{ name: '<b>Name</b>', realName: '<i>Real</i>', primaryRole: '<u>Role</u>',
    heroPool: [{ status: 'backup', heroName: '<a>Hero & more</a>' }] }];
  for (const formatter of [formatRosterSummary, formatHeroPoolSummary]) {
    const text = formatter(players);
    assert.match(text, /&lt;b&gt;Name&lt;\/b&gt;/);
    assert.match(text, /&lt;i&gt;Real&lt;\/i&gt;/);
    assert.match(text, /&lt;u&gt;Role&lt;\/u&gt;/);
    assert.doesNotMatch(text, /<b>Name<\/b>|<i>Real<\/i>|<u>Role<\/u>/);
  }
  assert.match(formatHeroPoolSummary(players, 'REAL'), /&lt;a&gt;Hero &amp; more&lt;\/a&gt;/);
  assert.match(formatHeroPoolSummary(players, '<missing>'), /&lt;missing&gt;/);
});

test('team summary excludes unknown outcomes and holds, and preserves actual match types', () => {
  const good = ['ranked', 'scrim', 'tournament', 'casual', 'unrecognized'].map((matchType, i) => ({
    result: i % 2 ? 'loss' : 'win', matchType, playerStats: [] }));
  const excluded = [{ result: 'unknown', isWin: true }, { result: 'win', status: 'draft' },
    { result: 'loss', needsReview: true }, { result: 'loss', dataIssues: ['mismatch'] }, null];
  const all = [...good, ...excluded], before = structuredClone(all), text = formatTeamOverallStats(all);
  assert.equal(text, formatTeamOverallStats(good));
  assert.match(text, /5 ta<\/b> \(3W – 2L\)/);
  for (const name of ['Ranked', 'Scrim', 'Turnir', 'Casual', 'Noma’lum']) assert.ok(text.includes(`<b>1</b> ${name}`));
  assert.deepEqual(all, before);
});

test('team hero summary safely counts arbitrary names without object prototype collisions', () => {
  const text = formatTeamOverallStats([{ result: 'win', playerStats: [null,
    { heroUsed: '__proto__' }, { heroUsed: '__proto__' }, { heroUsed: 'constructor' }, { heroUsed: '<b>Hero</b>' }] }]);
  assert.match(text, /<b>__proto__<\/b> — 2 ta/);
  assert.match(text, /<b>constructor<\/b> — 1 ta/);
  assert.match(text, /&lt;b&gt;Hero&lt;\/b&gt;/);
  assert.doesNotMatch(text, /NaN|\[object|function Object/);
});

test('daily summary respects canonical loss and treats date and player names as text', () => {
  for (const name of ['__proto__', 'constructor', '<b>Injected</b>']) {
    const matches = [{ date: '2026-11-18', result: 'loss', isWin: true, durationSeconds: 600,
      playerStats: [null, { playerName: name, kills: 1, deaths: 2, assists: 3 }] }];
    const before = structuredClone(matches), text = formatDailyScrimSummary(matches, '2026-11-18');
    assert.match(text, /0W – 1L/);
    assert.match(text, /0% WR/);
    assert.doesNotMatch(text, /NaN|<b>Injected<\/b>/);
    assert.ok(text.includes(name === '<b>Injected</b>' ? '&lt;b&gt;Injected&lt;/b&gt;' : name));
    assert.deepEqual(matches, before);
  }
  assert.equal(Object.prototype.kills, undefined);
  assert.match(formatDailyScrimSummary([], '<b>date</b>'), /&lt;b&gt;date&lt;\/b&gt;/);
});
