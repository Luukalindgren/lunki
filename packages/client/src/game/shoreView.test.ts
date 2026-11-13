import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { softGeometry } from '../modern/soften';
import { deflate, deflateBase } from './shoreView';
import { TUBE_LIFT } from './tubeMesh';

const top = (m: THREE.Mesh) => {
  m.geometry.computeBoundingBox();
  return m.geometry.boundingBox!.max.y;
};

describe('täyttökisan ponttooni (#458)', () => {
  it('lässähtää täytön mukaan, vaikka ilme vaihtaa osan muodon (#650)', () => {
    const hard = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6)
      .rotateZ(Math.PI / 2)
      .translate(0.25, 0, 0.5);
    const m: THREE.Mesh = new THREE.Mesh(hard);
    const full = top(m);
    m.userData.deflate = deflateBase(hard, 1);
    deflate(m, 0.5);
    expect(top(m)).toBeCloseTo(full * 0.5, 4);
    expect(m.position.y).toBeCloseTo(TUBE_LIFT * 0.5, 5);

    // Moderni vaihtaa pyöristetyn muodon lepomuodosta: sama täyttö uuteen muotoon.
    const soft = softGeometry(hard)!;
    expect(soft.getAttribute('position').count).toBeGreaterThan(
      hard.getAttribute('position').count,
    );
    m.geometry = soft;
    const round = top(m);
    deflate(m, 0.5);
    expect(top(m)).toBeCloseTo(round * 0.5, 4);
    deflate(m, 1);
    expect(top(m)).toBeCloseTo(round, 4);

    // Ilme vaihtuu pois: alkuperäinen muoto palaa ja seuraa täyttöä.
    m.geometry = hard;
    deflate(m, 0.25);
    expect(top(m)).toBeCloseTo(full * 0.25, 4);
    const p = hard.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(Number.isFinite(p.getX(i))).toBe(true);
  });
});
