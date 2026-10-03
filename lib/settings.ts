// Read/write settings, the API key, and per-tab on/off state in chrome.storage.

import { browser } from 'wxt/browser';

export type Language = 'en' | 'es' | 'fr';

export interface TabState {
  on: boolean;
  language: Language;
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
