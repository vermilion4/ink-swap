// Saved translations: so a page already translated in this browser comes back instantly and
// free. A small index (fingerprint, language, version, last used) is kept under one key, and each
// page's bubbles under their own key, in chrome.storage.local. Only translations are stored,
// never page images. Works with any key-value store, so it can be tested without Chrome.

import { samePage, type Fingerprint } from './fingerprint';
import type { Language } from './settings';
import type { Bubble } from './translate';

export interface KeyValueStore {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

interface IndexEntry {
  id: string;
  fp: Fingerprint;
  language: Language;
  version: string;
  lastUsed: number;
}

const INDEX = 'cacheIndex';
const entryKey = (id: string) => `cache:${id}`;
export const MAX_PAGES = 2000;

/**
 * `version` identifies the prompt and model that made a translation; a page saved under another
 * version doesn't count, so improving the prompt translates afresh.
 */
export function createCache(store: KeyValueStore, version: string, maxPages = MAX_PAGES) {
  let index: IndexEntry[] | null = null;
  let clock = 0;
  const now = () => Math.max(Date.now(), ++clock); // strictly increasing, even within a millisecond

  // One change at a time, so saves arriving together can't overwrite each other's index.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  };

  async function load() {
    index ??= ((await store.get([INDEX]))[INDEX] as IndexEntry[] | undefined) ?? [];
    clock = Math.max(clock, ...index.map((e) => e.lastUsed));
    return index;
  }
  const find = (entries: IndexEntry[], fp: Fingerprint, language: Language) =>
    entries.find((e) => e.version === version && e.language === language && samePage(e.fp, fp));

  return {
    lookup: (fp: Fingerprint, language: Language) =>
      serial(async (): Promise<Bubble[] | null> => {
        const entries = await load();
        const hit = find(entries, fp, language);
        if (!hit) return null;
        const bubbles = (await store.get([entryKey(hit.id)]))[entryKey(hit.id)] as Bubble[] | undefined;
        if (!bubbles) return null;
        hit.lastUsed = now();
        await store.set({ [INDEX]: entries });
        return bubbles;
      }),

    save: (fp: Fingerprint, language: Language, bubbles: Bubble[]) =>
      serial(async () => {
        let entries = await load();
        const existing = find(entries, fp, language);
        const id = existing?.id ?? `${now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        if (existing) existing.lastUsed = now();
        else entries.push({ id, fp, language, version, lastUsed: now() });
        // Keep the most recently used pages; drop the rest, data included.
        let dropped: IndexEntry[] = [];
        if (entries.length > maxPages) {
          entries.sort((a, b) => b.lastUsed - a.lastUsed);
          dropped = entries.slice(maxPages);
          entries = index = entries.slice(0, maxPages);
        }
        await store.set({ [entryKey(id)]: bubbles, [INDEX]: entries });
        if (dropped.length) await store.remove(dropped.map((e) => entryKey(e.id)));
      }),

    count: () => serial(async () => (await load()).length),

    clear: () =>
      serial(async () => {
        const entries = await load();
        await store.remove([INDEX, ...entries.map((e) => entryKey(e.id))]);
        index = [];
      }),
  };
}
