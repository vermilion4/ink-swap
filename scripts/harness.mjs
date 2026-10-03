// Shared helpers for the Playwright scripts: launch Chromium with the built extension,
// talk to the background worker the way the popup does, and read InkSwap's overlay.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export async function launch() {
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

  /** Run `fn(arg)` in an extension page (with chrome.* APIs), like the popup does. */
  async function asPopup(fn, arg) {
    const ctl = await context.newPage();
    await ctl.goto(`chrome-extension://${extId}/popup.html`);
    try {
      return await ctl.evaluate(fn, arg);
    } finally {
      await ctl.close();
    }
  }

  return { context, sw, extId, asPopup };
}

/** Open a page and log InkSwap's console messages from it. */
export async function openPage(context, url, label = 'page') {
  const page = await context.newPage();
  page.on('console', (m) => m.text().includes('InkSwap') && console.log(`[${label}]`, m.text()));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  return page;
}

/** The tab id of the most recently opened tab whose address starts like `url`. */
export function tabIdFor(asPopup, url) {
  return asPopup(async (u) => {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((t) => t.url?.startsWith(u.split('#')[0].slice(0, 30))).at(-1)?.id;
  }, url);
}

export function readOverlay(page) {
  return page.evaluate(() => {
    const host = document.querySelector('inkswap-overlay');
    if (!host?.shadowRoot) return { mounted: false, pages: [], labels: 0 };
    return {
      mounted: true,
      pages: [...host.shadowRoot.querySelectorAll('.page')].map((p) => p.dataset.status),
      labels: host.shadowRoot.querySelectorAll('.label').length,
    };
  });
}

/** Wait (up to `seconds`) until no page is being captured or translated. */
export async function waitIdle(page, seconds = 120) {
  let overlay = await readOverlay(page);
  for (let t = 0; t < seconds && overlay.pages.some((s) => s === 'capturing' || s === 'translating'); t++) {
    await page.waitForTimeout(1000);
    overlay = await readOverlay(page);
  }
  return overlay;
}
