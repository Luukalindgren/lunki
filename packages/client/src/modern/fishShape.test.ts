import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SPECIES_IDS } from '@lunki/shared';
import { fishLook } from '../ui/fishArt';
import { fishShape } from './fishShape';

const bounds = (geo: THREE.BufferGeometry) => {
  geo.computeBoundingBox();
  return geo.boundingBox!;
};

/** Löytyykö mallin kärjistä väri (pieni ero sallitaan sekoituksen takia). */
const hasColor = (geo: THREE.BufferGeometry, hex: number, tolerance = 0.08) => {
  const want = new THREE.Color(hex);
  const c = geo.getAttribute('color');
  for (let i = 0; i < c.count; i++)
    if (
      Math.abs(c.getX(i) - want.r) < tolerance &&
      Math.abs(c.getY(i) - want.g) < tolerance &&
      Math.abs(c.getZ(i) - want.b) < tolerance
    )
      return true;
  return false;
};

describe('kalan malli modernissa ilmeessä (#650)', () => {
  it('tekee jokaisesta lajista ehjän mallin: pituus 1, kuono +x, symmetrinen kyljiltään', () => {
    for (const id of SPECIES_IDS) {
      const geo = fishShape(id);
      const position = geo.getAttribute('position');
      expect(position.count).toBeGreaterThan(2000);
      expect(geo.getAttribute('color').count).toBe(position.count);
      expect(geo.getAttribute('normal').count).toBe(position.count);
      expect([...position.array].every(Number.isFinite)).toBe(true);
      const box = bounds(geo);
      expect(box.max.x).toBeCloseTo(0.5, 3);
      expect(box.min.x).toBeCloseTo(-0.5, 3);
      expect(box.max.z).toBeCloseTo(-box.min.z, 3);
      // Kala on korkeampi kuin paksu.
      expect(box.max.z * 2).toBeLessThan(box.max.y - box.min.y);
    }
  });

  it('ottaa muodon ja värit lajin pikselikuvan tiedoista', () => {
    const perch = fishShape('perch');
    const look = fishLook('perch');
    for (const color of [look.back, look.bellyColor, look.tailColor, look.eye])
      expect(hasColor(perch, color)).toBe(true);
    // Ahvenen raidat ja punaiset vatsaevät.
    expect(hasColor(perch, look.bars!.color, 0.12)).toBe(true);
    expect(hasColor(perch, 0xd23a2a)).toBe(true);
    // Hauki on matalampi ja pitkäkuonoisempi kuin lahna.
    const height = (geo: THREE.BufferGeometry) => bounds(geo).max.y - bounds(geo).min.y;
    expect(height(fishShape('pike'))).toBeLessThan(height(fishShape('bream')));
  });
});
