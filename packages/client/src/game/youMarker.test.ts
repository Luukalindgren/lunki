import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { YOU_MARKER_MIN_MPP, YouMarker, arrowDistance } from './youMarker';

/** Nuolen kärjen suunta maailmassa (x, -z) eli pelin koordinaateissa (x, y). */
function arrowDir(m: YouMarker): { x: number; y: number } {
  m.group.updateMatrixWorld(true);
  const centre = new THREE.Vector3().setFromMatrixPosition(m.group.matrixWorld);
  const arrow = new THREE.Vector3().setFromMatrixPosition(m.group.children[1]!.matrixWorld);
  const d = arrow.sub(centre).normalize();
  return { x: d.x, y: -d.z };
}

describe('YouMarker', () => {
  it('näkyy ylhäältä katsottuna, rengas vain kauas loitonnettaessa', () => {
    const m = new YouMarker();
    m.update({ x: 10, y: 20 }, 0, 0.125, true);
    expect(m.group.visible).toBe(true);
    expect(m.group.children[0]!.visible).toBe(false);
    expect(m.group.position.x).toBe(10);
    expect(m.group.position.z).toBe(-20);
    m.update({ x: 10, y: 20 }, 0, YOU_MARKER_MIN_MPP, true);
    expect(m.group.children[0]!.visible).toBe(true);
    m.update({ x: 10, y: 20 }, 0, 4, false);
    expect(m.group.visible).toBe(false);
  });

  it('nuoli osoittaa katsesuuntaan', () => {
    const m = new YouMarker();
    m.update({ x: 0, y: 0 }, Math.PI / 2, 0.125, true);
    const north = arrowDir(m);
    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeCloseTo(1);
    m.update({ x: 0, y: 0 }, Math.PI, 0.125, true);
    expect(arrowDir(m).x).toBeCloseTo(-1);
  });

  it('pysyy samankokoisena pikseleinä ja nuoli räpylöiden ulkopuolella', () => {
    const m = new YouMarker();
    m.update({ x: 0, y: 0 }, 0, 2, true);
    expect(m.group.scale.x).toBe(2);
    for (const mpp of [0.0625, 0.125, 0.5, 8]) {
      // Nuolen takareuna (4 px keskeltä taaksepäin) jää räpylöiden (1,2 m) eteen.
      expect((arrowDistance(mpp) - 4) * mpp).toBeGreaterThan(1.2);
      expect(arrowDistance(mpp)).toBeGreaterThanOrEqual(12);
    }
  });
});
