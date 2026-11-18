import test from 'node:test';
import assert from 'node:assert/strict';
import { smartMatchRoster } from '../lib/roster-matcher.js';
import { normaliseOcrPayload } from '../api/ocr.js';
import { checkScreenshotEvidence, applyVerifiedHeroMatches, mergeRosterScanStats } from '../lib/ocr-evidence.js';
import { parseOcrProviderResponse } from '../lib/ocr-provider.js';

const roster = [
  { id: 'cd2969b5-7cfa-4f0d-88bd-0906502a3aba', name: 'heavenly as always', realName: 'Husniddin' },
  { id: '95fa6dbd-bd82-4d7d-88de-23bc01858eac', name: 'Shadow as always' },
  { id: 'bc0f7b6c-4c0d-466e-b17b-ca04c5b583e4', name: "no one's hero" }
];
const header = (imageIndex, kind, extra = {}) => ({ imageIndex, kind, battleId: '1003364882523644224', duration: '11:47', result: 'win', ...extra });
const headers = [header(0, 'damage'), header(1, 'scoreboard')];
const row = { detectedName: "I'm heavenly as always", sourceRow: 5, kills: 0, deaths: 0, assists: 0 };

test('only complete known IGNs and owner-confirmed aliases identify roster players', () => {
  for (const [name, index] of [["I'm heavenlyyy", 0], ['FS Shado', 1], ["I'm elyyysian", 2], ['FS Shadow as always', 1], ["I'm no one's hero", 2]]) {
    assert.equal(smartMatchRoster(name, roster)?.id, roster[index].id, name);
  }
  for (const name of ['No1 Shadow@5279', 'Shadow somebody', 'heavenly random', 'Husniddin', 'heavenly as always fan', roster[0].id]) {
    assert.equal(smartMatchRoster(name, roster), null, name);
  }
  assert.equal(smartMatchRoster('FS Shado', [...roster, { id: 'another', name: 'Shado' }]), null);
  assert.equal(smartMatchRoster('FS Shado', [{ ...roster[1], active: false }]), null);
});

test('reversed screenshots anchor portraits to the scoreboard and preserve original rows and zeroes', () => {
  const data = normaliseOcrPayload({ screenshots: headers, players: [row] }, roster, [], { mode: 'full', imageCount: 2 });
  assert.equal(data.sourceImageIndex, 1);
  assert.equal(data.players[0].sourceRow, 5);
  assert.equal(data.players[0].kills, 0);
  assert.equal(data.players[0].damageDealt, null);
  assert.equal(data.battleId, '1003364882523644224');
  assert.equal(data.result, 'win');
  assert.equal(data.durationSeconds, 707);
});

test('aggregate metadata cannot contradict the screenshot headers', () => {
  for (const extra of [{ battleId: '995707943677883216' }, { result: 'loss' }, { duration: '12:00' }]) {
    const data = normaliseOcrPayload({ ...extra, screenshots: headers, players: [row] }, roster, [], { imageCount: 2 });
    assert.equal(data.scanError, 'conflicting_match_header');
    assert.deepEqual(data.players, []);
  }
});

test('single screenshots cannot provide columns that are absent from that screen', () => {
  const metrics = { ...row, kills: 7, goldEarned: 9000, inGameScore: 8.5, medal: 'gold', damageDealt: 12345, turretDamage: 0 };
  const scan = kind => normaliseOcrPayload({ screenshots: [header(0, kind)], players: [metrics] }, roster, [], { imageCount: 1 }).players[0];
  const damage = scan('damage');
  for (const key of ['kills', 'deaths', 'assists', 'goldEarned', 'inGameScore', 'medal']) assert.equal(damage[key], null, key);
  assert.equal(damage.damageDealt, 12345);
  assert.equal(damage.turretDamage, 0);
  const scoreboard = scan('scoreboard');
  assert.equal(scoreboard.kills, 7);
  assert.equal(scoreboard.damageDealt, null);
  assert.equal(scoreboard.turretDamage, null);
});

test('unverified, different, duplicate and non-match screenshots cannot yield participant records', () => {
  const variants = [undefined, [headers[0]],
    [headers[0], header(1, 'scoreboard', { battleId: '995707943677883216' })],
    [headers[0], header(1, 'scoreboard', { battleId: null })],
    [headers[0], header(1, 'scoreboard', { battleId: 1003364882523644224 })],
    [headers[0], header(1, 'scoreboard', { duration: '13:47' })],
    [headers[0], header(1, 'scoreboard', { result: 'loss' })],
    [headers[0], header(1, 'damage')], [headers[0], header(1, 'unknown')],
    [headers[0], header(0, 'scoreboard')]];
  for (const screenshots of variants) {
    const data = normaliseOcrPayload({ screenshots, players: [row] }, roster, [], { mode: 'full', imageCount: 2 });
    assert.ok(data.scanError);
    assert.deepEqual(data.players, []);
    assert.equal(data.battleId, null);
  }
  assert.equal(checkScreenshotEvidence([header(0, 'damage', { duration: '09:55' }), header(1, 'scoreboard', { duration: '9:55' })], 2).error, null);
});

test('medal ribbon and base evidence must agree; a gold crown does not demote Supreme MVP', () => {
  const data = normaliseOcrPayload({ players: [{ ...row, medal: 'mvp', medalBase: 'supreme', mvpRibbon: true }] }, roster);
  assert.equal(data.players[0].medal, 'supreme_mvp');
  const unknown = normaliseOcrPayload({ players: [{ ...row, medal: 'mvp', medalBase: null, mvpRibbon: true }] }, roster);
  assert.equal(unknown.players[0].medal, null);
});

test('a valid no-roster response is not a provider transport failure', () => {
  const response = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"players":[]}' }] } }] };
  assert.deepEqual(parseOcrProviderResponse(response).players, []);
});

test('unconfirmed AI and pixel guesses remain candidates, while verified roster rows retain canonical heroes', () => {
  const heroes = [{ id: 108, name: 'Aulus' }, { id: 27, name: 'Sun' }];
  const data = { players: [{ sourceRow: 5, heroUsed: 'Sun', heroRecognized: true }] };
  const suggestion = { sourceRow: 5, hero: 'Aulus', confident: false, candidates: [{ name: 'Aulus' }] };
  applyVerifiedHeroMatches(data, [suggestion], heroes);
  assert.equal(data.players[0].heroUsed, null);
  assert.equal(data.players[0].heroRecognized, false);
  assert.deepEqual(data.players[0].heroCandidates, ['Aulus']);
  applyVerifiedHeroMatches(data, [{ ...suggestion, confident: true }], heroes);
  assert.equal(data.players[0].heroUsed, 'Aulus');
  assert.equal(data.players[0].heroId, 108);
  assert.equal(data.players[0].heroSource, 'portrait');
});

test('a damage-only upgrade preserves known roster identity, KDA and hero; explicit zero remains zero', () => {
  const previous = [{ playerId: 'shadow', playerName: 'Shadow as always', heroId: 108, heroUsed: 'Aulus',
    heroResolution: 'canonical', rolePlayed: 'Jungler', roleSource: 'manual', kills: 7, deaths: 4, assists: 6,
    turretDamage: 100, inGameScore: 5.5, savage: true }];
  const incoming = [{ playerId: 'shadow', heroId: null, heroUsed: '', rolePlayed: '', roleSource: 'unknown',
    kills: null, deaths: null, assists: null, damageDealt: 12345, turretDamage: 0, inGameScore: null, savage: null }];
  const [merged] = mergeRosterScanStats(previous, incoming);
  assert.equal(merged.heroUsed, 'Aulus');
  assert.equal(merged.kills, 7);
  assert.equal(merged.turretDamage, 0);
  assert.equal(merged.damageDealt, 12345);
  assert.equal(merged.roleSource, 'manual');
  assert.equal(merged.savage, true);
  assert.equal(mergeRosterScanStats(previous, [{ ...incoming[0], kills: 0, savage: false }])[0].kills, 0);
  assert.equal(mergeRosterScanStats(previous, [{ ...incoming[0], savage: false }])[0].savage, false);
  const [unchanged] = mergeRosterScanStats(previous, [{ playerId: 'guest', playerName: 'Shadow as always', heroUsed: 'Aulus', kills: 99 }]);
  assert.deepEqual(unchanged, previous[0]);
  assert.equal(previous[0].turretDamage, 100);
});
