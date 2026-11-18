import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { formatDailyScrimSummary, formatScoutingSummary } from '../lib/telegram-bot.js';
import { buildOcrRequest, normaliseOcrPayload } from '../api/ocr.js';
import { coachContexts, coachReport } from '../js/coach-model.js';

const date = '2026-11-17';
const match = (extra = {}) => ({ id: 'fixture', date, result: 'win', ...extra });
function browser(...scripts) {
  const w = new JSDOM('<div id="scoutingContainer"></div>', { url: 'https://fixture.invalid', runScripts: 'outside-only' }).window;
  for (const name of scripts) w.eval(readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'));
  return w;
}

test('no appearances produce no radar score or invented playstyle, including stale zero averages', () => {
  const w = browser('stats', 'players');
  try {
    const manager = new w.PlayerManager({}, {}), stats = new w.StatsEngine({}).getPlayerStats([], 'p1');
    for (const source of [null, stats, { matchesPlayed: 0, avgDeaths: 0, kdaRatio: 9 }]) {
      const metrics = manager.getPlayerRadarMetrics(source);
      for (const key of ['kda', 'damage', 'farm', 'push', 'teamfight', 'survival']) {
        assert.equal(metrics[key].value, '—'); assert.equal(metrics[key].score, null);
      }
      const html = manager.renderPlayerRadarSvg(metrics, 'Fixture');
      assert.doesNotMatch(html, /data-radar-series|Anchor|Vanguard|Universal|NaN|undefined/);
      assert.match(html, /Reyting hisoblanmadi/);
    }
  } finally { w.close(); }
});

test('missing radar values remain unknown, actual zero stays measured, gold share cannot invent GPM', () => {
  const w = browser('players');
  try {
    const manager = new w.PlayerManager({}, {});
    for (const unknown of [null, undefined, '', ' ', false, -1, NaN]) {
      const metrics = manager.getPlayerRadarMetrics({ matchesPlayed: 3, avgDeaths: unknown, avgGoldShare: 30 });
      assert.equal(metrics.survival.score, null); assert.equal(metrics.farm.score, null);
      assert.doesNotMatch(manager.renderPlayerRadarSvg(metrics, 'Fixture'), /data-radar-series|undefined%/);
    }
    const metrics = manager.getPlayerRadarMetrics({ matchesPlayed: 3, avgDeaths: 0, kdaRatio: '0.00',
      avgDamageShare: 0, avgGoldPerMinute: 0, avgTurretDamageShare: 0, avgTeamfightParticipation: 0 });
    assert.equal(metrics.survival.score, 100); assert.equal(metrics.kda.score, 0);
    assert.equal(metrics.farm.value, '0 GPM');
    assert.match(manager.renderPlayerRadarSvg(metrics, 'Fixture'), /data-radar-series/);
    assert.doesNotMatch(metrics.playstyle.desc, /xavfsiz pozitsiya|ustasi/);
  } finally { w.close(); }
});

test('duration groups report outcomes without asserting objective control or a power spike', () => {
  const w = browser('stats');
  try {
    const engine = new w.StatsEngine({});
    for (const matches of [[match({ durationSeconds: 500 })],
      [match({ durationSeconds: 1200, result: 'loss' }), match({ id: 'two', durationSeconds: 1400, result: 'loss' })]]) {
      const html = engine.renderDurationAnalyticsHtml(engine.getGameDurationBreakdown(matches, { scope: 'all' }));
      assert.match(html, /sababni ko‘rsatmaydi/);
      assert.doesNotMatch(html, /Lord|Turtle|Snowball|Power Spike|positioning|KUCHLI FAZA/);
    }
    const excluded = [{ status: 'draft' }, { needsReview: true }, { validForAnalytics: false }, { dataIssues: ['conflict'] }, { result: 'unknown' }];
    assert.equal(engine.getGameDurationBreakdown(excluded.map(x => match({ durationSeconds: 500, ...x })), { scope: 'all' }).hasData, false);
  } finally { w.close(); }
});

test('daily browser and Telegram reports keep missing duration outside buckets and agree at boundaries', () => {
  const w = browser('share-card');
  try {
    const values = [null, undefined, '', 0, -1, true, 72560, 'bad', 719, 720, 1080, 1081];
    const matches = values.map((durationSeconds, i) => match({ id: `m${i}`, durationSeconds }));
    matches.push(match({ duration: '12:59' }), match({ duration: '12:99' }), match({ durationFormatted: '10m 00s' }));
    const before = JSON.stringify(matches);
    const data = w.EclipseShareCard.calculateDailyScrimData(matches, date), telegram = formatDailyScrimSummary(matches, date);
    assert.equal(data.totalMatches, 15);
    assert.equal(data.earlyStats.count, 2); assert.equal(data.midStats.count, 3); assert.equal(data.lateStats.count, 1);
    assert.equal(data.unknownDuration, 9);
    for (const [label, count] of [['Early Game (<12m)', 2], ['Mid Game (12-18m)', 3], ['Late Game (>18m)', 1], ['Davomiyligi noma’lum', 9]]) {
      assert.ok(telegram.includes(`${label}: <b>${count} ta</b>`));
    }
    assert.ok(telegram.includes(data.coachVerdict));
    assert.doesNotMatch(data.coachVerdict, /Lord|Turtle|Xatolar kam|sinergiya|Snowball/);
    assert.equal(JSON.stringify(matches), before);
  } finally { w.close(); }
});

test('daily exports exclude every review hold, draft and unknown outcome without inventing a winning day', () => {
  const w = browser('share-card');
  try {
    const held = [{ status: 'draft' }, { needsReview: true }, { validForAnalytics: false }, { verificationStatus: 'needs_review' },
      { dataIssues: ['source_disagreement'] }, { dataIssues: {} }, { result: '' }].map(extra => match({ durationSeconds: 600, ...extra }));
    const data = w.EclipseShareCard.calculateDailyScrimData(held, date);
    assert.equal(data.totalMatches, 0); assert.equal(data.earlyStats.count, 0);
    assert.doesNotMatch(formatDailyScrimSummary(held, date), /100%|Turtle|Lord|MURABBIY/);
    assert.doesNotMatch(w.EclipseShareCard.generateDailyScrimText(held, date), /100%|Turtle|Lord|MURABBIY/);
  } finally { w.close(); }
});

test('scouting starts and stays empty after the last user record is deleted', () => {
  const w = browser('scouting');
  try {
    const Manager = w.ScoutingManager, manager = new Manager();
    assert.equal(manager.teams.length, 0); assert.equal(w.localStorage.length, 0);
    const team = manager.addTeam({ name: 'Fixture Rival' });
    assert.equal(team.lastPlayed, null); assert.equal(team.tier, '');
    manager.recordH2H(team.id, true); assert.equal(manager.teams[0].h2h.wins, 1);
    manager.deleteTeam(team.id); assert.equal(new Manager().teams.length, 0);
    assert.doesNotMatch(formatScoutingSummary([]), /Team Falcon|Alpha Esports|75%|3W/);
    assert.doesNotMatch(formatScoutingSummary(null), /Team Falcon|Alpha Esports/);
  } finally { w.close(); }
});

test('legacy scouting samples are preserved but excluded until an explicit fresh review', () => {
  const w = browser('scouting');
  try {
    const legacy = { id: 'scout-falcon', name: 'Edited legacy name', tier: 'S', h2h: { wins: 3, losses: 1 },
      signaturePicks: [{ heroName: 'Fanny', note: 'user addition' }], counterNotes: 'Retain this note' };
    const raw = JSON.stringify([legacy]); w.localStorage.setItem('eclipse:scouting_teams', raw);
    const manager = new w.ScoutingManager(); manager.render();
    assert.equal(w.localStorage.getItem('eclipse:scouting_teams'), raw);
    assert.match(w.document.querySelector('.scouting-telemetry').textContent, /0W - 0L/);
    assert.ok(w.document.querySelector('[data-h2h-win]').disabled);
    manager.recordH2H(legacy.id, true); assert.equal(manager.teams[0].h2h.wins, 3);
    w.document.querySelector('[data-edit-team]').click();
    const checkbox = w.document.querySelector('#scoutConfirmEvidence');
    assert.equal(checkbox.checked, false);
    w.document.querySelector('#scoutForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
    assert.equal(manager.isLegacySample(manager.teams[0]), true);
    w.document.querySelector('[data-edit-team]').click();
    w.document.querySelector('#scoutConfirmEvidence').checked = true;
    w.document.querySelector('#scoutWins').value = '1';
    w.document.querySelector('#scoutLosses').value = '0';
    w.document.querySelector('#scoutForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
    assert.equal(manager.isLegacySample(manager.teams[0]), false);
    assert.equal(manager.teams[0].h2h.wins, 1);
    assert.equal(manager.teams[0].counterNotes, legacy.counterNotes);
    assert.match(w.document.querySelector('.scouting-telemetry').textContent, /1W - 0L/);
    assert.doesNotMatch(formatScoutingSummary([legacy]), /3W|Retain this note/);
    assert.match(formatScoutingSummary(manager.teams), /Retain this note/);
  } finally { w.close(); }
});

test('scouting read or quota errors preserve stored records and never masquerade as a successful save', () => {
  const w = browser('scouting');
  try {
    w.localStorage.setItem('eclipse:scouting_teams', '{invalid');
    const invalid = new w.ScoutingManager();
    assert.ok(invalid.loadError); assert.throws(() => invalid.addTeam({ name: 'Fixture' }));
    assert.equal(w.localStorage.getItem('eclipse:scouting_teams'), '{invalid');
    w.localStorage.clear();
    const manager = new w.ScoutingManager(); manager.render();
    w.Storage.prototype.setItem = () => { throw new w.DOMException('Full', 'QuotaExceededError'); };
    w.document.querySelector('#scoutName').value = 'Unsaved Rival';
    w.document.querySelector('#scoutForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
    assert.equal(manager.teams.length, 0); assert.equal(w.document.querySelector('#scoutName').value, 'Unsaved Rival');
    assert.match(w.document.querySelector('#scoutFormError').textContent, /Saqlash bajarilmadi/);
  } finally { w.close(); }
});

test('scouting Telegram output treats names and manual notes as text, never report markup', () => {
  const output = formatScoutingSummary([{ id: 'manual', name: '<b>Fake verified</b>', signaturePicks: ['<i>Hero</i>'],
    priorityBans: ['<a>Ban</a>'], counterNotes: '<u>note</u>' }]);
  assert.match(output, /&lt;b&gt;Fake verified/); assert.match(output, /&lt;u&gt;note/);
  assert.match(formatScoutingSummary([{ name: 'Fixture' }], '<b>Missing</b>'), /&lt;b&gt;Missing/);
});

test('OCR does not request or accept retired Lord/Turtle inputs', () => {
  for (const mode of ['scoreboard', 'smart', 'hero_review']) {
    const request = buildOcrRequest({ mode, imageParts: [{ inline_data: { data: 'fixture' } }] });
    assert.doesNotMatch(JSON.stringify(request), /teamTurtles|teamLords/);
  }
  const output = normaliseOcrPayload({ teamTurtles: 4, teamLords: 2, duration: '10:00', result: 'win', players: [] });
  assert.equal(output.teamTurtles, null); assert.equal(output.teamLords, null);
});

test('Coach cannot obtain ten-match evidence by including review holds or draft matches', () => {
  const data = { players: [{ id: 'p1' }], matches: Array.from({ length: 10 }, (_, i) => match({ id: `coach${i}`, matchType: 'ranked',
    scope: 'individual', durationSeconds: 600, playerStats: [{ playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Gold Laner', deaths: i < 5 ? 1 : 9 }] })) };
  for (const hold of [{ status: 'draft' }, { dataIssues: ['conflict'] }, { verificationStatus: 'needs_review' }, { validForAnalytics: false }]) {
    const candidate = structuredClone(data); Object.assign(candidate.matches[9], hold);
    const report = coachReport(coachContexts(candidate, 'p1', 'squad', 'ranked', date).groups[0], date);
    assert.equal(report.count, 9); assert.equal(report.primary, null);
  }
});
