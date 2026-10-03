// Canvas work on a captured page: grayscale for the bubble finder, the numbered copy Claude
// sees, and each bubble's shape for the overlay. Uses OffscreenCanvas, so it runs in the
// background worker as well as on the page.

import { findBubbles, inscribedRect, type Region } from './bubbles';
import type { Box, PctRect } from './geometry';
import type { Gray } from './snap';

/** The bubble finder works on a smaller copy of the page; this is its long edge. */
const DETECT_EDGE = 900;
const TINTS = ['#e6194b', '#2f9e44', '#1c7ed6', '#f76707', '#9c36b5', '#0c8599'];

export interface PageBubbles {
  regions: Region[];
  /** Page pixels per detection pixel. */
  scale: number;
  gray: Gray;
}

export async function loadBitmap(dataUrl: string) {
  return createImageBitmap(await (await fetch(dataUrl)).blob());
}

export function toGray(bmp: ImageBitmap, maxEdge = Infinity): { gray: Gray; scale: number } {
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k), height = Math.round(bmp.height * k);
  const ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (rgba[i * 4]! * 3 + rgba[i * 4 + 1]! * 6 + rgba[i * 4 + 2]!) / 10;
  return { gray: { data, width, height }, scale: bmp.width / width };
}

export function detectBubbles(bmp: ImageBitmap): PageBubbles {
  const { gray, scale } = toGray(bmp, DETECT_EDGE);
  return { regions: findBubbles(gray), scale, gray };
}

/**
 * The page on a white square (Claude places things more accurately on a square image) with
 * each found bubble shaded and numbered 1…n. Without regions, it's just the padded page.
 */
export async function squareImage(bmp: ImageBitmap, found?: PageBubbles): Promise<string> {
  const size = Math.max(bmp.width, bmp.height);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bmp, 0, 0);
  if (found) {
    const f = found.scale;
    found.regions.forEach((r, i) => {
      const tint = TINTS[i % TINTS.length]!;
      ctx.drawImage(maskCanvas(r, tint, 0.38), r.x * f, r.y * f, r.w * f, r.h * f);
      const fontPx = Math.max(18, Math.min(64, Math.min(r.w, r.h) * f * 0.45));
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, fontPx / 7);
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = tint;
      const cx = (r.x + r.w / 2) * f, cy = (r.y + r.h / 2) * f;
      ctx.strokeText(String(i + 1), cx, cy);
      ctx.fillText(String(i + 1), cx, cy);
    });
  }
  return blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }));
}

export interface Shape {
  /** PNG of the bubble's shape: opaque inside, transparent outside. */
  maskUrl: string;
  /** Where the text goes, as percentages of the bubble's bounding box. */
  text: PctRect;
}

/** The region's bounding box (0–1000 of the page) and its shape for the overlay. */
export async function regionShape(r: Region, found: PageBubbles): Promise<{ box: Box; shape: Shape }> {
  const { width, height } = found.gray;
  const box = {
    x: (r.x / width) * 1000,
    y: (r.y / height) * 1000,
    w: (r.w / width) * 1000,
    h: (r.h / height) * 1000,
  };
  const t = inscribedRect(r.mask, r.w, r.h);
  // A little breathing room inside the bubble's widest rectangle.
  const m = 0.06;
  const text = {
    left: ((t.x + t.w * m) / r.w) * 100,
    top: ((t.y + t.h * m) / r.h) * 100,
    width: ((t.w * (1 - 2 * m)) / r.w) * 100,
    height: ((t.h * (1 - 2 * m)) / r.h) * 100,
  };
  const blob = await maskCanvas(r, '#000', 1, 1).convertToBlob({ type: 'image/png' });
  return { box, shape: { maskUrl: await blobToDataUrl(blob), text } };
}

/** The region's shape as a canvas filled with `color`, optionally grown by `grow` px. */
function maskCanvas(r: Region, color: string, alpha: number, grow = 0) {
  const canvas = new OffscreenCanvas(r.w, r.h);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(r.w, r.h);
  const [cr, cg, cb] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < r.w && y < r.h && r.mask[y * r.w + x] === 1;
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      let on = inside(x, y);
      // Grow by a pixel so the fill also covers the soft inner edge of the bubble's outline.
      for (let d = 1; !on && d <= grow; d++)
        on = inside(x - d, y) || inside(x + d, y) || inside(x, y - d) || inside(x, y + d);
      if (!on) continue;
      const i = (y * r.w + x) * 4;
      img.data[i] = cr!;
      img.data[i + 1] = cg!;
      img.data[i + 2] = cb!;
      img.data[i + 3] = Math.round(alpha * 255);
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
