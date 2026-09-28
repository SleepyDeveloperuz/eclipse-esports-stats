import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_FILE, qualityEvent, recordQuality, readQuality, summarizeQuality, validQualityLedger } from '../lib/scan-quality.js';
const owner = 'a'.repeat(64), empty = () => readQuality({});
const event = (id = 'fixture_quality_001') => ({ id, outcome: 'ready', elapsedMs: 1200 });
test('Scan event whitelist omits images, names, values and client claims of accepted submission', () => {
  const clean = qualityEvent({ ...event(), player: 'Secret', images: ['data:image/jpeg'], submittedAt: 'forged' });
  assert.deepEqual(clean, event());
  for (const bad of [{ id: 'short' }, { outcome: 'correct' }, { elapsedMs: -1 }, { elapsedMs: '3000' }, { elapsedMs: 600001 }]) assert.equal(qualityEvent({ ...event(), ...bad }), null);
  const ledger = recordQuality(empty(), { ...event(), baseline: true, changedFields: [], submittedAt: 'forged' }, owner);
  assert.equal(summarizeQuality(ledger).pilot.count, 0);
});
test('Accepted scan evidence is idempotent, ownership-bound and safe against late terminal events', () => {
  const first = recordQuality(empty(), event(), owner);
  assert.equal(recordQuality(first, event(), owner), first);
  assert.equal(recordQuality(first, { ...event(), baseline: true, changedFields: [] }, 'b'.repeat(64), { submitted: true }), first);
  const accepted = recordQuality(first, { ...event(), baseline: true, changedFields: ['Hero', 'Hero', 'Medal'] }, owner, { submitted: true });
  assert.equal(recordQuality(accepted, { ...event(), outcome: 'error' }, owner), accepted);
  assert.equal(recordQuality(accepted, { ...event(), baseline: true, changedFields: [] }, owner, { submitted: true }), accepted);
  assert.deepEqual(summarizeQuality(accepted).pilot, { count: 1, unchanged: 0, fields: [['Hero', 1], ['Medal', 1]] });
  assert.ok(validQualityLedger(accepted));
  assert.equal(JSON.stringify(summarizeQuality(accepted)).includes(owner), false);
});
test('Missing baselines and unknown correction fields do not masquerade as unchanged', () => {
  for (const input of [{}, { baseline: false, changedFields: [] }, { baseline: true, changedFields: ['name=Secret'] }, { baseline: true, changedFields: [], outcome: 'error' }]) {
    assert.equal(summarizeQuality(recordQuality(empty(), { ...event(), ...input }, owner, { submitted: true })).pilot.count, 0);
  }
  const acceptedFirst = recordQuality(empty(), { ...event(), baseline: true, changedFields: [] }, owner, { submitted: true });
  assert.equal(summarizeQuality(recordQuality(acceptedFirst, event(), owner)).pilot.unchanged, 1);
});
test('Bounded retention and median separate failed/cancelled attempts from successful scan timing', () => {
  let ledger = empty();
  for (let i = 0; i < 305; i++) ledger = recordQuality(ledger, { ...event(`fixture_quality_${String(i).padStart(4, '0')}`), baseline: true, changedFields: [] }, owner, { submitted: true, now: new Date(1700000000000 + i).toISOString() });
  assert.equal(ledger.entries.length, 300); assert.equal(ledger.pruned, 5);
  assert.equal(summarizeQuality(ledger).pilot.count, 30);
  assert.equal(summarizeQuality(ledger).medianMs, 1200);
  let mixed = recordQuality(empty(), event(), owner);
  mixed = recordQuality(mixed, { ...event('fixture_quality_002'), elapsedMs: 2400 }, owner);
  mixed = recordQuality(mixed, { ...event('fixture_quality_003'), outcome: 'error', elapsedMs: 30000 }, owner);
  mixed = recordQuality(mixed, { ...event('fixture_quality_004'), outcome: 'cancelled' }, owner);
  assert.equal(summarizeQuality(mixed).medianMs, 1800);
  assert.equal(summarizeQuality(mixed).failed, 1); assert.equal(summarizeQuality(mixed).cancelled, 1);
  assert.ok(validQualityLedger(readQuality({ [QUALITY_FILE]: { content: JSON.stringify(mixed) } })));
});
