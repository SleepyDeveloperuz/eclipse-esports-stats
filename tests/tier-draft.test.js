import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEclipseTier, tierMethodology, TIER_METHOD_VERSION } from '../lib/mlbb/tier.js';

const row = extra => ({ heroId: 1, name: 'Fixture', winRate: .5, pickRate: .01, banRate: .1, ...extra });
const stamp = '2026-09-22T09:41:32.786Z';
const context = { updatedAt: stamp, now: Date.parse(stamp), rank: 'mythic', days: '7' };
const score = extra => buildEclipseTier([row(extra)], context)[0];
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/meta-ranks-2026-09-22.json', import.meta.url)));

test('draft method publishes weights, anchors, fixed thresholds and experimental limits', () => {
  const method = tierMethodology();
  assert.equal(TIER_METHOD_VERSION, 'eclipse-tier-5.0.0');
  assert.equal(method.purpose, 'draft-priority'); assert.equal(method.experimental, true);
  assert.deepEqual(method.weights, { winRate: .5, pickRate: .2, banRate: .3 });
  assert.deepEqual(method.thresholds, { SS: 70, S: 60, A: 50, B: 40, C: 30 });
  assert.equal(method.references.ban, .1);
  method.weights.winRate = 999; method.thresholds.SS = 999;
  assert.equal(tierMethodology().weights.winRate, .5); assert.equal(tierMethodology().thresholds.SS, 70);
});

test('published formula has an independently calculated neutral anchor', () => {
  const result = score({}), b = result.scoreBreakdown;
  assert.equal(b.winSignal, 50); assert.equal(b.pickSignal, 50); assert.equal(b.banSignal, 50);
  assert.deepEqual([b.winPoints, b.pickPoints, b.banPoints], [25, 10, 15]);
  assert.equal(result.eclipseScore, 50); assert.equal(result.tier, 'A');
});

test('every signal is monotonic; Pick and Ban have diminishing returns', () => {
  for (const field of ['winRate', 'pickRate', 'banRate']) {
    const values = field === 'pickRate' ? [.001, .01, .1] : [.1, .5, .9];
    const scored = values.map(value => score({ [field]: value }).scoreBreakdown.rawScore);
    assert.ok(scored[0] < scored[1] && scored[1] < scored[2], field);
  }
  for (const field of ['pickRate', 'banRate']) {
    const scored = [.01, .02, .03].map(value => score({ [field]: value }).scoreBreakdown.rawScore);
    assert.ok(scored[1] - scored[0] > scored[2] - scored[1], field);
  }
});

test('contested heroes can outrank niche high-Win heroes without rewriting Win', () => {
  const niche = row({ heroId: 1, winRate: .55, pickRate: .0005, banRate: .001 });
  const contested = row({ heroId: 2, winRate: .5, pickRate: .1, banRate: .9 });
  const result = buildEclipseTier([niche, contested], context);
  assert.equal(result[0].heroId, 2); assert.equal(result[0].tier, 'SS');
  assert.equal(result[0].winRate, .5); assert.equal(result[1].winRate, .55);
  assert.equal(result[1].visibility, 'low'); assert.equal(result[1].quality.sampleSize, null);
});

test('missing is not zero; zero Ban is valid but zero Pick is unobserved', () => {
  assert.notEqual(score({ banRate: 0 }).tier, 'U');
  for (const field of ['winRate', 'pickRate', 'banRate']) for (const value of [null, undefined, NaN, Infinity, -1, 1.01, '0.5']) {
    const r = score({ [field]: value });
    assert.equal(r.tier, 'U'); assert.equal(r.eclipseScore, null); assert.equal(r.eclipseRank, null);
    assert.deepEqual([r.scoreBreakdown.winPoints, r.scoreBreakdown.pickPoints, r.scoreBreakdown.banPoints], [null, null, null]);
  }
  assert.equal(score({ pickRate: 0 }).tier, 'U');
  assert.deepEqual(buildEclipseTier(null), []); assert.deepEqual(buildEclipseTier([]), []);
});

test('all inputs stay bounded, and weak homogeneous cohorts get no forced SS', () => {
  for (const winRate of [0, .5, 1]) for (const pickRate of [.000001, .01, 1]) for (const banRate of [0, .1, 1]) {
    const r = score({ winRate, pickRate, banRate });
    assert.ok(Number.isFinite(r.eclipseScore) && r.eclipseScore >= 0 && r.eclipseScore <= 100);
    assert.ok(r.scoreBreakdown.winPoints <= 50 && r.scoreBreakdown.pickPoints <= 20 && r.scoreBreakdown.banPoints <= 30);
  }
  const rows = Array.from({ length: 133 }, (_, i) => row({ heroId: i + 1, banRate: 0 }));
  assert.equal(new Set(buildEclipseTier(rows, context).map(r => r.tier)).size, 1);
  assert.ok(buildEclipseTier(rows, context).every(r => r.tier !== 'SS'));
});

test('tiers use unrounded scores on both sides of every boundary', () => {
  for (const edge of [30, 40, 50, 60, 70]) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 70; i++) {
      const mid = (lo + hi) / 2;
      if (score({ winRate: mid }).scoreBreakdown.rawScore < edge) lo = mid; else hi = mid;
    }
    const below = score({ winRate: lo - 1e-8 }), above = score({ winRate: hi + 1e-8 });
    assert.equal(below.eclipseScore, above.eclipseScore, 'Displayed score can round to the same value');
    assert.notEqual(below.tier, above.tier, String(edge));
    assert.ok(below.quality.borderline && above.quality.borderline);
  }
});

test('equal rates never split tiers by names or input ordering; invalid rows do not contaminate cohort', () => {
  const rows = Array.from({ length: 20 }, (_, i) => row({ heroId: i + 1, name: `Hero ${i}` }));
  const ranked = buildEclipseTier(rows, context);
  assert.deepEqual(buildEclipseTier([...rows].reverse(), context), ranked);
  assert.equal(new Set(ranked.map(r => r.tier)).size, 1);
  const withInvalid = buildEclipseTier([...rows, row({ heroId: 99, winRate: null })], context);
  assert.deepEqual(withInvalid.slice(0, -1), ranked);
  assert.equal(withInvalid.at(-1).tier, 'U');
});

test('tiny Pick medians do not create inflated draft signals; small cohorts use disclosed fallback', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row({ heroId: i + 1, pickRate: .000001 }));
  const r = buildEclipseTier(rows, context)[0];
  assert.equal(r.scoreBreakdown.pickReference, .001);
  assert.ok(r.scoreBreakdown.pickPoints < .02);
  assert.equal(score({ pickRate: .000001 }).scoreBreakdown.pickReference, .01);
});

test('stability observes all three rates, not just Win, and never alters tier', () => {
  const good = row({ winRate: .535, banRate: .2 });
  const snapshots = ['2026-09-20T09:00:00Z', '2026-09-21T09:00:00Z'].map(updatedAt => ({
    updatedAt, patchEpoch: 'p1', methodologyVersion: 'eclipse-tier-4.0.0', rows: [[1, .535, .01, .2, 'SS', 1, 90]]
  }));
  const options = { ...context, patchEpoch: 'p1', patchPublishedAt: '2026-09-01T00:00:00Z', history: { rank: 'mythic', days: '7', snapshots } };
  const stable = buildEclipseTier([good], options)[0];
  assert.equal(stable.quality.status, 'stable'); assert.equal(stable.quality.historyDays, 3);
  for (const [index, value] of [[1, .49], [2, .08], [3, .9], [3, null]]) {
    const changed = structuredClone(options); changed.history.snapshots[0].rows[0][index] = value;
    const next = buildEclipseTier([good], changed)[0];
    assert.equal(next.quality.status, 'provisional'); assert.equal(next.tier, stable.tier); assert.equal(next.eclipseScore, stable.eclipseScore);
  }
});

test('four captured public ranks are reproducible, isolated and preserve raw data', () => {
  const outputs = [];
  for (const rank of fixtures.ranks) {
    const rows = rank.rows.map(([heroId, name, winRate, pickRate, banRate]) => Object.freeze({ heroId, name, winRate, pickRate, banRate }));
    Object.freeze(rows);
    const output = buildEclipseTier(rows, { ...context, rank: rank.rank, updatedAt: rank.updatedAt });
    assert.equal(output.length, 133); assert.equal(new Set(output.map(r => r.heroId)).size, 133);
    assert.deepEqual(buildEclipseTier([...rows].reverse(), { ...context, rank: rank.rank, updatedAt: rank.updatedAt }), output);
    assert.ok(output.some(r => r.tier === 'SS'), 'This captured dataset has SS candidates, not a quota rule');
    for (const [i, r] of output.entries()) {
      const source = rows.find(s => s.heroId === r.heroId), b = r.scoreBreakdown;
      assert.deepEqual([r.winRate, r.pickRate, r.banRate], [source.winRate, source.pickRate, source.banRate]);
      assert.equal(r.eclipseRank, i + 1);
      assert.equal(Number((b.winPoints + b.pickPoints + b.banPoints).toFixed(4)), r.eclipseScore);
      if (i) assert.ok(output[i - 1].scoreBreakdown.rawScore >= b.rawScore);
    }
    outputs.push(output.map(r => [r.heroId, r.tier, r.eclipseScore]));
  }
  assert.equal(new Set(outputs.map(JSON.stringify)).size, 4);
});
