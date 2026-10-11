import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeHeroCatalog,
  normalizeRankPayload,
  normalizeHeroDetail,
  normalizeCounterPayload
} from '../lib/mlbb/normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../tests/fixtures/gms');

const GMS_BASE_URL = 'https://api.gms.moontontech.com/api/gms/source/2669606';
const USER_AGENT = 'Eclipse-Command-Room/2.20';

const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-AppId': '2669606',
  'X-ActId': '2669607',
  'X-Lang': 'en',
  'User-Agent': USER_AGENT
};

const NO_APP_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-Lang': 'en',
  'User-Agent': USER_AGENT
};

let activeHeaders = DEFAULT_HEADERS;
let headersMode = 'with X-AppId/X-ActId';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gmsPost(sourceId, body) {
  const url = `${GMS_BASE_URL}/${sourceId}`;
  const start = Date.now();
  let res = await fetch(url, {
    method: 'POST',
    headers: activeHeaders,
    body: JSON.stringify(body)
  });
  let elapsed = Date.now() - start;

  // If rejected, retry once without X-AppId/X-ActId
  if (!res.ok && headersMode === 'with X-AppId/X-ActId') {
    console.log(`Initial POST failed with status ${res.status}. Retrying without X-AppId/X-ActId...`);
    await sleep(1000);
    const retryStart = Date.now();
    const retryRes = await fetch(url, {
      method: 'POST',
      headers: NO_APP_HEADERS,
      body: JSON.stringify(body)
    });
    elapsed = Date.now() - retryStart;
    if (retryRes.ok) {
      activeHeaders = NO_APP_HEADERS;
      headersMode = 'without X-AppId/X-ActId';
      res = retryRes;
    }
  }

  const contentType = res.headers.get('content-type') || '';
  let text = '';
  let json = null;
  try {
    text = await res.text();
    json = JSON.parse(text);
  } catch (err) {
    // Non-JSON or parse error
  }

  return {
    status: res.status,
    contentType,
    elapsed,
    text,
    json
  };
}

function trimFixture(payload, maxRecords = 3) {
  if (!payload || !payload.data || !Array.isArray(payload.data.records)) return payload;
  const sliced = payload.data.records.slice(0, maxRecords);
  return {
    ...payload,
    data: {
      ...payload.data,
      total: sliced.length,
      records: sliced
    }
  };
}

async function runProbe() {
  console.log('=== PHASE 0: MLBB GMS DIRECT PROBE ===\n');
  mkdirSync(FIXTURES_DIR, { recursive: true });

  // a) Catalog, source 2756564
  console.log('--- 1. Probing Catalog (source: 2756564) ---');
  const catalogBody = {
    pageSize: 180,
    pageIndex: 1,
    sorts: [{ data: { field: 'hero_id', order: 'asc' }, type: 'sequence' }],
    fields: ['hero_id', 'hero.data.head', 'hero.data.name', 'hero.data.smallmap']
  };
  const catalogRes = await gmsPost('2756564', catalogBody);
  console.log(`Status: ${catalogRes.status}`);
  console.log(`Content-Type: ${catalogRes.contentType}`);
  console.log(`Elapsed: ${catalogRes.elapsed} ms`);
  if (!catalogRes.json) {
    console.error('FATAL: Catalog response is not JSON:\n', catalogRes.text.slice(0, 500));
    process.exit(1);
  }
  console.log(`payload.code: ${catalogRes.json.code}`);
  console.log(`data.total: ${catalogRes.json.data?.total}`);
  console.log(`records.length: ${catalogRes.json.data?.records?.length}`);
  const firstCatalogRecord = catalogRes.json.data?.records?.[0];
  console.log('First record sample:', JSON.stringify(firstCatalogRecord));
  const hasCatalogFields = Boolean(
    firstCatalogRecord?.data?.hero_id &&
    firstCatalogRecord?.data?.hero?.data?.name &&
    firstCatalogRecord?.data?.hero?.data?.head
  );
  console.log(`First record has normalizeHeroCatalog fields: ${hasCatalogFields}`);

  let normalizedCatalog;
  try {
    normalizedCatalog = normalizeHeroCatalog(catalogRes.json, { minRecords: 100, maxRecords: 180 });
    console.log(`normalizeHeroCatalog SUCCESS: normalized ${normalizedCatalog.length} heroes.`);
  } catch (err) {
    console.error('normalizeHeroCatalog FAILED:', err);
  }

  writeFileSync(
    resolve(FIXTURES_DIR, 'catalog.json'),
    JSON.stringify(trimFixture(catalogRes.json, 3), null, 2)
  );

  const sampleHeroId = firstCatalogRecord?.data?.hero_id || 1;
  console.log(`Selected sample Hero ID for detail/matchups: ${sampleHeroId}\n`);

  await sleep(1200);

  // b) Rank (mythic, 7d), source 2756569
  console.log('--- 2. Probing Rank (mythic, 7d, source: 2756569) ---');
  const rankBody = {
    pageSize: 180,
    pageIndex: 1,
    filters: [
      { field: 'bigrank', operator: 'eq', value: '7' },
      { field: 'match_type', operator: 'eq', value: '0' }
    ],
    sorts: [{ data: { field: 'main_hero_win_rate', order: 'desc' }, type: 'sequence' }],
    fields: [
      'main_hero',
      'main_hero_appearance_rate',
      'main_hero_ban_rate',
      'main_hero_channel',
      'main_hero_win_rate',
      'main_heroid',
      'data.sub_hero.hero',
      'data.sub_hero.hero_channel',
      'data.sub_hero.increase_win_rate',
      'data.sub_hero.heroid'
    ]
  };
  const rankRes = await gmsPost('2756569', rankBody);
  console.log(`Status: ${rankRes.status}`);
  console.log(`Content-Type: ${rankRes.contentType}`);
  console.log(`Elapsed: ${rankRes.elapsed} ms`);
  if (!rankRes.json) {
    console.error('FATAL: Rank response is not JSON:\n', rankRes.text.slice(0, 500));
    process.exit(1);
  }
  console.log(`payload.code: ${rankRes.json.code}`);
  console.log(`data.total: ${rankRes.json.data?.total}`);
  console.log(`records.length: ${rankRes.json.data?.records?.length}`);
  const firstRankRecord = rankRes.json.data?.records?.[0];
  console.log('First rank record sample:', JSON.stringify(firstRankRecord));
  const hasRankFields = Boolean(
    firstRankRecord?.data?.main_heroid &&
    firstRankRecord?.data?.main_hero?.data?.name &&
    firstRankRecord?.data?.main_hero_win_rate !== undefined
  );
  console.log(`First record has normalizeRankPayload fields: ${hasRankFields}`);

  let normalizedRank;
  try {
    normalizedRank = normalizeRankPayload(rankRes.json, { rank: 'mythic', days: '7', minRecords: 80, maxRecords: 180 });
    console.log(`normalizeRankPayload SUCCESS: normalized ${normalizedRank.length} heroes.`);
  } catch (err) {
    console.error('normalizeRankPayload FAILED:', err);
  }

  writeFileSync(
    resolve(FIXTURES_DIR, 'rank-mythic-7d.json'),
    JSON.stringify(trimFixture(rankRes.json, 3), null, 2)
  );

  await sleep(1200);

  // c) Detail for sample hero id, source 2756564
  console.log(`\n--- 3. Probing Hero Detail (hero: ${sampleHeroId}, source: 2756564) ---`);
  const detailBody = {
    pageSize: 1,
    pageIndex: 1,
    filters: [{ field: 'hero_id', operator: 'eq', value: sampleHeroId }],
    sorts: [],
    object: []
  };
  const detailRes = await gmsPost('2756564', detailBody);
  console.log(`Status: ${detailRes.status}`);
  console.log(`Content-Type: ${detailRes.contentType}`);
  console.log(`Elapsed: ${detailRes.elapsed} ms`);
  if (!detailRes.json) {
    console.error('FATAL: Detail response is not JSON:\n', detailRes.text.slice(0, 500));
    process.exit(1);
  }
  console.log(`payload.code: ${detailRes.json.code}`);
  console.log(`data.total: ${detailRes.json.data?.total}`);
  console.log(`records.length: ${detailRes.json.data?.records?.length}`);
  const firstDetailRecord = detailRes.json.data?.records?.[0];
  console.log('Detail keys in data.hero.data:', Object.keys(firstDetailRecord?.data?.hero?.data || {}));
  const hasDetailFields = Boolean(
    firstDetailRecord?.data?.hero_id &&
    firstDetailRecord?.data?.hero?.data?.name
  );
  console.log(`Detail record has normalizeHeroDetail fields: ${hasDetailFields}`);

  let normalizedDetail;
  try {
    const catalogHero = normalizedCatalog?.find(h => h.id === sampleHeroId);
    normalizedDetail = normalizeHeroDetail(detailRes.json, { catalogHero });
    console.log(`normalizeHeroDetail SUCCESS for ${normalizedDetail.name} (skills: ${normalizedDetail.skills?.length}, roles: ${normalizedDetail.roles?.join(', ')}).`);
  } catch (err) {
    console.error('normalizeHeroDetail FAILED:', err);
  }

  writeFileSync(
    resolve(FIXTURES_DIR, 'detail.json'),
    JSON.stringify(trimFixture(detailRes.json, 1), null, 2)
  );

  await sleep(1200);

  // d) Counters for sample hero, source 2756569
  console.log(`\n--- 4. Probing Counters (hero: ${sampleHeroId}, mythic, 7d, source: 2756569) ---`);
  const countersBody = {
    pageSize: 1,
    pageIndex: 1,
    filters: [
      { field: 'match_type', operator: 'eq', value: '0' },
      { field: 'main_heroid', operator: 'eq', value: sampleHeroId },
      { field: 'bigrank', operator: 'eq', value: '7' }
    ],
    sorts: []
  };
  const countersRes = await gmsPost('2756569', countersBody);
  console.log(`Status: ${countersRes.status}`);
  console.log(`Content-Type: ${countersRes.contentType}`);
  console.log(`Elapsed: ${countersRes.elapsed} ms`);
  if (!countersRes.json) {
    console.error('FATAL: Counters response is not JSON:\n', countersRes.text.slice(0, 500));
    process.exit(1);
  }
  console.log(`payload.code: ${countersRes.json.code}`);
  console.log(`data.total: ${countersRes.json.data?.total}`);
  console.log(`records.length: ${countersRes.json.data?.records?.length}`);
  const firstCounterRecord = countersRes.json.data?.records?.[0];
  console.log('Counters sub_hero length:', firstCounterRecord?.data?.sub_hero?.length);
  console.log('Counters sub_hero_last length:', firstCounterRecord?.data?.sub_hero_last?.length);

  let normalizedCounters;
  try {
    normalizedCounters = normalizeCounterPayload(countersRes.json, { label: 'Hero counters' });
    console.log(`normalizeCounterPayload (counters) SUCCESS: favorable: ${normalizedCounters.favorable.length}, unfavorable: ${normalizedCounters.unfavorable.length}`);
  } catch (err) {
    console.error('normalizeCounterPayload (counters) FAILED:', err);
  }

  writeFileSync(
    resolve(FIXTURES_DIR, 'counters.json'),
    JSON.stringify(trimFixture(countersRes.json, 1), null, 2)
  );

  await sleep(1200);

  // e) Compatibility for sample hero, source 2756569
  console.log(`\n--- 5. Probing Compatibility (hero: ${sampleHeroId}, mythic, 7d, source: 2756569) ---`);
  const compatBody = {
    pageSize: 1,
    pageIndex: 1,
    filters: [
      { field: 'match_type', operator: 'eq', value: '1' },
      { field: 'main_heroid', operator: 'eq', value: sampleHeroId },
      { field: 'bigrank', operator: 'eq', value: '7' }
    ],
    sorts: []
  };
  const compatRes = await gmsPost('2756569', compatBody);
  console.log(`Status: ${compatRes.status}`);
  console.log(`Content-Type: ${compatRes.contentType}`);
  console.log(`Elapsed: ${compatRes.elapsed} ms`);
  if (!compatRes.json) {
    console.error('FATAL: Compatibility response is not JSON:\n', compatRes.text.slice(0, 500));
    process.exit(1);
  }
  console.log(`payload.code: ${compatRes.json.code}`);
  console.log(`data.total: ${compatRes.json.data?.total}`);
  console.log(`records.length: ${compatRes.json.data?.records?.length}`);
  const firstCompatRecord = compatRes.json.data?.records?.[0];
  console.log('Compat sub_hero length:', firstCompatRecord?.data?.sub_hero?.length);

  let normalizedCompat;
  try {
    normalizedCompat = normalizeCounterPayload(compatRes.json, { label: 'Hero compatibility' });
    console.log(`normalizeCounterPayload (compat) SUCCESS: favorable: ${normalizedCompat.favorable.length}`);
  } catch (err) {
    console.error('normalizeCounterPayload (compat) FAILED:', err);
  }

  writeFileSync(
    resolve(FIXTURES_DIR, 'compatibility.json'),
    JSON.stringify(trimFixture(compatRes.json, 1), null, 2)
  );

  await sleep(1200);

  // Check sortid / roadsort on catalog if requested without fields or with extra fields
  console.log('\n--- 6. Checking if catalog returns roles/lanes (sortid/roadsort) ---');
  const catalogRolesBody = {
    pageSize: 3,
    pageIndex: 1,
    sorts: [{ data: { field: 'hero_id', order: 'asc' }, type: 'sequence' }],
    fields: ['hero_id', 'hero.data.head', 'hero.data.name', 'hero.data.smallmap', 'hero.data.sortlabel', 'hero.data.roadsortlabel', 'hero.data.sortid', 'hero.data.roadsort']
  };
  const catalogRolesRes = await gmsPost('2756564', catalogRolesBody);
  const firstWithRoles = catalogRolesRes.json?.data?.records?.[0]?.data?.hero?.data;
  console.log('Roles check on catalog:');
  console.log('  sortlabel:', firstWithRoles?.sortlabel);
  console.log('  roadsortlabel:', firstWithRoles?.roadsortlabel);
  console.log('  sortid:', firstWithRoles?.sortid);
  console.log('  roadsort:', firstWithRoles?.roadsort);

  await sleep(1200);

  // 7. Hosted Rone API comparison
  console.log('\n--- 7. Hosted Rone API comparison (mythic, 7d) ---');
  const roneUrl = 'https://arena.rone.dev/api/heroes/rank?days=7&rank=mythic&sort_field=win_rate&sort_order=desc&size=180&index=1&lang=en';
  let roneRes;
  try {
    const rStart = Date.now();
    const rFetch = await fetch(roneUrl, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
    });
    console.log(`Rone HTTP status: ${rFetch.status}, elapsed: ${Date.now() - rStart} ms`);
    const roneContentType = rFetch.headers.get('content-type') || '';
    console.log(`Rone Content-Type: ${roneContentType}`);
    const rText = await rFetch.text();
    try {
      roneRes = JSON.parse(rText);
    } catch {
      console.log('Rone body snippet:', rText.slice(0, 300));
    }
  } catch (err) {
    console.error('Rone fetch error:', err.message);
  }

  if (roneRes) {
    console.log(`Rone code: ${roneRes.code}`);
    console.log(`Rone records count: ${roneRes.data?.records?.length}`);
    const roneRecords = roneRes.data?.records || [];
    const directRecords = rankRes.json?.data?.records || [];

    // Check image URLs
    const roneImageSamples = roneRecords.slice(0, 5).map(r => r.data?.main_hero?.data?.head);
    console.log('Rone image samples:', roneImageSamples);
    const usesWsrv = roneImageSamples.some(url => typeof url === 'string' && url.includes('wsrv.nl'));
    console.log(`Rone uses wsrv.nl rewritten URLs: ${usesWsrv}`);

    const roneHeroIds = roneRecords.map(r => Number(r.data?.main_heroid));
    const directHeroIds = directRecords.map(r => Number(r.data?.main_heroid));

    const roneIdSet = new Set(roneHeroIds);
    const directIdSet = new Set(directHeroIds);

    const inDirectNotRone = directHeroIds.filter(id => !roneIdSet.has(id));
    const inRoneNotDirect = roneHeroIds.filter(id => !directIdSet.has(id));
    console.log(`Hero ID set identical: ${inDirectNotRone.length === 0 && inRoneNotDirect.length === 0}`);
    if (inDirectNotRone.length || inRoneNotDirect.length) {
      console.log('In direct but not Rone:', inDirectNotRone);
      console.log('In Rone but not direct:', inRoneNotDirect);
    }

    const orderMatches = directHeroIds.length === roneHeroIds.length && directHeroIds.every((id, idx) => id === roneHeroIds[idx]);
    console.log(`Order identical: ${orderMatches}`);

    // Check rate diffs
    let maxWinRateDiff = 0;
    let maxPickRateDiff = 0;
    let maxBanRateDiff = 0;

    const roneMap = new Map(roneRecords.map(r => [Number(r.data?.main_heroid), r.data]));
    for (const d of directRecords) {
      const id = Number(d.data?.main_heroid);
      const r = roneMap.get(id);
      if (r) {
        const wrDiff = Math.abs(Number(d.data?.main_hero_win_rate) - Number(r.main_hero_win_rate));
        const prDiff = Math.abs(Number(d.data?.main_hero_appearance_rate) - Number(r.main_hero_appearance_rate));
        const brDiff = Math.abs(Number(d.data?.main_hero_ban_rate) - Number(r.main_hero_ban_rate));
        if (wrDiff > maxWinRateDiff) maxWinRateDiff = wrDiff;
        if (prDiff > maxPickRateDiff) maxPickRateDiff = prDiff;
        if (brDiff > maxBanRateDiff) maxBanRateDiff = brDiff;
      }
    }
    console.log(`Max Win Rate Diff: ${maxWinRateDiff} (within 1e-6: ${maxWinRateDiff <= 1e-6})`);
    console.log(`Max Pick Rate Diff: ${maxPickRateDiff} (within 1e-6: ${maxPickRateDiff <= 1e-6})`);
    console.log(`Max Ban Rate Diff: ${maxBanRateDiff} (within 1e-6: ${maxBanRateDiff <= 1e-6})`);
  } else {
    console.log('Could not compare with Rone (Rone API unavailable or non-JSON).');
  }

  console.log(`\nActive headers used: ${headersMode}`);
  console.log('=== PROBE COMPLETE ===');
}

runProbe().catch(err => {
  console.error('Probe encountered unexpected error:', err);
  process.exit(1);
});
