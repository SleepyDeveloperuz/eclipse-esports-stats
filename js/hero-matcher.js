/* Local portrait matching. Only public reference descriptors are persisted, never screenshots. */
(() => {
  const SIZE = 24, VERSION = 1, MAX_AGE = 7 * 86400000;
  function descriptor(rgba) {
    if (rgba.length !== SIZE * SIZE * 4) throw new Error('Ikonka o‘lchami yaroqsiz');
    const values = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      // Ignore portrait frame, corner badges and transparent corners.
      if (Math.hypot(x - 11.5, y - 11.5) > 10) continue;
      const i = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) values.push(rgba[i + c] / 255);
    }
    return values;
  }
  function similarity(a, b) {
    if (!a?.length || a.length !== b?.length) return 0;
    let error = 0;
    for (let i = 0; i < a.length; i++) error += Math.abs(a[i] - b[i]);
    return Math.max(0, 1 - error / a.length);
  }
  function rankCandidates(variants, references) {
    return references.map(hero => ({ id: hero.id, name: hero.name, image: hero.image,
      score: Math.max(...variants.flatMap(a => hero.variants.map(b => similarity(a, b))))
    })).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 3);
  }
  function automaticMatch(candidates, complete, cropSize) {
    // Conservative near-identical gate, NOT a calibrated confidence percentage.
    return Boolean(complete && cropSize >= 32 && candidates.length >= 2 && candidates[0].score >= .985 && candidates[0].score - candidates[1].score >= .06);
  }
  function imageVariants(image) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return [1, .92, .84].map(scale => {
      const side = Math.min(image.width, image.height) * scale;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
      return descriptor(ctx.getImageData(0, 0, SIZE, SIZE).data);
    });
  }
  async function decode(source) { const image = new Image(); image.src = source; await image.decode(); return image; }
  class HeroPortraitMatcher {
    constructor(auth) { this.auth = auth; this.records = new Map(); this.catalogAt = 0; }
    async database() {
      if (!this.databasePromise) this.databasePromise = new Promise(resolve => {
        if (!window.indexedDB) return resolve(null);
        const request = indexedDB.open('eclipse-portrait-references', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('portraits');
        request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
        request.onerror = request.onblocked = () => resolve(null);
      }).catch(() => null);
      return this.databasePromise;
    }
    async cached(key, value) {
      const db = await this.database(); if (!db) return null;
      return new Promise(resolve => {
        try {
          const tx = db.transaction('portraits', value ? 'readwrite' : 'readonly');
          const request = value ? tx.objectStore('portraits').put(value, key) : tx.objectStore('portraits').get(key);
          request.onsuccess = () => resolve(request.result || null); request.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch (_) { resolve(null); }
      });
    }
    async prepare(progress = () => {}) {
      if (this.preparing) return this.preparing;
      if (this.catalogAt && Date.now() - this.catalogAt < 300000 && this.references?.length) return;
      this.preparing = this.buildReferences(progress).finally(() => { this.preparing = null; });
      return this.preparing;
    }
    async buildReferences(progress) {
      const response = await fetch('/api/mlbb-heroes', { headers: { Authorization: `Bearer ${this.auth.getAccessToken()}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Ikonka katalogi yuklanmadi. Qahramonni qo‘lda tanlang.');
      const payload = await response.json();
      if (!Array.isArray(payload.data) || !payload.data.length) throw new Error('Ikonka katalogi bo‘sh.');
      const heroes = payload.data.filter(hero => Number.isInteger(Number(hero.id)) && Number(hero.id) > 0);
      // A captain can prepare the public references once for the whole team.
      // A missing/new/changed portrait still falls back to the canonical image.
      try {
        const shared = await fetch('/api/mlbb-references', { headers: { Authorization: `Bearer ${this.auth.getAccessToken()}` }, signal: AbortSignal.timeout(8000) });
        if (shared.ok) {
          const data = await shared.json();
          const length = descriptor(new Uint8ClampedArray(SIZE * SIZE * 4)).length;
          for (const entry of data.records || []) {
            const hero = heroes.find(hero => Number(hero.id) === entry.id);
            if (entry.version !== VERSION || !hero || entry.image !== (hero.images?.portrait || hero.image) || Date.now() - entry.createdAt > MAX_AGE || entry.createdAt > Date.now() + 60000) continue;
            const bytes = Uint8Array.from(atob(entry.packed), char => char.charCodeAt(0));
            if (bytes.length !== length * 3) continue;
            const variants = [0, 1, 2].map(index => [...bytes.slice(index * length, (index + 1) * length)].map(value => value / 255));
            this.records.set(`${VERSION}:${entry.id}:${entry.image}`, { variants, createdAt: entry.createdAt });
          }
        }
      } catch (_) { /* Shared preparation is optional, local matching remains available. */ }
      const queue = [...heroes], references = []; let done = 0, failures = 0;
      const deadline = Date.now() + 45000;
      progress(`Ikonkalar bazasi: 0 / ${heroes.length}`);
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (queue.length) {
          if (Date.now() > deadline || failures >= 8) break;
          const hero = queue.shift(); const image = hero.images?.portrait || hero.image;
          try {
            if (!image) continue;
            const key = `${VERSION}:${hero.id}:${image}`;
            let entry = this.records.get(key) || await this.cached(key);
            if (!entry?.variants?.length || Date.now() - entry.createdAt > MAX_AGE) {
              const response = await fetch(`/api/mlbb-image?id=${Number(hero.id)}`, { headers: { Authorization: `Bearer ${this.auth.getAccessToken()}` }, signal: AbortSignal.timeout(15000) });
              if (!response.ok) throw new Error('Portret mavjud emas');
              const blob = await response.blob(), url = URL.createObjectURL(blob);
              try { entry = { variants: imageVariants(await decode(url)), createdAt: Date.now() }; }
              finally { URL.revokeObjectURL(url); }
              await this.cached(key, entry);
            }
            this.records.set(key, entry);
            references.push({ id: Number(hero.id), name: hero.name, image, variants: entry.variants });
          } catch (_) { failures++; /* Missing portrait disables automatic acceptance. */ }
          finally { done++; progress(`Ikonkalar bazasi: ${done} / ${heroes.length}`); }
        }
      }));
      this.references = references; this.total = heroes.length;
      this.complete = heroes.length === payload.data.length && heroes.length === references.length;
      this.catalogAt = this.complete ? Date.now() : 0;
      if (!references.length) throw new Error('Portretlar yuklanmadi. Qahramonni qo‘lda tanlang.');
      if (this.complete && this.auth.isAdmin?.()) {
        const records = references.map(hero => {
          const entry = this.records.get(`${VERSION}:${hero.id}:${hero.image}`);
          return { id: hero.id, image: hero.image, version: VERSION, createdAt: entry.createdAt, packed: btoa(String.fromCharCode(...entry.variants.flat().map(value => Math.round(value * 255)))) };
        });
        try { await fetch('/api/mlbb-references', { method: 'POST', headers: { Authorization: `Bearer ${this.auth.getAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ records }), signal: AbortSignal.timeout(8000) }); }
        catch (_) { /* No user screenshot data is included; local result remains usable. */ }
      }
    }
    async match(source, { progress, cropSize = 0 } = {}) {
      await this.prepare(progress);
      const variants = imageVariants(await decode(source));
      const candidates = rankCandidates(variants, this.references);
      const values = variants[0];
      const means = [0, 1, 2].map(channel => values.filter((_, i) => i % 3 === channel).reduce((a, b) => a + b, 0) / (values.length / 3));
      const detail = values.reduce((sum, value, i) => sum + (value - means[i % 3]) ** 2, 0) / values.length;
      return { candidates, automatic: automaticMatch(candidates, this.complete && detail > .005, cropSize), loaded: this.references.length, total: this.total };
    }
  }
  window.HeroPortraitMatcher = HeroPortraitMatcher;
  window.HeroPortraitMath = { descriptor, similarity, rankCandidates, automaticMatch, size: SIZE };
})();
