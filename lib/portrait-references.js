export const REFERENCE_VERSION = 1;
export const REFERENCE_MAX_AGE = 7 * 86400000;
export const REFERENCE_KEY = 'eclipse:mlbb:portrait-references:v1';
// Must match the 24x24 circular RGB descriptor in hero-matcher.js.
export const VECTOR_LENGTH = Array.from({ length: 576 }, (_, i) => Math.hypot(i % 24 - 11.5, Math.floor(i / 24) - 11.5) <= 10).filter(Boolean).length * 3;

export function normalizeReferences(records, catalog, now = Date.now()) {
  const heroes = new Map(catalog.map(hero => [Number(hero.id), hero]));
  const seen = new Set();
  return (Array.isArray(records) ? records : []).slice(0, 180).filter(record => {
    const hero = heroes.get(Number(record?.id));
    if (!hero || seen.has(Number(record.id)) || record.version !== REFERENCE_VERSION || record.image !== (hero.images?.portrait || hero.image)) return false;
    if (!Number.isSafeInteger(record.createdAt) || now - record.createdAt > REFERENCE_MAX_AGE || record.createdAt > now + 60_000) return false;
    if (typeof record.packed !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(record.packed) || record.packed.length !== Math.ceil(VECTOR_LENGTH * 3 / 3) * 4) return false;
    if (Buffer.from(record.packed, 'base64').length !== VECTOR_LENGTH * 3) return false;
    seen.add(Number(record.id)); return true;
  }).map(record => ({ id: Number(record.id), version: REFERENCE_VERSION, image: record.image, createdAt: record.createdAt, packed: record.packed }));
}
