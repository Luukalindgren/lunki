import * as THREE from 'three';
import type { SpeciesId } from '@lunki/shared';
import { FISH_BODY, fishBar, fishLook, fishOutline, type FishLook } from '../ui/fishArt';
import { clamp01, lump, mergeParts, part, sstep } from './shapes';

/** Ruumiin renkaat kuonosta pyrstön tyveen ja kärjet renkaan kehällä. */
const ALONG = 80;
const AROUND = 24;
/** Ruumiin leveys (osuus pituudesta), josta paksuus lasketaan: korkea kala on litteämpi. */
const GIRTH = 0.115;
/** Suu ja pupilli. */
const DARK = 0x0b0f14;

const a = new THREE.Color();
const b = new THREE.Color();

/** Toistettava satunnaisluku 0–1 täplille. */
function speck(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 0.37) * 43758.5453;
  return s - Math.floor(s);
}

/** Litteä levy (evä) kärkilistasta kolmioina; väri kärjittäin. */
function sheet(
  points: readonly (readonly [number, number, number])[],
  colors: readonly number[],
  triangles: readonly (readonly [number, number, number])[],
): THREE.BufferGeometry {
  const position: number[] = [];
  const color: number[] = [];
  for (const tri of triangles)
    for (const i of tri) {
      position.push(...points[i]!);
      a.set(colors[i]!);
      color.push(a.r, a.g, a.b);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Kaista kahden kärkirivin välillä (`2n` kärkeä: rivi a parillisissa, b parittomissa). */
function strip(n: number): [number, number, number][] {
  const triangles: [number, number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const p = i * 2;
    triangles.push([p, p + 1, p + 2], [p + 1, p + 3, p + 2]);
  }
  return triangles;
}

/**
 * Kalan malli lajin pikselikuvan muodosta ja väreistä (`fishLook`): kuono
 * +x-suuntaan, selkä ylös, pituus 1 ja keskikohta origossa. Ruumis on
 * renkaista koottu sileä pinta, evät ja pyrstö ohuita levyjä, ja kuviot
 * (raidat, täplät, kiduskansi, suu) ovat kärkien väreissä.
 */
export function fishShape(species: SpeciesId): THREE.BufferGeometry {
  const look = fishLook(species);
  const { top, bottom } = fishOutline(look);
  const girth = Math.min(0.75, Math.max(0.3, GIRTH / look.depth));
  /** Ruumiin puolileveys: kapenee pyrstön tyveä kohti. */
  const half = (t: number) =>
    ((top(t) + bottom(t)) / 2) * girth * (1 - 0.6 * sstep(0.5, 1, t)) * 1.05;
  const xAt = (t: number) => 0.5 - t * FISH_BODY;
  const parts = [body(look, top, bottom, half, xAt), tail(look, top, bottom)];
  for (const fin of look.fins) parts.push(finSheet(look, fin, top, bottom, xAt));

  // Rintaevät kiduskannen takana ja silmät.
  const gill = look.eyeAt + 0.15;
  const pec = 0.09;
  for (const side of [-1, 1]) {
    const z = half(gill) * 0.96 * side;
    const y = -bottom(gill) * 0.25;
    parts.push(
      sheet(
        [
          [xAt(gill), y + look.depth * 0.05, z],
          [xAt(gill), y - look.depth * 0.06, z],
          [xAt(gill) - pec, y - look.depth * 0.2, z + side * 0.02],
        ],
        [look.fin, look.fin, look.fin],
        [[0, 1, 2]],
      ),
    );
    const ey = top(look.eyeAt) * 0.35;
    const ez = half(look.eyeAt) * Math.sqrt(1 - 0.35 * 0.35) * side;
    const r = 0.02;
    parts.push(
      lump([xAt(look.eyeAt), ey, ez], [r, r, r * 0.6], look.eye, 10),
      lump([xAt(look.eyeAt), ey, ez + side * r * 0.4], [r * 0.55, r * 0.55, r * 0.4], DARK, 8),
    );
  }
  return mergeParts(parts);
}

function body(
  look: FishLook,
  top: (t: number) => number,
  bottom: (t: number) => number,
  half: (t: number) => number,
  xAt: (t: number) => number,
): THREE.BufferGeometry {
  const rings = ALONG + 2;
  const position = new Float32Array(rings * AROUND * 3);
  const color = new Float32Array(rings * AROUND * 3);
  const gill = look.eyeAt + 0.13;
  for (let i = 0; i < rings; i++) {
    // Viimeinen rengas sulkee pyrstön tyven.
    const closed = i > ALONG;
    const t = Math.min(1, i / ALONG);
    const up = top(t);
    const down = bottom(t);
    const wide = closed ? 0 : half(t);
    const mid = (up - down) / 2;
    for (let j = 0; j < AROUND; j++) {
      const angle = (j / AROUND) * Math.PI * 2;
      const sin = Math.sin(angle);
      const o = (i * AROUND + j) * 3;
      position[o] = xAt(t);
      position[o + 1] = closed ? mid : sin >= 0 ? up * sin : down * sin;
      position[o + 2] = wide * Math.cos(angle);
      tone(look, t, -sin, i, j, gill).toArray(color, o);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < AROUND; j++) {
      const p = i * AROUND + j;
      const q = i * AROUND + ((j + 1) % AROUND);
      index.push(p, q, p + AROUND, q, q + AROUND, p + AROUND);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return part(geo);
}

/** Kyljen väri: selkä tumma, vatsa vaalea, väliin raidat, täplät, kiduskansi ja suu. */
function tone(look: FishLook, t: number, r: number, i: number, j: number, gill: number) {
  a.set(look.side).lerp(b.set(look.back), sstep(0.2, 0.55, -r));
  a.lerp(b.set(look.bellyColor), sstep(0.3, 0.62, r));
  if (look.bars && fishBar(look, t, r)) a.lerp(b.set(look.bars.color), 0.85);
  for (const s of look.spots ?? []) {
    if (r < s.minR || r > s.maxR || t < 0.2 || t > 0.97) continue;
    if (speck(i, j, s.color) < s.density * 0.6) a.lerp(b.set(s.color), 0.65);
  }
  // Kiduskansi kaarena silmän takana.
  const arc = Math.abs(t - (gill - r * r * 0.03));
  if (Math.abs(r) < 0.75) a.lerp(b.set(look.back), 0.55 * clamp01(1 - arc / 0.014));
  if (t < look.mouth && r > 0.12 && r < 0.45) a.lerp(b.set(DARK), 0.8);
  return a;
}

/** Pyrstö: levenee tyvestä ja haarautuu keskeltä kuten pikselikuvassa. */
function tail(
  look: FishLook,
  top: (t: number) => number,
  bottom: (t: number) => number,
): THREE.BufferGeometry {
  const across = 10;
  const along = 6;
  const ped = (look.peduncle * look.depth) / 2;
  const tip = (look.tail * look.depth) / 2;
  const mid = (top(1) - bottom(1)) / 2;
  const points: [number, number, number][] = [];
  const colors: number[] = [];
  const triangles: [number, number, number][] = [];
  for (let i = 0; i <= across; i++) {
    const u = (i / across) * 2 - 1;
    const reach = 1 - look.fork * (1 - Math.abs(u));
    for (let k = 0; k <= along; k++) {
      const v = (k / along) * reach;
      const h = ped + (tip - ped) * Math.pow(v, 0.7);
      points.push([0.5 - FISH_BODY - v * (1 - FISH_BODY), mid + u * h, 0]);
      colors.push(look.tailColor);
    }
  }
  const row = along + 1;
  for (let i = 0; i < across; i++)
    for (let k = 0; k < along; k++) {
      const p = i * row + k;
      triangles.push([p, p + row, p + 1], [p + 1, p + row, p + row + 1]);
    }
  return sheet(points, colors, triangles);
}

/** Selkä- tai vatsaevä ruumiin reunasta; piikkievän reuna on sahalaitainen. */
function finSheet(
  look: FishLook,
  fin: FishLook['fins'][number],
  top: (t: number) => number,
  bottom: (t: number) => number,
  xAt: (t: number) => number,
): THREE.BufferGeometry {
  const n = fin.spiny ? 17 : 9;
  const sign = fin.side === 'top' ? 1 : -1;
  const points: [number, number, number][] = [];
  const colors: number[] = [];
  for (let i = 0; i < n; i++) {
    const local = i / (n - 1);
    const t = fin.from + local * (fin.to - fin.from);
    let h = fin.height * look.depth * Math.sqrt(1 - local) * Math.min(1, local / 0.15 + 0.3);
    if (fin.spiny && i % 2 === 1) h *= 0.7;
    // Tyvi vähän ruumiin sisällä, ettei väliin jää rakoa; kärki kallistuu taakse.
    const base = (fin.side === 'top' ? top(t) : bottom(t)) * 0.85;
    const c = fin.spot !== undefined && local > 0.65 ? fin.spot : fin.color;
    points.push([xAt(t), sign * base, 0], [xAt(t) - h * 0.3, sign * (base / 0.85 + h), 0]);
    colors.push(c, c);
  }
  return sheet(points, colors, strip(n));
}
