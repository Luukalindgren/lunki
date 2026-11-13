import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  blob,
  box,
  DetailLevels,
  mergeParts,
  paint,
  paintedMaterial,
  scatter,
  seeded,
  sstep,
} from './shapes';

describe('modernin ilmeen muodot (#650)', () => {
  it('pehmeä porras on 0 alussa, 1 lopussa ja puolivälissä puolet', () => {
    expect(sstep(2, 6, 1)).toBe(0);
    expect(sstep(2, 6, 4)).toBeCloseTo(0.5);
    expect(sstep(2, 6, 9)).toBe(1);
  });

  it('kumpare on toistettava ja pysyy säteen ja muotoilun sisällä', () => {
    const a = blob(seeded(3), 2, 0.5, 0.2, 2, [10, 1, -5], 1);
    const b = blob(seeded(3), 2, 0.5, 0.2, 2, [10, 1, -5], 1);
    expect([...a.getAttribute('position').array]).toEqual([...b.getAttribute('position').array]);
    a.computeBoundingBox();
    const size = a.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(3);
    expect(size.x).toBeLessThan(4.9);
    expect(size.y).toBeLessThan(2.5);
    expect(a.getIndex()).not.toBeNull();
  });

  it('laatikko on valmiiksi väritetty ja yhdistyy muihin osiin', () => {
    const a = box(2, 1, 4, 1, 0.5, 0, 0xff0000);
    expect(a.getAttribute('position').count).toBe(36);
    a.computeBoundingBox();
    expect(a.boundingBox!.min.toArray()).toEqual([0, 0, -2]);
    expect(a.boundingBox!.max.toArray()).toEqual([2, 1, 2]);
    expect([...a.getAttribute('color').array.slice(0, 3)]).toEqual([1, 0, 0]);
    const other = paint(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), () => 0x00ff00);
    other.deleteAttribute('uv');
    expect(mergeParts([a, other]).getAttribute('position').count).toBe(72);
  });

  it('sama malli jaetaan piirtolohkoihin paikan mukaan', () => {
    const items = [0, 10, 320, 330, 900].map((x) => ({
      x,
      y: 0,
      z: 0,
      angle: 0,
      width: 1,
      height: 2,
    }));
    const meshes = scatter(new THREE.BoxGeometry(), paintedMaterial(), items, 150);
    expect(meshes.map((m) => m.count).sort()).toEqual([1, 2, 2]);
    for (const m of meshes) expect(m.boundingSphere).not.toBeNull();
  });

  it('tarkkuustaso valitaan kameran vaakaetäisyydestä, ja sama malli voi olla usealla tasolla', () => {
    const levels = new DetailLevels();
    const near = new THREE.Object3D();
    const far = new THREE.Object3D();
    const rock = new THREE.Object3D();
    const at = new THREE.Sphere(new THREE.Vector3(100, 0, 0), 10);
    levels.add(at, [near, far, null]);
    levels.add(at, [rock, rock, null]);
    const camera = new THREE.PerspectiveCamera();
    const look = (x: number, y: number) => {
      camera.position.set(x, y, 0);
      camera.updateMatrixWorld();
      levels.update(camera, [50, 200]);
      return [near.visible, far.visible, rock.visible];
    };
    expect(look(60, 2)).toEqual([true, false, true]);
    // Korkeus ei vaikuta: ylhäältä katsova kamera näkee allaan tarkat mallit.
    expect(look(60, 400)).toEqual([true, false, true]);
    expect(look(-50, 2)).toEqual([false, true, true]);
    expect(look(-200, 2)).toEqual([false, false, false]);
  });
});
