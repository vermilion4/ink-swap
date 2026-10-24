# InkSwap landing page

A static page: `index.html`, `styles.css`, `main.js` and `assets/`. No build step.

```sh
npm run site   # http://localhost:4173
```

To publish it, upload this folder to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

- The Chrome Web Store and YouTube links are set once, at the top of `main.js`.
- The section headings start in Japanese (`data-ja` on each `.swap` heading) and are re-lettered in English as they scroll into view; the header switch turns that off and on.
- Images and video come from the real extension: the hero video is the Brag video (`brag-output/brag.mp4`, original art), the page stills are from the demo capture (`demo/`).
- Manga pages: ブラックジャックによろしく by 佐藤秀峰 (Shuho Sato), from the author's free data (https://densho810.com/free/), credited on the page as its licence requires.
