import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { precacheList, precacheVersion, serviceWorkerSource } from './precache';

describe('service workerin tiedostolista (#328)', () => {
  it('ottaa sivun, koodin, woff2-fontit, manifestin ja kuvakkeet', () => {
    const files = [
      'index.html',
      'sw.js',
      'robots.txt',
      'sitemap.xml',
      'esikatselu.png',
      'favicon.ico',
      'manifest.webmanifest',
      'icons/icon-192.png',
      'assets/index-abc.js',
      'assets/index-abc.js.map',
      'assets/index-def.css',
      'assets/vt323-latin-400-normal-x.woff',
      'assets/vt323-latin-400-normal-x.woff2',
      'audio/puhe/bigCatch-1.mp3',
    ];
    expect(precacheList(files)).toEqual([
      'assets/index-abc.js',
      'assets/index-def.css',
      'assets/vt323-latin-400-normal-x.woff2',
      'favicon.ico',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
    ]);
  });

  it('muuntaa Windowsin polut', () => {
    expect(precacheList(['icons\\icon-192.png'])).toEqual(['icons/icon-192.png']);
  });

  it('vaihtaa version, kun minkä tahansa tiedoston sisältö muuttuu', () => {
    const a = [
      { name: 'index.html', content: new TextEncoder().encode('<html>1') },
      { name: 'assets/a.js', content: new TextEncoder().encode('x') },
    ];
    const b = [a[1]!, { name: 'index.html', content: new TextEncoder().encode('<html>2') }];
    expect(precacheVersion(a)).toBe(precacheVersion([a[1]!, a[0]!]));
    expect(precacheVersion(a)).not.toBe(precacheVersion(b));
  });

  it('täyttää pohjan versiolla ja tiedostoilla', () => {
    const template = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
    const source = serviceWorkerSource(template, 'abc123', ['index.html', 'assets/a.js']);
    expect(source).toContain('const VERSION = "abc123";');
    expect(source).toContain('const PRECACHE = ["./index.html","./assets/a.js"];');
    expect(source).not.toContain('__LUNKI_');
  });
});
