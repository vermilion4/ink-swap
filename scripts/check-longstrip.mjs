// Final-review regression check: MangaDex long-strip reader, pages fitted to the width (taller
// than the screen), a Spanish chapter translated to English, and the reader leaving the tab for
// 20 s partway through. Every page Claude finds text on must get labels.
// (Found in the final review: pages "skipped" because Claude, told the source was Japanese,
// returned nothing for Spanish pages.)
//
// Usage: node --env-file=.env scripts/check-longstrip.mjs

import { launch, readOverlay, tabIdFor, waitIdle } from './harness.mjs';
const URL = 'https://mangadex.org/chapter/19fd3704-5df6-47bc-a9ad-3ba8241a8800/1';
const { context, sw, asPopup } = await launch();
await asPopup((k) => chrome.storage.local.set({ apiKey: k }), process.env.ANTHROPIC_API_KEY);
const page = await context.newPage();
page.on('console', (m) => m.text().includes('InkSwap') && console.log('[page]', m.text().slice(0, 200)));
await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
for (let i = 0; i < 3; i++) {
  const mode = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^(single page|double page|long strip)$/i.test(x.textContent.trim()));
    if (!b) return 'none';
    if (/long strip/i.test(b.textContent)) return 'long strip';
    b.click();
    return 'clicked';
  });
  if (mode !== 'clicked') break;
  await page.waitForTimeout(800);
}
console.log('mode:', await page.evaluate(() => [...document.querySelectorAll('button')].map((x) => x.textContent.trim()).find((t) => /^(single page|double page|long strip)$/i.test(t))));
// Fit pages to the width (pages taller than the screen), as in the learner's screenshots.
for (let i = 0; i < 5; i++) {
  const fit = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^(fit width|fit height|fit both|no limit)$/i.test(x.textContent.trim()));
    if (!b) return 'none';
    if (/fit width/i.test(b.textContent)) return 'fit width';
    b.click();
    return 'clicked:' + b.textContent.trim();
  });
  console.log('fit:', fit);
  if (!fit.startsWith('clicked')) break;
  await page.waitForTimeout(800);
}
await page.mouse.click(640, 450); await page.waitForTimeout(1500);
const imgs = () => page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().width > 300).map((i) => { const r = i.getBoundingClientRect(); return [Math.round(r.top + scrollY), Math.round(r.height), i.complete && i.naturalWidth > 0]; }));
console.log('page images (top, height, loaded):', JSON.stringify(await imgs()));
const tabId = await tabIdFor(asPopup, URL);
await asPopup((id) => chrome.runtime.sendMessage({ type: 'setTabOn', tabId: id, on: true }), tabId);
await page.bringToFront();
const other = await context.newPage(); await other.goto('about:blank'); await page.bringToFront();
for (let step = 1; step <= 70; step++) {
  await page.mouse.wheel(0, 500); await page.waitForTimeout(1200);
  if (step === 12) { console.log('--- leaving the tab for 20 s'); await other.bringToFront(); await other.waitForTimeout(20000); await page.bringToFront(); console.log('--- back'); }
}
await waitIdle(page, 90); await page.waitForTimeout(2000);
console.log('page images at end:', JSON.stringify(await imgs()));
console.log('overlay:', JSON.stringify(await readOverlay(page)));
console.log('page statuses top→bottom:', JSON.stringify(await page.evaluate(() => {
  const root = document.querySelector('inkswap-overlay').shadowRoot;
  return [...root.querySelectorAll('.page')].map((p) => [p.dataset.status, Math.round(new DOMMatrix(p.style.transform).f + scrollY), p.querySelectorAll('.label').length]).sort((a, b) => a[1] - b[1]);
})));
const log = await sw.evaluate(() => globalThis.__inkswap.recentTranslations.map((t) => ({ id: t.pageId.slice(-12), ok: t.ok, err: t.error, found: t.found, placed: t.placed, lines: (t.bubbles ?? []).map((b) => [b.bubble, b.readable ? 'R' : 'unreadable', b.inTargetLanguage ? 'IN-TARGET' : '', b.source.slice(0, 18), b.translation.slice(0, 18)]) })));
const caps = await sw.evaluate(() => globalThis.__inkswap.recentCaptures.map((c) => [c.pageId.slice(-12), c.dataUrl]));
const fs = await import('node:fs'); fs.mkdirSync('shots/longstrip', { recursive: true });
caps.forEach(([id, d], i) => fs.writeFileSync(`shots/longstrip/cap-${i}-${id.replace(/\W/g, '')}.jpg`, Buffer.from(d.split(',')[1], 'base64')));
for (const t of log) console.log(JSON.stringify({ ...t, lines: t.lines.length }));
const skipped = log.filter((t) => t.ok && t.lines.some((l) => l[1] === 'R' && !l[2]) && t.placed === 0);
const failedPages = log.filter((t) => !t.ok);
console.log(`${skipped.length || failedPages.length ? 'FAIL' : 'PASS'}  every page with readable text got labels — ${log.length} pages, ${skipped.length} with text but no labels, ${failedPages.length} failed`);
process.exitCode = skipped.length || failedPages.length ? 1 : 0;
console.log('calls:', await sw.evaluate((id) => globalThis.__inkswap.callsFor(id), tabId));
await context.close();
