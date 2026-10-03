// Slice 7 check: saved translations.
//  1. Read two MangaDex pages (2 Claude calls).
//  2. Reload the chapter (new page addresses): same labels, no new calls.
//  3. Internet drops while the page is open: turning back still shows the saved translation.
//  4. Spanish: translated fresh (new call), and saved too.
//  5. Browser restart: the saved English page comes back with no call; the popup shows the count.
//  6. Clear saved translations: the count goes to 0 and the page is translated again.
//  7. Shonen Jump+ (screenshot capture): a reloaded episode is found in the save.
//
// Usage: PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node --env-file=.env scripts/check-saved.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, openPage, readOverlay, tabIdFor, waitIdle } from './harness.mjs';

const PAGE_3 = 'https://mangadex.org/chapter/a1bb6b82-72ba-43b9-baa6-be1b3d9678cb/3';
const EPISODE = 'https://shonenjumpplus.com/episode/10833519556325021799';
const outDir = 'shots/saved';
fs.mkdirSync(outDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'inkswap-saved-'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const settle = async (page) => {
  await page.waitForTimeout(2500);
  await waitIdle(page);
  await page.waitForTimeout(1500);
};
const labelTexts = (page) =>
  page.evaluate(() => [...(document.querySelector('inkswap-overlay')?.shadowRoot?.querySelectorAll('.label') ?? [])].map((l) => l.textContent).sort());

let { context, sw, extId, asPopup } = await launch(profile);
await asPopup((k) => chrome.storage.local.set({ apiKey: k }), process.env.ANTHROPIC_API_KEY);
const stats = (tabId) => sw.evaluate((id) => ({ calls: globalThis.__inkswap.callsFor(id), saved: globalThis.__inkswap.cacheHitsFor(id) }), tabId);
const switchOn = (tabId) => asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: true }), tabId);

// 1. Read two pages.
let page = await openPage(context, PAGE_3, 'reader');
let tabId = await tabIdFor(asPopup, PAGE_3);
await switchOn(tabId);
await page.bringToFront();
await settle(page);
const firstLabels = await labelTexts(page);
await page.keyboard.press('ArrowRight');
await settle(page);
let s = await stats(tabId);
check('read two pages: 2 Claude calls', s.calls === 2 && firstLabels.length > 0, JSON.stringify(s));

// 2. Reload the chapter.
await page.goto(PAGE_3, { waitUntil: 'domcontentloaded' });
const reloadStart = Date.now();
await page.waitForTimeout(1500);
await settle(page);
s = await stats(tabId);
const reloaded = await labelTexts(page);
check('after a reload: the same labels, no new call', s.calls === 2 && s.saved >= 1 && reloaded.join('|') === firstLabels.join('|'), `${JSON.stringify(s)}, ${reloaded.length} labels, ${((Date.now() - reloadStart) / 1000).toFixed(1)} s incl. page load`);

// 3. The internet drops while the page is open; turn to the next page and back.
await page.keyboard.press('ArrowRight');
await settle(page);
await context.setOffline(true);
await context.route('https://api.anthropic.com/**', (r) => r.abort('internetdisconnected'));
await page.keyboard.press('ArrowLeft');
await settle(page);
const offline = await readOverlay(page);
s = await stats(tabId);
check('offline: a saved page still shows its translation', offline.labels > 0 && !offline.pages.includes('failed') && s.calls === 2, `${JSON.stringify(offline)}, ${JSON.stringify(s)}`);
await page.screenshot({ path: path.join(outDir, 'offline.png') });
await context.setOffline(false);
await context.unroute('https://api.anthropic.com/**');

// 4. Spanish: fresh, then saved. A language change retranslates every page of the chapter that's
// on the page (MangaDex keeps the neighbouring page loaded too), so count those first.
const pagesHere = (await readOverlay(page)).pages.filter((p) => p === 'translated').length;
const callsBefore = (await stats(tabId)).calls;
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setLanguage', tabId: id, language: 'es' }), tabId);
await settle(page);
const callsAfterSpanish = (await stats(tabId)).calls;
check('Spanish is translated fresh (one call per page here)', pagesHere >= 1 && callsAfterSpanish - callsBefore === pagesHere, `${pagesHere} pages here, ${callsBefore} → ${callsAfterSpanish} calls`);
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setLanguage', tabId: id, language: 'en' }), tabId);
await settle(page);
s = await stats(tabId);
check('switching back to English uses the save', s.calls === callsAfterSpanish, JSON.stringify(s));

// 5. Restart the browser.
await context.close();
({ context, sw, extId, asPopup } = await launch(profile));
const popup = await context.newPage();
await popup.setViewportSize({ width: 320, height: 720 });
await popup.emulateMedia({ colorScheme: 'dark' });
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.waitForTimeout(800);
const countText = await popup.locator('#saved-count').textContent();
await popup.screenshot({ path: path.join(outDir, 'popup-saved.png'), fullPage: true });
check('popup shows the saved-page count', /\b[3-9]\d* pages saved/.test(countText), countText);
page = await openPage(context, PAGE_3, 'reader');
tabId = await tabIdFor(asPopup, PAGE_3);
await switchOn(tabId);
await page.bringToFront();
await settle(page);
s = await stats(tabId);
check('after a browser restart: the saved page comes back, no call', s.calls === 0 && s.saved >= 1 && (await readOverlay(page)).labels > 0, JSON.stringify(s));

// 6. Clear.
await popup.bringToFront();
await popup.locator('#clear-saved').click();
await popup.waitForTimeout(500);
const cleared = await popup.locator('#saved-count').textContent();
const clearDisabled = await popup.locator('#clear-saved').isDisabled();
await page.bringToFront();
await page.goto(PAGE_3, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await settle(page);
s = await stats(tabId);
check('after Clear: count is 0 and the page is translated again', /^None yet/.test(cleared) && clearDisabled && s.calls === 1, `"${cleared}", ${JSON.stringify(s)}`);

// 7. Shonen Jump+: screenshot captures of the same page must be recognised.
const sj = await openPage(context, EPISODE, 'sj+');
const sjTab = await tabIdFor(asPopup, EPISODE);
await switchOn(sjTab);
await sj.bringToFront();
await settle(sj);
const sjFirst = await stats(sjTab);
await sj.goto(EPISODE, { waitUntil: 'domcontentloaded' });
await sj.waitForTimeout(6000);
await settle(sj);
const sjAgain = await stats(sjTab);
check('Shonen Jump+: a reloaded episode is found in the save', sjFirst.calls >= 1 && sjAgain.calls === sjFirst.calls && sjAgain.saved >= 1 && (await readOverlay(sj)).labels > 0, `${JSON.stringify(sjFirst)} → ${JSON.stringify(sjAgain)}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await context.close();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
