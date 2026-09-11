import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setup() {
  const context = { window: {}, setTimeout };
  vm.runInNewContext(readFileSync(new URL('../js/portrait-locator.js', import.meta.url), 'utf8'), context);
  return context.window.EclipsePortraitLocator;
}
function references() {
  // Deterministic fixture descriptors; no private images or fixed production catalog size.
  return Array.from({ length: 30 }, (_, id) => ({ id: id + 1,
    variants: [Array.from({ length: 948 }, (_, index) => ((id * 29 + index * 17) % 251) / 255)] }));
}
test('unsupported shape, size and incomplete references return no crop suggestions', async () => {
  const locator = setup();
  for (const [width, height] of [[0, 0], [200, 200], [1200, 600], [400, 500]]) {
    const result = await locator.locatePixels(new Uint8ClampedArray(width * height * 4), width, height, { references: references() });
    assert.equal(result.boxes.length, 0);
  }
  const pixels = new Uint8ClampedArray(320 * 160 * 4).fill(90);
  assert.equal((await locator.locatePixels(pixels, 320, 160, { references: [] })).reason, 'incomplete_references');
});
test('flat and blank images cannot be localized as a scoreboard', async () => {
  const locator = setup();
  const dark = new Uint8ClampedArray(320 * 160 * 4);
  assert.equal((await locator.locatePixels(dark, 320, 160, { references: references() })).boxes.length, 0);
  const blue = new Uint8ClampedArray(320 * 160 * 4);
  for (let i = 0; i < blue.length; i += 4) { blue[i] = 18; blue[i + 1] = 50; blue[i + 2] = 100; blue[i + 3] = 255; }
  const result = await locator.locatePixels(blue, 320, 160, { references: references() });
  assert.equal(result.boxes.length, 0);
  assert.equal(result.reason, 'layout_not_found');
});
test('cancelled work and exhausted compute budget never return stale partial boxes', async () => {
  const locator = setup(), pixels = new Uint8ClampedArray(320 * 160 * 4).fill(90);
  const controller = new AbortController(); controller.abort();
  const cancelled = await locator.locatePixels(pixels, 320, 160, { references: references(), signal: controller.signal });
  assert.equal(cancelled.reason, 'cancelled'); assert.equal(cancelled.boxes.length, 0);
  const expired = await locator.locatePixels(pixels, 320, 160, { references: references(), budgetMs: -1 });
  assert.equal(expired.reason, 'time_budget'); assert.equal(expired.boxes.length, 0);
});
