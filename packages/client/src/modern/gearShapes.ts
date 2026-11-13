import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ROD_COLOR } from '../game/rodModel';
import { mergeParts, paint, solid } from './shapes';

/** Osa yhdistettäväksi: ei indeksejä eikä kuvakoordinaatteja. */
function part(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const plain = geo.index ? geo.toNonIndexed() : geo;
  if (plain !== geo) geo.dispose();
  return solid(plain);
}

/**
 * Räpylä: jalkatasku kantapäässä, kärkeä kohti levenevä lapa pyöristetyin
 * kulmin ja loven kanssa sekä paksummat reunalistat. Mitat ja paikka tulevat
 * alkuperäisen muodon rajoista: kantapää on pienimmässä x:ssä ja kärki
 * suurimmassa. Osat ovat järjestyksessä alhaalta ylös, joten veden läpi
 * (ilman syvyystestiä) piirretty räpylä näkyy ylhäältä oikein.
 */
export function finShape(bounds: THREE.Box3): THREE.BufferGeometry {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const L = size.x;
  const W = size.z / 2;
  const T = Math.max(size.y, L * 0.09);

  const outline = new THREE.Shape();
  outline.moveTo(L * 0.22, -W * 0.4);
  outline.lineTo(L * 0.8, -W * 0.96);
  outline.quadraticCurveTo(L * 0.99, -W, L, -W * 0.7);
  outline.quadraticCurveTo(L * 0.97, -W * 0.25, L * 0.92, 0);
  outline.quadraticCurveTo(L * 0.97, W * 0.25, L, W * 0.7);
  outline.quadraticCurveTo(L * 0.99, W, L * 0.8, W * 0.96);
  outline.lineTo(L * 0.22, W * 0.4);
  outline.quadraticCurveTo(L * 0.12, 0, L * 0.22, -W * 0.4);
  const blade = new THREE.ExtrudeGeometry(outline, {
    depth: T * 0.3,
    bevelEnabled: true,
    bevelThickness: T * 0.12,
    bevelSize: W * 0.05,
    bevelSegments: 2,
    curveSegments: 6,
  });
  // Puristus +z-suuntaan → ylös (+y).
  blade.rotateX(-Math.PI / 2);
  blade.translate(0, T * 0.12, 0);
  const parts = [part(blade)];

  // Reunalistat lavan sivuilla kantapäästä kärkeen.
  for (const side of [-1, 1]) {
    const from = new THREE.Vector2(L * 0.26, side * W * 0.42);
    const to = new THREE.Vector2(L * 0.86, side * W * 0.93);
    const length = from.distanceTo(to);
    const width = W * 0.16;
    const rail = new RoundedBoxGeometry(length, T * 0.8, width, 2, Math.min(T * 0.8, width) * 0.45);
    rail.rotateY(-Math.atan2(to.y - from.y, to.x - from.x));
    rail.translate((from.x + to.x) / 2, T * 0.4, (from.y + to.y) / 2);
    parts.push(part(rail));
  }

  // Jalkatasku: litteä kumpu kantapäässä.
  const pocket = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  pocket.scale(L * 0.25, T * 1.1, W * 0.5);
  pocket.translate(L * 0.22, T * 0.2, 0);
  parts.push(part(pocket));

  // Viisteet levittävät lapaa: sovitetaan takaisin alkuperäisen muodon pituuteen ja leveyteen.
  const fin = mergeParts(parts);
  fin.computeBoundingBox();
  const made = fin.boundingBox!;
  fin.translate(-made.min.x, 0, 0);
  fin.scale(L / (made.max.x - made.min.x), 1, (W * 2) / (made.max.z - made.min.z));
  fin.translate(bounds.min.x, center.y - T / 2, center.z);
  return fin;
}

/**
 * Ponttoonin tumma päällinen: kaistale lieriön pinnan päällä lieriön omassa
 * kehyksessä (akseli y). `angle` on kaistaleen keskikohta kehällä ja `span`
 * sen leveys (rad); `from`–`to` on osuus pituudesta.
 */
export function padShape(
  radius: number,
  length: number,
  angle: number,
  span: number,
  from: number,
  to: number,
): THREE.BufferGeometry {
  const pad = new THREE.CylinderGeometry(
    radius * 1.04,
    radius * 1.04,
    length * (to - from),
    Math.max(6, Math.round(span * 10)),
    1,
    true,
    angle - span / 2,
    span,
  );
  pad.translate(0, length * ((from + to) / 2 - 0.5), 0);
  return pad;
}

/** Selkänoja istuimen takareunalla: `width` sivusuuntaan, pohja istuimen päällä (y = 0). */
export function backrestShape(width: number): THREE.BufferGeometry {
  const rest = new RoundedBoxGeometry(0.11, 0.4, width, 3, 0.05);
  rest.rotateZ(0.14);
  rest.translate(0, 0.2, 0);
  return rest;
}

/** Kalastajan iho (sama kuin kalastajan mallissa). */
const SKIN = 0xe0cf9c;

/** Vavan kahva kalastajan silmin (m, kelan kehyksessä: x vapaa pitkin eteen, y ylös, z oikealle). */
const GRIP = { butt: -0.38, seat: 0.035, fore: 0.075, radius: 0.0115 } as const;

/** Lieriö x-akselin suuntaan välille `from`–`to`; säde `r0` alussa ja `r1` lopussa. */
function along(from: number, to: number, r0: number, r1: number, color: number) {
  // Lieriön yläpää (+y) kääntyy alkuun (-x).
  const geo = new THREE.CylinderGeometry(r0, r1, to - from, 14);
  geo.rotateZ(Math.PI / 2);
  geo.translate((from + to) / 2, 0, 0);
  return paint(part(geo), () => color);
}

/** Pallosta venytetty pehmeä osa. */
function lump(
  center: readonly [number, number, number],
  radii: readonly [number, number, number],
  color: number,
) {
  const geo = new THREE.SphereGeometry(1, 14, 10);
  geo.scale(...radii);
  geo.translate(...center);
  return paint(part(geo), () => color);
}

/** Nyrkin keskikohta kahvalla: istukan takana, jotta kela näkyy käden edessä. */
const HAND = -0.085;

/**
 * Vavan kahva ja sitä pitävä oikea käsi kalastajan silmin: korkkikahva, kelan
 * istukka ja etukahva lieriöinä sekä nyrkki takakahvalla (peukalo päällä,
 * sormet vasemmalla puolella). Värit ovat kärjissä.
 */
export function gripShape(): THREE.BufferGeometry {
  const r = GRIP.radius;
  return mergeParts([
    along(GRIP.butt - 0.018, GRIP.butt, r * 1.2, r * 1.2, ROD_COLOR.corkShade),
    along(GRIP.butt, -GRIP.seat, r, r, ROD_COLOR.cork),
    along(-GRIP.seat, GRIP.seat, r * 1.08, r * 1.08, ROD_COLOR.seat),
    along(GRIP.seat, GRIP.fore, r, r * 0.6, ROD_COLOR.cork),
    // Kämmen ja rystyset kahvan oikealla puolella ja alla.
    lump([HAND - 0.004, -0.006, 0.014], [0.048, 0.033, 0.035], SKIN),
    // Peukalo kahvan päällä eteenpäin.
    lump([HAND + 0.022, 0.024, -0.002], [0.034, 0.011, 0.012], SKIN),
    // Sormet kiertävät kahvan vasemmalta puolelta.
    ...[-0.036, -0.013, 0.013, 0.036].map((x) =>
      lump([HAND + x, -0.008, -0.026], [0.0115, 0.022, 0.014], SKIN),
    ),
  ]);
}

/** Ranteen kohta kelan kehyksessä: hiha päättyy tähän. */
export const WRIST = new THREE.Vector3(HAND - 0.045, -0.02, 0.028);

/** Hiha kyynärpäästä (y = 0) ranteeseen (y = 1): pituus skaalataan piirrettäessä. */
export function sleeveShape(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.027, 0.04, 1, 14, 1, true);
  geo.translate(0, 0.5, 0);
  return geo;
}
