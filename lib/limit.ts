// Runs at most `max` tasks at once; the rest wait their turn in order. The background
// worker keeps one per tab so a tab never has more than 2 Claude calls in flight.

export function createLimiter(max: number) {
  let active = 0;
  let peak = 0;
  const waiting: (() => void)[] = [];

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
      active++;
      peak = Math.max(peak, active);
      try {
        return await task();
      } finally {
        active--;
        waiting.shift()?.();
      }
    },
    /** The most tasks that ever ran at once (for checking the limit while developing). */
    get peak() {
      return peak;
    },
  };
}
