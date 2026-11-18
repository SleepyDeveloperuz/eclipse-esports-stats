import '../js/portrait-locator.js';
import '../js/hero-matcher.js';
import fs from 'node:fs';
import zlib from 'node:zlib';
import jpeg from 'jpeg-js';

const SIZE = 24;
let cachedReferences = null;

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buffer) {
  if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
    throw new Error('Not a PNG');
  }
  let pos = 8;
  let width = 0, height = 0, colorType = 0;
  const idatChunks = [];

  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(pos + 8);
      height = buffer.readUInt32BE(pos + 12);
      const bitDepth = buffer[pos + 16];
      colorType = buffer[pos + 17];
      if (bitDepth !== 8) throw new Error('Unsupported bit depth');
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(pos + 8, pos + 8 + len));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (!width || !height || !idatChunks.length || width * height > 12_000_000) throw new Error('Invalid or oversized PNG');
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error('Unsupported color type: ' + colorType);

  const stride = width * bpp;
  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks), { maxOutputLength: (stride + 1) * height });
  if (decompressed.length !== (stride + 1) * height) throw new Error('Invalid PNG pixel length');
  const data = new Uint8Array(width * height * 4);
  let srcOffset = 0;
  const currentScanline = new Uint8Array(stride);
  const prevScanline = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = decompressed[srcOffset++];
    for (let i = 0; i < stride; i++) {
      const raw = decompressed[srcOffset++];
      const a = i >= bpp ? currentScanline[i - bpp] : 0;
      const b = prevScanline[i];
      const c = i >= bpp ? prevScanline[i - bpp] : 0;

      let val = raw;
      if (filter === 1) val = (raw + a) & 0xFF;
      else if (filter === 2) val = (raw + b) & 0xFF;
      else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 0xFF;
      else if (filter === 4) val = (raw + paethPredictor(a, b, c)) & 0xFF;

      currentScanline[i] = val;
    }

    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const dstIdx = rowOffset + x * 4;
      const srcIdx = x * bpp;
      data[dstIdx] = currentScanline[srcIdx];
      data[dstIdx + 1] = currentScanline[srcIdx + 1];
      data[dstIdx + 2] = currentScanline[srcIdx + 2];
      data[dstIdx + 3] = bpp === 4 ? currentScanline[srcIdx + 3] : 255;
    }
    prevScanline.set(currentScanline);
  }

  return { width, height, data };
}

export function descriptor(rgba) {
  if (rgba.length !== SIZE * SIZE * 4) throw new Error('Ikonka o‘lchami yaroqsiz');
  const values = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (Math.hypot(x - 11.5, y - 11.5) > 10) continue;
      const i = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) values.push(rgba[i + c] / 255);
    }
  }
  return values;
}

export function similarity(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let error = 0;
  for (let i = 0; i < a.length; i++) error += Math.abs(a[i] - b[i]);
  return Math.max(0, 1 - error / a.length);
}

export function loadServerHeroReferences() {
  if (cachedReferences && cachedReferences.length > 0) return cachedReferences;

  try {
    const packUrl = new URL('./hero-portrait-pack.json', import.meta.url);
    if (fs.existsSync(packUrl)) {
      const pack = JSON.parse(fs.readFileSync(packUrl, 'utf8'));
      const dummyRgba = new Uint8ClampedArray(SIZE * SIZE * 4);
      const length = descriptor(dummyRgba).length;

      cachedReferences = (pack.heroes || []).map(entry => {
        try {
          const bytes = Uint8Array.from(Buffer.from(entry.packed, 'base64'));
          if (bytes.length < length * 3) return null;
          const variants = [0, 1, 2].map(i => [...bytes.slice(i * length, (i + 1) * length)].map(v => v / 255));
          return {
            id: entry.id,
            name: entry.name,
            image: entry.image,
            variants
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    }
  } catch (err) {
    console.warn('Could not load hero-portrait-pack.json:', err.message);
  }

  return cachedReferences || [];
}

export function sampleCircleDescriptor(decoded, cx, cy, r) {
  const sampled = new Uint8ClampedArray(SIZE * SIZE * 4);
  const w = decoded.width;
  const h = decoded.height;

  for (let sy = 0; sy < SIZE; sy++) {
    const py = Math.max(0, Math.min(h - 1, Math.round(cy - r + (sy + 0.5) * (2 * r) / SIZE)));
    for (let sx = 0; sx < SIZE; sx++) {
      const px = Math.max(0, Math.min(w - 1, Math.round(cx - r + (sx + 0.5) * (2 * r) / SIZE)));
      const srcIdx = (py * w + px) * 4;
      const dstIdx = (sy * SIZE + sx) * 4;
      sampled[dstIdx] = decoded.data[srcIdx];
      sampled[dstIdx + 1] = decoded.data[srcIdx + 1];
      sampled[dstIdx + 2] = decoded.data[srcIdx + 2];
      sampled[dstIdx + 3] = 255;
    }
  }

  return descriptor(sampled);
}

// Share localization, candidate ranking and acceptance rules with the website.
const { locatePixels } = globalThis.EclipsePortraitLocator;
const { rankCandidates, automaticMatch } = globalThis.HeroPortraitMath;

export function resampleImage(decoded, rect, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = Math.max(0, Math.min(decoded.width - 1.001, rect.x + (x + .5) * rect.width / width - .5));
    const py = Math.max(0, Math.min(decoded.height - 1.001, rect.y + (y + .5) * rect.height / height - .5));
    const ix = Math.floor(px), iy = Math.floor(py), dx = px - ix, dy = py - iy;
    const a = (iy * decoded.width + ix) * 4, b = a + 4, c = a + decoded.width * 4, d = c + 4;
    const target = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) data[target + channel] =
      (decoded.data[a + channel] * (1 - dx) + decoded.data[b + channel] * dx) * (1 - dy)
      + (decoded.data[c + channel] * (1 - dx) + decoded.data[d + channel] * dx) * dy;
    data[target + 3] = 255;
  }
  return { data, width, height };
}

export async function matchScreenshotHeroes(photoBuffer, { heroes = [], budgetMs = 8000 } = {}) {
  if (!photoBuffer?.length) return [];
  let decoded;
  try {
    decoded = photoBuffer[0] === 0x89 ? decodePng(photoBuffer)
      : jpeg.decode(photoBuffer, { useTArray: true, maxResolutionInMP: 12, maxMemoryUsageInMB: 96 });
  } catch { return []; }
  if (!decoded?.width || decoded.width < 240 || decoded.height < 100) return [];
  const references = loadServerHeroReferences();
  if (!references.length) return [];
  const width = Math.min(640, decoded.width), height = Math.round(decoded.height * width / decoded.width);
  const sample = resampleImage(decoded, { x: 0, y: 0, width: decoded.width, height: decoded.height }, width, height);
  const located = await locatePixels(sample.data, width, height, { references, budgetMs });
  if (located.boxes.length !== 5) return [];
  const complete = heroes.length > 0 && heroes.every(hero => references.some(ref => Number(hero.id) === ref.id && hero.name === ref.name));
  return located.boxes.map(box => {
    const [top, left, bottom, right] = box.bounds;
    const rect = { x: left * decoded.width / 1000, y: top * decoded.height / 1000,
      width: (right - left) * decoded.width / 1000, height: (bottom - top) * decoded.height / 1000 };
    const variants = [1, .92, .84].map(scale => {
      const side = Math.min(rect.width, rect.height) * scale;
      return descriptor(resampleImage(decoded, { x: rect.x + (rect.width - side) / 2,
        y: rect.y + (rect.height - side) / 2, width: side, height: side }, SIZE, SIZE).data);
    });
    const candidates = rankCandidates(variants, references);
    const best = candidates[0];
    return { sourceRow: box.rowIndex + 1, portraitBounds: box.bounds,
      hero: best?.name || null, heroId: best?.id || null, score: best?.score || 0,
      confident: automaticMatch(candidates, complete, Math.min(rect.width, rect.height)),
      candidates: candidates.map(({ name, id, score }) => ({ name, id, score })) };
  });
}
