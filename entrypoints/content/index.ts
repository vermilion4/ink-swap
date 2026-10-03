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
    const replaced = new Set<string>(); // pages whose element now shows a different page
    let on = false;

    const finder = createFinder({
      onVisible: (page) => void handlePage(page),
      // Pictures just below the view start early, so the reader rarely waits.
      onNear: (page) => void handlePage(page, true),
      onReplaced: (oldId) => {
        replaced.add(oldId);
        overlay.remove(oldId);
        done.delete(oldId);
      },
    });

    async function handlePage(page: FoundPage, ahead = false) {
      if (done.has(page.id) || !on) return;
      if (!ahead) {
        overlay.setStatus(page.id, page.el, 'found');
        await waitUntilStill(page.el);
      }
      // The screenshot fallback needs the whole page on screen; wait for the next visibility event.
      if (page.el instanceof HTMLCanvasElement && !isFullyOnScreen(page.el)) return;
      if (done.has(page.id) || !on || replaced.has(page.id)) return;
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
      if (replaced.has(page.id)) return;
      if (!res.ok && res.kind === 'cancelled') {
        // Switched off before its turn came: leave the page raw, with no error.
        overlay.remove(page.id);
        done.delete(page.id);
        return;
      }
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

    // MangaDex changes chapters without reloading the page; Shonen Jump+ reloads, and the
    // page helper starts fresh with the tab still on. Either way, a new chapter keeps translating.
    let chapter = chapterKey();
    setInterval(() => {
      const now = chapterKey();
      if (now === chapter) return;
      chapter = now;
      if (on) console.log('[InkSwap] new chapter', now);
    }, 500);

    let language = 'en';
    function apply(state: TabState | null) {
      if (state) language = state.language;
      on = !!state?.on;
      if (on) {
        overlay.mount();
        finder.start();
      } else {
        // Switching off stops new pages; anything already drawn (or in flight) stays.
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

/** Which chapter this address is: MangaDex `/chapter/<id>/<page>`, Shonen Jump+ `/episode/<id>`. */
function chapterKey() {
  const m = location.pathname.match(/^\/(chapter|episode)\/[^/]+/);
  return m ? m[0] : location.pathname;
}

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
