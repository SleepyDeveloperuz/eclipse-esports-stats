import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPublic, STATIC_ENTRIES } from '../scripts/build.mjs';
import { testEnvironment } from '../scripts/ci.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'eclipse-ci-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const entry of STATIC_ENTRIES) {
    if (['assets', 'css', 'js', 'vendor'].includes(entry)) { mkdirSync(join(root, entry)); writeFileSync(join(root, entry, 'fixture.txt'), 'public asset'); }
    else writeFileSync(join(root, entry), 'public file');
  }
  return root;
}
test('CI subprocesses receive no deployment credentials or external test dependency override', () => {
  const env = testEnvironment({ PATH: '/bin', ADMIN_PASSWORD: 'secret', UPSTASH_REDIS_REST_TOKEN: 'secret', VERCEL_TOKEN: 'secret', GITHUB_TOKEN: 'secret', NODE_OPTIONS: '--require=unsafe', ECLIPSE_JSDOM_PATH: '/external', NODE_ENV: 'production' });
  assert.deepEqual(env, { PATH: '/bin', CI: 'true', NODE_ENV: 'test' });
});
test('static build copies frontend only, never backend, tests or credentials', t => {
  const root = fixture(t);
  for (const name of ['.env.local', 'server-secret.txt']) writeFileSync(join(root, name), 'not public');
  for (const name of ['api', 'lib', 'tests', 'scripts', '.github']) { mkdirSync(join(root, name)); writeFileSync(join(root, name, 'private.txt'), 'not public'); }
  buildPublic(root);
  for (const entry of STATIC_ENTRIES) assert.ok(existsSync(join(root, 'public', entry)));
  for (const entry of ['.env.local', 'server-secret.txt', 'api', 'lib', 'tests', 'scripts', '.github']) assert.equal(existsSync(join(root, 'public', entry)), false);
});
test('rebuild removes stale generated assets but refuses to replace an unowned directory', t => {
  const root = fixture(t); buildPublic(root);
  writeFileSync(join(root, 'public', 'obsolete.js'), 'stale'); buildPublic(root);
  assert.equal(existsSync(join(root, 'public', 'obsolete.js')), false);
  rmSync(join(root, 'public', '.eclipse-generated'));
  assert.throws(() => buildPublic(root), /unowned/);
  assert.equal(readFileSync(join(root, 'public', 'index.html'), 'utf8'), 'public file');
});
test('public assets cannot smuggle hidden files or symlinks into deployment', t => {
  const root = fixture(t); writeFileSync(join(root, 'js', '.env'), 'secret');
  assert.throws(() => buildPublic(root), /Hidden file/);
  rmSync(join(root, 'js', '.env')); symlinkSync(join(root, 'index.html'), join(root, 'js', 'linked.js'));
  assert.throws(() => buildPublic(root), /symlinks/);
});
test('production config runs the same gate and deploys main only', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  assert.equal(config.buildCommand, 'npm run build'); assert.equal(config.outputDirectory, 'public');
  assert.equal(config.installCommand, 'npm ci --include=dev --ignore-scripts');
  assert.deepEqual(config.git.deploymentEnabled, { main: true, '*': false });
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: npm run build/); assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /pull_request_target|secrets\.|VERCEL_TOKEN/);
});
