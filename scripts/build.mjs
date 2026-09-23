import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from './ci.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const STATIC_ENTRIES = Object.freeze(['index.html', 'meta-lab.html', 'offline.html', 'manifest.webmanifest', 'sw.js', 'assets', 'css', 'js', 'vendor']);
const markerName = '.eclipse-generated', marker = 'eclipse-static-output-v1\n';

function validate(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error('Static output cannot follow symlinks: ' + path);
  if (stat.isDirectory()) for (const name of readdirSync(path)) {
    if (name.startsWith('.')) throw new Error('Hidden file in public asset tree: ' + name);
    validate(join(path, name));
  }
  else if (!stat.isFile()) throw new Error('Unsupported static entry: ' + path);
}

export function buildPublic(directory = root) {
  const base = resolve(directory), output = join(base, 'public');
  // Validate every source before replacing an earlier generated output.
  for (const entry of STATIC_ENTRIES) validate(join(base, entry));
  if (existsSync(output)) {
    if (lstatSync(output).isSymbolicLink() || !lstatSync(output).isDirectory()
      || !existsSync(join(output, markerName)) || lstatSync(join(output, markerName)).isSymbolicLink()
      || readFileSync(join(output, markerName), 'utf8') !== marker) {
      throw new Error('Refusing to replace an unowned public directory.');
    }
    // Only this exact marked, generated build directory may be replaced.
    rmSync(output, { recursive: true });
  }
  mkdirSync(output);
  writeFileSync(join(output, markerName), marker);
  for (const entry of STATIC_ENTRIES) cpSync(join(base, entry), join(output, entry), { recursive: true });
  console.log('Static build ready: public/ (no tests, scripts, server sources or credentials).');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runChecks();
  buildPublic();
}
