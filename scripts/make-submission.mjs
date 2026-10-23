// Builds a folder to hand to hackathon judges: the unpacked extension plus install steps, and a
// zip of both. INKSWAP_SHARED_KEY=true (in .env or the shell) builds your ANTHROPIC_API_KEY in,
// so judges can translate without a key of their own; otherwise they paste their own.
//
// Usage (repo root): npm run submission
//   → submission/InkSwap/ (extension/ + HOW-TO-INSTALL.txt) and submission/InkSwap.zip
//
// The folder and zip hold your key in shared mode: anyone with them can read it. Share them
// privately, and use a key you can revoke.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

const env = loadEnv('', '.', '');
const shared = /^(1|true|yes|on)$/i.test(env.INKSWAP_SHARED_KEY?.trim() ?? '');
const key = (env.ANTHROPIC_API_KEY ?? '').trim();
if (shared && !key) throw new Error('INKSWAP_SHARED_KEY is on, but ANTHROPIC_API_KEY is empty');
console.log(`Building InkSwap with ${shared ? 'YOUR key built in (judges need no key)' : 'no key built in (judges paste their own)'}…`);

// wxt.config.ts reads the same variables, so the build matches the mode printed above.
execFileSync('npx', ['wxt', 'build'], { stdio: 'inherit' });

// Check the build really is in the mode we said, before anything is shared.
const BUILT = '.output/chrome-mv3';
const files = fs.readdirSync(BUILT, { recursive: true }).map((f) => path.join(BUILT, f)).filter((f) => fs.statSync(f).isFile());
const text = files.filter((f) => /\.(js|html|json)$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
if (shared && !text.includes(key)) throw new Error('Shared mode, but the key is not in the build');
if (!shared && /sk-ant-[\w-]{10,}/.test(text)) throw new Error('A Claude API key is in the build, but shared mode is off');

const OUT = 'submission';
const DIR = path.join(OUT, 'InkSwap');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
fs.cpSync(BUILT, path.join(DIR, 'extension'), { recursive: true });

const keySection = shared
  ? `This copy already includes a Claude API key for judging, so there's nothing to set up.
If you'd rather use your own key, paste it in the InkSwap popup and click Save; it replaces
the included one in your browser.`
  : `InkSwap uses your own Claude API key, and you pay Anthropic for what you translate (about
1–3 cents a page in testing).
1. Create a key at https://console.anthropic.com
2. Click the InkSwap icon in the toolbar, paste the key and click Save.
The key is stored only in your browser.`;

fs.writeFileSync(
  path.join(DIR, 'HOW-TO-INSTALL.txt'),
  `InkSwap: install and try it (about 2 minutes)
=============================================

InkSwap is a Chrome extension that translates raw (untranslated) manga where you read it,
bubble by bubble, by meaning instead of word for word.

INSTALL
1. Unzip this folder, if it's zipped.
2. In Chrome, open chrome://extensions
3. Turn on "Developer mode" (top right).
4. Click "Load unpacked" and choose the "extension" folder that sits next to this file.
5. Click the puzzle-piece icon in Chrome's toolbar and pin InkSwap.

YOUR CLAUDE API KEY
${keySection}

TRY IT
1. Open a raw Japanese chapter. These work (all-ages):
   - MangaDex, "Gold Gold Adventure Gold" (one-shot, colour):
     https://mangadex.org/chapter/001ebedc-b4a9-40c6-bae6-09e50b989a36/1
   - MangaDex, "Yasumi Nashi" (one-shot comedy):
     https://mangadex.org/chapter/cfb937a3-1fc7-46db-96f3-905dbbd7b847/1
   - Shonen Jump+ (two-page spreads; turn pages with the left arrow key):
     https://shonenjumpplus.com/episode/10833519556325021799
2. Click the InkSwap icon and switch "Off for this tab" on.
   (Or right-click the page and choose "Translate this page".)
3. Read. Each page takes about 5–10 seconds the first time; a spinner shows while it works,
   and a chime plays when the first page is done. It keeps going as you turn pages and move
   on to the next chapter.

ALSO TRY
- In the popup, switch to Español or Français: the open chapter is translated again.
- Drag "Bubble opacity" to see the original text underneath.
- Reload the chapter: pages you've already translated come back instantly, with no new call.

KNOWN LIMITS
- Tested on MangaDex and Shonen Jump+ only.
- Narration floating on the artwork (outside any bubble) is placed from Claude's estimate, so
  it can be slightly off. Text in speech bubbles and caption boxes is placed exactly.
- Shonen Jump+ only lets InkSwap translate what's on screen, not pages ahead.

Source code: https://github.com/vermilion4/ink-swap
`,
);

fs.rmSync(`${OUT}/InkSwap.zip`, { force: true });
execFileSync('zip', ['-qr', 'InkSwap.zip', 'InkSwap', '-x', '*.DS_Store'], { cwd: OUT, stdio: 'inherit' });
const mb = (fs.statSync(`${OUT}/InkSwap.zip`).size / 1e6).toFixed(1);
console.log(`\nWrote ${DIR}/ and ${OUT}/InkSwap.zip (${mb} MB).`);
if (shared) console.log('⚠ Your API key is inside. Share these privately and revoke the key after judging.');
