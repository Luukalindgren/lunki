import { describe, expect, it } from 'vitest';
import { PALETTE_HEX } from '../engine/palette';
import { LURE_ART_H, LURE_ART_IDS, LURE_ART_W, LURE_FRAMES, lurePixels } from './lureArt';

const OUTLINE = 0x0b0f14;

describe('vieheiden kuvat', () => {
  it('jokaisella vieheellä ja perholla on samankokoiset animaatiokuvat paletin väreillä', () => {
    const palette = new Set<number>(PALETTE_HEX);
    for (const id of LURE_ART_IDS) {
      for (let f = 0; f < LURE_FRAMES; f++) {
        const px = lurePixels(id, f);
        expect(px.width).toBe(LURE_ART_W);
        expect(px.height).toBe(LURE_ART_H);
        expect(px.data.length).toBe(LURE_ART_W * LURE_ART_H);
        for (const c of px.data) if (c >= 0) expect(palette.has(c)).toBe(true);
        const filled = px.data.filter((c) => c >= 0).length;
        // Viehe täyttää osan kuvasta, ei koko laatikkoa.
        expect(filled / px.data.length).toBeGreaterThan(0.15);
        expect(filled / px.data.length).toBeLessThan(0.8);
        // Reunoilla vain läpinäkyvää tai ääriviivaa.
        for (let i = 0; i < px.width; i++)
          for (const j of [0, px.height - 1])
            expect([-1, OUTLINE]).toContain(px.data[j * px.width + i]);
        for (let j = 0; j < px.height; j++)
          for (const i of [0, px.width - 1])
            expect([-1, OUTLINE]).toContain(px.data[j * px.width + i]);
      }
    }
  });

  it('animaatio liikkuu: peräkkäiset kuvat eroavat', () => {
    for (const id of LURE_ART_IDS) {
      for (let f = 0; f < LURE_FRAMES; f++) {
        const a = lurePixels(id, f).data.join(',');
        const b = lurePixels(id, f + 1).data.join(',');
        expect(a, `${id} ${f}`).not.toBe(b);
      }
    }
  });

  it('vieheet näyttävät erilaisilta', () => {
    const seen = new Set<string>();
    for (const id of LURE_ART_IDS) {
      const key = lurePixels(id, 0).data.join(',');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
