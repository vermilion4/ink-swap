import { browser } from 'wxt/browser';
import type { Celebrate, DataUrlResponse, Message, TranslateResponse } from '@/lib/messages';
import { splitRegion } from '@/lib/bubbles';
import { createLimiter } from '@/lib/limit';
import { detectBubbles, loadBitmap, regionShape, squareImage, type PageBubbles } from '@/lib/pageimage';
import { getApiKey, getPrefs, getTabState, setPrefs, setTabState, type Language } from '@/lib/settings';
import { translatePage, TranslateError, type Bubble, type ReadBubble } from '@/lib/translate';

// The last few captured pages and translations, kept for inspection while developing.
const recentCaptures: { pageId: string; method: string; dataUrl: string; at: number }[] = [];
const recentTranslations: {
  pageId: string;
  ok: boolean;
  language?: string;
  bubbles?: ReadBubble[];
  found?: number;
  marked?: string | null;
  error?: string;
  usage?: { input: number; output: number };
  ms?: number;
}[] = [];
// At most 2 Claude calls in flight per tab; the rest wait their turn.
const MAX_CALLS_PER_TAB = 2;
const limiters = new Map<number, ReturnType<typeof createLimiter>>();
const limiterFor = (tabId: number) => {
  let l = limiters.get(tabId);
  if (!l) limiters.set(tabId, (l = createLimiter(MAX_CALLS_PER_TAB)));
  return l;
};

const calls = new Map<number, number>(); // Claude calls made per tab, for checking while developing
let chimes = 0; // chimes played, for checking while developing

const MENU_ID = 'inkswap-translate';
const READER_PAGES = ['https://mangadex.org/*', 'https://shonenjumpplus.com/*'];

(globalThis as any).__inkswap = {
  recentCaptures,
  recentTranslations,
  peakCalls: (tabId: number) => limiters.get(tabId)?.peak ?? 0,
  callsFor: (tabId: number) => calls.get(tabId) ?? 0,
  chimes: () => chimes,
  // The right-click menu's action, callable from the test script (Chrome menus can't be clicked from it).
  menuClick: (tabId: number) => switchTab(tabId, true),
};
const remember = <T>(list: T[], item: T) => {
  list.push(item);
  if (list.length > 6) list.shift();
};

export default defineBackground(() => {
  browser.tabs.onRemoved.addListener((tabId) => {
    void setTabState(tabId, null);
    limiters.delete(tabId);
  });

  // Right-click "Translate this page": the same as flipping the popup toggle on.
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: MENU_ID,
      title: 'Translate this page',
      contexts: ['page', 'image'],
      documentUrlPatterns: READER_PAGES,
    });
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID && tab?.id != null) void switchTab(tab.id, true);
  });

  browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const msg = raw as Message;
    const tabId = sender.tab?.id;

    switch (msg.type) {
      case 'getTabState':
        if (tabId == null) return false;
        getTabState(tabId).then(sendResponse);
        return true;

      case 'getTabStateFor':
        getTabState(msg.tabId).then(sendResponse);
        return true;

      case 'setLanguage':
        setLanguage(msg.tabId, msg.language).then(sendResponse);
        return true;

      case 'setTabOn':
        switchTab(msg.tabId, msg.on).then(sendResponse);
        return true;

      case 'fetchImage':
        fetchAsDataUrl(msg.url).then(sendResponse);
        return true;

      case 'captureVisible':
        if (!sender.tab) return false;
        captureVisible(sender.tab.windowId).then(sendResponse);
        return true;

      case 'translatePage':
        if (tabId == null) return false;
        remember(recentCaptures, { pageId: msg.pageId, method: msg.method, dataUrl: msg.dataUrl, at: Date.now() });
        limiterFor(tabId)
          .run(async (): Promise<TranslateResponse> => {
            // Switched off while this page waited its turn: don't spend a call on it.
            if (!(await getTabState(tabId))?.on) return { ok: false, kind: 'cancelled', error: 'Tab switched off' };
            calls.set(tabId, (calls.get(tabId) ?? 0) + 1);
            const res = await translate(tabId, msg.pageId, msg.dataUrl, msg.width, msg.height);
            // A page with no bubbles (splash page, credits) is left alone: no chime or toast.
            if (res.ok && res.bubbles.length) res.celebrate = await celebrate(tabId, msg.chapter);
            return res;
          })
          .then(sendResponse);
        return true;
    }
    return false;
  });
});

async function translate(
  tabId: number,
  pageId: string,
  dataUrl: string,
  width: number,
  height: number,
): Promise<TranslateResponse> {
  const language = (await getTabState(tabId))?.language ?? 'en';
  const stopKeepAlive = keepAlive();
  try {
    const bmp = await loadBitmap(dataUrl);
    const found = detectBubbles(bmp);
    const size = Math.max(bmp.width, bmp.height);
    const asImage = (url: string) => ({
      base64: url.slice(url.indexOf(',') + 1),
      mediaType: 'image/jpeg' as const,
      width: size,
      height: size,
    });
    const clean = asImage(await squareImage(bmp));
    const marked = found.regions.length ? asImage(await squareImage(bmp, found)) : null;
    const result = await translatePage(
      { clean, marked, markedCount: found.regions.length },
      { width, height },
      language,
      await getApiKey(),
    );
    const bubbles = await placeBubbles(result.bubbles, found);
    remember(recentTranslations, { pageId, ok: true, language, ...result, found: found.regions.length, marked: marked && `data:image/jpeg;base64,${marked.base64}` });
    console.log(`[InkSwap] ${pageId}: ${result.bubbles.length} lines, ${found.regions.length} bubbles found, ${result.ms}ms, tokens`, result.usage);
    return { ok: true, bubbles, celebrate: null };
  } catch (e) {
    const err = e instanceof TranslateError ? e : new TranslateError('failed', String(e));
    remember(recentTranslations, { pageId, ok: false, error: `${err.kind}: ${err.message}` });
    console.warn(`[InkSwap] ${pageId} failed:`, err.kind, err.message);
    return { ok: false, kind: err.kind, error: err.message };
  } finally {
    stopKeepAlive();
  }
}

/**
 * The first translated page after switching on gets the chime and "Page translated"; the first
 * page of each later chapter gets "Chapter translated". Decided one page at a time, so two pages
 * finishing together can't both chime.
 */
let celebrateChain: Promise<unknown> = Promise.resolve();
function celebrate(tabId: number, chapter: string): Promise<Celebrate> {
  const run = celebrateChain.then(async (): Promise<Celebrate> => {
    const state = await getTabState(tabId);
    if (!state?.on) return null;
    const toasted = state.toastedChapters ?? [];
    let kind: Celebrate = null;
    if (!state.chimed) {
      kind = 'page';
      if ((await getPrefs()).chime) await playChime();
    } else if (!toasted.includes(chapter)) {
      kind = 'chapter';
    }
    if (kind) await setTabState(tabId, { ...state, chimed: true, toastedChapters: [...toasted, chapter] });
    return kind;
  });
  celebrateChain = run.catch(() => {});
  return run;
}

async function playChime() {
  try {
    const url = browser.runtime.getURL('/offscreen.html');
    const open = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
    if (!open.length) {
      await browser.offscreen.createDocument({
        url,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play a short chime when the first manga page is translated.',
      });
    }
    await browser.runtime.sendMessage({ type: 'playChime' } satisfies Message);
    chimes++;
  } catch (e) {
    console.warn('[InkSwap] chime failed', e); // a missing chime never blocks the translation
  }
}

/**
 * Lines Claude put in a found bubble take that bubble's exact box and shape (several lines in
 * one bubble are joined). Lines outside any found bubble keep Claude's own box.
 */
async function placeBubbles(read: ReadBubble[], found: PageBubbles): Promise<Bubble[]> {
  const placed: Bubble[] = [];
  const byRegion = new Map<number, ReadBubble[]>();
  for (const b of read) {
    if (b.bubble == null) {
      if (!b.inTargetLanguage) placed.push({ box: b.box, source: b.source, translation: b.translation, readable: b.readable });
    }
    else byRegion.set(b.bubble, [...(byRegion.get(b.bubble) ?? []), b]);
  }
  const { width, height } = found.gray;
  const toDetect = (b: ReadBubble) => ({
    x: (b.box.x / 1000) * width,
    y: (b.box.y / 1000) * height,
    w: (b.box.w / 1000) * width,
    h: (b.box.h / 1000) * height,
  });
  for (const [n, lines] of byRegion) {
    // Several lines in one shape are usually touching bubbles: give each line its own part.
    const parts = splitRegion(found.regions[n - 1]!, lines.map(toDetect));
    for (const [i, line] of lines.entries()) {
      const part = parts[i]!;
      // Unreadable, or already in the target language: leave the bubble as it is. (It still kept
      // its part of a shared shape above, so a neighbour's label can't cover it.)
      if (!line.readable || line.inTargetLanguage || !line.translation.trim() || !part.w) continue;
      const { box, shape } = await regionShape(part, found);
      placed.push({ box, shape, source: line.source, translation: line.translation.trim(), readable: true });
    }
  }
  return placed;
}

// Chrome may stop an idle background worker after ~30s, even mid-request. A cheap
// extension call every 20s keeps it alive while a translation is in flight.
let inFlight = 0;
let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
function keepAlive() {
  if (inFlight++ === 0) keepAliveTimer = setInterval(() => void browser.runtime.getPlatformInfo(), 20_000);
  return () => {
    if (--inFlight === 0) clearInterval(keepAliveTimer);
  };
}

/**
 * Save the language for new tabs; if this tab is on, switch it too. Its page helper then
 * retranslates the current chapter, and later chapters use the new language.
 */
async function setLanguage(tabId: number | null, language: Language) {
  await setPrefs({ language });
  if (tabId == null) return null;
  const prev = await getTabState(tabId);
  if (!prev?.on || prev.language === language) return prev;
  const state = { ...prev, language };
  await setTabState(tabId, state);
  await browser.tabs.sendMessage(tabId, { type: 'tabStateChanged', state } satisfies Message).catch(() => {});
  return state;
}

async function switchTab(tabId: number, on: boolean) {
  const prev = await getTabState(tabId);
  // Switching on afresh resets the chime and chapter toasts; switching on an already-on tab keeps them.
  const fresh = { on: true, language: (await getPrefs()).language };
  const state = on ? (prev?.on ? prev : fresh) : null;
  await setTabState(tabId, state);
  await browser.tabs.sendMessage(tabId, { type: 'tabStateChanged', state } satisfies Message).catch(() => {});
  return state;
}

async function fetchAsDataUrl(url: string): Promise<DataUrlResponse> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { ok: true, dataUrl: `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Chrome allows only ~2 visible-tab captures per second, so captures run one at a time, spaced out.
let captureChain: Promise<unknown> = Promise.resolve();
function captureVisible(windowId: number): Promise<DataUrlResponse> {
  const run = captureChain.then(async (): Promise<DataUrlResponse> => {
    try {
      const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
      return { ok: true, dataUrl };
    } catch (e) {
      return { ok: false, error: String(e) };
    } finally {
      await new Promise((r) => setTimeout(r, 550));
    }
  });
  captureChain = run;
  return run;
}
