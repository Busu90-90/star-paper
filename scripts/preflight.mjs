import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { runInNewContext } from 'node:vm';

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

function loadBrowserAssets() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  try {
    runInNewContext(read('app.browser-assets.js'), sandbox, { filename: 'app.browser-assets.js' });
  } catch (error) {
    fail(`Could not evaluate app.browser-assets.js: ${error.message}`);
    return null;
  }
  const manifest = sandbox.SP_BROWSER_ASSETS;
  if (!manifest || typeof manifest.url !== 'function' || typeof manifest.version !== 'function' || typeof manifest.external !== 'function' || typeof manifest.runtimeScript !== 'function') {
    fail('app.browser-assets.js must publish SP_BROWSER_ASSETS with url(), version(), external(), and runtimeScript()');
    return null;
  }
  return manifest;
}

function loadPublicPages() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  try {
    runInNewContext(read('app.public-pages.js'), sandbox, { filename: 'app.public-pages.js' });
  } catch (error) {
    fail(`Could not evaluate app.public-pages.js: ${error.message}`);
    return null;
  }
  const manifest = sandbox.SP_PUBLIC_PAGES;
  if (!manifest || !Array.isArray(manifest.rootHtml) || !Array.isArray(manifest.publicLandingRoutes) || typeof manifest.targetForPublicRoute !== 'function') {
    fail('app.public-pages.js must publish SP_PUBLIC_PAGES with rootHtml, publicLandingRoutes, and targetForPublicRoute()');
    return null;
  }
  return manifest;
}

function sha384Integrity(path) {
  const bytes = readFileSync(join(root, path));
  return `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
}

function walkAllFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAllFiles(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripQueryAndHash(value) {
  return String(value || '').split('#')[0].split('?')[0];
}

function resolveLocalReference(fileName, reference) {
  const clean = stripQueryAndHash(reference).replaceAll('\\', '/');
  if (!clean || /^[a-z][a-z0-9+.-]*:\/\//i.test(clean) || clean.startsWith('//')) return '';
  if (clean.startsWith('/')) return clean.replace(/^\/+/, '');
  if (clean.startsWith('./') || clean.startsWith('../')) {
    const baseDir = fileName.includes('/') ? fileName.slice(0, fileName.lastIndexOf('/') + 1) : '';
    return normalize(`${baseDir}${clean}`).replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
  }
  return clean.replace(/^\.\//, '').replace(/^\/+/, '');
}

function versionedAssetUrl(path) {
  return browserAssets?.url(path) || `${path}?v=`;
}

function assetVersionFor(path) {
  try {
    return browserAssets?.version(path) || '';
  } catch (error) {
    fail(error.message);
    return '';
  }
}

function matchConst(text, name) {
  const match = text.match(new RegExp(`const\\s+${name}\\s*=\\s*["']([^"']+)["']`));
  if (!match) fail(`Could not find ${name} in sw.js`);
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

function assertSameMap(actual, expected, label) {
  assert(actual.size === expected.size, `${label} size drift: expected ${expected.size}, found ${actual.size}`);
  for (const [key, expectedValue] of expected) {
    assert(actual.has(key), `${label} missing route: ${key}`);
    assert(actual.get(key) === expectedValue, `${label} route drift for ${key}: expected ${expectedValue}, found ${actual.get(key) || 'missing'}`);
  }
}

function publicRootHtmlFromManifest(manifest) {
  const pages = new Map();
  const routeOwners = new Map();
  for (const page of manifest?.rootHtml || []) {
    assert(page && typeof page.file === 'string' && page.file.endsWith('.html'), 'app.public-pages.js rootHtml entries must name root .html files');
    assert(page.file === page.file.replace(/^\/+/, '') && !page.file.includes('/'), `app.public-pages.js rootHtml file must stay at repo root: ${page.file}`);
    assert(page.marker === 'app-shell' || page.marker === 'public-landing', `app.public-pages.js rootHtml marker drift for ${page.file}: ${page.marker}`);
    assert(!pages.has(page.file), `app.public-pages.js duplicates root HTML file: ${page.file}`);
    pages.set(page.file, page.marker);
    const routes = Array.isArray(page.routes) ? page.routes : [];
    if (page.marker === 'app-shell') {
      assert(routes.length === 0, `app.public-pages.js app-shell root must not publish landing routes: ${page.file}`);
    } else {
      const expectedTarget = `/${page.file}`;
      assert(routes.includes(expectedTarget), `app.public-pages.js public landing root must include its .html route: ${expectedTarget}`);
      for (const route of routes) {
        assert(typeof route === 'string' && route.startsWith('/'), `app.public-pages.js route must be an absolute path for ${page.file}: ${route}`);
        assert(!routeOwners.has(route), `app.public-pages.js duplicates public route: ${route}`);
        routeOwners.set(route, expectedTarget);
      }
    }
  }
  return pages;
}

function publicLandingRoutesFromManifest(manifest) {
  const routes = new Map();
  for (const entry of manifest?.publicLandingRoutes || []) {
    assert(Array.isArray(entry) && entry.length === 2, 'app.public-pages.js publicLandingRoutes entries must be [route, target]');
    const [route, target] = entry;
    routes.set(route, normalizeLandingTarget(target));
  }
  return routes;
}

function assertExactSet(actual, expected, label) {
  assert(actual.size === expected.size, `${label} size drift: expected ${expected.size}, found ${actual.size}`);
  for (const value of expected) {
    assert(actual.has(value), `${label} missing: ${value}`);
  }
  for (const value of actual) {
    assert(expected.has(value), `${label} has unexpected entry: ${value}`);
  }
}

function sourceSlice(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  assert(start !== -1, `${label} missing start marker: ${startMarker}`);
  if (start === -1) return '';
  const end = endMarker ? text.indexOf(endMarker, start + startMarker.length) : -1;
  assert(!endMarker || end !== -1, `${label} missing end marker: ${endMarker}`);
  return text.slice(start, end === -1 ? text.length : end);
}

function assertOrderedSnippets(text, snippets, label) {
  let cursor = -1;
  for (const snippet of snippets) {
    const index = text.indexOf(snippet, cursor + 1);
    assert(index !== -1, `${label} missing or reordered snippet: ${snippet}`);
    if (index === -1) return;
    cursor = index;
  }
}

function assertPublicRootMarker(fileName, text, marker) {
  const markerPattern = new RegExp(
    `<meta\\s+name=["']star-paper:public-root["']\\s+content=["']${escapeRegex(marker)}["']\\s*/?>`,
    'i'
  );
  assert(markerPattern.test(text), `${fileName} missing public root marker: ${marker}`);
}

function assertDocumentCspMeta(fileName, text) {
  const csp = documentCsp(text);
  assert(Boolean(csp), `${fileName} missing document Content-Security-Policy meta`);
  assert(/default-src\s+'self'/i.test(csp), `${fileName} document CSP missing default-src 'self'`);
  assert(/object-src\s+'none'/i.test(csp), `${fileName} document CSP missing object-src 'none'`);
  assert(/worker-src\s+'self'\s+blob:/i.test(csp), `${fileName} document CSP missing worker-src 'self' blob:`);
  assert(!/frame-ancestors/i.test(csp), `${fileName} document CSP meta must not include frame-ancestors; keep it in _headers`);
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function assertCountAtMost(text, pattern, max, label) {
  const count = countMatches(text, pattern);
  assert(count <= max, `${label} drift: expected at most ${max}, found ${count}`);
}

function decodeBase64Url(value) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function jwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch (_error) {
    return null;
  }
}

function assertNoServiceRoleJwt(fileName, text) {
  const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
  let match;
  while ((match = jwtPattern.exec(text))) {
    const payload = jwtPayload(match[0]);
    if (payload?.role === 'service_role') {
      fail(`Possible Supabase service-role JWT in ${fileName}`);
    }
  }
}

function assertExternalTagsHaveIntegrity(fileName, text) {
  const tagPattern = /<(script|link)\b[^>]*(?:src|href)=["'](https:\/\/[^"']+)["'][^>]*>/gi;
  let match;
  while ((match = tagPattern.exec(text))) {
    const [, tagName, url] = match;
    const tag = match[0];
    const isStylesheet = /\brel=["']stylesheet["']/i.test(tag);
    const isPreloadScript = /\brel=["']preload["']/i.test(tag) && /\bas=["']script["']/i.test(tag);
    const isScript = tagName.toLowerCase() === 'script' || isPreloadScript;
    if (!isScript && !isStylesheet) continue;
    const integrity = tag.match(/\bintegrity=["']([^"']+)["']/i)?.[1] || '';
    const expected = Object.values(browserAssets?.externalScripts || {}).find((asset) => asset.src === url);
    assert(Boolean(expected), `${fileName} external subresource not listed in app.browser-assets.js: ${url}`);
    assert(/^sha384-[^"']+$/i.test(integrity), `${fileName} external subresource missing SRI: ${url}`);
    if (expected) {
      assert(integrity === expected.integrity, `${fileName} external subresource SRI drift for ${url}`);
    }
    assert(/\bcrossorigin(?:=["'][^"']*["'])?/i.test(tag), `${fileName} external subresource missing crossorigin: ${url}`);
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

function documentCsp(text) {
  return text.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]+)"/i)?.[1] || '';
}

function headerCsp(text) {
  return text.match(/Content-Security-Policy:\s*(.+)/)?.[1]?.trim() || '';
}

function normalizeCsp(value) {
  return value.split(';').map((part) => part.trim()).filter(Boolean).join('; ');
}

function normalizeDocumentComparableCsp(value) {
  return normalizeCsp(
    value
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !/^frame-ancestors\b/i.test(part))
      .join('; ')
  );
}

const forbiddenSelfHostedRuntimeDependencies = [
  [/https:\/\/fonts\.googleapis\.com/i, 'Google Fonts stylesheet host'],
  [/https:\/\/fonts\.gstatic\.com/i, 'Google Fonts binary host'],
  [/https:\/\/cdn\.jsdelivr\.net\/npm\/three@/i, 'Three.js CDN module import'],
  [/https:\/\/cdn\.jsdelivr\.net\/npm\/topojson-client@/i, 'TopoJSON CDN module import'],
  [/https:\/\/cdn\.jsdelivr\.net\/npm\/world-atlas@/i, 'world-atlas TopoJSON CDN fallback'],
  [/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/i, 'Supabase JS CDN auth runtime'],
  [/https:\/\/unpkg\.com\/@phosphor-icons\/web@/i, 'Phosphor Icons CDN stylesheet/font host'],
];

function assertNoForbiddenRuntimeDependency(fileName, text) {
  for (const [pattern, label] of forbiddenSelfHostedRuntimeDependencies) {
    assert(!pattern.test(text), `${fileName} must not depend on ${label}; use assets/vendor instead`);
  }
}

for (const path of [
  'package.json',
  'README.md',
  'backend/README.md',
  'index.html',
  'app.js',
  'app.boot-head.js',
  'app.boot-flags.js',
  'app.boot-body.js',
  'app.browser-assets.js',
  'app.public-pages.js',
  'app.root-shell.js',
  'app.globe.js',
  'app.tasks.js',
  'supabase.js',
  'sw.js',
  'manifest.json',
  'app.reports.js',
  'assets/vendor/fonts/star-paper-fonts.css',
  'assets/vendor/phosphor-icons/regular/style.css',
  'assets/vendor/phosphor-icons/regular/Phosphor.woff2',
  'assets/vendor/phosphor-icons/fill/style.css',
  'assets/vendor/phosphor-icons/fill/Phosphor-Fill.woff2',
  'assets/vendor/phosphor-icons/duotone/style.css',
  'assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.woff2',
  'assets/vendor/three/three.module.js',
  'assets/vendor/three/OrbitControls.js',
  'assets/vendor/topojson-client/topojson-client.esm.js',
  'schema.sql',
  'scripts/supabase-migration-readiness.sql',
  'scripts/supabase-post-apply-verification.sql',
  'scripts/supabase-post-apply-canary-proof.sql',
  'SUPABASE_POST_APPLY_VERIFICATION.md',
  'STATE_SCHEMA.md',
  'security_best_practices_report.md',
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

const browserAssets = loadBrowserAssets();
const publicPages = loadPublicPages();
const index = read('index.html');
const app = read('app.js');
const bootHead = read('app.boot-head.js');
const bootFlags = read('app.boot-flags.js');
const bootBody = read('app.boot-body.js');
const publicPageHead = read('public-page-head.js');
const publicPageTheme = read('public-page-theme.js');
const publicPageManifest = read('app.public-pages.js');
const rootShell = read('app.root-shell.js');
const globe = read('app.globe.js');
const fontCss = read('assets/vendor/fonts/star-paper-fonts.css');
const phosphorRegularCss = read('assets/vendor/phosphor-icons/regular/style.css');
const phosphorFillCss = read('assets/vendor/phosphor-icons/fill/style.css');
const phosphorDuotoneCss = read('assets/vendor/phosphor-icons/duotone/style.css');
const orbitControls = read('assets/vendor/three/OrbitControls.js');
const topojsonClient = read('assets/vendor/topojson-client/topojson-client.esm.js');
const todayBoard = read('app.todayboard.js');
const tasks = read('app.tasks.js');
const reports = read('app.reports.js');
const styles = read('styles.css');
const premiumCss = read('styles.premium.css');
const shellCss = read('styles.shell.css');
const handcraftCss = read('styles.handcraft.css');
const tokensCss = read('star-paper-tokens.css');
const handcraft = read('app.handcraft.js');
const sw = read('sw.js');
const headers = read('_headers');
const redirects = read('_redirects');
const netlifyIgnore = read('.netlifyignore');
const netlifyToml = read('netlify.toml');
const readme = read('README.md');
const backendReadme = read('backend/README.md');
const schema = read('schema.sql');
const migrationReadinessSql = read('scripts/supabase-migration-readiness.sql');
const postApplyVerificationSql = read('scripts/supabase-post-apply-verification.sql');
const postApplyCanarySql = read('scripts/supabase-post-apply-canary-proof.sql');
const postApplyRunbook = read('SUPABASE_POST_APPLY_VERIFICATION.md');
const stateSchema = read('STATE_SCHEMA.md');
const securityReport = read('security_best_practices_report.md');
const supabase = read('supabase.js');
const manifest = readJson('manifest.json') || {};
const packageJson = readJson('package.json') || {};
const docs = read('STAR_PAPER_DOCUMENTATION.md');

for (const [fileName, text] of [
  ['index.html', index],
  ['app.root-shell.js', rootShell],
  ['app.globe.js', globe],
  ['assets/vendor/fonts/star-paper-fonts.css', fontCss],
  ['assets/vendor/phosphor-icons/regular/style.css', phosphorRegularCss],
  ['assets/vendor/phosphor-icons/fill/style.css', phosphorFillCss],
  ['assets/vendor/phosphor-icons/duotone/style.css', phosphorDuotoneCss],
  ['assets/vendor/three/OrbitControls.js', orbitControls],
  ['assets/vendor/topojson-client/topojson-client.esm.js', topojsonClient],
  ['styles.css', styles],
  ['styles.premium.css', premiumCss],
  ['styles.shell.css', shellCss],
  ['styles.handcraft.css', handcraftCss],
  ['star-paper-tokens.css', tokensCss],
  ['_headers', headers],
  ['README.md', readme],
  ['STAR_PAPER_DOCUMENTATION.md', docs],
]) {
  assertNoForbiddenRuntimeDependency(fileName, text);
}

const publicRootHtml = publicRootHtmlFromManifest(publicPages);
const publicLandingRoutes = publicLandingRoutesFromManifest(publicPages);
const rootHtmlFiles = new Set(
  readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map((entry) => entry.name)
);
assertExactSet(rootHtmlFiles, new Set(publicRootHtml.keys()), 'public root HTML allowlist');
for (const [fileName, marker] of publicRootHtml) {
  requiredFile(fileName);
  const html = fileName === 'index.html' ? index : read(fileName);
  assertPublicRootMarker(fileName, html, marker);
  assertDocumentCspMeta(fileName, html);
  assertNoForbiddenRuntimeDependency(fileName, html);
  assertExternalTagsHaveIntegrity(fileName, html);
  if (marker === 'app-shell') {
    assert(/\blanding-home-page\b[\s\S]*\blanding-snap-page\b|\blanding-snap-page\b[\s\S]*\blanding-home-page\b/.test(html), `${fileName} must mark #landingScreen as the landing home snap container`);
  } else {
    assert(/\blanding-snap-page\b[\s\S]*\blanding-public-page\b|\blanding-public-page\b[\s\S]*\blanding-snap-page\b/.test(html), `${fileName} must mark #landingScreen as a public landing snap container`);
  }
}

const indexInlineScripts = [...index.matchAll(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)].map((match) => match[0]);
assert(indexInlineScripts.length === 0, `index.html must not ship inline script blocks; found ${indexInlineScripts.length}`);
assert(!/<script[^>]*\btype=["']importmap["']/i.test(index), 'index.html must not ship an inline importmap');
assert(index.includes(versionedAssetUrl('app.browser-assets.js')), `index.html must load ${versionedAssetUrl('app.browser-assets.js')}`);
assert(index.includes(versionedAssetUrl('app.public-pages.js')), `index.html must load ${versionedAssetUrl('app.public-pages.js')}`);
assert(index.includes(versionedAssetUrl('app.boot-head.js')), `index.html must load external ${versionedAssetUrl('app.boot-head.js')}`);
assert(index.includes(versionedAssetUrl('app.boot-flags.js')), `index.html must load external ${versionedAssetUrl('app.boot-flags.js')}`);
assert(index.includes(versionedAssetUrl('app.boot-body.js')), `index.html must load external ${versionedAssetUrl('app.boot-body.js')}`);
for (const [fileName, text, signature] of [
  ['app.boot-head.js', bootHead, 'redirectLegacyNetlifyOrigin'],
  ['app.boot-flags.js', bootFlags, 'applyPolishFlagsBeforePaint'],
  ['app.boot-body.js', bootBody, 'forceBootForAuthOrAppRoutes'],
]) {
  assert(text.includes(signature), `${fileName} missing externalized boot signature: ${signature}`);
}
assert(bootHead.includes('window.SP_PUBLIC_PAGES'), 'app.boot-head.js must read public landing routes from app.public-pages.js');
assert(bootHead.includes('targetForPublicRoute(pathname)'), 'app.boot-head.js must resolve public landing routes through app.public-pages.js');
assert(!/var\s+publicRoutes\s*=\s*\{/.test(bootHead), 'app.boot-head.js must not carry a duplicate public landing route map');
for (const signature of [
  'setupDeferredLibraries',
  'wireCriticalButtons',
  'globalScheduleFallbackGuard',
  'localDevColdStartGuard',
  'fileProtocolGuard',
  'window.showForgotPassword =',
]) {
  assert(!index.includes(signature), `index.html late runtime must stay externalized from inline script blocks: ${signature}`);
  assert(rootShell.includes(signature), `app.root-shell.js missing externalized runtime signature: ${signature}`);
}

const shellVersion = assetVersionFor('sw.js');

assert(sw.includes('importScripts("./app.browser-assets.js")'), 'sw.js must load app.browser-assets.js as its browser asset contract');
assert(sw.includes('importScripts("./app.public-pages.js")'), 'sw.js must load app.public-pages.js as its public landing-page route contract');
assert(sw.includes('SP_PUBLIC_PAGES.publicLandingRouteMap()'), 'sw.js must derive public landing routes from app.public-pages.js');
assert(sw.includes('SP_ASSET_MANIFEST.version("sw.js")'), 'sw.js must derive SHELL_VERSION from app.browser-assets.js');
assert(sw.includes('SP_ASSET_MANIFEST.appShell'), 'sw.js must derive APP_SHELL from app.browser-assets.js');
assert(app.includes("assetManifest.url('sw.js')"), `app.js must register the manifest-provided sw.js?v=${shellVersion}`);
assert(index.includes(versionedAssetUrl('app.js')), `index.html does not load ${versionedAssetUrl('app.js')}`);
assert(index.includes(versionedAssetUrl('app.root-shell.js')), `index.html does not load ${versionedAssetUrl('app.root-shell.js')}`);
assert(index.includes(versionedAssetUrl('app.public-pages.js')), `index.html does not load ${versionedAssetUrl('app.public-pages.js')}`);
assert(index.includes(versionedAssetUrl('app.boot-head.js')), `index.html does not load ${versionedAssetUrl('app.boot-head.js')}`);
assert(index.includes(versionedAssetUrl('app.boot-flags.js')), `index.html does not load ${versionedAssetUrl('app.boot-flags.js')}`);
assert(index.includes(versionedAssetUrl('app.boot-body.js')), `index.html does not load ${versionedAssetUrl('app.boot-body.js')}`);
assert(index.includes(versionedAssetUrl('app.todayboard.js')), `index.html does not load ${versionedAssetUrl('app.todayboard.js')}`);
assert(index.includes(versionedAssetUrl('app.reports.js')), `index.html does not load ${versionedAssetUrl('app.reports.js')}`);
assert(index.includes(versionedAssetUrl('app.handcraft.js')), `index.html does not load ${versionedAssetUrl('app.handcraft.js')}`);
assert(!index.includes('how-it-works.html#landing-features'), 'index.html How It Works links must not route to #landing-features');
assert(index.includes(versionedAssetUrl('styles.css')), `index.html does not load ${versionedAssetUrl('styles.css')}`);
assert(index.includes(versionedAssetUrl('supabase.js')), `index.html does not load ${versionedAssetUrl('supabase.js')}`);
assert(index.includes(versionedAssetUrl('manifest.json')), `index.html does not load ${versionedAssetUrl('manifest.json')}`);
assert(rootShell.includes("assetManifest().url(path)"), 'app.root-shell.js must lazy-load local optional scripts through app.browser-assets.js');
for (const [fileName, marker] of publicRootHtml) {
  if (marker !== 'public-landing') continue;
  const html = read(fileName);
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)];
  assert(inlineScripts.length === 0, `${fileName} must not ship inline script blocks; found ${inlineScripts.length}`);
  assert(!/<style\b/i.test(html), `${fileName} must not ship inline style blocks`);
  assert(!/\sstyle\s*=/.test(html), `${fileName} must not ship inline style attributes`);
  assert(!/script-src[^;]*'unsafe-inline'/i.test(documentCsp(html)), `${fileName} CSP script-src must not allow unsafe-inline`);
  assert(!/style-src[^;]*'unsafe-inline'/i.test(documentCsp(html)), `${fileName} CSP style-src directives must not allow unsafe-inline`);
  assert(html.includes(versionedAssetUrl('public-page-head.js')), `${fileName} does not load ${versionedAssetUrl('public-page-head.js')}`);
  assert(html.includes(versionedAssetUrl('public-page-theme.js')), `${fileName} does not load ${versionedAssetUrl('public-page-theme.js')}`);
  assert(html.includes(versionedAssetUrl('app.handcraft.js')), `${fileName} does not load ${versionedAssetUrl('app.handcraft.js')}`);
  assert(!html.includes('index.html?auth=signup'), `${fileName} must not route signup CTAs through index.html; static preview canonicalization drops the auth query`);
  assert(html.includes('./?auth=signup'), `${fileName} must route signup CTAs to the root auth query`);
}
assert(publicPageHead.includes("window.history.scrollRestoration = 'manual';"), 'public-page-head.js must force manual scroll restoration');
assert(publicPageHead.includes('publicSectionHashPattern'), 'public-page-head.js must strip known public section hashes');
assert(publicPageHead.includes('function resetPublicScrollTop()'), 'public-page-head.js must expose the public landing scroll-top reset');
assert(publicPageHead.includes("window.addEventListener('pageshow', resetPublicScrollTop);"), 'public-page-head.js must reset public landing scroll on pageshow');
assert(handcraft.includes('function resetLandingScrollTop(landing)'), 'app.handcraft.js must reset the landing snap container on mount');
assert(handcraft.includes("landing.classList.contains('landing-snap-page')"), 'app.handcraft.js must use #landingScreen as the scroll source in snap mode');
assert(app.includes('window.showLoginForm = showLoginForm;'), 'app.js must let the real auth handler replace public boot stubs for Sign in');
assert(app.includes('window.showSignupForm = showSignupForm;'), 'app.js must let the real signup handler replace public boot stubs for Get Started');
assert(!app.includes('window.showLoginForm  ||= showLoginForm;'), 'app.js must not preserve stale public boot Sign in stubs after initialization');
assert(!app.includes('window.showSignupForm ||= showSignupForm;'), 'app.js must not preserve stale public boot signup stubs after initialization');
assert(handcraftCss.includes('#landingScreen.landing-snap-page'), 'styles.handcraft.css must define the landing snap page contract');
assert(handcraftCss.includes('scroll-snap-type: y mandatory'), 'styles.handcraft.css must enforce vertical mandatory snap on landing pages');
assert(handcraftCss.includes('scroll-snap-stop: always'), 'styles.handcraft.css must enforce snap stops on landing sections');
assert(handcraftCss.includes('height: 100dvh !important;'), 'styles.handcraft.css must keep #landingScreen at the viewport height');
assert(handcraftCss.includes('--landing-max-width: 1180px'), 'styles.handcraft.css must define the shared public landing max width');
assert(handcraftCss.includes('--landing-section-pad-x'), 'styles.handcraft.css must define shared public landing horizontal gutters');
assert(handcraftCss.includes('--landing-section-pad-y'), 'styles.handcraft.css must define shared public landing section padding');
assert(handcraftCss.includes('--landing-cta-min-height'), 'styles.handcraft.css must define compact public landing CTA spacing');
assert(handcraftCss.includes('width: min(100%, var(--landing-max-width))'), 'styles.handcraft.css must center public landing content on the shared max-width rail');
assert(handcraftCss.includes('overscroll-behavior-x: contain'), 'styles.handcraft.css must keep carousel overflow inside the carousel track');
assert(handcraftCss.includes('overflow-x: clip !important;'), 'styles.handcraft.css must prevent document-level horizontal overflow on landing pages');
assert(!handcraftCss.includes('height: 100dvh !important;\n  min-height: 100dvh !important;\n  scroll-snap-align: start;'), 'styles.handcraft.css landing content sections must not be forced into clipped 100dvh slabs');
assert(sw.includes('const AUTH_CALLBACK_CACHE_BYPASS_PARAMS = new Set(['), 'sw.js must define auth callback cache-bypass parameters');
for (const param of ['access_token', 'refresh_token', 'code', 'state', 'token_type', 'error_description']) {
  assert(sw.includes(`"${param}"`), `sw.js auth callback cache bypass must include ${param}`);
}
assert(sw.includes('function hasAuthCallbackCacheBypassParam(url)'), 'sw.js must detect auth callback cache-bypass parameters');
assert(sw.includes('const canCacheRequestUrl = !hasAuthCallbackCacheBypassParam(requestUrl);'), 'sw.js navigation cache writes must be gated by auth callback parameter detection');
assert(sw.includes('response && response.ok && canCacheRequestUrl'), 'sw.js must not cache navigation responses for auth callback URLs');
assert(sw.includes('if (!canCacheRequestUrl) {'), 'sw.js auth callback fallback path must avoid cache lookup by sensitive request URL');
assert(sw.includes('if (hasAuthCallbackCacheBypassParam(url)) return false;'), 'sw.js app-shell cacheability must reject auth callback URLs');
assert(sw.includes('function requestTarget(request)'), 'sw.js must normalize fallback string request targets');
assert(sw.includes('new URL(request, self.location.href).toString()'), 'sw.js must resolve fallback shell paths against the worker origin');
assert(sw.includes('return new Request(requestTarget(request), { cache: "reload" });'), 'sw.js freshRequest must normalize strings before constructing Request');
assert(sw.includes('function shouldRedirectNavigationResponse(request, response)'), 'sw.js must detect clean same-origin navigation redirects');
assert(sw.includes('return Response.redirect(response.url, 302);'), 'sw.js must hand off clean public-route redirects to the browser');
assert(sw.includes('if (looksLikeFilePath(url.pathname))'), 'sw.js must let direct .html public landing requests reach the browser/network path');
assert(sw.includes('return fetch(freshRequest(request))'), 'sw.js must fetch requested navigations before falling back');
assert(sw.includes('return fetch(freshRequest(fallbackShell));'), 'sw.js must fetch manifest fallback shells only after requested public navigation fails');

assert(packageJson.scripts?.preflight === 'node scripts/preflight.mjs', 'package.json preflight script must run scripts/preflight.mjs');
assert(packageJson.scripts?.build === 'npm run preflight', 'package.json build script must run preflight');
assert(packageJson.scripts?.test?.includes('preflight'), 'package.json test script must run preflight before tests');
assert(packageJson.scripts?.prepublishOnly === 'npm run preflight', 'package.json prepublishOnly must run preflight');

const previewContract = [
  {
    script: 'preview',
    command: 'npx --yes serve . -l 8080',
    url: 'http://localhost:8080',
  },
  {
    script: 'preview:alt',
    command: 'npx --yes serve . -l 8081',
    url: 'http://localhost:8081',
  },
];

for (const preview of previewContract) {
  assert(
    packageJson.scripts?.[preview.script] === preview.command,
    `package.json ${preview.script} must serve the cloud-only frontend at ${preview.url}`
  );
  assert(
    readme.includes(`\`npm run ${preview.script}\``) && readme.includes(`\`${preview.url}\``),
    `README.md must document ${preview.script} at ${preview.url}`
  );
  assert(
    backendReadme.includes(`\`npm run ${preview.script}\``),
    `backend/README.md must point developers to ${preview.script}`
  );
}

assert(readme.includes('Run the static frontend only:'), 'README.md must keep local preview scoped to the static frontend');
assert(readme.includes('Do not start `backend/` for app development.'), 'README.md must warn against using backend/ for app development');
assert(readme.includes('local auth redirects must be configured against the frontend preview origin you use'), 'README.md must tie local auth redirects to the preview origin');
assert(readme.includes('Do not open `index.html` through `file://`; Google OAuth and email-confirm redirects require an `http://localhost` or deployed `https://` origin.'), 'README.md must warn that file:// cannot support OAuth/email-confirm redirects');
assert(readme.includes('After explicit logout, `sp_logged_out` blocks stored-session bootstrap until a fresh OAuth callback or user-initiated login clears it.'), 'README.md must document the explicit-logout bootstrap guard');
assert(readme.includes('Once `handleAuthRedirect()` recovers a Supabase session, stale boot flow IDs are rebased'), 'README.md must document OAuth callback stale-flow bootstrap recovery');
assert(docs.includes('do not return `stale` with stored-session bootstrap disabled'), 'STAR_PAPER_DOCUMENTATION.md must document OAuth callback stale-flow recovery');
assert(backendReadme.includes('# Star Paper Backend (Retired)'), 'backend/README.md must label the backend as retired');
assert(backendReadme.includes('This directory is not a developer launch target. Use the root static frontend preview instead:'), 'backend/README.md must keep backend/ out of the app launch path');
assert(backendReadme.includes('SP_ENABLE_RETIRED_BACKEND_DIAGNOSTIC=1'), 'backend/README.md must keep the retired backend behind the diagnostics flag');
assert(backendReadme.includes('Do not use `file://` as a workaround; Google OAuth and email-confirm redirects require the root `http://localhost:8080` or `http://localhost:8081` preview origin.'), 'backend/README.md must warn against file:// auth testing');
assert(backendReadme.includes('The retired backend does not own logout/session restore; the frontend `sp_logged_out` bootstrap guard is the supported explicit-logout path.'), 'backend/README.md must keep explicit logout ownership in the frontend');

assert(supabase.includes('Use the static frontend preview instead: run `npm run preview` and open http://localhost:8080.'), 'supabase.js file:// warning must name npm run preview and http://localhost:8080');
assert(supabase.includes('Google sign-in requires the frontend preview origin, such as http://localhost:8080, or your deployed https:// URL. file:// cannot receive OAuth redirects.'), 'supabase.js Google OAuth error must reject file:// and name the preview origin');
assert(/const redirectTo = getSafeRedirectUrl\(\{\s*requireHttpOrigin:\s*true,\s*fallbackToProduction:\s*false,\s*\}\);/.test(supabase), 'supabase.js Google OAuth must require an http(s) origin and refuse production fallback');

const authRedirectSource = sourceSlice(supabase, 'async function handleAuthRedirect()', 'async function isUsernameAvailable', 'supabase.js handleAuthRedirect');
assert(authRedirectSource.includes('localStorage.removeItem(\'sp_logged_out\');'), 'handleAuthRedirect must clear explicit logout only for an OAuth callback');
assert(authRedirectSource.includes("'auth-redirect:bootstrap-rebased'"), 'handleAuthRedirect must rebase a recovered OAuth session before bootstrapping when its callback flow goes stale');
assert(authRedirectSource.includes('markInitialAuthBootstrapStarted();'), 'handleAuthRedirect must mark that a recovered OAuth session owns bootstrap before running it');
assert(!/finishWith\('stale'[\s\S]*?shouldBootstrapStoredSession:\s*false/.test(authRedirectSource), 'handleAuthRedirect must not return stale with stored-session bootstrap disabled after recovering a session');

const googleSignInSource = sourceSlice(supabase, 'async function signInWithGoogle()', 'window.signInWithGoogle = async function signInWithGoogleAction()', 'supabase.js signInWithGoogle');
assertOrderedSnippets(googleSignInSource, [
  'localStorage.removeItem(\'sp_logged_out\');',
  'window.__spUserInitiatedAuth = true;',
  'requireHttpOrigin: true',
  'fallbackToProduction: false',
], 'signInWithGoogle explicit-logout and redirect-origin flow');

const bootstrapSessionSource = sourceSlice(supabase, 'async function bootstrapFromSupabaseSession(session, options = {})', 'async function signInWithGoogle()', 'supabase.js bootstrapFromSupabaseSession');
assertOrderedSnippets(bootstrapSessionSource, [
  'localStorage.getItem(\'sp_logged_out\') === \'1\'',
  'options.ignoreLoggedOut !== true',
  '!window.__spUserInitiatedAuth',
  '!hasAuthCallbackInUrl()',
  'clearSupabaseAuthArtifacts({ clearAppSession: false });',
  'window.__spSuppressStoredSessionBootstrap = true;',
  'showLandingScreen({ instant: true, flowId, reason: \'bootstrap-explicit-logout\' });',
  'return false;',
  'localStorage.removeItem(\'sp_logged_out\');',
], 'bootstrapFromSupabaseSession explicit-logout guard');
assert(bootstrapSessionSource.includes("label: 'loadAllData[bootstrap-fallback]'"), 'bootstrapFromSupabaseSession must fall back to direct cloud loads when bootstrap RPC returns no first-paint payload');
assert(bootstrapSessionSource.includes('Bootstrap fallback cloud data load failed'), 'bootstrapFromSupabaseSession fallback load failures must stay visible in diagnostics');
assert(bootstrapSessionSource.includes("'bootstrap-session:rebased'"), 'bootstrapFromSupabaseSession must rebase stale auth boot flow ids before first shell paint');
assert(bootstrapSessionSource.includes("'bootstrap-session:app-ready-rebased'"), 'bootstrapFromSupabaseSession must rebase stale flow ids after app readiness waits');
assert(bootstrapSessionSource.includes("'bootstrap-session:show-app-rebased'"), 'bootstrapFromSupabaseSession must rebase stale flow ids before showing the app shell');
assert(!/if\s*\(!isBootTransitionCurrentSafe\(flowId\)\)\s*return\s+false;/.test(bootstrapSessionSource), 'bootstrapFromSupabaseSession must not return false solely because an auth boot flow id went stale');

const sessionRestoreFallbackSource = sourceSlice(supabase, 'function scheduleLocalSessionRestoreFallback(options = {})', 'function hasLocalThemePreference()', 'supabase.js scheduleLocalSessionRestoreFallback');
assert(sessionRestoreFallbackSource.includes("'session-restore-fallback:rebased'"), 'session restore fallback must rebind stale flow ids while the boot loader is still blocking');
assert(sessionRestoreFallbackSource.includes('isAuthBootBlockingState(state)'), 'session restore fallback must inspect blocking loader states before exiting on stale flow');
assert(!/if\s*\(flowId\s*&&\s*!isBootTransitionCurrentSafe\(flowId\)\)\s*return;/.test(sessionRestoreFallbackSource), 'session restore fallback must not silently return on a stale flow while the loader is blocking');

const authStateSource = sourceSlice(supabase, 'db.auth.onAuthStateChange((event, session) => {', 'async function createTeam(name)', 'supabase.js onAuthStateChange');
assertOrderedSnippets(authStateSource, [
  'if (localStorage.getItem(\'sp_logged_out\') === \'1\') {',
  '_session = null;',
  'window.__spSuppressStoredSessionBootstrap = true;',
  'clearSupabaseAuthArtifacts({ clearAppSession: false });',
  'db.auth.signOut({ scope: \'local\' })',
  'showLandingScreen({ instant: true, reason: \'explicit-logout-stale-auth\' });',
  'return;',
], 'onAuthStateChange explicit-logout stale-session guard');
assert(authStateSource.includes('let bootstrapFlowId = flowId;'), 'onAuthStateChange must keep a mutable bootstrap flow id for stale-flow recovery');
assert(authStateSource.includes("beginBootTransitionSafe(`auth-event:${event}:bootstrap-rebased`, 'loading-session')"), 'onAuthStateChange must rebase stale auth-event bootstrap flows instead of returning silently');
assert(authStateSource.includes('markInitialAuthBootstrapStarted();'), 'onAuthStateChange must mark when an initial auth event actually starts bootstrap');
assert(!/if\s*\(!isBootTransitionCurrentSafe\(flowId\)\s*\|\|\s*window\.__spAppBooted\s*\|\|\s*_bootstrapping\)\s*return;/.test(authStateSource), 'onAuthStateChange must not abandon bootstrap solely because the captured flow id went stale');

const logoutSource = sourceSlice(supabase, 'window.logout = async function supabaseLogout()', '    // Lightweight fallback', 'supabase.js logout');
assertOrderedSnippets(logoutSource, [
  'localStorage.setItem(\'sp_logged_out\', \'1\');',
  'await withTimeout(() => db.auth.signOut({ scope: \'local\' }), 800, \'logout-signOut\');',
  'clearSupabaseAuthArtifacts({ clearAppSession: false });',
  'localStorage.setItem(\'sp_logged_out\', \'1\');',
  'showLandingScreen({ keepLoader: true, flowId, reason: \'logout-complete\', minDelayMs: 350 });',
], 'supabaseLogout explicit-logout sequence');

const initialSessionSource = sourceSlice(supabase, 'async function bootstrapInitialSession(options = {})', 'async function bootstrapFromStoredSession()', 'supabase.js bootstrapInitialSession');
assertOrderedSnippets(initialSessionSource, [
  'if (localStorage.getItem(\'sp_logged_out\') === \'1\' && !hasAuthCallbackInUrl()) {',
  'clearLocalBootFallback();',
  'clearSupabaseAuthArtifacts({ clearAppSession: false });',
  'window.__spSuppressStoredSessionBootstrap = true;',
  'showLandingScreen({ instant: true, flowId, reason: \'initial-session-explicit-logout\' });',
  'return false;',
], 'bootstrapInitialSession explicit-logout guard');
assert(initialSessionSource.includes("rebaseAuthBootFlow(bootstrapFlowId, 'initial-session:bootstrap-rebased', 'loading-session'"), 'bootstrapInitialSession must recover stale initial-session boot flows before loading cloud data');
assert(initialSessionSource.includes('markInitialAuthBootstrapStarted();'), 'bootstrapInitialSession must mark that a real bootstrap task owns initial session recovery');

assert(app.includes('function shouldShowLoginForAppRouteWithoutSession'), 'app.js must detect signed-out app-route refreshes without a stored Supabase session');
assert(app.includes('window.shouldShowLoginForAppRouteWithoutSession = shouldShowLoginForAppRouteWithoutSession;'), 'app.js must publish the signed-out app-route helper for supabase.js');
assert(app.includes("showLoginForm({ instant: true, reason: 'app-route-without-session' });"), 'app.js app-refresh boot path must show login instead of a stalled loader for signed-out app routes');

const showAppSource = sourceSlice(app, 'function showApp(options = {})', 'const SP_MONEY_TAB_IDS', 'app.js showApp boot overlay cleanup');
assertOrderedSnippets(showAppSource, [
  'window.__spAppBooted = true;',
  'const hasStaleBlockingBootOverlay =',
  'isBootRevealBlockingState(bootLoaderState)',
  'isAppShellVisible()',
  'if (ownsBootLoader || hasStaleBlockingBootOverlay) {',
  'commitBootTransition(\'appContainer\'',
], 'showApp must clear stale blocking boot overlays once the app shell is visible');

const initSource = sourceSlice(supabase, 'function init()', 'setTimeout(patchAppAuth, 0);', 'supabase.js init signed-out app-route handling');
assertOrderedSnippets(initSource, [
  'const appRouteWithoutStoredSession = shouldShowLoginForAppRouteWithoutSession();',
  'if (publicShellColdStart || localColdStart || appRouteWithoutStoredSession) {',
  'const onAppReady = async () => {',
  'await waitForAppBootReady(5000, 50);',
  'if (appRouteWithoutStoredSession) {',
  'patchAppAuth();',
  'showLoginScreen({',
  'reason: \'app-route-without-session\'',
  'return;',
], 'supabase.js signed-out app-route login screen must patch Supabase auth before showing the form');
assert(initSource.includes('const initialSessionBootstrapOwned ='), 'supabase.js init must distinguish auth event observation from bootstrap ownership');
assert(initSource.includes('_initialAuthBootstrapStarted'), 'supabase.js init must only skip fallback bootstrap after an auth event starts real bootstrap work');
assert(!/window\.__spInitialAuthEventSeen\s*&&[\s\S]*?_pendingAuthRedirectSession\?\.session\?\.user/.test(initSource), 'supabase.js init must not skip initial-session fallback solely because the first auth event was seen');

const passwordLoginSource = sourceSlice(supabase, 'window.login = async function supabaseLogin()', 'window.signup = async function supabaseSignup()', 'supabase.js password login');
assert(passwordLoginSource.includes('_session?.user && ('), 'supabase.js password login must suppress stale credential-style errors once a real Supabase session exists');
assert(passwordLoginSource.includes("errMsg.includes('could not initialise session')"), 'supabase.js password login must not show stale cloud-data toasts when bootstrap recovery owns the session state');

const appShellUrls = new Set();
const appShellVersions = new Map();
for (const asset of browserAssets?.appShell || []) {
  const url = normalizeAssetUrl(asset);
  const path = assetPath(url);
  const version = assetVersion(url);
  if (path) {
    appShellUrls.add(url);
    assert(existsSync(join(root, path)), `APP_SHELL asset missing on disk: ${path}`);
  }
  if (path && version) {
    const expectedVersion = assetVersionFor(path);
    const existingVersion = appShellVersions.get(path);
    assert(version === expectedVersion, `app.browser-assets.js APP_SHELL uses ${path}?v=${version}, but versions map uses ?v=${expectedVersion}`);
    assert(!existingVersion || existingVersion === version, `APP_SHELL has multiple versions for ${path}: ${existingVersion} and ${version}`);
    appShellVersions.set(path, version);
  }
}

for (const asset of [
  '/assets/vendor/fonts/star-paper-fonts.css',
  '/assets/vendor/phosphor-icons/regular/style.css',
  '/assets/vendor/phosphor-icons/regular/Phosphor.woff2',
  '/assets/vendor/phosphor-icons/fill/style.css',
  '/assets/vendor/phosphor-icons/fill/Phosphor-Fill.woff2',
  '/assets/vendor/phosphor-icons/duotone/style.css',
  '/assets/vendor/phosphor-icons/duotone/Phosphor-Duotone.woff2',
  '/assets/vendor/three/three.module.js',
  '/assets/vendor/three/OrbitControls.js',
  '/assets/vendor/topojson-client/topojson-client.esm.js',
  '/assets/vendor/supabase/supabase.min.js',
]) {
  const versionedAsset = versionedAssetUrl(asset);
  assert(appShellUrls.has(versionedAsset), `app.browser-assets.js APP_SHELL must precache self-hosted runtime asset: ${versionedAsset}`);
}

const supabaseRuntimeScript = browserAssets?.runtimeScript?.('supabase') || null;
const expectedSupabaseRuntimeUrl = versionedAssetUrl('assets/vendor/supabase/supabase.min.js');
assert(Boolean(supabaseRuntimeScript), 'app.browser-assets.js must define runtimeScript("supabase")');
assert(!Object.prototype.hasOwnProperty.call(browserAssets?.externalScripts || {}, 'supabase'), 'Supabase SDK must not be listed as an external CDN script');
if (supabaseRuntimeScript) {
  assert(supabaseRuntimeScript.src === expectedSupabaseRuntimeUrl, `Supabase runtime script must be same-origin ${expectedSupabaseRuntimeUrl}`);
  assert(supabaseRuntimeScript.integrity === sha384Integrity('assets/vendor/supabase/supabase.min.js'), 'Supabase runtime script SRI hash drift');
  assert(index.includes(`href="${supabaseRuntimeScript.src}"`), 'index.html must preload the same-origin Supabase runtime script');
  assert(index.includes(`src="${supabaseRuntimeScript.src}"`), 'index.html must synchronously load the same-origin Supabase runtime script');
  assert(index.includes(`integrity="${supabaseRuntimeScript.integrity}"`), 'index.html Supabase runtime script must carry manifest SRI');
  assert(appShellUrls.has(versionedAssetUrl('/assets/vendor/supabase/supabase.min.js')), 'sw.js APP_SHELL must precache same-origin Supabase runtime script');
}
assert(supabase.includes("manifest.runtimeScript('supabase')"), 'supabase.js dynamic Supabase SDK loader must use same-origin runtimeScript metadata from app.browser-assets.js');
assert(!/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/i.test(index), 'index.html must not load Supabase from the floating jsDelivr CDN URL');
assert(!/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/i.test(supabase), 'supabase.js must not load Supabase from the floating jsDelivr CDN URL');
assert(!/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/i.test(read('app.browser-assets.js')), 'app.browser-assets.js must not publish a floating Supabase CDN URL');
assert(!/url\(["']?https?:\/\//i.test(fontCss), 'Vendored font CSS must not load remote font binaries');
for (const family of ['Caveat', 'Cormorant', 'Montserrat', 'Space Grotesk', 'Space Mono']) {
  assert(fontCss.includes(`font-family: '${family}'`), `Vendored font CSS missing ${family}`);
}
let vendoredFontCount = 0;
for (const match of fontCss.matchAll(/url\(["']?\.\/([^)"']+\.woff2\?v=\d+)["']?\)/g)) {
  vendoredFontCount += 1;
  const fontPath = `assets/vendor/fonts/${stripQueryAndHash(match[1])}`;
  const fontAsset = versionedAssetUrl(`/${fontPath}`);
  assert(appShellUrls.has(fontAsset), `sw.js APP_SHELL must precache vendored font: ${fontAsset}`);
  assert(existsSync(join(root, assetPath(fontAsset))), `Vendored font missing on disk: ${assetPath(fontAsset)}`);
}
assert(vendoredFontCount >= 28, `Vendored font CSS should expose the expected Star Paper font subsets; found ${vendoredFontCount}`);

for (const variant of [
  { name: 'regular', css: phosphorRegularCss, family: 'Phosphor', className: '.ph', fontBase: 'Phosphor' },
  { name: 'fill', css: phosphorFillCss, family: 'Phosphor-Fill', className: '.ph-fill', fontBase: 'Phosphor-Fill' },
  { name: 'duotone', css: phosphorDuotoneCss, family: 'Phosphor-Duotone', className: '.ph-duotone', fontBase: 'Phosphor-Duotone' },
]) {
  const label = `assets/vendor/phosphor-icons/${variant.name}/style.css`;
  assert(!/url\(["']?https?:\/\//i.test(variant.css), `${label} must not load remote icon font binaries`);
  assert(variant.css.includes(`font-family: "${variant.family}"`), `${label} missing ${variant.family} font family`);
  assert(variant.css.includes(`${variant.className} {`), `${label} missing ${variant.className} base class`);
  let referencedIconFontCount = 0;
  const fontUrlPattern = /url\(["']?\.\/([^)"']+\.(?:woff2|woff|ttf|svg)(?:\?v=\d+)?(?:#[^)"']+)?)["']?\)/g;
  for (const match of variant.css.matchAll(fontUrlPattern)) {
    referencedIconFontCount += 1;
    const fontPath = `assets/vendor/phosphor-icons/${variant.name}/${stripQueryAndHash(match[1])}`;
    const fontAsset = `/${fontPath}`;
    assert(existsSync(join(root, assetPath(fontAsset))), `Vendored Phosphor font missing on disk: ${assetPath(fontAsset)}`);
  }
  assert(referencedIconFontCount >= 4, `${label} should reference the vendored Phosphor font fallbacks`);
  assert(appShellUrls.has(versionedAssetUrl(`/assets/vendor/phosphor-icons/${variant.name}/style.css`)), `app.browser-assets.js APP_SHELL must precache vendored Phosphor CSS: ${label}`);
  assert(appShellUrls.has(versionedAssetUrl(`/assets/vendor/phosphor-icons/${variant.name}/${variant.fontBase}.woff2`)), `app.browser-assets.js APP_SHELL must precache vendored Phosphor woff2: ${variant.fontBase}.woff2`);
}

const pinnedVendorAssets = new Set(browserAssets?.selfHostedRuntimeAssets || []);
const diskVendorAssets = new Set(
  walkAllFiles(join(root, 'assets/vendor')).map((file) => normalize(file.slice(root.length + 1)).replaceAll('\\', '/'))
);
assertExactSet(pinnedVendorAssets, diskVendorAssets, 'app.browser-assets.js vendored runtime integrity pins');
for (const asset of pinnedVendorAssets) {
  assert(assetVersionFor(asset), `app.browser-assets.js missing version for vendored asset: ${asset}`);
  assert(browserAssets.integrityFor(asset) === sha384Integrity(asset), `app.browser-assets.js SRI hash drift for vendored asset: ${asset}`);
}

function assertVersionedReferencesMatchManifest(fileName, text) {
  const referencePattern = /((?:\.{0,2}\/|\/)?(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:js|css|json|png|webp|woff2?|woff|ttf|svg))\?v=([0-9]+)/g;
  let match;
  while ((match = referencePattern.exec(text))) {
    const path = resolveLocalReference(fileName, match[1]);
    const expectedVersion = assetVersionFor(path);
    assert(expectedVersion === match[2], `${fileName} references ${path}?v=${match[2]}, but app.browser-assets.js uses ?v=${expectedVersion}`);
  }
}

for (const [fileName, text] of [
  ['index.html', index],
  ['app.boot-head.js', bootHead],
  ['app.boot-flags.js', bootFlags],
  ['app.boot-body.js', bootBody],
  ['app.public-pages.js', publicPageManifest],
  ['public-page-head.js', publicPageHead],
  ['public-page-theme.js', publicPageTheme],
  ['app.root-shell.js', rootShell],
  ['app.globe.js', globe],
  ['assets/vendor/fonts/star-paper-fonts.css', fontCss],
  ['assets/vendor/phosphor-icons/regular/style.css', phosphorRegularCss],
  ['assets/vendor/phosphor-icons/fill/style.css', phosphorFillCss],
  ['assets/vendor/phosphor-icons/duotone/style.css', phosphorDuotoneCss],
  ['assets/vendor/three/OrbitControls.js', orbitControls],
  ['app.js', app],
  ['how-it-works.html', read('how-it-works.html')],
  ['proof.html', read('proof.html')],
  ['testimonials.html', read('testimonials.html')],
  ['manifest.json', read('manifest.json')],
]) {
  assertVersionedReferencesMatchManifest(fileName, text);
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

assert(publicLandingRoutes.size > 0, 'app.public-pages.js must define public landing routes');
for (const [route, target] of publicLandingRoutes) {
  assert(publicPages.targetForPublicRoute(route) === target, `app.public-pages.js targetForPublicRoute drift for ${route}`);
  requiredFile(target.replace(/^\//, ''));
  if (!route.endsWith('.html')) {
    const redirectRule = `${route} ${target} 200`;
    assert(redirects.includes(redirectRule), `Missing Netlify redirect: ${redirectRule}`);
  }
}
for (const fileName of publicRootHtml.keys()) {
  assert(appShellUrls.has(`/${fileName}`), `sw.js APP_SHELL must include public root HTML: ${fileName}`);
}

assert(headers.includes('Content-Security-Policy:'), '_headers missing Content-Security-Policy');
const cspMeta = documentCsp(index);
const cspHeader = headerCsp(headers);
assert(Boolean(cspMeta), 'index.html missing Content-Security-Policy meta content');
assert(Boolean(cspHeader), '_headers missing Content-Security-Policy value');
assert(normalizeCsp(cspMeta) === normalizeDocumentComparableCsp(cspHeader), 'index.html CSP meta and _headers CSP must match except frame-ancestors');
assert(!/frame-ancestors/i.test(cspMeta), 'index.html CSP meta must not include frame-ancestors because browsers ignore it in meta CSP');
assert(/frame-ancestors\s+'none'/i.test(cspHeader), '_headers CSP must keep frame-ancestors enforced by HTTP headers');
assert(!/script-src[^;]*'unsafe-inline'/i.test(cspMeta), 'index.html CSP script-src must not allow unsafe-inline');
assert(!/script-src[^;]*'unsafe-inline'/i.test(cspHeader), '_headers CSP script-src must not allow unsafe-inline');
assert(!/style-src\s+[^;]*'unsafe-inline'/i.test(cspMeta), 'index.html CSP style-src must not allow unsafe-inline');
assert(!/style-src\s+[^;]*'unsafe-inline'/i.test(cspHeader), '_headers CSP style-src must not allow unsafe-inline');
for (const variant of ['regular', 'fill', 'duotone']) {
  assert(
    index.includes(versionedAssetUrl(`assets/vendor/phosphor-icons/${variant}/style.css`)),
    `index.html must load ${versionedAssetUrl(`assets/vendor/phosphor-icons/${variant}/style.css`)}`
  );
}
assert(/style-src\s+'self'(?:\s*;|$)/i.test(cspMeta), 'index.html CSP style-src must stay self-only');
assert(/style-src\s+'self'(?:\s*;|$)/i.test(cspHeader), '_headers CSP style-src must stay self-only');
assert(/style-src-elem\s+'self'(?:\s*;|$)/i.test(cspMeta), 'index.html CSP style-src-elem must stay self-only after vendoring Phosphor');
assert(/style-src-elem\s+'self'(?:\s*;|$)/i.test(cspHeader), '_headers CSP style-src-elem must stay self-only after vendoring Phosphor');
assert(/font-src\s+'self'(?:\s*;|$)/i.test(cspMeta), 'index.html CSP font-src must stay self-only after vendoring fonts');
assert(/font-src\s+'self'(?:\s*;|$)/i.test(cspHeader), '_headers CSP font-src must stay self-only after vendoring fonts');
assert(!/unpkg\.com/i.test(cspMeta), 'index.html CSP must not trust unpkg after vendoring Phosphor');
assert(!/unpkg\.com/i.test(cspHeader), '_headers CSP must not trust unpkg after vendoring Phosphor');
assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(cspMeta), 'index.html CSP must not trust Google Fonts hosts after vendoring');
assert(!/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(cspHeader), '_headers CSP must not trust Google Fonts hosts after vendoring');
assert(!/style-src-elem[^;]*'unsafe-inline'/i.test(cspMeta), 'index.html CSP style-src-elem must not allow unsafe-inline');
assert(!/style-src-elem[^;]*'unsafe-inline'/i.test(cspHeader), '_headers CSP style-src-elem must not allow unsafe-inline');
assert(!/style-src-attr[^;]*'unsafe-inline'/i.test(cspMeta), 'index.html CSP style-src-attr must not allow unsafe-inline');
assert(!/style-src-attr[^;]*'unsafe-inline'/i.test(cspHeader), '_headers CSP style-src-attr must not allow unsafe-inline');
assert(/style-src-attr\s+'none'/i.test(cspMeta), 'index.html CSP must block inline style attributes');
assert(/style-src-attr\s+'none'/i.test(cspHeader), '_headers CSP must block inline style attributes');
assert(!/<style\b/i.test(index), 'index.html must not ship inline style blocks');
assert(!/\sstyle\s*=/.test(index), 'index.html must not ship inline style attributes');
const blockedInlineStyleAttributeUse = /style\s*=\s*["']|\.style\.cssText|setAttribute\(\s*["']style["']/;
for (const fileName of readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.js'))
  .map((entry) => entry.name)) {
  assert(
    !blockedInlineStyleAttributeUse.test(read(fileName)),
    `${fileName} must not create inline style attributes, setAttribute("style"), or cssText under style-src-attr 'none'`
  );
}
for (const path of ['/', '/index.html', '/*.html', '/app*.js', '/styles*.css', '/star-paper-tokens.css', '/supabase.js', '/manifest.json', '/favicon.ico']) {
  assertHeader(path, 'Cache-Control: no-cache, must-revalidate');
}
assertHeader('/sw.js', 'Cache-Control: no-cache, no-store, must-revalidate');
assertHeader('/assets/landing/*', 'Cache-Control: public, max-age=31536000, immutable');
assertHeader('/assets/vendor/*', 'Cache-Control: public, max-age=31536000, immutable');
assertHeader('/star_paper_logo_pack/*', 'Cache-Control: public, max-age=31536000, immutable');
assert(!/(^|\s)(https:|wss:)(?=[;\s])/.test(headers.match(/connect-src[^;\n]*[;\n]/)?.[0] || ''), 'CSP connect-src still allows broad https: or wss:');

for (const pattern of [
  '.env',
  '.codex-visual/',
  '.codex-inspect/',
  '.codex-video-review/',
  '.claude/',
  '.local-server.*.log',
  '*.html',
  'scripts/',
  'package*.json',
  'netlify.toml',
  '*.md',
  '*.test.*',
  '*.spec.*',
]) {
  assert(netlifyIgnore.includes(pattern), `.netlifyignore missing ${pattern}`);
}
for (const fileName of publicRootHtml.keys()) {
  const pattern = `!/${fileName}`;
  assert(netlifyIgnore.includes(pattern), `.netlifyignore missing public root HTML unignore: ${pattern}`);
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
assert(bootHead.includes(`window.location.hostname !== '${legacyHost}'`) || bootHead.includes(`window.location.hostname !== "${legacyHost}"`), 'app.boot-head.js legacy-host redirect does not match sw.js LEGACY_NETLIFY_HOST');
assert(bootHead.includes(`canonicalUrl.hostname = '${canonicalHost}'`) || bootHead.includes(`canonicalUrl.hostname = "${canonicalHost}"`), 'app.boot-head.js canonical host does not match sw.js CANONICAL_NETLIFY_ORIGIN');
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
const signupSource = sourceSlice(supabase, 'window.signup = async function supabaseSignup()', 'window.logout = async function supabaseLogout()', 'supabase.js signup');
assert(!/isUsernameAvailable/.test(signupSource), 'signup must not call username availability before authentication');
assert(!/\.update\s*\(\s*\{\s*phone\s*,\s*username\s*\}\s*\)/.test(supabase), 'signup phone patch must not overwrite the trigger-assigned unique username');
assert(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_username_available\(TEXT\)\s+FROM\s+PUBLIC,\s*anon/i.test(schema), 'schema.sql must revoke anonymous is_username_available execution');
assert(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.is_username_available\(TEXT\)\s+TO\s+authenticated/i.test(schema), 'schema.sql must keep authenticated is_username_available for profile edits');

assert(schema.includes('CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;'), 'schema.sql must enable pgcrypto in the extensions schema for high-entropy invite codes');
assert(schema.includes('public.generate_team_invite_code()'), 'schema.sql must use generate_team_invite_code for team invites');
assert(schema.includes('extensions.gen_random_bytes(16)'), 'generate_team_invite_code must schema-qualify pgcrypto because Supabase installs pgcrypto under extensions');
assert(!/substr\s*\(\s*md5\s*\(/i.test(schema), 'schema.sql must not use md5/substr invite-code generation');
assert(/teams_invite_code_format_check[\s\S]*invite_code\s*~\s*'\^\[0-9a-f\]\{32\}\$'/i.test(schema), 'schema.sql must enforce 32-hex team invite codes');
assert(/v_invite_code\s*!\~\s*'\^\[0-9a-f\]\{32\}\$'/i.test(schema), 'join_team_by_code must reject malformed or legacy short invite codes');
assert(/REVOKE\s+SELECT\s+ON\s+public\.teams\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(schema), 'schema.sql must revoke direct teams table SELECT before column-granting safe team metadata');
assert(/GRANT\s+SELECT\s*\(\s*id\s*,\s*name\s*,\s*owner_id\s*,\s*created_at\s*\)\s+ON\s+public\.teams\s+TO\s+authenticated/i.test(schema), 'schema.sql must not column-grant teams.invite_code to authenticated clients');
assert(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.ai_context/i.test(schema), 'schema.sql must declare public.ai_context so live advisor drift is repo-owned');
assert(/ALTER\s+TABLE\s+public\.ai_context\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(schema), 'schema.sql must enable RLS on public.ai_context');
assert(/REVOKE\s+ALL\s+ON\s+TABLE\s+public\.ai_context\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(schema), 'schema.sql must revoke browser table grants on public.ai_context');
assert(/CREATE\s+POLICY\s+"Browser roles cannot access AI context"[\s\S]*TO\s+anon,\s*authenticated[\s\S]*USING\s*\(\s*false\s*\)[\s\S]*WITH\s+CHECK\s*\(\s*false\s*\)/i.test(schema), 'schema.sql must install an explicit deny policy for public.ai_context');
assert(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_ai_context_user_id[\s\S]*ON\s+public\.ai_context\s*\(\s*user_id\s*\)/i.test(schema), 'schema.sql must index public.ai_context.user_id');
function schemaFunctionBlock(name) {
  const match = schema.match(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapeRegex(name)}\\b[\\s\\S]*?\\$\\$;`, 'i'));
  assert(Boolean(match), `schema.sql missing function public.${name}`);
  return match?.[0] || '';
}
const teamContextFunction = schemaFunctionBlock('get_my_team_context');
assert(/CASE\s+WHEN[\s\S]*THEN\s+t\.invite_code[\s\S]*ELSE\s+NULL[\s\S]*END\s+AS\s+invite_code/i.test(teamContextFunction), 'get_my_team_context must return invite_code only for admin-capable members');
const bootstrapFunction = schemaFunctionBlock('get_bootstrap_payload');
assert(/'invite_code'\s*,\s*CASE\s+WHEN[\s\S]*THEN\s+t\.invite_code[\s\S]*ELSE\s+NULL/i.test(bootstrapFunction), 'get_bootstrap_payload must return invite_code only for admin-capable members');
const joinTeamFunction = schemaFunctionBlock('join_team_by_code');
assert(/RETURN\s+json_build_object\([\s\S]*'invite_code'\s*,\s*NULL/i.test(joinTeamFunction), 'join_team_by_code must not return the invite code to the newly joined viewer');
assert(/RAISE\s+EXCEPTION\s+'Invalid invite request'/i.test(joinTeamFunction), 'join_team_by_code must use a generic join failure for invalid invite attempts');
assert(!/Invalid invite code/i.test(joinTeamFunction), 'join_team_by_code must not distinguish malformed and unknown invite codes');
const teamMembersFunction = schemaFunctionBlock('get_team_members_context');
assert(/CASE\s+WHEN[\s\S]*public\.has_team_permission\(p_team_id,\s*'admin'\)[\s\S]*THEN\s+p\.email[\s\S]*ELSE\s+NULL[\s\S]*END\s+AS\s+email/i.test(teamMembersFunction), 'get_team_members_context must limit member email exposure to self/admin views');
assert(/CREATE\s+POLICY\s+"Users can update their own profile"[\s\S]*USING\s*\(\s*auth\.uid\(\)\s*=\s*id\s*\)[\s\S]*WITH\s+CHECK\s*\(\s*auth\.uid\(\)\s*=\s*id\s*\)/i.test(schema), 'profiles update policy must keep profile id actor-bound after update');
assert(/CREATE\s+POLICY\s+"Only owner can update team"[\s\S]*USING\s*\(\s*auth\.uid\(\)\s*=\s*owner_id\s*\)[\s\S]*WITH\s+CHECK\s*\(\s*auth\.uid\(\)\s*=\s*owner_id\s*\)/i.test(schema), 'teams update policy must keep owner_id actor-bound after update');
assert(/team_members_permissions_match_role_check[\s\S]*CHECK\s*\(\s*permissions\s*=\s*public\.team_role_permissions\(role\)\s*\)/i.test(schema), 'team_members.permissions must be constrained to the selected role preset');
for (const functionName of [
  'prevent_owner_workspace_reassignment',
  'prevent_user_workspace_reassignment',
  'prevent_team_member_reassignment',
]) {
  assert(/RAISE\s+EXCEPTION/i.test(schemaFunctionBlock(functionName)), `${functionName} must fail closed on workspace reassignment`);
}
for (const tableName of ['artists', 'bookings', 'expenses', 'other_income', 'audience_metrics']) {
  assert(
    new RegExp(`CREATE\\s+TRIGGER\\s+prevent_${escapeRegex(tableName)}_workspace_reassignment[\\s\\S]*ON\\s+public\\.${escapeRegex(tableName)}[\\s\\S]*EXECUTE\\s+FUNCTION\\s+public\\.prevent_owner_workspace_reassignment\\(\\)`, 'i').test(schema),
    `schema.sql missing owner workspace reassignment trigger for public.${tableName}`
  );
}
for (const tableName of ['tasks', 'revenue_goals', 'bbf_entries', 'closing_thoughts']) {
  assert(
    new RegExp(`CREATE\\s+TRIGGER\\s+prevent_${escapeRegex(tableName)}_workspace_reassignment[\\s\\S]*ON\\s+public\\.${escapeRegex(tableName)}[\\s\\S]*EXECUTE\\s+FUNCTION\\s+public\\.prevent_user_workspace_reassignment\\(\\)`, 'i').test(schema),
    `schema.sql missing user workspace reassignment trigger for public.${tableName}`
  );
}
assert(/CREATE\s+TRIGGER\s+prevent_team_members_reassignment[\s\S]*ON\s+public\.team_members[\s\S]*EXECUTE\s+FUNCTION\s+public\.prevent_team_member_reassignment\(\)/i.test(schema), 'schema.sql missing team_members reassignment trigger');
assert(migrationReadinessSql.includes('scripts/supabase-post-apply-canary-proof.sql'), 'migration readiness SQL must point operators to the canary proof helper when active-probe warnings remain');
assert(postApplyVerificationSql.includes('scripts/supabase-post-apply-canary-proof.sql'), 'post-apply verification SQL must point sample-row warnings to the canary proof helper');
assert(postApplyCanarySql.includes('RAISE EXCEPTION \'SP_POST_APPLY_CANARY_ROLLBACK\''), 'canary proof helper must force rollback of disposable proof rows');
assert(postApplyCanarySql.includes('canary.rollback_contained'), 'canary proof helper must report rollback containment');
assert(postApplyVerificationSql.includes('advisor.ai_context.rls_explicit_policy'), 'post-apply verification must prove ai_context has explicit RLS policy posture');
assert(postApplyVerificationSql.includes('advisor.security_definer_rpc_surface'), 'post-apply verification must prove the SECURITY DEFINER RPC allowlist');
assert(postApplyVerificationSql.includes('advisor.username_email_lookup_absent'), 'post-apply verification must prove username-to-email lookup remains absent');
assert(/UPDATE\s+public\.team_members[\s\S]*SET\s+team_id\s*=/i.test(postApplyCanarySql), 'canary proof helper must actively probe team_members team_id reassignment');
assert(/UPDATE\s+public\.team_members[\s\S]*SET\s+user_id\s*=/i.test(postApplyCanarySql), 'canary proof helper must actively probe team_members user_id reassignment');
assert(/UPDATE\s+public\.team_members[\s\S]*SET\s+permissions\s*=/i.test(postApplyCanarySql), 'canary proof helper must actively probe team_members permission mismatch rejection');
assert(/SET\s+owner_id\s*=\s*NULL/i.test(postApplyCanarySql), 'canary proof helper must actively probe owner_id reassignment');
assert(/SET\s+user_id\s*=\s*NULL/i.test(postApplyCanarySql), 'canary proof helper must actively probe user_id reassignment');
assert(/SET\s+team_id\s*=/i.test(postApplyCanarySql), 'canary proof helper must actively probe team_id reassignment');
for (const tableName of ['artists', 'bookings', 'expenses', 'other_income', 'audience_metrics', 'revenue_goals', 'bbf_entries', 'closing_thoughts']) {
  assert(postApplyCanarySql.includes(`'${tableName}'`), `canary proof helper must cover public.${tableName}`);
}
assert(postApplyCanarySql.includes('public.tasks'), 'canary proof helper must cover public.tasks');
for (const doc of [
  ['README.md', readme],
  ['SUPABASE_POST_APPLY_VERIFICATION.md', postApplyRunbook],
  ['STATE_SCHEMA.md', stateSchema],
  ['security_best_practices_report.md', securityReport],
]) {
  assert(doc[1].includes('scripts/supabase-post-apply-canary-proof.sql'), `${doc[0]} must document the post-apply canary proof helper`);
}
assert(postApplyRunbook.includes('canary.rollback_contained = pass'), 'post-apply runbook must require rollback containment evidence');
const anonFunctionGrants = [...schema.matchAll(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.([a-zA-Z0-9_]+)\([^)]*\)\s+TO\s+anon\b/gi)]
  .map((match) => match[1]);
assertExactSet(new Set(anonFunctionGrants), new Set(), 'anonymous RPC grant allowlist');
assert(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.getmyteamids\(UUID\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(schema), 'schema.sql must revoke browser execution from legacy getmyteamids alias');
assert(!/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.getmyteamids\(UUID\)\s+TO\s+authenticated/i.test(schema), 'schema.sql must not grant authenticated execution to legacy getmyteamids alias');
assert(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.sync_finance_artist_fields\(\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(schema), 'schema.sql must revoke browser execution from sync_finance_artist_fields trigger function');
const publicTables = [...schema.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.([a-zA-Z0-9_]+)/gi)].map((match) => match[1]);
for (const tableName of publicTables) {
  assert(
    new RegExp(`ALTER\\s+TABLE\\s+public\\.${escapeRegex(tableName)}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(schema),
    `schema.sql missing RLS enablement for public.${tableName}`
  );
}
const policyBlocks = schema.match(/CREATE\s+POLICY[\s\S]*?;/gi) || [];
for (const block of policyBlocks) {
  const policyName = block.match(/CREATE\s+POLICY\s+"([^"]+)"/i)?.[1] || 'unknown';
  assert(/\bTO\s+[^;]*\bauthenticated\b/i.test(block), `RLS policy "${policyName}" must explicitly target authenticated users`);
}
const functionBlocks = schema.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?\$\$;/gi) || [];
for (const block of functionBlocks) {
  if (/SECURITY\s+DEFINER/i.test(block)) {
    const functionName = block.match(/FUNCTION\s+public\.([a-zA-Z0-9_]+)/i)?.[1] || 'unknown';
    assert(/SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i.test(block), `SECURITY DEFINER function ${functionName} must set search_path = public, pg_temp`);
  }
}

assert(app.includes('const EMPTY_STATE_ACTIONS = {'), 'app.js must constrain empty-state CTA actions through EMPTY_STATE_ACTIONS');
assert(!/onclick="\$\{ctaAction\}"/.test(app), 'app.js must not inject empty-state CTA JavaScript into onclick');
assert(!/viewReceipt\('\$\{/.test(app), 'app.js must not inject stored receipt/proof data into inline JavaScript');
assert(app.includes('data-receipt-view="1"'), 'app.js receipt/proof buttons must use delegated data attributes');
assert(app.includes('bindCalendarGridActions'), 'app.js calendar day clicks must use delegated handlers');
assert(app.includes('data-nudge-dismiss="1"'), 'app.js nudge dismiss buttons must use delegated handlers');
assert(!/\sonclick=/.test(app), 'app.js must not ship inline onclick handlers');
assert(!/\sonkeydown=/.test(app), 'app.js must not ship inline onkeydown handlers');
assert(!/\[onclick/.test(app), 'app.js must not rely on inline onclick selector fallbacks');
assert(!/span class="tooltip-value">\$\{b\.event/i.test(app), 'app.js map tooltips must escape booking event names');
assert(!/<strong>\$\{location\}<\/strong>/i.test(app), 'app.js map tooltips must escape booking locations');
assert(!/\$\{evt\.event\}\s*-\s*\$\{evt\.artist\}/.test(app), 'app.js calendar tooltips must escape booking labels');
assert(app.includes('normalizeSafeImageSource'), 'app.js must normalize user-controlled image URLs before rendering');
assert(app.includes('readValidatedImageDataUrl'), 'app.js must validate image uploads before storing data URLs');
assert(app.includes('data-admin-action="approve"'), 'app.js admin user actions must dispatch through data attributes');
assert(!/adminApproveUser\('\$\{/.test(app), 'app.js must not inject admin user identifiers into inline JavaScript');
assert(!/adminDeleteUser\('\$\{/.test(app), 'app.js must not inject admin user identifiers into inline JavaScript');
assert(app.includes('messageEl.textContent = messageText'), 'app.js toast messages must render through textContent');
assert(!/sp-toast__msg">\$\{message\}/.test(app), 'app.js must not inject toast messages into raw HTML');
assert(!/sp-toast__title">\$\{opts\.title/.test(app), 'app.js must not inject toast titles into raw HTML');
assert(app.includes('function normalizePhosphorIconClass'), 'app.js must validate icon classes before HTML rendering');
assert(app.includes('const iconClass = normalizePhosphorIconClass(item.icon);'), 'app.js command palette icons must use validated icon class tokens');
assert(app.includes('const nudgeIconClass = normalizePhosphorIconClass(n.icon);'), 'app.js nudge icons must use validated icon class tokens');
assert(/function highlight\(text, query\)[\s\S]*return escapeHtml\(source\)/.test(app), 'app.js command palette highlight must escape untrusted labels');
assert(/sp-palette__result-sub">\$\{escapeHtml\(item\.sub \|\| ''\)\}<\/div>/.test(app), 'app.js command palette subtitles must be escaped');
assert(!/item\.icon\.includes\('<'\)/.test(app), 'app.js command palette must not allow raw icon HTML snippets');
assert(!/item\.icon\.startsWith\('ph-'\)/.test(app), 'app.js command palette must not use loose icon prefix checks');
assert(!/n\.icon\s*&&\s*n\.icon\.startsWith\('ph-'\)/.test(app), 'app.js nudge icons must not use loose icon prefix checks');
assert(!/sp-palette__result-sub">\$\{item\.sub \|\| ''\}/.test(app), 'app.js command palette must not inject subtitles as raw HTML');
assert(app.includes("const eventLabel = escapeHtml(booking.event || 'Untitled Event');"), 'app.js dashboard upcoming event names must be escaped before timeline HTML rendering');
assert(app.includes('<div class="timeline-title">${escapeHtml(item.title)}</div>'), 'app.js cash-flow timeline titles must be escaped before HTML rendering');
assert(app.includes('<div class="timeline-sub">${escapeHtml(formatDisplayDate(item.date))}  -  ${escapeHtml(item.sub)}</div>'), 'app.js timeline subtitles must escape stored labels before HTML rendering');
assert(!/timeline-title">\$\{booking\.event/.test(app), 'app.js dashboard upcoming events must not inject booking.event as raw HTML');
assert(!/timeline-title">\$\{item\.title\}/.test(app), 'app.js timelines must not inject item.title as raw HTML');
assert(!/timeline-sub">\$\{formatDisplayDate\(item\.date\)\}\s+-\s+\$\{item\.sub\}/.test(app), 'app.js timelines must not inject item.sub as raw HTML');
assert(app.includes('map.replaceChildren();'), 'app.js performance map must clear through DOM replacement');
assert(app.includes('renderPanelContent(pinnedPanel, location, data.bookings);'), 'app.js performance map pin panels must render through DOM nodes');
assert(!/map\.innerHTML\s*=/.test(app), 'app.js performance map must not clear through innerHTML');
assert(!/pin\.innerHTML\s*=/.test(app), 'app.js performance map pins must not render booking data through innerHTML');
assert(!/pinnedPanel\.innerHTML\s*=/.test(app), 'app.js performance map panel must not render booking data through innerHTML');
assert(!/legend\.style\.cssText/.test(app), 'app.js performance map legend styles must live in CSS');
assert(app.includes("const name = escapeHtml(artist?.name || 'Artist');"), 'app.js booking artist dropdown must escape artist names before option HTML rendering');
assert(!/artistList\.map\(artist => `<option value="\$\{artist\.name\}">\$\{artist\.name\}<\/option>`\)/.test(app), 'app.js booking artist dropdown must not inject artist names as raw option HTML');
assert(tasks.includes('function bindTaskActions()'), 'app.tasks.js task controls must use delegated event handlers');
assert(tasks.includes('data-task-action="toggle"'), 'app.tasks.js task toggles must dispatch through data attributes');
assert(!/\son(?:click|change|keydown)=/.test(tasks), 'app.tasks.js must not ship inline task event handlers');
assert(globe.includes("addButton.dataset.globeAction = 'add-booking';"), 'app.globe.js add-booking control must dispatch through data attributes');
assert(!/\son(?:click|change|keydown)=/.test(globe), 'app.globe.js must not ship inline event handlers');
assert(globe.includes("function textElement(tagName, text)"), 'app.globe.js must render globe pin-card text through DOM text nodes');
assert(globe.includes('this.pinCard.replaceChildren('), 'app.globe.js pin cards must replace DOM children instead of innerHTML');
assert(!/pinCard\.innerHTML\s*=/.test(globe), 'app.globe.js pin cards must not render booking data through innerHTML');
assert(globe.includes('this.itinerary.replaceChildren('), 'app.globe.js itinerary must replace DOM children instead of innerHTML');
assert(globe.includes('this.sheetBody.replaceChildren(fragment)'), 'app.globe.js sheet cards must replace DOM children instead of innerHTML');
assert(globe.includes('renderBookingDetailContent(container, booking'), 'app.globe.js detail panels must share DOM-safe detail rendering');
assert(!/\.innerHTML\s*(?:=|\+=)/.test(globe), 'app.globe.js must not use innerHTML for itinerary, detail, sheet, or pin-card rendering');
assert(!/\son(?:click|change|keydown)=/.test(reports), 'app.reports.js must not ship inline event handlers');
assert(reports.includes('function renderReportFocusLines(bodyEl, lines)'), 'app.reports.js focus panel lines must render through DOM nodes');
assert(reports.includes('bodyEl.replaceChildren(fragment)'), 'app.reports.js focus panel must replace DOM children without innerHTML');
assert(!/bodyEl\.innerHTML\s*=/.test(reports), 'app.reports.js focus panel must not render report lines through innerHTML');
assert(todayBoard.includes('function createAlertItem(alert)'), 'app.todayboard.js alerts must render through DOM nodes');
assert(todayBoard.includes('container.replaceChildren(fragment)'), 'app.todayboard.js alert lists must replace DOM children without innerHTML');
assert(todayBoard.includes('function normalizeAlertAction(action)'), 'app.todayboard.js alert actions must use an allowlist before dispatch');
assert(!/data-alert-action="\$\{/.test(todayBoard), 'app.todayboard.js must not interpolate alert actions into HTML attributes');
assert(handcraft.includes("var icon = document.createElement('i');"), 'app.handcraft.js arrow icons must be created as DOM nodes');
assert(!/btn\.innerHTML\s*=/.test(handcraft), 'app.handcraft.js arrow controls must not inject icon HTML strings');
assert(!/teams\(id,\s*name,\s*invite_code/i.test(supabase), 'supabase.js fallback team query must not select teams.invite_code directly');
assert(supabase.includes('const inviteCode = /^[0-9a-f]{32}$/.test(rawInviteCode) ? rawInviteCode : null;'), 'supabase.js must display only valid admin-returned invite codes');
assert(!/legacyTeamPanelMarkupRemoved/.test(supabase), 'supabase.js must not keep unused legacy team panel HTML with unaudited sinks');
assert(supabase.includes('data-sp-team-action="update-member-role"'), 'supabase.js team role changes must dispatch through data attributes');
assert(supabase.includes('normalizeCloudId(teamId)'), 'supabase.js team mutation helpers must validate cloud UUID inputs');
assert(supabase.includes('function buildMessageElement(msg)'), 'supabase.js team chat messages must render through DOM nodes');
assert(supabase.includes('bubble.textContent = msg.content || \'\';'), 'supabase.js team chat message content must render through textContent');
assert(supabase.includes('container.replaceChildren(fragment)'), 'supabase.js team chat history must replace children with DOM nodes');
assert(!/buildMessageHTML/.test(supabase), 'supabase.js must not render team chat through HTML strings');
assert(supabase.includes('function buildTeamPanelElement'), 'supabase.js team modal must render through DOM nodes');
assert(supabase.includes('content.replaceChildren(buildTeamPanelElement'), 'supabase.js team panel refresh must replace DOM nodes instead of HTML strings');
assert(supabase.includes('list.replaceChildren(...options)'), 'supabase.js currency switcher must render options through DOM nodes');
assert(!/\.insertAdjacentHTML\s*\(/.test(supabase), 'supabase.js must not append team/user data with insertAdjacentHTML');
assert(!/\.innerHTML\s*(?:=|\+=)/.test(supabase), 'supabase.js must not use innerHTML assignment for team, currency, or auth UI');
assert(!/style\.textContent/.test(supabase), 'supabase.js must not inject runtime style blocks');
assert(!/document\.createElement\(["']style["']\)/.test(supabase), 'supabase.js must not create runtime style elements');
assert(!/window\.SP\.switchTeam\('\$\{/.test(supabase), 'supabase.js must not inject team ids into inline switchTeam handlers');
assert(!/window\.SP\.removeTeamMember\('\$\{/.test(supabase), 'supabase.js must not inject member ids into inline remove handlers');
assert(!/window\.SP\.updateTeamMemberRole\('\$\{/.test(supabase), 'supabase.js must not inject member ids into inline role handlers');
assert(!/\sonclick=/.test(supabase), 'supabase.js must not ship inline onclick handlers');
assert(!/\sonkeydown=/.test(supabase), 'supabase.js must not ship inline onkeydown handlers');
assert(supabase.includes('cloneWorkspacePayloadForTeamCopy'), 'supabase.js must clone personal data before team copy instead of reassigning row scope');
assert(supabase.includes('patchLinkedArtistIdsFromSavedRows'), 'supabase.js must preserve artist links after copied artists receive cloud IDs');
assert(supabase.includes("manifest.runtimeScript('supabase')"), 'supabase.js dynamic Supabase SDK loader must use same-origin runtimeScript metadata from app.browser-assets.js');
assert(rootShell.includes("externalLibrary('sentry', 'Sentry')"), 'app.root-shell.js deferred Sentry loader must pin SRI through app.browser-assets.js');
assert(rootShell.includes("externalLibrary('chart', 'Chart')"), 'app.root-shell.js deferred Chart loader must pin SRI through app.browser-assets.js');
assert(rootShell.includes("externalLibrary('jspdf', 'jspdf')"), 'app.root-shell.js deferred jsPDF loader must pin SRI through app.browser-assets.js');
assert(globe.includes(`from '${versionedAssetUrl('./assets/vendor/three/three.module.js')}'`), 'app.globe.js must load self-hosted Three.js without an inline importmap');
assert(globe.includes(`from '${versionedAssetUrl('./assets/vendor/three/OrbitControls.js')}'`), 'app.globe.js must load self-hosted OrbitControls without an inline importmap');
assert(globe.includes(`const TOPOJSON_CLIENT_URL = '${versionedAssetUrl('./assets/vendor/topojson-client/topojson-client.esm.js')}';`), 'app.globe.js must load self-hosted TopoJSON client');
assert(!/\bWORLD_ATLAS_URL\s*=/.test(globe), 'app.globe.js must not keep a CDN world-atlas fallback');
assert(orbitControls.includes(`from './three.module.js?v=${assetVersionFor('assets/vendor/three/three.module.js')}';`), 'Vendored OrbitControls must share the self-hosted Three.js module URL');
assert(!/\sonclick=/.test(index), 'index.html must not ship inline onclick handlers');
assert(!/\sonkeydown=/.test(index), 'index.html must not ship inline onkeydown handlers');
for (const [fileName, text] of [
  ['app.boot-head.js', bootHead],
  ['app.public-pages.js', publicPageManifest],
  ['app.boot-flags.js', bootFlags],
  ['app.boot-body.js', bootBody],
]) {
  assert(!/\sonclick=/.test(text), `${fileName} must not ship inline onclick handlers`);
  assert(!/\sonkeydown=/.test(text), `${fileName} must not ship inline onkeydown handlers`);
  assert(!/\.innerHTML\s*(?:=|\+=)/.test(text), `${fileName} must not use innerHTML`);
}
assert(!/\sonclick=/.test(rootShell), 'app.root-shell.js must not ship inline onclick handlers');
assert(!/\sonkeydown=/.test(rootShell), 'app.root-shell.js must not ship inline onkeydown handlers');
for (const [fileName, text, budget] of [
  ['app.js', app, { innerHTML: 67, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['supabase.js', supabase, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['index.html', index, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['app.boot-head.js', bootHead, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['app.public-pages.js', publicPageManifest, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['app.boot-flags.js', bootFlags, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['app.boot-body.js', bootBody, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['public-page-head.js', publicPageHead, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['public-page-theme.js', publicPageTheme, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['app.root-shell.js', rootShell, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['app.globe.js', globe, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['app.todayboard.js', todayBoard, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['app.handcraft.js', handcraft, { innerHTML: 0, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
  ['app.tasks.js', tasks, { innerHTML: 2, insertAdjacentHTML: 0, inlineOnclick: 0, inlineOnkeydown: 0 }],
]) {
  assertCountAtMost(text, /\.innerHTML\s*(?:=|\+=)/g, budget.innerHTML, `${fileName} audited innerHTML sink budget`);
  assertCountAtMost(text, /\.insertAdjacentHTML\s*\(/g, budget.insertAdjacentHTML, `${fileName} audited insertAdjacentHTML sink budget`);
  assertCountAtMost(text, /\sonclick=/g, budget.inlineOnclick, `${fileName} audited inline onclick budget`);
  assertCountAtMost(text, /\sonkeydown=/g, budget.inlineOnkeydown, `${fileName} audited inline onkeydown budget`);
}

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
  if (/(?:SUPABASE_)?SERVICE_ROLE(?:_KEY)?\s*=/.test(text)) fail(`Possible Supabase service-role env assignment in ${rel}`);
  if (/SUPABASE_(?:JWT_SECRET|DB_PASSWORD|ACCESS_TOKEN|SECRET_KEY)\s*=/.test(text)) fail(`Possible Supabase sensitive env assignment in ${rel}`);
  assertNoServiceRoleJwt(rel, text);
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

console.log('Preflight passed: deploy path, browser asset contract, cache versions, manifest icons, route/host invariants, self-hosted runtime assets, CSP scope, and account-recovery checks are clean.');
