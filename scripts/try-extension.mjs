// Loads the built extension (.output/chrome-mv3) into Chromium, opens a manga chapter,
// switches InkSwap on for that tab (through the same message the popup sends), scrolls or
// turns pages, then saves screenshots and whatever pages InkSwap captured and translated.
//
// Usage: node scripts/try-extension.mjs <chapter-url> [outDir] [--turn-left N] [--turn-right N] [--scroll N] [--off]
//   --off        leave InkSwap off (to check nothing happens)
//   --turn-left  press ArrowLeft N times (paged right-to-left viewers like Shonen Jump+)
//   --turn-right press ArrowRight N times (left-to-right single-page readers like MangaDex)
//   --scroll     scroll down N screens (long-strip readers)
// Set ANTHROPIC_API_KEY to store a key in the extension before switching on
// (e.g. put it in a git-ignored .env and run with `node --env-file=.env ...`).

import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, tabIdFor, waitIdle } from './harness.mjs';

const args = process.argv.slice(2);
const url = args[0];
const outDir = args[1] && !args[1].startsWith('--') ? args[1] : 'shots';
const flag = (name, dflt = 0) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : Number(args[i + 1] ?? 1);
};
const stayOff = args.includes('--off');
fs.mkdirSync(outDir, { recursive: true });

const { context, sw, asPopup } = await launch();
const page = await openPage(context, url);

const tabId = await tabIdFor(asPopup, url);
if (process.env.ANTHROPIC_API_KEY) {
  await asPopup((k) => chrome.storage.local.set({ apiKey: k }), process.env.ANTHROPIC_API_KEY);
}
if (!stayOff) await asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: true }), tabId);
const popupState = await asPopup((id) => chrome.runtime.sendMessage({ type: 'getTabStateFor', tabId: id }), tabId);
console.log('tab', tabId, 'state as the popup sees it:', JSON.stringify(popupState));
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

const overlay = await waitIdle(page);
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
