import { defineConfig } from 'vite';
import { bootLoaderHtml } from './src/ui/loaderArt';

export default defineConfig({
  // Suhteellinen polku, jotta build toimii myös GitHub Pagesin alipolussa.
  base: './',
  plugins: [
    {
      // Latausnäkymä suoraan sivuun: näkyy, kun pelin koodi vasta latautuu.
      name: 'lunki-boot-loader',
      transformIndexHtml: (html) => html.replace('<!-- latausnäkymä -->', bootLoaderHtml()),
    },
  ],
  build: {
    // three.js on yksin ~500 kB; pilkotaan myöhemmin, jos lataus hidastuu.
    chunkSizeWarningLimit: 800,
  },
  server: {
    open: true,
  },
});
