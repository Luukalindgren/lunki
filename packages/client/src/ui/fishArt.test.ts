import { SPECIES, SPECIES_IDS } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import {
  MAX_SPRITE_WIDTH,
  MIN_SPRITE_WIDTH,
  fishLengthCm,
  fishPixels,
  fishSpriteWidth,
} from './fishArt';

describe('kalojen kuvat', () => {
  it('pituus painosta on lajille uskottava', () => {
    expect(fishLengthCm('perch', 0.14)).toBeGreaterThan(18);
    expect(fishLengthCm('perch', 0.14)).toBeLessThan(26);
    expect(fishLengthCm('pike', 1.3)).toBeGreaterThan(50);
    expect(fishLengthCm('pike', 1.3)).toBeLessThan(65);
    // Hauki on samanpainoisena paljon ahventa pidempi.
    expect(fishLengthCm('pike', 1)).toBeGreaterThan(fishLengthCm('perch', 1) * 1.15);
  });

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
});
