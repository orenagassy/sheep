import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://sheeps.online',
  output: 'static',
  build: { format: 'directory' },
  integrations: [
    sitemap({
      serialize(item) {
        item.lastmod = '2026-05-30';
        return item;
      },
    }),
  ],
});
