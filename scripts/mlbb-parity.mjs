import { fetchHeroRank as fetchDirectRank } from '../lib/mlbb/providers/moonton-gms.js';
import { fetchHeroRank as fetchRoneRank } from '../lib/mlbb/providers/rone.js';
import { MLBB_RANKS, MLBB_DAY_VALUES, MLBB_RANK_VALUES } from '../lib/mlbb/ranks.js';

function parseArgs() {
  const args = process.argv.slice(2);
  let rank = 'mythic';
  let days = '7';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rank' && args[i + 1]) {
      rank = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === '--days' && args[i + 1]) {
      days = args[i + 1];
      i++;
    }
  }
  return { rank, days };
}

async function main() {
  const { rank, days } = parseArgs();
  if (!MLBB_RANK_VALUES.has(rank)) {
    console.error(`Invalid rank: "${rank}". Valid ranks: ${[...MLBB_RANKS].join(', ')}`);
    process.exit(1);
  }
  if (!MLBB_DAY_VALUES.has(days)) {
    console.error(`Invalid days: "${days}". Valid windows: ${[...MLBB_DAY_VALUES].join(', ')}`);
    process.exit(1);
  }

  console.log(`=== MLBB Provider Parity Report (Rank: ${rank}, Days: ${days}) ===\n`);

  console.log('Fetching from direct Moonton GMS provider...');
  const tDirect = Date.now();
  let directRows;
  try {
    directRows = await fetchDirectRank({ rank, days });
    console.log(`Direct fetch succeeded in ${Date.now() - tDirect} ms (${directRows.length} heroes).`);
  } catch (err) {
    console.error('Direct fetch failed:', err.message);
    process.exit(1);
  }

  console.log('\nFetching from Rone Arena provider...');
  const tRone = Date.now();
  let roneRows;
  try {
    roneRows = await fetchRoneRank({ rank, days });
    console.log(`Rone fetch succeeded in ${Date.now() - tRone} ms (${roneRows.length} heroes).`);
  } catch (err) {
    console.error('Rone fetch failed:', err.message);
    process.exit(1);
  }

  console.log('\n--- Comparing Datasets ---');
  const directIds = directRows.map(r => r.heroId);
  const roneIds = roneRows.map(r => r.heroId);

  const directIdSet = new Set(directIds);
  const roneIdSet = new Set(roneIds);

  const onlyDirect = directIds.filter(id => !roneIdSet.has(id));
  const onlyRone = roneIds.filter(id => !directIdSet.has(id));

  console.log(`Hero count: Direct = ${directRows.length}, Rone = ${roneRows.length}`);
  console.log(`Hero ID set identical: ${onlyDirect.length === 0 && onlyRone.length === 0}`);
  if (onlyDirect.length > 0) console.log(`  Heroes only in Direct: [${onlyDirect.join(', ')}]`);
  if (onlyRone.length > 0) console.log(`  Heroes only in Rone: [${onlyRone.join(', ')}]`);

  const orderMatches = directIds.length === roneIds.length && directIds.every((id, idx) => id === roneIds[idx]);
  console.log(`Order identical (by win rate desc): ${orderMatches}`);
  if (!orderMatches) {
    const diffIndices = [];
    const minLen = Math.min(directIds.length, roneIds.length);
    for (let i = 0; i < minLen; i++) {
      if (directIds[i] !== roneIds[i]) {
        diffIndices.push({ rank: i + 1, direct: directIds[i], rone: roneIds[i] });
      }
    }
    console.log(`  Order mismatch at ${diffIndices.length} positions. First 3:`, diffIndices.slice(0, 3));
  }

  let maxWrDiff = 0;
  let maxPrDiff = 0;
  let maxBrDiff = 0;
  const roneMap = new Map(roneRows.map(r => [r.heroId, r]));

  for (const d of directRows) {
    const r = roneMap.get(d.heroId);
    if (r) {
      const wrDiff = Math.abs(d.winRate - r.winRate);
      const prDiff = Math.abs(d.pickRate - r.pickRate);
      const brDiff = Math.abs(d.banRate - r.banRate);
      if (wrDiff > maxWrDiff) maxWrDiff = wrDiff;
      if (prDiff > maxPrDiff) maxPrDiff = prDiff;
      if (brDiff > maxBrDiff) maxBrDiff = brDiff;
    }
  }

  console.log(`\nMax rate differences:`);
  console.log(`  Win Rate Max Diff:  ${maxWrDiff.toExponential(4)} (equal within 1e-6: ${maxWrDiff <= 1e-6})`);
  console.log(`  Pick Rate Max Diff: ${maxPrDiff.toExponential(4)} (equal within 1e-6: ${maxPrDiff <= 1e-6})`);
  console.log(`  Ban Rate Max Diff:  ${maxBrDiff.toExponential(4)} (equal within 1e-6: ${maxBrDiff <= 1e-6})`);

  console.log('\nImage host analysis:');
  const directImageHosts = new Set(directRows.map(r => {
    try { return new URL(r.image).hostname; } catch { return 'invalid'; }
  }));
  const roneImageHosts = new Set(roneRows.map(r => {
    try { return new URL(r.image).hostname; } catch { return 'invalid'; }
  }));
  console.log(`  Direct image hosts: [${[...directImageHosts].join(', ')}]`);
  console.log(`  Rone image hosts:   [${[...roneImageHosts].join(', ')}]`);

  console.log('\n=== Parity report complete ===');
}

main().catch(err => {
  console.error('Parity check encountered error:', err);
  process.exit(1);
});
