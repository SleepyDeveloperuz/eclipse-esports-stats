import { buildMedalDetail } from '../lib/ocr-details.js';
// Pure OCR evaluation: no submission handler, database calls, Telegram, or publication.
// Offline by default. --live makes at most four requests, one per selected case.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { buildOcrRequest, normaliseOcrPayload } from '../api/ocr.js';
import { requestOcrProvider } from '../lib/ocr-provider.js';
import { matchScreenshotHeroes } from '../lib/server-hero-matcher.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const live = args.includes('--live');
const label = option('--label', 'current');
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid evaluation label');
const imageDir = option('--images', null);
const snapshot = option('--snapshot', 'archive/before-last-six-removal-2026-11-15.json');
const saved = JSON.parse(readFileSync(snapshot));
const core = JSON.parse(saved.files.find(file => file.name === 'eclipse_data.json').content);
const roster = core.players.filter(player => player.active !== false);
const catalogFile = saved.files.find(file => file.name === 'eclipse_catalog.json');
const heroes = core.heroes || (catalogFile ? JSON.parse(catalogFile.content).heroes : []) || [];
const wanted = option('--cases', 'notification,reordered,zeroes,guest-decoy').split(',');
const fixture = JSON.parse(readFileSync(new URL('../tests/fixtures/ocr-golden.json', import.meta.url)));
const cases = wanted.map(id => {
  const item = fixture.cases.find(entry => entry.id === id);
  if (!item) throw new Error('Unknown case: ' + id);
  return item;
});
if (live && (cases.length > 4 || !imageDir)) throw new Error('--live requires --images and at most four cases');
const outDir = resolve('archive/ocr-evaluation');
mkdirSync(outDir, { recursive: true, mode: 0o700 });
const model = option('--model', 'gemini-3.5-flash');
const report = [];
for (const sample of cases) {
  if (args.includes('--heroes-only')) {
    if (!imageDir) throw new Error('--heroes-only requires --images (no network is used)');
    if (!sample.expectedHeroes) {
      report.push({ case: sample.id, status: 'no_verified_hero_labels' });
      continue;
    }
    const matches = await matchScreenshotHeroes(readFileSync(join(imageDir, sample.files[0])), { heroes });
    const players = sample.expectedHeroes.map(expected => {
      const row = sample.expected.players.find(player => player.matchedPlayerId === expected.matchedPlayerId);
      const actual = matches.find(match => match.sourceRow === row.sourceRow);
      return { playerId: expected.matchedPlayerId, expected: expected.heroUsed,
        candidate: actual?.hero || null, accepted: actual?.confident === true,
        correct: actual?.hero === expected.heroUsed };
    });
    const result = { case: sample.id, players,
      correctCandidates: players.filter(player => player.correct).length,
      correctAccepted: players.filter(player => player.accepted && player.correct).length,
      wrongAccepted: players.filter(player => player.accepted && !player.correct).length,
      unresolved: players.filter(player => !player.accepted).length };
    report.push(result); console.log(JSON.stringify(result));
    continue;
  }
  const cache = join(outDir, `${label}-${sample.id}.json`);
  const parts = imageDir ? sample.files.map(file => ({ inline_data: {
    mime_type: 'image/jpeg', data: readFileSync(join(imageDir, file)).toString('base64')
  } })) : [];
  const requestBody = buildOcrRequest({ mode: 'full', purpose: 'practice_submission', roster, heroes, imageParts: parts, detailPart: buildMedalDetail(parts) });
  const fingerprint = createHash('sha256').update(JSON.stringify({ model, requestBody })).digest('hex');
  let data, meta;
  if (existsSync(cache)) {
    const cached = JSON.parse(readFileSync(cache));
    if (live && cached.fingerprint !== fingerprint) throw new Error('Cache differs; choose a new label instead of overwriting it');
    ({ data, meta } = cached);
  } else if (live) {
    const env = parseEnv(readFileSync('.env.local', 'utf8'));
    const result = await requestOcrProvider({ apiKey: env.GEMINI_API_KEY?.trim(), requestBody,
      models: [model], deadlineMs: 32000, modelTimeoutMs: 32000 });
    if (!result.success) {
      console.log(JSON.stringify({ case: sample.id, success: false, attempts: result.meta.attempts }));
      continue;
    }
    const normalized = normaliseOcrPayload(result.data, roster, heroes, { mode: 'full', imageCount: parts.length });
    const { players, notes, ...match } = normalized;
    // Even the legacy baseline cache excludes all guest records and free text.
    data = { ...match, players: players.filter(row => roster.some(player => player.id === row.matchedPlayerId))
      .map(({ detectedName, highlightNotes, ...row }) => row) };
    meta = result.meta;
    writeFileSync(cache, JSON.stringify({ fingerprint, data, meta }, null, 2) + '\n', { mode: 0o600 });
  } else {
    console.log(JSON.stringify({ case: sample.id, status: 'no_cached_scan' }));
    continue;
  }
  const errors = [];
  let checked = 0;
  const compare = (path, expected, actual) => { checked++; if (actual !== expected) errors.push({ field: path, expected, actual: actual ?? null }); };
  for (const [key, expected] of Object.entries(sample.expected)) {
    if (key !== 'players') compare(key, expected, data[key]);
  }
  compare('roster_count', sample.expected.players.length, data.players.length);
  for (const expected of sample.expected.players) {
    const actual = data.players.find(row => row.matchedPlayerId === expected.matchedPlayerId) || {};
    for (const [key, value] of Object.entries(expected)) compare(`${expected.matchedPlayerId}.${key}`, value, actual[key]);
  }
  const result = { case: sample.id, checked, correct: checked - errors.length, errors, model: meta?.model };
  report.push(result);
  console.log(JSON.stringify(result));
}
writeFileSync(join(outDir, `${label}-report.json`), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
