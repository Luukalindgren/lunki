import * as THREE from 'three';
import {
  BOAT_HULL,
  CRAFTS,
  LaunchStage,
  SEAT_OFFSET,
  launchedPos,
  type BoatLaunch,
  type ShoreWater,
} from '@lunki/shared';
import type { BoatPose } from '../net/netWorld';
import { toWorld } from '../world/lakeMesh';
import { groundRest } from './groundRest';
import { playerColorMaterial } from './playerColor';

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
/**
 * Limisaumaiset kylkilankut: kukin lankku on alempaa leveämpi (LAP), joten
 * saumat näkyvät varjoviivoina, ja alemmat lankut ovat kiinteästi tummempia.
 */
const STRAKE_SHADE = [0.62, 0.85, 1] as const;
/** Sauman varjo lankun alareunassa: tummempi maali ja korkeus (m). */
const SEAM_SHADE = 0.45;
const SEAM = 0.03;
const LAP = 0.022;
/** Reunalista työntyy ylimmän lankun ulkopuolelle (m). */
const RAIL_OUT = 0.05;
/** Hankaimet soutajan vieressä ja airon pituus (m). */
const OARLOCK_X = 0.3;
const OAR = 2.3;

// Puuvene: sisäpinta vaaleampaa ruskeaa kuin pohja ja tuhdot. Varjostus
// palettirampeilla (SHADE_RAMPS): auringon puoli vaalea ja varjon puoli
// tummempi ruskea; tavallinen valaistus pyöristyi paletissa keltaiseksi.
const COLOR = { lining: 0x8a6a42, wood: 0x5e432b, oar: 0xb98a4e } as const;
/** Pohjavesi täyttökisan veneessä: järven sininen (harmaa sävy pyöristyi harmaaksi). */
const BILGE_COLOR = 0x2b7aa6;

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

/**
 * Tumma varjojuova kyljessä korkeudella y: lankun limisauman tai reunalistan
 * alla. `inset` = kyljen ääriviiva, jonka päälle juova tulee.
 */
function seam(inset: number, y: number, color: number): THREE.Mesh {
  const band = outline(inset - 0.006);
  band.holes.push(outline(WALL * 0.4));
  const mesh = new THREE.Mesh(
    liftNormals(extrude(band, SEAM), 100),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(SEAM_SHADE) }),
  );
  mesh.name = 'shell';
  mesh.position.y = y;
  return mesh;
}

/** Monikulmion puolileveys kohdassa x (suurin |y| pystysuoran leikkauksista). */
function halfWidthAt(poly: readonly THREE.Vector2[], x: number): number {
  let half = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    const t = (x - a.x) / (b.x - a.x);
    half = Math.max(half, Math.abs(a.y + (b.y - a.y) * t));
  }
  return half;
}

export function createBoatMesh(color: number): THREE.Group {
  const group = new THREE.Group();
  const hullMat = playerColorMaterial(COLOR.lining);
  const wood = playerColorMaterial(COLOR.wood);

  // Laidat kahtena kerroksena: ulkokuori soutajan värillä maalattuina
  // lankkuina, jotta vene tunnistetaan kaukaa kuten rengas, ja sisäpinta
  // puuta. Normaalit ylös kallistettuina pinnat pysyvät varjossakin värissään.
  const height = (GUNWALE + 0.1) / STRAKE_SHADE.length;
  STRAKE_SHADE.forEach((shade, k) => {
    const skin = outline(-k * LAP);
    skin.holes.push(outline(WALL * 0.4));
    const plank = new THREE.Mesh(
      // Alempi reuna jää edellisen lankun päälle: sauma varjostuu.
      liftNormals(extrude(skin, height + (k ? 0.015 : 0)), 0.6),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(shade) }),
    );
    plank.name = 'shell';
    plank.position.y = -0.1 + k * height - (k ? 0.015 : 0);
    group.add(plank);
    // Lankun alle varjo: palettiin kvantisoitu kuva ei näytä pelkkää sävyeroa.
    if (k) group.add(seam(-(k - 1) * LAP, -0.1 + k * height - 0.015 - SEAM, color));
  });
  const lining = outline(WALL * 0.4);
  lining.holes.push(outline(WALL));
  const hull = new THREE.Mesh(extrude(lining, GUNWALE + 0.1), hullMat);
  hull.position.y = -0.1;
  group.add(hull);
  const floor = new THREE.Mesh(extrude(outline(WALL), 0.02), wood);
  floor.position.y = FLOOR;
  group.add(floor);

  // Reunalista soutajan värillä työntyy kyljen ulkopuolelle kuten oikeissa
  // veneissä; väri näkyy myös ylhäältä ja veneen sisältä.
  const rim = outline(-(STRAKE_SHADE.length - 1) * LAP - RAIL_OUT);
  rim.holes.push(outline(WALL * 0.6));
  // Lista on ohut: sen kaikki pinnat valaistaan kuin yläpinta, ettei reuna mustu varjossa.
  const strip = new THREE.Mesh(
    liftNormals(extrude(rim, 0.06), 100),
    new THREE.MeshLambertMaterial({ color }),
  );
  strip.name = 'stripe';
  strip.position.y = GUNWALE - 0.01;
  group.add(strip, seam(-(STRAKE_SHADE.length - 1) * LAP, GUNWALE - 0.01 - SEAM, color));

  // Tuhdot: perä, soutaja ja keula, laidasta laitaan rungon levyisinä
  // (keulan kapeneva runko ei saa jäädä tuhdon sisään).
  const inside = outline(WALL).getPoints(12);
  for (const x of [SEAT_OFFSET, 0, -SEAT_OFFSET]) {
    const width = 2 * Math.min(halfWidthAt(inside, x - 0.14), halfWidthAt(inside, x + 0.14));
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, width), wood);
    seat.position.set(x, 0.3, 0);
    group.add(seat);
  }

  // Ankkuri keulan pohjalla, kun se ei ole vedessä (#355).
  const stowed = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.12, 0.22),
    new THREE.MeshLambertMaterial({ color: 0x3a3a3a }),
  );
  stowed.name = 'anchorStowed';
  stowed.position.set(CRAFTS.boat.anchorAt + 0.3, FLOOR + 0.08, 0);
  group.add(stowed);

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

/** Veden pinta täyden veneen pohjasta (m): vähän laidan alapuolella. */
const BILGE_TOP = GUNWALE * 0.75;

/**
 * Pohjavesi täyttökisan veneessä (#458): keulan ja perän puolikkaat omina
 * pintoinaan, jotta äyskäröinnin edistyminen näkyy osittain.
 */
function addBilge(mesh: THREE.Group): void {
  const mat = playerColorMaterial(BILGE_COLOR);
  const parts: [number, number][] = [
    [BOW_X * 0.62, 0],
    [0, STERN_X - WALL * 2],
  ];
  parts.forEach(([from, to], i) => {
    const plane = new THREE.Mesh(
      new THREE.BoxGeometry(to - from, 0.02, BOAT_HULL.beam * (i === 0 ? 0.62 : 0.78)),
      mat,
    );
    plane.name = i === 0 ? 'bilgeBow' : 'bilgeStern';
    plane.position.x = (from + to) / 2;
    plane.visible = false;
    mesh.add(plane);
  });
}

/** Rannalla (#458) airot irti ja pohjavesi osien veden mukaan; vesillä ennallaan. */
function showLaunch(mesh: THREE.Group, launch: BoatLaunch | undefined): void {
  for (const c of mesh.children) if (c.name === 'oar') c.visible = !launch;
  (['bilgeBow', 'bilgeStern'] as const).forEach((name, i) => {
    const plane = mesh.getObjectByName(name)!;
    const k = launch && launch.full > 0 ? launch.water[i]! / launch.full : 0;
    plane.visible = k > 0;
    plane.position.y = FLOOR + (BILGE_TOP - FLOOR) * k;
  });
}

/** Rannalla olevan veneen ulottuma rinteen lukemiseen soutajan kohdalta (m). */
const BEACHED_REACH = { length: BOAT_HULL.length * 0.4, width: HALF_BEAM * 0.8 } as const;

/** Työntö vesille (#458): vene liukuu rannalta veteen keula edellä. */
const SLIDE = { time: 1.2, dip: 0.12, sink: 0.08 } as const;

interface BoatEntry {
  mesh: THREE.Group;
  color: number;
  /** Viimeksi piirretty vesillelaskun vaihe (null = vesillä). */
  stage: number | null;
  /** Liuku rannalta veteen: lähtöasento ja alkuhetki (s). */
  slide?: { from: THREE.Vector3; fromQ: THREE.Quaternion; t0: number };
}

/**
 * Vene liukuu rannalta kelluvaan asentoonsa (`mesh` on jo perillä): alussa
 * hitaasti kuin työnnettynä, keula painuu veteen ja nousee, ja vene keinahtaa.
 */
function slide(e: BoatEntry, now: number): void {
  const s = e.slide!;
  const u = Math.min(1, (now - s.t0) / SLIDE.time);
  if (u >= 1) {
    delete e.slide;
    return;
  }
  const k = u * u * (3 - 2 * u);
  const to = e.mesh.position.clone();
  const toQ = e.mesh.quaternion.clone();
  e.mesh.position.lerpVectors(s.from, to, k);
  // Keula kastuu: vene painuu ja nousee kerran veteen osuessa.
  e.mesh.position.y -= SLIDE.sink * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.4) / 0.6)));
  e.mesh.quaternion.slerpQuaternions(s.fromQ, toQ, k);
  const dip = SLIDE.dip * Math.sin(Math.PI * u) * (1 - u);
  e.mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, dip));
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Kaikki kisan veneet, myös oma. */
export class BoatsView {
  readonly group = new THREE.Group();
  /** Maanpinta (POV:ssa maasto, ylhäältä 0): rannalla vene myötäilee rinnettä (#458). */
  heightAt: (p: { x: number; y: number }) => number = () => 0;
  /** Järvi: työnnetty vene piirretään vesille jo airoja kiinnitettäessä. */
  water: ShoreWater | null = null;
  private readonly boats = new Map<number, BoatEntry>();

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
        e = { mesh: createBoatMesh(b.color), color: b.color, stage: b.launch?.stage ?? null };
        addBilge(e.mesh);
        this.boats.set(b.boat, e);
        this.group.add(e.mesh);
      }
      const afloat = b.launch && b.launch.stage >= LaunchStage.oars && this.water;
      const target = afloat ? launchedPos(b, this.water!) : null;
      if (b.launch && target) {
        // Työnnetty vene kelluu jo vesirajassa, kun airoja kiinnitetään.
        if (e.stage !== null && e.stage < LaunchStage.oars)
          e.slide = {
            from: e.mesh.position.clone(),
            fromQ: e.mesh.quaternion.clone(),
            t0: performance.now() / 1000,
          };
        e.mesh.position.copy(toWorld(target, 0));
        e.mesh.rotation.set(0, b.heading, 0);
        if (e.slide) slide(e, performance.now() / 1000);
      } else if (b.launch) {
        // Rannalla vene lepää rinteen suuntaisena eikä uppoa maan sisään.
        const rest = groundRest(b.pos, b.heading, this.heightAt, BEACHED_REACH);
        e.mesh.position.copy(toWorld(b.pos, rest.lift));
        e.mesh.quaternion.copy(rest.quaternion);
      } else {
        e.mesh.position.copy(toWorld(b.pos, b.lift ?? 0));
        e.mesh.rotation.set(b.tumble ?? b.roll ?? 0, b.heading, 0);
      }
      e.stage = b.launch?.stage ?? null;
      if (!b.launch) delete e.slide;
      animateOars(e.mesh, b.kickPhase);
      e.mesh.getObjectByName('anchorStowed')!.visible = !b.anchor;
      showLaunch(e.mesh, b.launch);
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
