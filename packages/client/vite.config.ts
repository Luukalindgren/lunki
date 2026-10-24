import { defineConfig } from 'vite';

export default defineConfig({
  // Suhteellinen polku, jotta build toimii myös GitHub Pagesin alipolussa.
  base: './',
  build: {
    // three.js on yksin ~500 kB; pilkotaan myöhemmin, jos lataus hidastuu.
    chunkSizeWarningLimit: 800,
  },
  server: {
    open: true,
  },
});
