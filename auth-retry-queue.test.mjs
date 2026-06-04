import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const supabase = readFileSync(new URL('./supabase.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const docs = readFileSync(new URL('./STAR_PAPER_DOCUMENTATION.md', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const marker = new RegExp(`function\\s+${name}\\s*\\(`);
  const match = marker.exec(source);
  assert.ok(match, `Missing function ${name}`);

  const bodyStart = /\)\s*\{/.exec(source.slice(match.index));
  assert.ok(bodyStart, `Missing function body for ${name}`);
  const open = match.index + bodyStart.index + bodyStart[0].lastIndexOf('{');
  assert.notEqual(open, -1, `Missing opening brace for ${name}`);

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(match.index, i + 1);
  }

  assert.fail(`Missing closing brace for ${name}`);
}

function sourceSlice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker for ${label}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker for ${label}`);
  return source.slice(start, end);
}

test('retry queue persistence is enabled and owner scoped', () => {
  const persistRetryQueue = extractFunction(supabase, 'persistRetryQueue');
  const readStoredRetryQueue = extractFunction(supabase, 'readStoredRetryQueue');
  const restoreRetryQueue = extractFunction(supabase, 'restoreRetryQueue');
  const normalizeRetryQueueEntry = extractFunction(supabase, 'normalizeRetryQueueEntry');

  assert.match(supabase, /const\s+RETRY_QUEUE_STORAGE_VERSION\s*=\s*2/);
  assert.match(supabase, /const\s+MAX_RETRY_QUEUE_AGE_MS\s*=/);
  assert.match(persistRetryQueue, /localStorage\.setItem\(RETRY_QUEUE_STORAGE_KEY/);
  assert.match(readStoredRetryQueue, /localStorage\.getItem\(RETRY_QUEUE_STORAGE_KEY/);
  assert.match(restoreRetryQueue, /readStoredRetryQueue\(\)/);
  assert.doesNotMatch(persistRetryQueue, /function\s+persistRetryQueue[\s\S]*?\{\s*\/\/[^\n]*\n\s*return\s*;/);
  assert.doesNotMatch(restoreRetryQueue, /function\s+restoreRetryQueue[\s\S]*?\{\s*\/\/[^\n]*\n\s*return\s*;/);
  assert.match(normalizeRetryQueueEntry, /ownerId/);
  assert.match(normalizeRetryQueueEntry, /workspaceMeta/);
});

test('retry queue replay cannot run under a different account or workspace', () => {
  const processRetryQueue = extractFunction(supabase, 'processRetryQueue');
  const enqueueSave = extractFunction(supabase, 'enqueueSave');

  assert.match(processRetryQueue, /const\s+ownerId\s*=\s*getOwnerId\(\)/);
  assert.match(processRetryQueue, /filterRetryQueueForOwner\(ownerId\)/);
  assert.match(processRetryQueue, /entry\.ownerId\s*!==\s*ownerId/);
  assert.match(processRetryQueue, /saveAllData\(entry\.payload,\s*\{[\s\S]*workspaceMeta:\s*entry\.workspaceMeta/);
  assert.match(enqueueSave, /ownerId/);
  assert.match(enqueueSave, /retryEntryKey/);
});

test('logout preserves only scoped retry transport for same-account restore', () => {
  assert.doesNotMatch(supabase, /_retryQueue\s*=\s*\[\]\s*;\s*\n\s*persistRetryQueue\(\)/);
  assert.match(supabase, /const\s+logoutOwnerId\s*=\s*getOwnerId\(\)/);
  assert.match(supabase, /filterRetryQueueForOwner\(logoutOwnerId\)/);
  assert.match(supabase, /restoreRetryQueue\(\{\s*schedule:\s*true\s*\}\)/);
});

test('public save wrapper surfaces queued retry state without treating it as saved', () => {
  assert.match(supabase, /async\s+function\s+queueCloudSync\s*\(/);
  assert.match(supabase, /queueCloudSync,\s*\n/);
  assert.match(app, /queued:\s*Boolean\(result\.queued\s*\|\|\s*result\.context\?\.queued\)/);
  assert.match(app, /if\s*\(result\?\.ok\s*\|\|\s*result\?\.cloudSynced\)/);
});

test('initial session bootstrap cannot be skipped by a merely observed auth event', () => {
  const authStateSource = sourceSlice(
    supabase,
    'db.auth.onAuthStateChange((event, session) => {',
    'async function createTeam(name)',
    'onAuthStateChange'
  );
  const initSource = sourceSlice(
    supabase,
    'function init()',
    'setTimeout(patchAppAuth, 0);',
    'init'
  );
  const initialSessionSource = extractFunction(supabase, 'bootstrapInitialSession');

  assert.match(supabase, /let\s+_initialAuthBootstrapStarted\s*=\s*false/);
  assert.match(supabase, /function\s+markInitialAuthBootstrapStarted\s*\(/);
  assert.match(authStateSource, /let\s+bootstrapFlowId\s*=\s*flowId/);
  assert.match(authStateSource, /bootstrap-rebased/);
  assert.match(authStateSource, /markInitialAuthBootstrapStarted\(\);/);
  assert.doesNotMatch(authStateSource, /if\s*\(!isBootTransitionCurrentSafe\(flowId\)\s*\|\|\s*window\.__spAppBooted\s*\|\|\s*_bootstrapping\)\s*return;/);
  assert.match(initialSessionSource, /initial-session:bootstrap-rebased/);
  assert.match(initialSessionSource, /markInitialAuthBootstrapStarted\(\);/);
  assert.match(initSource, /const\s+initialSessionBootstrapOwned\s*=/);
  assert.match(initSource, /_initialAuthBootstrapStarted/);
  assert.doesNotMatch(initSource, /window\.__spInitialAuthEventSeen\s*&&[\s\S]*?_pendingAuthRedirectSession\?\.session\?\.user/);
});

test('OAuth callback stale flow still bootstraps recovered sessions', () => {
  const authRedirectSource = sourceSlice(
    supabase,
    'async function handleAuthRedirect()',
    'async function isUsernameAvailable',
    'handleAuthRedirect'
  );
  const bootstrapSessionSource = sourceSlice(
    supabase,
    'async function bootstrapFromSupabaseSession(session, options = {})',
    'async function signInWithGoogle()',
    'bootstrapFromSupabaseSession'
  );
  const sessionRestoreFallbackSource = extractFunction(supabase, 'scheduleLocalSessionRestoreFallback');

  assert.match(authRedirectSource, /auth-redirect:bootstrap-rebased/);
  assert.match(authRedirectSource, /markInitialAuthBootstrapStarted\(\);/);
  assert.doesNotMatch(authRedirectSource, /finishWith\('stale'[\s\S]*?shouldBootstrapStoredSession:\s*false/);
  assert.match(bootstrapSessionSource, /bootstrap-session:rebased/);
  assert.match(bootstrapSessionSource, /bootstrap-session:app-ready-rebased/);
  assert.match(bootstrapSessionSource, /bootstrap-session:show-app-rebased/);
  assert.doesNotMatch(bootstrapSessionSource, /if\s*\(!isBootTransitionCurrentSafe\(flowId\)\)\s*return\s+false;/);
  assert.match(sessionRestoreFallbackSource, /session-restore-fallback:rebased/);
  assert.match(sessionRestoreFallbackSource, /isAuthBootBlockingState\(state\)/);
  assert.doesNotMatch(sessionRestoreFallbackSource, /if\s*\(flowId\s*&&\s*!isBootTransitionCurrentSafe\(flowId\)\)\s*return;/);
});

test('visible app shell clears stale blocking boot overlay', () => {
  const showApp = extractFunction(app, 'showApp');

  assert.match(showApp, /const\s+hasStaleBlockingBootOverlay\s*=/);
  assert.match(showApp, /isBootRevealBlockingState\(bootLoaderState\)/);
  assert.match(showApp, /isAppShellVisible\(\)/);
  assert.match(showApp, /ownsBootLoader\s*\|\|\s*hasStaleBlockingBootOverlay/);
  assert.match(showApp, /hydrationPending\s*\|\|\s*hasStaleBlockingBootOverlay\s*\?\s*80\s*:\s*220/);
});

test('docs describe retry queue as account-scoped transport only', () => {
  assert.match(readme, /account-scoped retry transport/);
  assert.match(docs, /account-scoped retry queue/);
  assert.match(docs, /transport state only/);
  assert.match(docs, /same Supabase user/);
});
