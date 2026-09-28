import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentWeek, focusBaseline, compareFocus, focusSignals } from '../js/weekly-focus-model.js';
import { progressRequest } from '../lib/progress-api.js';
import { createTeamRepository } from '../lib/team-store.js';
import { createMemoryStore } from '../lib/mlbb/store.js';

const row = { playerId: 'p1', heroUsed: 'Miya', rolePlayed: 'Gold Laner', deaths: 2, damageDealt: 60000, goldEarned: 10000 };
const week = (date, overrides = {}, count = 5) => Array.from({ length: count }, (_, i) => ({ id: `${date}-${i}`, date, scope: 'individual', matchType: 'ranked', result: 'win', durationSeconds: 600, playerStats: [{ ...row, ...overrides }] }));
const data = matches => ({ revision: 1, players: [{ id: 'p1', name: 'Player' }], matches });
test('Focus matches equal context, not unrelated roles, heroes, guest stats or casual games', () => {
  const db = data([...week('2026-09-14'), ...week('2026-09-21', { deaths: 1, damageDealt: 40000 })]);
  const before = focusBaseline(db, '2026-09-14', 'squad', 'deathsPerMinute');
  const after = focusBaseline(db, '2026-09-21', 'squad', 'deathsPerMinute');
  assert.equal(compareFocus(before, after).delta, -.1);
  assert.equal(focusSignals(db, '2026-09-21', 'squad').positive.metric, 'deathsPerMinute');
  assert.equal(focusSignals(db, '2026-09-21', 'squad').review.metric, 'damagePerMinute');
  for (const change of [{ rolePlayed: 'Roamer' }, { heroUsed: 'Layla' }, { rolePlayed: 'unknown' }]) {
    const other = data([...week('2026-09-14'), ...week('2026-09-21', change)]);
    assert.equal(compareFocus(focusBaseline(other, '2026-09-14', 'squad', 'deathsPerMinute'), focusBaseline(other, '2026-09-21', 'squad', 'deathsPerMinute')), null);
  }
  const mixed = data(week('2026-09-21').map(m => ({ ...m, matchType: 'casual', guestStats: [{ ...row, damageDealt: 999999 }] })));
  assert.equal(focusBaseline(mixed, '2026-09-21', 'squad', 'damagePerMinute').matches, 0);
});
test('Focus rejects small samples, missing metrics/duration, nonadjacent periods and invalid choices', () => {
  const before = focusBaseline(data(week('2026-09-14')), '2026-09-14', 'squad', 'damagePerMinute');
  for (const matches of [week('2026-09-21', {}, 4), week('2026-09-21', { damageDealt: null }), week('2026-09-21').map(m => ({ ...m, durationSeconds: null }))]) {
    assert.equal(compareFocus(before, focusBaseline(data(matches), '2026-09-21', 'squad', 'damagePerMinute')), null);
  }
  const zero = focusBaseline(data(week('2026-09-21', { deaths: 0 })), '2026-09-21', 'squad', 'deathsPerMinute');
  assert.equal(zero.cohorts[0].mean, 0);
  assert.equal(compareFocus({ ...zero, start: '2026-09-07' }, zero), null);
  assert.throws(() => focusBaseline(data([]), '2026-09-31', 'squad', 'damagePerMinute'));
  assert.throws(() => focusBaseline(data([]), '2026-09-21', 'all', 'damagePerMinute'));
  assert.throws(() => focusBaseline(data([]), '2026-09-21', 'squad', 'invented'));
  assert.equal(adjacentWeek('2026-01-01', -1), '2025-12-22');
});
test('Focus API is captain-only, revision guarded, server-derived, and survives publish/unpublish', async () => {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  const start = adjacentWeek(date, 0), prior = adjacentWeek(date, -1);
  const initial = data([...week(prior), ...week(start)]);
  const repo = createTeamRepository({ store: createMemoryStore(), key: 'focus', seed: async () => ({ 'eclipse_data.json': { content: JSON.stringify(initial) } }) });
  const call = async (method, body, role = 'admin', query = {}) => {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(b) { this.body = b; return this; } };
    await repo.transaction(() => progressRequest({ method, body, query }, res, { role })); return res;
  };
  const body = { action: 'save_weekly_focus', date, scope: 'squad', task: 'Review one death after each match.', metric: 'deathsPerMinute', expectedRevision: 1, expectedFocusRevision: 0, baseline: { forged: true } };
  assert.equal((await call('PATCH', body, 'viewer')).statusCode, 403);
  assert.equal((await call('PATCH', { ...body, expectedRevision: 0 })).statusCode, 409);
  assert.equal((await call('PATCH', { ...body, task: ' ' })).statusCode, 400);
  assert.equal((await call('PATCH', { ...body, task: 'a'.repeat(281) })).statusCode, 400);
  assert.equal((await call('PATCH', { ...body, date: prior })).statusCode, 400);
  const saved = await call('PATCH', body);
  assert.equal(saved.statusCode, 200); assert.equal(saved.body.focuses[0].baseline.start, prior);
  assert.equal(saved.body.focuses[0].baseline.forged, undefined);
  assert.equal((await call('PATCH', body)).statusCode, 409);
  for (const action of ['publish_weekly', 'unpublish_weekly']) assert.equal((await call('PATCH', { ...body, action })).statusCode, 200);
  const visible = await call('GET', null, 'viewer', { feature: 'weekly' });
  assert.equal(visible.body.focuses.length, 1); assert.equal(visible.body.focusRevision, 1);
  const updated = await call('PATCH', { ...body, expectedFocusRevision: 1, task: 'Updated task' });
  assert.deepEqual(updated.body.focuses[0].baseline, saved.body.focuses[0].baseline);
});
