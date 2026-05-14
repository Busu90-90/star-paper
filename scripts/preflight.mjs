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

function readJson(path) {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    fail(`Could not parse ${path}: ${error.message}`);
    return null;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchConst(text, name) {
  const match = text.match(new RegExp(`const\\s+${name}\\s*=\\s*["']([^"']+)["']`));
  if (!match) fail(`Could not find ${name} in sw.js`);
  return match?.[1] || '';
}

function matchShellAssetVersion(text, assetName) {
  const escaped = escapeRegex(assetName);
  const match = text.match(new RegExp(`${escaped}\\?v=([0-9]+)`));
  if (!match) fail(`Could not find ${assetName} version in sw.js APP_SHELL`);
  return match?.[1] || '';
}

function normalizeAssetUrl(asset) {
  return `/${asset.replace(/^[./\\]+/, '').replaceAll('\\', '/')}`.split('#')[0];
}

function assetPath(assetUrl) {
  return assetUrl.split('?')[0].replace(/^\//, '');
}

function assetVersion(assetUrl) {
  return assetUrl.match(/[?&]v=([0-9]+)/)?.[1] || '';
}

function normalizeLandingTarget(target) {
  return normalizeAssetUrl(target).split('?')[0];
}

function parseIndexPublicRoutes(text) {
  const block = text.match(/var\s+publicRoutes\s*=\s*\{([\s\S]*?)\};/);
  assert(Boolean(block), 'Could not find publicRoutes map in index.html');
  const routes = new Map();
  const entryPattern = /["']([^"']+)["']\s*:\s*["']([^"']+)["']/g;
  let match;
  while (block && (match = entryPattern.exec(block[1]))) {
    routes.set(match[1], normalizeLandingTarget(match[2]));
  }
  return routes;
}

function parseSwPublicLandingPages(text) {
  const block = text.match(/const\s+PUBLIC_LANDING_PAGES\s*=\s*new\s+Map\(\[([\s\S]*?)\]\);/);
  assert(Boolean(block), 'Could not find PUBLIC_LANDING_PAGES map in sw.js');
  const routes = new Map();
  const entryPattern = /\[\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\]/g;
  let match;
  while (block && (match = entryPattern.exec(block[1]))) {
    routes.set(match[1], normalizeLandingTarget(match[2]));
  }
  return routes;
}

function assertSameMap(actual, expected, label) {
  assert(actual.size === expected.size, `${label} size drift: expected ${expected.size}, found ${actual.size}`);
  for (const [key, expectedValue] of expected) {
    assert(actual.has(key), `${label} missing route: ${key}`);
    assert(actual.get(key) === expectedValue, `${label} route drift for ${key}: expected ${expectedValue}, found ${actual.get(key) || 'missing'}`);
  }
}

function headerBlock(path) {
  const escaped = escapeRegex(path);
  return headers.match(new RegExp(`^${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=^\\S|\\s*$)`, 'm'))?.[1] || '';
}

function assertHeader(path, headerLine) {
  const block = headerBlock(path);
  assert(Boolean(block), `_headers missing ${path}`);
  assert(block.includes(headerLine), `_headers ${path} missing ${headerLine}`);
}

for (const path of [
  'package.json',
  'index.html',
  'app.js',
  'supabase.js',
  'sw.js',
  'manifest.json',
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
const manifest = readJson('manifest.json') || {};
const packageJson = readJson('package.json') || {};

const shellVersion = matchConst(sw, 'SHELL_VERSION');
const appVersion = matchConst(sw, 'APP_BUNDLE_VERSION');
const reportVersion = matchConst(sw, 'REPORT_BUNDLE_VERSION');
const stylesVersion = matchShellAssetVersion(sw, 'styles.css');
const supabaseVersion = matchShellAssetVersion(sw, 'supabase.js');
const manifestVersion = matchShellAssetVersion(sw, 'manifest.json');

assert(app.includes(`sw.js?v=${shellVersion}`), `app.js does not register sw.js?v=${shellVersion}`);
assert(index.includes(`app.js?v=${appVersion}`), `index.html does not load app.js?v=${appVersion}`);
assert(index.includes(`app.reports.js?v=${reportVersion}`), `index.html does not load app.reports.js?v=${reportVersion}`);
assert(index.includes(`styles.css?v=${stylesVersion}`), `index.html does not load styles.css?v=${stylesVersion}`);
assert(index.includes(`supabase.js?v=${supabaseVersion}`), `index.html does not load supabase.js?v=${supabaseVersion}`);
assert(index.includes(`manifest.json?v=${manifestVersion}`), `index.html does not load manifest.json?v=${manifestVersion}`);

assert(packageJson.scripts?.preflight === 'node scripts/preflight.mjs', 'package.json preflight script must run scripts/preflight.mjs');
assert(packageJson.scripts?.build === 'npm run preflight', 'package.json build script must run preflight');
assert(packageJson.scripts?.test?.includes('preflight'), 'package.json test script must run preflight before tests');
assert(packageJson.scripts?.prepublishOnly === 'npm run preflight', 'package.json prepublishOnly must run preflight');

const appShellMatch = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert(Boolean(appShellMatch), 'Could not find APP_SHELL in sw.js');
const appShellUrls = new Set();
const appShellVersions = new Map();
if (appShellMatch) {
  const assetPattern = /(["'`])([^"'`]+)\1/g;
  let match;
  while ((match = assetPattern.exec(appShellMatch[1]))) {
    const asset = match[2]
      .replaceAll('${REPORT_BUNDLE_VERSION}', reportVersion)
      .replaceAll('${APP_BUNDLE_VERSION}', appVersion);
    if (!asset.startsWith('./') && !asset.startsWith('/')) continue;
    const url = normalizeAssetUrl(asset);
    const path = assetPath(url);
    const version = assetVersion(url);
    if (path) {
      appShellUrls.add(url);
      assert(existsSync(join(root, path)), `APP_SHELL asset missing on disk: ${path}`);
    }
    if (path && version) {
      const existingVersion = appShellVersions.get(path);
      assert(!existingVersion || existingVersion === version, `APP_SHELL has multiple versions for ${path}: ${existingVersion} and ${version}`);
      appShellVersions.set(path, version);
    }
  }
}

function assertVersionedReferencesMatchAppShell(fileName, text) {
  for (const [path, expectedVersion] of appShellVersions) {
    const pathPattern = path.split('/').map(escapeRegex).join('[\\\\/]');
    const referencePattern = new RegExp(`(?:^|[^A-Za-z0-9_./-])(?:\\.?[\\\\/])?${pathPattern}\\?v=([0-9]+)`, 'g');
    let match;
    while ((match = referencePattern.exec(text))) {
      assert(match[1] === expectedVersion, `${fileName} references ${path}?v=${match[1]}, but sw.js APP_SHELL uses ?v=${expectedVersion}`);
    }
  }
}

for (const [fileName, text] of [
  ['index.html', index],
  ['app.js', app],
  ['how-it-works.html', read('how-it-works.html')],
  ['proof.html', read('proof.html')],
  ['testimonials.html', read('testimonials.html')],
  ['manifest.json', read('manifest.json')],
]) {
  assertVersionedReferencesMatchAppShell(fileName, text);
}

const manifestIcons = [
  ...(Array.isArray(manifest.icons) ? manifest.icons.map((icon) => ['manifest icons', icon]) : []),
  ...(Array.isArray(manifest.shortcuts)
    ? manifest.shortcuts.flatMap((shortcut) =>
      Array.isArray(shortcut.icons)
        ? shortcut.icons.map((icon) => [`manifest shortcut "${shortcut.name || shortcut.short_name || 'unnamed'}"`, icon])
        : [])
    : []),
];
assert(manifestIcons.length > 0, 'manifest.json must define icons');
for (const [label, icon] of manifestIcons) {
  assert(icon && typeof icon.src === 'string', `${label} entry is missing src`);
  if (!icon?.src) continue;
  const iconUrl = normalizeAssetUrl(icon.src);
  const path = assetPath(iconUrl);
  assert(appShellUrls.has(iconUrl), `${label} src ${icon.src} is not precached in sw.js APP_SHELL`);
  assert(existsSync(join(root, path)), `${label} src missing on disk: ${path}`);
  const fileSize = path.match(/star_paper_(\d+)\.png$/)?.[1];
  if (fileSize && icon.sizes) {
    assert(String(icon.sizes).split(/\s+/).includes(`${fileSize}x${fileSize}`), `${label} src ${icon.src} does not match sizes ${icon.sizes}`);
  }
}

const indexPublicRoutes = parseIndexPublicRoutes(index);
const swPublicLandingPages = parseSwPublicLandingPages(sw);
assertSameMap(indexPublicRoutes, swPublicLandingPages, 'public landing route map');
for (const [route, target] of swPublicLandingPages) {
  requiredFile(target.replace(/^\//, ''));
  if (!route.endsWith('.html')) {
    const redirectRule = `${route} ${target} 200`;
    assert(redirects.includes(redirectRule), `Missing Netlify redirect: ${redirectRule}`);
  }
}

assert(headers.includes('Content-Security-Policy:'), '_headers missing Content-Security-Policy');
for (const path of ['/', '/index.html', '/*.html', '/app*.js', '/styles*.css', '/star-paper-tokens.css', '/supabase.js', '/manifest.json', '/favicon.ico']) {
  assertHeader(path, 'Cache-Control: no-cache, must-revalidate');
}
assertHeader('/sw.js', 'Cache-Control: no-cache, no-store, must-revalidate');
assertHeader('/assets/landing/*', 'Cache-Control: public, max-age=31536000, immutable');
assertHeader('/star_paper_logo_pack/*', 'Cache-Control: public, max-age=31536000, immutable');
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
assert(/command\s*=\s*"npm run build"/.test(netlifyToml), 'netlify.toml build command must run npm run build');

const legacyHost = matchConst(sw, 'LEGACY_NETLIFY_HOST');
const canonicalOrigin = matchConst(sw, 'CANONICAL_NETLIFY_ORIGIN');
let canonicalHost = '';
try {
  canonicalHost = new URL(canonicalOrigin).hostname;
} catch (error) {
  fail(`CANONICAL_NETLIFY_ORIGIN is not a valid URL: ${error.message}`);
}
assert(index.includes(`window.location.hostname !== '${legacyHost}'`) || index.includes(`window.location.hostname !== "${legacyHost}"`), 'index.html legacy-host redirect does not match sw.js LEGACY_NETLIFY_HOST');
assert(index.includes(`canonicalUrl.hostname = '${canonicalHost}'`) || index.includes(`canonicalUrl.hostname = "${canonicalHost}"`), 'index.html canonical host does not match sw.js CANONICAL_NETLIFY_ORIGIN');
assert(sw.includes(`url.hostname = "${canonicalHost}"`) || sw.includes(`url.hostname = '${canonicalHost}'`), 'sw.js toCanonicalUrl host does not match CANONICAL_NETLIFY_ORIGIN');
for (const protocol of ['http', 'https']) {
  assert(new RegExp(`^${protocol}://${escapeRegex(legacyHost)}/sw\\.js\\s+/sw\\.js\\s+200!$`, 'm').test(redirects), `_redirects missing ${protocol} legacy service-worker passthrough`);
  assert(new RegExp(`^${protocol}://${escapeRegex(legacyHost)}/\\*\\s+${escapeRegex(canonicalOrigin)}/:splat\\s+301!$`, 'm').test(redirects), `_redirects missing ${protocol} legacy-to-canonical redirect`);
}

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

console.log('Preflight passed: deploy path, cache versions, manifest icons, route/host invariants, static assets, CSP scope, and account-recovery checks are clean.');
