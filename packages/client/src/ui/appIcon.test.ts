import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const publicDir = (p: string) => fileURLToPath(new URL(`../../public/${p}`, import.meta.url));

/** PNG-tiedoston leveys ja korkeus IHDR-otsakkeesta. */
function pngSize(file: string): [number, number] {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

describe('sovelluskuvake (#240)', () => {
  const manifest = JSON.parse(readFileSync(publicDir('manifest.webmanifest'), 'utf8')) as {
    name: string;
    icons: ManifestIcon[];
  };

  it('manifestin kuvakkeet ovat olemassa ja ilmoitetun kokoisia', () => {
    expect(manifest.name).toBe('Lunkinjärvi');
    for (const icon of manifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(publicDir(icon.src))).toEqual([w, h]);
    }
  });

  it('Androidille on sekä tavallinen että pyöreään rajaukseen sopiva 512 px kuvake', () => {
    const big = manifest.icons.filter((i) => i.sizes === '512x512').map((i) => i.purpose);
    expect(big).toContain('any');
    expect(big).toContain('maskable');
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
  });

  it('iPhonen kuvake on 180 px ja välilehden favicon on olemassa', () => {
    expect(pngSize(publicDir('icons/apple-touch-icon.png'))).toEqual([180, 180]);
    expect(pngSize(publicDir('icons/favicon-32.png'))).toEqual([32, 32]);
    expect(existsSync(publicDir('favicon.ico'))).toBe(true);
  });
});
