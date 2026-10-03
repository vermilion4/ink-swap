// The messages the popup, background worker, and page helper send each other.

import type { TabState } from './settings';

export type Message =
  // page helper → background: "is my tab on?"
  | { type: 'getTabState' }
  // popup → background: switch a tab on or off
  | { type: 'setTabOn'; tabId: number; on: boolean }
  // popup → background: state for a specific tab
  | { type: 'getTabStateFor'; tabId: number }
  // background → page helper: the tab's state changed
  | { type: 'tabStateChanged'; state: TabState | null }
  // page helper → background: download an image the page can't read itself
  | { type: 'fetchImage'; url: string }
  // page helper → background: screenshot the visible tab
  | { type: 'captureVisible' }
  // page helper → background: a page picture is ready
  | { type: 'pageCaptured'; pageId: string; method: CaptureMethod; dataUrl: string };

export type CaptureMethod = 'image' | 'canvas' | 'fetch' | 'screenshot';

export type DataUrlResponse = { ok: true; dataUrl: string } | { ok: false; error: string };
