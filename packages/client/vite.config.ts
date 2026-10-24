import { defineConfig } from 'vite';

export default defineConfig({
  // Suhteellinen polku, jotta build toimii myös GitHub Pagesin alipolussa.
  base: './',
  server: {
    open: true,
  },
});
