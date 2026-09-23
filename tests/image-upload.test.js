import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup() {
  const workers = [], timers = new Map(); let next = 0;
  const context = {
    window: {}, URL, DOMException, Uint8ClampedArray, AbortController,
    document: { currentScript: { src: 'https://eclipse.test/js/image-upload.js' }, createElement: () => ({
      getContext: () => ({ putImageData() {}, fillRect() {}, drawImage() {} }),
      toBlob: callback => callback(new Blob(['jpeg'], { type: 'image/jpeg' }))
    }) },
    ImageData: class {},
    Worker: class { constructor(url, options) { this.url = url; this.options = options; workers.push(this); } postMessage(buffer) { this.buffer = buffer; } terminate() { this.terminated = true; } },
    setTimeout: callback => { timers.set(++next, callback); return next; }, clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(readFileSync(new URL('../js/image-upload.js', import.meta.url), 'utf8'), context);
  return { api: context.window.EclipseImageUpload, workers, timers };
}
const heic = () => new File(['heic'], 'screenshot.HEIC', { type: 'image/heic' });
test('HEIC detection handles MIME and empty-MIME extensions with bounded input', () => {
  const { api } = setup();
  for (const file of [heic(), { name: 'image.HEIF', type: '', size: 10 }, { name: '', type: 'image/heic-sequence', size: 10 }]) { assert.equal(api.isHeic(file), true); api.validate(file); }
  assert.throws(() => api.validate({ type: 'image/heic', size: 9 * 1024 * 1024 }), /8 MB/);
  assert.throws(() => api.validate({ type: 'text/plain', size: 100 }), /rasm tanlang/);
  assert.throws(() => api.validate({ type: 'image/png', size: 4 * 1024 * 1024 }), /3 MB/);
  assert.equal(api.isHeic({ name: 'IMG.HEIC', type: 'image/jpeg' }), false);
});
test('ordinary images skip decoder; HEIC uses a same-origin worker and returns JPEG', async () => {
  const { api, workers, timers } = setup();
  const png = new File(['png'], 'image.png', { type: 'image/png' });
  assert.equal(await api.toJpeg(png), png); assert.equal(workers.length, 0);
  const result = api.toJpeg(heic()); await new Promise(setImmediate);
  assert.equal(workers[0].url.origin, 'https://eclipse.test'); assert.equal(workers[0].options.type, 'module');
  workers[0].onmessage({ data: { width: 1, height: 1, pixels: new ArrayBuffer(4) } });
  assert.equal((await result).type, 'image/jpeg'); assert.equal(workers[0].terminated, true); assert.equal(timers.size, 0);
});
test('cancel and timeout terminate decoder without hanging uploads', async () => {
  for (const cancel of [true, false]) {
    const { api, workers, timers } = setup(), controller = new AbortController();
    const result = api.toJpeg(heic(), { signal: controller.signal }); await new Promise(setImmediate);
    if (cancel) controller.abort(); else [...timers.values()][0]();
    await assert.rejects(result, cancel ? { name: 'AbortError' } : /vaqti tugadi/);
    assert.equal(workers[0].terminated, true); assert.equal(timers.size, 0);
  }
});
