// Slice 6 check: the core journey on Shonen Jump+ (two-page spreads read right to left,
// pages captured by screenshot, a full page reload between episodes).
//  1. Switch on: the first spread translates, with the "Page translated" toast.
//  2. Turn pages (ArrowLeft): every spread shown gets translated.
//  3. Next episode (a full reload) in the same tab: still on, still translating, one chapter toast.
//
// Usage: node --env-file=.env scripts/check-sjplus.mjs [outDir]

import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, readOverlay, tabIdFor, waitIdle } from './harness.mjs';

const EPISODE = 'https://shonenjumpplus.com/episode/10833519556325021799'; // Black Clover, ep. 1
const NEXT_EPISODE = 'https://shonenjumpplus.com/episode/10833519556325021971'; // ep. 2
const TURNS = 3;
const outDir = process.argv[2] ?? 'shots/sjplus-journey';
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const watchToasts = (page) =>
  page.evaluate(() => {
    window.__toasts = [];
    const attach = () => {
      const root = document.querySelector('inkswap-overlay')?.shadowRoot;
      if (!root) return setTimeout(attach, 200);
      new MutationObserver((rs) =>
        rs.forEach((r) => r.addedNodes.forEach((n) => n.classList?.contains('toast') && window.__toasts.push(n.querySelector('.text').textContent))),
      ).observe(root, { childList: true, subtree: true });
    };
    attach();
  });
const settle = async (page) => {
  await page.waitForTimeout(2500);
  await waitIdle(page);
  await page.waitForTimeout(1500);
};

const { context, sw, asPopup } = await launch();
await asPopup((k) => chrome.storage.local.set({ apiKey: k }), process.env.ANTHROPIC_API_KEY);
const calls = () => sw.evaluate((id) => globalThis.__inkswap.callsFor(id), tabId);

// 1. Switch on.
const page = await openPage(context, EPISODE, 'sj+');
const tabId = await tabIdFor(asPopup, EPISODE);
await watchToasts(page);
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: true }), tabId);
await page.bringToFront();
await settle(page);
let overlay = await readOverlay(page);
check('first spread translated', overlay.labels > 0, JSON.stringify(overlay));
check('"Page translated" toast', (await page.evaluate(() => window.__toasts)).includes('Page translated'));
await page.screenshot({ path: path.join(outDir, 'spread-0.png') });

// 2. Turn through a few spreads.
let translatedSpreads = overlay.labels > 0 ? 1 : 0;
for (let i = 1; i <= TURNS; i++) {
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  overlay = await readOverlay(page);
  const shown = overlay.pages.filter((s) => s === 'translated').length;
  if (shown) translatedSpreads++;
  await page.screenshot({ path: path.join(outDir, `spread-${i}.png`) });
}
const afterTurns = await calls();
check(`every spread shown was translated (${TURNS + 1} spreads)`, translatedSpreads === TURNS + 1, `${translatedSpreads} spreads, ${afterTurns} pages sent`);
const failedPages = overlay.pages.filter((s) => s === 'failed').length;
check('no failed pages', failedPages === 0, JSON.stringify(overlay.pages));

// 3. Next episode: Shonen Jump+ reloads the whole page. Watch for toasts from the very start of
// the new page, since the first page can translate before the page has finished loading.
await page.addInitScript(() => {
  window.__toasts = [];
  const attach = () => {
    const root = document.querySelector('inkswap-overlay')?.shadowRoot;
    if (!root) return setTimeout(attach, 100);
    new MutationObserver((rs) =>
      rs.forEach((r) => r.addedNodes.forEach((n) => n.classList?.contains('toast') && window.__toasts.push(n.querySelector('.text').textContent))),
    ).observe(root, { childList: true, subtree: true });
  };
  attach();
});
await page.goto(NEXT_EPISODE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await settle(page);
overlay = await readOverlay(page);
const state = await asPopup((id) => chrome.runtime.sendMessage({ type: 'getTabStateFor', tabId: id }), tabId);
const toasts = await page.evaluate(() => window.__toasts);
check('next episode: still on after the reload', state?.on === true);
check('next episode: translating without switching on again', (await calls()) > afterTurns && overlay.pages.includes('translated'), JSON.stringify(overlay));
check('next episode: one "Chapter translated" toast', toasts.length === 1 && toasts[0] === 'Chapter translated', JSON.stringify(toasts));
await page.screenshot({ path: path.join(outDir, 'next-episode.png') });

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await context.close();
process.exit(failed ? 1 : 0);
