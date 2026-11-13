import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BIG_WAVE_CREST, BigWaveView } from '../game/bigWaveView';
import { SWELL, Swells, swellShape } from './swells';

describe('iso aalto modernissa ilmeessä (#650)', () => {
  const shape = swellShape();
  const pos = shape.getAttribute('position');
  const col = shape.getAttribute('color');

  it('maininki on harjan mittainen, matala ja päistään veden tasalla', () => {
    shape.computeBoundingBox();
    const box = shape.boundingBox!;
    expect(box.max.z - box.min.z).toBeCloseTo(BIG_WAVE_CREST.length);
    expect(box.min.y).toBeGreaterThanOrEqual(0);
    expect(box.max.y).toBeLessThanOrEqual(SWELL.height);
    expect(box.max.y).toBeGreaterThan(SWELL.height * 0.7);
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getZ(i)) > BIG_WAVE_CREST.length / 2 - 0.01)
        expect(pos.getY(i)).toBeLessThan(0.01);
    }
  });

  it('etureuna on selkää jyrkempi', () => {
    let front = 0;
    let back = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < SWELL.height * 0.05) continue;
      // Harjan kallistus siirtää huippua enintään vajaan metrin.
      front = Math.max(front, pos.getX(i));
      back = Math.min(back, pos.getX(i));
    }
    expect(-back).toBeGreaterThan(front * 1.5);
  });

  it('vaahto on vain harjan laella ja reunat sulautuvat veteen', () => {
    let foam = 0;
    let across = 0;
    for (let i = 0; i < pos.count; i++) {
      // Veden punainen kanava on alle 0,05: tätä vaaleampi kärki on vaahtoa.
      const white = col.getX(i) > 0.15;
      if (white) {
        foam++;
        expect(pos.getY(i)).toBeGreaterThan(SWELL.height * 0.25);
      }
      if (pos.getY(i) > SWELL.height * 0.6) across++;
      expect(col.getW(i)).toBeGreaterThanOrEqual(0);
      expect(col.getW(i)).toBeLessThanOrEqual(1);
    }
    // Vaahto on katkonaista: osa laesta, ei koko harja.
    expect(foam).toBeGreaterThan(across * 0.15);
    expect(foam).toBeLessThan(across * 0.85);
    // Poikkisuunnan ensimmäinen ja viimeinen kärki ovat läpinäkyviä.
    const row = pos.count / 91;
    for (let j = 0; j < 91; j++) {
      expect(col.getW(j * row)).toBe(0);
      expect(col.getW(j * row + row - 1)).toBe(0);
    }
  });

  it('vaihtaa pelin harjan mainingiksi ja palauttaa sen', () => {
    const view = new BigWaveView();
    const crest = view.group.getObjectByName('bigWave-crest')!;
    const materials = crest.children.map((c) => (c as THREE.Mesh).material as THREE.Material);
    expect(materials.length).toBeGreaterThan(0);
    const swells = new Swells();
    swells.bind(crest);
    expect(materials.every((m) => !m.visible)).toBe(true);
    const swell = crest.getObjectByName('modern-swell') as THREE.Mesh;
    expect(swell).toBeDefined();
    // Usvan tiheys on alfakanavassa: läpikuultava pinta ei kirjoita siihen.
    expect((swell.material as THREE.Material).blendSrcAlpha).toBe(THREE.ZeroFactor);
    // Peli liikuttaa harjaa: maininki kulkee sen lapsena.
    view.update(1, 0.4, { x: 10, y: 20 });
    expect(crest.visible).toBe(true);
    expect(swell.parent).toBe(crest);

    swells.dispose();
    expect(materials.every((m) => m.visible)).toBe(true);
    expect(crest.getObjectByName('modern-swell')).toBeUndefined();
  });
});
