import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const document = { addEventListener() {}, querySelectorAll: () => [] };
const context = vm.createContext({ window: {}, document, console });
for (const path of ['../js/stats.js', '../js/app.js']) {
  vm.runInContext(readFileSync(new URL(path, import.meta.url), 'utf8'), context);
}
const app = context.window.EclipseApp;
const S = context.window.StatsEngine;
const row = (overrides = {}) => ({ playerId: 'p1', heroUsed: 'Fanny', rolePlayed: 'Jungler',
  kills: 2, deaths: 1, assists: 3, inGameScore: 8,
  damageDealt: 20000, damageReceived: 8000, turretDamage: 1000, goldEarned: 12000, ...overrides });
const match = (id, overrides = {}) => ({ id, date: '2026-09-09', result: 'win',
  scope: 'individual', matchType: 'ranked', playerStats: [row()], ...overrides });

test('one missing observation does not hide known Damage or Gold', () => {
  const stats = app.getTrackedUnitStats([match('one'), match('two', { playerStats: [row({ damageDealt: null, goldEarned: null })] })]);
  assert.equal(stats.totalDamageDealt, 20000);
  assert.equal(stats.totalGoldEarned, 12000);
  assert.equal(stats.metricCoverage.damageDealt.observed, 1);
  assert.equal(stats.metricCoverage.damageDealt.appearances, 2);
  assert.equal(app.trackedMetricCoverageLabel(stats, 'damageDealt'), 'Qisman hisob · 1/2 qatnashuv');
});

test('each additive metric has independent coverage', () => {
  const stats = app.getTrackedUnitStats([match('one'), match('two', { playerStats: [row({ damageDealt: null, turretDamage: '' })] })]);
  assert.equal(stats.totalGoldEarned, 24000);
  assert.equal(stats.totalDamageReceived, 16000);
  assert.equal(stats.totalTurretDamage, 1000);
  assert.equal(app.trackedMetricCoverageLabel(stats, 'goldEarned'), 'To‘liq hisob · 2/2 qatnashuv');
  assert.equal(app.trackedMetricCoverageLabel(stats, 'turretDamage'), 'Qisman hisob · 1/2 qatnashuv');
});

test('all unknown and invalid values remain null, not zero', () => {
  const matches = [null, undefined, '', NaN, Infinity, 'invalid'].map((value, index) =>
    match(String(index), { playerStats: [row({ damageDealt: value, goldEarned: value })] }));
  const stats = app.getTrackedUnitStats(matches);
  assert.equal(stats.totalDamageDealt, null);
  assert.equal(stats.totalGoldEarned, null);
  assert.equal(S.formatLargeNumber(stats.totalDamageDealt), '—');
  assert.equal(app.trackedMetricCoverageLabel(stats, 'damageDealt'), 'Ma’lumot yo‘q · 0/6 qatnashuv');
});

test('real zero and legacy numeric strings are known observations', () => {
  const stats = app.getTrackedUnitStats([match('zero', { playerStats: [row({ damageDealt: 0, goldEarned: '0' })] }),
    match('string', { playerStats: [row({ damageDealt: '15000', goldEarned: null })] })]);
  assert.equal(stats.totalDamageDealt, 15000);
  assert.equal(stats.totalGoldEarned, 0);
  assert.equal(stats.metricCoverage.damageDealt.observed, 2);
  assert.equal(stats.metricCoverage.goldEarned.observed, 1);
  assert.equal(S.formatLargeNumber(stats.totalGoldEarned), '0');
});

test('guest rows do not enter tracked totals or coverage denominators', () => {
  const stats = app.getTrackedUnitStats([match('duo', { scope: 'squad',
    playerStats: [row(), row({ playerId: 'p2', damageDealt: null })],
    guestStats: [row({ playerId: 'guest', damageDealt: 999999, goldEarned: 999999 })] })]);
  assert.equal(stats.totalDamageDealt, 20000);
  assert.equal(stats.totalGoldEarned, 24000);
  assert.equal(stats.trackedAppearances, 2);
  assert.equal(stats.guestSlots, 1);
  assert.equal(stats.metricCoverage.damageDealt.appearances, 2);
});

test('empty selection is unknown and incomplete KDA is still withheld', () => {
  const empty = app.getTrackedUnitStats([]);
  assert.equal(empty.totalDamageDealt, null);
  assert.equal(empty.totalGoldEarned, null);
  assert.equal(app.trackedMetricCoverageLabel(empty, 'damageDealt'), 'Hali qatnashuv yo‘q');
  const stats = app.getTrackedUnitStats([match('one'), match('two', { playerStats: [row({ deaths: null })] })]);
  assert.equal(stats.kda, null);
  assert.equal(stats.totalDamageDealt, 40000);
});

test('statistics and records render known totals and metric-specific coverage', () => {
  const nodes = Object.fromEntries(['statsContent', 'recordsContainer'].map(id => [id,
    { innerHTML: '', querySelectorAll: () => [], querySelector: () => null }]));
  document.getElementById = id => nodes[id] || null;
  const players = [{ id: 'p1', name: 'ECL Player', primaryRole: 'Jungler' }];
  const matches = [match('one'), match('two', { playerStats: [row({ damageDealt: null })] })];
  app.dataStore = { getPlayers: () => players, getMatches: () => matches };
  app.statsEngine = new S({});
  app.currentAnalyticsMode = 'squad';
  app.authManager = { isAdmin: () => false };
  app.renderStatistics('all');
  assert.match(nodes.statsContent.innerHTML, /20\.0K/);
  assert.match(nodes.statsContent.innerHTML, /ECL Gold: 24\.0K/);
  assert.match(nodes.statsContent.innerHTML, /Qisman hisob · 1\/2 qatnashuv/);
  assert.match(nodes.statsContent.innerHTML, /To‘liq hisob · 2\/2 qatnashuv/);
  app.renderRecords(matches, players);
  assert.match(nodes.recordsContainer.innerHTML, /20\.0K/);
  assert.match(nodes.recordsContainer.innerHTML, /Qisman hisob · 1\/2 qatnashuv/);
  assert.match(nodes.recordsContainer.innerHTML, /To‘liq hisob · 2\/2 qatnashuv/);
  assert.doesNotMatch(nodes.recordsContainer.innerHTML, /NaN|undefined/);
});
