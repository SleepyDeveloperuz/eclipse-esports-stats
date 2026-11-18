import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
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

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([\{\};:,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function bundleAssets(output) {
  const indexPath = join(output, 'index.html');
  if (!existsSync(indexPath)) return;
  const indexHtml = readFileSync(indexPath, 'utf8');
  if (!indexHtml.includes('<html') || !indexHtml.includes('js/heroes.js')) return;

  const jsFiles = [
    'heroes.js', 'date-utils.js', 'data.js', 'stats.js', 'charts.js',
    'players.js', 'match.js', 'auth.js', 'cloud.js', 'mlbb.js',
    'briefing.js', 'scan-details.js', 'image-upload.js', 'submissions.js',
    'hero-matcher.js', 'portrait-locator.js', 'match-desk.js', 'tier-board.js',
    'meta-explore.js', 'meta-decision-model.js', 'meta-decisions.js',
    'command-palette.js', 'share-card.js', 'draft-helper.js', 'scouting.js',
    'theme.js', 'app.js'
  ];

  const cssFiles = [
    'style.css', 'coach.css', 'public-meta.css', 'meta-explore.css',
    'meta-decisions.css', 'meta-qol.css'
  ];

  // 1. Bundle & minify CSS
  let bundledCss = '';
  for (const file of cssFiles) {
    const filePath = join(output, 'css', file);
    if (existsSync(filePath)) {
      bundledCss += '\n/* ' + file + ' */\n' + readFileSync(filePath, 'utf8') + '\n';
    }
  }
  const minifiedCss = minifyCss(bundledCss);
  writeFileSync(join(output, 'css', 'bundle.min.css'), minifiedCss);

  // 2. Bundle JS
  let bundledJs = '';
  for (const file of jsFiles) {
    const filePath = join(output, 'js', file);
    if (existsSync(filePath)) {
      bundledJs += '\n;\n// --- ' + file + ' ---\n' + readFileSync(filePath, 'utf8') + '\n';
    }
  }
  writeFileSync(join(output, 'js', 'bundle.min.js'), bundledJs);

  // 3. Rewrite public/index.html to use bundle assets
  const jsScriptPattern = /<script src=\"js\/heroes\.js[^\"]*\"(?: defer)?><\/script>[\s\S]*?<script src=\"js\/app\.js[^\"]*\"(?: defer)?><\/script>/;
  const cssLinkPattern = /<link rel=\"stylesheet\" href=\"css\/style\.css[^\"]*\">[\s\S]*?<link rel=\"stylesheet\" href=\"css\/meta-qol\.css[^\"]*\">/;

  const versionOf = content => createHash('sha256').update(content).digest('hex').slice(0, 16);
  const jsVersion = versionOf(bundledJs), cssVersion = versionOf(minifiedCss);
  const updatedHtml = indexHtml
    .replace(cssLinkPattern, `<link rel="stylesheet" href="css/bundle.min.css?v=${cssVersion}">`)
    .replace(jsScriptPattern, `<script src="js/bundle.min.js?v=${jsVersion}" defer></script>`);

  writeFileSync(indexPath, updatedHtml);

  // Also optimize public/meta-lab.html CSS if present
  const metaLabPath = join(output, 'meta-lab.html');
  if (existsSync(metaLabPath)) {
    const metaLabHtml = readFileSync(metaLabPath, 'utf8');
    if (metaLabHtml.includes('<html') && metaLabHtml.includes('css/style.css')) {
      const metaCssPattern = /<link rel=\"stylesheet\" href=\"\/css\/style\.css[^\"]*\">[\s\S]*?<link rel=\"stylesheet\" href=\"\/css\/meta-qol\.css[^\"]*\">/;
      const updatedMetaLab = metaLabHtml.replace(metaCssPattern, `<link rel="stylesheet" href="/css/bundle.min.css?v=${cssVersion}">`);
      writeFileSync(metaLabPath, updatedMetaLab);
    }
  }

  console.log('Production bundles generated: public/js/bundle.min.js, public/css/bundle.min.css');
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
  bundleAssets(output);
  console.log('Static build ready: public/ (no tests, scripts, server sources or credentials).');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runChecks();
  buildPublic();
}
