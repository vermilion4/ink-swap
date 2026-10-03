// Slice 4 check: chime, toasts, and recovering from failures.
//  1. First translated page: "Page translated" toast and one chime (via the offscreen page).
//  2. Second page of the same chapter: no toast, no chime.
//  3. Each later chapter: one "Chapter translated" toast, no chime.
//  4. Claude unreachable: the page stays raw with an error toast (with Retry) and a "↻ Retry" pill.
//  5. A bad key: the key toast; no key: the paste-your-key toast.
//  6. Back online with a good key, clicking the pill translates the page.
//
// Run with the env var below so Playwright can block the background worker's requests:
//   PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node --env-file=.env scripts/check-feedback.mjs

import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, readOverlay, tabIdFor, waitIdle } from './harness.mjs';

const LONG_CHAPTER = 'https://mangadex.org/chapter/a1bb6b82-72ba-43b9-baa6-be1b3d9678cb/3'; // starts on a page with bubbles
const SHORT_CHAPTER = 'https://mangadex.org/chapter/fb24431b-7b59-41f1-b964-97ba6410c432/1'; // 1-page chapters
const outDir = process.argv[2] ?? 'shots/feedback';
fs.mkdirSync(outDir, { recursive: true });
const KEY = process.env.ANTHROPIC_API_KEY;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const { context, sw, asPopup } = await launch();
const bg = (fn, arg) => sw.evaluate(fn, arg);
const setKey = (k) => asPopup((key) => chrome.storage.local.set({ apiKey: key }), k);
await setKey(KEY);

/** Record every toast shown on the page (toasts only live ~3 s, so watch for them). */
const watchToasts = (page) =>
  page.evaluate(() => {
    window.__toasts = [];
    const attach = () => {
      const root = document.querySelector('inkswap-overlay')?.shadowRoot;
      if (!root) return setTimeout(attach, 200);
      new MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes)
            if (n.classList?.contains('toast'))
              window.__toasts.push({ kind: n.classList.contains('error') ? 'error' : 'success', text: n.querySelector('.text').textContent, retry: !!n.querySelector('button') });
      }).observe(root, { childList: true, subtree: true });
    };
    attach();
  });
const toasts = (page) => page.evaluate(() => window.__toasts);
const settle = async (page) => {
  await page.waitForTimeout(2500);
  await waitIdle(page);
  await page.waitForTimeout(1500);
};

// 1–2. First and second page of a chapter.
const page = await openPage(context, LONG_CHAPTER, 'reader');
const tabId = await tabIdFor(asPopup, LONG_CHAPTER);
await watchToasts(page);
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: true }), tabId);
await page.bringToFront();
await settle(page);
let shown = await toasts(page);
check('first page: one "Page translated" toast', shown.length === 1 && shown[0].text === 'Page translated', JSON.stringify(shown));
check('first page: the chime played once', (await bg(() => globalThis.__inkswap.chimes())) === 1);
const offscreen = await asPopup(async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length);
check('the chime ran in an offscreen page', offscreen === 1);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outDir, 'first-page-toast.png') });

await page.keyboard.press('ArrowRight');
await settle(page);
shown = await toasts(page);
check('second page: no new toast', shown.length === 1, JSON.stringify(shown));
check('second page: no new chime', (await bg(() => globalThis.__inkswap.chimes())) === 1);

// 3. Later chapters (a new series in the same tab, then the next chapter without a reload).
await page.goto(SHORT_CHAPTER, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await watchToasts(page);
await settle(page);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(3000);
await settle(page);
shown = await toasts(page);
const chapterToasts = shown.filter((t) => t.text === 'Chapter translated');
check('two later chapters: one "Chapter translated" toast each', chapterToasts.length === 2 && shown.length === 2, JSON.stringify(shown));
check('later chapters: still only one chime', (await bg(() => globalThis.__inkswap.chimes())) === 1);

// 4. Claude unreachable.
await context.route('https://api.anthropic.com/**', (route) => route.abort('internetdisconnected'));
await page.evaluate(() => (window.__toasts = []));
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(3000);
await settle(page);
shown = await toasts(page);
let overlay = await readOverlay(page);
const hasPill = await page.locator('inkswap-overlay .retry').count();
check('offline: page stays raw (no labels)', overlay.labels === 0 && overlay.pages.includes('failed'), JSON.stringify(overlay));
check('offline: error toast with Retry', shown.some((t) => t.kind === 'error' && t.text === "Couldn't translate this page." && t.retry), JSON.stringify(shown));
check('offline: "↻ Retry" pill on the page', hasPill === 1);
await page.screenshot({ path: path.join(outDir, 'failed-page.png') });

// 5. Bad key, then no key (Claude still blocked doesn't matter: a bad key fails first only when online).
await context.unroute('https://api.anthropic.com/**');
await setKey('sk-ant-api03-not-a-real-key');
await page.evaluate(() => (window.__toasts = []));
await page.locator('inkswap-overlay .retry').click();
await settle(page);
shown = await toasts(page);
check('bad key: "Check your Claude API key" toast', shown.some((t) => t.text === 'Check your Claude API key in InkSwap settings.'), JSON.stringify(shown));
check('bad key: page stays raw with the pill', (await page.locator('inkswap-overlay .retry').count()) === 1);

await setKey('');
await page.evaluate(() => (window.__toasts = []));
await page.locator('inkswap-overlay .retry').click();
await settle(page);
shown = await toasts(page);
check('no key: "Paste your Claude API key" toast', shown.some((t) => t.text === 'Paste your Claude API key in InkSwap settings to start.'), JSON.stringify(shown));

// 6. Good key, retry from the pill.
await setKey(KEY);
await page.locator('inkswap-overlay .retry').click();
await settle(page);
overlay = await readOverlay(page);
check('retry with a good key translates the page', overlay.labels > 0 && (await page.locator('inkswap-overlay .retry').count()) === 0, JSON.stringify(overlay));
await page.screenshot({ path: path.join(outDir, 'retried-page.png') });

const failedCount = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failedCount}/${results.length} checks passed`);
await context.close();
process.exit(failedCount ? 1 : 0);
