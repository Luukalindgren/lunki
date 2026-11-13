import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import type { BirdKind } from '../game/birdPose';
import { BIRD_ART } from '../game/birdArt';
import { flies, floats, flyShape, swimShape, wingRoot, wingShape } from './birdShapes';

const KINDS = Object.keys(BIRD_ART) as BirdKind[];
const bounds = (geo: THREE.BufferGeometry) => {
  geo.computeBoundingBox();
  return geo.boundingBox!;
};
const whole = (geo: THREE.BufferGeometry) => {
  const position = geo.getAttribute('position');
  expect(position.count).toBeGreaterThan(300);
  expect(geo.getAttribute('color').count).toBe(position.count);
  expect([...position.array].every(Number.isFinite)).toBe(true);
};

describe('lintujen mallit modernissa ilmeessä (#650)', () => {
  it('jokaisella lajilla on malli samoihin asentoihin kuin pikselikuvissa', () => {
    for (const kind of KINDS) {
      // Laji, jolla on lentokuva, lentää; laji, jolla ei ole, ui aina.
      expect(flies(kind)).toBe(BIRD_ART[kind].fly !== undefined);
      expect(flies(kind) || floats(kind)).toBe(true);
      if (floats(kind)) whole(swimShape(kind));
      if (flies(kind)) {
        whole(flyShape(kind));
        whole(wingShape(kind));
      }
    }
  });

  it('uiva lintu istuu vedessä nokka menosuuntaan', () => {
    for (const kind of KINDS.filter(floats)) {
      const box = bounds(swimShape(kind));
      // Vesiraja on y = 0: vähän ruumiista veden alla, pää selvästi päällä.
      expect(box.min.y).toBeLessThan(0);
      expect(box.min.y).toBeGreaterThan(-0.15);
      expect(box.max.y).toBeGreaterThan(-box.min.y * 2);
      expect(box.max.x).toBeGreaterThan(-box.min.x * 0.8);
      expect(box.max.z).toBeCloseTo(-box.min.z, 3);
    }
    // Joutsen on isoin, poikanen pienin.
    const length = (kind: BirdKind) =>
      bounds(swimShape(kind)).max.x - bounds(swimShape(kind)).min.x;
    expect(length('swan')).toBeGreaterThan(length('drake') * 1.8);
    expect(length('duckling')).toBeLessThan(length('drake') * 0.5);
  });

  it('siipi lähtee tyvestä sivulle ja alapuoli valaistaan kuin yläpuoli', () => {
    for (const kind of KINDS.filter(flies)) {
      const wing = wingShape(kind);
      const box = bounds(wing);
      expect(Math.abs(box.min.z)).toBeLessThan(0.03);
      const span = (box.max.z + wingRoot(kind).z) * 2;
      expect(span).toBeGreaterThan(0.7);
      expect(span).toBeLessThan(2.5);
      for (const geo of [wing, flyShape(kind)]) {
        const normal = geo.getAttribute('normal');
        for (let i = 0; i < normal.count; i++) expect(normal.getY(i)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
