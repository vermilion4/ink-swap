// Page helper: finds manga pages, captures them as they come into view, and draws
// InkSwap's layer on top. Only does anything while this tab is switched on.

import { browser } from 'wxt/browser';
import { capturePage, isFullyOnScreen } from '@/lib/capture';
import { createFinder, type FoundPage } from '@/lib/finder';
import type { Message, TranslateResponse } from '@/lib/messages';
import { createOverlay } from '@/lib/overlay';
import { snapBubbles } from '@/lib/snap';
import type { TabState } from '@/lib/settings';

export default defineContentScript({
  matches: ['https://mangadex.org/*', 'https://shonenjumpplus.com/*'],
  async main() {
    const overlay = createOverlay();
    const done = new Set<string>(); // pages captured (or in progress)

    const finder = createFinder({
      onVisible: (page) => void handlePage(page),
      onReplaced: (oldId) => {
        overlay.remove(oldId);
        done.delete(oldId);
      },
    });

    async function handlePage(page: FoundPage) {
      if (done.has(page.id)) return;
      overlay.setStatus(page.id, page.el, 'found');
      await waitUntilStill(page.el);
      // The screenshot fallback needs the whole page on screen; wait for the next visibility event.
      if (page.el instanceof HTMLCanvasElement && !isFullyOnScreen(page.el)) return;
      if (done.has(page.id)) return;
      done.add(page.id);
      overlay.setStatus(page.id, page.el, 'capturing');
      let shot;
      try {
        shot = await capturePage(page.el, overlay.setHidden);
      } catch (e) {
        console.warn('[InkSwap] capture failed', page.id, e);
        done.delete(page.id);
        overlay.setStatus(page.id, page.el, 'failed');
        return;
      }
      overlay.setStatus(page.id, page.el, 'translating');
      const res = (await browser.runtime.sendMessage({
        type: 'translatePage',
        pageId: page.id,
        method: shot.method,
        dataUrl: shot.dataUrl,
        width: shot.width,
        height: shot.height,
      } satisfies Message)) as TranslateResponse;
      // The reader may have swapped this element to another page while we waited.
      if (!finder.pages.has(page.el) || finder.pages.get(page.el)!.id !== page.id) return;
      if (res.ok) {
        const bubbles = await snapBubbles(shot.dataUrl, res.bubbles).catch((e) => {
          console.warn('[InkSwap] snap step failed, using Claude boxes', e);
          return res.bubbles;
        });
        await overlay.setBubbles(page.id, page.el, bubbles, language);
      } else {
        // Toasts and the Retry pill come in a later step; for now the page stays raw and outlined red.
        console.warn('[InkSwap] translation failed', page.id, res.kind, res.error);
        overlay.setStatus(page.id, page.el, 'failed');
      }
    }

    let language = 'en';
    function apply(state: TabState | null) {
      if (state) language = state.language;
      if (state?.on) {
        overlay.mount();
        finder.start();
      } else {
        // Switching off stops new pages; anything already drawn stays.
        finder.stop();
      }
    }

    browser.runtime.onMessage.addListener((raw) => {
      const msg = raw as Message;
      if (msg.type === 'tabStateChanged') apply(msg.state);
    });

    apply((await browser.runtime.sendMessage({ type: 'getTabState' } satisfies Message)) as TabState | null);
  },
});

/** Wait until the element stops moving (page-turn animations), up to ~1.5s. */
async function waitUntilStill(el: Element) {
  let last = '';
  for (let i = 0; i < 10; i++) {
    const r = el.getBoundingClientRect();
    const now = `${r.left},${r.top},${r.width},${r.height}`;
    if (now === last) return;
    last = now;
    await new Promise((res) => setTimeout(res, 150));
  }
}
