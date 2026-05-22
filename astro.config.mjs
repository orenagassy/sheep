import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://orenagassy.github.io',
  base: '/sheep',
  output: 'static',
  build: { format: 'directory' },
});
