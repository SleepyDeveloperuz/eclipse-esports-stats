import { fetchJson } from '../http.js';
import { normalizePatchFeed, ValidationError } from '../normalize.js';

const SOURCE_URL = 'https://api.gms.moontontech.com/api/gms/source/2669606/2672947';
const REQUEST_HEADERS = Object.freeze({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-AppId': '2669606',
  'X-ActId': '2669607',
  'X-Lang': 'en',
  'User-Agent': 'Eclipse-Command-Room/2.20'
});

function postSource(body, options = {}) {
  return fetchJson(SOURCE_URL, {
    method: 'POST',
    headers: REQUEST_HEADERS,
    body: JSON.stringify(body),
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs || 8_000,
    retries: 1,
    maxBytes: options.maxBytes || 7_000_000
  });
}

export async function fetchPatchFeed(options = {}) {
  const payload = await postSource({
    pageSize: 80,
    pageIndex: 1,
    // The public CMS source exposes relation IDs under data.channel. Discovering
    // the title from returned records remains our guard against a stale ID.
    filters: [{ field: 'data.channel', operator: 'hasAnyOf', value: [2678956] }],
    sorts: [{ data: { field: 'data.start_time', order: 'desc' }, type: 'sequence' }]
  }, options);
  const patches = normalizePatchFeed(payload, { now: options.now });
  if (!patches.length) throw new ValidationError('Rasmiy Patch kanali topilmadi');
  return patches;
}

export async function fetchPatchDetail(patchId, options = {}) {
  const id = Number(patchId);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Patch ID yaroqsiz');
  const payload = await postSource({
    pageSize: 1,
    pageIndex: 1,
    filters: [{ field: 'id', operator: 'eq', value: id }],
    sorts: [],
    object: []
  }, { ...options, maxBytes: 9_000_000 });
  const records = payload?.data?.records;
  if (Number(payload?.code) !== 0 || !Array.isArray(records) || records.length !== 1) {
    throw new ValidationError('Patch detail formati yaroqsiz');
  }
  const record = records[0];
  if (Number(record?.id) !== id || typeof record?.data?.body !== 'string' || record.data.body.length < 100) {
    throw new ValidationError('Patch detail to‘liq emas');
  }
  return record;
}

export const moontonNewsAttribution = Object.freeze({
  name: 'Mobile Legends: Bang Bang News',
  url: 'https://www.mobilelegends.com/news',
  official: true
});
