import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const files = {
  cache: readFileSync(new URL('./app.offline-cache.js', import.meta.url), 'utf8'),
  app: readFileSync(new URL('./app.js', import.meta.url), 'utf8'),
  supabase: readFileSync(new URL('./supabase.js', import.meta.url), 'utf8'),
  html: readFileSync(new URL('./index.html', import.meta.url), 'utf8'),
};

function loadCacheModule() {
  const sandbox = { setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  runInNewContext(files.cache, sandbox, { filename: 'app.offline-cache.js' });
  return sandbox.SP_OFFLINE_CACHE;
}

const cache = loadCacheModule();

test('module publishes the offline cache API', () => {
  for (const key of [
    'isSupported',
    'isCompleteCoreSnapshot',
    'sanitizeSnapshotPayload',
    'chooseBootSnapshot',
    'formatSyncedAt',
    'saveSnapshot',
    'loadSnapshot',
    'loadBootSnapshot',
    'clearAll',
    'showOfflineBanner',
    'hideOfflineBanner',
  ]) {
    assert.equal(typeof cache[key], 'function', `SP_OFFLINE_CACHE.${key} missing`);
  }
  // No IndexedDB in this sandbox: the module must degrade to unsupported.
  assert.equal(cache.isSupported(), false);
});

test('only complete core snapshots qualify for caching', () => {
  const complete = { bookings: [], expenses: [], otherIncome: [], artists: [] };
  assert.equal(cache.isCompleteCoreSnapshot(complete), true);
  assert.equal(cache.isCompleteCoreSnapshot({ ...complete, artists: undefined }), false);
  assert.equal(cache.isCompleteCoreSnapshot({ ...complete, bookings: 'nope' }), false);
  assert.equal(cache.isCompleteCoreSnapshot(null), false);
});

test('sanitizeSnapshotPayload whitelists data keys and strips bookkeeping', () => {
  const sanitized = cache.sanitizeSnapshotPayload({
    bookings: [{ id: 1, fee: 1000, fn: () => {} }],
    expenses: [],
    otherIncome: [],
    artists: [],
    theme: 'dark',
    __meta: { corePartial: false },
    __workspace: { scopeKey: 'x' },
    rogueKey: 'dropped',
  });
  assert.ok(sanitized);
  assert.deepEqual(Object.keys(sanitized).sort(), ['artists', 'bookings', 'expenses', 'otherIncome', 'theme']);
  assert.equal(sanitized.bookings[0].fee, 1000);
  assert.equal('fn' in sanitized.bookings[0], false, 'functions must not survive serialization');
  assert.equal(cache.sanitizeSnapshotPayload({}), null);
  assert.equal(cache.sanitizeSnapshotPayload(null), null);
});

test('chooseBootSnapshot only offers the active scope for the same owner', () => {
  const core = { bookings: [], expenses: [], otherIncome: [], artists: [] };
  const records = [
    { scopeKey: 'owner-1', ownerId: 'owner-1', savedAt: 100, payload: core },
    { scopeKey: 'owner-1', ownerId: 'owner-1', savedAt: 300, payload: core },
    { scopeKey: 'team:t1', ownerId: 'owner-1', savedAt: 900, payload: core },
    { scopeKey: 'owner-2', ownerId: 'owner-2', savedAt: 999, payload: core },
    { scopeKey: 'owner-1', ownerId: 'owner-1', savedAt: 500, payload: { bookings: [] } },
  ];
  const best = cache.chooseBootSnapshot(records, 'owner-1', 'owner-1');
  assert.equal(best.savedAt, 300, 'newest complete snapshot for the active scope wins');
  assert.equal(cache.chooseBootSnapshot(records, 'team:t1', 'owner-1').savedAt, 900);
  assert.equal(cache.chooseBootSnapshot(records, 'team:t9', 'owner-1'), null, 'never hydrate a mismatched scope');
  assert.equal(cache.chooseBootSnapshot(records, 'owner-2', 'owner-1'), null, 'never hydrate another owner');
  assert.equal(cache.chooseBootSnapshot(records, '', 'owner-1'), null);
  assert.equal(cache.chooseBootSnapshot([], 'owner-1', 'owner-1'), null);
});

test('formatSyncedAt labels staleness in plain words', () => {
  const noon = new Date(2026, 5, 11, 12, 0, 0).getTime();
  const sameDay = cache.formatSyncedAt(new Date(2026, 5, 11, 9, 30, 0).getTime(), noon);
  assert.match(sameDay, /^today /);
  const older = cache.formatSyncedAt(new Date(2026, 5, 8, 21, 15, 0).getTime(), noon);
  assert.match(older, /Jun/);
  assert.equal(cache.formatSyncedAt(undefined, noon), 'a while ago');
  assert.equal(cache.formatSyncedAt(-5, noon), 'a while ago');
});

test('offline boot path is wired into the bootstrap failure branches', () => {
  assert.match(files.supabase, /async function tryOfflineSnapshotBoot\(reason, flowId\)/);
  for (const reason of [
    'bootstrap-all-critical-timed-out',
    'bootstrap-no-first-paint',
    'bootstrap-error',
    'bootstrap-safety-timeout',
  ]) {
    assert.ok(
      files.supabase.includes(`tryOfflineSnapshotBoot('${reason}'`),
      `supabase.js must attempt offline hydration for ${reason}`
    );
  }
  assert.match(
    files.supabase,
    /window\.loadUserData\(\{ snapshot: record\.payload, source: 'offline-cache', provisional: true \}\);/,
    'offline hydration must stay provisional so writes remain guarded'
  );
  assert.match(files.supabase, /cache\.showOfflineBanner\(record\.savedAt\);/);
});

test('cloud applies persist snapshots and logout wipes them', () => {
  assert.match(files.app, /SP_OFFLINE_CACHE\.saveSnapshot\(normalizedActiveScopeKey, cloudData/, 'app.js must persist verified cloud snapshots');
  assert.match(files.app, /options\.source !== 'offline-cache'/, 'offline-cache re-applies must never re-persist');
  assert.match(files.supabase, /window\.SP_OFFLINE_CACHE\.clearAll\(\);/, 'logout must clear cached financial snapshots');
});

test('module ships in the boot order before supabase.js', () => {
  const cacheTag = files.html.indexOf('app.offline-cache.js?v=');
  const supabaseTag = files.html.indexOf('src="supabase.js?v=');
  assert.notEqual(cacheTag, -1, 'index.html must load app.offline-cache.js');
  assert.notEqual(supabaseTag, -1);
  assert.ok(cacheTag < supabaseTag, 'offline cache must load before supabase.js');
});
