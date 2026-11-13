import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { bootLoaderHtml } from './src/ui/loaderArt';
import {
  optionalList,
  precacheList,
  precacheVersion,
  serviceWorkerSource,
} from './src/sw/precache';

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
      writeFileSync(
        join(outDir, 'sw.js'),
        serviceWorkerSource(template, version, files, optionalList(all)),
      );
    },
  };
}

/** Buildin kansio modernin ilmeen tiedostoille (ks. `optionalList`). */
const MODERN_DIR = 'modern';
const modernModule = (ids: readonly string[]): boolean =>
  ids.length > 0 && ids.every((id) => id.replaceAll('\\', '/').includes('src/modern/'));

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
    rolldownOptions: {
      output: {
        // Moderni ilme (#650) omaan kansioonsa: service worker ei tallenna sitä
        // asennuksessa, vaan vasta kun pelaaja valitsee ilmeen (src/sw/precache.ts).
        chunkFileNames: (chunk) =>
          modernModule(chunk.moduleIds)
            ? `${MODERN_DIR}/[name]-[hash].js`
            : 'assets/[name]-[hash].js',
        assetFileNames: (asset) =>
          modernModule(asset.originalFileNames) ||
          asset.names.some((n) => n.startsWith('modernLook'))
            ? `${MODERN_DIR}/[name]-[hash][extname]`
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    open: true,
  },
});
