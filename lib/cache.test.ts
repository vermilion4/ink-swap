import { describe, expect, it } from 'vitest';
import { createCache, type KeyValueStore } from './cache';
import type { Fingerprint } from './fingerprint';
import type { Bubble } from './translate';

/** An in-memory stand-in for chrome.storage.local. */
function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k)]));
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    async remove(keys) {
      for (const k of keys) data.delete(k);
    },
  };
}

const fp = (hash: string, shape = 0.7): Fingerprint => ({ hash: hash.padEnd(64, '0'), shape });
const bubbles = (text: string): Bubble[] => [{ box: { x: 1, y: 2, w: 3, h: 4 }, source: 'ソース', translation: text, readable: true }];

describe('createCache', () => {
  it('finds a saved page by fingerprint, language and version', async () => {
    const cache = createCache(memoryStore(), 'v1');
    await cache.save(fp('abc'), 'en', bubbles('Hello'));
    expect(await cache.lookup(fp('abc'), 'en')).toEqual(bubbles('Hello'));
  });

  it('finds a page whose fingerprint differs by a few bits (a re-taken capture)', async () => {
    const cache = createCache(memoryStore(), 'v1');
    await cache.save(fp('ff00'), 'en', bubbles('Hello'));
    expect(await cache.lookup(fp('fe00'), 'en')).toEqual(bubbles('Hello')); // 1 bit differs
  });

  it('misses for another language, another page, or another prompt version', async () => {
    const store = memoryStore();
    await createCache(store, 'v1').save(fp('abc'), 'en', bubbles('Hello'));
    expect(await createCache(store, 'v1').lookup(fp('abc'), 'es')).toBeNull();
    expect(await createCache(store, 'v1').lookup(fp('ffffffff'), 'en')).toBeNull();
    expect(await createCache(store, 'v2').lookup(fp('abc'), 'en')).toBeNull();
  });

  it('remembers between sessions (a new cache over the same storage)', async () => {
    const store = memoryStore();
    await createCache(store, 'v1').save(fp('abc'), 'en', bubbles('Hello'));
    expect(await createCache(store, 'v1').lookup(fp('abc'), 'en')).toEqual(bubbles('Hello'));
  });

  it('replaces a page saved again instead of keeping two', async () => {
    const cache = createCache(memoryStore(), 'v1');
    await cache.save(fp('abc'), 'en', bubbles('Old'));
    await cache.save(fp('abc'), 'en', bubbles('New'));
    expect(await cache.count()).toBe(1);
    expect(await cache.lookup(fp('abc'), 'en')).toEqual(bubbles('New'));
  });

  it('keeps only the most recently used pages', async () => {
    const store = memoryStore();
    const cache = createCache(store, 'v1', 2);
    await cache.save(fp('a1'.repeat(32)), 'en', bubbles('1'));
    await cache.save(fp('b2'.repeat(32)), 'en', bubbles('2'));
    await cache.lookup(fp('a1'.repeat(32)), 'en'); // page 1 used again: page 2 is now the oldest
    await cache.save(fp('c3'.repeat(32)), 'en', bubbles('3'));
    expect(await cache.count()).toBe(2);
    expect(await cache.lookup(fp('b2'.repeat(32)), 'en')).toBeNull();
    expect(await cache.lookup(fp('a1'.repeat(32)), 'en')).toEqual(bubbles('1'));
    expect([...store.data.keys()].filter((k) => k.startsWith('cache:'))).toHaveLength(2); // the dropped page's data is gone too
  });

  it('clears everything', async () => {
    const store = memoryStore();
    const cache = createCache(store, 'v1');
    await cache.save(fp('abc'), 'en', bubbles('Hello'));
    await cache.clear();
    expect(await cache.count()).toBe(0);
    expect(await cache.lookup(fp('abc'), 'en')).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('handles saves arriving at the same time', async () => {
    const cache = createCache(memoryStore(), 'v1');
    await Promise.all([cache.save(fp('a1'.repeat(32)), 'en', bubbles('1')), cache.save(fp('b2'.repeat(32)), 'en', bubbles('2'))]);
    expect(await cache.count()).toBe(2);
  });
});
