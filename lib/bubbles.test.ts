import { describe, expect, it } from 'vitest';
import { findBubbles, inscribedRect, splitRegion } from './bubbles';
import type { Gray } from './snap';

/** A gray page; draw white ellipses (with a dark outline and dark "letters") onto it. */
function page(w: number, h: number, fill = 120): Gray {
  return { data: new Uint8Array(w * h).fill(fill), width: w, height: h };
}
function bubble(img: Gray, cx: number, cy: number, rx: number, ry: number, letters = true) {
  const { data, width, height } = img;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1) data[y * width + x] = 255;
      else if (d <= 1.2) data[y * width + x] = 0;
    }
  if (letters)
    for (let y = cy - 8; y < cy + 8; y += 5)
      for (let x = cx - 6; x < cx + 6; x++) for (let k = 0; k < 2; k++) data[(y + k) * width + x] = 0;
}

describe('findBubbles', () => {
  it('finds each closed bubble with its exact bounding box', () => {
    const img = page(300, 300);
    bubble(img, 80, 80, 40, 30);
    bubble(img, 200, 200, 30, 50);
    const found = findBubbles(img);
    expect(found).toHaveLength(2);
    const b = found.find((r) => r.x < 100)!;
    expect(b.x).toBeGreaterThanOrEqual(39);
    expect(b.x).toBeLessThanOrEqual(42);
    expect(b.w).toBeGreaterThanOrEqual(78);
    expect(b.h).toBeGreaterThanOrEqual(58);
  });

  it('fills the letters into the shape (they are holes, not outside)', () => {
    const img = page(200, 200);
    bubble(img, 100, 100, 40, 40);
    const [b] = findBubbles(img);
    const cx = 100 - b!.x, cy = 100 - b!.y;
    expect(b!.mask[cy * b!.w + cx]).toBe(1); // a letter pixel in the middle
    expect(b!.mask[0]).toBe(0); // the bounding box corner is outside the ellipse
  });

  it('ignores open white background touching the page edge', () => {
    expect(findBubbles(page(200, 200, 255))).toHaveLength(0);
  });

  it('ignores blank white shapes with no letters', () => {
    const img = page(200, 200);
    bubble(img, 100, 100, 40, 40, false);
    expect(findBubbles(img)).toHaveLength(0);
  });

  it('numbers bubbles in manga reading order: top row first, right to left', () => {
    const img = page(400, 400);
    bubble(img, 80, 70, 30, 30);
    bubble(img, 300, 70, 30, 30);
    bubble(img, 200, 300, 30, 30);
    const order = findBubbles(img).map((r) => Math.round((r.x + r.w / 2) / 10) * 10);
    expect(order).toEqual([300, 80, 200]);
  });
});

describe('splitRegion', () => {
  it('splits two touching bubbles between the two lines of text', () => {
    // Two linked ellipses sharing one open inside, with one outline around both.
    const W = 400, H = 300;
    const img = page(W, H);
    const d = (x: number, y: number) =>
      Math.min(((x - 100) / 50) ** 2 + ((y - 100) / 40) ** 2, ((x - 180) / 50) ** 2 + ((y - 100) / 40) ** 2);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) img.data[y * W + x] = d(x, y) <= 1 ? 255 : d(x, y) <= 1.2 ? 0 : 120;
    for (const cx of [100, 180]) // letters
      for (let y = 85; y < 115; y += 5) for (let x = cx - 8; x < cx + 8; x++) img.data[y * W + x] = 0;
    const [joined] = findBubbles(img);
    expect(joined!.w).toBeGreaterThan(150);
    // Claude's rough boxes for the two lines, slightly off.
    const [left, right] = splitRegion(joined!, [
      { x: 60, y: 70, w: 60, h: 60 },
      { x: 160, y: 75, w: 60, h: 60 },
    ]);
    expect(left!.x).toBeLessThan(55);
    expect(left!.x + left!.w).toBeLessThan(160);
    expect(right!.x).toBeGreaterThan(120);
    expect(right!.x + right!.w).toBeGreaterThan(225);
  });

  it('keeps a shape whole for a single line', () => {
    const img = page(200, 200);
    bubble(img, 100, 100, 40, 40);
    const [b] = findBubbles(img);
    expect(splitRegion(b!, [{ x: 0, y: 0, w: 10, h: 10 }])).toEqual([b]);
  });
});

describe('inscribedRect', () => {
  it('finds the largest rectangle inside an ellipse, centered', () => {
    const w = 100, h = 60;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) mask[y * w + x] = ((x - 50) / 50) ** 2 + ((y - 30) / 30) ** 2 <= 1 ? 1 : 0;
    const r = inscribedRect(mask, w, h, 2);
    // The ideal inscribed rectangle of an ellipse covers ~64% of its box (√2/2 per side);
    // the coarse grid gives up a little of that.
    expect((r.w * r.h) / (w * h)).toBeGreaterThan(0.45);
    expect(Math.abs(r.x + r.w / 2 - 50)).toBeLessThan(6);
    expect(Math.abs(r.y + r.h / 2 - 30)).toBeLessThan(6);
  });

  it('returns the whole box for a full mask', () => {
    expect(inscribedRect(new Uint8Array(400).fill(1), 20, 20, 2)).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });
});
