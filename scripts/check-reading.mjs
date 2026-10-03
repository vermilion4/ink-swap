// Slice 3 check: reading a whole chapter and on into the next one.
//  1. A second tab stays off and untouched throughout.
//  2. Switch on via the right-click menu's action; the popup must read "on".
//  3. Turn through a whole 14-page MangaDex chapter faster than Claude answers:
//     every page gets translated, and never more than 2 calls are in flight.
//  4. On a series with 1-page chapters, turn to the next chapter twice (MangaDex changes
//     chapters without reloading): translation continues without switching on again.
//  5. Switch off, turn another chapter: no new calls; labels already drawn stay.
//
// Usage: node --env-file=.env scripts/check-reading.mjs [outDir]

import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, readOverlay, tabIdFor, waitIdle } from './harness.mjs';

const LONG_CHAPTER = 'https://mangadex.org/chapter/a1bb6b82-72ba-43b9-baa6-be1b3d9678cb/1'; // 14 pages
const SHORT_CHAPTER = 'https://mangadex.org/chapter/fb24431b-7b59-41f1-b964-97ba6410c432/1'; // ch.1 of a 1-page-per-chapter series
const outDir = process.argv[2] ?? 'shots/reading';
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const { context, sw, asPopup } = await launch();
await asPopup((k) => chrome.storage.local.set({ apiKey: k }), process.env.ANTHROPIC_API_KEY);
const bg = (fn, arg) => sw.evaluate(fn, arg);

// 1. A second tab, never switched on.
const other = await openPage(context, LONG_CHAPTER, 'other tab');
const otherId = await tabIdFor(asPopup, LONG_CHAPTER);

// 2. Switch on via the right-click menu's action.
const page = await openPage(context, LONG_CHAPTER, 'reader');
const tabId = await tabIdFor(asPopup, LONG_CHAPTER);
await bg((id) => globalThis.__inkswap.menuClick(id), tabId);
const state = await asPopup((id) => chrome.runtime.sendMessage({ type: 'getTabStateFor', tabId: id }), tabId);
check('right-click menu switches the tab on, popup reads "on"', state?.on === true, JSON.stringify(state));
await page.bringToFront();

// 3. A whole chapter, turning a page every 2.5 s (Claude takes ~6 s per page).
await page.waitForTimeout(3000);
for (let i = 0; i < 13; i++) {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(2500);
}
await waitIdle(page);
await page.waitForTimeout(3000);
const chapterCalls = await bg((id) => globalThis.__inkswap.callsFor(id), tabId);
const peak = await bg((id) => globalThis.__inkswap.peakCalls(id), tabId);
check('every page of the 14-page chapter was sent to Claude', chapterCalls >= 14, `${chapterCalls} calls`);
check('never more than 2 Claude calls in flight', peak <= 2 && peak >= 1, `peak ${peak}`);
const last = await readOverlay(page);
check('the last page shows translated labels', last.labels > 0, JSON.stringify(last));
await page.screenshot({ path: path.join(outDir, 'chapter-last-page.png') });

// 4. Next chapters, same tab, no switching on again.
await page.goto(SHORT_CHAPTER, { waitUntil: 'domcontentloaded' }); // a reader opening a new series in the tab
await page.waitForTimeout(5000);
await waitIdle(page);
const before = await bg((id) => globalThis.__inkswap.callsFor(id), tabId);
const startUrl = page.url();
await page.keyboard.press('ArrowRight'); // past the last page → the next chapter, without a reload
await page.waitForTimeout(3000);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(6000);
const nextUrl = page.url();
await waitIdle(page);
await page.waitForTimeout(2000);
const after = await bg((id) => globalThis.__inkswap.callsFor(id), tabId);
const chapterChanged = startUrl.split('/')[4] !== nextUrl.split('/')[4];
check('turning past the last page opened the next chapter', chapterChanged, `${startUrl} → ${nextUrl}`);
check('the next chapter was translated without switching on again', after > before, `${before} → ${after} calls`);
const nextOverlay = await readOverlay(page);
check('the next chapter shows translated labels', nextOverlay.labels > 0, JSON.stringify(nextOverlay));
await page.screenshot({ path: path.join(outDir, 'next-chapter.png') });

// 5. Switch off: no new calls, labels already drawn stay.
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: false }), tabId);
const offState = await asPopup((id) => chrome.runtime.sendMessage({ type: 'getTabStateFor', tabId: id }), tabId);
const labelsAtOff = (await readOverlay(page)).labels;
const callsAtOff = await bg((id) => globalThis.__inkswap.callsFor(id), tabId);
await page.bringToFront();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(3000);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(8000);
const callsLater = await bg((id) => globalThis.__inkswap.callsFor(id), tabId);
check('popup reads "off" after switching off', !offState?.on, JSON.stringify(offState));
check('no new Claude calls after switching off', callsLater === callsAtOff, `${callsAtOff} → ${callsLater}`);
check('labels drawn before switching off were there when it switched off', labelsAtOff > 0, `${labelsAtOff} labels`);

// 1 (again). The other tab stayed untouched.
const otherOverlay = await readOverlay(other);
const otherCalls = await bg((id) => globalThis.__inkswap.callsFor(id), otherId);
const otherState = await asPopup((id) => chrome.runtime.sendMessage({ type: 'getTabStateFor', tabId: id }), otherId);
check('the other tab stayed off and untouched', !otherOverlay.mounted && otherCalls === 0 && !otherState?.on);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await context.close();
process.exit(failed ? 1 : 0);
