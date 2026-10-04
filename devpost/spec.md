---
doc: spec
status: approved
---

# InkSwap — Technical Spec

## How This Works, In Plain Language

InkSwap is a **Chrome extension**. An extension is a small app that lives inside Chrome and can add things on top of any website. It has four pieces:

1. **The popup** is the small panel that opens when you click the InkSwap icon. It holds the on/off toggle for the current tab, the language picker, the opacity slider, the chime and toast switches, and a box where you paste your Claude API key.
2. **The background worker** is InkSwap's "brain." It runs behind the scenes, remembers which tabs are switched on, adds "Translate this page" to the right-click menu, and is the only piece that talks to Claude.
3. **The page helper** (a *content script*) is code that InkSwap places inside the manga site's page. It finds the manga page images and notices when one scrolls into view. It draws everything you see on the page: loading indicators, translated bubbles, toasts, and the Retry pill.
4. **Claude Sonnet 5.5** is Anthropic's AI model, reached over the internet with your own API key. InkSwap gives it one manga page image and asks: *"find every speech bubble, tell me where it is, and translate it by meaning into English."* It answers with a list of boxes and translations.

When a page scrolls into view on a tab that's switched on, the page helper gets that page's picture and passes it to the background worker. The worker sends it to Claude, and Claude replies with bubble positions and natural translations. The page helper then covers each bubble with a fitted, hand-lettered label.

**Why this shape:**
- **One Claude call per page, no separate text-recognition and translation services.** Claude sees the whole page (who's talking, the scene, the art), and that context is what makes "I live *in* Lagos" instead of "I live *at* Lagos" possible. It also means one service, one key, and one failure point.
- **No server of our own.** Each reader pastes their own key, so the public GitHub repo never contains a secret, and anyone can try InkSwap without spending your credits.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

1. **You open a raw chapter.** The page helper loads on the manga site and asks the background worker whether this tab is on. It isn't, so nothing changes. (`prd.md > States and Boundaries` → Off.)
2. **You switch it on**, either with the popup toggle or the right-click "Translate this page." Either way, the background worker records "tab #N is on, language English" and tells that tab's page helper to start. The popup shows "on" because it reads the same record.
3. **The page helper finds the manga pages.** It looks for large images or drawing surfaces in the reader area and watches them scroll. (On MangaDex it can also pick up pages slightly before they come into view.)
4. **A page comes into view.** The page helper puts a **loading indicator on the page**. It can't put indicators on each bubble yet, because it doesn't know where the bubbles are until Claude answers. See `Decisions and Open Issues`. Then it **gets the page's picture**, either by reading the image directly or, if the site blocks that, by having the background worker screenshot the visible tab and crop it to the page.
5. **The background worker asks Claude.** It sends the picture, your translation prompt, and the target language, and asks for a strict JSON answer listing each bubble's box, original text, translation, and whether it was readable.
6. **Claude answers.** The page helper removes the loading indicator and draws a label over each readable bubble:
   - The label is white at 0.95 opacity, uses the hand-lettered font, and its text is shrunk until it fits the box.
   - Unreadable bubbles stay raw.
7. **The first page after switching on** triggers the chime and a toast. When the **first page of a new chapter** finishes, there's one toast and no chime.
8. **You go to the next chapter in the same tab.** The background worker still has "tab #N is on," so the page helper starts again on its own, and the chapter toast fires once.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Browser | **Chrome** (Manifest V3) | Learner's choice. Manifest V3 is Chrome's current extension format. |
| Language | **TypeScript** | Learner works with it actively. |
| Extension framework | **WXT** (v0.20.x, check the latest at build start) — https://wxt.dev | Learner accepted the recommendation. It generates the manifest, wires up the popup, background, and page helper, and live-reloads during development. The tradeoff is one more tool to learn, though it's a thin one. |
| AI model | **Claude Sonnet 5.5** (`claude-sonnet-5-5`) | Learner's choice: "I do not want a lot of AI costs while still giving good enough translations." It costs about half as much as Opus 5.5. |
| AI SDK | **`@anthropic-ai/sdk`** (TypeScript) — https://github.com/anthropics/anthropic-sdk-typescript | Anthropic's official library. |
| Response checking | **`zod`** — https://zod.dev | Defines the exact JSON shape Claude must return, so the SDK checks it for us. |
| Tests | **Vitest** — https://vitest.dev | Small tests for the pure helper code only, like box math and text fitting. The rest is checked by hand against the PRD criteria. |
| Package manager | **npm** | Default, nothing extra to install. |

**Not yet verified, check at the start of the build:**
- The current WXT version and how it sets up the background worker and an offscreen page (needed for the chime).
- Whether the SDK runs inside Chrome's background worker with `dangerouslyAllowBrowser: true`.
- How each test site hands its page images to the browser. See the Page Capture component below.

## Where It Runs and How Someone Tries It

- **Runtime:** Chrome on your laptop. There's no server and no deployment.
- **Requirements:** Node.js 20 or newer, Chrome, and a Claude API key from https://console.anthropic.com. The key is pasted into the InkSwap popup and never goes in code or `.env`.
- **Develop:** `npm install`, then `npm run dev`. WXT opens a Chrome window with InkSwap already loaded and reloads it as code changes.
- **Try it like a stranger would:**
  1. Run `npm run build`.
  2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `.output/chrome-mv3`.
  3. Click the InkSwap icon, paste your key, and switch it on for a raw chapter.
- **Demo recording (required):** open a raw chapter on MangaDex and/or Shonen Jump+ and switch InkSwap on with the right-click menu. Show the loading indicator, the translated page landing with the chime and toast, and a scroll to the next page. Then switch the language to Spanish to show the chapter retranslating. Show only a few pages of any official chapter.
  - **Video:** https://youtu.be/qG8Plg_ScVc (public on YouTube, 1:43)
- **Public GitHub repo (required):** the repo holds the code and a README with the "load unpacked" steps. Keys are never committed, and `.gitignore` already excludes `.env*` and the learner profile.
  - **Repo:** https://github.com/vermilion4/ink-swap (public)
- **Deployment:** none. Publishing to the Chrome Web Store is out of scope.

## Look and Feel
Carried from `prd.md > Look and Feel` and `scope.md > Inspiration & Identity`.

- **Theme:** popup and toasts follow the system light/dark setting through CSS `prefers-color-scheme`.
  - **Dark (Crunchyroll-inspired):** near-black backgrounds `#0f0d12` and `#18151d`, panels `#221e29`, text `#efeaf3`.
  - **Light:** `#f6f3f8` and `#ffffff`, text `#1d1a22`.
- **Accent:** a gradient from **magenta `#e055c4`** to **mid-tone purple `#b183f0`**, used for the logo, active toggles, loading spinners, and the toast's check badge. In light mode it's slightly deeper, `#c13fa8` to `#9b5de5`, so it stays readable. No orange.
- **Fonts**, bundled with the extension (both under the SIL Open Font License, free to bundle):
  - **Bubble text:** **Shantell Sans**, which looks hand-lettered and still reads well at small sizes. It covers the accents Spanish and French need. https://fonts.google.com/specimen/Shantell+Sans
  - **"InkSwap" wordmark:** **Bangers**, a punchy comic-cover style. https://fonts.google.com/specimen/Bangers
  - The popup's body text uses the system font.
- **Bubble overlay:** white fill at the chosen opacity (0.95 by default), rounded to roughly follow the bubble, dark ink-colored text, centered, auto-sized to fit. It should look typeset, never pasted on.
- **Toasts:** pill shape with a **uniform** border all the way around, a soft glow ring, and a round gradient check badge. Errors get a red ring and a "!" badge.
- **Hard rule:** never color only one side of a border on any component.
- **Energy:** the popup should feel poppy and interactive, not like a settings form. Toggles slide, the opacity slider updates bubbles live, and the wordmark has the gradient.
- **Copy tone:** short and friendly. "Page translated ✓", "Chapter 13 translated", "Couldn't translate this page. Retry?"

## Components

### Popup
Shows and edits settings and the current tab's on/off state. On open, it asks the background worker for this tab's state and reads settings from storage.

It contains:
- The **InkSwap wordmark**
- The **"On for this tab"** toggle
- The **Language** picker: English in phase one, then Spanish and French
- The **Opacity** slider: 0.5–1.0, default 0.95
- **Chime** and **Toasts** switches
- A **Claude API key** field, masked, with a "Saved ✓" confirmation
- A **Clear saved translations** button showing how many pages are saved

With no key saved, the toggle is disabled and shows the hint "Paste your Claude API key to start."

PRD refs: `prd.md > Switching On for a Tab`, `prd.md > Settings`, `prd.md > Turning Off`.

### Background Worker
- **Tab state:** tracks which tabs are on and in which language (see Data Model). It clears a tab's entry when the tab closes.
- **Right-click menu:** adds "Translate this page" and switches the tab on, the same as the toggle.
- **Translate requests:** receives `{image, language}` from a page helper, calls the Translator, and returns the bubbles. It runs at most **2 Claude calls at once** per tab to stay within rate limits.
- **Screenshot capture:** when asked, screenshots the visible tab and returns it to the page helper.
- **Chime:** plays the chime through an offscreen page. Chrome blocks pages from playing sound unless the user clicked on them first, and an offscreen page avoids that.

PRD refs: `prd.md > Switching On for a Tab`, `prd.md > Staying On Across Chapters`, `prd.md > Loading Feedback`.

### Translator
One function: `translatePage(imageBase64, mediaType, language, apiKey)` → a list of bubbles. It calls Claude using the translation prompt and checks the result against the zod schema. See `External Services and Dependencies` for the exact call. Lives in `lib/translate.ts`.

PRD ref: `prd.md > Bubble Translation and Overlay`.

### Translation Prompt
The instructions telling Claude *how* to translate:
- by meaning, not word-for-word
- natural for a fluent reader of the target language
- concise enough to fit the bubble
- keep the speaker's tone
- mark unreadable bubbles
- skip sound effects and text outside bubbles

**The learner writes the first draft during the build**, at the translation step, while looking at a real raw page and before seeing any agent version. Then it's tested on real pages and sharpened. Lives in `lib/prompt.ts`.

PRD ref: `prd.md > Bubble Translation and Overlay`. This also serves the learner's prompting goal (see `Decisions and Open Issues`).

### Page Finder
Part of the page helper. It finds manga page elements in the reader area: `<img>` or `<canvas>` elements at least about 300px wide. It watches them with an `IntersectionObserver`, which tells the code when an element scrolls into view, so it can trigger a page's translation when the page comes into view. It also notices when the page's address changes, so it treats single-page-app chapter changes as a new chapter. MangaDex changes chapters without a full page reload. When the tab is switched off, it stops watching. Labels already drawn stay put, and no new pages are sent.

PRD refs: `prd.md > Bubble Translation and Overlay`, `prd.md > Staying On Across Chapters`, `prd.md > Turning Off`.

### Page Capture
Gets a page's picture as a JPEG, scaled so its long edge is at most 1568px, which keeps Claude's cost and wait down. It tries these in order:
1. **Direct image:** download the `<img>` source through the background worker. The worker can do this because of the extension's host permissions.
2. **Drawing surface:** for a `<canvas>`, read its pixels. This works only if the site allows it.
3. **Screenshot fallback:** have the background worker capture the visible tab and crop it to the page's on-screen box. This works on any site, but only for pages fully on screen, and it can't translate pages ahead.

**Expected per site (verify in the first build step):**
- MangaDex: method 1 or 2.
- Shonen Jump+: likely method 3, because its viewer scrambles page images into tiles and reassembles them on a drawing surface.

PRD ref: `prd.md > Bubble Translation and Overlay`.

### Overlay Renderer
Draws InkSwap's on-page layer inside a **shadow root**, a sealed-off area so the manga site's styles can't distort InkSwap's and vice versa. The layer sits exactly over each page element and repositions when the page resizes or reflows.
- **Loading state:** a gradient spinner over the page while it translates.
- **Translated state:** one label per readable bubble, painted in the bubble's exact shape when InkSwap found it (see the checklist's Revisions), otherwise a padded rounded label over Claude's box. Boxes (0–1000 page scale) are converted to on-screen positions. The font size is reduced step by step until the text fits.
- **Opacity:** a single CSS variable `--inkswap-opacity`, updated live when the setting changes.
- **Failed state:** the page stays raw, with a "↻ Retry" pill in its top-right corner.

PRD refs: `prd.md > Bubble Translation and Overlay`, `prd.md > Loading Feedback`, `prd.md > When Translation Fails`, `prd.md > Settings`.

### Translation Cache
Added at the final review (`prd.md > Saved Translations`). Lives in `lib/fingerprint.ts` (pure, unit-tested) and `lib/cache.ts`, used by the background worker.
- **Fingerprint:** the captured page is shrunk to a small grayscale grid and turned into a 256-bit difference hash, plus the page's shape (width/height). The same page captured again (a new MangaDex address, a re-taken Shonen Jump+ screenshot) gives the same or a nearly identical fingerprint; different pages differ in many bits.
- **Lookup:** before calling Claude, the background worker looks for a saved page with a nearly identical fingerprint (a few differing bits at most), the same target language, and the same version (a hash of the translation prompt and model, so improving the prompt translates fresh). A hit returns the saved bubbles at once.
- **Save:** after a successful translation, unless Claude read text but returned no translation for it (the "returned nothing" failure, which shouldn't be remembered).
- **Limit:** most recently used ~2,000 pages; the oldest are dropped. `unlimitedStorage` lets this exceed Chrome's default 10 MB.
- **Clear:** the popup's "Clear saved translations" button, which shows how many pages are saved.


Pill toasts at the top center of the page, inside the shadow root. They disappear after about 3 seconds. The error toast has a **Retry** button. Toasts respect the "Toasts" setting.
- **First page after switching on:** "Page translated ✓", plus the chime if enabled.
- **First page of each later chapter:** "Chapter translated ✓", with no chime.
- **Never one toast per page.**

PRD ref: `prd.md > Loading Feedback`.

### Language Switch Handling
When the language changes while a tab is on, the page helper retranslates every page in the **current chapter**. It does the visible page first, then the rest in order, showing each page's loading state. Earlier chapters aren't on screen anymore, so they're left alone, and later chapters use the new language.

PRD ref: `prd.md > Changing Language Mid-Chapter`.

## Data Model

| Data | Where it lives | How it changes | When you leave and come back |
|---|---|---|---|
| Settings: language, opacity, chime on/off, toasts on/off | `chrome.storage.local` (the extension's sticky note on your computer) | The popup writes it. Page helpers listen for changes and update live. | Remembered between sessions (per the PRD's assumption). |
| Claude API key | `chrome.storage.local` | Pasted in the popup. Only the background worker reads it. | Remembered until you clear it. Never synced, never in code. |
| Tab on/off state: `{ [tabId]: { on, language } }` | `chrome.storage.session` (kept while Chrome is open, survives the background worker restarting) | Toggle or right-click sets it. Closing the tab clears it. | It lasts as long as the tab and survives chapter changes in that tab. Closing Chrome clears it. |
| Page status and bubbles: `{pageId → status, bubbles, language}` | In memory in the page helper | Set as pages translate. | Gone on a full page reload; the Translation Cache brings saved pages back. |
| Saved translations: `{ fingerprint, language, version, bubbles (with shapes), lastUsed }` per page, plus a small index | `chrome.storage.local` (`unlimitedStorage`), read and written only by the background worker | Saved after each successful translation; looked up before every Claude call; "Clear saved translations" empties it. | Remembered between sessions. Most recently used ~2,000 pages kept. No page images are stored. |
| Chime and toast flags: `chimed` (per tab), `toastedChapters` (set of chapter URLs) | `chimed` with the tab state; `toastedChapters` in page-helper memory | Set once each fires. | Reset when the tab is switched off and on again. |

**Bubble shape** (what Claude returns, enforced by zod):

```ts
{ bubbles: Array<{
    box: { x: number; y: number; w: number; h: number }; // Claude answers in image pixels; stored on a 0–1000 page scale
    bubble: number | null; // which numbered found bubble it sits in (null: not in one)
    source: string;        // original text as read
    translation: string;   // meaning-first, in the target language
    readable: boolean;     // false → leave this bubble raw
}> }
```

## File Structure

```
build-with-ai/
├── entrypoints/                 # WXT turns each of these into a part of the extension
│   ├── background.ts            # Background worker: tab state, right-click menu, Claude calls, screenshots, chime
│   ├── content/
│   │   └── index.ts             # Page helper: Page Finder + Overlay Renderer + Toasts, wired together
│   ├── popup/
│   │   ├── index.html           # Popup markup
│   │   ├── main.ts              # Popup logic: toggle, settings, key field
│   │   └── style.css            # Popup look: theme tokens, gradient accent
│   └── offscreen/
│       ├── index.html           # Hidden page that plays the chime
│       └── main.ts              # Plays a short two-note chime (Web Audio, no sound file)
├── lib/
│   ├── translate.ts             # Translator: the Claude call + zod schema
│   ├── prompt.ts                # Translation Prompt, first draft written by the learner
│   ├── capture.ts               # Page Capture: direct image → canvas → screenshot crop
│   ├── finder.ts                # Page Finder: find page images, watch scrolling, detect chapter change
│   ├── overlay.ts               # Overlay Renderer: spinner, bubble labels, text fitting, retry pill
│   ├── toast.ts                 # Toasts
│   ├── settings.ts              # Read/write settings, key, and tab state in chrome.storage
│   ├── messages.ts              # The message types the popup, background, and page helper send each other
│   └── geometry.ts              # Pure math: 0–1000 boxes → on-screen pixels, padding (unit-tested)
├── assets/
│   └── overlay.css              # Styles inside the shadow root: bubble labels, spinner, toasts, retry pill
├── public/
│   ├── fonts/                   # ShantellSans.woff2, Bangers.woff2 (bundled, OFL)
│   └── icon/                    # Extension icons (16/32/48/128)
├── tests/
│   └── geometry.test.ts         # Vitest: box math and text-fit sizing
├── wxt.config.ts                # Manifest: name, permissions, host permissions
├── package.json
├── tsconfig.json
├── README.md                    # What InkSwap is + "load unpacked" steps + bring-your-own-key note
└── devpost/                     # Planning docs (Devpost learning workspace)
```

**Permissions** (in `wxt.config.ts`):
- `storage`, `contextMenus`, `activeTab`, `tabs`, `offscreen`
- **Host permissions:**
  - `https://api.anthropic.com/*`
  - `https://mangadex.org/*` and MangaDex's image hosts
  - `https://shonenjumpplus.com/*` and its image CDN
- The exact image-host domains are confirmed in the first build step.

## External Services and Dependencies

### Claude API (Anthropic)
- **Docs:**
  - Messages: https://docs.claude.com/en/api/messages
  - Vision: https://docs.claude.com/en/docs/build-with-claude/vision
  - Structured outputs: https://docs.claude.com/en/docs/build-with-claude/structured-outputs
- **Auth:** the reader's API key, read from `chrome.storage.local` by the background worker. The client is created with `dangerouslyAllowBrowser: true`. This is acceptable here because the key belongs to the person running the extension; it's never shipped in code.
- **Call** (one per page, using the TypeScript SDK):
  ```ts
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const res = await client.messages.parse({
    model: "claude-sonnet-5-5",
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(BubbleListSchema) },
    system: TRANSLATION_PROMPT,                       // lib/prompt.ts
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
      { type: "text", text: `Target language: ${languageName}` },
    ]}],
  });
  // Check res.stop_reason first: "refusal" or "max_tokens" → treat as a failed page.
  // res.parsed_output → { bubbles: [...] }, or null if parsing failed → failed page.
  ```
- **Effort:** starts at `medium`. If the timing or quality check in the build shows a problem, we try `low` (faster and cheaper) or `high` (better quality).
- **Refusal fallback:** the Claude API has a server-side fallback option for Sonnet 5.5 that retries a refused request on another model (beta). Whether to turn it on is decided at the translation step. Either way, a refusal shows up as a failed page with Retry.
- **Cost:** Sonnet 5.5 costs $2 per million input tokens and $10 per million output tokens. A 1568px page is roughly 2,000–3,000 input tokens. With the prompt and the JSON answer, that's an estimated **~1¢ per page, or ~40¢ for a 40-page chapter**. These are estimates, and real numbers are measured in the build.
- **Rate limits:** depend on the reader's account tier. InkSwap runs at most 2 calls at a time per tab.

### Fonts
Shantell Sans and Bangers, from Google Fonts, under the SIL Open Font License. They're downloaded once and bundled in `public/fonts/`, so nothing loads from the web at runtime.

## Important Failure Modes

- **Bubble boxes are slightly off** (the AI's positions are imprecise): labels get a little padding and rounded corners. If the build test shows real misalignment, we add a **snap step** that grows each box to the edges of the white bubble area on the image. If that isn't enough, it's raised before the demo.
- **A site blocks reading its images** (Shonen Jump+ scrambling, or a protected drawing surface): fall back to the screenshot crop. If even that fails on a site, it's out for the demo and we use the other site.
- **The Claude call fails** (no internet, bad key, rate limit, refusal, timeout after about 60 seconds): the page stays raw and shows the error toast with Retry and the "↻ Retry" pill (`prd.md > When Translation Fails`).
  - A bad or missing key gets a specific toast: "Check your Claude API key in InkSwap settings."
- **Switched on with no key** (via right-click): toast "Paste your Claude API key in InkSwap settings to start," and nothing is translated.
- **A page with no bubbles:** Claude returns an empty list, so nothing is drawn and there's no error toast (`prd.md > States and Boundaries`).

## What Was Simplified and Why

- **Bring-your-own key in settings** instead of a server holding a shared key. No server to build or host, no secret in the public repo, and testers pay for their own use. A shared-key version would need a small backend with rate limiting and abuse protection.
- **A page-level loading spinner** instead of a spinner on each bubble, because bubble positions are unknown until Claude answers. The learner chose this and plans to try per-bubble spinners after the demo. That would mean streaming Claude's answer with the boxes first.
- **One Claude call per page** instead of separate text-recognition and translation services. It's cheaper to build, has one failure point, and gives better context for meaning-first translation.
- **Rounded white labels** instead of true bubble-shaped typesetting. Curved text and matching each bubble's style are deferred (`prd.md > Possible Later Enhancements`).
- **Screenshot fallback** instead of reverse-engineering each site's image scrambling. It works anywhere, at the cost of no translating ahead on those sites.
- **Saved translations keyed by a page fingerprint** instead of by page address: MangaDex page addresses change on every load and Shonen Jump+ is captured by screenshot, so a small perceptual fingerprint of the picture identifies the page. Only translations are stored, never pages.
- **A synthesized chime** (Web Audio) instead of a sound file, so there's no audio asset to source or license.

## Decisions and Open Issues

**Learner decisions:**
- **Claude Sonnet 5.5** over Opus 5.5, to keep AI costs low with good-enough translations.
- **Paste-your-own-key in settings**, so others can test without the learner's key. This replaced an initial `.env` idea, which can't work inside a browser extension anyway.
- **Chrome + TypeScript + WXT.**
- **Retry placement:** a Retry button in the error toast, plus a "↻ Retry" pill in the failed page's top-right corner, so retry stays available after the toast disappears. This resolves the open question in `prd.md > Open Questions`.
- **Test sites:** **MangaDex** (https://mangadex.org) and **Shonen Jump+** (https://shonenjumpplus.com).
- **The learner writes the translation prompt's first draft** during the build.

**Implementation details derived from these (agent's, flagged for review):**
- One-call vision approach with a strict JSON schema, and boxes on a 0–1000 scale.
- The capture order: direct image → canvas → screenshot.
- Shadow-root overlay, an offscreen page for the chime, and at most 2 concurrent calls.
- Shantell Sans and Bangers as the fonts.

**One useful unknown:**
- **Question:** how will InkSwap get page pictures from these two specific sites, especially Shonen Jump+, whose viewer scrambles images?
- **Plan:** the **first build step is a small investigation** on both sites. Inspect how pages are displayed (`<img>`, `<canvas>`, or something else), try each capture method, and save a captured page image that looks correct, unscrambled and complete, for each site.
- **Evidence needed:** a correct captured image from each site, plus a note recording which method each site uses.

**The learner's prompting goal:**
- The translation prompt is their practice ground. They draft it at the translation step, it's run on real pages, and they revise it based on what reads wrong.
- The before/after versions are recorded in the learner profile's Learning Moments.

**Loading indicator (learner decision): a page spinner for now.**
- This replaces the per-bubble indicators in `prd.md > Loading Feedback` for the proof of concept, because bubble positions aren't known until Claude answers.
- **Per-bubble spinners are a post-demo stretch** the learner wants to try once a working demo exists:
  - **Stream** Claude's answer and order the JSON as "all boxes first, then all translations."
  - A spinner appears on each bubble as its box arrives.
  - Translations fill in as they land.

**Still open (don't block approval):**
- Whether per-bubble alignment needs the snap step. Decided by the build test.
- Whether to turn on the server-side refusal fallback. Decided at the translation step.
- **Exact image-host domains** for host permissions. Confirmed in the first build step.
- **Content note:** Shonen Jump+ is an official publisher site. InkSwap only overlays for the reader and never saves or shares pages, and the demo should show only a few pages.
