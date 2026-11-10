import { describe, expect, it } from 'vitest';
import { SPECIES, SPECIES_IDS } from './fish';
import { fishLengthCm } from './length';

describe('kalan pituus', () => {
  it('pituus painosta on lajille uskottava', () => {
    expect(fishLengthCm('perch', 0.14)).toBeGreaterThan(18);
    expect(fishLengthCm('perch', 0.14)).toBeLessThan(26);
    expect(fishLengthCm('pike', 1.3)).toBeGreaterThan(50);
    expect(fishLengthCm('pike', 1.3)).toBeLessThan(65);
    // Hauki on samanpainoisena paljon ahventa pidempi.
    expect(fishLengthCm('pike', 1)).toBeGreaterThan(fishLengthCm('perch', 1) * 1.15);
  });

  it('jokaisella lajilla on kunto ja pituus kasvaa painon mukana', () => {
    for (const id of SPECIES_IDS) {
      const sp = SPECIES[id];
      const small = fishLengthCm(id, sp.minWeight);
      const big = fishLengthCm(id, sp.maxWeight);
      expect(small).toBeGreaterThan(3);
      expect(big).toBeGreaterThan(small);
      expect(big).toBeLessThan(160);
    }
  });
});
