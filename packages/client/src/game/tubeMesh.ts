import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE,
  EMOTE_DURATION,
  TUBE_RADIUS,
  type Appearance,
  type EmoteId,
} from '@lunki/shared';

/** Räpylöiden lepokohta renkaan etureunan edessä (paikallinen x). */
const FIN_X = TUBE_RADIUS + 0.15;
/** Renkaan putken keskilinjan säde ja putken paksuus (säde). */
const TUBE_CENTER = TUBE_RADIUS * 0.72;
const TUBE_THICK = TUBE_RADIUS * 0.28;
/** Sivuponttoonien kärkien etäisyys eteen kalastajasta. */
const PONTOON_TIP = TUBE_RADIUS * 0.7;

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
  const tubeMat = new THREE.MeshLambertMaterial({ color: appearance.tube });
  const back = new THREE.TorusGeometry(TUBE_CENTER, TUBE_THICK, 6, 8, Math.PI);
  back.rotateZ(Math.PI / 2);
  back.rotateX(-Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [back];
  for (const z of [-TUBE_CENTER, TUBE_CENTER]) {
    const pontoon = new THREE.CylinderGeometry(TUBE_THICK, TUBE_THICK, PONTOON_TIP, 6);
    pontoon.rotateZ(Math.PI / 2);
    pontoon.translate(PONTOON_TIP / 2, 0, z);
    const tip = new THREE.SphereGeometry(TUBE_THICK, 6, 4);
    tip.translate(PONTOON_TIP, 0, z);
    parts.push(pontoon, tip);
  }
  for (const geometry of parts) {
    const part = new THREE.Mesh(geometry, tubeMat);
    part.name = 'tube';
    part.position.y = 0.15;
    group.add(part);
  }

  // Siimataso reisien päällä ponttoonien välissä, kuten POV-näkymässä.
  const apronTo = PONTOON_TIP - TUBE_THICK * 0.6;
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(apronTo, 0.03, (TUBE_CENTER - TUBE_THICK) * 2),
    new THREE.MeshLambertMaterial({ color: 0x1c232b }),
  );
  apron.position.set(apronTo / 2, 0.32, 0);
  group.add(apron);

  // Hartiat poikittain katsesuuntaan nähden
  const shoulders = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.75),
    new THREE.MeshLambertMaterial({ color: appearance.shirt }),
  );
  shoulders.name = 'shirt';
  shoulders.position.y = 0.6;
  group.add(shoulders);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshLambertMaterial({ color: SKIN }),
  );
  head.position.set(0.04, 0.9, 0);
  group.add(head);

  // Lippalakin lippa näyttää katsesuunnan
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.04, 0.2),
    new THREE.MeshLambertMaterial({ color: 0xf6d04d }),
  );
  cap.position.set(0.2, 1.0, 0);
  group.add(cap);

  // Sääret istuimelta eteen renkaan yli ja räpylät niiden päässä
  const legMat = new THREE.MeshLambertMaterial({ color: 0x3b4630 });
  const finMat = new THREE.MeshLambertMaterial({ color: appearance.fins });
  for (const z of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(TUBE_RADIUS - 0.1, 0.14, 0.14), legMat);
    leg.position.set((TUBE_RADIUS + 0.2) / 2, 0.12, z);
    group.add(leg);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.22), finMat);
    fin.position.set(FIN_X, 0.05, z);
    fin.name = 'fin';
    group.add(fin);
  }

  // Kädet käsimerkkejä varten (#228): vasen on vapaa, oikea pitää vapaa.
  const skin = new THREE.MeshLambertMaterial({ color: SKIN });
  for (const side of [-1, 1] as const) group.add(createArm(side, appearance.shirt, skin));

  // Virveli osoittaa eteen
  const rod = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.08, 0.08),
    new THREE.MeshLambertMaterial({ color: 0xf6d04d }),
  );
  rod.rotation.z = 0.25;
  rod.position.set(1.1, 1.1, 0.38);
  rod.name = 'rod';
  group.add(rod);

  return group;
}

const SKIN = 0xe0cf9c;
/** Olkavarresta kämmeneen (m). Kädet ovat hieman liioitellun isot, jotta eleet erottaa kaukaa. */
const ARM_LENGTH = 0.5;
const HAND = 0.22;
/** Lepoasento: käsivarsi eteen alas (kulma pystystä, rad), oikea vavan kahvalla. */
const REST = { left: 0.6, right: 0.9 };

function createArm(side: -1 | 1, shirt: number, skin: THREE.Material): THREE.Group {
  const arm = new THREE.Group();
  arm.name = side < 0 ? 'arm-left' : 'arm-right';
  arm.position.set(0.05, 0.72, side * 0.42);
  arm.rotation.z = side < 0 ? REST.left : REST.right;
  const sleeve = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, ARM_LENGTH, 0.13),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
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

/** Heiluttaa räpylöitä potkurytmin mukaan. */
export function animateFins(group: THREE.Group, kickPhase: number): void {
  let i = 0;
  for (const child of group.children) {
    if (child.name !== 'fin') continue;
    const swing = Math.sin((kickPhase + i * 0.5) * Math.PI * 2) * 0.25;
    child.position.x = FIN_X + swing;
    i++;
  }
}

/** Vaihtaa renkaan, räpylöiden ja paidan värit (räpylät jakavat materiaalin). */
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
      ((child as THREE.Mesh).material as THREE.MeshLambertMaterial).color.setHex(color);
  });
}
