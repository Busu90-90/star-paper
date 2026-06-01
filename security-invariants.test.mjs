import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function readBrowserAssets() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  runInNewContext(read('./app.browser-assets.js'), sandbox, { filename: 'app.browser-assets.js' });
  return sandbox.SP_BROWSER_ASSETS;
}

test('team invite codes are high entropy and legacy short codes fail closed', () => {
  const schema = read('./schema.sql');
  const supabase = read('./supabase.js');

  assert.match(schema, /CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;/);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.generate_team_invite_code\(\)/);
  assert.match(schema, /encode\(extensions\.gen_random_bytes\(16\), 'hex'\)/);
  assert.doesNotMatch(schema, /substr\s*\(\s*md5\s*\(/i);
  assert.match(schema, /teams_invite_code_format_check/);
  assert.match(schema, /v_invite_code\s*!\~\s*'\^\[0-9a-f\]\{32\}\$'/);
  assert.match(schema, /REVOKE\s+SELECT\s+ON\s+public\.teams\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i);
  assert.match(schema, /GRANT\s+SELECT\s*\(\s*id\s*,\s*name\s*,\s*owner_id\s*,\s*created_at\s*\)\s+ON\s+public\.teams\s+TO\s+authenticated/i);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.get_my_team_context[\s\S]*CASE\s+WHEN[\s\S]*THEN\s+t\.invite_code[\s\S]*ELSE\s+NULL[\s\S]*END\s+AS\s+invite_code/i);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.get_bootstrap_payload[\s\S]*'invite_code'\s*,\s*CASE\s+WHEN[\s\S]*THEN\s+t\.invite_code[\s\S]*ELSE\s+NULL/i);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.join_team_by_code[\s\S]*RETURN\s+json_build_object\([\s\S]*'invite_code'\s*,\s*NULL/i);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.join_team_by_code[\s\S]*RAISE\s+EXCEPTION\s+'Invalid invite request'/i);
  assert.doesNotMatch(schema.match(/CREATE OR REPLACE FUNCTION public\.join_team_by_code[\s\S]*?\$\$;/i)?.[0] || '', /Invalid invite code/i);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.get_team_members_context[\s\S]*public\.has_team_permission\(p_team_id,\s*'admin'\)[\s\S]*THEN\s+p\.email[\s\S]*ELSE\s+NULL[\s\S]*END\s+AS\s+email/i);
  for (const block of schema.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?\$\$;/gi) || []) {
    if (/SECURITY\s+DEFINER/i.test(block)) {
      assert.match(block, /SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    }
  }
  for (const block of schema.match(/CREATE\s+POLICY[\s\S]*?;/gi) || []) {
    assert.match(block, /\bTO\s+[^;]*\bauthenticated\b/i);
  }
  assert.doesNotMatch(supabase, /teams\(id,\s*name,\s*invite_code/i);
  assert.match(supabase, /const inviteCode = \/\^\[0-9a-f\]\{32\}\$\/\.test\(rawInviteCode\) \? rawInviteCode : null;/);
  assert.doesNotMatch(supabase, /legacyTeamPanelMarkupRemoved/);
});

test('workspace rows cannot be reassigned across owners, users, or teams', () => {
  const schema = read('./schema.sql');
  const supabase = read('./supabase.js');

  assert.match(schema, /CREATE POLICY "Users can update their own profile"[\s\S]*WITH CHECK\s*\(\s*auth\.uid\(\)\s*=\s*id\s*\)/);
  assert.match(schema, /CREATE POLICY "Only owner can update team"[\s\S]*WITH CHECK\s*\(\s*auth\.uid\(\)\s*=\s*owner_id\s*\)/);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.prevent_owner_workspace_reassignment\(\)[\s\S]*Workspace scope cannot be changed/);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.prevent_user_workspace_reassignment\(\)[\s\S]*Workspace scope cannot be changed/);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\.prevent_team_member_reassignment\(\)[\s\S]*Team membership cannot be moved between teams/);
  assert.match(schema, /team_members_permissions_match_role_check[\s\S]*CHECK\s*\(\s*permissions\s*=\s*public\.team_role_permissions\(role\)\s*\)/i);

  for (const tableName of ['artists', 'bookings', 'expenses', 'other_income', 'audience_metrics']) {
    assert.match(
      schema,
      new RegExp(`CREATE\\s+TRIGGER\\s+prevent_${tableName}_workspace_reassignment[\\s\\S]*ON\\s+public\\.${tableName}[\\s\\S]*prevent_owner_workspace_reassignment\\(\\)`, 'i')
    );
  }

  for (const tableName of ['tasks', 'revenue_goals', 'bbf_entries', 'closing_thoughts']) {
    assert.match(
      schema,
      new RegExp(`CREATE\\s+TRIGGER\\s+prevent_${tableName}_workspace_reassignment[\\s\\S]*ON\\s+public\\.${tableName}[\\s\\S]*prevent_user_workspace_reassignment\\(\\)`, 'i')
    );
  }
  assert.match(schema, /CREATE\s+TRIGGER\s+prevent_team_members_reassignment[\s\S]*prevent_team_member_reassignment\(\)/i);
  assert.match(supabase, /function cloneWorkspacePayloadForTeamCopy/);
  assert.match(supabase, /function patchLinkedArtistIdsFromSavedRows/);
  assert.match(supabase, /migratePersonalDataToTeamCopy/);
});

test('frontend image and CTA sinks are constrained before rendering', () => {
  const assets = readBrowserAssets();
  const app = read('./app.js');
  const supabase = read('./supabase.js');
  const index = read('./index.html');
  const publicPageManifest = read('./app.public-pages.js');
  const bootHead = read('./app.boot-head.js');
  const bootFlags = read('./app.boot-flags.js');
  const bootBody = read('./app.boot-body.js');
  const publicPageHead = read('./public-page-head.js');
  const publicPageTheme = read('./public-page-theme.js');
  const rootShell = read('./app.root-shell.js');
  const tasks = read('./app.tasks.js');
  const todayBoard = read('./app.todayboard.js');
  const globe = read('./app.globe.js');
  const reports = read('./app.reports.js');
  const handcraft = read('./app.handcraft.js');

  assert.match(app, /const EMPTY_STATE_ACTIONS = \{/);
  assert.doesNotMatch(app, /onclick="\$\{ctaAction\}"/);
  assert.match(app, /data-empty-action/);
  assert.doesNotMatch(app, /viewReceipt\('\$\{/);
  assert.match(app, /data-receipt-view="1"/);
  assert.match(app, /function bindCalendarGridActions/);
  assert.match(app, /data-nudge-dismiss="1"/);
  assert.doesNotMatch(app, /\sonclick=/);
  assert.doesNotMatch(app, /\sonkeydown=/);
  assert.doesNotMatch(app, /\[onclick/);
  assert.doesNotMatch(app, /span class="tooltip-value">\$\{b\.event/i);
  assert.doesNotMatch(app, /<strong>\$\{location\}<\/strong>/i);
  assert.doesNotMatch(app, /\$\{evt\.event\}\s*-\s*\$\{evt\.artist\}/);
  assert.match(app, /function normalizeSafeImageSource/);
  assert.match(app, /function readValidatedImageDataUrl/);
  assert.match(app, /SP_ALLOWED_UPLOAD_IMAGE_TYPES/);
  assert.match(app, /data-admin-action="approve"/);
  assert.doesNotMatch(app, /adminApproveUser\('\$\{/);
  assert.doesNotMatch(app, /adminDeleteUser\('\$\{/);
  assert.match(app, /escapeHtml\(u\.name \|\| u\.email \|\| '-'\)/);
  assert.match(app, /messageEl\.textContent = messageText/);
  assert.doesNotMatch(app, /sp-toast__msg">\$\{message\}/);
  assert.doesNotMatch(app, /sp-toast__title">\$\{opts\.title/);
  assert.match(app, /function normalizePhosphorIconClass/);
  assert.match(app, /const iconClass = normalizePhosphorIconClass\(item\.icon\);/);
  assert.match(app, /const nudgeIconClass = normalizePhosphorIconClass\(n\.icon\);/);
  assert.match(app, /function highlight\(text, query\)[\s\S]*return escapeHtml\(source\)/);
  assert.match(app, /sp-palette__result-sub">\$\{escapeHtml\(item\.sub \|\| ''\)\}<\/div>/);
  assert.doesNotMatch(app, /item\.icon\.includes\('<'\)/);
  assert.doesNotMatch(app, /item\.icon\.startsWith\('ph-'\)/);
  assert.doesNotMatch(app, /n\.icon\s*&&\s*n\.icon\.startsWith\('ph-'\)/);
  assert.doesNotMatch(app, /sp-palette__result-sub">\$\{item\.sub \|\| ''\}/);
  assert.match(app, /const eventLabel = escapeHtml\(booking\.event \|\| 'Untitled Event'\);/);
  assert.match(app, /<div class="timeline-title">\$\{escapeHtml\(item\.title\)\}<\/div>/);
  assert.match(app, /<div class="timeline-sub">\$\{escapeHtml\(formatDisplayDate\(item\.date\)\)\}  -  \$\{escapeHtml\(item\.sub\)\}<\/div>/);
  assert.doesNotMatch(app, /timeline-title">\$\{booking\.event/);
  assert.doesNotMatch(app, /timeline-title">\$\{item\.title\}/);
  assert.doesNotMatch(app, /timeline-sub">\$\{formatDisplayDate\(item\.date\)\}\s+-\s+\$\{item\.sub\}/);
  assert.match(app, /const name = escapeHtml\(artist\?\.name \|\| 'Artist'\);/);
  assert.doesNotMatch(app, /artistList\.map\(artist => `<option value="\$\{artist\.name\}">\$\{artist\.name\}<\/option>`\)/);
  assert.match(tasks, /function bindTaskActions\(\)/);
  assert.match(tasks, /data-task-action="toggle"/);
  assert.doesNotMatch(tasks, /\son(?:click|change|keydown)=/);
  assert.match(todayBoard, /function createAlertItem\(alert\)/);
  assert.match(todayBoard, /function normalizeAlertAction\(action\)/);
  assert.match(todayBoard, /container\.replaceChildren\(fragment\)/);
  assert.doesNotMatch(todayBoard, /\.innerHTML\s*(?:=|\+=)/);
  assert.doesNotMatch(todayBoard, /data-alert-action="\$\{/);
  assert.match(handcraft, /var icon = document\.createElement\('i'\);/);
  assert.doesNotMatch(handcraft, /btn\.innerHTML\s*=/);
  assert.doesNotMatch(handcraft, /\.innerHTML\s*(?:=|\+=)/);
  assert.match(globe, /addButton\.dataset\.globeAction = 'add-booking';/);
  assert.match(globe, /function textElement\(tagName, text\)/);
  assert.match(globe, /this\.pinCard\.replaceChildren\(/);
  assert.match(globe, /this\.itinerary\.replaceChildren\(/);
  assert.match(globe, /this\.sheetBody\.replaceChildren\(fragment\)/);
  assert.match(globe, /renderBookingDetailContent\(container, booking/);
  assert.doesNotMatch(globe, /pinCard\.innerHTML\s*=/);
  assert.doesNotMatch(globe, /\.innerHTML\s*(?:=|\+=)/);
  assert.doesNotMatch(globe, /\son(?:click|change|keydown)=/);
  assert.match(reports, /function renderReportFocusLines\(bodyEl, lines\)/);
  assert.match(reports, /bodyEl\.replaceChildren\(fragment\)/);
  assert.doesNotMatch(reports, /bodyEl\.innerHTML\s*=/);
  assert.doesNotMatch(reports, /\son(?:click|change|keydown)=/);
  assert.match(supabase, /data-sp-team-action="update-member-role"/);
  assert.match(supabase, /normalizeCloudId\(teamId\)/);
  assert.match(supabase, /function buildMessageElement\(msg\)/);
  assert.match(supabase, /username\.textContent = msg\.username \|\| 'Teammate'/);
  assert.match(supabase, /bubble\.textContent = msg\.content \|\| ''/);
  assert.match(supabase, /container\.replaceChildren\(fragment\)/);
  assert.doesNotMatch(supabase, /buildMessageHTML/);
  assert.doesNotMatch(supabase, /\.insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(supabase, /window\.SP\.switchTeam\('\$\{/);
  assert.doesNotMatch(supabase, /window\.SP\.removeTeamMember\('\$\{/);
  assert.doesNotMatch(supabase, /window\.SP\.updateTeamMemberRole\('\$\{/);
  assert.doesNotMatch(supabase, /\sonclick=/);
  assert.doesNotMatch(supabase, /\sonkeydown=/);
  assert.doesNotMatch(index, /\sonclick=/);
  assert.doesNotMatch(index, /\sonkeydown=/);
  for (const bootFile of [bootHead, bootFlags, bootBody]) {
    assert.doesNotMatch(bootFile, /\sonclick=/);
    assert.doesNotMatch(bootFile, /\sonkeydown=/);
    assert.doesNotMatch(bootFile, /\.innerHTML\s*(?:=|\+=)/);
  }
  assert.match(publicPageManifest, /SP_PUBLIC_PAGES/);
  assert.doesNotMatch(publicPageManifest, /\sonclick=/);
  assert.doesNotMatch(publicPageManifest, /\sonkeydown=/);
  assert.doesNotMatch(publicPageManifest, /\.innerHTML\s*(?:=|\+=)/);
  for (const publicBootFile of [publicPageHead, publicPageTheme]) {
    assert.doesNotMatch(publicBootFile, /\sonclick=/);
    assert.doesNotMatch(publicBootFile, /\sonkeydown=/);
    assert.doesNotMatch(publicBootFile, /\.innerHTML\s*(?:=|\+=)/);
    assert.doesNotMatch(publicBootFile, /\.insertAdjacentHTML\s*\(/);
  }
  for (const pagePath of ['./how-it-works.html', './proof.html', './testimonials.html']) {
    const page = read(pagePath);
    assert.ok(page.includes(assets.url('public-page-head.js')));
    assert.ok(page.includes(assets.url('public-page-theme.js')));
    assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
    assert.doesNotMatch(page, /<style\b/i);
    assert.doesNotMatch(page, /\sstyle\s*=/);
    assert.doesNotMatch(page, /script-src[^;]*'unsafe-inline'/i);
    assert.doesNotMatch(page, /style-src[^;]*'unsafe-inline'/i);
  }
  assert.doesNotMatch(rootShell, /\sonclick=/);
  assert.doesNotMatch(rootShell, /\sonkeydown=/);
  assert.doesNotMatch(rootShell, /\.innerHTML\s*(?:=|\+=)/);
  assert.match(index, /data-action="showCurrencySwitcher"/);
  assert.match(rootShell, /localFileBannerClose/);
  assert.match(rootShell, /appendText\(banner/);
});

test('third-party script loaders and deploy preflight pin browser supply-chain controls', () => {
  const assets = readBrowserAssets();
  const index = read('./index.html');
  const headers = read('./_headers');
  const assetContract = read('./app.browser-assets.js');
  const publicPageManifest = read('./app.public-pages.js');
  const bootHead = read('./app.boot-head.js');
  const bootFlags = read('./app.boot-flags.js');
  const bootBody = read('./app.boot-body.js');
  const rootShell = read('./app.root-shell.js');
  const globe = read('./app.globe.js');
  const sw = read('./sw.js');
  const supabase = read('./supabase.js');
  const preflight = read('./scripts/preflight.mjs');
  const fontCss = read('./assets/vendor/fonts/star-paper-fonts.css');
  const styles = read('./styles.css');
  const tokensCss = read('./star-paper-tokens.css');
  const supabaseSdk = assets.runtimeScript('supabase');

  assert.ok(index.includes(`href="${supabaseSdk.src}"`));
  assert.ok(index.includes(`src="${supabaseSdk.src}"`));
  assert.ok(index.includes(`integrity="${supabaseSdk.integrity}"`));
  assert.equal(supabaseSdk.src, assets.url('assets/vendor/supabase/supabase.min.js'));
  assert.equal(supabaseSdk.integrity, assets.integrityFor('assets/vendor/supabase/supabase.min.js'));
  assert.ok(sw.includes('SP_ASSET_MANIFEST.appShell'));
  assert.ok(assets.appShell.includes(assets.url('./assets/vendor/supabase/supabase.min.js')));
  assert.doesNotMatch(index, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/i);
  assert.doesNotMatch(supabase, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/i);
  assert.doesNotMatch(assetContract, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/i);
  assert.ok(index.includes(assets.url('app.browser-assets.js')));
  assert.ok(index.includes(assets.url('app.public-pages.js')));
  assert.ok(index.includes(assets.url('app.boot-head.js')));
  assert.ok(index.includes(assets.url('app.boot-flags.js')));
  assert.ok(index.includes(assets.url('app.boot-body.js')));
  assert.ok(index.includes(`${assets.url('app.root-shell.js')}" defer`));
  assert.doesNotMatch(index, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(index, /type="importmap"/i);
  assert.doesNotMatch(index, /script-src[^;]*'unsafe-inline'/i);
  assert.doesNotMatch(headers, /script-src[^;]*'unsafe-inline'/i);
  assert.match(bootHead, /redirectLegacyNetlifyOrigin/);
  assert.match(publicPageManifest, /SP_PUBLIC_PAGES/);
  assert.match(bootHead, /SP_PUBLIC_PAGES/);
  assert.doesNotMatch(bootHead, /var\s+publicRoutes\s*=\s*\{/);
  assert.match(bootFlags, /applyPolishFlagsBeforePaint/);
  assert.match(bootBody, /forceBootForAuthOrAppRoutes/);
  assert.doesNotMatch(index, /setupDeferredLibraries/);
  assert.doesNotMatch(index, /wireCriticalButtons/);
  assert.doesNotMatch(index, /window\.showForgotPassword\s*=/);
  assert.match(assetContract, /sentry:[\s\S]*integrity: 'sha384-/);
  assert.match(assetContract, /chart:[\s\S]*integrity: 'sha384-/);
  assert.match(assetContract, /jspdf:[\s\S]*integrity: 'sha384-/);
  assert.match(assetContract, /runtimeScriptPaths[\s\S]*supabase: 'assets\/vendor\/supabase\/supabase\.min\.js'/);
  assert.match(rootShell, /externalLibrary\('sentry', 'Sentry'\)/);
  assert.match(rootShell, /externalLibrary\('chart', 'Chart'\)/);
  assert.match(rootShell, /externalLibrary\('jspdf', 'jspdf'\)/);
  assert.match(rootShell, /assetManifest\(\)\.url\(path\)/);
  assert.ok(index.includes(assets.url('assets/vendor/fonts/star-paper-fonts.css')));
  assert.doesNotMatch(index, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(headers, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(styles, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(tokensCss, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(fontCss, /font-family: 'Montserrat'/);
  assert.match(fontCss, /font-family: 'Space Mono'/);
  assert.doesNotMatch(fontCss, /https?:\/\//);
  assert.ok(globe.includes(`from '${assets.url('./assets/vendor/three/three.module.js')}'`));
  assert.ok(globe.includes(`from '${assets.url('./assets/vendor/three/OrbitControls.js')}'`));
  assert.ok(globe.includes(`TOPOJSON_CLIENT_URL = '${assets.url('./assets/vendor/topojson-client/topojson-client.esm.js')}'`));
  assert.doesNotMatch(globe, /https:\/\/cdn\.jsdelivr\.net\/npm\/(?:three|topojson-client|world-atlas)@/);
  assert.match(sw, /importScripts\("\.\/app\.browser-assets\.js"\)/);
  assert.match(sw, /importScripts\("\.\/app\.public-pages\.js"\)/);
  assert.match(sw, /SP_PUBLIC_PAGES\.publicLandingRouteMap\(\)/);
  assert.match(sw, /SP_ASSET_MANIFEST\.appShell/);
  assert.ok(assets.appShell.includes(assets.url('./app.public-pages.js')));
  assert.ok(assets.appShell.includes(assets.url('./assets/vendor/three/three.module.js')));
  assert.ok(assets.appShell.includes(assets.url('./assets/vendor/topojson-client/topojson-client.esm.js')));
  assert.match(sw, /AUTH_CALLBACK_CACHE_BYPASS_PARAMS = new Set\(\[/);
  assert.match(sw, /"access_token"/);
  assert.match(sw, /"refresh_token"/);
  assert.match(sw, /"code"/);
  assert.match(sw, /const canCacheRequestUrl = !hasAuthCallbackCacheBypassParam\(requestUrl\);/);
  assert.match(sw, /response && response\.ok && canCacheRequestUrl/);
  assert.match(sw, /if \(hasAuthCallbackCacheBypassParam\(url\)\) return false;/);
  assert.match(supabase, /manifest\.runtimeScript\('supabase'\)/);
  assert.match(preflight, /assertExternalTagsHaveIntegrity/);
  assert.match(preflight, /loadBrowserAssets/);
  assert.match(preflight, /sha384Integrity/);
  assert.match(preflight, /assertNoForbiddenRuntimeDependency/);
  assert.match(preflight, /assertNoServiceRoleJwt/);
  assert.match(preflight, /indexInlineScripts\.length === 0/);
  assert.match(preflight, /script-src[^\\n]*unsafe-inline/);
});
