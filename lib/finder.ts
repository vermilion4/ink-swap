// Page Finder: find manga page elements (<img> or <canvas>, large enough to be a page),
// watch them come into view, and treat an <img> whose picture changes as a new page.

export type PageElement = HTMLImageElement | HTMLCanvasElement;

export interface FoundPage {
  id: string;
  el: PageElement;
}

const MIN_W = 300;
const MIN_H = 300;
const VISIBLE_RATIO = 0.6;

export interface FinderOptions {
  /** A page is (mostly) in view. Called again if it leaves and comes back. */
  onVisible: (page: FoundPage) => void;
  /** An element now shows a different page (e.g. single-page readers swapping the image). */
  onReplaced?: (oldId: string, page: FoundPage) => void;
}

export function createFinder({ onVisible, onReplaced }: FinderOptions) {
  const pages = new Map<PageElement, FoundPage>();
  let counter = 0;
  let running = false;

  const pageIdFor = (el: PageElement) =>
    `p${++counter}:${el instanceof HTMLImageElement ? (el.currentSrc || el.src).slice(-40) : 'canvas'}`;

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const page = pages.get(e.target as PageElement);
        if (page && e.intersectionRatio >= VISIBLE_RATIO) onVisible(page);
      }
    },
    { threshold: [0, VISIBLE_RATIO, 1] },
  );

  // Single-page readers (MangaDex's default) reuse one <img> and swap its picture.
  const srcWatcher = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target as HTMLImageElement;
      const old = pages.get(el);
      if (!old) continue;
      const fresh = { id: pageIdFor(el), el };
      pages.set(el, fresh);
      onReplaced?.(old.id, fresh);
      // Re-check visibility once the new picture has loaded.
      const recheck = () => {
        io.unobserve(el);
        io.observe(el);
      };
      if (el.complete) recheck();
      else el.addEventListener('load', recheck, { once: true });
    }
  });

  const isPageSized = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width >= MIN_W && r.height >= MIN_H;
  };

  function scan() {
    if (!running) return;
    for (const el of document.querySelectorAll<PageElement>('img, canvas')) {
      if (pages.has(el) || !isPageSized(el)) continue;
      pages.set(el, { id: pageIdFor(el), el });
      io.observe(el);
      if (el instanceof HTMLImageElement) srcWatcher.observe(el, { attributes: true, attributeFilter: ['src'] });
    }
  }

  // Readers add pages as they load; rescan on DOM changes (throttled) and every second.
  let scanQueued = false;
  const domWatcher = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => {
      scanQueued = false;
      scan();
    }, 250);
  });
  let interval: ReturnType<typeof setInterval> | undefined;

  return {
    pages,
    start() {
      if (running) return;
      running = true;
      scan();
      domWatcher.observe(document.documentElement, { childList: true, subtree: true });
      interval = setInterval(scan, 1000);
    },
    stop() {
      running = false;
      io.disconnect();
      srcWatcher.disconnect();
      domWatcher.disconnect();
      clearInterval(interval);
      pages.clear();
    },
  };
}
