// Read/write settings, the API key, and per-tab on/off state in chrome.storage.

import { browser } from 'wxt/browser';

export type Language = 'en' | 'es' | 'fr';

export interface TabState {
  on: boolean;
  language: Language;
  /** The chime (and "Page translated" toast) already fired since this tab was switched on. */
  chimed?: boolean;
  /** Chapters that already got their "Chapter translated" toast since switching on. */
  toastedChapters?: string[];
}

/** Reader preferences, remembered between sessions. The popup edits them. */
export interface Prefs {
  /** The language new tabs switch on with (and the current tab's, when changed in the popup). */
  language: Language;
  /** Label fill opacity, 0.5–1. */
  opacity: number;
  chime: boolean;
  toasts: boolean;
}
export const PREFS = 'prefs';
export const DEFAULT_PREFS: Prefs = { language: 'en', opacity: 0.95, chime: true, toasts: true };

export async function getPrefs(): Promise<Prefs> {
  const res = await browser.storage.local.get(PREFS);
  return { ...DEFAULT_PREFS, ...(res[PREFS] as Partial<Prefs> | undefined) };
}

export async function setPrefs(prefs: Partial<Prefs>): Promise<void> {
  await browser.storage.local.set({ [PREFS]: { ...(await getPrefs()), ...prefs } });
}

const API_KEY = 'apiKey';
const TAB_STATES = 'tabStates';

export async function getApiKey(): Promise<string> {
  const res = await browser.storage.local.get(API_KEY);
  return (res[API_KEY] as string | undefined) ?? '';
}

export async function setApiKey(key: string): Promise<void> {
  await browser.storage.local.set({ [API_KEY]: key.trim() });
}

// Tab state lives in storage.session: kept while Chrome is open and survives the
// background worker restarting. Only the background worker and popup read it.
async function getAllTabStates(): Promise<Record<string, TabState>> {
  const res = await browser.storage.session.get(TAB_STATES);
  return (res[TAB_STATES] as Record<string, TabState> | undefined) ?? {};
}

export async function getTabState(tabId: number): Promise<TabState | null> {
  return (await getAllTabStates())[tabId] ?? null;
}

export async function setTabState(tabId: number, state: TabState | null): Promise<void> {
  const all = await getAllTabStates();
  if (state) all[tabId] = state;
  else delete all[tabId];
  await browser.storage.session.set({ [TAB_STATES]: all });
}
