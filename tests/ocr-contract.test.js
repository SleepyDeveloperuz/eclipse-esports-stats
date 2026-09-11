import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOcrRequest, normaliseOcrPayload } from '../api/ocr.js';

const roster = [{ id: 'p1', name: 'Leader' }, { id: 'p2', name: 'Shadow' }];
const heroes = [{ name: 'Fanny', role: 'Assassin' }];

test('OCR never invents a result or duration when extraction is unknown or malformed', () => {
  const data = normaliseOcrPayload({
    result: 'victory-ish',
    duration: '15:99',
    matchType: 'classic?',
    players: [{ matchedPlayerId: 'p1', detectedName: 'Leader', heroUsed: 'Fanny' }]
  }, roster, heroes);
  assert.equal(data.result, null);
  assert.equal(data.duration, null);
  assert.equal(data.durationSeconds, null);
  assert.equal(data.matchType, null);
  assert.ok(data.reviewIssues.includes('unknown_result'));
  assert.ok(data.reviewIssues.includes('invalid_duration'));
  assert.ok(data.reviewIssues.includes('unknown_match_type'));
});

test('OCR accepts only exact MM:SS or bounded integer seconds and emits canonical duration', () => {
  const clock = normaliseOcrPayload({
    result: 'win', duration: '15:30', matchType: 'ranked',
    players: [{ matchedPlayerId: 'p1', detectedName: 'Leader', heroUsed: 'fanny' }]
  }, roster, heroes);
  assert.equal(clock.durationSeconds, 930);
  assert.equal(clock.durationFormatted, '15:30');
  assert.equal(clock.players[0].heroUsed, 'Fanny');
  assert.equal(clock.players[0].heroRecognized, false, 'catalog membership is not visual confidence');
  assert.equal(clock.players[0].heroCatalogMatch, true);
  assert.equal(clock.players[0].heroReviewRequired, true);

  const seconds = normaliseOcrPayload({
    result: 'loss', duration: 901, matchType: 'scrim',
    players: [{ matchedPlayerId: 'p2', detectedName: 'Shadow', heroUsed: 'Fanny' }]
  }, roster, heroes);
  assert.equal(seconds.duration, '15:01');
  assert.equal(seconds.durationSeconds, 901);
});

test('OCR drops duplicate participants and keeps unknown heroes explicitly unrecognized', () => {
  const data = normaliseOcrPayload({
    result: 'win', duration: null, matchType: 'ranked',
    players: [
      { matchedPlayerId: 'p1', detectedName: 'Leader', heroUsed: 'Not A Hero', kills: '4' },
      { matchedPlayerId: 'p1', detectedName: 'Leader duplicate', heroUsed: 'Fanny' },
      { detectedName: 'Guest', heroUsed: 'Fanny' }
    ]
  }, roster, heroes);
  assert.equal(data.players.length, 2);
  assert.equal(data.players[0].heroRecognized, false);
  assert.equal(data.players[0].kills, 4);
  assert.ok(data.reviewIssues.includes('duplicate_participant'));
  assert.ok(data.reviewIssues.includes('unrecognized_hero'));
});

test('OCR numeric fields reject partial strings, fractions for integer metrics, and out-of-range values', () => {
  const data = normaliseOcrPayload({
    result: 'win', duration: '12:00', matchType: 'ranked',
    players: [{
      matchedPlayerId: 'p1', detectedName: 'Leader', heroUsed: 'Fanny',
      kills: '4x', deaths: 1.5, assists: 999, inGameScore: 21,
      teamfightParticipation: 100.5, goldEarned: 1_000_001
    }]
  }, roster, heroes);
  assert.equal(data.players[0].kills, null);
  assert.equal(data.players[0].deaths, null);
  assert.equal(data.players[0].assists, null);
  assert.equal(data.players[0].inGameScore, null);
  assert.equal(data.players[0].teamfightParticipation, null);
  assert.equal(data.players[0].goldEarned, null);
});

test('production scoreboard mode never trusts model hero, lane, or portrait guesses', () => {
  const data = normaliseOcrPayload({ players: [{
    sourceRow: 3, matchedPlayerId: 'p1', detectedName: 'Leader', heroUsed: 'Fanny', heroRecognized: true,
    heroCandidates: ['Fanny'], rolePlayed: 'Jungler', portraitBox: { imageIndex: 0, bounds: [100, 200, 200, 300] },
    kills: 4, deaths: 2, assists: 8, damageDealt: 56000
  }] }, roster, heroes, { mode: 'scoreboard' });
  const row = data.players[0];
  assert.equal(row.sourceRow, 3);
  assert.equal(row.heroUsed, null);
  assert.equal(row.heroRecognized, false);
  assert.equal(row.heroCatalogMatch, false);
  assert.equal(row.heroId, null);
  assert.equal(row.heroReviewRequired, true);
  assert.deepEqual(row.heroCandidates, []);
  assert.equal(row.portraitBox, null);
  assert.equal(row.rolePlayed, null);
  assert.equal(row.damageDealt, 56000);
});

test('source rows retain original positions across reordered, unidentified, and duplicate participants', () => {
  const data = normaliseOcrPayload({ players: [
    { sourceRow: 5, detectedName: 'Guest bottom', kills: 8 },
    { sourceRow: 1, detectedName: '' },
    { sourceRow: 3, matchedPlayerId: 'p1', detectedName: 'Leader' },
    { sourceRow: 4, matchedPlayerId: 'p1', detectedName: 'Duplicate leader' }
  ] }, roster, heroes, { mode: 'scoreboard' });
  assert.deepEqual(data.players.map(row => row.sourceRow), [5, 3]);
  assert.ok(data.reviewIssues.includes('unidentified_participant'));
  assert.ok(data.reviewIssues.includes('duplicate_participant'));
});

test('missing, duplicate and invalid source rows are never inferred from array index', () => {
  const data = normaliseOcrPayload({ players: [
    { sourceRow: 2, detectedName: 'A' }, { sourceRow: 2, detectedName: 'B' },
    { detectedName: 'C' }, { sourceRow: '4', detectedName: 'D' }, { sourceRow: 6, detectedName: 'E' }
  ] }, roster, heroes, { mode: 'scoreboard' });
  assert.deepEqual(data.players.map(row => row.sourceRow), [null, null, null, null, null]);
  assert.ok(data.reviewIssues.includes('duplicate_source_row'));
  assert.ok(data.reviewIssues.includes('missing_or_invalid_source_row'));
});

test('unknown medal remains unknown and duplicate MVP marks both rows for review without guessing replacements', () => {
  const data = normaliseOcrPayload({ players: [
    { sourceRow: 1, detectedName: 'A', medal: 'mvp' },
    { sourceRow: 2, detectedName: 'B', medal: 'mvp' },
    { sourceRow: 3, detectedName: 'C', medal: 'unclear' }
  ] }, roster, heroes, { mode: 'scoreboard' });
  assert.deepEqual(data.players.map(row => row.medal), ['mvp', 'mvp', null]);
  assert.ok(data.players.every(row => row.medalReviewRequired));
  assert.ok(data.reviewIssues.includes('multiple_mvp_medals'));
});

test('hero-review mode preserves canonical candidate flow but discards invented match metrics', () => {
  const data = normaliseOcrPayload({ result: 'win', duration: '10:00', teamLords: 1, players: [{
    matchedPlayerId: 'p1', heroUsed: 'Fanny', heroRecognized: false, heroCandidates: ['Fanny', 'Imaginary', 'Fanny'],
    sourceRow: 4, kills: 10, rolePlayed: 'Jungler', damageDealt: 56000
  }] }, roster, heroes, { mode: 'hero_review' });
  assert.equal(data.players[0].heroUsed, 'Fanny');
  assert.deepEqual(data.players[0].heroCandidates, ['Fanny']);
  assert.equal(data.players[0].kills, null);
  assert.equal(data.players[0].damageDealt, null);
  assert.equal(data.players[0].sourceRow, null);
  assert.equal(data.players[0].rolePlayed, null);
  assert.equal(data.result, null);
  assert.equal(data.duration, null);
  assert.equal(data.teamLords, null);
});

test('number-focused request uses a strict nullable JSON schema without hero or lane inference', () => {
  const request = buildOcrRequest({ roster, heroes, purpose: 'practice_submission', imageParts: [{ inline_data: { data: 'image' } }] });
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.equal('temperature' in request.generationConfig, false);
  const schema = request.generationConfig.responseJsonSchema;
  const row = schema.properties.players.items;
  assert.equal(schema.additionalProperties, false);
  assert.equal(row.additionalProperties, false);
  assert.equal(schema.properties.players.maxItems, 5);
  assert.ok(row.required.includes('sourceRow'));
  assert.deepEqual(row.properties.sourceRow, { type: 'integer', minimum: 1, maximum: 5 });
  assert.ok(row.properties.medal.enum.includes(null));
  assert.deepEqual(row.properties.matchedPlayerId.enum, ['p1', 'p2', null]);
  for (const name of ['heroUsed', 'heroRecognized', 'heroCandidates', 'portraitBox', 'rolePlayed']) assert.equal(name in row.properties, false);
  assert.match(request.contents[0].parts[0].text, /Never renumber/);
  assert.match(request.contents[0].parts[0].text, /missing badges do not establish false/);
  assert.equal(request.contents[0].parts[1].inline_data.data, 'image');
});

test('hero-review schema uses canonical candidates and omits every numeric match field', () => {
  const request = buildOcrRequest({ mode: 'hero_review', roster, heroes });
  const schema = request.generationConfig.responseJsonSchema;
  const row = schema.properties.players.items.properties;
  assert.equal(schema.properties.players.maxItems, 1);
  assert.deepEqual(row.heroUsed.enum, ['Fanny', null]);
  assert.deepEqual(row.heroCandidates.items.enum, ['Fanny']);
  assert.equal('kills' in row, false);
  assert.equal('sourceRow' in row, false);
  assert.equal('result' in schema.properties, false);
});

test('non-numeric JSON values cannot masquerade as zero or one during normalization', () => {
  for (const value of [true, false, [], [4], {}, '   ']) {
    const data = normaliseOcrPayload({ players: [{ detectedName: 'Leader', kills: value }] }, roster, heroes);
    assert.equal(data.players[0].kills, null);
  }
});
