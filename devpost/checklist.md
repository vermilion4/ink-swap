---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Switch InkSwap on for a tab and watch it find and capture the manga pages**
  Becomes usable: A loadable InkSwap extension. The popup has the "On for this tab" toggle and the API key field. On a raw MangaDex or Shonen Jump+ chapter, switching on makes InkSwap outline each manga page it finds as it scrolls into view, and save a captured picture of that page. Nothing is translated yet.
  Why now: This is the spec's "one useful unknown": can we get clean, unscrambled page pictures from these two sites? If we can't, everything after this changes, so we find out first. It also bootstraps the project (WXT, TypeScript, permissions) inside a real behavior rather than as a setup step.
  PRD ref: `prd.md > Switching On for a Tab`, `prd.md > States and Boundaries` (Off)
  Spec ref: `spec.md > Stack`, `spec.md > File Structure`, `spec.md > Components` (Popup, Background Worker, Page Finder, Page Capture), `spec.md > Data Model`, `spec.md > Decisions and Open Issues` (One useful unknown)
  Build: Scaffold WXT + TypeScript per the spec's file structure; set permissions and host permissions in `wxt.config.ts`. Add `lib/settings.ts` (key and per-tab state in `chrome.storage`), `lib/messages.ts`, a minimal popup with the toggle and masked key field (toggle disabled until a key is saved), and a background worker that records tab state. Add `lib/finder.ts` (find `<img>`/`<canvas>` ≥ ~300px, `IntersectionObserver`) and `lib/capture.ts` (direct image → canvas → screenshot crop, JPEG, long edge ≤ 1568px). Inspect both sites, confirm the exact image-host domains, and record which capture method each site uses. Add a small Playwright script under `scripts/` that loads the built extension in Chromium, so behavior on real sites can be checked and screenshotted.
  Verify (mechanical): `npm run build` and `npx tsc --noEmit` pass. The Playwright script loads the extension, opens a raw chapter on each site, switches the tab on, scrolls, and saves the captured page image for each site. Open the saved images and confirm they're complete and unscrambled. Confirm that with the tab off, nothing is outlined.
  Learner check: Load the extension (`npm run dev`), paste your key, open a raw MangaDex chapter, flip the toggle on, and scroll. Each page should get a subtle outline as it comes into view. Look at the captured pages I show you from both sites and confirm they look like the real pages.
  Commit: `Scaffold InkSwap and capture manga pages on MangaDex and Shonen Jump+`

- [x] **2. One page reads as a natural English page**
  Becomes usable: On a switched-on tab, the first page in view shows a gradient spinner, then each readable bubble is covered by a fitted, hand-lettered English translation at 0.95 opacity. Unreadable bubbles stay raw.
  Why now: This is the unique kernel: meaning-first translation sitting right on the bubble. It comes immediately after we know capture works, so that the hardest and most important part is proven early, and your reaction to how it reads can shape everything after.
  PRD ref: `prd.md > Bubble Translation and Overlay`, `prd.md > Look and Feel`, `prd.md > The Core Journey` (steps 3–4, 7)
  Spec ref: `spec.md > Components` (Translator, Translation Prompt, Overlay Renderer), `spec.md > Data Model` (Bubble shape), `spec.md > External Services and Dependencies`, `spec.md > Look and Feel`, `spec.md > Important Failure Modes` (bubble boxes slightly off)
  Build: **You write the first draft of the translation prompt** in `lib/prompt.ts` while looking at a real raw page, before seeing any version from me. Then add `lib/translate.ts` (SDK call + zod schema, checked against the current SDK), `lib/geometry.ts` with Vitest tests for box math and text fitting, `lib/overlay.ts` + `assets/overlay.css` in a shadow root (spinner, fitted labels, `--inkswap-opacity`), and bundle Shantell Sans. Run it on real pages, compare what reads wrong, and sharpen the prompt together. Decide on effort level, the refusal fallback, and whether boxes need the snap step, based on what we see.
  Verify (mechanical): `npx vitest run` passes. `npm run build` passes. The Playwright script switches on a real raw MangaDex page and confirms labels appear over bubbles; take a screenshot and check it for alignment and fit. Log the real per-page token usage and time to compare against the spec's ~1¢ estimate.
  Learner check: Open a raw chapter, switch on, and read the first page. Does each bubble read the way a fluent English speaker would say it? Do the labels sit cleanly on the bubbles, or does anything look pasted on?
  Commit: `Translate and overlay a manga page with Claude`

- [x] **3. Scroll through a whole chapter, and into the next one**
  Becomes usable: Every page translates as it comes into view (pages just ahead may start early), with at most 2 Claude calls at once. Going to the next chapter in the same tab keeps translating without switching on again. Right-click "Translate this page" switches a tab on. Switching off stops new pages, and pages already translated keep their translations. Other tabs are unaffected.
  Why now: Once one page works, this turns it into the real reading experience from the core journey. Chapter-change detection on MangaDex (no full reload) is the next riskiest piece, so it comes before the polish.
  PRD ref: `prd.md > The Core Journey` (steps 2–3, 6), `prd.md > Switching On for a Tab`, `prd.md > Staying On Across Chapters`, `prd.md > Turning Off`
  Spec ref: `spec.md > Components` (Background Worker, Page Finder), `spec.md > The Core Journey Through the System`, `spec.md > Data Model` (Tab on/off state)
  Build: Translate every page the finder reports, with a concurrency limit of 2 per tab in the background worker. Detect address changes as new chapters. Add the right-click menu entry. Clear tab state when the tab closes. On switch-off, stop sending pages and leave existing labels.
  Verify (mechanical): `npm run build` passes. The Playwright script scrolls a whole MangaDex chapter and confirms each page gets labels, never more than 2 calls in flight; navigates to the next chapter and confirms translation continues; switches on via the context-menu path and confirms the popup state reads "on"; switches off and confirms existing labels remain and no new calls go out; and confirms a second tab stays untouched.
  Learner check: Right-click a raw chapter and choose "Translate this page." Scroll through it, go to the next chapter, keep scrolling, then switch off and scroll a little further. Translations should keep coming until you switch off, and the ones already there should stay.
  Commit: `Translate whole chapters as you scroll, across chapters in the tab`

- [x] **4. It tells you what's happening, and recovers when something fails**
  Becomes usable: The first translated page plays a chime and shows "Page translated ✓". Each later chapter gets one "Chapter translated ✓" toast. A failed page stays raw with an error toast with Retry and a "↻ Retry" pill that re-runs it. A missing or bad key gets its own clear toast.
  Why now: Now that the full reading flow works, this adds the feedback and safety net around it. The reader is never left wondering, or stuck with a broken page.
  PRD ref: `prd.md > Loading Feedback`, `prd.md > When Translation Fails`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Components` (Toasts, Background Worker — chime, Overlay Renderer — failed state), `spec.md > Important Failure Modes`, `spec.md > Look and Feel` (Toasts)
  Build: Add `lib/toast.ts` (pill toasts with a uniform border, glow ring, gradient check badge; red ring and "!" for errors) and the offscreen page with the Web Audio chime. Track `chimed` and `toastedChapters`. Add the failed-page state with toast Retry and the Retry pill, and the bad-key and no-key messages. Handle the 60-second timeout and the `refusal`/`max_tokens` stop reasons as failures. No-bubble pages draw nothing and show no error.
  Verify (mechanical): `npm run build` passes. With Playwright: the first page shows the success toast and the offscreen chime is triggered; a second page shows no toast; the next chapter shows one chapter toast. Block `api.anthropic.com` and confirm the page stays raw with the error toast and the pill, then unblock, click Retry, and confirm it translates. Try a bad key and confirm the key toast appears.
  Learner check: Switch on and listen for the chime on the first page. Then turn off your Wi-Fi, scroll to a new page, and see the error and the Retry pill. Turn Wi-Fi back on and click Retry.
  Commit: `Add chime, toasts, and retry for failed pages`

- [x] **5. Make it yours: the full popup, opacity, preferences, and Spanish and French**
  Becomes usable: The poppy, themed popup with the Bangers gradient wordmark, sliding toggles, and light/dark that follows your system. The opacity slider changes translated bubbles live. Chime and Toasts switches work. Picking Spanish or French retranslates the current chapter (visible page first), while later chapters use the new language.
  Why now: These are settings on top of a working core. Doing them after the kernel and the reading flow means they can't hide a core problem. Adding languages here gives the demo its three-language moment.
  PRD ref: `prd.md > Settings`, `prd.md > Changing Language Mid-Chapter`, `prd.md > Look and Feel`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Components` (Popup, Language Switch Handling, Overlay Renderer — opacity), `spec.md > Look and Feel`, `spec.md > Data Model` (Settings)
  Build: Finish the popup in `entrypoints/popup/` with the theme tokens, gradient accent, Bangers wordmark, and all controls. Store settings in `chrome.storage.local` and have page helpers listen for live changes. Implement current-chapter retranslation on a language change. Make sure no component has a one-sided border.
  Verify (mechanical): `npm run build` passes. With Playwright: screenshot the popup in light and dark; moving the opacity slider changes `--inkswap-opacity` on existing labels; turning off Chime/Toasts suppresses them; switching to Spanish retranslates the current chapter's pages and labels are in Spanish; settings survive a browser restart.
  Learner check: Open the popup in your system's dark mode and light mode and say whether it feels like InkSwap. Drag the opacity slider while looking at a translated page. Switch to French mid-chapter and watch the page retranslate.
  Commit: `Add full popup, live opacity, preferences, and Spanish and French`

- [ ] **6. Works on the second site, and a stranger can try it**
  Becomes usable: The full journey works on Shonen Jump+ as well as MangaDex, using the capture method found in slice 1. The README explains what InkSwap is, the "load unpacked" steps, and bring-your-own-key, and the extension has its icons.
  Why now: The spec commits to one or two real sites. Hardening the second site after the core is finished means site-specific fixes don't slow the kernel down. The README makes it ready for `6-ship`.
  PRD ref: `prd.md > What We're Building` (tested on one or two real raw manga sites), `prd.md > The Core Journey`
  Spec ref: `spec.md > Components` (Page Capture), `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Important Failure Modes` (a site blocks reading its images)
  Build: Run the full journey on Shonen Jump+ and fix site-specific issues (e.g., screenshot-crop timing, finding the viewer's drawing surface). Add icons and `README.md`. If Shonen Jump+ can't be made to work, record it under Revisions and demo on MangaDex only, as the spec allows.
  Verify (mechanical): `npm run build` passes. The Playwright script runs the core journey on both sites and screenshots translated pages from each. Follow the README's load-unpacked steps from a clean `.output/chrome-mv3` build and confirm the extension loads.
  Learner check: Follow the README yourself as if you'd never seen InkSwap: build, load unpacked, paste your key, and read a few pages on Shonen Jump+.
  Commit: `Support Shonen Jump+ and add README`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after slice 2: you read a real translated page, and your prompt revisions and reactions shape the rest of the build
  Outcome: translations read naturally (tested on MangaDex, Shonen Jump+, and an Indonesian page). Placement was the problem; your feedback (vertical-letter wrapping, labels too big/off their bubbles, a bubble pushed off-screen) led to the one-to-one numbered-bubble approach, which you confirmed works on your Indonesian page.
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence:
Route and stops:
Edit outcome:
Reflection:
Activity mode:

## Revisions

- Added `<all_urls>` to host permissions — Chrome only allows tab screenshots (`captureVisibleTab`) with `<all_urls>` or a click-granted `activeTab`, and `activeTab` is lost on every Shonen Jump+ chapter navigation, which would break "stays on across chapters." Chrome will show a broader install warning.
- Capture methods confirmed: MangaDex shows each page as an `<img>` with a same-origin `blob:` URL (images from `*.mangadex.network`), read directly. Shonen Jump+ draws pages on protected canvases (`cdn-scissors.gigaviewer.com`) in a sideways two-page viewer, so it uses the screenshot crop, as the spec predicted.
- MangaDex's default reader shows one page at a time and swaps the image, so the Page Finder treats an `<img>` whose picture changes as a new page.
- WXT is v0.21.4 (spec said 0.20.x, check at build start); TypeScript 7, Vitest 5, Playwright added as a dev tool for `scripts/try-extension.mjs`.
- **Bubble placement (slice 2):** Claude's own bubble boxes were too far off to place labels one-to-one (some landed a whole bubble away). InkSwap now finds the bubbles itself — each bubble's inside is a closed white shape with the letters as holes (`lib/bubbles.ts`, unit-tested) — and sends Claude two images: the clean page to read, and a copy with the found bubbles shaded and numbered. Claude says which numbered bubble each line belongs to, and the label is painted in that bubble's exact shape, with the text in the widest rectangle inside it. Touching bubbles found as one shape are split between their lines. Lines outside any found bubble (e.g. narration on artwork) fall back to Claude's box, snapped to a white area if there is one (`lib/snap.ts`) and widened if it's a thin vertical column. The learner asked for this approach after testing.
- Claude now gives boxes in the image's own pixels (asking for 0–1000 directly gave mixed scales); code converts them to the 0–1000 page scale the rest of the system uses. Pages are padded to a white square before sending — measured to place boxes more accurately than the bare page or higher effort.
- Cost per page measured at ~1.2–2.5¢ (two images now; MangaDex pages are full resolution), 5–7 s; the spec estimated ~1¢.
- The "which bubble number" instruction lives in the request the code builds (`lib/translate.ts`), not in the learner's prompt, which stays purely about how to translate.
- Refusal fallback not turned on: for Sonnet 5.5 it only retries cyber and frontier-LLM declines, which manga translation won't hit. A refusal is a failed page with Retry.
- Effort stays `medium`: `high` placed boxes no better in a side-by-side test.
- Learner decisions at the slice 2 checkpoint: floating narration (text on the artwork, not in a bubble) uses Claude's rough box and may sit off its text; accepted as a known limit for the PoC. Chapter titles may be translated (keep as is).
- Slice 3 check (`scripts/check-reading.mjs`, 11/11): whole 14-page MangaDex chapter translated with a peak of 2 calls in flight; turning past a chapter's last page (no reload) kept translating two more chapters; right-click action switches on and the popup reads "on"; switching off stops new calls; a second tab stayed untouched. The Playwright scripts now share `scripts/harness.mjs`.
- Pages waiting for a call slot are dropped (no call, no error) if the tab is switched off before their turn. Pages the reader already turned past still get translated if they were queued; cancelling those is left for later (it only matters when flipping faster than Claude answers).
- MangaDex's default reader shows one page at a time, so "labels already drawn stay" after switching off applies to the page on screen; turning to another page shows it raw.
- Slice 4 check (`scripts/check-feedback.mjs`, 14/14, run with `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` so Playwright can block the background worker's calls): first page → "Page translated" + one chime from the offscreen page; second page → nothing; each later chapter → one "Chapter translated"; Claude unreachable → raw page, error toast with Retry, "↻ Retry" pill; bad key and no key → their own toasts; pill retry with a good key translates.
- The background worker decides the chime and toasts (it holds the tab state), so `toastedChapters` lives with the tab state in session storage rather than in page-helper memory — it survives Shonen Jump+'s full page reload between episodes.
- The chime and toast switches are stored now (`prefs` in `chrome.storage.local`, both on by default) and respected; their popup controls come in slice 5.
- Error toasts stay 6 s instead of 3 s, so their Retry button can be reached. On a page that starts at the top of the screen, the error toast briefly covers the "↻ Retry" pill; the toast has its own Retry.
- The 60-second limit covers the whole call, the SDK's one retry included.
- Learner request (during slice 4): bubbles already in the target language are left alone. The JSON has a new `inTargetLanguage` flag, decided before the text is written out; those bubbles get no label and keep their part of a shared shape so a neighbour's label can't cover them. Tested: an English MangaDex chapter page → 16 lines flagged, 0 labels; the Japanese test page unchanged (11 labels). Claude still has to see the page to know, so the call is still made; skipping the original text for those bubbles cut that page's output from 1,482 to 980 tokens.
- Learner decision: no chapter-level "already in English" skip. A chapter can mix languages page to page, so stopping after a few English pages (and saying the chapter is already translated) could leave later raw pages untranslated and mislead the reader. Every page is still sent; bubbles already in the target language are simply left alone.
- Slice 5 check (`scripts/check-settings.mjs`, 6/6): popup screenshots in light and dark; the opacity slider changes labels already on the page live; Spanish retranslates the current chapter and the next chapter is Spanish too; with Chime and Toasts off, switching on again translates with no chime or toast; settings and key survive a browser restart.
- Popup design: the "On for this tab" control is drawn as a speech bubble (filled with the gradient when on); the language is a three-way switch with native names (English · Español · Français); the opacity slider has a tiny bubble preview over Japanese text; rows are separated by spacing, not dividers (a divider would be a one-sided border). On a tab that isn't MangaDex or Shonen Jump+, the toggle is disabled and says "Open a chapter on MangaDex or Shonen Jump+", since InkSwap only runs there.
- The language is saved as a preference (for new tabs) and applied to the current tab if it's on. A language change bumps a counter so answers still arriving in the old language are ignored.
- Bangers is bundled in `public/fonts/` with its OFL license, next to Shantell Sans.
- Learner feedback on the popup ("too basic, doesn't scream comic"): restyled as a comic page — Shantell Sans (the bubble font) for all popup text instead of the system font, Bangers for the on/off headline, the opacity value and the Save button; thick uniform ink outlines and hard offset "pop" shadows on every control (pressing sinks it into its shadow); the on/off control is an inked speech bubble with an inked tail; the chosen language tilts and pops; an inked, gradient-filling slider; halftone dots behind the header. In dark mode the ink turns light and the pop shadows magenta, since black ink would vanish. The popup's outer corners are drawn by Chrome itself (rounded on macOS), so they can't be styled from the extension.
