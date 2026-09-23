/* Supplementary badge close-ups. Original screenshots remain the source of truth. */
(() => {
  function contentBounds(pixels, width, height) {
    const lit = (x, y) => { const i = (y * width + x) * 4; return pixels[i] + pixels[i + 1] + pixels[i + 2] > 65; };
    const row = y => { let count = 0; for (let x = 0; x < width; x += 4) count += lit(x, y); return count > width * .04; };
    const column = x => { let count = 0; for (let y = 0; y < height; y += 4) count += lit(x, y); return count > height * .04; };
    let top = 0, bottom = height - 1, left = 0, right = width - 1;
    while (top < bottom && !row(top)) top++;
    while (bottom > top && !row(bottom)) bottom--;
    while (left < right && !column(left)) left++;
    while (right > left && !column(right)) right--;
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }
  function detailRegion(bounds) {
    const aspect = bounds.width / bounds.height;
    if (aspect < 1.65 || aspect > 2.65 || bounds.width < 220 || bounds.height < 100) return null;
    // The medal column of the supported landscape results layout. Never infer
    // row IDs or values from this region: the model also sees both full images.
    return { x: bounds.x + bounds.width * .415, y: bounds.y + bounds.height * .18,
      width: bounds.width * .080, height: bounds.height * .70 };
  }
  async function create(images, { signal } = {}) {
    if (!Array.isArray(images) || !images.length || images.length > 2 || signal?.aborted) return null;
    const columns = [];
    for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
      const img = new Image(); img.src = images[imageIndex];
      try { await img.decode(); } catch { continue; }
      if (signal?.aborted) return null;
      if (img.width < 240 || img.height < 100 || img.width / img.height < 1.4 || img.width / img.height > 3.2) continue;
      const sample = document.createElement('canvas'); sample.width = Math.min(640, img.width); sample.height = Math.round(img.height * sample.width / img.width);
      const ctx = sample.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, sample.width, sample.height);
      const region = detailRegion(contentBounds(ctx.getImageData(0, 0, sample.width, sample.height).data, sample.width, sample.height));
      if (!region) continue;
      const scale = img.width / sample.width;
      columns.push({ img, imageIndex, region: Object.fromEntries(Object.entries(region).map(([key, value]) => [key, value * scale])) });
    }
    if (!columns.length || signal?.aborted) return null;
    const canvas = document.createElement('canvas'); canvas.width = columns.length * 272 + 16; canvas.height = 1060;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#071426'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#ffffff';
    columns.forEach(({ img, imageIndex, region }, index) => {
      const x = 16 + index * 272, scale = Math.min(256 / region.width, 1000 / region.height);
      ctx.fillText(`Image ${imageIndex + 1} detail`, x, 28);
      ctx.drawImage(img, region.x, region.y, region.width, region.height, x, 44, region.width * scale, region.height * scale);
    });
    for (const quality of [.88, .72, .55]) {
      const encoded = canvas.toDataURL('image/jpeg', quality);
      if (signal?.aborted) return null;
      // Leave room below the serverless request limit for metadata and originals.
      if (encoded.length <= 600000 && images.reduce((sum, image) => sum + String(image).length, 0) + encoded.length < 3900000) return encoded;
    }
    return null;
  }
  window.EclipseScanDetails = { create, detailRegion };
})();
