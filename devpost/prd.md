---
doc: prd
status: approved
---

# InkSwap — Product Requirements

InkSwap is a browser extension for manga readers who read raws. When they switch it on for a tab, it covers each speech bubble on the page with a natural, meaning-first translation in their language.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
Develops `scope.md > The Core Loop` and `scope.md > What "Working" Looks Like`.

1. The reader has InkSwap installed and opens a raw Japanese chapter on a manga site. Nothing happens on its own.
2. They switch InkSwap on for this tab, either by clicking the extension icon and flipping the toggle in the popup, or by right-clicking the page and choosing **"Translate this page"**.
3. As each manga page scrolls into view, a **loading indicator appears on each of its speech bubbles**.
4. When the page is done, the indicators disappear and each bubble is covered by a meaning-first translation in hand-lettered comic text.
5. For the **first page**, a **chime** plays and a **toast** says it's translated. After that, there's **one toast per chapter** (no chime), not one per page.
6. The reader keeps scrolling and reading. When they move to the next chapter **in the same tab**, InkSwap stays on and keeps translating with no need to switch it on again.
7. **Success:** a page that was unreadable Japanese a moment ago reads like a clean, naturally written page in the reader's language.

## Screens and Layout
InkSwap has three surfaces, and all of them live on top of the reader's existing browser and manga site:

- **Extension popup**, opened from the toolbar icon. It contains:
  - The **InkSwap on/off toggle for this tab**
  - The **target language** picker
  - The **overlay opacity** slider
  - **Preferences**: chime on/off and toasts on/off
- **Right-click menu entry**: "Translate this page," which switches InkSwap on for the tab.
- **On-page overlay**, drawn over the manga site itself. It shows:
  - Loading indicators on bubbles
  - Translated text on bubbles
  - Toasts
  - The retry option when a page fails

## Look and Feel
- **Theme:** inspired by Crunchyroll's dark theme (https://www.crunchyroll.com), but it **follows the system light/dark setting**. It needs a matching light version.
- **Accent color:** between **magenta** and a "really cute purple" that's mid-tone, neither dark nor light. No orange.
- **Bubble text:** **hand-lettered comic style**, explicitly not a plain or generic font.
- **Overlay:** fully covers the original text, **0.95 opacity by default**, fitted exactly to each bubble. It must never look crude, off-putting, or out of place (`scope.md > Inspiration & Identity`).
- **General taste:** interactive and "poppy" (Apple, Tesla references), not a bland utility.
- **Avoid:** never color just one side of a border (left, right, top, or bottom) on any component, including toasts. Borders are either uniform all the way around or absent.

## Features and Behavior

### Switching On for a Tab
- As a raw-manga reader, I want to switch InkSwap on only for the chapter I'm reading so that it doesn't waste translation credits on pages I don't care about.
  - [ ] With InkSwap installed but off, opening a raw chapter shows the page unchanged.
  - [ ] Flipping the popup toggle on starts translating pages on that tab.
  - [ ] Right-clicking the page and choosing "Translate this page" has the same effect as the toggle.
  - [ ] The popup toggle shows "on" for that tab afterward, whichever method was used.

### Staying On Across Chapters
- [ ] After switching on, navigating to the next chapter **in the same tab** starts translating the new chapter without the reader doing anything.
- [ ] Other tabs are not affected.

### Bubble Translation and Overlay
Develops `scope.md > The Unique Kernel`.
- [ ] Each speech bubble on a page in view gets its own translation, placed over that bubble.
- [ ] Translations read naturally in the target language. They are written by meaning, not word-for-word. A line whose literal translation is "How did you get the other way?" reads as something like "How did you get into my house?"
- [ ] The overlay fully covers the original bubble text at the chosen opacity (0.95 by default), in the hand-lettered comic font, sized to fit inside the bubble.
- [ ] Pages translate as they come into view. Pages just ahead of the reader may be translated early so the reader rarely waits.

### Loading Feedback
- [ ] While a page is translating, each of its bubbles shows a loading indicator.
- [ ] When the page finishes, the indicators are replaced by the translated text.
- [ ] On the **first** translated page after switching on, a chime plays and a toast appears.
- [ ] After that, **one toast per chapter**, shown when that chapter's first page is translated, with no chime. There's no toast for every page.
- [ ] Turning off "chime" or "toasts" in preferences stops them.

### Settings
- [ ] **Target language:** phase one offers English only. The demo version adds Spanish and French (`scope.md > The POC Boundary`).
- [ ] **Opacity:** a slider that changes overlay opacity, defaulting to 0.95. Changes show on already-translated bubbles right away.
- [ ] **Preferences:** chime on/off and toasts on/off.

### Changing Language Mid-Chapter
- [ ] Switching the target language while reading **retranslates the current chapter** into the new language.
- [ ] Earlier chapters keep the language they were translated in. InkSwap doesn't go back and redo them.
- [ ] Later chapters in the tab use the new language.

### Turning Off
- [ ] Switching InkSwap off stops new pages from being translated.
- [ ] Pages already translated **keep their translations**, since there's no need to undo work already done.

### When Translation Fails
- [ ] If a page fails, for example because there's no internet or the service is down, its bubbles show the **raw original**, a toast says the page couldn't be translated, and a **retry** option is available for that page.
- [ ] Choosing retry runs that page again. On success, it shows translations like any other page.
- [ ] A single bubble that can't be read stays raw, and the rest of the page still translates.

## States and Boundaries
- **Off (default)**: the manga site looks exactly as normal.
- **On, translating**: loading indicators on the bubbles of pages in view.
- **On, translated**: translated bubbles, plus a chime and toast on the first page and one toast per chapter after that.
- **Failed page**: raw bubbles, an error toast, and a retry option.
- **Page with no bubbles** (e.g., a splash page or credits): nothing is overlaid. *Assumption: no error toast; the page is simply left alone.*
- **Switched off after translating**: existing translations stay and new pages aren't translated.
- **Persistence:** the on/off state lasts for the tab, across chapters in that tab. *Assumption: language, opacity, chime, and toast preferences are remembered between browsing sessions.*

## Product Decisions
- **Name: InkSwap.** The learner picked it over Manga Trans and Comic Trans.
- **Switched on per tab, not always on.** Always-on is a poor experience and wastes AI credits.
- **Stays on across chapters in the same tab.** Readers shouldn't have to re-enable it for every chapter.
- **Two ways to switch on: popup toggle and right-click "Translate this page."**
- **Chime only on the first page, then one toast per chapter, both mutable.** A chime or toast on every page "is a lot."
- **No one-sided colored borders anywhere.** This is the learner's design preference.
- **Loading indicators per bubble**, so the reader can see exactly what's in progress.
- **On failure, show the raw page plus a toast and retry.** The reader is never left with a broken page.
- **Turning off keeps existing translations.** Nothing needs to be retranslated.
- **A language change retranslates the current chapter only.** Earlier chapters stay as they were.
- **Look:** dark Crunchyroll-inspired theme that respects the system theme, a magenta-to-purple accent, and a hand-lettered comic font.

## What We're Building
- Popup with the per-tab toggle, language picker (English, then Spanish and French), opacity slider, and chime/toast preferences
- Right-click "Translate this page"
- Per-tab on-state that persists across chapters in that tab
- Bubble detection, meaning-first translation, and fitted overlay at 0.95 default opacity in a hand-lettered comic font
- Translation as pages come into view, with per-bubble loading indicators
- First-page chime, then one toast per chapter
- Failure handling: raw page, toast, and retry
- Retranslating the current chapter on a language change
- Tested and demoed on one or two real raw manga sites

## Deferred From the POC
- **Waiting-room entertainment** (a Chrome-style mini-game, or jokes and comedic panels): it's a separate project, and it doesn't help prove translation works.
- **Proven support across many manga sites**: we're testing on one or two first (`scope.md > Later`).
- **Translation caching**, so re-reading is instant and free.

## Possible Later Enhancements
- Polished typesetting: curved text, and matching each bubble's original lettering style.
- Translating sound effects and text outside bubbles.
- Korean webtoons, Chinese manhua, and more target languages.
- A fully polished settings experience.

## Non-Goals
- **Whole-story memory** (consistent names across chapters). The goal is each bubble making sense on its own (`scope.md > Explicitly Cut`).
- **Always-on automatic translation.** It's wasteful and intrusive.
- **A standalone reader site.** InkSwap works on sites people already use.

## Open Questions
- **Where the retry option sits visually** on a failed page, e.g. a small button on the page or in the toast. The learner wasn't sure how it fits. This can be settled in `4-spec` or the build, and doesn't block approval.