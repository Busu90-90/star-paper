import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function requiredFile(path) {
  assert(existsSync(join(root, path)), `Missing required file: ${path}`);
}

function matchConst(text, name) {
  const match = text.match(new RegExp(`const\\s+${name}\\s*=\\s*["']([^"']+)["']`));
  if (!match) fail(`Could not find ${name} in sw.js`);
  return match?.[1] || '';
}

function matchShellAssetVersion(text, assetName) {
  const escaped = assetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}\\?v=([0-9]+)`));
  if (!match) fail(`Could not find ${assetName} version in sw.js APP_SHELL`);
  return match?.[1] || '';
}

for (const path of [
  'index.html',
  'app.js',
  'supabase.js',
  'sw.js',
  'app.reports.js',
  'schema.sql',
  '_headers',
  '_redirects',
  '.netlifyignore',
  'netlify.toml',
]) {
  requiredFile(path);
}

assert(!existsSync(join(root, '.env')), 'Root .env must not exist before deploy');

for (const path of [
  '.claude',
  '.codex-inspect',
  '.codex-video-review',
  '.codex-visual',
  '.local-server.err.log',
  '.local-server.out.log',
  '.codex-proof-html-dark-mobile.png',
  '.codex-proof-html-light-mobile.png',
  '.codex-testimonials-html-dark-mobile.png',
  '.codex-testimonials-html-light-mobile.png',
]) {
  assert(!existsSync(join(root, path)), `Generated local artifact still present: ${path}`);
}

const index = read('index.html');
const app = read('app.js');
const sw = read('sw.js');
const headers = read('_headers');
const redirects = read('_redirects');
const netlifyIgnore = read('.netlifyignore');
const netlifyToml = read('netlify.toml');
const schema = read('schema.sql');
const supabase = read('supabase.js');

const shellVersion = matchConst(sw, 'SHELL_VERSION');
const appVersion = matchConst(sw, 'APP_BUNDLE_VERSION');
const reportVersion = matchConst(sw, 'REPORT_BUNDLE_VERSION');
const stylesVersion = matchShellAssetVersion(sw, 'styles.css');
const supabaseVersion = matchShellAssetVersion(sw, 'supabase.js');

assert(app.includes(`sw.js?v=${shellVersion}`), `app.js does not register sw.js?v=${shellVersion}`);
assert(index.includes(`app.js?v=${appVersion}`), `index.html does not load app.js?v=${appVersion}`);
assert(index.includes(`app.reports.js?v=${reportVersion}`), `index.html does not load app.reports.js?v=${reportVersion}`);
assert(index.includes(`styles.css?v=${stylesVersion}`), `index.html does not load styles.css?v=${stylesVersion}`);
assert(index.includes(`supabase.js?v=${supabaseVersion}`), `index.html does not load supabase.js?v=${supabaseVersion}`);

const appShellMatch = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert(Boolean(appShellMatch), 'Could not find APP_SHELL in sw.js');
if (appShellMatch) {
  const assets = new Set();
  const assetPattern = /(["'`])([^"'`]+)\1/g;
  let match;
  while ((match = assetPattern.exec(appShellMatch[1]))) {
    let asset = match[2]
      .replaceAll('${REPORT_BUNDLE_VERSION}', reportVersion)
      .replaceAll('${APP_BUNDLE_VERSION}', appVersion);
    if (!asset.startsWith('./') && !asset.startsWith('/')) continue;
    asset = asset.replace(/^[./\\]+/, '').split('?')[0].split('#')[0];
    if (asset) assets.add(asset);
  }
  for (const asset of assets) {
    assert(existsSync(join(root, asset)), `APP_SHELL asset missing on disk: ${asset}`);
  }
}

for (const route of [
  '/proof /proof.html 200',
  '/testimonials /testimonials.html 200',
  '/how-it-works /how-it-works.html 200',
]) {
  assert(redirects.includes(route), `Missing Netlify redirect: ${route}`);
}

assert(headers.includes('Content-Security-Policy:'), '_headers missing Content-Security-Policy');
assert(/\/sw\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/.test(headers), '_headers must no-store /sw.js');
assert(!/(^|\s)(https:|wss:)(?=[;\s])/.test(headers.match(/connect-src[^;\n]*[;\n]/)?.[0] || ''), 'CSP connect-src still allows broad https: or wss:');

for (const pattern of [
  '.env',
  '.codex-visual/',
  '.codex-inspect/',
  '.codex-video-review/',
  '.claude/',
  '.local-server.*.log',
  'scripts/',
  'package*.json',
  'netlify.toml',
  'mock-removal.test.mjs',
]) {
  assert(netlifyIgnore.includes(pattern), `.netlifyignore missing ${pattern}`);
}

assert(/publish\s*=\s*"\."/.test(netlifyToml), 'netlify.toml must publish the static repo root');

assert(schema.includes('DROP FUNCTION IF EXISTS public.get_email_for_username(TEXT);'), 'schema.sql must drop username-to-email lookup RPC');
assert(!/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_email_for_username/i.test(schema), 'schema.sql must not grant get_email_for_username');
assert(!/get_email_for_username/.test(index), 'index.html must not call get_email_for_username');
assert(!/get_email_for_username/.test(supabase), 'supabase.js must not call get_email_for_username');
assert(!/No cloud account was found/i.test(index), 'Forgot-password UI must not reveal missing accounts');

const sourceExtensions = new Set(['.js', '.mjs', '.html', '.css', '.sql', '.json', '.toml', '.md', '.txt']);
const excludedDirs = new Set(['.git', 'node_modules']);
function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (excludedDirs.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (sourceExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  const rel = normalize(file.slice(root.length + 1));
  if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) fail(`Possible OpenAI-style secret in ${rel}`);
  if (/SUPABASE_SERVICE_ROLE_KEY\s*=/.test(text)) fail(`Possible Supabase service-role env assignment in ${rel}`);
}

for (const asset of [
  'how-it-works.html',
  'proof.html',
  'testimonials.html',
  'assets/landing/notebook-board-desktop.webp',
  'assets/landing/notebook-board-mobile.webp',
  'assets/landing/star-mark-gold.webp',
  'star_paper_logo_pack/star_paper_32.png',
  'star_paper_logo_pack/star_paper_64.png',
  'star_paper_logo_pack/star_paper_128.png',
  'star_paper_logo_pack/star_paper_256.png',
  'star_paper_logo_pack/star_paper_512.png',
  'star_paper_logo_pack/star_paper_1024.png',
  'star_paper_logo_pack/star_paper_black.png',
  'star_paper_logo_pack/star_paper_transparent.png',
  'star_paper_logo_pack/star_paper_white.png',
]) {
  requiredFile(asset);
}

if (warnings.length) {
  console.warn('Preflight warnings:');
  for (const message of warnings) console.warn(`- ${message}`);
}

if (failures.length) {
  console.error('Preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Preflight passed: deploy hygiene, cache versions, static assets, CSP scope, and account-recovery checks are clean.');
