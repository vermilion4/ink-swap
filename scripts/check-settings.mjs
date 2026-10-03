// Slice 5 check: the popup and the reader's settings.
//  1. Popup screenshots in light and dark (off, and on).
//  2. Moving the opacity slider changes the labels already on the page, live.
//  3. Switching to Spanish retranslates the current chapter; the next chapter is Spanish too.
//  4. With Chime and Toasts off, switching on again plays no chime and shows no toast.
//  5. Settings survive a browser restart.
//
// Usage: node --env-file=.env scripts/check-settings.mjs [outDir]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, openPage, readOverlay, tabIdFor, waitIdle } from './harness.mjs';

const SHORT_CHAPTER = 'https://mangadex.org/chapter/fb24431b-7b59-41f1-b964-97ba6410c432/1'; // 1-page chapters
const outDir = process.argv[2] ?? 'shots/settings';
fs.mkdirSync(outDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'inkswap-profile-'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const labelTexts = (page) =>
  page.evaluate(() => [...(document.querySelector('inkswap-overlay')?.shadowRoot?.querySelectorAll('.label') ?? [])].map((l) => l.textContent));
const settle = async (page) => {
  await page.waitForTimeout(2500);
  await waitIdle(page);
  await page.waitForTimeout(1500);
};
const looksSpanish = (texts) => /[¿¡ñáéíóú]|\b(que|es|el|la|los|las|no|y|de|por)\b/i.test(texts.join(' '));

let { context, sw, extId, asPopup } = await launch(profile);
await asPopup((k) => chrome.storage.local.set({ apiKey: k }), process.env.ANTHROPIC_API_KEY);

// 1. The popup, light and dark.
const popup = await context.newPage();
await popup.setViewportSize({ width: 320, height: 560 });
for (const scheme of ['light', 'dark']) {
  await popup.emulateMedia({ colorScheme: scheme });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForTimeout(500);
  await popup.screenshot({ path: path.join(outDir, `popup-${scheme}.png`), fullPage: true });
  // How the bubble looks when on (this test tab isn't a manga page, so draw the "on" state directly).
  await popup.evaluate(() => {
    document.querySelector('#power').classList.add('is-on');
    document.querySelector('#on').checked = true;
    document.querySelector('#power-title').textContent = 'Translating this tab';
    document.querySelector('#power-sub').textContent = 'Pages translate as you read';
  });
  await popup.screenshot({ path: path.join(outDir, `popup-${scheme}-on.png`), fullPage: true });
}
await popup.close();

// A translated page to work with.
const page = await openPage(context, SHORT_CHAPTER, 'reader');
const tabId = await tabIdFor(asPopup, SHORT_CHAPTER);
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: true }), tabId);
await page.bringToFront();
await settle(page);
const english = await labelTexts(page);
check('page translated in English first', english.length > 0 && !looksSpanish(english), JSON.stringify(english.slice(0, 3)));

// 2. Opacity, through the popup's slider.
const slider = await context.newPage();
await slider.goto(`chrome-extension://${extId}/popup.html`);
await slider.locator('#opacity').fill('0.6');
await slider.close();
await page.waitForTimeout(500);
const opacity = await page.evaluate(() =>
  getComputedStyle(document.querySelector('inkswap-overlay').shadowRoot.querySelector('.root')).getPropertyValue('--inkswap-opacity').trim(),
);
check('moving the opacity slider changes the labels already on the page', opacity === '0.6', `--inkswap-opacity = ${opacity}`);
await page.screenshot({ path: path.join(outDir, 'opacity-0.6.png') });

// 3. Spanish: the popup sends this for the tab it was opened on.
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setLanguage', tabId: id, language: 'es' }), tabId);
await settle(page);
const spanish = await labelTexts(page);
check('switching to Spanish retranslates the current chapter', spanish.length > 0 && looksSpanish(spanish) && spanish.join() !== english.join(), JSON.stringify(spanish.slice(0, 3)));
await page.screenshot({ path: path.join(outDir, 'spanish.png') });
await page.keyboard.press('ArrowRight'); // the next chapter
await page.waitForTimeout(3000);
await settle(page);
const nextChapter = await labelTexts(page);
const lastLang = await sw.evaluate(() => globalThis.__inkswap.recentTranslations.at(-1)?.language);
check('the next chapter is translated in Spanish too', nextChapter.length > 0 && lastLang === 'es', `${lastLang}: ${JSON.stringify(nextChapter.slice(0, 2))}`);

// 4. Chime and Toasts off, then switch on afresh (which would normally chime and toast).
await asPopup(async () => {
  const { prefs } = await chrome.storage.local.get('prefs');
  await chrome.storage.local.set({ prefs: { ...prefs, chime: false, toasts: false } });
});
const chimesBefore = await sw.evaluate(() => globalThis.__inkswap.chimes());
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: false }), tabId);
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: true }), tabId);
await page.bringToFront();
await page.evaluate(() => {
  window.__toastCount = 0;
  new MutationObserver((rs) => rs.forEach((r) => r.addedNodes.forEach((n) => n.classList?.contains('toast') && window.__toastCount++))).observe(
    document.querySelector('inkswap-overlay').shadowRoot,
    { childList: true, subtree: true },
  );
});
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(3000);
await settle(page);
const translatedAgain = (await readOverlay(page)).labels > 0;
const chimesAfter = await sw.evaluate(() => globalThis.__inkswap.chimes());
const toastCount = await page.evaluate(() => window.__toastCount);
check('with Chime and Toasts off: page translated, no chime, no toast', translatedAgain && chimesAfter === chimesBefore && toastCount === 0, `chimes ${chimesBefore}→${chimesAfter}, toasts ${toastCount}`);

// 5. Restart the browser on the same profile.
await asPopup(async () => {
  const { prefs } = await chrome.storage.local.get('prefs');
  await chrome.storage.local.set({ prefs: { ...prefs, chime: true, toasts: false } });
});
await context.close();
({ context, sw, extId, asPopup } = await launch(profile));
const prefs = await asPopup(async () => (await chrome.storage.local.get('prefs')).prefs);
const key = await asPopup(async () => !!(await chrome.storage.local.get('apiKey')).apiKey);
check('settings survive a browser restart', prefs?.language === 'es' && prefs?.opacity === 0.6 && prefs?.chime === true && prefs?.toasts === false && key, JSON.stringify(prefs));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await context.close();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
