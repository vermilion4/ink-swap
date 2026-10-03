import { describe, expect, it } from 'vitest';
import { distance, pageFingerprint, samePage } from './fingerprint';
import type { Gray } from './snap';

/** A made-up "page": blocks of gray tones placed by a seeded random generator. */
function fakePage(seed: number, w = 600, h = 850, shift = 0, brighten = 0): Gray {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const data = new Uint8Array(w * h).fill(240);
  for (let k = 0; k < 60; k++) {
    const x0 = Math.floor(rand() * w), y0 = Math.floor(rand() * h);
    const bw = 20 + Math.floor(rand() * 120), bh = 20 + Math.floor(rand() * 120);
    const tone = Math.floor(rand() * 200);
    for (let y = y0; y < Math.min(h, y0 + bh); y++)
      for (let x = x0; x < Math.min(w, x0 + bw); x++) data[y * w + x] = tone;
  }
  // Optionally shift by a few pixels and brighten (a re-taken screenshot, a re-encoded image).
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = Math.min(255, data[y * w + Math.max(0, x - shift)]! + brighten);
  return { data: out, width: w, height: h };
}

describe('pageFingerprint', () => {
  it('gives the same fingerprint for the same page', () => {
    expect(pageFingerprint(fakePage(1))).toEqual(pageFingerprint(fakePage(1)));
  });

  it('treats a slightly shifted, brightened copy as the same page', () => {
    const a = pageFingerprint(fakePage(1));
    const b = pageFingerprint(fakePage(1, 600, 850, 2, 6));
    expect(distance(a, b)).toBeLessThanOrEqual(12);
    expect(samePage(a, b)).toBe(true);
  });

  it('tells different pages apart', () => {
    const a = pageFingerprint(fakePage(1));
    const b = pageFingerprint(fakePage(2));
    expect(distance(a, b)).toBeGreaterThan(50);
    expect(samePage(a, b)).toBe(false);
  });

  it('tells apart pages of a different shape', () => {
    const a = pageFingerprint(fakePage(1, 600, 850));
    const b = pageFingerprint(fakePage(1, 850, 600));
    expect(samePage(a, b)).toBe(false);
  });

  it('is a compact string (256 bits as hex, plus the shape)', () => {
    expect(pageFingerprint(fakePage(3)).hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
