# InkSwap Privacy Policy

_Last updated: October 22, 2026_

InkSwap is a Chrome extension that translates the text in manga speech bubbles and draws the translation over each bubble. This policy explains what it handles and where that goes.

**In short:** InkSwap has no server and no analytics. The developer never receives any of your data. Page images go only to Anthropic, the company behind Claude, so they can be translated using your own API key.

## What InkSwap sends, and to whom

When you switch InkSwap on for a tab, it sends each manga page you're reading to **Anthropic's Claude API** (`api.anthropic.com`) to be translated. The request contains:

- the page image, plus a copy with the detected speech bubbles numbered
- the language you chose (English, Spanish or French)
- your Claude API key, which Anthropic needs to accept and bill the request

Nothing is sent from tabs where InkSwap is switched off.

Anthropic handles these requests under its own terms and privacy policy: <https://www.anthropic.com/legal/privacy>.

InkSwap also downloads manga page images from the sites you're reading (MangaDex and Shonen Jump+), just as your browser already does to show you the page.

## What InkSwap stores on your computer

All of this stays in your browser's extension storage. None of it is uploaded anywhere.

- **Your Claude API key.** It's read only by InkSwap's background worker, to make translation requests.
- **Your settings:** language, bubble opacity, and whether the chime and toasts are on.
- **Which tabs are switched on.** This is cleared when you close Chrome.
- **Saved translations** of pages you've already read, so rereading them is instant and free. Each one is the translated text, bubble positions, and a small "fingerprint" of the page (a 256-bit summary of its light and dark areas) used to recognise it again. **The page images themselves are never saved.** Up to about 2,000 pages are kept, and the oldest are dropped first.

To delete saved translations, click **Clear saved translations** in the InkSwap popup. Uninstalling InkSwap deletes everything it stored, including your API key.

## What InkSwap doesn't do

- It doesn't collect, sell or share personal information.
- It doesn't track your browsing, and it doesn't read pages other than the manga you switch it on for.
- It has no analytics, ads or third-party trackers.
- It doesn't use your data for anything other than translating the pages you ask it to.

## Changes

If this policy changes, the updated version will be posted here with a new date.

## Contact

Questions or concerns: open an issue at <https://github.com/vermilion4/ink-swap/issues>.
