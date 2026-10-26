import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)));
const html = read('index.html').toString('utf8');
const SITE = 'https://lunkinjarvi.com/';

/** `<meta name|property="key" content="…">` -arvo (sisältö voi olla omalla rivillään). */
function meta(key: string): string | undefined {
  const re = new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="([^"]*)"`);
  return re.exec(html)?.[1];
}

describe('hakukoneet ja esikatselu (#239)', () => {
  it('otsikko alkaa pelin nimellä ja kuvaus on hakutulokseen sopivan mittainen', () => {
    expect(html).toMatch(/<title>Lunkinjärvi – [^<]+<\/title>/);
    const description = meta('description');
    expect(description?.length).toBeGreaterThan(80);
    expect(description?.length).toBeLessThanOrEqual(170);
  });

  it('kanoninen osoite ja Open Graph osoittavat lunkinjarvi.comiin', () => {
    expect(html).toContain(`<link rel="canonical" href="${SITE}" />`);
    expect(meta('og:url')).toBe(SITE);
    expect(meta('og:title')).toMatch(/^Lunkinjärvi/);
    expect(meta('og:description')).toBeTruthy();
    expect(meta('og:locale')).toBe('fi_FI');
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  it('esikatselukuva on olemassa ja ilmoitetun kokoinen', () => {
    const image = meta('og:image');
    expect(image).toBe(`${SITE}esikatselu.png`);
    const png = read(`public/${image!.slice(SITE.length)}`);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    const size = [png.readUInt32BE(16), png.readUInt32BE(20)].map(String);
    expect(size).toEqual([meta('og:image:width'), meta('og:image:height')]);
  });

  it('rakenteinen kuvaus on kelvollista JSON-LD:tä', () => {
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    const data = JSON.parse(json ?? '') as Record<string, unknown>;
    expect(data['@type']).toBe('VideoGame');
    expect(data.name).toBe('Lunkinjärvi');
    expect(data.url).toBe(SITE);
    expect(data.isAccessibleForFree).toBe(true);
  });

  it('robots.txt sallii kaiken ja kertoo sivukartan, jossa on etusivu', () => {
    const robots = read('public/robots.txt').toString('utf8');
    expect(robots).toMatch(/^User-agent: \*\nAllow: \/$/m);
    expect(robots).toContain(`Sitemap: ${SITE}sitemap.xml`);
    const sitemap = read('public/sitemap.xml').toString('utf8');
    expect(sitemap).toContain(`<loc>${SITE}</loc>`);
  });

  it('ilman JavaScriptiä näkyy esittelyteksti', () => {
    expect(html).toMatch(/<noscript>[\s\S]*<h1>Lunkinjärvi<\/h1>[\s\S]*<\/noscript>/);
  });
});
