import { describe, expect, it } from 'vitest';
import { createLimiter } from './limit';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createLimiter', () => {
  it('never runs more than max tasks at once, and runs them all', async () => {
    const limit = createLimiter(2);
    let running = 0, most = 0;
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        limit.run(async () => {
          running++;
          most = Math.max(most, running);
          await tick(5);
          running--;
          return n;
        }),
      ),
    );
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(most).toBe(2);
    expect(limit.peak).toBe(2);
  });

  it('starts waiting tasks in the order they arrived', async () => {
    const limit = createLimiter(1);
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => limit.run(async () => void order.push(n))));
    expect(order).toEqual([1, 2, 3]);
  });

  it('frees the slot when a task fails', async () => {
    const limit = createLimiter(1);
    await expect(limit.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await limit.run(async () => 'next')).toBe('next');
  });
});
