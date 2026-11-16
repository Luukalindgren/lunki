import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BuildingIndex, planVegetation, TREE_BAND, YARD } from '../world/vegetation';
import { Land } from './land';
import { SCENERY_COLORS } from './sceneryColors';
import { rehome } from '../world/staticWorld';
import { testWorld } from './testWorld';
import { Forest, plantTrees } from './trees';

describe('modernin ilmeen puut (#650)', () => {
  const world = testWorld();
  const land = new Land(world, SCENERY_COLORS.summer);
  const plants = planVegetation(world.map, world.surroundings, world.ground);
  const retroTrees = plants.filter((p) => p.kind !== 'reeds');
  const trees = plantTrees(world, plants, land);

  it('rantavyöhykkeen puut ovat Retron paikoilla ja lajeilla', () => {
    retroTrees.forEach((p, i) => {
      expect(trees[i]!.pos).toBe(p.pos);
      expect(trees[i]!.kind).toBe(p.kind);
      expect(trees[i]!.height).toBe(p.height);
    });
  });

  it('metsä jatkuu rantavyöhykkeen takana, ei vedessä eikä pihoilla', () => {
    const forest = trees.slice(retroTrees.length);
    expect(forest.length).toBeGreaterThan(3000);
    expect(forest.length).toBeLessThan(20000);
    const yards = new BuildingIndex(world.surroundings);
    for (const t of forest) {
      expect(land.shore.isWater(t.pos)).toBe(false);
      expect(land.shore.distance(t.pos.x, t.pos.y)).toBeGreaterThan(Math.min(TREE_BAND - 3, 31));
      expect(yards.near(t.pos, YARD)).toBe(false);
    }
  });

  it('puut seisovat maan pinnassa myös rantapenkalla', () => {
    for (const t of trees) {
      const ground = land.heightAt(t.pos);
      expect(t.base).toBeGreaterThanOrEqual(ground - 0.26);
      expect(t.base).toBeLessThan(ground + 0.5);
    }
  });

  it('sama maisema joka kerta', () => {
    const again = plantTrees(world, plants, land);
    expect(again.length).toBe(trees.length);
    expect(again.at(-1)).toEqual(trees.at(-1));
  });

  it('lohko piirtää tarkan mallin läheltä, kevyen kauempaa ja hahmon kaukaa', () => {
    const forest = new Forest(world, plants, land, SCENERY_COLORS.summer);
    // Alueet vuorotellen: lohkot tasoineen ja koko alue hahmoina.
    const groups = forest.group.children;
    const chunks = groups.filter((_, i) => i % 2 === 0);
    const far = groups.filter((_, i) => i % 2 === 1);
    const meshesOf = (g: THREE.Object3D) => g.children as THREE.InstancedMesh[];
    const tris = (m: THREE.InstancedMesh) => (m.geometry.getIndex()?.count ?? 0) / 3;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(-350, 1, 160);
    camera.updateMatrixWorld();
    forest.update(camera, 110);
    // Alueesta näkyvät joko lohkot tai hahmot, ei molempia.
    chunks.forEach((g, i) => expect(g.visible).toBe(!far[i]!.visible));
    const near = chunks.filter((g) => g.visible);
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThan(chunks.length / 2);
    // Jokaisesta lohkosta näkyy täsmälleen yksi kolmesta tasosta.
    const shown = [
      ...near.flatMap((g) => meshesOf(g).filter((m) => m.visible)),
      ...far.filter((g) => g.visible).flatMap(meshesOf),
    ];
    expect(shown.reduce((n, m) => n + m.count, 0)).toBe(trees.length);
    const level = (n: number) =>
      near.flatMap((g) => meshesOf(g).filter((m, i) => m.visible && i % 3 === n));
    expect(level(0).length).toBeGreaterThan(0);
    expect(level(1).length).toBeGreaterThan(0);
    expect(Math.min(...level(0).map(tris))).toBeGreaterThan(400);
    expect(Math.max(...level(0).map(tris))).toBeLessThan(1300);
    expect(Math.max(...level(1).map(tris))).toBeLessThan(200);
    expect(Math.max(...far.flatMap(meshesOf).map(tris))).toBeLessThan(40);
    // Koko järven puut ovat tällä jaolla kohtuullinen määrä kolmioita.
    const total = shown.reduce((n, m) => n + m.count * tris(m), 0);
    expect(total).toBeLessThan(1_500_000);
  });

  it('kaukainen alue piirtää samat puut kuin sen lohkot, mutta paljon harvemmalla kutsulla', () => {
    const forest = new Forest(world, plants, land, SCENERY_COLORS.summer);
    const groups = forest.group.children;
    let chunkCalls = 0;
    let farCalls = 0;
    for (let i = 0; i < groups.length; i += 2) {
      const chunks = groups[i]!.children as THREE.InstancedMesh[];
      const far = groups[i + 1]!.children as THREE.InstancedMesh[];
      const count = (list: THREE.InstancedMesh[]) => list.reduce((n, m) => n + m.count, 0);
      expect(count(far)).toBe(count(chunks.filter((_, n) => n % 3 === 2)));
      chunkCalls += chunks.length / 3;
      farCalls += far.length;
    }
    expect(farCalls).toBeLessThan(chunkCalls / 3);
  });

  it('metsän paikat lasketaan vain kerran', () => {
    const forest = new Forest(world, plants, land, SCENERY_COLORS.summer);
    const mesh = forest.group.children[0]!.children[0]!;
    expect(mesh.matrixAutoUpdate).toBe(false);
    const parent = new THREE.Group();
    parent.position.set(5, 0, 0);
    parent.add(forest.group);
    rehome(forest.group);
    parent.updateMatrixWorld();
    expect(mesh.matrixWorld.elements[12]).toBe(5);
  });
});
