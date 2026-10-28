import * as THREE from 'three';
import { BOAT_HULL, SEAT_OFFSET } from '@lunki/shared';
import type { BoatPose } from '../net/netWorld';
import { toWorld } from '../world/lakeMesh';

/**
 * Soutuvene (#263). Paikallinen koordinaatisto kuten
 * `createTubeMesh`: +x soutajan katsesuuntaan eli perään, +y ylös, origo
 * vedenpinnalla soutajan kohdalla. Keula on soutajan selän takana (-x).
 */
const HALF_BEAM = BOAT_HULL.beam / 2;
/** Perälauta ja keulan kärki soutajasta (m). */
const STERN_X = SEAT_OFFSET + 0.45;
const BOW_X = STERN_X - BOAT_HULL.length;
/** Laidan korkeus ja paksuus, pohjan korkeus vedenpinnasta (m). */
const GUNWALE = 0.42;
const WALL = 0.07;
const FLOOR = 0.08;
/** Hankaimet soutajan vieressä ja airon pituus (m). */
const OARLOCK_X = 0.3;
const OAR = 2.3;

// Puuvene: laidat vaaleampaa ruskeaa kuin pohja ja tuhdot (varjossakin ruskea, ei harmaa).
const COLOR = { hull: 0xd2a56c, wood: 0x8a5a32, oar: 0xb98a4e } as const;

/** Rungon ääriviiva ylhäältä (x, z): perälauta suora, keula suippo. */
function outline(inset: number): THREE.Shape {
  const w = HALF_BEAM - inset;
  const shape = new THREE.Shape();
  // Shape on xy-tasossa; y kääntyy myöhemmin z-akseliksi.
  shape.moveTo(STERN_X - inset, -w * 0.85);
  shape.lineTo(STERN_X - inset, w * 0.85);
  shape.quadraticCurveTo(0.2, w * 1.08, BOW_X * 0.55, w * 0.8);
  shape.quadraticCurveTo(BOW_X * 0.9, w * 0.35, BOW_X + inset * 2, 0);
  shape.quadraticCurveTo(BOW_X * 0.9, -w * 0.35, BOW_X * 0.55, -w * 0.8);
  shape.quadraticCurveTo(0.2, -w * 1.08, STERN_X - inset, -w * 0.85);
  return shape;
}

/** Ääriviivasta pystyyn puristettu kappale: y = 0 … height. */
function extrude(shape: THREE.Shape, height: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 4,
  });
  // Puristus +z-suuntaan → ylös (+y), ääriviivan y → z.
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Kallistaa pintojen normaaleja ylöspäin (`lift` 0 = ennallaan, ≥ 10 = kaikki
 * ylös): varjon puolen pinnat eivät tummu mustiksi, kun aurinko on toisella
 * puolella. Valaistus seuraa yhä vuorokaudenaikaa, joten vene ei hehku yöllä.
 */
function liftNormals(g: THREE.BufferGeometry, lift: number): THREE.BufferGeometry {
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    v.y += lift;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export function createBoatMesh(color: number): THREE.Group {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: COLOR.hull });
  const wood = new THREE.MeshLambertMaterial({ color: COLOR.wood });

  // Laidat kahtena kerroksena: ulkokuori soutajan värillä, jotta vene
  // tunnistetaan kaukaa kuten rengas, ja sisäpinta puuta. Normaalit ylös
  // kallistettuina pinnat pysyvät varjossakin värissään.
  const skin = outline(0);
  skin.holes.push(outline(WALL * 0.4));
  const shell = new THREE.Mesh(
    liftNormals(extrude(skin, GUNWALE + 0.1), 1),
    new THREE.MeshLambertMaterial({ color }),
  );
  shell.name = 'shell';
  shell.position.y = -0.1;
  const lining = outline(WALL * 0.4);
  lining.holes.push(outline(WALL));
  const hull = new THREE.Mesh(liftNormals(extrude(lining, GUNWALE + 0.1), 1), hullMat);
  hull.position.y = -0.1;
  group.add(shell, hull);
  const floor = new THREE.Mesh(extrude(outline(WALL), 0.02), wood);
  floor.position.y = FLOOR;
  group.add(floor);

  // Reunalista soutajan värillä: väri näkyy myös ylhäältä ja veneen sisältä.
  const rim = outline(0);
  rim.holes.push(outline(WALL * 0.6));
  // Lista on ohut: sen kaikki pinnat valaistaan kuin yläpinta, ettei reuna mustu varjossa.
  const strip = new THREE.Mesh(
    liftNormals(extrude(rim, 0.05), 100),
    new THREE.MeshLambertMaterial({ color }),
  );
  strip.name = 'stripe';
  strip.position.y = GUNWALE;
  group.add(strip);

  // Tuhdot: perä, soutaja ja keula.
  for (const x of [SEAT_OFFSET, 0, -SEAT_OFFSET]) {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.04, BOAT_HULL.beam - WALL * 2 - 0.12),
      wood,
    );
    seat.position.set(x, 0.3, 0);
    group.add(seat);
  }

  // Airot hankaimista: kääntyvät vetojen tahdissa (animateOars).
  const oarMat = new THREE.MeshLambertMaterial({ color: COLOR.oar });
  for (const side of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.name = 'oar';
    pivot.userData.side = side;
    pivot.position.set(OARLOCK_X, GUNWALE + 0.04, side * (HALF_BEAM - 0.02));
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, OAR), oarMat);
    shaft.position.z = side * (OAR / 2 - 0.5);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.5), oarMat);
    blade.position.z = side * (OAR - 0.7);
    pivot.add(shaft, blade);
    group.add(pivot);
  }
  return group;
}

/**
 * Airot vetojen tahdissa: lavat vedessä vedon aikana ja ilmassa palatessa.
 * Levossa airot lepäävät veden päällä poikittain.
 */
export function animateOars(group: THREE.Group, kickPhase: number): void {
  const rowing = kickPhase !== 0;
  const a = kickPhase * Math.PI * 2;
  for (const child of group.children) {
    if (child.name !== 'oar') continue;
    const side = child.userData.side as number;
    // Soutaja vetää kahvoja kohti itseään (perään): lavat liikkuvat keulaan päin.
    child.rotation.y = rowing ? side * 0.55 * Math.cos(a) : 0;
    child.rotation.x = side * (rowing ? 0.12 + 0.1 * Math.sin(a) : 0.12);
  }
}

/** Kaikki kisan veneet, myös oma. */
export class BoatsView {
  readonly group = new THREE.Group();
  private readonly boats = new Map<number, { mesh: THREE.Group; color: number }>();

  update(poses: readonly BoatPose[]): void {
    const seen = new Set<number>();
    for (const b of poses) {
      seen.add(b.boat);
      let e = this.boats.get(b.boat);
      if (e && e.color !== b.color) {
        this.remove(b.boat);
        e = undefined;
      }
      if (!e) {
        e = { mesh: createBoatMesh(b.color), color: b.color };
        this.boats.set(b.boat, e);
        this.group.add(e.mesh);
      }
      e.mesh.position.copy(toWorld(b.pos, b.lift ?? 0));
      e.mesh.rotation.y = b.heading;
      e.mesh.rotation.x = b.tumble ?? b.roll ?? 0;
      animateOars(e.mesh, b.kickPhase);
    }
    for (const id of [...this.boats.keys()]) if (!seen.has(id)) this.remove(id);
  }

  private remove(id: number): void {
    const e = this.boats.get(id);
    if (!e) return;
    this.group.remove(e.mesh);
    e.mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.boats.delete(id);
  }

  dispose(): void {
    for (const id of [...this.boats.keys()]) this.remove(id);
  }
}
