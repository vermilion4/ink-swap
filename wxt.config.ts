import { loadEnv } from 'vite';
import { defineConfig } from 'wxt';

// INKSWAP_SHARED_KEY=true (in .env or the shell) builds ANTHROPIC_API_KEY into this copy of
// InkSwap, so whoever installs it can translate without a key of their own (e.g. hackathon
// judges). Anyone with the built files can read that key. Off by default: users paste their own.
const env = loadEnv('', '.', ''); // .env files, with shell variables taking priority
const shareKey = /^(1|true|yes|on)$/i.test(env.INKSWAP_SHARED_KEY?.trim() ?? '');
const sharedKey = shareKey ? (env.ANTHROPIC_API_KEY ?? '').trim() : '';
if (shareKey && !sharedKey) throw new Error('INKSWAP_SHARED_KEY is on, but ANTHROPIC_API_KEY is empty');

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({ define: { __INKSWAP_SHARED_KEY__: JSON.stringify(sharedKey) } }),
  manifest: {
    name: 'InkSwap',
    description: 'Translate raw manga in place, bubble by bubble, by meaning.',
    permissions: ['storage', 'unlimitedStorage', 'contextMenus', 'activeTab', 'tabs', 'offscreen', 'scripting'],
    host_permissions: [
      // Required by tabs.captureVisibleTab (screenshot fallback) without a fresh click on every chapter.
      '<all_urls>',
      'https://api.anthropic.com/*',
      // MangaDex: reader + page image hosts
      'https://mangadex.org/*',
      'https://*.mangadex.org/*',
      'https://*.mangadex.network/*',
      // Shonen Jump+: viewer + image CDNs (pages are drawn on canvases, captured by screenshot)
      'https://shonenjumpplus.com/*',
      'https://*.shonenjumpplus.com/*',
      'https://*.gigaviewer.com/*',
    ],
    // The bundled bubble font, loaded by the overlay on the reading sites.
    web_accessible_resources: [
      { resources: ['fonts/*'], matches: ['https://mangadex.org/*', 'https://shonenjumpplus.com/*'] },
    ],
  },
});
