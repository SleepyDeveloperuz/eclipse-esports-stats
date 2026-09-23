/* HEIC conversion stays on this device. The decoder loads only when needed. */
(() => {
  const workerUrl = new URL('heic-worker.js?v=2.27.1', document.currentScript?.src || new URL('js/image-upload.js', document.baseURI));
  // Safari may hand us a converted JPEG while retaining the .HEIC filename.
  const isHeic = file => !['image/jpeg', 'image/png', 'image/webp'].includes(file?.type) && (/^image\/hei[cf](?:-sequence)?$/i.test(file?.type || '') || /\.hei[cf]$/i.test(file?.name || ''));
  const validate = (file, limit = 3 * 1024 * 1024) => {
    if (!isHeic(file) && !['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)) throw new Error('JPEG, PNG, WEBP yoki HEIC / HEIF rasm tanlang.');
    const max = isHeic(file) ? 8 * 1024 * 1024 : limit;
    if (!file.size || file.size > max) throw new Error(`Rasm ${max / 1024 / 1024} MB dan kichik bo‘lishi kerak.`);
  };
  const aborted = () => new DOMException('Bekor qilindi.', 'AbortError');
  async function toJpeg(file, { signal } = {}) {
    validate(file);
    if (signal?.aborted) throw aborted();
    if (!isHeic(file)) return file;
    const buffer = await file.arrayBuffer();
    if (signal?.aborted) throw aborted();
    const decoded = await new Promise((resolve, reject) => {
      const worker = new Worker(workerUrl, { type: 'module' });
      const finish = (error, data) => {
        clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker.terminate();
        error ? reject(error) : resolve(data);
      };
      const cancel = () => finish(aborted());
      const timer = setTimeout(() => finish(new Error('HEIC aylantirish vaqti tugadi. Kichikroq rasm yoki JPEG yuboring.')), 45000);
      signal?.addEventListener('abort', cancel, { once: true });
      worker.onmessage = ({ data }) => data.error ? finish(new Error(data.error)) : finish(null, data);
      worker.onerror = event => { event.preventDefault(); finish(new Error('HEIC ochilmadi. Sahifani yangilang yoki JPEG yuboring.')); };
      worker.postMessage(buffer, [buffer]);
    });
    if (signal?.aborted) throw aborted();
    const source = document.createElement('canvas'), canvas = document.createElement('canvas');
    try {
      source.width = decoded.width; source.height = decoded.height;
      source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(decoded.pixels), decoded.width, decoded.height), 0, 0);
      const scale = Math.min(1, 2560 / Math.max(decoded.width, decoded.height));
      canvas.width = Math.max(1, Math.round(decoded.width * scale)); canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of [.94, .86, .76]) {
        const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (signal?.aborted) throw aborted();
        if (jpeg?.type === 'image/jpeg' && jpeg.size && jpeg.size <= 3 * 1024 * 1024) return jpeg;
      }
      throw new Error('Aylantirilgan rasm hajmi katta. Kichikroq skrinshot yuboring.');
    } finally { source.width = source.height = canvas.width = canvas.height = 1; }
  }
  window.EclipseImageUpload = { isHeic, validate, toJpeg };
})();
