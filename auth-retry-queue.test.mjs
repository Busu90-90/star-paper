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

test('docs describe retry queue as account-scoped transport only', () => {
  assert.match(readme, /account-scoped retry transport/);
  assert.match(docs, /account-scoped retry queue/);
  assert.match(docs, /transport state only/);
  assert.match(docs, /same Supabase user/);
});
