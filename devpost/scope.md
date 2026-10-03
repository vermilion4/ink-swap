---
doc: scope
status: approved
---

# Manga Overlay Translator (working title)

A browser extension that translates raw manga as you scroll any manga site, covering each speech bubble with a natural, meaning-first translation in your language.

## The Unique Kernel
Translation by **meaning, not word-for-word**, placed **right on the bubble**. Each bubble reads the way a fluent speaker of your target language would say it ("I live in Lagos," not "I live at Lagos"; "How did you get into my house?" not "How did you get the other way?"), sitting cleanly over the original so the page reads like a properly translated one.

## Who It's For
Manga readers like the learner (and friends) who want to read a series from the raw source. Today they rely on fan translations, which are often word-for-word, grammatically messy, and copied between sites ("20+ translations that are the exact same junk"). The result is that "you love it, you see what's happening with the scenes, but then you read the translations and it just does not make sense."

## The Core Loop
Open a raw manga chapter on any manga website and scroll. As each page comes into view, its speech bubbles are replaced by clean translations in the reader's chosen language. They keep scrolling and reading without leaving the site. They come back because any raw on any site becomes readable.

## Inspiration & Identity
- Feels like a **clean translated page**, not a tool bolted on. The overlay fully covers the original text at a default **0.95 opacity**, so you can just barely tell it's an overlay without being distracted. Readers can adjust it themselves.
- It must **fit the bubble exactly**. If it looks crude, off-putting, or out of place, it fails.
- Learner's broader taste: interactive, "poppy" sites (Apple, Tesla), and Crunchyroll's dark theme (https://www.crunchyroll.com). This mainly matters for any extension UI like the popup or settings.

## Why This Matters to the Learner
"I would be so excited if I could open a manga that's in the source file … and as I'm just scrolling through, you're seeing it in English, overlaid and it's making sense. That would be epic for me." They also don't want to be "conformed to just one website."

## What "Working" Looks Like
In the demo, the learner opens a **real manga website** showing a raw Japanese chapter, with the extension installed, and scrolls. Pages come into view and their speech bubbles show readable translations in place. Switching the language in settings changes them to Spanish or French. **The "oh, that's cool" beat:** the same page that was unreadable Japanese a second ago now reads like a natural, well-written English page.

## The POC Boundary
- A browser extension that works on manga page images without being built for one specific site. It is **tested and demoed on one or two real raw manga sites**.
- Finds the speech bubbles on each manga page image, reads the source text, and translates by meaning, one bubble at a time.
- Draws the translation over each bubble: fully covering it, sized and placed to fit, at a default **0.95 opacity**.
- Translates automatically as pages scroll into view.
- Simple settings: the reader can **adjust overlay opacity** and **pick the target language**.
- Japanese source. **Phase one is English only**, then Spanish and French are added so the demo shows three languages.

## Later
- Proven reliability across many different manga sites and layouts.
- Polished typesetting: manga-style fonts, curved text, matching the text style of each bubble.
- Translating sound effects and text outside bubbles.
- Caching translations so re-reading a chapter is instant and free.
- Source languages beyond Japanese, such as Korean webtoons and Chinese manhua.
- Fully polished settings UI with the dark, Crunchyroll-inspired look.
- More target languages beyond English, Spanish, and French.

## Explicitly Cut
- **Whole-story context** (keeping names and references consistent across chapters). The learner was clear that the goal is a translation that makes sense within each bubble, not story-level memory.
- **The music/sheet-music idea.** The learner chose manga and doesn't yet know enough about music to shape a concept.
- **A standalone manga reader site.** The point is to read on the sites people already use.
