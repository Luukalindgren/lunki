import * as THREE from 'three';
import type { BirdKind } from '../game/birdPose';
import { limb, lump, mergeParts, mixColor, noise3, type Tone } from './shapes';

/** Samat sävyt kuin lintujen pikselikuvissa (`game/birdArt.ts`). */
const C = {
  white: 0xeef2f3,
  light: 0xc3cbd2,
  grey: 0x8e99a4,
  slate: 0x5f6b78,
  dark: 0x1c232b,
  black: 0x0b0f14,
  brown: 0x5e432b,
  tan: 0x8a6a42,
  buff: 0xb99a68,
  green: 0x24502c,
  yellow: 0xf6d04d,
  orange: 0xf08a2c,
  red: 0xd23a2a,
} as const;

/** Linnun mitat (m) ja värit. Nokka osoittaa +x-suuntaan, y on ylös. */
interface BirdLook {
  /** Ruumiin pituus, korkeus ja leveys. */
  body: readonly [number, number, number];
  /** Kaulan pituus ja paksuus sekä pään säde. */
  neck: number;
  neckR: number;
  head: number;
  /** Nokan pituus ja paksuus. */
  bill: readonly [number, number];
  /** Siipien kärkiväli ja siiven leveys; 0 = laji ei lennä pelissä. */
  span: number;
  chord: number;
  /** Pyrstön pituus; `fork` = haarapyrstö (tiira). */
  tail: number;
  fork?: boolean;
  /** Ui veden pinnalla; muuten laji piirretään aina siivet levällään. */
  floats: boolean;
  back: Tone;
  flank: Tone;
  breast: number;
  belly: number;
  neckTone: number;
  /** Rengas kaulan tyvessä (sinisorsakoiras) ja kurkku kaulan etupuolella (kuikka). */
  collar?: number;
  throat?: number;
  headTone: number;
  /** Päälaki ja silmäjuova. */
  cap?: number;
  stripe?: number;
  billTone: number;
  billTip?: number;
  wing: number;
  wingTip: number;
  /** Siiven alapinta, jos se on eri värinen kuin yläpinta. */
  under?: number;
  tailTone: number;
}

/** Kirjava höyhenpeite: kaksi sävyä kohinan mukaan. */
const mottled =
  (a: number, b: number, scale: number): Tone =>
  (x, y, z) =>
    mixColor(a, b, noise3(x * scale, y * scale, z * scale) > 0 ? 0.85 : 0.1);

/** Kuikan ruudukas selkä. */
const checked: Tone = (x, _y, z) =>
  (Math.floor(x / 0.07) + Math.floor(z / 0.07)) % 2 === 0 ? C.white : C.black;

const MALLARD = {
  body: [0.42, 0.18, 0.2],
  neck: 0.07,
  neckR: 0.036,
  head: 0.056,
  bill: [0.06, 0.02],
  span: 0.9,
  chord: 0.2,
  tail: 0.07,
  floats: true,
} as const;

const BIRDS: Record<BirdKind, BirdLook> = {
  drake: {
    ...MALLARD,
    back: C.slate,
    flank: C.grey,
    breast: C.brown,
    belly: C.light,
    neckTone: C.green,
    collar: C.white,
    headTone: C.green,
    billTone: C.yellow,
    wing: C.grey,
    wingTip: C.slate,
    tailTone: C.black,
  },
  hen: {
    ...MALLARD,
    back: mottled(C.brown, C.tan, 28),
    flank: mottled(C.tan, C.buff, 28),
    breast: C.tan,
    belly: C.buff,
    neckTone: C.tan,
    headTone: C.tan,
    cap: C.brown,
    billTone: C.orange,
    wing: C.brown,
    wingTip: C.dark,
    tailTone: C.brown,
  },
  duckling: {
    body: [0.14, 0.08, 0.09],
    neck: 0.012,
    neckR: 0.02,
    head: 0.042,
    bill: [0.022, 0.011],
    span: 0,
    chord: 0,
    tail: 0.02,
    floats: true,
    back: C.tan,
    flank: C.buff,
    breast: C.buff,
    belly: C.buff,
    neckTone: C.buff,
    headTone: C.buff,
    cap: C.tan,
    billTone: C.dark,
    wing: C.tan,
    wingTip: C.tan,
    tailTone: C.tan,
  },
  swan: {
    body: [0.9, 0.36, 0.44],
    neck: 0.6,
    neckR: 0.05,
    head: 0.078,
    bill: [0.12, 0.034],
    span: 2.3,
    chord: 0.42,
    tail: 0.14,
    floats: true,
    back: C.white,
    flank: C.white,
    breast: C.white,
    belly: C.light,
    neckTone: C.white,
    headTone: C.white,
    billTone: C.yellow,
    billTip: C.black,
    wing: C.white,
    wingTip: C.white,
    tailTone: C.white,
  },
  loon: {
    body: [0.58, 0.17, 0.23],
    neck: 0.1,
    neckR: 0.05,
    head: 0.062,
    bill: [0.085, 0.019],
    span: 0,
    chord: 0,
    tail: 0.04,
    floats: true,
    back: checked,
    flank: C.dark,
    breast: C.white,
    belly: C.white,
    neckTone: C.grey,
    throat: C.black,
    headTone: C.slate,
    billTone: C.dark,
    wing: C.dark,
    wingTip: C.dark,
    tailTone: C.black,
  },
  gull: {
    body: [0.36, 0.12, 0.13],
    neck: 0.03,
    neckR: 0.035,
    head: 0.05,
    bill: [0.045, 0.014],
    span: 1.15,
    chord: 0.17,
    tail: 0.11,
    floats: false,
    back: C.light,
    flank: C.white,
    breast: C.white,
    belly: C.white,
    neckTone: C.white,
    headTone: C.white,
    billTone: C.yellow,
    wing: C.light,
    wingTip: C.black,
    under: C.white,
    tailTone: C.white,
  },
  tern: {
    body: [0.28, 0.085, 0.09],
    neck: 0.02,
    neckR: 0.025,
    head: 0.04,
    bill: [0.045, 0.01],
    span: 0.82,
    chord: 0.11,
    tail: 0.15,
    fork: true,
    floats: false,
    back: C.light,
    flank: C.white,
    breast: C.white,
    belly: C.white,
    neckTone: C.white,
    headTone: C.white,
    cap: C.black,
    billTone: C.red,
    wing: C.light,
    wingTip: C.grey,
    under: C.white,
    tailTone: C.white,
  },
  osprey: {
    body: [0.46, 0.15, 0.17],
    neck: 0.03,
    neckR: 0.04,
    head: 0.058,
    bill: [0.035, 0.018],
    span: 1.6,
    chord: 0.3,
    tail: 0.17,
    floats: false,
    back: C.brown,
    flank: C.white,
    breast: C.white,
    belly: C.white,
    neckTone: C.white,
    headTone: C.white,
    stripe: C.brown,
    billTone: C.dark,
    wing: C.brown,
    wingTip: C.dark,
    under: C.white,
    tailTone: C.tan,
  },
};

type V3 = readonly [number, number, number];

/**
 * Lentävä lintu nähdään usein alta taivasta vasten, jolloin vaalea vatsa ja
 * siiven alapinta jäisivät varjoon lähes mustiksi. Alaspäin osoittavat
 * normaalit käännetään ylös, jolloin alapuoli valaistaan kuin yläpuoli.
 */
function lightBelow(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = geo.getAttribute('normal');
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setY(i, -n.getY(i));
  return geo;
}

const toneAt = (tone: Tone, x: number, y: number, z: number, up: number) =>
  typeof tone === 'function' ? tone(x, y, z, up) : tone;

/** Uiko laji pinnalla: muuten se piirretään aina lentävänä (lokki, tiira, kalasääski). */
export const floats = (kind: BirdKind): boolean => BIRDS[kind].floats;
/** Lentääkö laji pelissä. */
export const flies = (kind: BirdKind): boolean => BIRDS[kind].span > 0;

/** Kaula tyvestä päähän: rengas tyvessä ja kurkku etupuolella. */
function neck(k: BirdLook, from: V3, to: V3): THREE.BufferGeometry {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  // Kurkku on kaulan etupuoli: kohtisuoraan kaulaa vastaan nokan suuntaan.
  const ahead: readonly [number, number] = [dy / length, -dx / length];
  return limb(from, to, k.neckR * 1.15, k.neckR, (x, y) => {
    const along = ((x - from[0]) * dx + (y - from[1]) * dy) / (length * length);
    if (k.collar !== undefined && along < 0.3) return k.collar;
    const front = (x - from[0]) * ahead[0] + (y - from[1]) * ahead[1];
    if (k.throat !== undefined && front > k.neckR * 0.2) return k.throat;
    return k.neckTone;
  });
}

/** Pää, nokka ja silmät: `at` on pään keskikohta. */
function head(k: BirdLook, at: V3): THREE.BufferGeometry[] {
  const r = k.head;
  const [length, thick] = k.bill;
  const root = at[0] + r * 0.8;
  const parts = [
    lump(
      at,
      [r * 1.12, r, r * 0.92],
      (_x, y, z, up) => {
        if (k.cap !== undefined && up > 0.2) return k.cap;
        if (k.stripe !== undefined && Math.abs(y - at[1]) < r * 0.3 && Math.abs(z) > r * 0.4)
          return k.stripe;
        return k.headTone;
      },
      12,
    ),
    limb(
      [root, at[1] - r * 0.1, 0],
      [root + length, at[1] - r * 0.22, 0],
      thick,
      thick * 0.35,
      (x) => (k.billTip !== undefined && x > root + length * 0.55 ? k.billTip : k.billTone),
      8,
    ),
  ];
  for (const side of [-1, 1])
    parts.push(
      lump(
        [at[0] + r * 0.5, at[1] + r * 0.22, side * r * 0.76],
        [r * 0.17, r * 0.17, r * 0.1],
        C.black,
        6,
      ),
    );
  return parts;
}

/**
 * Uiva lintu: vesiraja on y = 0, ja ruumiista on vähän veden alla. Siivet ovat
 * supussa selän päällä, kaula pystyssä.
 */
export function swimShape(kind: BirdKind): THREE.BufferGeometry {
  const k = BIRDS[kind];
  const [L, H, W] = k.body;
  const detail = L > 0.5 ? 24 : 14;
  const parts = [
    lump(
      [0, H * 0.24, 0],
      [L / 2, H / 2, W / 2],
      (x, y, z, up) => {
        if (x > L * 0.27) return k.breast;
        if (up > 0.3) return toneAt(k.back, x, y, z, up);
        return y < H * 0.04 ? k.belly : toneAt(k.flank, x, y, z, up);
      },
      detail,
    ),
    lump([-L * 0.47, H * 0.52, 0], [k.tail + L * 0.06, H * 0.1, W * 0.26], k.tailTone, 10),
  ];
  if (k.chord > 0)
    for (const side of [-1, 1])
      parts.push(
        lump(
          [-L * 0.08, H * 0.48, side * W * 0.27],
          [L * 0.38, H * 0.3, W * 0.24],
          (x) => (x < -L * 0.3 ? k.wingTip : k.wing),
          12,
        ),
      );
  const base: V3 = [L * 0.33, H * 0.5, 0];
  const top: V3 = [base[0] + k.neck * 0.28, base[1] + k.neck, 0];
  if (k.neck >= 0.03) parts.push(neck(k, [base[0], base[1] - H * 0.1, 0], top));
  parts.push(...head(k, [top[0] + k.head * 0.3, top[1] + k.head * 0.5, 0]));
  return mergeParts(parts);
}

/** Lentävän linnun ruumis: kaula ojossa eteen ja pyrstö viuhkana takana. Keskikohta origossa. */
export function flyShape(kind: BirdKind): THREE.BufferGeometry {
  const k = BIRDS[kind];
  const [L, H, W] = k.body;
  const parts = [
    lump(
      [0, 0, 0],
      [L / 2, H * 0.4, W * 0.4],
      (x, y, z, up) => {
        if (up > 0.1) return toneAt(k.back, x, y, z, up);
        return x > L * 0.25 ? k.breast : k.belly;
      },
      L > 0.5 ? 20 : 14,
    ),
  ];
  if (k.fork)
    for (const side of [-1, 1])
      parts.push(
        lump(
          [-L / 2 - k.tail * 0.45, 0, side * W * 0.22],
          [k.tail * 0.7, 0.006 + H * 0.03, W * 0.09],
          k.tailTone,
          8,
        ),
      );
  else
    parts.push(
      lump([-L / 2 - k.tail * 0.3, 0, 0], [k.tail * 0.75, H * 0.07, W * 0.38], k.tailTone, 10),
    );
  const reach = Math.max(k.neck * 0.9, k.head * 0.4);
  const base: V3 = [L * 0.38, 0, 0];
  const end: V3 = [L * 0.38 + reach, H * 0.05, 0];
  parts.push(neck(k, base, end), ...head(k, [end[0] + k.head * 0.5, end[1] + k.head * 0.1, 0]));
  return lightBelow(mergeParts(parts));
}

/** Siiven tyven paikka ruumiissa (oikea siipi; vasen on peilikuva). */
export function wingRoot(kind: BirdKind): THREE.Vector3 {
  const [L, H, W] = BIRDS[kind].body;
  return new THREE.Vector3(L * 0.06, H * 0.2, W * 0.22);
}

/**
 * Oikea siipi levällään: tyvi origossa, kärki +z-suunnassa. Siipi kapenee ja
 * kääntyy taakse kärkeä kohti; kärki ja alapinta saavat oman värinsä.
 */
export function wingShape(kind: BirdKind): THREE.BufferGeometry {
  const k = BIRDS[kind];
  const length = k.span / 2 - k.body[2] * 0.22;
  const wing = lump(
    [0, 0, length / 2],
    [k.chord / 2, Math.max(0.007, k.chord * 0.06), length / 2],
    (_x, _y, z, up) => {
      if (z > length * 0.78) return k.wingTip;
      return k.under !== undefined && up < -0.1 ? k.under : k.wing;
    },
    14,
  );
  const p = wing.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, p.getZ(i) / length);
    p.setX(i, p.getX(i) * (1 - 0.6 * Math.pow(t, 1.5)) - k.chord * 0.45 * t * t);
  }
  return lightBelow(wing);
}
