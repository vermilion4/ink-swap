// Snap step: Claude's bubble boxes are close but not exact. A speech bubble's inside is a
// closed white area (the letters are just dark islands in it), so we find the white area
// Claude's box mostly overlaps and use its edges instead. Pure function over a grayscale image.

import type { Box } from './geometry';
import { loadBitmap, toGray } from './pageimage';
import type { Bubble } from './translate';

export interface Gray {
  data: Uint8Array; // one brightness value (0–255) per pixel, row by row
  width: number;
  height: number;
}

const WHITE = 200; // brighter than this counts as bubble paper
const SEARCH_GROW = 0.4; // look this far (as a share of the box) beyond Claude's box
const MIN_OVERLAP = 0.2; // the white area must cover at least this share of Claude's box

/**
 * Returns the bounding box of the closed white area that best matches `box`
 * (both in image pixels), or `box` unchanged if there is no closed white area.
 */
export function snapBox(img: Gray, box: Box): Box {
  const { data, width, height } = img;
  const x0 = Math.max(0, Math.floor(box.x - box.w * SEARCH_GROW));
  const y0 = Math.max(0, Math.floor(box.y - box.h * SEARCH_GROW));
  const x1 = Math.min(width - 1, Math.ceil(box.x + box.w * (1 + SEARCH_GROW)));
  const y1 = Math.min(height - 1, Math.ceil(box.y + box.h * (1 + SEARCH_GROW)));
  if (x1 <= x0 || y1 <= y0) return box;

  const winW = x1 - x0 + 1;
  const seen = new Uint8Array(winW * (y1 - y0 + 1));
  const inBox = (x: number, y: number) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
  const isWhite = (x: number, y: number) => data[y * width + x]! > WHITE;

  let best: { overlap: number; box: Box } | null = null;
  const queue: number[] = [];

  // Seed from white pixels in the middle of Claude's box (sampled, not every pixel).
  const step = Math.max(1, Math.floor(Math.min(box.w, box.h) / 12));
  for (let sy = Math.floor(box.y + box.h * 0.2); sy < box.y + box.h * 0.8; sy += step) {
    for (let sx = Math.floor(box.x + box.w * 0.2); sx < box.x + box.w * 0.8; sx += step) {
      if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
      const si = (sy - y0) * winW + (sx - x0);
      if (seen[si] || !isWhite(sx, sy)) continue;

      // Flood-fill this white area within the search window.
      let minX = sx, maxX = sx, minY = sy, maxY = sy, overlap = 0, leaks = false;
      seen[si] = 1;
      queue.length = 0;
      queue.push(sx, sy);
      for (let q = 0; q < queue.length; q += 2) {
        const x = queue[q]!, y = queue[q + 1]!;
        if (x === x0 || x === x1 || y === y0 || y === y1) leaks = true;
        if (inBox(x, y)) overlap++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const ni = (ny - y0) * winW + (nx - x0);
          if (seen[ni] || !isWhite(nx, ny)) continue;
          seen[ni] = 1;
          queue.push(nx, ny);
        }
      }
      // An area reaching the window's edge isn't a closed bubble (open background, panel gutter).
      if (leaks) continue;
      if (!best || overlap > best.overlap) {
        best = { overlap, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
      }
    }
  }

  if (!best || best.overlap < box.w * box.h * MIN_OVERLAP) return box;
  return best.box;
}

/**
 * Snap readable bubbles that have no exact shape (boxes on the 0–1000 scale) against the
 * captured page picture. Bubbles InkSwap already found are left as they are.
 */
export async function snapBubbles(dataUrl: string, bubbles: Bubble[]): Promise<Bubble[]> {
  if (bubbles.every((b) => b.shape || !b.readable)) return bubbles;
  const { gray: img } = toGray(await loadBitmap(dataUrl));
  const kx = img.width / 1000, ky = img.height / 1000;
  return bubbles.map((b) => {
    if (!b.readable || b.shape) return b;
    const px = { x: b.box.x * kx, y: b.box.y * ky, w: b.box.w * kx, h: b.box.h * ky };
    const s = snapBox(img, px);
    if (s === px) return b;
    return { ...b, box: { x: s.x / kx, y: s.y / ky, w: s.w / kx, h: s.h / ky } };
  });
}
