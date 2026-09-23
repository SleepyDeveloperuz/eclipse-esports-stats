import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Vercel may provide production variables at build time. Test subprocesses must
// receive no database credentials, user passwords, GitHub tokens or AI keys.
export function testEnvironment(input = process.env) {
  const allowed = ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ'];
  return { ...Object.fromEntries(allowed.filter(k => input[k] !== undefined).map(k => [k, input[k]])), CI: 'true', NODE_ENV: 'test' };
}

export function runChecks(directory = root) {
  const require = createRequire(resolve(directory, 'package.json'));
  const env = { ...testEnvironment(), ECLIPSE_JSDOM_PATH: require.resolve('jsdom') };
  const syntax = spawnSync(process.execPath, ['scripts/check.mjs'], { cwd: directory, env, stdio: 'inherit', timeout: 120000 });
  if (syntax.error || syntax.status !== 0) throw new Error('JavaScript syntax checks failed.');
  const files = readdirSync(resolve(directory, 'tests')).filter(f => f.endsWith('.test.js')).sort().map(f => 'tests/' + f);
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files, 'scripts/ui-regression.test.mjs'], {
    cwd: directory, env, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024
  });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error || result.status !== 0) throw new Error('Automated tests failed; deployment blocked.');
  const count = /^# tests (\d+)$/m.exec(result.stdout || '');
  if (!count || Number(count[1]) < 1 || !/^# skipped 0$/m.test(result.stdout) || !/^# cancelled 0$/m.test(result.stdout)) {
    throw new Error('Missing, skipped or cancelled tests; deployment blocked.');
  }
  console.log(`CI gate passed: ${count[1]} tests, zero skips.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runChecks();
