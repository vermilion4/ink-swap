// Page Capture: get a page's picture as a JPEG, long edge ≤ 1568px.
// Tries, in order: read the <img>/<canvas> directly → download the image through
// the background worker → screenshot the visible tab and crop to the page.

import { browser } from 'wxt/browser';
import type { CaptureMethod, DataUrlResponse, Message } from './messages';
import { blobToDataUrl } from './pageimage';

export const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.85;

export interface CapturedPage {
  method: CaptureMethod;
  dataUrl: string; // image/jpeg
  width: number;
  height: number;
}

export async function capturePage(
  el: HTMLImageElement | HTMLCanvasElement,
  hideOverlay: (hidden: boolean) => void,
): Promise<CapturedPage> {
  if (el instanceof HTMLImageElement) {
    try {
      return await encode(el, el.naturalWidth, el.naturalHeight, 'image');
    } catch {
      // Cross-origin image: the background worker can download it with host permissions.
      const res = (await send({ type: 'fetchImage', url: el.currentSrc || el.src })) as DataUrlResponse;
      if (res.ok) {
        const bmp = await createImageBitmap(await (await fetch(res.dataUrl)).blob());
        return encode(bmp, bmp.width, bmp.height, 'fetch');
      }
    }
  } else {
    try {
      return await encode(el, el.width, el.height, 'canvas');
    } catch {
      // Protected drawing surface (e.g. Shonen Jump+): fall through to the screenshot.
    }
  }
  return screenshotCrop(el, hideOverlay);
}

/** True when the element is fully inside the viewport (needed for the screenshot fallback). */
export function isFullyOnScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.width > 0;
}

async function screenshotCrop(el: Element, hideOverlay: (hidden: boolean) => void): Promise<CapturedPage> {
  if (!isFullyOnScreen(el)) throw new Error('Page is not fully on screen');
  hideOverlay(true);
  await nextFrame();
  await nextFrame();
  const rect = el.getBoundingClientRect();
  let res: DataUrlResponse;
  try {
    res = (await send({ type: 'captureVisible' })) as DataUrlResponse;
  } finally {
    hideOverlay(false);
  }
  if (!res.ok) throw new Error(`Screenshot failed: ${res.error}`);
  const shot = await createImageBitmap(await (await fetch(res.dataUrl)).blob());
  // The screenshot is in device pixels; the rect is in CSS pixels.
  const scale = shot.width / innerWidth;
  const sx = rect.left * scale, sy = rect.top * scale, sw = rect.width * scale, sh = rect.height * scale;
  return encode(shot, sw, sh, 'screenshot', [sx, sy, sw, sh]);
}

async function encode(
  source: CanvasImageSource,
  w: number,
  h: number,
  method: CaptureMethod,
  crop?: [number, number, number, number],
): Promise<CapturedPage> {
  if (!w || !h) throw new Error('Image has no size yet');
  const k = Math.min(1, MAX_EDGE / Math.max(w, h));
  const outW = Math.round(w * k), outH = Math.round(h * k);
  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, outW, outH);
  if (crop) ctx.drawImage(source, ...crop, 0, 0, outW, outH);
  else ctx.drawImage(source, 0, 0, outW, outH);
  // Throws a SecurityError if the source is cross-origin ("tainted").
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  return { method, dataUrl: await blobToDataUrl(blob), width: outW, height: outH };
}


function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r(null)));
}

function send(msg: Message) {
  return browser.runtime.sendMessage(msg);
}
