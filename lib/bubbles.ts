// Bubble finder: a speech bubble's inside is a closed white shape, with the letters as dark
// holes in it. We find those shapes on the page so InkSwap can number them for Claude and
// paint labels exactly over them. Pure functions over a grayscale image.

import type { Gray } from './snap';

export interface Region {
  /** Bounding box in image pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** w*h cells, 1 = inside the bubble's shape (letters included). */
  mask: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WHITE = 200; // brighter than this counts as bubble paper
const MIN_AREA = 0.0012; // smallest bubble, as a share of the page
const MAX_AREA = 0.2; // larger white areas are backgrounds or panels, not bubbles
const MIN_SIDE = 10; // px
const MIN_FILL = 0.5; // the shape must fill at least this much of its bounding box
const MIN_INK = 0.01; // and contain some dark marks (the letters)

/** Find closed white shapes that look like speech bubbles, in reading order. */
export function findBubbles(img: Gray): Region[] {
  const { data, width, height } = img;
  const label = new Int32Array(width * height); // 0 = unvisited
  const regions: Region[] = [];
  const queue = new Int32Array(width * height);
  let next = 1;

  for (let start = 0; start < data.length; start++) {
    if (label[start] || data[start]! <= WHITE) continue;
    const id = next++;
    label[start] = id;
    let head = 0, tail = 0, count = 0, edge = false;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    queue[tail++] = start;
    while (head < tail) {
      const p = queue[head++]!;
      const x = p % width, y = (p - x) / width;
      count++;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0) visit(p - 1);
      if (x < width - 1) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y < height - 1) visit(p + width);
    }
    function visit(q: number) {
      if (label[q] || data[q]! <= WHITE) return;
      label[q] = id;
      queue[tail++] = q;
    }

    // An area touching the page edge is open background, not a closed bubble.
    if (edge) continue;
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const pageArea = width * height;
    if (w < MIN_SIDE || h < MIN_SIDE) continue;
    if (count < pageArea * MIN_AREA || w * h > pageArea * MAX_AREA) continue;

    const mask = fillShape(label, width, id, minX, minY, w, h);
    let shapeArea = 0;
    for (const m of mask) shapeArea += m;
    if (shapeArea < w * h * MIN_FILL) continue;
    if (shapeArea - count < shapeArea * MIN_INK) continue; // blank white area, no text
    regions.push({ x: minX, y: minY, w, h, mask });
  }

  // Manga reading order: top to bottom, right to left (rows of roughly equal height).
  const row = height / 12;
  return regions.sort((a, b) => Math.floor(a.y / row) - Math.floor(b.y / row) || b.x + b.w - (a.x + a.w));
}

/**
 * The region's solid shape: every cell of its bounding box that can't reach the box's
 * border without crossing the region (so letters, which are holes, count as inside).
 */
function fillShape(label: Int32Array, width: number, id: number, x0: number, y0: number, w: number, h: number) {
  const outside = new Uint8Array(w * h);
  const queue: number[] = [];
  const inRegion = (i: number) => label[(y0 + Math.floor(i / w)) * width + x0 + (i % w)] === id;
  const push = (i: number) => {
    if (outside[i] || inRegion(i)) return;
    outside[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!, x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = outside[i] ? 0 : 1;
  return mask;
}

/**
 * Touching bubbles are found as one shape. When several lines of text sit in one shape,
 * split it: every cell goes to the line whose box it is closest to (`boxes` in image
 * pixels), and each part is trimmed to its own bounding box. One part per box, in order.
 */
export function splitRegion(r: Region, boxes: Rect[]): Region[] {
  if (boxes.length < 2) return [r];
  const owner = new Int8Array(r.w * r.h).fill(-1);
  const distTo = (b: Rect, x: number, y: number) => {
    const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
    const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
    const cx = x - (b.x + b.w / 2), cy = y - (b.y + b.h / 2);
    // Distance to the box first; distance to its center breaks ties (and overlaps).
    return (dx * dx + dy * dy) * 1e4 + cx * cx + cy * cy;
  };
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      if (!r.mask[y * r.w + x]) continue;
      let best = 0, bestD = Infinity;
      boxes.forEach((b, i) => {
        const d = distTo(b, r.x + x, r.y + y);
        if (d < bestD) (bestD = d), (best = i);
      });
      owner[y * r.w + x] = best;
    }
  return boxes.map((_, i) => {
    let minX = r.w, maxX = -1, minY = r.h, maxY = -1;
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++)
        if (owner[y * r.w + x] === i) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
    if (maxX < 0) return { ...r, w: 0, h: 0, mask: new Uint8Array(0) };
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) mask[y * w + x] = owner[(y + minY) * r.w + x + minX] === i ? 1 : 0;
    return { x: r.x + minX, y: r.y + minY, w, h, mask };
  });
}

/**
 * The largest rectangle fully inside the mask, searched on a coarse grid (cells of
 * `cell` px), so text can be placed where the bubble is actually wide enough.
 */
export function inscribedRect(mask: Uint8Array, w: number, h: number, cell = Math.max(1, Math.round(Math.max(w, h) / 40))): Rect {
  const cols = Math.floor(w / cell), rows = Math.floor(h / cell);
  if (!cols || !rows) return { x: 0, y: 0, w, h };
  // A grid cell counts only if every pixel in it is inside.
  const full = (cx: number, cy: number) => {
    for (let y = cy * cell; y < (cy + 1) * cell; y++)
      for (let x = cx * cell; x < (cx + 1) * cell; x++) if (!mask[y * w + x]) return false;
    return true;
  };
  const heights = new Array<number>(cols).fill(0);
  let best = { area: 0, x: 0, y: 0, w: 0, h: 0 };
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) heights[cx] = full(cx, cy) ? heights[cx]! + 1 : 0;
    // Largest rectangle in this row's histogram.
    const stack: number[] = [];
    for (let cx = 0; cx <= cols; cx++) {
      const hgt = cx === cols ? 0 : heights[cx]!;
      while (stack.length && heights[stack[stack.length - 1]!]! >= hgt) {
        const top = stack.pop()!;
        const rh = heights[top]!;
        const left = stack.length ? stack[stack.length - 1]! + 1 : 0;
        const area = rh * (cx - left);
        if (area > best.area) best = { area, x: left, y: cy - rh + 1, w: cx - left, h: rh };
      }
      stack.push(cx);
    }
  }
  if (!best.area) return { x: 0, y: 0, w, h };
  return { x: best.x * cell, y: best.y * cell, w: best.w * cell, h: best.h * cell };
}
