import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { planWeather } from '@lunki/shared';
import { BigWaveView } from '../game/bigWaveView';
import { LightningView } from '../game/lightningView';
import { SpoutView } from '../game/spoutView';
import { WeatherView } from '../game/weatherView';
import { Softener } from './soften';
import { fakeDocument } from './testWorld';
import { WeatherLook } from './weatherLook';

beforeAll(() => vi.stubGlobal('document', fakeDocument()));
afterAll(() => vi.unstubAllGlobals());

const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
camera.position.set(0, 0.5, 0);
camera.lookAt(0, 0.5, -10);
camera.updateMatrixWorld();

const renderer = {
  getDrawingBufferSize: (v: THREE.Vector2) => v.set(1280, 720),
} as unknown as THREE.WebGLRenderer;

/** Pelin sään näkymät kohtauksessa kuten kisassa (`WeatherController`). */
function gameWeather() {
  const scene = new THREE.Scene();
  const weather = new WeatherView(planWeather(3, 'chaos', 600));
  const lightning = new LightningView();
  const spouts = new SpoutView();
  const bigWave = new BigWaveView();
  scene.add(weather.group, lightning.group, spouts.group, bigWave.group);
  spouts.update(0.016, [{ x: 40, y: 10 }]);
  return { scene, weather, lightning, spouts, bigWave };
}

const named = (scene: THREE.Scene, name: string) => {
  const found: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.name === name) found.push(o);
  });
  return found;
};

describe('sääilmiöt modernissa ilmeessä (#650)', () => {
  it('löytää pelin nimeämät sään osat ja piirtää niiden tilalle omansa', () => {
    const { scene } = gameWeather();
    // Peli nimeää osat, joista Moderni piirtää omansa.
    for (const name of ['rain', 'lightning', 'spouts', 'bigWave-crest'])
      expect(named(scene, name), name).toHaveLength(1);
    const game = ['rain', 'bolt', 'bolt-halo', 'bolt-glow', 'bolt-ring', 'spout-funnel'].map(
      (name) => (named(scene, name)[0] as THREE.Mesh).material as THREE.Material,
    );
    expect(game.every((m) => m.visible)).toBe(true);

    const look = new WeatherLook(scene, renderer);
    look.update(camera);
    expect(game.every((m) => !m.visible)).toBe(true);
    for (const name of ['modern-rain', 'modern-bolt', 'modern-spout', 'modern-swell'])
      expect(named(scene, name).length, name).toBeGreaterThan(0);

    look.dispose();
    expect(game.every((m) => m.visible)).toBe(true);
    for (const name of ['modern-rain', 'modern-bolt', 'modern-spout', 'modern-swell'])
      expect(named(scene, name), name).toHaveLength(0);
  });

  it('pyöristys jättää sään osat ennalleen', () => {
    const { scene } = gameWeather();
    const look = new WeatherLook(scene, renderer);
    look.update(camera);
    const before = new Map<THREE.Object3D, THREE.BufferGeometry>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name.startsWith('modern-')) before.set(mesh, mesh.geometry);
    });
    expect(before.size).toBeGreaterThan(5);
    const softener = new Softener(scene);
    softener.update();
    for (const [mesh, geometry] of before)
      expect((mesh as THREE.Mesh).geometry, mesh.name).toBe(geometry);
    softener.dispose();
    look.dispose();
  });

  it('löytää uuden kisan sään, kun kohtaus vaihtuu', () => {
    const first = gameWeather();
    const look = new WeatherLook(first.scene, renderer);
    look.update(camera);
    const old = (named(first.scene, 'rain')[0] as THREE.LineSegments).material as THREE.Material;
    expect(old.visible).toBe(false);
    // Kisa päättyy ja uusi alkaa samassa kohtauksessa.
    first.scene.remove(first.weather.group);
    const next = new WeatherView(planWeather(5, 'chaos', 600));
    first.scene.add(next.group);
    for (let i = 0; i < 31; i++) look.update(camera);
    expect(old.visible).toBe(true);
    const fresh = (next.group.getObjectByName('rain') as THREE.LineSegments)
      .material as THREE.Material;
    expect(fresh.visible).toBe(false);
    look.dispose();
    expect(fresh.visible).toBe(true);
  });
});
