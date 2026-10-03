// The messages the popup, background worker, and page helper send each other.

import type { TabState } from './settings';
import type { Bubble, TranslateFailure } from './translate';

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
  // page helper → background: translate this captured page picture
  | {
      type: 'translatePage';
      pageId: string;
      /** Which chapter the page belongs to, for the once-per-chapter toast. */
      chapter: string;
      method: CaptureMethod;
      dataUrl: string;
      width: number;
      height: number;
    }
  // background → offscreen page: play the chime
  | { type: 'playChime' };

/** Which toast a translated page earns: the first page after switching on, or a chapter's first page. */
export type Celebrate = 'page' | 'chapter' | null;

export type CaptureMethod = 'image' | 'canvas' | 'fetch' | 'screenshot';

export type DataUrlResponse = { ok: true; dataUrl: string } | { ok: false; error: string };

export type TranslateResponse =
  | { ok: true; bubbles: Bubble[]; celebrate: Celebrate }
  | { ok: false; kind: TranslateFailure | 'cancelled'; error: string };
