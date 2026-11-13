import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BuildingIndex, planVegetation, TREE_BAND, YARD } from '../world/vegetation';
import { Land } from './land';
import { SCENERY_COLORS } from './sceneryColors';
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
    const meshes = forest.group.children as THREE.InstancedMesh[];
    const tris = (m: THREE.InstancedMesh) => (m.geometry.getIndex()?.count ?? 0) / 3;
    const shown = () => meshes.filter((m) => m.visible);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(-350, 1, 160);
    camera.updateMatrixWorld();
    forest.update(camera, 110);
    // Jokaisesta lohkosta näkyy täsmälleen yksi kolmesta tasosta.
    expect(shown().reduce((n, m) => n + m.count, 0)).toBe(trees.length);
    const level = (n: number) => shown().filter((m) => meshes.indexOf(m) % 3 === n);
    expect(level(0).length).toBeGreaterThan(0);
    expect(level(1).length).toBeGreaterThan(0);
    expect(level(2).length).toBeGreaterThan(level(0).length + level(1).length);
    expect(Math.min(...level(0).map(tris))).toBeGreaterThan(400);
    expect(Math.max(...level(0).map(tris))).toBeLessThan(1300);
    expect(Math.max(...level(1).map(tris))).toBeLessThan(200);
    expect(Math.max(...level(2).map(tris))).toBeLessThan(40);
    // Koko järven puut ovat tällä jaolla kohtuullinen määrä kolmioita.
    const total = shown().reduce((n, m) => n + m.count * tris(m), 0);
    expect(total).toBeLessThan(1_500_000);
  });
});
