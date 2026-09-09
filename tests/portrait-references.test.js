import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReferences, VECTOR_LENGTH, REFERENCE_MAX_AGE } from '../lib/portrait-references.js';
const now = Date.now();
const catalog = [{ id: 134, name: 'New hero', images: { portrait: 'https://akmweb.youngjoygame.com/new.png' } }];
const reference = { id: 134, image: catalog[0].images.portrait, version: 1, createdAt: now, packed: Buffer.alloc(VECTOR_LENGTH * 3, 127).toString('base64') };
test('shared public references accept new IDs but reject stale images, variants and screenshot-shaped payloads', () => {
  assert.equal(normalizeReferences([reference], catalog, now).length, 1);
  assert.equal(normalizeReferences([{ ...reference, image: 'data:image/png;base64,private' }], catalog, now).length, 0);
  assert.equal(normalizeReferences([{ ...reference, createdAt: now - REFERENCE_MAX_AGE - 1 }], catalog, now).length, 0);
  assert.equal(normalizeReferences([{ ...reference, version: 2 }], catalog, now).length, 0);
  assert.equal(normalizeReferences([{ ...reference, packed: 'AAAA' }], catalog, now).length, 0);
  assert.equal(normalizeReferences([reference], [{ ...catalog[0], images: { portrait: 'changed' } }], now).length, 0);
  assert.equal(normalizeReferences([reference, reference], catalog, now).length, 1);
});
