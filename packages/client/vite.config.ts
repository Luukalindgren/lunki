import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { bootLoaderHtml } from './src/ui/loaderArt';
import { precacheList, precacheVersion, serviceWorkerSource } from './src/sw/precache';

/**
 * Service worker buildin juureen (#328): pohja src/sw/sw.js, johon lisätään
 * valmiin buildin tiedostolista ja niiden sisällöstä laskettu versio.
 */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'lunki-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const all = readdirSync(outDir, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => relative(outDir, join(d.parentPath, d.name)));
      const files = precacheList(all);
      const version = precacheVersion(
        files.map((name) => ({ name, content: readFileSync(join(outDir, name)) })),
      );
      const template = readFileSync(new URL('./src/sw/sw.js', import.meta.url), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource(template, version, files));
    },
  };
}

export default defineConfig({
  // Suhteellinen polku, jotta build toimii myös GitHub Pagesin alipolussa.
  base: './',
  plugins: [
    {
      // Latausnäkymä suoraan sivuun: näkyy, kun pelin koodi vasta latautuu.
      name: 'lunki-boot-loader',
      transformIndexHtml: (html) => html.replace('<!-- latausnäkymä -->', bootLoaderHtml()),
    },
    serviceWorker(),
  ],
  build: {
    // three.js on yksin ~500 kB; pilkotaan myöhemmin, jos lataus hidastuu.
    chunkSizeWarningLimit: 800,
  },
  server: {
    open: true,
  },
});
