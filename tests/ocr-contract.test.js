import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseOcrPayload } from '../api/ocr.js';

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
