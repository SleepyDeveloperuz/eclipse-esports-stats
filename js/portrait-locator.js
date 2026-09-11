/* Screenshot pixels stay in memory. Localization only proposes crops; never confirms a hero. */
(() => {
  const GRID = [[6,6],[12,4],[18,6],[4,12],[12,12],[20,12],[6,18],[12,20],[18,18]];
  const DETAIL_GRID = [];
  for (let y = 4; y <= 20; y += 4) for (let x = 4; x <= 20; x += 4) {
    if (Math.hypot(x - 11.5, y - 11.5) < 9.5) DETAIL_GRID.push([x, y]);
  }
  const indices = new Map(); let offset = 0;
  const FULL_GRID = [];
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    if (Math.hypot(x - 11.5, y - 11.5) <= 10) { indices.set(`${x},${y}`, offset); offset += 3; FULL_GRID.push([x, y]); }
  }
  function bank(references, grid) {
    return references.flatMap(hero => (hero.variants || []).filter(values => values.length === offset && values.every(Number.isFinite))
      .map(values => ({ id: hero.id, values: Float32Array.from(grid.flatMap(([x, y]) => {
        const i = indices.get(`${x},${y}`); return values.slice(i, i + 3);
      })) })));
  }
  function sample(pixels, width, height, rect, grid) {
    const values = new Float32Array(grid.length * 3); let index = 0;
    for (const [gx, gy] of grid) {
      const x = Math.max(0, Math.min(width - 1.001, rect.x + (gx + .5) * rect.size / 24 - .5));
      const y = Math.max(0, Math.min(height - 1.001, rect.y + (gy + .5) * rect.size / 24 - .5));
      const ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
      const a = (iy * width + ix) * 4, b = a + 4, c = a + width * 4, d = c + 4;
      for (let channel = 0; channel < 3; channel++) {
        values[index++] = ((pixels[a + channel] * (1 - dx) + pixels[b + channel] * dx) * (1 - dy)
          + (pixels[c + channel] * (1 - dx) + pixels[d + channel] * dx) * dy) / 255;
      }
    }
    return values;
  }
  function score(values, templates) {
    let best = .23 * values.length, id = null;
    for (const reference of templates) {
      let error = 0;
      for (let i = 0; i < values.length && error < best; i++) error += Math.abs(values[i] - reference.values[i]);
      if (error < best) { best = error; id = reference.id; }
    }
    return { score: id === null ? 0 : 1 - best / values.length, id };
  }
  function detail(values) {
    const means = [0, 0, 0];
    for (let i = 0; i < values.length; i++) means[i % 3] += values[i] / (values.length / 3);
    return values.reduce((sum, v, i) => sum + (v - means[i % 3]) ** 2, 0) / values.length;
  }
  function contentBounds(pixels, width, height) {
    const lit = (x, y) => { const i = (y * width + x) * 4; return pixels[i] + pixels[i + 1] + pixels[i + 2] > 65; };
    const row = y => { let n = 0; for (let x = 0; x < width; x += 4) n += lit(x, y); return n > width / 4 * .16; };
    const column = x => { let n = 0; for (let y = 0; y < height; y += 4) n += lit(x, y); return n > height / 4 * .16; };
    let top = 0, bottom = height - 1, left = 0, right = width - 1;
    while (top < bottom && !row(top)) top++;
    while (bottom > top && !row(bottom)) bottom--;
    while (left < right && !column(left)) left++;
    while (right > left && !column(right)) right--;
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }
  const yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0));
  async function locatePixels(pixels, width, height, { references = [], progress = () => {}, signal, budgetMs = 8000 } = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 240 || width > 960 || height < 100 || height > 700 || pixels?.length !== width * height * 4) return { boxes: [], reason: 'unsupported_size' };
    const bounds = contentBounds(pixels, width, height), aspect = bounds.width / bounds.height;
    if (aspect < 1.65 || aspect > 2.65 || bounds.height < 100) return { boxes: [], reason: 'unsupported_layout' };
    const templates = bank(references.map(hero => ({ ...hero, variants: hero.variants?.slice(0, 1) })), GRID);
    const fineTemplates = bank(references, DETAIL_GRID), fullTemplates = bank(references, FULL_GRID);
    if (new Set(templates.map(item => item.id)).size < 20) return { boxes: [], reason: 'incomplete_references' };
    const started = Date.now(), abort = () => signal?.aborted || Date.now() - started > Math.min(12000, budgetMs);
    const step = Math.max(3, Math.round(bounds.height / 72));
    const minY = Math.round(bounds.y + bounds.height * .12), maxY = Math.round(bounds.y + bounds.height * .89);
    const layouts = [];
    progress('Skrinshotdagi beshta ikonka qidirilmoqda…');
    for (let size = Math.round(bounds.height * .075); size <= bounds.height * .135; size += step) {
      let columnNumber = 0;
      for (let x = Math.round(bounds.x + bounds.width * .07); x <= bounds.x + bounds.width * .30; x += step) {
        if (abort()) return { boxes: [], reason: signal?.aborted ? 'cancelled' : 'time_budget' };
        const column = [];
        for (let y = minY; y + size <= maxY; y += step) {
          const values = sample(pixels, width, height, { x, y, size }, GRID);
          column.push(detail(values) > .005 ? score(values, templates) : { score: 0, id: null });
        }
        const minPitch = Math.ceil(Math.max(size * 1.08, bounds.height * .105) / step);
        const maxPitch = Math.floor(Math.min(size * 1.75, bounds.height * .17) / step);
        for (let pitch = minPitch; pitch <= maxPitch; pitch++) for (let first = 0; first + pitch * 4 < column.length; first++) {
          const rows = Array.from({ length: 5 }, (_, i) => column[first + i * pitch]);
          if (rows.some(row => row.score < .83) || new Set(rows.map(row => row.id)).size < 4) continue;
          const mean = rows.reduce((sum, row) => sum + row.score, 0) / 5;
          if (mean < .865) continue;
          layouts.push({ x, y: minY + first * step, pitch: pitch * step, size, score: mean });
        }
        if (layouts.length > 80) layouts.sort((a, b) => b.score - a.score).splice(40);
        if (++columnNumber % 8 === 0) await yieldFrame();
      }
      await yieldFrame();
    }
    if (!layouts.length) return { boxes: [], reason: 'layout_not_found' };
    layouts.sort((a, b) => b.score - a.score);
    const finalists = [];
    for (const layout of layouts) {
      if (finalists.some(other => Math.abs(other.x - layout.x) < step * 2 && Math.abs(other.y - layout.y) < step * 2)) continue;
      finalists.push(layout); if (finalists.length === 3) break;
    }
    const refined = [];
    for (const layout of finalists) {
      const rows = [];
      for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
        const nearbyIds = new Set();
        for (let dy = -step; dy <= step; dy += step) for (let dx = -step; dx <= step; dx += step) {
          for (let ds = -step; ds <= step; ds += step) {
            const values = sample(pixels, width, height, { x: layout.x + dx, y: layout.y + rowIndex * layout.pitch + dy, size: layout.size + ds }, DETAIL_GRID);
            nearbyIds.add(score(values, fineTemplates).id);
          }
        }
        const localTemplates = fullTemplates.filter(item => nearbyIds.has(item.id));
        let best = { score: 0 };
        for (let size = layout.size - step; size <= layout.size + step; size += 2) {
          for (let y = layout.y + rowIndex * layout.pitch - step; y <= layout.y + rowIndex * layout.pitch + step; y += 2) {
            for (let x = layout.x - step; x <= layout.x + step; x += 2) {
              if (x < 0 || y < 0 || x + size >= width || y + size >= height) continue;
              const values = sample(pixels, width, height, { x, y, size }, FULL_GRID);
              const found = score(values, localTemplates);
              if (detail(values) > .005 && found.score > best.score) best = { ...found, x, y, size, rowIndex };
            }
          }
        }
        rows.push(best);
        if (abort()) return { boxes: [], reason: signal?.aborted ? 'cancelled' : 'time_budget' };
        await yieldFrame();
      }
      if (rows.some(row => row.score < .86) || new Set(rows.map(row => row.id)).size < 4) continue;
      refined.push({ rows, score: rows.reduce((sum, row) => sum + row.score, 0) / 5 });
    }
    refined.sort((a, b) => b.score - a.score);
    const best = refined[0];
    if (!best || best.score < .885) return { boxes: [], reason: 'uncertain_layout' };
    // Strong alternative at another column/row is ambiguous; require a manual crop.
    if (refined.some(other => other !== best && best.score - other.score < .008 && other.rows.some((r, i) => Math.hypot(r.x - best.rows[i].x, r.y - best.rows[i].y) > r.size * .65))) return { boxes: [], reason: 'ambiguous_layout' };
    return { boxes: best.rows.map(row => ({ rowIndex: row.rowIndex, bounds: [row.y / height, row.x / width, (row.y + row.size) / height, (row.x + row.size) / width].map(n => Math.round(n * 1000)) })),
      reason: 'suggested_layout', elapsedMs: Date.now() - started, score: best.score };
  }
  async function locate(source, options = {}) {
    if (options.signal?.aborted) return { boxes: [], reason: 'cancelled' };
    const image = new Image(); image.src = source;
    try {
      await image.decode();
      if (options.signal?.aborted || image.width < 240 || image.height < 100 || image.width / image.height < 1.4 || image.width / image.height > 3.2) return { boxes: [], reason: 'unsupported_size' };
      const canvas = document.createElement('canvas'); canvas.width = Math.min(640, image.width); canvas.height = Math.round(image.height * canvas.width / image.width);
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await locatePixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, options);
    } catch (_) { return { boxes: [], reason: 'image_unavailable' }; }
  }
  window.EclipsePortraitLocator = { locate, locatePixels };
})();
