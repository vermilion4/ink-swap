// Page fingerprint for saved translations. MangaDex gives a page a new address on every load and
// Shonen Jump+ pages are screenshots, so a page is recognised by what it looks like: a 256-bit
// difference hash (is each cell of a 16×16 grid darker than its right-hand neighbour?) plus the
// page's shape. The same page captured again comes out the same or nearly so; different pages
// differ in many bits. Pure functions over a grayscale image.

import type { Gray } from './snap';

export interface Fingerprint {
  /** 256 bits as 64 hex characters. */
  hash: string;
  /** Width / height, to 3 decimals. */
  shape: number;
}

const GRID = 16;
/** At most this many of the 256 bits may differ for two captures to count as the same page. */
const MAX_BITS = 12;
const MAX_SHAPE_DIFF = 0.02;

export function pageFingerprint(img: Gray): Fingerprint {
  const { data, width, height } = img;
  // Average brightness of a (GRID + 1) × GRID grid of cells.
  const cols = GRID + 1, rows = GRID;
  const cells = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((r * height) / rows), y1 = Math.max(y0 + 1, Math.floor(((r + 1) * height) / rows));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * width) / cols), x1 = Math.max(x0 + 1, Math.floor(((c + 1) * width) / cols));
      let sum = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += data[y * width + x]!;
      cells[r * cols + c] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  let hash = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < GRID; c += 4) {
      let nibble = 0;
      for (let k = 0; k < 4; k++) nibble = (nibble << 1) | (cells[r * cols + c + k]! > cells[r * cols + c + k + 1]! ? 1 : 0);
      hash += nibble.toString(16);
    }
  }
  return { hash, shape: Math.round((width / height) * 1000) / 1000 };
}

/** How many of the 256 bits differ. */
export function distance(a: Fingerprint, b: Fingerprint): number {
  let bits = 0;
  for (let i = 0; i < a.hash.length; i++) {
    let x = parseInt(a.hash[i]!, 16) ^ parseInt(b.hash[i]!, 16);
    while (x) (bits += x & 1), (x >>= 1);
  }
  return bits;
}

export function samePage(a: Fingerprint, b: Fingerprint): boolean {
  return Math.abs(a.shape - b.shape) <= MAX_SHAPE_DIFF && distance(a, b) <= MAX_BITS;
}
