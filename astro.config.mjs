import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://sheeps.online',
  output: 'static',
  build: { format: 'directory' },
});
