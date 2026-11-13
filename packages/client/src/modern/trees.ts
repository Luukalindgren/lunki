import * as THREE from 'three';
import { LandCover, valueNoise, type Vec2 } from '@lunki/shared';
import { clearSightLine } from '../world/sightLine';
import type { StaticWorld } from '../world/staticWorld';
import {
  BuildingIndex,
  TREE_BAND,
  TREE_DENSITY,
  UNKNOWN_DENSITY,
  YARD,
  type Plant,
} from '../world/vegetation';
import type { Land } from './land';
import type { SceneryColors } from './sceneryColors';
import {
  blob,
  DetailLevels,
  mergeParts,
  mixColor,
  paint,
  paintedMaterial,
  seeded,
  smooth,
  solid,
} from './shapes';
import { ShoreField } from './shoreField';

export type TreeKind = 'spruce' | 'pine' | 'birch';
const KINDS: readonly TreeKind[] = ['spruce', 'pine', 'birch'];
/** Samasta lajista on näin monta eri muotoa, jotta vierekkäiset puut eroavat. */
const VARIANTS = 2;
/** Piirtolohkon sivu (m): lohko vaihtaa tarkan ja kevyen mallin välillä etäisyyden mukaan. */
const CHUNK = 60;
/** Metsä jatkuu rantavyöhykkeen (TREE_BAND) takana tähän asti (m rannasta) harvempana. */
const FOREST_DEPTH = 115;
const FOREST_SPACING = 6.5;
/** Leveimmän latvuksen (kuusen helma) säde puun korkeudesta: näköyhteyden väistö. */
const SIGHT_REACH = 0.22;

/** Puun korkeus (m) lajeittain, kuten Retron puilla. */
const HEIGHT: Record<TreeKind, readonly [number, number]> = {
  spruce: [14, 22],
  pine: [16, 24],
  birch: [10, 17],
};

export interface Tree {
  kind: TreeKind;
  pos: Vec2;
  base: number;
  height: number;
  angle: number;
  shade: number;
}

/** Tarkkuustasot: 0 tarkka (lähellä), 1 kevyt ja 2 kaukaa näkyvä hahmo. */
type Level = 0 | 1 | 2;
const LEVELS: readonly Level[] = [0, 1, 2];
/** Kevyt malli piirretään tarkan matkan tähän kerrannaiseen asti, sen takana hahmo. */
const MID_RANGE = 2.5;

/**
 * Modernin ilmeen puut (#650): muotoillut, pehmeästi varjostetut mallit
 * samoilla paikoilla kuin Retron puukuvat (`planVegetation`), ja niiden takana
 * harvempi metsä, joka näkyy myös ylhäältä. Lohko piirtää tarkan mallin
 * läheltä, kevyen kauempaa ja vastarannalta pelkän hahmon.
 */
export class Forest {
  readonly group = new THREE.Group();
  private readonly levels = new DetailLevels();

  constructor(world: StaticWorld, plants: readonly Plant[], land: Land, colors: SceneryColors) {
    this.group.name = 'modern-trees';
    const material = paintedMaterial();
    // Takaa-näkymässä (#691) kameran ja kalastajan väliin jäävät puut jäävät
    // piirtämättä. Kappaleen mitta on puun korkeus: kuusen helma on siitä viidennes.
    clearSightLine(material, SIGHT_REACH);
    const models = new Map<string, THREE.BufferGeometry[]>();
    const rand = seeded(11);
    for (const kind of KINDS)
      for (let v = 0; v < VARIANTS; v++)
        models.set(
          `${kind}${v}`,
          LEVELS.map((level) => MODELS[kind](rand, colors, level)),
        );

    const lists = new Map<string, Tree[]>();
    plantTrees(world, plants, land).forEach((t, n) => {
      const key = `${t.kind}${n % VARIANTS},${Math.floor(t.pos.x / CHUNK)},${Math.floor(t.pos.y / CHUNK)}`;
      const list = lists.get(key);
      if (list) list.push(t);
      else lists.set(key, [t]);
    });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const at = new THREE.Vector3();
    const size = new THREE.Vector3();
    const tint = new THREE.Color();
    for (const [key, list] of lists) {
      const [near, ...lighter] = models
        .get(key.slice(0, key.indexOf(',')))!
        .map((model) => new THREE.InstancedMesh(model, material, list.length)) as [
        THREE.InstancedMesh,
        ...THREE.InstancedMesh[],
      ];
      list.forEach((t, i) => {
        m.compose(
          at.set(t.pos.x, t.base, -t.pos.y),
          q.setFromAxisAngle(up, t.angle),
          size.setScalar(t.height),
        );
        near.setMatrixAt(i, m);
        // Lämmin tai viileä vivahde puun omaan sävyyn.
        const warm = (t.angle % 1) * 0.08 - 0.04;
        near.setColorAt(i, tint.setRGB(t.shade + warm, t.shade, t.shade - warm));
      });
      near.computeBoundingSphere();
      // Tasot jakavat puiden paikat ja sävyt.
      for (const mesh of lighter) {
        mesh.instanceMatrix = near.instanceMatrix;
        mesh.instanceColor = near.instanceColor;
        mesh.boundingSphere = near.boundingSphere;
        mesh.visible = false;
      }
      this.levels.add(near.boundingSphere!, [near, ...lighter]);
      this.group.add(near, ...lighter);
    }
  }

  /** Tarkat mallit `range` metrin sisällä kamerasta, sitten kevyet ja kaukana hahmot. */
  update(camera: THREE.Camera, range: number): void {
    this.levels.update(camera, [range, range * MID_RANGE]);
  }
}

/** Rantavyöhykkeen puut Retron paikoilla ja niiden takana harvempi metsä. */
export function plantTrees(world: StaticWorld, plants: readonly Plant[], land: Land): Tree[] {
  const { map, surroundings, ground } = world;
  const trees: Tree[] = [];
  for (const p of plants) {
    if (p.kind === 'reeds') continue;
    trees.push({
      kind: p.kind,
      pos: p.pos,
      base: Math.max(p.base, land.heightAt(p.pos) - 0.25),
      height: p.height,
      // Retron kuvalla kulma on 0–π (ristikkäiset levyt); malli kiertyy koko kierroksen.
      angle: p.angle * 2,
      shade: p.shade,
    });
  }
  if (!surroundings) return trees;

  const rand = seeded(47);
  const cover = new LandCover(surroundings);
  const yards = new BuildingIndex(surroundings);
  const shore = new ShoreField(map, FOREST_DEPTH + 5);
  const { minX, minY, maxX, maxY } = map.bounds;
  for (let y = minY - FOREST_DEPTH; y < maxY + FOREST_DEPTH; y += FOREST_SPACING) {
    for (let x = minX - FOREST_DEPTH; x < maxX + FOREST_DEPTH; x += FOREST_SPACING) {
      const pos = {
        x: x + (rand() - 0.5) * FOREST_SPACING,
        y: y + (rand() - 0.5) * FOREST_SPACING,
      };
      const pick = rand();
      const grow = rand();
      const turn = rand();
      if (!shore.near(pos.x, pos.y)) continue;
      const d = shore.signed(pos.x, pos.y);
      if (d < TREE_BAND - 3 || d > FOREST_DEPTH || yards.near(pos, YARD)) continue;
      const kind = cover.kindAt(pos);
      let density = kind === null ? UNKNOWN_DENSITY : (TREE_DENSITY[kind] ?? 0);
      if (valueNoise(pos.x / 40, pos.y / 40, 41) < -0.45) density *= 0.2;
      if (pick > density) continue;
      const h = Math.max(0, ground.heightAt(pos));
      const mix = valueNoise(pos.x / 60, pos.y / 60, 42);
      const species: TreeKind = mix > 0.3 ? 'birch' : h > 8 || mix < -0.35 ? 'pine' : 'spruce';
      const [min, max] = HEIGHT[species];
      trees.push({
        kind: species,
        pos,
        base: land.heightAt(pos) - 0.25,
        height: min + (max - min) * grow,
        angle: turn * Math.PI * 2,
        shade: 0.78 + turn * 0.3,
      });
    }
  }
  return trees;
}

type Rand = () => number;
type Model = (rand: Rand, colors: SceneryColors, level: Level) => THREE.BufferGeometry;

/** Runko: kapeneva lieriö, joka taipuu hieman. Malli on yhden yksikön korkuinen. */
function trunk(r0: number, r1: number, height: number, bend: number, level: Level) {
  const sides = [8, 5, 3][level]!;
  const geo = solid(
    new THREE.CylinderGeometry(r1, r0, height, sides, level === 0 ? 5 : 1).translate(
      0,
      height / 2,
      0,
    ),
  );
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++)
    p.setX(i, p.getX(i) + bend * Math.sin((p.getY(i) / height) * 2.4) * height * 0.02);
  geo.computeVertexNormals();
  return geo;
}

const MODELS: Record<TreeKind, Model> = {
  // Kuusi: kerrokset sileinä helmoina, joiden reuna aaltoilee.
  spruce(rand, colors, level) {
    const parts: THREE.BufferGeometry[] = [];
    const layers = [7, 3, 2][level]!;
    const lobes = 6;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const top = [0.34, 0.52, 0.62][level]! + t * [0.7, 0.52, 0.42][level]!;
      const radius = 0.2 * (1 - t * 0.84);
      const height = [0.27, 0.5, 0.6][level]! * (1 - t * 0.45);
      const geo = smooth(
        new THREE.ConeGeometry(radius, height, [18, 8, 6][level]!, level === 0 ? 2 : 1).translate(
          0,
          top - height / 2,
          0,
        ),
      );
      const p = geo.getAttribute('position');
      const phase = rand() * Math.PI * 2;
      if (level === 0) {
        for (let j = 0; j < p.count; j++) {
          const x = p.getX(j);
          const z = p.getZ(j);
          const e = Math.min(1, Math.hypot(x, z) / radius);
          const wave = Math.sin(Math.atan2(z, x) * lobes + phase);
          const k = 1 + e * e * 0.2 * wave;
          p.setXYZ(j, x * k, p.getY(j) - e * e * height * (0.3 + 0.2 * wave), z * k);
        }
        geo.computeVertexNormals();
      }
      const [dark, , light, under] = colors.spruce;
      paint(geo, (x, _y, z, upward) =>
        upward < -0.3
          ? under
          : mixColor(dark, light, Math.min(1, Math.hypot(x, z) / radius) * 0.55 + t * 0.45),
      );
      parts.push(geo);
    }
    // Kaukaa runko jää helmojen alle.
    if (level < 2) parts.push(paint(trunk(0.015, 0.008, 0.4, 0, level), () => colors.trunk.spruce));
    return mergeParts(parts);
  },

  // Mänty: korkea punertava runko ja latvus muutamana kumpareena.
  pine(rand, colors, level) {
    const clusters: readonly (readonly [number, number, number, number])[] = [
      [0, 0.87, 0, 0.15],
      [0.1, 0.77, -0.05, 0.12],
      [-0.11, 0.79, 0.07, 0.12],
      [0.03, 0.7, 0.1, 0.09],
      [-0.05, 0.94, -0.03, 0.1],
      [0.07, 0.67, -0.1, 0.075],
    ];
    const parts: THREE.BufferGeometry[] = [];
    const [, , , shadow] = colors.pine;
    const crown = (x: number, y: number, z: number, r: number, amp: number, detail: number) => {
      const geo = blob(rand, r, 0.58, amp, 2.2, [x, y, z], detail);
      const tone = colors.pine[Math.floor(rand() * 3)]!;
      parts.push(paint(geo, (_x, _y, _z, upward) => mixColor(shadow, tone, 0.5 + upward * 0.5)));
    };
    if (level === 2) crown(0, 0.82, 0, 0.23, 0.1, 0);
    else
      clusters.slice(0, level === 0 ? clusters.length : 3).forEach(([x, y, z, radius], n) => {
        if (level === 1) {
          crown(x, y, z, radius * 1.15, 0.1, n === 0 ? 1 : 0);
          return;
        }
        crown(x, y, z, radius, 0.2, n === 0 ? 2 : 1);
        crown(
          x + (rand() - 0.5) * radius,
          y + (rand() - 0.3) * radius * 0.5,
          z + (rand() - 0.5) * radius,
          radius * 0.62,
          0.2,
          0,
        );
        const reach = Math.hypot(x, z);
        if (reach > 0.02)
          parts.push(
            paint(
              solid(
                new THREE.CylinderGeometry(0.004, 0.007, reach, 5)
                  .rotateZ(Math.PI / 2)
                  .rotateY(-Math.atan2(z, x))
                  .translate(x / 2, y - radius * 0.25, z / 2),
              ),
              () => colors.trunk.pine[1],
            ),
          );
      });
    const [low, high] = colors.trunk.pine;
    parts.push(
      paint(trunk(0.011, 0.005, 0.9, level === 2 ? 0 : 1, level), (_x, y) =>
        mixColor(low, high, (y - 0.2) / 0.35),
      ),
    );
    return mergeParts(parts);
  },

  // Koivu: valkoinen runko ja vaalea, kerroksittainen lehvästö.
  birch(rand, colors, level) {
    const clusters: readonly (readonly [number, number, number, number, number])[] = [
      [0, 0.68, 0, 0.17, 1.25],
      [0.09, 0.5, 0.05, 0.12, 1.2],
      [-0.1, 0.54, -0.06, 0.12, 1.2],
      [0.02, 0.87, 0.01, 0.1, 1.2],
      [-0.03, 0.4, 0.09, 0.085, 1.1],
      [0.05, 0.4, -0.09, 0.08, 1.1],
    ];
    const parts: THREE.BufferGeometry[] = [];
    const size = colors.birchCrown;
    const crown = (
      x: number,
      y: number,
      z: number,
      r: number,
      sy: number,
      amp: number,
      detail: number,
    ) => {
      const geo = blob(rand, r * size, sy, amp, 2.4, [x, y, z], detail);
      const tone = colors.birch[Math.floor(rand() * 4)]!;
      parts.push(
        paint(geo, (_x, _y, _z, upward) => mixColor(colors.birch[2], tone, 0.45 + upward * 0.55)),
      );
    };
    if (level === 2) crown(0, 0.62, 0, 0.21, 1.35, 0.1, 0);
    else
      clusters.slice(0, level === 0 ? clusters.length : 4).forEach(([x, y, z, radius, sy], n) => {
        if (level === 1) {
          crown(x, y, z, radius * 1.12, sy, 0.1, n === 0 ? 1 : 0);
          return;
        }
        crown(x, y, z, radius, sy, 0.22, n === 0 ? 2 : 1);
        crown(
          x + (rand() - 0.5) * radius * 1.2,
          y + (rand() - 0.5) * radius * sy,
          z + (rand() - 0.5) * radius * 1.2,
          radius * 0.6,
          sy,
          0.22,
          0,
        );
      });
    parts.push(
      paint(trunk(0.014, 0.005, 0.82, level === 2 ? 0 : 0.6, level), (_x, y) =>
        level === 0 && Math.sin(y * 173) * Math.sin(y * 61) > 0.6 ? 0x2c2a28 : colors.trunk.birch,
      ),
    );
    return mergeParts(parts);
  },
};
