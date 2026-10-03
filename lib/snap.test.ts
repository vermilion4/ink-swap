import { describe, expect, it } from 'vitest';
import { snapBox, type Gray } from './snap';

/** A dark page with a white ellipse "bubble" (with dark letter dots inside) at the given box. */
function pageWithBubble(w: number, h: number, b: { cx: number; cy: number; rx: number; ry: number }): Gray {
  const data = new Uint8Array(w * h).fill(40);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = ((x - b.cx) / b.rx) ** 2 + ((y - b.cy) / b.ry) ** 2;
      if (d <= 1) data[y * w + x] = 255;
      else if (d <= 1.15) data[y * w + x] = 0; // the bubble's outline
    }
  // "Letters": dark blocks in the middle of the bubble.
  for (let y = b.cy - 10; y < b.cy + 10; y += 6)
    for (let x = b.cx - 8; x < b.cx + 8; x++) for (let k = 0; k < 3; k++) data[(y + k) * w + x] = 0;
  return { data, width: w, height: h };
}

describe('snapBox', () => {
  const img = pageWithBubble(200, 200, { cx: 100, cy: 100, rx: 40, ry: 50 });

  it('snaps an offset box to the bubble it overlaps', () => {
    const snapped = snapBox(img, { x: 75, y: 70, w: 70, h: 80 });
    expect(snapped.x).toBeGreaterThanOrEqual(59);
    expect(snapped.x).toBeLessThanOrEqual(62);
    expect(snapped.y).toBeGreaterThanOrEqual(49);
    expect(snapped.y).toBeLessThanOrEqual(52);
    expect(snapped.w).toBeGreaterThanOrEqual(78);
    expect(snapped.h).toBeGreaterThanOrEqual(98);
  });

  it('keeps the box when the white area is open background, not a closed bubble', () => {
    const open: Gray = { data: new Uint8Array(200 * 200).fill(255), width: 200, height: 200 };
    const box = { x: 50, y: 50, w: 40, h: 40 };
    expect(snapBox(open, box)).toEqual(box);
  });

  it('keeps the box when there is no white under it (e.g. white text on a dark page)', () => {
    const box = { x: 5, y: 5, w: 30, h: 30 };
    expect(snapBox(img, box)).toEqual(box);
  });

  it('ignores tiny white gaps that barely overlap the box', () => {
    const tiny = pageWithBubble(200, 200, { cx: 100, cy: 100, rx: 4, ry: 4 });
    const box = { x: 60, y: 60, w: 80, h: 80 };
    expect(snapBox(tiny, box)).toEqual(box);
  });
});
