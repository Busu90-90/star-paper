// Builds the Star Paper logo pack from one vector definition.
//
//   node scripts/build-logo-pack.mjs
//
// Writes the SVG masters and rasterises every PNG the app, manifest, service
// worker and report PDF already reference (same filenames, so nothing else has
// to change when the mark is redrawn). Rasterising uses Playwright's Chromium:
// set PLAYWRIGHT_MODULE to its entry file if `playwright` is not installed in
// this repo (e.g. PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs).
//
// The mark is "Gold Record": a vinyl disc with a gold rim, grooves crossed by a
// rising revenue line, a gold star label and a punched spindle hole.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = join(ROOT, 'star_paper_logo_pack');

const round = (n) => +n.toFixed(2);

function starPath(cx, cy, outerR, innerR) {
  const points = [];
  for (let k = 0; k < 10; k += 1) {
    const r = k % 2 === 0 ? outerR : innerR;
    const deg = -90 + k * 36;
    points.push([round(cx + r * Math.cos((deg * Math.PI) / 180)), round(cy + r * Math.sin((deg * Math.PI) / 180))]);
  }
  return `M${points.map((p) => p.join(' ')).join(' L')} Z`;
}

const GOLD = { hi: '#FFEBB0', mid: '#E9B949', deep: '#8A5F17', line0: '#B8862B', line1: '#FFE9A8' };

// detail: 'full' for 48px and up, 'small' for favicons and 16–32px icons.
function recordMark({ detail = 'full' } = {}) {
  const small = detail === 'small';
  const id = small ? 'sps' : 'spf';
  const labelR = small ? 16 : 13;
  const lineW = small ? 6 : 4.2;

  let grooves = '';
  for (let r = labelR + 9; r <= 44; r += small ? 6.4 : 3.2) {
    grooves += `<circle cx="50" cy="50" r="${round(r)}" fill="none" stroke="#fff" stroke-opacity="${round(0.09 + ((r - 22) / 44) * 0.1)}" stroke-width="${small ? 1.1 : 0.7}"/>`;
  }

  // Spindle hole, true to scale: a real 12" record's hole is ~2.4% of its width,
  // so it is a pinprick of gold around a dark centre, not a bullseye.
  const hole = small
    ? `<circle cx="50" cy="50" r="1.5" fill="${GOLD.hi}"/><circle cx="50" cy="50" r="0.8" fill="#0A0A0C"/>`
    : `<circle cx="50" cy="50" r="1.15" fill="url(#${id}-ring)"/><circle cx="50" cy="50" r="0.6" fill="#0A1210"/>`;

  const defs = `<defs>
    <radialGradient id="${id}-disc" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#2B3B2C"/><stop offset=".7" stop-color="#14201A"/><stop offset="1" stop-color="#070D0B"/></radialGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD.hi}"/><stop offset=".45" stop-color="${GOLD.mid}"/><stop offset="1" stop-color="${GOLD.deep}"/></linearGradient>
    <linearGradient id="${id}-line" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${GOLD.line0}"/><stop offset="1" stop-color="${GOLD.line1}"/></linearGradient>
    <radialGradient id="${id}-ring" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFF6D6"/><stop offset=".6" stop-color="${GOLD.mid}"/><stop offset="1" stop-color="${GOLD.deep}"/></radialGradient>
    <linearGradient id="${id}-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".48" stop-color="#fff" stop-opacity=".14"/><stop offset=".52" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${id}-clip"><circle cx="50" cy="50" r="45"/></clipPath>
  </defs>`;

  const rim = `<circle cx="50" cy="50" r="47" fill="url(#${id}-rim)"/><circle cx="50" cy="50" r="44.6" fill="url(#${id}-disc)"/>`;

  const revenueLine = small
    ? `<path d="M7 70 L26 62 L35 66" fill="none" stroke="url(#${id}-line)" stroke-width="${lineW}" stroke-linecap="round" stroke-linejoin="round"/><path d="M66 50 L93 24" fill="none" stroke="url(#${id}-line)" stroke-width="${lineW}" stroke-linecap="round"/>`
    : `<path d="M8 72 L24 64 L34 68 L46 56" fill="none" stroke="url(#${id}-line)" stroke-width="${lineW}" stroke-linecap="round" stroke-linejoin="round"/><path d="M64 52 L72 54 L93 26" fill="none" stroke="url(#${id}-line)" stroke-width="${lineW}" stroke-linecap="round" stroke-linejoin="round"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Star Paper">
  ${defs}
  ${rim}
  ${grooves}
  <g clip-path="url(#${id}-clip)">
    ${revenueLine}
    <circle cx="50" cy="50" r="45" fill="url(#${id}-sheen)"/>
  </g>
  <circle cx="50" cy="50" r="${labelR}" fill="url(#${id}-rim)"/>
  <path d="${starPath(50, 50.8, labelR * 0.74, labelR * 0.3)}" fill="#14110A"/>
  ${hole}
</svg>
`;
}

// Mono: one colour, star and spindle knocked out, for stamps, PDFs and watermarks.
function monoMark(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Star Paper">
  <defs><mask id="spm-cut"><rect width="100" height="100" fill="#fff"/><path d="${starPath(50, 50.8, 9.6, 3.9)}" fill="#000"/></mask></defs>
  <circle cx="50" cy="50" r="45.6" fill="none" stroke="${color}" stroke-width="2.8"/>
  <circle cx="50" cy="50" r="37" fill="none" stroke="${color}" stroke-width="1" opacity=".5"/>
  <circle cx="50" cy="50" r="30" fill="none" stroke="${color}" stroke-width="1" opacity=".5"/>
  <path d="M8 72 L24 64 L34 68 L46 56 M64 52 L72 54 L93 26" fill="none" stroke="${color}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="50" cy="50" r="13" fill="${color}" mask="url(#spm-cut)"/>
  <circle cx="50" cy="50" r="3.4" fill="none" stroke="${color}" stroke-width="1.4"/>
</svg>
`;
}

const masters = {
  'star-paper-mark.svg': recordMark({ detail: 'full' }),
  'star-paper-mark-small.svg': recordMark({ detail: 'small' }),
  'star-paper-mono.svg': monoMark('currentColor'),
};

mkdirSync(PACK, { recursive: true });
for (const [name, svg] of Object.entries(masters)) writeFileSync(join(PACK, name), svg);
writeFileSync(join(ROOT, 'favicon.svg'), masters['star-paper-mark-small.svg']);

// ── Rasterise ───────────────────────────────────────────────────────────────
const pngs = [
  // [file, size, master, background, scale of mark inside the square]
  ['star_paper_32.png', 32, 'star-paper-mark-small.svg', null, 1],
  ['star_paper_64.png', 64, 'star-paper-mark.svg', null, 1],
  ['star_paper_128.png', 128, 'star-paper-mark.svg', null, 1],
  ['star_paper_256.png', 256, 'star-paper-mark.svg', null, 1],
  ['star_paper_512.png', 512, 'star-paper-mark.svg', null, 1],
  ['star_paper_1024.png', 1024, 'star-paper-mark.svg', null, 1],
  ['star_paper_transparent.png', 1024, 'star-paper-mark.svg', null, 1],
  ['star_paper_black.png', 1024, 'star-paper-mark.svg', '#0A1210', 0.84],
  ['star_paper_white.png', 1024, 'star-paper-mark.svg', '#FFFFFF', 0.84],
  // Maskable: launchers crop to a circle/squircle, so the mark sits inside the 80% safe zone.
  ['star_paper_maskable_512.png', 512, 'star-paper-mark.svg', '#0A1210', 0.72],
  ['star_paper_apple_180.png', 180, 'star-paper-mark.svg', '#0A1210', 0.82],
];

const playwrightEntry = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(playwrightEntry);
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, size, master, background, scale] of pngs) {
  const inner = Math.round(size * scale);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${background || 'transparent'}">
    <img src="data:image/svg+xml;base64,${Buffer.from(masters[master]).toString('base64')}" width="${inner}" height="${inner}">
  </body></html>`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: join(PACK, file), omitBackground: !background, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log(`Logo pack written: ${Object.keys(masters).length} SVG masters, ${pngs.length} PNGs, favicon.svg`);
