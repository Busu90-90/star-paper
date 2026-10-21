// Builds the folder Cloudflare Pages serves.
//
// Netlify publishes the repo root and skips files using .netlifyignore.
// Cloudflare Pages has no ignore file, so this copies only the files the site
// needs into dist/, using the same .netlifyignore rules. Nothing else in the
// repo (docs, SQL, scripts, backend, tests) goes online.
//
// It also writes a Cloudflare version of _redirects. Cloudflare Pages does not
// support redirects that match on a domain (the starpaper.netlify.app lines),
// or the "!" force marker, so those lines are left out. They only mattered on
// Netlify anyway.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

// Never shipped, whatever .netlifyignore says.
const ALWAYS_SKIP = ['.gitattributes', 'dist/', '.wrangler/', 'node_modules/', '.git/', 'netlify/', '.github/', 'wrangler.toml', '_redirects', '_headers'];

function globToRegex(glob) {
  let re = '';
  for (const ch of glob) {
    if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return re;
}

// The common .gitignore-style rules: "name", "dir/", "/anchored", "*.ext", "!keep".
function parseIgnore(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const negate = line.startsWith('!');
      let pattern = negate ? line.slice(1) : line;
      const dirOnly = pattern.endsWith('/');
      if (dirOnly) pattern = pattern.slice(0, -1);
      const anchored = pattern.startsWith('/') || pattern.includes('/');
      pattern = pattern.replace(/^\//, '');
      const body = globToRegex(pattern);
      const regex = new RegExp(anchored ? `^${body}(/|$)` : `(^|/)${body}(/|$)`);
      return { negate, dirOnly, regex };
    });
}

const rules = parseIgnore([...ALWAYS_SKIP, readFileSync(join(root, '.netlifyignore'), 'utf8')].join('\n'));

function isIgnored(path, isDir) {
  let ignored = false;
  for (const rule of rules) {
    // An ignored directory is never walked into, so a "dir/" rule only needs
    // to match the directory itself.
    if (rule.dirOnly && !isDir) continue;
    if (rule.regex.test(path)) ignored = !rule.negate;
  }
  return ignored;
}

function copyTree(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(sep).join('/');
    if (isIgnored(rel, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      count += copyTree(full);
    } else if (entry.isFile()) {
      const target = join(out, rel);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(full, target);
      count += 1;
    }
  }
  return count;
}

function cloudflareRedirects(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return true;
      const [from, , status = ''] = trimmed.split(/\s+/);
      return from.startsWith('/') && !status.endsWith('!');
    })
    .join('\n');
}

// Netlify-only header lines are harmless elsewhere, but leave them out so the
// Cloudflare copy says only what Cloudflare reads.
function cloudflareHeaders(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*Netlify-/i.test(line))
    .join('\n');
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const copied = copyTree(root);
writeFileSync(join(out, '_redirects'), cloudflareRedirects(readFileSync(join(root, '_redirects'), 'utf8')));
writeFileSync(join(out, '_headers'), cloudflareHeaders(readFileSync(join(root, '_headers'), 'utf8')));

if (!existsSync(join(out, 'index.html')) || !existsSync(join(out, 'sw.js'))) {
  throw new Error('Cloudflare build is missing index.html or sw.js');
}
console.log(`Cloudflare build: ${copied} files copied to dist/`);
