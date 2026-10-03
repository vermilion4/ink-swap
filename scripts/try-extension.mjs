// Loads the built extension (.output/chrome-mv3) into Chromium, opens a manga chapter,
// switches InkSwap on for that tab (through the same message the popup sends), scrolls or
// turns pages, then saves screenshots and whatever pages InkSwap captured.
//
// Usage: node scripts/try-extension.mjs <chapter-url> [outDir] [--turn-left N] [--turn-right N] [--scroll N] [--off]
//   --off        leave InkSwap off (to check nothing happens)
//   --turn-left  press ArrowLeft N times (paged right-to-left viewers like Shonen Jump+)
//   --turn-right press ArrowRight N times (left-to-right single-page readers like MangaDex)
//   --scroll     scroll down N screens (long-strip readers)
// Set ANTHROPIC_API_KEY to store a key in the extension before switching on
// (e.g. put it in a git-ignored .env and run with `node --env-file=.env ...`).

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const url = args[0];
const outDir = args[1] && !args[1].startsWith('--') ? args[1] : 'shots';
const flag = (name, dflt = 0) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : Number(args[i + 1] ?? 1);
};
const stayOff = args.includes('--off');
fs.mkdirSync(outDir, { recursive: true });

const extPath = path.resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'inkswap-')), {
  channel: 'chromium',
  headless: !process.env.HEADED,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
});

let [sw] = context.serviceWorkers();
sw ??= await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

const page = await context.newPage();
page.on('console', (m) => m.text().includes('InkSwap') && console.log('[page]', m.text()));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

// Use an extension page to talk to the background worker, like the popup does.
const ctl = await context.newPage();
await ctl.goto(`chrome-extension://${extId}/popup.html`);
const tabId = await ctl.evaluate(async (u) => {
  const tabs = await chrome.tabs.query({});
  return tabs.find((t) => t.url?.startsWith(u.split('#')[0].slice(0, 30)))?.id;
}, url);
if (process.env.ANTHROPIC_API_KEY) {
  await ctl.evaluate((k) => chrome.storage.local.set({ apiKey: k }), process.env.ANTHROPIC_API_KEY);
}
if (!stayOff) await ctl.evaluate((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: true }), tabId);
const popupState = await ctl.evaluate((id) => chrome.runtime.sendMessage({ type: 'getTabStateFor', tabId: id }), tabId);
console.log('tab', tabId, 'state as the popup sees it:', JSON.stringify(popupState));
await ctl.close();
await page.bringToFront();
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(outDir, 'view-0.png') });

for (const key of ['Left', 'Right']) {
  for (let i = 1; i <= flag(`--turn-${key.toLowerCase()}`); i++) {
    await page.keyboard.press(`Arrow${key}`);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(outDir, `view-${i}.png`) });
  }
}
for (let i = 1; i <= flag('--scroll'); i++) {
  await page.mouse.wheel(0, 850);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, `view-${i}.png`) });
}

const readOverlay = () =>
  page.evaluate(() => {
    const host = document.querySelector('inkswap-overlay');
    if (!host?.shadowRoot) return { mounted: false, pages: [], labels: 0 };
    return {
      mounted: true,
      pages: [...host.shadowRoot.querySelectorAll('.page')].map((p) => p.dataset.status),
      labels: host.shadowRoot.querySelectorAll('.label').length,
    };
  });

// Wait (up to 2 minutes) for pages still being captured or translated.
let overlay = await readOverlay();
for (let t = 0; t < 120 && overlay.pages.some((s) => s === 'capturing' || s === 'translating'); t++) {
  await page.waitForTimeout(1000);
  overlay = await readOverlay();
}
console.log('overlay:', JSON.stringify(overlay));
if (overlay.labels) await page.screenshot({ path: path.join(outDir, 'translated.png') });

const translations = await sw.evaluate(() => globalThis.__inkswap.recentTranslations);
translations.forEach((t, i) => {
  if (!t.ok) return console.log('translation failed', t.pageId, t.error);
  console.log(`translated ${t.pageId}: ${t.bubbles.length} lines, ${t.found} bubbles found, ${(t.ms / 1000).toFixed(1)}s, tokens in ${t.usage.input} / out ${t.usage.output}`);
  // The numbered copy of the page Claude saw.
  if (t.marked) fs.writeFileSync(path.join(outDir, `marked-${i}.jpg`), Buffer.from(t.marked.split(',')[1], 'base64'));
  delete t.marked;
});
if (translations.length) fs.writeFileSync(path.join(outDir, 'translations.json'), JSON.stringify(translations, null, 2));

const captures = await sw.evaluate(() => globalThis.__inkswap.recentCaptures.map(({ pageId, method, dataUrl }) => ({ pageId, method, dataUrl })));
captures.forEach((c, i) => {
  const file = path.join(outDir, `capture-${i}-${c.method}.jpg`);
  fs.writeFileSync(file, Buffer.from(c.dataUrl.split(',')[1], 'base64'));
  console.log('captured', c.pageId, 'via', c.method, '→', file);
});
if (!captures.length) console.log('no pages captured');

await context.close();
