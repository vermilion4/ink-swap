// Makes the README's before/after screenshot. The page is served at a MangaDex-style address
// inside the test browser only, so the real extension runs on it with a real Claude call.
//
// The page is either
//  - a page whose license allows republishing (with --page and its required --credit), e.g.
//    a page from the official free data of ブラックジャックによろしく (https://densho810.com/free/), or
//  - by default, an original sample comic drawn here (our own ink-drop and pen-nib mascots,
//    with our own Japanese dialogue).
// Never use a page you don't have the right to republish: the image goes in the public README.
//
// Usage: node --env-file=.env scripts/make-readme-shot.mjs [--page page.png --credit "Title / Author"]
//        → docs/translation-before-after.png

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launch, readOverlay, tabIdFor, waitIdle } from './harness.mjs';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const PAGE = arg('--page');
const CREDIT = arg('--credit');
if (PAGE && !CREDIT) throw new Error('--page needs the --credit its license requires');

const W = 760, H = 1080;
const JP = `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif`;
const INK = '#1d1a22';

/** A speech bubble: white ellipse, ink outline, a tail toward (tx, ty), vertical Japanese columns (right to left). */
function bubble(cx, cy, rx0, ry0, tail, columns, size = 24) {
  const [tx, ty] = tail;
  // Grow the bubble to fit its text, with room to spare inside the oval.
  const longest = Math.max(...columns.map((c) => [...c].length)) * size;
  const ry = Math.max(ry0, longest * 0.66 + 14);
  const rx = Math.max(rx0, columns.length * size * 1.25 * 0.72 + 22);
  const ang = Math.atan2(ty - cy, tx - cx);
  const base = (d) => [cx + Math.cos(ang + d) * rx * 0.82, cy + Math.sin(ang + d) * ry * 0.82];
  const [ax, ay] = base(0.22), [bx, by] = base(-0.22);
  const colW = size * 1.25;
  const x0 = cx + ((columns.length - 1) * colW) / 2;
  const tallest = longest;
  const text = columns
    .map((c, i) => `<text x="${x0 - i * colW}" y="${cy - tallest / 2}" font-size="${size}" font-family="${JP}" font-weight="700" fill="${INK}" style="writing-mode: vertical-rl" text-anchor="start">${c}</text>`)
    .join('');
  return `
    <path d="M${ax} ${ay} L${tx} ${ty} L${bx} ${by} Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${INK}" stroke-width="4"/>
    <path d="M${ax} ${ay} L${bx} ${by}" stroke="#fff" stroke-width="7"/>
    ${text}`;
}

/** Our ink-drop mascot. */
function drop(x, y, s, mood) {
  const mouth = mood === 'happy' ? `<path d="M-14 22 Q0 38 14 22" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>` : `<path d="M-10 30 Q0 22 10 30" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
  const sweat = mood === 'lost' ? `<path d="M44 -20 c-5 8 -8 12 -8 16 a8 8 0 0 0 16 0 c0 -4 -3 -8 -8 -16z" fill="#8fd3ff" stroke="${INK}" stroke-width="3"/>` : '';
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 -95 C-20 -55 -62 -20 -62 18 A62 62 0 0 0 62 18 C62 -20 20 -55 0 -95Z" fill="${INK}"/>
    <circle cx="-20" cy="0" r="13" fill="#fff"/><circle cx="20" cy="0" r="13" fill="#fff"/>
    <circle cx="-17" cy="3" r="6" fill="${INK}"/><circle cx="23" cy="3" r="6" fill="${INK}"/>
    ${mouth}${sweat}</g>`;
}

/** Our pen-nib mascot (the InkSwap icon's nib, upright, with a face). */
function nib(x, y, s, mood) {
  const mouth = mood === 'happy' ? `<path d="M-12 30 Q0 44 12 30" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` : `<circle cx="0" cy="34" r="6" fill="${INK}"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <defs><linearGradient id="ng" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e055c4"/><stop offset="1" stop-color="#b183f0"/></linearGradient></defs>
    <path d="M-18 -50H18L26 -14C26 2 14 20 0 50C-14 20 -26 2 -26 -14Z" transform="scale(2)" fill="url(#ng)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M-36 -68H36" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="-16" cy="0" r="11" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="16" cy="0" r="11" fill="#fff" stroke="${INK}" stroke-width="3"/>
    <circle cx="-14" cy="2" r="5" fill="${INK}"/><circle cx="18" cy="2" r="5" fill="${INK}"/>
    ${mouth}</g>`;
}

const panel = (x, y, w, h, body, tone = '#f4f1f6') =>
  `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${tone}" stroke="${INK}" stroke-width="5"/>${body}</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  ${panel(30, 30, 700, 330, `
    ${nib(560, 240, 1, 'talk')}
    ${drop(190, 260, 1, 'lost')}
    ${bubble(610, 125, 70, 95, [575, 185], ['ねえ、', 'これ読める？'])}
    ${bubble(315, 120, 78, 88, [235, 180], ['ぜんぜん', '読めない…'])}`)}
  ${panel(30, 385, 700, 330, `
    ${nib(250, 600, 1.15, 'talk')}
    <g transform="translate(400 665)"><rect x="-70" y="-34" width="140" height="68" rx="34" fill="url(#ng)" stroke="${INK}" stroke-width="5"/><circle cx="36" cy="0" r="26" fill="#fff" stroke="${INK}" stroke-width="5"/></g>
    ${bubble(560, 550, 110, 92, [330, 560], ['じゃあ', 'インクスワップ', 'オンにして！'])}`, '#fff')}
  ${panel(30, 740, 700, 310, `
    ${drop(470, 960, 1, 'happy')}
    ${nib(180, 950, 0.9, 'happy')}
    ${bubble(600, 845, 95, 82, [520, 900], ['すごい！', 'そのまま', '読める！'])}
    ${bubble(310, 830, 60, 62, [230, 880], ['でしょ？'], 28)}`)}
</svg>`;

// 1. The page: a licensed page given with --page, or the sample comic rendered to a PNG.
const outDir = 'docs';
fs.mkdirSync(outDir, { recursive: true });
let pagePng, pageW, pageH;
if (PAGE) {
  pagePng = fs.readFileSync(PAGE);
  pageW = pagePng.readUInt32BE(16); // PNG header: width, height
  pageH = pagePng.readUInt32BE(20);
} else {
  const plain = await chromium.launch();
  const pg = await plain.newPage({ viewport: { width: W, height: H } });
  await pg.setContent(`<style>html,body{margin:0}</style>${svg}`);
  pagePng = await pg.screenshot();
  await plain.close();
  [pageW, pageH] = [W, H];
}
// Shown about as big as a reader would see it on a laptop screen.
const showH = 830;
const showW = Math.round((pageW / pageH) * showH);

// 2. Serve it at a MangaDex-style address in the test browser and run InkSwap on it.
const URL = 'https://mangadex.org/chapter/inkswap-demo/1';
const html = `<!doctype html><html><body style="margin:0;background:#2b2730;display:grid;place-items:center;min-height:100vh"><img src="/chapter/inkswap-demo/page.png" width="${showW}" height="${showH}" style="display:block"></body></html>`;
const { context, sw, asPopup } = await launch();
await context.route('https://mangadex.org/chapter/inkswap-demo/**', (route) =>
  route.request().url().endsWith('.png')
    ? route.fulfill({ status: 200, contentType: 'image/png', body: pagePng })
    : route.fulfill({ status: 200, contentType: 'text/html', body: html }),
);
await asPopup((k) => chrome.storage.local.set({ apiKey: k }), process.env.ANTHROPIC_API_KEY);
const page = await context.newPage();
await page.setViewportSize({ width: showW + 40, height: showH + 40 });
await page.goto(URL);
await page.waitForTimeout(1500);
const shot = (file) => page.locator('img').screenshot({ path: path.join(outDir, file), scale: 'device' });
await shot('.before.png');
const tabId = await tabIdFor(asPopup, URL);
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: true }), tabId);
await page.bringToFront();
await page.waitForTimeout(2500);
await waitIdle(page);
await page.waitForTimeout(3500); // let the "Page translated" toast leave
console.log('overlay:', JSON.stringify(await readOverlay(page)));
const t = await sw.evaluate(() => globalThis.__inkswap.recentTranslations.at(-1));
t?.bubbles?.forEach((b) => console.log(' ', b.source, '→', b.translation));
await shot('.after.png');
await context.close();

// 3. Before and after, side by side.
const b64 = (f) => fs.readFileSync(path.join(outDir, f)).toString('base64');
const combo = await chromium.launch();
const cp = await combo.newPage({ viewport: { width: 1240, height: 940 } });
const figW = Math.round((pageW / pageH) * 820);
await cp.setContent(`<body style="margin:0;padding:24px;background:#0f0d12;font:700 22px system-ui;color:#efeaf3;width:max-content">
  <div style="display:flex;gap:24px;justify-content:center">
  ${[['Raw page', '.before.png'], ['With InkSwap on', '.after.png']]
    .map(([label, f]) => `<figure style="margin:0;display:grid;gap:10px;justify-items:center"><img src="data:image/png;base64,${b64(f)}" style="width:${figW}px;border-radius:6px"><figcaption>${label}</figcaption></figure>`)
    .join('')}
  </div>
  ${CREDIT ? `<p style="margin:14px 0 0;text-align:center;font:500 15px system-ui;color:#b3aabd">${CREDIT}</p>` : ''}</body>`);
await cp.screenshot({ path: path.join(outDir, 'translation-before-after.png'), fullPage: true });
await combo.close();
fs.rmSync(path.join(outDir, '.before.png'));
fs.rmSync(path.join(outDir, '.after.png'));
console.log('wrote docs/translation-before-after.png');
