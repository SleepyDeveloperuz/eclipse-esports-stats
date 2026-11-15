import fs from 'node:fs';
import jpeg from 'jpeg-js';

const SIZE = 24;
let cachedReferences = null;

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

export function matchScreenshotHeroes(photoBuffer) {
  if (!photoBuffer || !photoBuffer.length) return [];

  let decoded;
  try {
    decoded = jpeg.decode(photoBuffer, { useTArray: true });
  } catch {
    return [];
  }

  if (!decoded?.width || !decoded.height || decoded.width < 200 || decoded.height < 100) {
    return [];
  }

  const references = loadServerHeroReferences();
  if (!references.length) return [];

  // MLBB scoreboard vertical row centers:
  // Usually rows start at ~28.5% and step ~12% each row
  const rowOffsets = [0.285, 0.405, 0.525, 0.645, 0.765];
  const cxTarget = Math.round(decoded.width * 0.155);
  const rTarget = Math.round(decoded.height * 0.048);

  const results = [];

  for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
    const cyApprox = Math.round(decoded.height * rowOffsets[rowIndex]);
    const candidates = [];

    // Search neighborhood around expected position
    for (let cy = cyApprox - 8; cy <= cyApprox + 8; cy += 2) {
      for (let cx = cxTarget - 8; cx <= cxTarget + 8; cx += 2) {
        for (const r of [rTarget - 2, rTarget, rTarget + 2]) {
          if (r < 10) continue;
          const desc = sampleCircleDescriptor(decoded, cx, cy, r);
          for (const ref of references) {
            const s = Math.max(...ref.variants.map(v => similarity(desc, v)));
            if (s >= 0.82) {
              candidates.push({ hero: ref.name, heroId: ref.id, score: s });
            }
          }
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    // Group by hero to get unique best scores
    const topUnique = [];
    const seen = new Set();
    for (const c of candidates) {
      if (!seen.has(c.hero)) {
        seen.add(c.hero);
        topUnique.push(c);
      }
      if (topUnique.length >= 3) break;
    }

    const best = topUnique[0] || null;
    results.push({
      sourceRow: rowIndex + 1,
      hero: best ? best.hero : null,
      heroId: best ? best.heroId : null,
      score: best ? best.score : 0,
      confident: Boolean(best && best.score >= 0.90),
      candidates: topUnique.map(t => ({ name: t.hero, id: t.heroId, score: Math.round(t.score * 1000) / 1000 }))
    });
  }

  return results;
}
