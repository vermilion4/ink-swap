// Overlay Renderer: InkSwap's on-page layer, inside a shadow root so the manga site's
// styles and InkSwap's can't affect each other. Each page gets a box that follows its element.

import overlayCss from '@/assets/overlay.css?inline';

export type PageStatus = 'found' | 'capturing' | 'captured' | 'failed';

interface PageLayer {
  el: Element;
  box: HTMLDivElement;
}

export function createOverlay() {
  const host = document.createElement('inkswap-overlay');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = overlayCss;
  const root = document.createElement('div');
  root.className = 'root';
  shadow.append(style, root);

  const layers = new Map<string, PageLayer>();
  let frame = 0;

  // Follow each page element every frame: some readers move pages with transforms,
  // which fire no scroll events.
  function follow() {
    for (const { el, box } of layers.values()) {
      const r = el.getBoundingClientRect();
      const t = `translate(${r.left}px, ${r.top}px)`;
      if (box.style.transform !== t) box.style.transform = t;
      const w = `${r.width}px`, h = `${r.height}px`;
      if (box.style.width !== w) box.style.width = w;
      if (box.style.height !== h) box.style.height = h;
    }
    frame = requestAnimationFrame(follow);
  }

  return {
    mount() {
      if (!host.isConnected) document.documentElement.append(host);
      if (!frame) frame = requestAnimationFrame(follow);
    },
    unmount() {
      cancelAnimationFrame(frame);
      frame = 0;
      host.remove();
    },
    setStatus(pageId: string, el: Element, status: PageStatus) {
      let layer = layers.get(pageId);
      if (!layer) {
        const box = document.createElement('div');
        box.className = 'page';
        root.append(box);
        layer = { el, box };
        layers.set(pageId, layer);
      }
      layer.box.dataset.status = status;
    },
    remove(pageId: string) {
      layers.get(pageId)?.box.remove();
      layers.delete(pageId);
    },
    /** Hide everything while the screenshot fallback captures the tab. */
    setHidden(hidden: boolean) {
      root.style.visibility = hidden ? 'hidden' : '';
    },
  };
}
