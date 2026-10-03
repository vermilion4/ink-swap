import { browser } from 'wxt/browser';
import type { DataUrlResponse, Message } from '@/lib/messages';
import { getTabState, setTabState } from '@/lib/settings';

// The last few captured pages, kept for inspection while developing.
const recentCaptures: { pageId: string; method: string; dataUrl: string; at: number }[] = [];
(globalThis as any).__inkswap = { recentCaptures };

export default defineBackground(() => {
  browser.tabs.onRemoved.addListener((tabId) => {
    void setTabState(tabId, null);
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

      case 'pageCaptured':
        recentCaptures.push({ pageId: msg.pageId, method: msg.method, dataUrl: msg.dataUrl, at: Date.now() });
        if (recentCaptures.length > 6) recentCaptures.shift();
        sendResponse({ ok: true });
        return false;
    }
    return false;
  });
});

async function switchTab(tabId: number, on: boolean) {
  const prev = await getTabState(tabId);
  const state = on ? { on: true, language: prev?.language ?? 'en' as const } : null;
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
