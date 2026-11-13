import * as THREE from 'three';
import { QUALITY, type LookQuality } from '../engine/look';
import { bottomIn, type BottomSource } from '../world/bottomMesh';
import { staticWorldIn, type StaticWorld } from '../world/staticWorld';
import { planVegetation } from '../world/vegetation';
import { createCottages, createModernPiers } from './cottages';
import { createLakeBed } from './lakeBed';
import { Land } from './land';
import { SCENERY_COLORS } from './sceneryColors';
import { createReeds, createShoreDetail } from './shoreDetail';
import { Forest } from './trees';

/** Kohtauksesta haetaan jaettu maailma näin monen ruudun välein (valikon kausi voi vaihtua). */
const FIND_FRAMES = 30;

/** Yhden kartan ja kauden moderni maisema; jaetaan valikon taustan ja kisojen kesken. */
interface Scenery {
  group: THREE.Group;
  land: Land;
  /** Osat, joiden tarkkuus riippuu kameran etäisyydestä: puut, kaislat ja ranta. */
  detailed: { update(camera: THREE.Camera, range: number): void }[];
  /** Kaislikon kuvio näkyy vain ylhäältä, kuten Retrossa. */
  reedBed: THREE.Group;
}

const built = new Map<StaticWorld, Scenery>();

function sceneryFor(world: StaticWorld): Scenery {
  let scenery = built.get(world);
  if (scenery) return scenery;
  // Kuten `staticWorldFor`: muiden kausien maisemat vapautetaan, kun niiden
  // maailma ei ole enää missään kohtauksessa.
  for (const [other, s] of built) {
    if (other.pov.parent) continue;
    disposeScenery(s);
    built.delete(other);
  }
  const colors = SCENERY_COLORS[world.season];
  const group = new THREE.Group();
  group.name = 'modern-scenery';
  const land = new Land(world, colors);
  const plants = planVegetation(world.map, world.surroundings, world.ground);
  const forest = new Forest(world, plants, land, colors);
  const reeds = createReeds(plants, world.map, colors);
  const shore = createShoreDetail(world.map, land, colors);
  group.add(land.build(), forest.group, reeds.group, reeds.bed, shore.group);
  if (world.surroundings) group.add(createCottages(world.surroundings, land));
  const piers = createModernPiers(world.map.piers ?? []);
  if (piers) group.add(piers);
  scenery = { group, land, detailed: [forest, reeds, shore], reedBed: reeds.bed };
  built.set(world, scenery);
  return scenery;
}

function disposeMeshes(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    if (o instanceof THREE.InstancedMesh) o.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of materials) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  });
}

function disposeScenery(scenery: Scenery): void {
  scenery.group.removeFromParent();
  disposeMeshes(scenery.group);
}

/** Vapauttaa kaikki rakennetut maisemat, kun ilme vaihtuu pois Modernista. */
export function releaseScenery(): void {
  for (const s of built.values()) disposeScenery(s);
  built.clear();
}

/**
 * Modernin ilmeen maisema kohtauksessa (#650): maasto ja rantapenkka, puut,
 * kaislat, rantakivet, mökit ja laiturit sekä pohjan kivet muotoiltuina
 * malleina. Retron vastaavat osat piilotetaan siksi aikaa, ja moderni maisema
 * näkyy sekä kalastajan silmin että ylhäältä.
 *
 * Maisema kulkee jaetun maailman mukana (`StaticWorld.always`), joten peli
 * siirtää sen kohtauksesta toiseen eikä vapauta sitä kisan päättyessä.
 */
export class SceneryLook {
  private world: StaticWorld | null = null;
  private scenery: Scenery | null = null;
  private bedSource: BottomSource | null = null;
  private bed: THREE.Mesh[] = [];
  /** Matalan veden kivet ja kasvit näkyvät vain ylhäältä. */
  private shallow: THREE.Mesh | null = null;
  /** Retron osat, jotka moderni maisema korvaa. */
  private replaced: THREE.Object3D[] = [];
  /** Näistä peli näyttää Retrossa vain ylhäältä (saarten kannet ja kaislikon kuvio). */
  private topOnly: THREE.Object3D[] = [];
  private frames = 0;
  private ortho = false;

  constructor(private readonly scene: THREE.Scene) {}

  update(camera: THREE.Camera, quality: LookQuality): void {
    if (this.frames++ % FIND_FRAMES === 0) this.find();
    this.ortho = camera instanceof THREE.OrthographicCamera;
    // Peli vaihtaa osan näkyvyyttä näkymän mukana, joten ne piilotetaan joka ruudulla.
    for (const o of this.replaced) o.visible = false;
    for (const o of this.topOnly) o.visible = false;
    if (this.shallow) this.shallow.visible = this.ortho;
    const scenery = this.scenery;
    if (!scenery) return;
    scenery.reedBed.visible = this.ortho;
    const range = QUALITY[quality].detailRange;
    for (const part of scenery.detailed) part.update(camera, range);
  }

  private find(): void {
    const world = staticWorldIn(this.scene);
    const source = bottomIn(this.scene);
    if (world === this.world && source === this.bedSource) return;
    this.restore();
    this.world = world;
    this.bedSource = source;
    if (world) {
      const scenery = (this.scenery = sceneryFor(world));
      world.always.add(scenery.group);
      // Maalla seisova kalastaja (#457) on modernin rantapenkan päällä.
      world.ground.overlay = (p) => scenery.land.heightAt(p);
      this.replaced.push(
        world.pov,
        world.top,
        ...world.always.children.filter((c) => c !== this.scenery?.group),
      );
      this.topOnly =
        this.scene
          .getObjectByName('lake')
          ?.children.filter((c) => c.name === 'island' || c.name === 'reeds') ?? [];
    }
    if (source) {
      const { rocks, shallow } = createLakeBed(source);
      this.shallow = shallow;
      this.bed = [rocks, shallow].filter((m) => m !== null);
      // Pohjan ryhmässä kappaleet eivät heitä varjoa, ja peli vapauttaa ne kisan päättyessä.
      if (this.bed.length) source.group.add(...this.bed);
      this.replaced.push(
        ...source.group.children.filter((c) => !this.bed.includes(c as THREE.Mesh)),
      );
    }
  }

  private restore(): void {
    this.scenery?.group.removeFromParent();
    this.scenery = null;
    if (this.world) this.world.ground.overlay = null;
    for (const m of this.bed) {
      m.removeFromParent();
      disposeMeshes(m);
    }
    this.bed = [];
    this.shallow = null;
    for (const o of this.replaced) o.visible = true;
    for (const o of this.topOnly) o.visible = this.ortho;
    this.replaced = [];
    this.topOnly = [];
  }

  dispose(): void {
    this.restore();
    this.world = null;
    this.bedSource = null;
  }
}
