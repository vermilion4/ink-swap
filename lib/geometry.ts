// Box math and text fitting for bubble labels. Pure functions, so they can be tested
// without a browser.

/** A bubble box as Claude returns it: 0–1000, relative to the page image. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A label's position as percentages of the page element (so it follows resizes). */
export interface PctRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SCALE = 1000;

/**
 * Convert a 0–1000 box to percentages of the page, padded on every side by `pad`
 * (a fraction of the box's own size) and clamped to stay on the page.
 */
export function boxToPct(box: Box, pad = 0.03): PctRect {
  const clamp = (v: number) => Math.min(SCALE, Math.max(0, v));
  const x0 = clamp(box.x - box.w * pad);
  const y0 = clamp(box.y - box.h * pad);
  const x1 = clamp(box.x + box.w * (1 + pad));
  const y1 = clamp(box.y + box.h * (1 + pad));
  const pct = (v: number) => (v / SCALE) * 100;
  return { left: pct(x0), top: pct(y0), width: pct(Math.max(0, x1 - x0)), height: pct(Math.max(0, y1 - y0)) };
}

/**
 * The largest font size in [min, max] (in `step` increments) for which `fits(size)` is true.
 * Assumes bigger text never fits better than smaller text. Returns `min` if nothing fits.
 */
export function fitFontSize(fits: (size: number) => boolean, max: number, min: number, step = 0.5): number {
  let lo = 0;
  let hi = Math.floor((max - min) / step);
  if (!fits(min)) return min;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(min + mid * step)) lo = mid;
    else hi = mid - 1;
  }
  return min + lo * step;
}
