import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE,
  EMOTE_DURATION,
  TUBE_RADIUS,
  type Appearance,
  type EmoteId,
} from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import { playerColorMaterial, setPlayerColor } from './playerColor';
import { REST_POSE, bendRod, type RodPose } from './rodMotion';

/** Räpylöiden lepokohta renkaan etureunan edessä (paikallinen x), korkeus ja pituus. */
const FIN_X = TUBE_RADIUS + 0.15;
const FIN_Y = 0.05;
const FIN_LENGTH = 0.5;
/** Vartalon yläreuna istuimesta (hartioiden alareuna on 0,45 m). */
const TORSO_TOP = 0.46;
/** Renkaassa polvet siimatason alla ja jalkojen etäisyys keskilinjasta. */
const KNEE = { x: 0.4, y: 0.2 };
const LEG_Z = 0.18;
/** Renkaan putken keskilinjan säde ja putken paksuus (säde). */
export const TUBE_CENTER = TUBE_RADIUS * 0.72;
const TUBE_THICK = TUBE_RADIUS * 0.28;
/** Sivuponttoonien kärkien etäisyys eteen kalastajasta. */
export const PONTOON_TIP = TUBE_RADIUS * 0.7;
/** Renkaan putken keskilinjan korkeus. */
export const TUBE_LIFT = 0.15;
/** Istuinponttooni: keskikohta (x), alareuna (y), pituus ja paksuus (m). */
export const SEAT = { x: -0.18, y: -0.02, length: 0.46, height: 0.14 } as const;
const SEAT_COLOR = 0x5f6b78;

/**
 * U-muotoinen kelluntarengas ja kalastaja ylhäältä katsottuna. Paikallisessa
 * koordinaatistossa katse osoittaa +x-suuntaan; ryhmää käännetään y-akselin
 * ympäri headingin mukaan. Kuten oikeassa renkaassa, jalat ja räpylät ovat
 * kalastajan edessä samalla puolella kuin vapa ja heittosuunta: potkut
 * työntävät vettä eteen, joten rengas kulkee selkä edellä.
 */
export function createTubeMesh(appearance: Appearance = DEFAULT_APPEARANCE): THREE.Group {
  const group = new THREE.Group();

  // U-muotoinen rengas: kaari kalastajan takana ja sivuponttoonit, joiden
  // kärjet jatkuvat siimatason ohi eteen. Etupää on avoin jaloille.
  // Täyttökisan ponttoonit (#458, Luuka): U on jaettu keskeltä kahdeksi
  // peilikuvapuoliskoksi (0 vasen, 1 oikea: puolet takakaaresta, kylki ja
  // kärki), ja niiden välissä on istuin (2).
  const tubeMat = playerColorMaterial(appearance.tube);
  for (const [k, z] of [
    [0, -TUBE_CENTER],
    [1, TUBE_CENTER],
  ] as const) {
    // Neljännes takakaaresta: kaari alkaa kyljestä (k 0) tai takaa (k 1).
    const arc = new THREE.TorusGeometry(TUBE_CENTER, TUBE_THICK, 6, 4, Math.PI / 2);
    arc.rotateZ(Math.PI / 2 + (k * Math.PI) / 2);
    arc.rotateX(-Math.PI / 2);
    const side = new THREE.CylinderGeometry(TUBE_THICK, TUBE_THICK, PONTOON_TIP, 6);
    side.rotateZ(Math.PI / 2);
    side.translate(PONTOON_TIP / 2, 0, z);
    const tip = new THREE.SphereGeometry(TUBE_THICK, 6, 4);
    tip.translate(PONTOON_TIP, 0, z);
    for (const geometry of [arc, side, tip]) {
      const part = new THREE.Mesh(geometry, tubeMat);
      part.name = 'tube';
      part.userData.pontoon = k;
      part.position.y = TUBE_LIFT;
      group.add(part);
    }
  }
  // Istuin puoliskojen välissä takakaaren edessä: kalastaja istuu sen päällä.
  // Tumma kangas erottuu renkaan väristä, kun se lässähtää ja täyttyy.
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(SEAT.length, SEAT.height, (TUBE_CENTER - TUBE_THICK * 0.6) * 2),
    playerColorMaterial(SEAT_COLOR),
  );
  seat.geometry.translate(0, SEAT.height / 2, 0);
  seat.name = 'seat';
  seat.userData.pontoon = 2;
  seat.position.set(SEAT.x, SEAT.y, 0);
  group.add(seat);

  // Siimataso reisien päällä ponttoonien välissä, kuten POV-näkymässä.
  const apronTo = PONTOON_TIP - TUBE_THICK * 0.6;
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(apronTo, 0.03, (TUBE_CENTER - TUBE_THICK) * 2),
    new THREE.MeshLambertMaterial({ color: 0x1c232b }),
  );
  apron.position.set(apronTo / 2, 0.32, 0);
  apron.name = 'apron';
  group.add(apron);

  // Hartiat poikittain katsesuuntaan nähden
  const shirtMat = playerColorMaterial(appearance.shirt);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.75), shirtMat);
  shoulders.name = 'shirt';
  shoulders.position.y = 0.6;
  group.add(shoulders);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshLambertMaterial({ color: SKIN }),
  );
  head.position.set(0.04, 0.9, 0);
  group.add(head);

  for (const part of createHat(shirtMat)) group.add(part);

  // Vartalo hartioista istuimelle: sama renkaassa ja veneen tuhdolla, jotta
  // muiden silmin hartioiden alta ei näy läpi.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.26, TORSO_TOP, 0.56), shirtMat);
  torso.name = 'shirt';
  torso.position.y = TORSO_TOP / 2;
  group.add(torso);

  // Renkaassa reidet istuimelta eteen siimatason alle ja sääret polvista
  // viistosti alas räpylöihin (animateFins kääntää säären räpylän perään).
  const legMat = new THREE.MeshLambertMaterial({ color: 0x3b4630 });
  const finMat = playerColorMaterial(appearance.fins);
  for (const z of [-LEG_Z, LEG_Z]) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(KNEE.x + 0.04, 0.14, 0.16), legMat);
    thigh.position.set((KNEE.x - 0.04) / 2, KNEE.y, z);
    thigh.name = 'leg';
    group.add(thigh);
    const shinGeometry = new THREE.BoxGeometry(1, 0.13, 0.13);
    shinGeometry.translate(0.5, 0, 0);
    const shin = new THREE.Group();
    shin.name = 'leg';
    shin.userData.shin = true;
    shin.position.set(KNEE.x, KNEE.y, z);
    shin.add(new THREE.Mesh(shinGeometry, legMat));
    group.add(shin);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(FIN_LENGTH, 0.05, 0.22), finMat);
    fin.position.set(FIN_X, FIN_Y, z);
    fin.name = 'fin';
    group.add(fin);
  }

  // Veneessä istuvan jalat (#263): reidet tuhdolta eteen ja sääret pohjaan.
  for (const part of createSeatedLegs(legMat)) group.add(part);

  // Kädet käsimerkkejä varten (#228): vasen on vapaa, oikea pitää vapaa.
  const skin = new THREE.MeshLambertMaterial({ color: SKIN });
  for (const side of [-1, 1] as const) group.add(createArm(side, shirtMat, skin));

  // Virveli osoittaa eteen; aihio on paloina, jotta se taipuu (#368).
  const rod = new THREE.Group();
  rod.name = 'rod';
  const rodMat = new THREE.MeshLambertMaterial({ color: 0xf6d04d });
  for (let i = 0; i < ROD_SEGMENTS; i++)
    rod.add(
      new THREE.Mesh(new THREE.BoxGeometry(ROD_LENGTH / ROD_SEGMENTS + 0.04, 0.08, 0.08), rodMat),
    );
  group.add(rod);
  aimRod(group);

  setSeated(group, false);
  animateFins(group, 0);
  return group;
}

const ROD_LENGTH = 2.1;
const ROD_SEGMENTS = 6;
/** Lepoasennon nousukulma (rad). */
const ROD_REST = 0.25;
/** Vapa kääntyy kalaa kohti enintään näin paljon (rad); takana olevaa kalaa väsytetään sivulta. */
const ROD_YAW = 1.2;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const rodPts = Array.from({ length: ROD_SEGMENTS + 1 }, () => new THREE.Vector3());
const rodV = { dir: new THREE.Vector3(), pull: new THREE.Vector3(), d: new THREE.Vector3() };

/**
 * Vavan asento (#368): `pose` nostaa vapaa ja taivuttaa aihiota vedon
 * suuntaan, ja kuormitettu vapa kääntyy kalaa kohti. Kahva pysyy kädessä.
 * Palauttaa kärjen maailmassa (`out`), josta siima lähtee.
 */
export function aimRod(
  group: THREE.Object3D,
  pose: RodPose = REST_POSE,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const rod = group.getObjectByName('rod');
  if (!rod) return out;
  group.updateMatrixWorld(true);
  const pitch = ROD_REST + pose.lift;
  const target = pose.pull
    ? group.worldToLocal(toWorld(pose.pull, -Math.max(0, pose.pull.depth)))
    : null;
  const yaw = target
    ? Math.max(-ROD_YAW, Math.min(ROD_YAW, Math.atan2(-target.z, target.x))) *
      Math.min(1, pose.bend / 0.6)
    : 0;
  const { dir, pull, d } = rodV;
  dir.set(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.sin(yaw));
  let pullDir: THREE.Vector3 | null = null;
  if (target) {
    pull.copy(target).sub(d.copy(ROD_BUTT).addScaledVector(dir, ROD_LENGTH));
    if (pull.lengthSq() > 1e-6) pullDir = pull.normalize();
  }
  bendRod(ROD_BUTT, dir, ROD_LENGTH, pullDir, pose.bend, pose.flex, rodPts);
  rod.children.forEach((seg, i) => {
    const a = rodPts[i]!;
    const b = rodPts[i + 1]!;
    seg.position.lerpVectors(a, b, 0.5);
    seg.quaternion.setFromUnitVectors(X_AXIS, d.subVectors(b, a).normalize());
  });
  return group.localToWorld(out.copy(rodPts[ROD_SEGMENTS]!));
}

const SKIN = 0xe0cf9c;
/** Olkavarresta kämmeneen (m). Kädet ovat hieman liioitellun isot, jotta eleet erottaa kaukaa. */
export const ARM_LENGTH = 0.5;
const HAND = 0.22;
/** Lepoasento: käsivarsi eteen alas (kulma pystystä, rad), oikea vavan kahvalla. */
const REST = { left: 0.6, right: 1.05 };
/** Olkapää (oikea; vasen peilikuvana). */
const SHOULDER = { x: 0.05, y: 0.72, z: 0.42 };
/** Kahvan pää: oikean kämmenen keskeltä vavan suuntaa taaksepäin. */
const ROD_GRIP = 0.14;
const HAND_REACH = ARM_LENGTH + HAND / 2;
export const ROD_BUTT = new THREE.Vector3(
  SHOULDER.x + HAND_REACH * Math.sin(REST.right) - ROD_GRIP * Math.cos(ROD_REST),
  SHOULDER.y - HAND_REACH * Math.cos(REST.right) - ROD_GRIP * Math.sin(ROD_REST),
  SHOULDER.z,
);

function createArm(side: -1 | 1, shirt: THREE.Material, skin: THREE.Material): THREE.Group {
  const arm = new THREE.Group();
  arm.name = side < 0 ? 'arm-left' : 'arm-right';
  arm.position.set(SHOULDER.x, SHOULDER.y, side * SHOULDER.z);
  arm.rotation.z = side < 0 ? REST.left : REST.right;
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, ARM_LENGTH, 0.13), shirt);
  sleeve.name = 'shirt';
  sleeve.position.y = -ARM_LENGTH / 2;
  const hand = new THREE.Mesh(new THREE.BoxGeometry(HAND, HAND, HAND), skin);
  hand.position.y = -ARM_LENGTH - HAND / 2;
  // Peukalo ja keskisormi osoittavat käsivarren "yläpuolelle" (paikallinen +x):
  // eteen ojennetulla kädellä ylös.
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.08), skin);
  thumb.name = 'thumb';
  thumb.position.set(HAND / 2 + 0.08, -ARM_LENGTH - HAND / 2, 0);
  thumb.visible = false;
  const finger = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.07), skin);
  finger.name = 'finger';
  finger.position.set(HAND / 2 + 0.1, -ARM_LENGTH - HAND / 2, 0);
  finger.visible = false;
  arm.add(sleeve, hand, thumb, finger);
  return arm;
}

/**
 * Kalastushattu paidan värillä: matala pyöreä kupu, alas viettävät lierit ja
 * musta kaulanauha lieriltä leuan alle.
 */
function createHat(shirt: THREE.Material): THREE.Mesh[] {
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.06, 10), shirt);
  brim.position.set(0.04, 0.975, 0);
  const dome = new THREE.SphereGeometry(0.16, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.65, 1);
  const crown = new THREE.Mesh(dome, shirt);
  crown.position.set(0.04, 0.995, 0);
  for (const part of [brim, crown]) part.name = 'shirt';
  // Ohut nauha kulkee pään pintaa pitkin lieriltä leuan taakse ja leuan alle.
  const cordMat = new THREE.MeshLambertMaterial({ color: 0x0b0f14 });
  const cords: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const path = CORD_PATH.map(([x, y, z]) => new THREE.Vector3(x, y, side * z));
    for (let i = 1; i < path.length; i++) cords.push(cordSegment(path[i - 1]!, path[i]!, cordMat));
  }
  return [brim, crown, ...cords];
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Kaulanauhan kulku (x, y, |z|): lieriltä pään sivua alas ja leuan alle, pään ulkopuolella. */
const CORD_PATH = [
  [0.04, 0.955, 0.2],
  [0.06, 0.78, 0.155],
  [0.13, 0.765, 0],
] as const;
const CORD = 0.015;

function cordSegment(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const cord = new THREE.Mesh(
    new THREE.BoxGeometry(CORD, from.distanceTo(to) + CORD, CORD),
    material,
  );
  cord.position.lerpVectors(from, to, 0.5);
  cord.quaternion.setFromUnitVectors(Y_AXIS, to.clone().sub(from).normalize());
  return cord;
}

/** Käden asento: kulma pystystä eteen (z) ja sivulle (x). */
interface ArmPose {
  forward: number;
  side: number;
}

/** Eleen asento ajanhetkellä `t` (s): vasen ja oikea käsi (null = lepo). */
function emotePose(emote: EmoteId, t: number): { left: ArmPose; right: ArmPose | null } {
  switch (emote) {
    case 'wave':
      return { left: { forward: 2.7, side: 0.5 * Math.sin(t * 10) }, right: null };
    case 'thumbsUp':
      return { left: { forward: 1.7, side: 0 }, right: null };
    case 'middleFinger':
      return { left: { forward: 2.1, side: 0 }, right: null };
    case 'fist':
      return { left: { forward: 2.8 + 0.3 * Math.sin(t * 14), side: 0 }, right: null };
    case 'comeHere':
      return { left: { forward: 1.5 + 0.45 * Math.sin(t * 8), side: 0 }, right: null };
    case 'bigFish': {
      // Kädet sivuille: "näin iso!" ja hieman levenevä.
      const spread = 1.3 + 0.15 * Math.sin(t * 5);
      return { left: { forward: 0.4, side: spread }, right: { forward: 0.4, side: spread } };
    }
  }
}

/**
 * Käsimerkin animaatio (#228): `emote` ja kulunut aika (s), null = kädet
 * levossa. Ele alkaa ja päättyy pehmeästi.
 */
export function animateEmote(group: THREE.Group, emote: EmoteId | null, t: number): void {
  const blend = emote ? Math.max(0, Math.min(1, t / 0.25, (EMOTE_DURATION - t) / 0.25)) : 0;
  const pose = emote ? emotePose(emote, t) : null;
  for (const child of group.children) {
    const left = child.name === 'arm-left';
    if (!left && child.name !== 'arm-right') continue;
    const side = left ? -1 : 1;
    const rest = left ? REST.left : REST.right;
    const p = pose ? (left ? pose.left : pose.right) : null;
    child.rotation.z = rest + ((p?.forward ?? rest) - rest) * blend;
    // Sivulle nosto: vasen käsi -z-suuntaan, oikea +z.
    child.rotation.x = -side * (p?.side ?? 0) * blend;
    for (const part of child.children) {
      if (part.name === 'thumb') part.visible = left && blend > 0.5 && emote === 'thumbsUp';
      if (part.name === 'finger') part.visible = left && blend > 0.5 && emote === 'middleFinger';
    }
  }
}

/** Veneessä kalastaja istuu tuhdolla näin paljon renkaan istuinta ylempänä (m). */
export const SEATED_LIFT = 0.3;
/** Veneen pohja istujan paikallisessa koordinaatistossa (tuhto 0,32 m, pohja 0,1 m). */
const BOAT_FLOOR = 0.1 - SEATED_LIFT;

/**
 * Tuhdolla istuvan jalat laatikoina: reidet eteen ja sääret alas veneen
 * pohjaan, jotta kalastaja ei leiju. Piilossa renkaassa (setSeated).
 */
function createSeatedLegs(legMat: THREE.Material): THREE.Mesh[] {
  const parts: THREE.Mesh[] = [];
  const boot = new THREE.MeshLambertMaterial({ color: 0x2a2622 });
  for (const z of [-0.13, 0.13]) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.16), legMat);
    thigh.position.set(0.16, 0.09, z);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16 - BOAT_FLOOR, 0.14), legMat);
    shin.position.set(0.34, (0.16 + BOAT_FLOOR) / 2, z);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.14), boot);
    foot.position.set(0.4, BOAT_FLOOR + 0.03, z);
    parts.push(thigh, shin, foot);
  }
  for (const part of parts) part.userData.seated = true;
  return parts;
}

/** Veneessä kalastaja istuu tuhdolla: ei rengasta, räpylöitä eikä sääriä vedessä (#263). */
export function setSeated(group: THREE.Group, seated: boolean): void {
  for (const child of group.children) {
    if (TUBE_PARTS.has(child.name)) child.visible = !seated;
    else if (child.userData.seated) child.visible = seated;
  }
}

const TUBE_PARTS = new Set(['tube', 'seat', 'fin', 'apron', 'leg']);

/** Heiluttaa räpylöitä potkurytmin mukaan; sääret seuraavat räpylän perää. */
export function animateFins(group: THREE.Group, kickPhase: number): void {
  let fins = 0;
  let shins = 0;
  for (const child of group.children) {
    if (child.name === 'fin') {
      child.position.x = finX(kickPhase, fins++);
    } else if (child.userData.shin) {
      const dx = finX(kickPhase, shins++) - FIN_LENGTH * 0.4 - KNEE.x;
      const dy = FIN_Y + 0.02 - KNEE.y;
      child.rotation.z = Math.atan2(dy, dx);
      child.scale.x = Math.hypot(dx, dy);
    }
  }
}

function finX(kickPhase: number, i: number): number {
  return FIN_X + Math.sin((kickPhase + i * 0.5) * Math.PI * 2) * 0.25;
}

/** Vaihtaa renkaan, räpylöiden, paidan ja hatun värit (osat jakavat materiaalit). */
export function applyAppearance(group: THREE.Group, a: Appearance): void {
  group.traverse((child) => {
    const color =
      child.name === 'tube'
        ? a.tube
        : child.name === 'fin'
          ? a.fins
          : child.name === 'shirt'
            ? a.shirt
            : null;
    if (color !== null)
      setPlayerColor((child as THREE.Mesh).material as THREE.MeshLambertMaterial, color);
  });
}
