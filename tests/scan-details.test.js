import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../js/scan-details.js', import.meta.url), 'utf8'), context);
const { detailRegion, create } = context.window.EclipseScanDetails;
test('badge detail region scales with supported landscape content and letterboxing', () => {
  const normal = detailRegion({ x: 0, y: 0, width: 1280, height: 576 });
  const boxed = detailRegion({ x: 50, y: 80, width: 1280, height: 576 });
  assert.ok(Math.abs(boxed.x - normal.x - 50) < 1e-8); assert.ok(Math.abs(boxed.y - normal.y - 80) < 1e-8);
  assert.equal(boxed.width, normal.width); assert.equal(boxed.height, normal.height);
  assert.ok(normal.x < 584 && normal.x + normal.width > 584);
  assert.ok(normal.y < 140 && normal.y + normal.height > 480);
});
test('unsupported shape and absent or cancelled images yield no derived detail', async () => {
  assert.equal(detailRegion({ x: 0, y: 0, width: 1280, height: 1600 }), null);
  assert.equal(detailRegion({ x: 0, y: 0, width: 100, height: 50 }), null);
  assert.equal(await create([]), null);
  assert.equal(await create(['one', 'two', 'three']), null);
  assert.equal(await create(['one'], { signal: { aborted: true } }), null);
});
