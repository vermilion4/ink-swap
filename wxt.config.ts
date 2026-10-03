import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'InkSwap',
    description: 'Translate raw manga in place, bubble by bubble, by meaning.',
    permissions: ['storage', 'contextMenus', 'activeTab', 'tabs', 'offscreen'],
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
  },
});
