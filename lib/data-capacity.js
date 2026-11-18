export const DATA_LIMITS = Object.freeze({ players: 50, matches: 2500, heroes: 300, bytes: 1_500_000 });

export function assertDataCapacity(data = {}) {
  for (const key of ['players', 'matches', 'heroes']) {
    if (Array.isArray(data[key]) && data[key].length > DATA_LIMITS[key]) {
      throw Object.assign(new Error(`${DATA_LIMITS[key]} ${key === 'matches' ? 'match' : key === 'players' ? 'o‘yinchi' : 'hero'} chegarasi. Yozuvlar qisqartirilmadi. To‘liq zaxirani eksport qiling; arxivlash alohida bajarilishi kerak.`), {
        status: 413, code: 'DATA_CAPACITY_EXCEEDED', collection: key, limit: DATA_LIMITS[key], actual: data[key].length
      });
    }
  }
}

// The limit applies to the compact UTF-8 document, never pretty-print whitespace.
export function encodeTeamData(data) {
  assertDataCapacity(data);
  const content = JSON.stringify(data);
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > DATA_LIMITS.bytes) {
    throw Object.assign(new Error('Cloud hujjati 1.5 MB chegaradan oshdi. Yozuvlar qisqartirilmadi. To‘liq zaxirani eksport qiling; arxivlash alohida bajarilishi kerak.'), {
      status: 413, code: 'DATA_SIZE_EXCEEDED', limitBytes: DATA_LIMITS.bytes, actualBytes: bytes
    });
  }
  return content;
}
