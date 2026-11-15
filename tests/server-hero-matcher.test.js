import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptor, similarity, loadServerHeroReferences, matchScreenshotHeroes } from '../lib/server-hero-matcher.js';

test('descriptor validates 24x24 dimensions and computes circular mask', () => {
  assert.throws(() => descriptor(new Uint8ClampedArray(10)), /Ikonka o‘lchami yaroqsiz/);

  const rgba = new Uint8ClampedArray(24 * 24 * 4);
  const values = descriptor(rgba);
  assert.equal(values.length, 948);
  assert.ok(values.every(v => v === 0));
});

test('similarity measures Manhattan distance correctly', () => {
  const a = [0.1, 0.2, 0.3];
  const b = [0.1, 0.2, 0.3];
  assert.equal(similarity(a, b), 1);

  const c = [0.9, 0.8, 0.7];
  assert.ok(similarity(a, c) < 0.5);

  assert.equal(similarity(a, [0.1]), 0);
  assert.equal(similarity([], []), 0);
});

test('loadServerHeroReferences loads bundled hero references', () => {
  const refs = loadServerHeroReferences();
  assert.ok(refs.length >= 120, 'Should load at least 120 hero references');

  const bene = refs.find(h => h.name.toLowerCase() === 'benedetta');
  assert.ok(bene, 'Benedetta should be in references');
  assert.equal(bene.variants.length, 3);
  assert.equal(bene.variants[0].length, 948);

  const melissa = refs.find(h => h.name.toLowerCase() === 'melissa');
  assert.ok(melissa, 'Melissa should be in references');

  const franco = refs.find(h => h.name.toLowerCase() === 'franco');
  assert.ok(franco, 'Franco should be in references');

  const julian = refs.find(h => h.name.toLowerCase() === 'julian');
  assert.ok(julian, 'Julian should be in references');

  const johnson = refs.find(h => h.name.toLowerCase() === 'johnson');
  assert.ok(johnson, 'Johnson should be in references');
});

test('matchScreenshotHeroes handles empty or invalid buffers gracefully', () => {
  assert.deepEqual(matchScreenshotHeroes(null), []);
  assert.deepEqual(matchScreenshotHeroes(Buffer.alloc(0)), []);
  assert.deepEqual(matchScreenshotHeroes(Buffer.from('not an image')), []);
});
