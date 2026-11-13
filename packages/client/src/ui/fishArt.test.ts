import { SPECIES, SPECIES_IDS } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { MAX_SPRITE_WIDTH, MIN_SPRITE_WIDTH, fishPixels, fishSpriteWidth } from './fishArt';

describe('kalojen kuvat', () => {
  it('kuva kasvaa painon mukana ja pysyy rajoissa', () => {
    for (const id of SPECIES_IDS) {
      const sp = SPECIES[id];
      const small = fishSpriteWidth(id, sp.minWeight);
      const median = fishSpriteWidth(id, sp.medianWeight);
      const big = fishSpriteWidth(id, sp.maxWeight);
      expect(small).toBeGreaterThanOrEqual(MIN_SPRITE_WIDTH);
      expect(big).toBeLessThanOrEqual(MAX_SPRITE_WIDTH);
      expect(median).toBeGreaterThanOrEqual(small);
      expect(big).toBeGreaterThan(median);
    }
    // Keskikokoinen hauki näkyy selvästi isompana kuin keskikokoinen ahven.
    expect(fishSpriteWidth('pike', 1.3)).toBeGreaterThan(fishSpriteWidth('perch', 0.14) * 1.5);
  });

  it('piirtää jokaisen lajin eri näköisenä ja reunat tummina', () => {
    const seen = new Set<string>();
    for (const id of SPECIES_IDS) {
      for (const width of [MIN_SPRITE_WIDTH, 48, MAX_SPRITE_WIDTH]) {
        const px = fishPixels(id, width);
        expect(px.width).toBe(width);
        expect(px.data.length).toBe(px.width * px.height);
        const filled = px.data.filter((c) => c >= 0).length;
        // Kala täyttää kunnon osan kuvasta mutta ei koko laatikkoa.
        expect(filled / px.data.length).toBeGreaterThan(0.25);
        expect(filled / px.data.length).toBeLessThan(0.9);
        // Kuvan reunoilla ei ole muuta kuin läpinäkyvää tai ääriviivaa.
        for (let i = 0; i < px.width; i++) {
          for (const j of [0, px.height - 1])
            expect([-1, 0x0b0f14]).toContain(px.data[j * width + i]);
        }
      }
      const colors = [...new Set(fishPixels(id, 64).data)].sort().join(',');
      expect(seen.has(colors)).toBe(false);
      seen.add(colors);
    }
  });

  it('Modernin tarkka kuva on täsmälleen nelinkertainen ja samaa kalaa', () => {
    for (const id of SPECIES_IDS) {
      for (const width of [MIN_SPRITE_WIDTH, 48, MAX_SPRITE_WIDTH]) {
        const base = fishPixels(id, width);
        const fine = fishPixels(id, width, 4);
        // Kuvan paikka sivulla tulee pikselikuvan mitoista: tarkan pitää olla tasan 4×.
        expect(fine.width).toBe(base.width * 4);
        expect(fine.height).toBe(base.height * 4);
        expect(fine.data.length).toBe(fine.width * fine.height);
        const share = (px: { data: ArrayLike<number> }) =>
          Array.from(px.data).filter((c) => c >= 0).length / px.data.length;
        // Sama muoto; ohuempi ääriviiva vie pienestä kuvasta vähemmän tilaa.
        expect(share(fine)).toBeLessThan(share(base) + 0.03);
        expect(share(fine)).toBeGreaterThan(share(base) - 0.2);
        // Samat värit: tarkka kuva ei tuo uusia sävyjä (pienin kuva jättää silmän kiillon pois).
        const colors = new Set([...base.data, ...fishPixels(id, MAX_SPRITE_WIDTH).data]);
        const extra = [...new Set(fine.data)].filter((c) => !colors.has(c));
        expect(extra).toEqual([]);
        for (let i = 0; i < fine.width; i++)
          for (const j of [0, fine.height - 1])
            expect([-1, 0x0b0f14]).toContain(fine.data[j * fine.width + i]);
      }
    }
  });
});
