import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Pix, bootLoaderHtml, loaderArt, loaderArtHtml, type LoaderVariant } from './loaderArt';

describe('latausanimaatio', () => {
  it('jokainen vaihtoehto piirtyy ja liikkuu', () => {
    for (const v of ['pike', 'sonar'] as LoaderVariant[]) {
      const html = loaderArt(v);
      expect(html).toContain(`loader-${v}`);
      expect(html).toMatch(/<path fill="#[0-9a-f]{6}" d="M/);
      expect(html).toMatch(/steps\(\d+\)/);
    }
  });

  it('vierekkäiset samanväriset pikselit piirtyvät yhtenä suorakaiteena', () => {
    const a = new Pix(4, 1);
    a.line(0, 0, 2, 0, '#ff0000');
    const b = new Pix(4, 1);
    b.set(3, 0, '#ff0000');
    const html = loaderArtHtml({
      id: 'pike',
      w: 4,
      h: 1,
      bg: '#000000',
      layers: [{ kind: 'frames', frames: [a, b], frameMs: 100 }],
    });
    // Toinen ruutu nauhassa ensimmäisen oikealla puolella (x + 4).
    expect(html).toContain('d="M0 0h3v1h-3zM7 0h1v1h-1z"');
    expect(html).toContain('animation-duration:200ms;animation-timing-function:steps(2)');
  });

  it('sivun latausnäkymä on kaksikielinen ja upotetaan index.html:ään', () => {
    const boot = bootLoaderHtml();
    expect(boot).toContain('id="boot-loader"');
    expect(boot).toContain('data-en="Loading"');
    expect(boot).toContain('lunki.lang');
    const index = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
    expect(index).toContain('<!-- latausnäkymä -->');
  });
});
