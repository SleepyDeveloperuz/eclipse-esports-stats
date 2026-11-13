import test from 'node:test';
import assert from 'node:assert/strict';
import { smartMatchRoster } from '../lib/roster-matcher.js';
import { cleanBattleId, groupBatchFiles } from '../js/batch-model.js';
import { handleTelegramWebhook, formatSubmissionTelegramMessage } from '../lib/telegram-bot.js';

const officialRoster = [
  { id: 'cd2969b5-7cfa-4f0d-88bd-0906502a3aba', name: 'heavenly as always', realName: 'Husniddin', primaryRole: 'Roamer', captain: true },
  { id: '95fa6dbd-bd82-4d7d-88de-23bc01858eac', name: 'Shadow as always', realName: 'Sanjar', primaryRole: 'Gold Laner' },
  { id: 'bc0f7b6c-4c0d-466e-b17b-ca04c5b583e4', name: "no one's hero", realName: "Ulug'bek", primaryRole: 'Roamer' },
  { id: '607409cf-c47b-4a15-a57e-c875964c35d1', name: 'Lyza the heroine', realName: 'Shohruh', primaryRole: 'EXP Laner' },
  { id: '6bd976ea-610d-436d-b5bd-aa1862917f59', name: '- Kenia', realName: 'Otabek', primaryRole: 'Jungler' },
  { id: 'bc257f41-9be6-4c9b-b6a8-9aaa6f858f65', name: 'LEADER', realName: "Nabixo'ja", primaryRole: 'Mid Laner' }
];

test('Real Matches 1-9: Roster matcher accurately matches Eclipse members and rejects all random guests', () => {
  // Test detected names from all 9 real matches
  const match6Players = [
    { name: 'ENVY KevinDeBurger', expected: null },
    { name: 'FS Shadow as always', expected: '95fa6dbd-bd82-4d7d-88de-23bc01858eac' },
    { name: 'AE VeRdAnA', expected: null },
    { name: "I'm no one's hero", expected: 'bc0f7b6c-4c0d-466e-b17b-ca04c5b583e4' },
    { name: "I'm heavenly as always", expected: 'cd2969b5-7cfa-4f0d-88bd-0906502a3aba' }
  ];

  for (const { name, expected } of match6Players) {
    const matched = smartMatchRoster(name, officialRoster);
    assert.equal(matched?.id || null, expected, `Mismatch for detected name "${name}"`);
  }

  const match7Players = [
    { name: "I'm heavenly as always", expected: 'cd2969b5-7cfa-4f0d-88bd-0906502a3aba' },
    { name: 'TWP IsagiYoichi', expected: null },
    { name: "I'm no one's hero", expected: 'bc0f7b6c-4c0d-466e-b17b-ca04c5b583e4' },
    { name: 'KnightX27', expected: null },
    { name: 'FS Shadow as always', expected: '95fa6dbd-bd82-4d7d-88de-23bc01858eac' }
  ];

  for (const { name, expected } of match7Players) {
    const matched = smartMatchRoster(name, officialRoster);
    assert.equal(matched?.id || null, expected, `Mismatch for detected name "${name}"`);
  }

  const match8Players = [
    { name: "I'M LEGEND", expected: null },
    { name: 'Javohir 01', expected: null },
    { name: "I'm no one's hero", expected: 'bc0f7b6c-4c0d-466e-b17b-ca04c5b583e4' },
    { name: "I'm heavenly as always", expected: 'cd2969b5-7cfa-4f0d-88bd-0906502a3aba' },
    { name: 'FS Shadow as always', expected: '95fa6dbd-bd82-4d7d-88de-23bc01858eac' }
  ];

  for (const { name, expected } of match8Players) {
    const matched = smartMatchRoster(name, officialRoster);
    assert.equal(matched?.id || null, expected, `Mismatch for detected name "${name}"`);
  }
});

test('Real Matches 1-9: Clean Battle ID parsing for all real fixtures', () => {
  const battleIds = [
    { raw: 'BattleID 953857176755343795', expected: '953857176755343795' },
    { raw: 'BattleID 954672498987079449', expected: '954672498987079449' },
    { raw: 'BattleID 955347616306404213', expected: '955347616306404213' },
    { raw: 'BattleID 956002981071134607', expected: '956002981071134607' },
    { raw: 'BattleID 957152125340984868', expected: '957152125340984868' },
    { raw: 'BattleID 958494160887065787', expected: '958494160887065787' },
    { raw: 'BattleID 959671785085055487', expected: '959671785085055487' },
    { raw: 'BattleID 960844113588369136', expected: '960844113588369136' },
    { raw: 'BattleID 962419713750973796', expected: '962419713750973796' }
  ];

  for (const { raw, expected } of battleIds) {
    assert.equal(cleanBattleId(raw), expected);
  }
});

test('Real Matches: Mathematical integrity verifies kills sum equals team score', () => {
  const realMatches = [
    { match: 'Match 1', teamKills: 18, kills: [1, 3, 5, 3, 6] },
    { match: 'Match 2', teamKills: 34, kills: [5, 1, 2, 15, 11] },
    { match: 'Match 3', teamKills: 31, kills: [4, 12, 9, 5, 1] },
    { match: 'Match 6', teamKills: 35, kills: [4, 9, 12, 7, 3] },
    { match: 'Match 7', teamKills: 27, kills: [3, 9, 5, 5, 5] },
    { match: 'Match 8', teamKills: 39, kills: [9, 1, 3, 11, 15] }
  ];

  for (const item of realMatches) {
    const sum = item.kills.reduce((s, k) => s + k, 0);
    assert.equal(sum, item.teamKills, `${item.match} kills sum ${sum} must equal team score ${item.teamKills}`);
  }
});

test('Batch Upload: Multi-match batch pairing pairs matches 6, 7, 8, 9 correctly', () => {
  const batchFiles = [
    { index: 0, kind: 'damage', battleId: '958494160887065787', duration: '16:14', result: 'win' },
    { index: 1, kind: 'scoreboard', battleId: '958494160887065787', duration: '16:14', result: 'win' },
    { index: 2, kind: 'damage', battleId: '959671785085055487', duration: '14:02', result: 'win' },
    { index: 3, kind: 'scoreboard', battleId: '959671785085055487', duration: '14:02', result: 'win' },
    { index: 4, kind: 'damage', battleId: '960844113588369136', duration: '17:16', result: 'win' },
    { index: 5, kind: 'scoreboard', battleId: '960844113588369136', duration: '17:16', result: 'win' },
    { index: 6, kind: 'damage', battleId: '962419713750973796', duration: '19:58', result: 'loss' },
    { index: 7, kind: 'scoreboard', battleId: '962419713750973796', duration: '19:58', result: 'loss' }
  ];

  const grouped = groupBatchFiles(batchFiles);
  assert.equal(grouped.matches.length, 4, 'All 4 real matches must pair successfully');
  assert.equal(grouped.unresolved.length, 0, 'No files should remain unresolved');

  const battleIds = grouped.matches.map(m => m.battleId);
  assert.ok(battleIds.includes('958494160887065787'));
  assert.ok(battleIds.includes('959671785085055487'));
  assert.ok(battleIds.includes('960844113588369136'));
  assert.ok(battleIds.includes('962419713750973796'));
});

test('Telegram Bot: Formats message with mathematical verification and real names', () => {
  const submission = {
    id: 'sub_real_6',
    submitter: { name: 'Husniddin' },
    draft: {
      date: '2026-11-13',
      matchType: 'ranked',
      result: 'win',
      durationFormatted: '16:14',
      teamKills: 35,
      enemyKills: 27,
      mathVerified: true,
      playerStats: [
        { playerName: 'Shadow as always', heroUsed: 'Thamuz', kills: 9, deaths: 4, assists: 14, medal: 'mvp' },
        { playerName: "no one's hero", heroUsed: 'Hilda', kills: 7, deaths: 7, assists: 15, medal: 'gold' },
        { playerName: 'heavenly as always', heroUsed: 'Novaria', kills: 3, deaths: 7, assists: 13, medal: 'silver' }
      ]
    }
  };

  const message = formatSubmissionTelegramMessage(submission);
  assert.ok(message.includes('35:27'));
  assert.ok(message.includes('Matematik tekshiruv'));
  assert.ok(message.includes('Sanjar'));
  assert.ok(message.includes("Ulug'bek"));
  assert.ok(message.includes('Husniddin'));
});
