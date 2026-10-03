// Overlay Renderer: InkSwap's on-page layer, inside a shadow root so the manga site's
// styles and InkSwap's can't affect each other. Each page gets a box that follows its element;
// translated bubbles are labels inside that box, positioned in percentages so they follow too.

import { browser } from 'wxt/browser';
import overlayCss from '@/assets/overlay.css?inline';
import { boxToPct, fitFontSize, type PctRect } from './geometry';
import type { Bubble } from './translate';

export type PageStatus = 'found' | 'capturing' | 'translating' | 'translated' | 'failed';

interface PageLayer {
  el: Element;
  box: HTMLDivElement;
}

const MAX_FONT_PX = 24;
const MIN_FONT_PX = 7;
const FONT_FAMILY = 'InkSwap Shantell Sans';
/** Share of the label's width and height the text may use. */
const INSET_W = 0.84;
const INSET_H = 0.88;

export function createOverlay() {
  const host = document.createElement('inkswap-overlay');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = overlayCss;
  const root = document.createElement('div');
  root.className = 'root';
  // Toasts sit outside `root`, so they stay visible while pages hide for a screenshot.
  const toastLayer = document.createElement('div');
  toastLayer.className = 'root toast-layer';
  shadow.append(style, root, toastLayer);

  const layers = new Map<string, PageLayer>();
  let frame = 0;

  function place({ el, box }: PageLayer) {
    const r = el.getBoundingClientRect();
    const t = `translate(${r.left}px, ${r.top}px)`;
    if (box.style.transform !== t) box.style.transform = t;
    const w = `${r.width}px`, h = `${r.height}px`;
    if (box.style.width !== w) box.style.width = w;
    if (box.style.height !== h) box.style.height = h;
  }

  // Follow each page element every frame: some readers move pages with transforms,
  // which fire no scroll events.
  function follow() {
    for (const [id, layer] of layers) {
      // The reader removed this page (e.g. a new chapter loaded): drop its layer too.
      if (!layer.el.isConnected) {
        layer.box.remove();
        layers.delete(id);
        continue;
      }
      place(layer);
    }
    frame = requestAnimationFrame(follow);
  }

  function layerFor(pageId: string, el: Element) {
    let layer = layers.get(pageId);
    if (!layer) {
      const box = document.createElement('div');
      box.className = 'page';
      root.append(box);
      layer = { el, box };
      layers.set(pageId, layer);
    }
    return layer;
  }

  return {
    mount() {
      loadFonts();
      if (!host.isConnected) document.documentElement.append(host);
      if (!frame) frame = requestAnimationFrame(follow);
    },
    unmount() {
      cancelAnimationFrame(frame);
      frame = 0;
      host.remove();
    },
    toastLayer,
    setStatus(pageId: string, el: Element, status: PageStatus) {
      const { box } = layerFor(pageId, el);
      box.dataset.status = status;
      if (status !== 'failed') box.querySelector('.retry')?.remove();
    },
    /** The page stays raw, with a "↻ Retry" pill in its top-right corner. */
    setFailed(pageId: string, el: Element, onRetry: () => void) {
      const { box } = layerFor(pageId, el);
      box.replaceChildren();
      box.dataset.status = 'failed';
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'retry';
      pill.textContent = '↻ Retry';
      pill.addEventListener('click', onRetry, { once: true });
      box.append(pill);
    },
    /** Draw one label per readable bubble. Unreadable bubbles stay raw. */
    async setBubbles(pageId: string, el: Element, bubbles: Bubble[], lang: string) {
      // Measure with the real font, or the sizes come out wrong once it swaps in.
      await document.fonts.load(`600 16px '${FONT_FAMILY}'`).catch(() => {});
      const layer = layerFor(pageId, el);
      place(layer); // labels are measured against the page's current size
      layer.box.replaceChildren();
      const pageRect = layer.box.getBoundingClientRect();
      const pageWidth = pageRect.width;
      const pageAspect = pageRect.height / pageRect.width;
      for (const b of bubbles) {
        if (!b.readable || !b.translation.trim()) continue;
        // A bubble InkSwap found is covered exactly; others get a padded rounded label.
        const r = b.shape ? boxToPct(b.box, 0) : widenColumn(boxToPct(b.box), pageAspect);
        const label = document.createElement('div');
        label.className = b.shape ? 'label shaped' : 'label';
        label.lang = lang;
        setPct(label, r);
        const text = document.createElement('span');
        text.textContent = b.translation;
        if (b.shape) {
          const fill = document.createElement('div');
          fill.className = 'fill';
          fill.style.setProperty('--mask', `url("${b.shape.maskUrl}")`);
          label.append(fill);
          setPct(text, b.shape.text);
        } else {
          setPct(text, { left: (1 - INSET_W) * 50, top: (1 - INSET_H) * 50, width: INSET_W * 100, height: INSET_H * 100 });
        }
        label.append(text);
        layer.box.append(label);
        fitLabel(text, pageWidth);
      }
      layer.box.dataset.status = 'translated';
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

/**
 * Japanese text often runs in tall, thin columns; English needs width. Widen a label narrower
 * than 60% of its height around its center (staying on the page). `pageAspect` = height / width.
 */
function widenColumn(r: PctRect, pageAspect: number): PctRect {
  const minWidth = r.height * pageAspect * 0.6; // in % of page width
  if (r.width >= minWidth) return r;
  const width = Math.min(100, minWidth);
  const left = Math.min(100 - width, Math.max(0, r.left + r.width / 2 - width / 2));
  return { ...r, left, width };
}

function setPct(el: HTMLElement, r: PctRect) {
  Object.assign(el.style, { left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` });
}

/**
 * Find the largest font size at which the text fits its area without breaking a word,
 * then store it relative to the page width (--fs, in cqw) so it scales with the page.
 * Words are never split letter by letter; if even the smallest size doesn't fit, the
 * text area widens around its center instead.
 */
function fitLabel(text: HTMLElement, pageWidth: number) {
  const inner = document.createElement('span');
  inner.append(...text.childNodes);
  text.append(inner);
  const availW = text.clientWidth;
  const availH = text.clientHeight;
  const fits = (px: number) => {
    text.style.fontSize = `${px}px`;
    return inner.offsetHeight <= availH + 0.5 && inner.scrollWidth <= availW + 0.5;
  };
  const max = Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, availH));
  const size = fitFontSize(fits, max, MIN_FONT_PX);
  if (!fits(size)) {
    const wider = Math.max(availW, inner.scrollWidth);
    const grow = ((wider - availW) / pageWidth) * 100;
    text.style.marginLeft = `calc(${-grow / 2} * 1cqw)`;
    text.style.width = `calc(${text.style.width} + ${grow} * 1cqw)`;
  }
  text.style.fontSize = '';
  text.style.setProperty('--fs', String((size / pageWidth) * 100));
}

// @font-face doesn't work inside a shadow root, so the bundled font is declared on the page.
let fontsLoaded = false;
function loadFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const url = (file: string) => browser.runtime.getURL(`/fonts/${file}` as '/fonts/shantell-sans-latin.woff2');
  const face = (file: string, range: string) => `@font-face {
    font-family: '${FONT_FAMILY}';
    src: url('${url(file)}') format('woff2');
    font-weight: 300 800;
    font-display: block;
    unicode-range: ${range};
  }`;
  const style = document.createElement('style');
  style.textContent = [
    face('shantell-sans-latin.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF, U+FFFD'),
    face('shantell-sans-latin-ext.woff2', 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20AB, U+20AD-20C0, U+A720-A7FF'),
  ].join('\n');
  document.head.append(style);
}
