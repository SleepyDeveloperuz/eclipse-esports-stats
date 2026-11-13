/* HEIC conversion stays on this device. The decoder loads only when needed. */
(() => {
  const workerUrl = new URL('heic-worker.js?v=2.27.1', document.currentScript?.src || new URL('js/image-upload.js', document.baseURI));
  // Safari may hand us a converted JPEG while retaining the .HEIC filename.
  const isHeic = file => !['image/jpeg', 'image/png', 'image/webp'].includes(file?.type) && (/^image\/hei[cf](?:-sequence)?$/i.test(file?.type || '') || /\.hei[cf]$/i.test(file?.name || ''));
  const validate = (file, limit = 3 * 1024 * 1024) => {
    if (!isHeic(file) && !['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)) throw new Error('JPEG, PNG, WEBP yoki HEIC / HEIF rasm tanlang.');
    const max = isHeic(file) ? Math.max(8 * 1024 * 1024, limit) : limit;
    if (!file.size || file.size > max) throw new Error(`Rasm ${max / 1024 / 1024} MB dan kichik bo‘lishi kerak.`);
  };
  const aborted = () => new DOMException('Bekor qilindi.', 'AbortError');
  async function toJpeg(file, { signal, maxBytes = 3 * 1024 * 1024 } = {}) {
    validate(file, Math.max(8 * 1024 * 1024, maxBytes));
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
      for (const scaleFactor of [1, 0.75, 0.5]) {
        const scale = Math.min(1, (2560 * scaleFactor) / Math.max(decoded.width, decoded.height));
        canvas.width = Math.max(1, Math.round(decoded.width * scale)); canvas.height = Math.max(1, Math.round(decoded.height * scale));
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        for (const quality of [.94, .86, .76, .65]) {
          const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
          if (signal?.aborted) throw aborted();
          if (jpeg?.type === 'image/jpeg' && jpeg.size && jpeg.size <= maxBytes) return jpeg;
        }
      }
      throw new Error('Aylantirilgan rasm hajmi katta. Kichikroq skrinshot yuboring.');
    } finally { source.width = source.height = canvas.width = canvas.height = 1; }
  }
  async function compressScreenshot(fileOrDataUrl, { maxWidth = 1920, maxHeight = 1080, quality = 0.88, signal } = {}) {
    if (signal?.aborted) throw aborted();
    if (typeof Image === 'undefined' || typeof document === 'undefined') return fileOrDataUrl;
    let src = typeof fileOrDataUrl === 'string' ? fileOrDataUrl : null;
    let objectUrl = null;
    if (!src && fileOrDataUrl instanceof Blob) {
      try { objectUrl = URL.createObjectURL(fileOrDataUrl); src = objectUrl; }
      catch { return fileOrDataUrl; }
    }
    if (!src) return fileOrDataUrl;

    try {
      const img = new Image();
      img.src = src;
      await (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; }));
      if (signal?.aborted) throw aborted();

      const isHuge = typeof fileOrDataUrl === 'string' ? fileOrDataUrl.length > 800000 : (fileOrDataUrl.size || 0) > 600000;
      if (img.width <= maxWidth && img.height <= maxHeight && !isHuge) {
        return fileOrDataUrl;
      }

      const ratio = Math.min(1, maxWidth / img.width, maxHeight / img.height);
      const targetW = Math.max(1, Math.round(img.width * ratio));
      const targetH = Math.max(1, Math.round(img.height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, targetW, targetH);

      let compressed = null;
      try {
        compressed = canvas.toDataURL('image/webp', quality);
        if (!compressed || !compressed.startsWith('data:image/webp')) compressed = null;
      } catch { compressed = null; }

      if (!compressed) {
        compressed = canvas.toDataURL('image/jpeg', quality);
      }

      // If compressed output is still large (> 1.2 MB base64), progressively lower quality
      if (compressed && compressed.length > 1600000) {
        compressed = canvas.toDataURL('image/jpeg', 0.76);
      }
      if (compressed && compressed.length > 1600000) {
        compressed = canvas.toDataURL('image/jpeg', 0.65);
      }

      return compressed || fileOrDataUrl;
    } catch {
      return fileOrDataUrl;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }
  window.EclipseImageUpload = { isHeic, validate, toJpeg, compressScreenshot };
})();
