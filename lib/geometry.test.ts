import { describe, expect, it } from 'vitest';
import { boxToPct, fitFontSize } from './geometry';

describe('boxToPct', () => {
  it('converts a 0–1000 box to page percentages', () => {
    expect(boxToPct({ x: 100, y: 200, w: 300, h: 400 }, 0)).toEqual({ left: 10, top: 20, width: 30, height: 40 });
  });

  it('pads every side by a fraction of the box size', () => {
    const r = boxToPct({ x: 100, y: 100, w: 100, h: 200 }, 0.1);
    expect(r.left).toBeCloseTo(9);
    expect(r.top).toBeCloseTo(8);
    expect(r.width).toBeCloseTo(12);
    expect(r.height).toBeCloseTo(24);
  });

  it('clamps padded boxes to the page', () => {
    const r = boxToPct({ x: 0, y: 950, w: 1000, h: 100 }, 0.1);
    expect(r.left).toBe(0);
    expect(r.width).toBe(100);
    expect(r.top + r.height).toBeCloseTo(100);
  });

  it('never returns a negative size for a box off the page', () => {
    const r = boxToPct({ x: 1200, y: 1200, w: 50, h: 50 }, 0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});

describe('fitFontSize', () => {
  it('finds the largest size that fits', () => {
    expect(fitFontSize((s) => s <= 13.5, 30, 8)).toBe(13.5);
  });

  it('returns max when everything fits', () => {
    expect(fitFontSize(() => true, 30, 8)).toBe(30);
  });

  it('returns min when nothing fits', () => {
    expect(fitFontSize(() => false, 30, 8)).toBe(8);
  });

  it('checks few sizes (binary search)', () => {
    let calls = 0;
    fitFontSize((s) => (calls++, s <= 20), 40, 6, 0.5);
    expect(calls).toBeLessThan(10);
  });
});
