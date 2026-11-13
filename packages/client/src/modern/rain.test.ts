import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rain, SPLASH, type Drops } from './rain';

const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
camera.position.set(0, 0.5, 0);
camera.lookAt(0, 0.5, -10);
camera.updateMatrixWorld();

/** Pelin sade: viivat (alapää, yläpää) ryhmässä, piirtoalue kertoo määrän. */
function drops(count: number) {
  const positions = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) positions.set([i, 4, -8, i + 0.1, 5.2, -8], i * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, count * 2);
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xb8c8d8 }),
  ) as Drops;
  lines.name = 'rain';
  const group = new THREE.Group();
  group.add(lines);
  const added = () => group.children.filter((c) => c.name === 'modern-rain') as THREE.Mesh[];
  return { lines, positions, group, added };
}

describe('sade modernissa ilmeessä (#650)', () => {
  it('piirtää pelin pisarat juovina samoihin paikkoihin ja piilottaa viivat', () => {
    const { lines, group, added } = drops(4);
    const rain = new Rain();
    rain.bind(lines);
    expect(lines.material.visible).toBe(false);
    // Pelin oma näkyvyys jää pelin käsiin: siitä luetaan, sataako.
    expect(lines.visible).toBe(true);
    expect(added()).toHaveLength(2);

    lines.geometry.setDrawRange(0, 6);
    rain.update(camera, 720, 0.016);
    const streaks = added()[0]!;
    expect(streaks.visible).toBe(true);
    expect(streaks.geometry.drawRange.count).toBe(3 * 6);
    const pos = streaks.geometry.getAttribute('position');
    const col = streaks.geometry.getAttribute('color');
    for (let i = 0; i < 3; i++) {
      // Alapään kaksi kärkeä ovat pisaran alapään kahta puolta.
      const v = i * 4;
      expect((pos.getX(v) + pos.getX(v + 1)) / 2).toBeCloseTo(i, 3);
      expect((pos.getY(v) + pos.getY(v + 1)) / 2).toBeCloseTo(4, 3);
      // Juova on vähintään pelin pisaran mittainen ja kapenee ylös.
      expect(pos.getY(v + 2)).toBeGreaterThan(5);
      const low = Math.hypot(pos.getX(v + 1) - pos.getX(v), pos.getZ(v + 1) - pos.getZ(v));
      const high = Math.hypot(pos.getX(v + 3) - pos.getX(v + 2), pos.getZ(v + 3) - pos.getZ(v + 2));
      expect(high).toBeLessThan(low * 0.5);
      // Peitto on alapäässä ja häipyy yläpäähän; väri on pelin.
      expect(col.getW(v)).toBeGreaterThan(0.2);
      expect(col.getW(v + 2)).toBe(0);
      expect(col.getX(v)).toBeCloseTo(lines.material.color.r);
    }

    lines.visible = false;
    rain.update(camera, 720, 0.016);
    expect(streaks.visible).toBe(false);

    rain.dispose();
    expect(lines.material.visible).toBe(true);
    expect(added()).toHaveLength(0);
    expect(group.children).toEqual([lines]);
  });

  it('pintaan pudonnut pisara jättää renkaan, joka hiipuu pois', () => {
    const { lines, positions, added } = drops(3);
    const rain = new Rain();
    rain.bind(lines);
    rain.update(camera, 720, 0.016);
    expect(rain.splashes).toBe(0);
    // Pisara putoaa hieman: ei rengasta.
    positions[1] = 0.2;
    rain.update(camera, 720, 0.016);
    expect(rain.splashes).toBe(0);
    // Pisara alkaa alusta ylhäältä: rengas sen edelliseen paikkaan.
    positions[1] = 17;
    rain.update(camera, 720, 0.016);
    expect(rain.splashes).toBe(1);
    const rings = added()[1] as THREE.InstancedMesh;
    rain.update(camera, 720, 0.016);
    expect(rings.visible).toBe(true);
    const m = new THREE.Matrix4();
    rings.getMatrixAt(0, m);
    const at = new THREE.Vector3().setFromMatrixPosition(m);
    expect(at.x).toBeCloseTo(0);
    expect(at.z).toBeCloseTo(-8);
    expect(at.y).toBeLessThan(0.1);
    const young = m.getMaxScaleOnAxis();
    rain.update(camera, 720, SPLASH.seconds * 0.5);
    rain.update(camera, 720, 0.001);
    rings.getMatrixAt(0, m);
    expect(m.getMaxScaleOnAxis()).toBeGreaterThan(young);
    rain.update(camera, 720, SPLASH.seconds);
    expect(rain.splashes).toBe(0);
    // Hiipunut rengas kutistetaan ensin pois, sitten koko piirto jää väliin.
    rain.update(camera, 720, 0.016);
    rain.update(camera, 720, 0.016);
    expect(rings.visible).toBe(false);
    rain.dispose();
  });

  it('rajaamaton piirtoalue on koko puskuri', () => {
    const { lines, added } = drops(5);
    // Ennen pelin ensimmäistä päivitystä piirtoalue on ääretön.
    lines.geometry.setDrawRange(0, Infinity);
    const rain = new Rain();
    rain.bind(lines);
    rain.update(camera, 720, 0.016);
    expect(added()[0]!.geometry.drawRange.count).toBe(5 * 6);
    rain.dispose();
  });

  it('renkaita on enintään varattu määrä', () => {
    const { lines, positions } = drops(SPLASH.count + 40);
    const rain = new Rain();
    rain.bind(lines);
    rain.update(camera, 720, 0.016);
    for (let i = 0; i < SPLASH.count + 40; i++) positions[i * 6 + 1] = 17;
    rain.update(camera, 720, 0.016);
    expect(rain.splashes).toBe(SPLASH.count);
    rain.dispose();
  });
});
