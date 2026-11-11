import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import {
  formatSubmissionTelegramMessage,
  getSubmissionInlineKeyboard,
  formatDailyScrimSummary,
  handleTelegramWebhook,
  getDefaultGroupId,
  getMainReplyKeyboard,
  formatMetaLabSummary,
  formatTeamOverallStats,
  formatRosterSummary,
  formatPhotoUploadInstructions
} from '../lib/telegram-bot.js';
import { normaliseOcrPayload } from '../api/ocr.js';
import { normalisePracticeDraft } from '../api/submissions.js';

function getEclipseShareCard() {
  const source = readFileSync(new URL('../js/share-card.js', import.meta.url), 'utf8');
  const windowObj = {};
  const context = vm.createContext({
    window: windowObj,
    document: {
      createElement: () => ({
        getContext: () => null
      })
    },
    navigator: {}
  });
  vm.runInContext(source, context);
  return windowObj.EclipseShareCard;
}

const EclipseShareCard = getEclipseShareCard();

test('Telegram Bot: formats submission notification message with MLBB details', () => {
  const submission = {
    id: 'sub_test_123',
    submitter: { name: 'Heavenlyyy' },
    draft: {
      date: '2026-11-11',
      type: 'scrim',
      result: 'win',
      duration: '14:35',
      participants: [
        { playerName: 'Heavenlyyy', heroName: 'Chou', kills: 7, deaths: 1, assists: 9 },
        { playerName: 'Shadow', heroName: 'Ling', kills: 12, deaths: 2, assists: 5 }
      ]
    }
  };

  const message = formatSubmissionTelegramMessage(submission);
  assert.ok(message.includes('ECLIPSE ESPORTS // YANGI MATCH SUBMISSION'));
  assert.ok(message.includes('sub_test_123'));
  assert.ok(message.includes('G‘ALABA (WIN)'));
  assert.ok(message.includes('Heavenlyyy'));
  assert.ok(message.includes('Chou (7/1/9)'));
});

test('Telegram Bot: generates approve and reject inline callback buttons', () => {
  const keyboard = getSubmissionInlineKeyboard('sub_abc_999');
  assert.ok(keyboard && keyboard.inline_keyboard);
  const buttons = keyboard.inline_keyboard[0];
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].callback_data, 'sub_approve:sub_abc_999');
  assert.equal(buttons[1].callback_data, 'sub_reject:sub_abc_999');
});

test('Telegram Bot: formats daily scrim summary with duration breakdown and coach notes', () => {
  const matches = [
    {
      date: '2026-11-11',
      result: 'win',
      durationSeconds: 650, // Early game <12m
      playerStats: [
        { playerName: 'Ace', kills: 5, deaths: 0, assists: 8, medal: 'mvp' }
      ]
    },
    {
      date: '2026-11-11',
      result: 'win',
      durationSeconds: 950, // Mid game 12-18m
      playerStats: [
        { playerName: 'Ace', kills: 7, deaths: 1, assists: 6 }
      ]
    },
    {
      date: '2026-11-11',
      result: 'loss',
      durationSeconds: 1250, // Late game >18m
      playerStats: [
        { playerName: 'Ace', kills: 2, deaths: 4, assists: 3 }
      ]
    }
  ];

  const summary = formatDailyScrimSummary(matches, '2026-11-11');
  assert.ok(summary.includes('ECLIPSE ESPORTS // KUNLIK SCRIM HISOBOTI'));
  assert.ok(summary.includes('3 ta') && summary.includes('67% WR'));
  assert.ok(summary.includes('Early Game (<12m)'));
  assert.ok(summary.includes('Late Game (>18m)'));
  assert.ok(summary.includes('MURABBIY XULOSASI'));
  assert.ok(summary.includes('Ace'));
});

test('Telegram Bot: handles webhook slash commands and callbacks', async () => {
  let approvedId = null;
  const mockDeps = {
    approveSubmission: async (id) => { approvedId = id; return { ok: true }; },
    rejectSubmission: async () => ({ ok: true }),
    getMatches: async () => [
      { date: '2026-11-11', result: 'win', durationSeconds: 800 }
    ],
    createSubmissionFromPhoto: async () => ({ submission: { id: 'photo_sub_1' } })
  };

  // 1. /summary command
  const summaryRes = await handleTelegramWebhook({
    message: {
      text: '/summary',
      chat: { id: 123456 }
    }
  }, mockDeps);
  assert.equal(summaryRes.ok, true);
  assert.equal(summaryRes.command, 'summary');

  // 2. Callback query approval
  const callbackRes = await handleTelegramWebhook({
    callback_query: {
      id: 'cb_1',
      data: 'sub_approve:sub_target_555',
      message: { message_id: 10, chat: { id: 123456 }, text: 'Old message' }
    }
  }, mockDeps);
  assert.equal(callbackRes.ok, true);
  assert.equal(callbackRes.action, 'approved');
  assert.equal(approvedId, 'sub_target_555');
});

test('Daily Scrim Export: calculates dynamics, MVP, and win rate accurately', () => {
  const matches = [
    {
      date: '2026-11-11',
      result: 'win',
      duration: '10:45',
      playerStats: [
        { playerName: 'Heavenlyyy', kills: 6, deaths: 1, assists: 11, medal: 'mvp', heroUsed: 'Chou' }
      ]
    },
    {
      date: '2026-11-11',
      result: 'win',
      duration: '15:20',
      playerStats: [
        { playerName: 'Heavenlyyy', kills: 4, deaths: 2, assists: 8, heroUsed: 'Khufra' }
      ]
    }
  ];

  const data = EclipseShareCard.calculateDailyScrimData(matches, '2026-11-11');
  assert.equal(data.totalMatches, 2);
  assert.equal(data.wins, 2);
  assert.equal(data.losses, 0);
  assert.equal(data.winRate, '100%');
  assert.equal(data.mvpName, 'Heavenlyyy');
  assert.equal(data.earlyStats.count, 1);
  assert.equal(data.midStats.count, 1);
  assert.equal(data.lateStats.count, 0);

  const text = EclipseShareCard.generateDailyScrimText(matches, '2026-11-11');
  assert.ok(text.includes('2 ta match'));
  assert.ok(text.includes('100% WR'));
  assert.ok(text.includes('Heavenlyyy'));
});

test('Scouting Manager: initializes dossiers, records H2H and filters rivals', () => {
  const scoutingSource = readFileSync(new URL('../js/scouting.js', import.meta.url), 'utf8');
  const mockStorage = new Map();
  const windowObj = {
    localStorage: {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v))
    },
    document: {
      getElementById: () => null
    }
  };
  const context = vm.createContext({
    window: windowObj,
    localStorage: windowObj.localStorage,
    document: windowObj.document,
    console
  });
  vm.runInContext(scoutingSource, context);
  const ScoutingManager = windowObj.ScoutingManager;
  assert.ok(ScoutingManager);

  const manager = new ScoutingManager(null);
  const teams = manager.teams;
  assert.ok(Array.isArray(teams) && teams.length >= 2);
  const falcon = teams.find(r => r.name === 'Team Falcon');
  assert.ok(falcon);
  assert.ok(falcon.signaturePicks.some(h => h.heroName === 'Fanny'));

  // Quick H2H recording
  const initialWins = falcon.h2h?.wins || 0;
  manager.recordH2H(falcon.id, true);
  const updatedFalcon = manager.teams.find(r => r.id === falcon.id);
  assert.equal(updatedFalcon.h2h.wins, initialWins + 1);

  // Add new rival
  const added = manager.addTeam({
    name: 'RRQ Hoshi',
    tag: 'RRQ',
    tier: 'S',
    signaturePicks: [{ heroName: 'Ling', reason: 'Signature jungler' }]
  });
  assert.equal(added.name, 'RRQ Hoshi');
  assert.ok(manager.teams.some(t => t.name === 'RRQ Hoshi'));
});

test('Hero Pool Depth Matrix: calculates resilience and categorizes S/A/Joker tiers', () => {
  const playerSource = readFileSync(new URL('../js/players.js', import.meta.url), 'utf8');
  const windowObj = {
    EclipseApp: { authManager: { isAdmin: () => true } }
  };
  const context = vm.createContext({
    window: windowObj,
    document: { getElementById: () => null },
    console
  });
  vm.runInContext(playerSource, context);
  const PlayerManager = windowObj.PlayerManager;
  assert.ok(PlayerManager);

  const pm = new PlayerManager({ getPlayers: () => [], getMatches: () => [] }, null);

  // High resilience test (4+ S-Tier heroes)
  const highPool = [
    { heroId: 1, heroName: 'Chou', status: 'comfort' },
    { heroId: 2, heroName: 'Khufra', status: 'comfort' },
    { heroId: 3, heroName: 'Ruby', status: 'comfort' },
    { heroId: 4, heroName: 'Paquito', status: 'comfort' },
    { heroId: 5, heroName: 'Grock', status: 'backup' }
  ];
  const highHtml = pm.renderHeroPoolDepthMatrix(highPool);
  assert.ok(highHtml.includes('Yuqori Ban Chidamliligi'));
  assert.ok(highHtml.includes('🌟 S-Tier'));
  assert.ok(highHtml.includes('Chou'));

  // Critical resilience test (Target ban risk)
  const lowPool = [
    { heroId: 1, heroName: 'Fanny', status: 'comfort' }
  ];
  const lowHtml = pm.renderHeroPoolDepthMatrix(lowPool);
  assert.ok(lowHtml.includes('Target Ban xavfi!'));
});

test('MLBB Highlights: badge 4 detects Maniac, badge 5 detects Savage and inherently sets Maniac', () => {
  const roster = [{ id: 'p1', name: 'Heavenlyyy' }, { id: 'p2', name: 'Shadow' }];
  const heroes = [{ id: 1, name: 'Chou' }, { id: 2, name: 'Ling' }];

  // Case 1: Badge "4" in highlightNotes -> maniac: true, savage: null
  const maniacPayload = {
    players: [
      { detectedName: 'Heavenlyyy', matchedPlayerId: 'p1', highlightNotes: ['4', 'mvp'] }
    ]
  };
  const normalizedManiac = normaliseOcrPayload(maniacPayload, roster, heroes);
  assert.equal(normalizedManiac.players[0].maniac, true);
  assert.equal(normalizedManiac.players[0].savage, null);

  // Case 2: Badge "5" in highlightNotes -> savage: true AND maniac: true
  const savagePayload = {
    players: [
      { detectedName: 'Shadow', matchedPlayerId: 'p2', highlightNotes: ['5'] }
    ]
  };
  const normalizedSavage = normaliseOcrPayload(savagePayload, roster, heroes);
  assert.equal(normalizedSavage.players[0].savage, true);
  assert.equal(normalizedSavage.players[0].maniac, true);

  // Case 3: Explicit savage: true directly from model also inherently sets maniac: true
  const explicitSavagePayload = {
    players: [
      { detectedName: 'Shadow', matchedPlayerId: 'p2', savage: true, maniac: false }
    ]
  };
  const normalizedExplicit = normaliseOcrPayload(explicitSavagePayload, roster, heroes);
  assert.equal(normalizedExplicit.players[0].savage, true);
  assert.equal(normalizedExplicit.players[0].maniac, true);
});

test('Submissions Draft: savage: true automatically enforces maniac: true', () => {
  const officialData = {
    players: [{ id: 'p1', name: 'Heavenlyyy' }],
    heroes: [{ id: 1, name: 'Chou' }]
  };
  const draft = {
    entryMode: 'full',
    claimedPlayerId: 'p1',
    date: '2026-11-11',
    matchType: 'scrim',
    result: 'win',
    playerStats: [
      { playerId: 'p1', heroUsed: 'Chou', rolePlayed: 'EXP Laner', kills: 15, deaths: 0, assists: 5, savage: true, maniac: false }
    ]
  };
  const normalized = normalisePracticeDraft(draft, officialData);
  assert.equal(normalized.playerStats[0].savage, true);
  assert.equal(normalized.playerStats[0].maniac, true);
});

test('Telegram Bot: normalizes supergroup ID and generates main reply keyboard', () => {
  const orig = process.env.TELEGRAM_GROUP_ID;
  process.env.TELEGRAM_GROUP_ID = '-3648509145';
  assert.equal(getDefaultGroupId(), '-1003648509145');
  process.env.TELEGRAM_GROUP_ID = '-1003648509145';
  assert.equal(getDefaultGroupId(), '-1003648509145');
  process.env.TELEGRAM_GROUP_ID = orig;

  const kb = getMainReplyKeyboard();
  assert.ok(kb && Array.isArray(kb.keyboard));
  assert.equal(kb.resize_keyboard, true);
  const allTexts = kb.keyboard.flat().map(b => b.text);
  assert.ok(allTexts.includes('📸 Match yuborish'));
  assert.ok(allTexts.includes('📊 Bugungi scrimlar'));
  assert.ok(allTexts.includes('🧬 Meta Lab (Nusxa olish)'));
  assert.ok(allTexts.includes('🏆 Jamoa statistikasi'));
  assert.ok(allTexts.includes('👥 O‘yinchilar tarkibi'));
});

test('Telegram Bot: formats Meta Lab click-to-copy bans and role picks', () => {
  const metaText = formatMetaLabSummary();
  assert.ok(metaText.includes('MLBB META LAB'));
  assert.ok(metaText.includes('<code>Zhuxin, Fanny, Suyou, Nolan, Hayabusa, Mathilda</code>'));
  assert.ok(metaText.includes('Nusxa olish uchun'));
  assert.ok(metaText.includes('EXP Laner'));
  assert.ok(metaText.includes('Jungler'));
  assert.ok(metaText.includes('KOMANDA CHATI UCHUN NUSXA'));
});

test('Telegram Bot: blocks photo match submission in groups and redirects to PM', async () => {
  const groupUpdate = {
    message: {
      message_id: 888,
      chat: { id: -1003648509145, type: 'supergroup' },
      from: { id: 111, username: 'player_one', first_name: 'Player' },
      photo: [{ file_id: 'photo_abc_1' }]
    }
  };

  const result = await handleTelegramWebhook(groupUpdate);
  assert.equal(result.ok, true);
  assert.equal(result.blockedInGroup, true);
});

test('Telegram Bot: handles Meta Lab, Stats, and Roster commands', async () => {
  const metaUpdate = {
    message: {
      chat: { id: 1210055227, type: 'private' },
      text: '🧬 Meta Lab (Nusxa olish)'
    }
  };
  const metaRes = await handleTelegramWebhook(metaUpdate);
  assert.equal(metaRes.ok, true);
  assert.equal(metaRes.command, 'meta');

  const statsUpdate = {
    message: {
      chat: { id: 1210055227, type: 'private' },
      text: '/stats'
    }
  };
  const statsRes = await handleTelegramWebhook(statsRes => statsRes, {
    getMatches: async () => [{ result: 'win', matchType: 'scrim' }, { result: 'loss', matchType: 'ranked' }]
  });
  const handledStats = await handleTelegramWebhook(statsUpdate, {
    getMatches: async () => [{ result: 'win', matchType: 'scrim' }]
  });
  assert.equal(handledStats.ok, true);
  assert.equal(handledStats.command, 'stats');

  const rosterUpdate = {
    message: {
      chat: { id: 1210055227, type: 'private' },
      text: '👥 O‘yinchilar tarkibi'
    }
  };
  const rosterRes = await handleTelegramWebhook(rosterUpdate, {
    getPlayers: async () => [{ name: 'Heavenlyyy', role: 'Mid Laner' }]
  });
  assert.equal(rosterRes.ok, true);
  assert.equal(rosterRes.command, 'roster');
});



