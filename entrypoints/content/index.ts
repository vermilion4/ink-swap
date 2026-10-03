// Page helper: finds manga pages, captures them as they come into view, and draws
// InkSwap's layer on top. Only does anything while this tab is switched on.

import { browser } from 'wxt/browser';
import { capturePage, isFullyOnScreen } from '@/lib/capture';
import { createFinder, type FoundPage } from '@/lib/finder';
import type { Message } from '@/lib/messages';
import { createOverlay } from '@/lib/overlay';
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
      try {
        const shot = await capturePage(page.el, overlay.setHidden);
        overlay.setStatus(page.id, page.el, 'captured');
        await browser.runtime.sendMessage({
          type: 'pageCaptured',
          pageId: page.id,
          method: shot.method,
          dataUrl: shot.dataUrl,
        } satisfies Message);
      } catch (e) {
        console.warn('[InkSwap] capture failed', page.id, e);
        done.delete(page.id);
        overlay.setStatus(page.id, page.el, 'failed');
      }
    }

    function apply(state: TabState | null) {
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
