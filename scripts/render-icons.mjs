// Renders the extension icons from their SVG sources, so the PNGs always match the SVGs:
//   assets/icon.svg      → public/icon/<size>.png       (the manifest icons; light backgrounds)
//   assets/icon-dark.svg → public/icon-dark/<size>.png  (switched in at runtime on dark backgrounds)
// Usage: node scripts/render-icons.mjs

import { chromium } from 'playwright';
import fs from 'node:fs';

const SIZES = [16, 32, 48, 128];
const SETS = [
  { svg: 'assets/icon.svg', out: 'public/icon' },
  { svg: 'assets/icon-dark.svg', out: 'public/icon-dark' },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { svg, out } of SETS) {
  fs.mkdirSync(out, { recursive: true });
  const source = fs.readFileSync(svg, 'utf8');
  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
    await page.screenshot({ path: `${out}/${size}.png`, omitBackground: true });
  }
  console.log(`${svg} → ${out}/{${SIZES.join(',')}}.png`);
}
await browser.close();
