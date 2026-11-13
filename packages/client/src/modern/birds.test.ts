import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BirdPose } from '../game/birdPose';
import { Birds } from './birds';

const pose = (over: Partial<BirdPose>): BirdPose => ({
  kind: 'drake',
  pos: { x: 0, y: 0 },
  height: 0,
  heading: 0,
  flying: false,
  flap: 0,
  ...over,
});

/** Pelin lintunäkymä: ryhmä `birds` ja kuva jokaiselle linnulle. */
function flock(poses: (BirdPose | null)[]) {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = 'birds';
  const sprites = poses.map((p, i) => {
    const s = new THREE.Sprite();
    s.position.set(i * 3, p?.height ?? 0, -i);
    s.visible = p !== null;
    s.userData.bird = p;
    s.userData.grow = 1.5;
    group.add(s);
    return s;
  });
  scene.add(group);
  return { scene, group, sprites };
}

const models = (group: THREE.Object3D) =>
  group.children.find((c) => c.name === 'modern-birds')?.children ?? [];
const shown = (group: THREE.Object3D) => models(group).filter((m) => m.visible);

describe('linnut modernissa ilmeessä (#650)', () => {
  it('piirtää kuvan tilalle mallin samaan paikkaan, kokoon ja suuntaan', () => {
    const { scene, group, sprites } = flock([
      pose({ kind: 'swan', heading: 1.2 }),
      pose({ kind: 'gull', flying: true, height: 20, flap: 0.25 }),
      null,
    ]);
    const birds = new Birds(scene);
    birds.update();
    expect(sprites.map((s) => s.visible)).toEqual([false, false, false]);
    const [swan, gull] = shown(group);
    expect(shown(group)).toHaveLength(2);
    expect(swan!.position.equals(sprites[0]!.position)).toBe(true);
    expect(swan!.rotation.y).toBeCloseTo(1.2);
    expect(swan!.scale.x).toBeCloseTo(1.5);
    expect(gull!.position.y).toBe(20);
    // Uiva lintu on yksi kappale, lentävällä on siivet erikseen.
    expect(swan!.children).toHaveLength(1);
    expect(gull!.children).toHaveLength(3);

    birds.dispose();
    expect(models(group)).toHaveLength(0);
    expect(sprites.map((s) => s.visible)).toEqual([true, true, false]);
  });

  it('lyö siipiä pelin tahdissa ja käyttää mallit uudelleen', () => {
    const { scene, group, sprites } = flock([pose({ kind: 'tern', flying: true, flap: 0.25 })]);
    const birds = new Birds(scene);
    birds.update();
    const tern = shown(group)[0]!;
    const [, right, left] = tern.children;
    // Vaihe 0,25: siivet ylhäällä; 0,75: alhaalla. Vasen on oikean peilikuva.
    expect(right!.rotation.x).toBeLessThan(-0.5);
    expect(left!.rotation.x).toBeCloseTo(-right!.rotation.x);
    expect(left!.scale.z).toBe(-1);
    sprites[0]!.userData.bird = pose({ kind: 'tern', flying: true, flap: 0.75 });
    birds.update();
    expect(right!.rotation.x).toBeGreaterThan(0.3);

    // Lintu katoaa: malli piiloon, ja sama malli otetaan käyttöön, kun lintu palaa.
    sprites[0]!.userData.bird = null;
    birds.update();
    expect(shown(group)).toHaveLength(0);
    sprites[0]!.userData.bird = pose({ kind: 'tern', flying: true });
    birds.update();
    expect(shown(group)).toEqual([tern]);
    expect(models(group)).toHaveLength(1);
  });

  it('kalasääski on vedessäkin siivet levällään ja kantaa kalaa vain saaliin kanssa', () => {
    const { scene, group, sprites } = flock([pose({ kind: 'osprey', flying: false })]);
    const birds = new Birds(scene);
    birds.update();
    const osprey = shown(group)[0]!;
    expect(osprey.children).toHaveLength(4);
    const prey = osprey.children[3]!;
    expect(prey.visible).toBe(false);
    sprites[0]!.userData.bird = pose({ kind: 'osprey', flying: true, carrying: true });
    birds.update();
    expect(prey.visible).toBe(true);
    // Kuikka ei lennä pelissä: se piirretään uivana, vaikka asento sanoisi muuta.
    sprites[0]!.userData.bird = pose({ kind: 'loon', flying: true });
    birds.update();
    expect(shown(group)[0]!.children).toHaveLength(1);
  });
});
