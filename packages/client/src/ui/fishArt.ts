import { type SpeciesId } from '@lunki/shared';

/**
 * Kalalajien pikselikuvat saaliille ja ennätyksille. Kuva lasketaan lajin
 * muodosta ja kuvioinnista, joten se piirtyy minkä levyisenä tahansa: iso
 * kala saa leveämmän kuvan ja enemmän yksityiskohtia, kuten Pro Pilkissä.
 * Värit ovat pelin paletista.
 */

/** Evä ruumiin ylä- tai alareunassa. */
interface Fin {
  /** Evän alku ja loppu ruumiin pituudella (0 = kuono, 1 = pyrstön tyvi). */
  from: number;
  to: number;
  /** Korkeus suhteessa ruumiin korkeuteen. */
  height: number;
  side: 'top' | 'bottom';
  color: number;
  /** Piikkievä: ruodot erottuvat joka toisena pikselisarakkeena. */
  spiny?: boolean;
  /** Tumma laikku evän takaosassa (ahvenen selkäevä). */
  spot?: number;
}

/** Täplät kyljessä: väri, solun koko (osuus pituudesta) ja tiheys. */
interface Spots {
  color: number;
  cell: number;
  density: number;
  /** Kyljen korkeusalue (-1 = selkä, 1 = vatsa). */
  minR: number;
  maxR: number;
}

interface FishLook {
  /** Kunto (Fultonin K): paino g = K · pituus³ / 100, pituus cm. */
  condition: number;
  /** Ruumiin korkeus suhteessa pituuteen. */
  depth: number;
  /** Selän ja vatsan korkeimman kohdan paikka (0 = kuono, 1 = pyrstön tyvi). */
  hump: number;
  bellyPeak: number;
  /** Osuus korkeudesta keskiviivan alapuolella. */
  belly: number;
  /** Kuonon kaventuva osa ja sen terävyys (1 = suippo, pienempi = pyöreä). */
  snout: number;
  snoutShape: number;
  /** Pyrstön tyven paksuus suhteessa suurimpaan korkeuteen. */
  peduncle: number;
  /** Pyrstön korkeus suhteessa ruumiin korkeuteen ja haarukan syvyys. */
  tail: number;
  fork: number;
  back: number;
  side: number;
  bellyColor: number;
  fin: number;
  tailColor: number;
  fins: Fin[];
  /** Pystyraidat kyljessä (ahven, kuha). */
  bars?: { count: number; color: number; from: number; to: number; depth: number };
  spots?: Spots[];
  eye: number;
  /** Silmän paikka ja suun pituus (osuus pituudesta). */
  eyeAt: number;
  mouth: number;
}

const OUTLINE = 0x0b0f14;
const PUPIL = 0x0b0f14;
const WHITE = 0xeef2f3;

const LOOKS: Record<SpeciesId, FishLook> = {
  perch: {
    condition: 1.25,
    depth: 0.27,
    hump: 0.38,
    bellyPeak: 0.42,
    belly: 0.45,
    snout: 0.16,
    snoutShape: 0.6,
    peduncle: 0.3,
    tail: 1,
    fork: 0.3,
    back: 0x24502c,
    side: 0x6a9a3e,
    bellyColor: 0xe0cf9c,
    fin: 0xf08a2c,
    tailColor: 0xf08a2c,
    fins: [
      {
        from: 0.28,
        to: 0.56,
        height: 0.5,
        side: 'top',
        color: 0x6a9a3e,
        spiny: true,
        spot: 0x14301e,
      },
      { from: 0.6, to: 0.8, height: 0.35, side: 'top', color: 0x6a9a3e },
      { from: 0.3, to: 0.4, height: 0.35, side: 'bottom', color: 0xd23a2a },
      { from: 0.7, to: 0.8, height: 0.3, side: 'bottom', color: 0xd23a2a },
    ],
    bars: { count: 6, color: 0x14301e, from: 0.24, to: 0.92, depth: 0.45 },
    eye: 0xf6d04d,
    eyeAt: 0.09,
    mouth: 0.05,
  },
  pike: {
    condition: 0.65,
    depth: 0.15,
    hump: 0.62,
    bellyPeak: 0.55,
    belly: 0.5,
    snout: 0.26,
    snoutShape: 1,
    peduncle: 0.45,
    tail: 1.5,
    fork: 0.2,
    back: 0x14301e,
    side: 0x3b7337,
    bellyColor: 0xe0cf9c,
    fin: 0x8a6a42,
    tailColor: 0x8a6a42,
    fins: [
      { from: 0.74, to: 0.9, height: 0.6, side: 'top', color: 0x8a6a42, spot: 0x3b2a1e },
      { from: 0.76, to: 0.9, height: 0.55, side: 'bottom', color: 0x8a6a42 },
      { from: 0.48, to: 0.56, height: 0.4, side: 'bottom', color: 0x8a6a42 },
    ],
    spots: [{ color: 0xa3c45a, cell: 0.02, density: 0.5, minR: -0.6, maxR: 0.45 }],
    eye: 0xf6d04d,
    eyeAt: 0.12,
    mouth: 0.13,
  },
  roach: {
    condition: 1.15,
    depth: 0.28,
    hump: 0.42,
    bellyPeak: 0.45,
    belly: 0.48,
    snout: 0.14,
    snoutShape: 0.55,
    peduncle: 0.28,
    tail: 1.05,
    fork: 0.5,
    back: 0x39424d,
    side: 0xc3cbd2,
    bellyColor: WHITE,
    fin: 0xd23a2a,
    tailColor: 0x8e99a4,
    fins: [
      { from: 0.42, to: 0.6, height: 0.6, side: 'top', color: 0x5f6b78 },
      { from: 0.42, to: 0.5, height: 0.35, side: 'bottom', color: 0xd23a2a },
      { from: 0.68, to: 0.82, height: 0.3, side: 'bottom', color: 0xd23a2a },
    ],
    eye: 0xd23a2a,
    eyeAt: 0.09,
    mouth: 0.04,
  },
  zander: {
    condition: 0.85,
    depth: 0.19,
    hump: 0.42,
    bellyPeak: 0.45,
    belly: 0.48,
    snout: 0.2,
    snoutShape: 0.8,
    peduncle: 0.34,
    tail: 1.2,
    fork: 0.35,
    back: 0x39424d,
    side: 0x8e99a4,
    bellyColor: WHITE,
    fin: 0x8e99a4,
    tailColor: 0x8e99a4,
    fins: [
      { from: 0.28, to: 0.54, height: 0.6, side: 'top', color: 0x8e99a4, spiny: true },
      { from: 0.58, to: 0.82, height: 0.45, side: 'top', color: 0x8e99a4 },
      { from: 0.32, to: 0.4, height: 0.4, side: 'bottom', color: 0xc3cbd2 },
      { from: 0.68, to: 0.8, height: 0.35, side: 'bottom', color: 0xc3cbd2 },
    ],
    bars: { count: 8, color: 0x5f6b78, from: 0.26, to: 0.9, depth: 0.2 },
    eye: 0xfff3b0,
    eyeAt: 0.1,
    mouth: 0.08,
  },
  trout: {
    condition: 1.1,
    depth: 0.22,
    hump: 0.45,
    bellyPeak: 0.48,
    belly: 0.48,
    snout: 0.15,
    snoutShape: 0.7,
    peduncle: 0.38,
    tail: 1.15,
    fork: 0.15,
    back: 0x5e432b,
    side: 0xb99a68,
    bellyColor: WHITE,
    fin: 0x8a6a42,
    tailColor: 0x8a6a42,
    fins: [
      { from: 0.42, to: 0.58, height: 0.45, side: 'top', color: 0x8a6a42 },
      { from: 0.8, to: 0.86, height: 0.2, side: 'top', color: 0x8a6a42 },
      { from: 0.48, to: 0.56, height: 0.35, side: 'bottom', color: 0x8a6a42 },
      { from: 0.7, to: 0.82, height: 0.3, side: 'bottom', color: 0x8a6a42 },
    ],
    spots: [
      { color: OUTLINE, cell: 0.022, density: 0.3, minR: -0.9, maxR: 0.1 },
      { color: 0xd23a2a, cell: 0.03, density: 0.18, minR: -0.1, maxR: 0.35 },
    ],
    eye: 0xf6d04d,
    eyeAt: 0.1,
    mouth: 0.06,
  },
};

/** Ruumiin osuus kuvan pituudesta, loput on pyrstöä. */
const BODY = 0.8;
export const MIN_SPRITE_WIDTH = 22;
export const MAX_SPRITE_WIDTH = 96;

/** Kalan pituus (cm) painosta lajin kuntokertoimella. */
export function fishLengthCm(species: SpeciesId, weightKg: number): number {
  return Math.cbrt((Math.max(0, weightKg) * 1000 * 100) / LOOKS[species].condition);
}

/** Kuvan leveys pikseleinä: kasvaa kalan pituuden mukana. */
export function fishSpriteWidth(species: SpeciesId, weightKg: number): number {
  const w = Math.round(16 + 0.66 * fishLengthCm(species, weightKg));
  return Math.min(MAX_SPRITE_WIDTH, Math.max(MIN_SPRITE_WIDTH, w));
}

export interface FishPixels {
  width: number;
  height: number;
  /** Värit riveittäin (0xRRGGBB), -1 = läpinäkyvä. */
  data: Int32Array;
}

/** Kalan pikselikuva annetun levyisenä; kuono vasemmalla. */
export function fishPixels(species: SpeciesId, width: number): FishPixels {
  const look = LOOKS[species];
  const W = Math.max(8, Math.round(width));
  const depthPx = look.depth * W;
  const finTop = Math.max(0, ...look.fins.filter((f) => f.side === 'top').map((f) => f.height));
  const finBottom = Math.max(
    0,
    ...look.fins.filter((f) => f.side === 'bottom').map((f) => f.height),
  );
  const tailHalf = (look.tail * depthPx) / 2;
  const up = Math.max(depthPx * (1 - look.belly) + finTop * depthPx, tailHalf);
  const down = Math.max(depthPx * look.belly + finBottom * depthPx, tailHalf);
  const cy = Math.ceil(up) + 1;
  const H = cy + Math.ceil(down) + 1;
  const data = new Int32Array(W * H).fill(-1);
  const set = (i: number, j: number, c: number) => {
    if (i >= 0 && i < W && j >= 0 && j < H) data[j * W + i] = c;
  };

  // Ruumiin ääriviiva: selän ja vatsan etäisyys keskiviivasta.
  const profile = (t: number, peak: number) => {
    const e = Math.log(0.5) / Math.log(peak);
    const s = Math.pow(Math.sin(Math.PI * Math.pow(t, e)), 0.8);
    const taper = t < look.snout ? Math.pow(t / look.snout, look.snoutShape) : 1;
    return (look.peduncle + (1 - look.peduncle) * s) * taper;
  };
  const top = (t: number) => depthPx * (1 - look.belly) * profile(t, look.hump);
  const bottom = (t: number) => depthPx * look.belly * profile(t, look.bellyPeak);

  const bodyEnd = BODY * W;
  const pedHalf = (look.peduncle * depthPx) / 2;
  for (let i = 0; i < W; i++) {
    const x = i + 0.5;
    for (let j = 0; j < H; j++) {
      const y = j + 0.5 - cy;
      if (x <= bodyEnd) {
        const t = x / bodyEnd;
        const up = top(t);
        const down = bottom(t);
        if (y >= -up && y <= down) {
          set(i, j, bodyColor(look, t, y < 0 ? y / up : y / down, i, j, W));
          continue;
        }
        for (const f of look.fins) {
          if (t < f.from || t > f.to) continue;
          const local = (t - f.from) / (f.to - f.from);
          let h = f.height * depthPx * Math.sqrt(1 - local) * Math.min(1, local / 0.15 + 0.3);
          if (f.spiny && i % 2 === 1) h *= 0.7;
          const inFin = f.side === 'top' ? y < -up && y >= -up - h : y > down && y <= down + h;
          if (inFin) set(i, j, f.spot !== undefined && local > 0.65 ? f.spot : f.color);
        }
      } else {
        // Pyrstö levenee tyvestä ja haarautuu keskeltä.
        const v = (x - bodyEnd) / (W - bodyEnd);
        const half = pedHalf + (tailHalf - pedHalf) * Math.pow(v, 0.7);
        const ay = Math.abs(y + (bottom(1) - top(1)) / 2);
        if (ay <= half && v <= 1 - look.fork * (1 - ay / half)) {
          set(i, j, look.tailColor);
        }
      }
    }
  }

  // Kiduskansi kaarena silmän takana.
  const gill = Math.round(bodyEnd * (look.eyeAt + 0.13));
  for (let j = 0; j < H; j++) {
    const y = j + 0.5 - cy;
    const t = (gill + 0.5) / bodyEnd;
    const r = y < 0 ? y / top(t) : y / bottom(t);
    if (Math.abs(r) > 0.75) continue;
    const i = gill - Math.round(r * r * W * 0.03);
    if (data[j * W + i]! >= 0) set(i, j, look.back);
  }

  // Rintaevä kyljessä kiduskannen takana.
  const pecLen = Math.max(2, Math.round(W * 0.07));
  for (let k = 0; k < pecLen; k++) {
    const i = gill + 1 + k;
    const t = (i + 0.5) / bodyEnd;
    const base = cy + Math.round(bottom(t) * 0.2);
    const len = Math.max(1, Math.round((1 - k / pecLen) * depthPx * 0.18));
    for (let d = 0; d < len; d++) set(i, base + d + Math.round(k * 0.4), look.fin);
  }

  // Suu kuonon kärjestä silmää kohti.
  const mouthLen = Math.max(1, Math.round(W * look.mouth));
  const mouthY = cy + Math.max(0, Math.round(bottom(look.snout) * 0.15));
  for (let i = 0; i < mouthLen; i++) if (data[mouthY * W + i]! >= 0) set(i, mouthY, OUTLINE);

  // Silmä: iiris ja pupilli.
  const ex = Math.round(bodyEnd * look.eyeAt);
  const ey = cy - Math.round(top(look.eyeAt) * 0.35);
  const er = Math.max(1, Math.round(W * 0.022));
  for (let dx = -er; dx <= er; dx++) {
    for (let dy = -er; dy <= er; dy++) {
      if (dx * dx + dy * dy > er * er + er) continue;
      set(ex + dx, ey + dy, look.eye);
    }
  }
  const pr = Math.max(0, er - 1);
  for (let dx = -pr; dx <= pr; dx++) {
    for (let dy = -pr; dy <= pr; dy++) {
      if (dx * dx + dy * dy <= pr * pr + pr) set(ex + dx, ey + dy, PUPIL);
    }
  }
  if (er >= 2) set(ex - 1, ey - 1, WHITE);

  // Tumma reunaviiva erottaa kalan taustasta.
  const filled = data.slice();
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (filled[j * W + i]! >= 0) continue;
      const near =
        (i > 0 && filled[j * W + i - 1]! >= 0) ||
        (i < W - 1 && filled[j * W + i + 1]! >= 0) ||
        (j > 0 && filled[(j - 1) * W + i]! >= 0) ||
        (j < H - 1 && filled[(j + 1) * W + i]! >= 0);
      if (near) data[j * W + i] = OUTLINE;
    }
  }
  return { width: W, height: H, data };
}

/** Kyljen väri: selkä tumma, vatsa vaalea, väliin raidat ja täplät. */
function bodyColor(look: FishLook, t: number, r: number, i: number, j: number, W: number): number {
  if (look.bars && t >= look.bars.from && t <= look.bars.to && r < look.bars.depth) {
    const phase = ((t - look.bars.from) / (look.bars.to - look.bars.from)) * look.bars.count;
    // Raita kapenee vatsaa kohti.
    const width = 0.42 - Math.max(0, r) * 0.4;
    if (phase % 1 < width && r > -0.85) return look.bars.color;
  }
  for (const s of look.spots ?? []) {
    if (r < s.minR || r > s.maxR || t < 0.2 || t > 0.97) continue;
    const size = Math.max(2, Math.round(s.cell * W));
    const cy = Math.floor(j / size);
    const cx = Math.floor((i + (cy % 2) * (size >> 1)) / size);
    if (hash(cx, cy, s.color) < s.density && (i + j) % size !== size - 1) return s.color;
  }
  if (r < -0.4) return look.back;
  if (r > 0.45) return look.bellyColor;
  return look.side;
}

/** Toistettava satunnaisluku 0–1 täplien paikoille. */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface FishSprite {
  url: string;
  width: number;
  height: number;
}

const cache = new Map<string, FishSprite>();

/** Kalan kuva data-URL:na (välimuistissa lajin ja leveyden mukaan). */
function fishSprite(species: SpeciesId, width: number): FishSprite {
  const key = `${species}:${width}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const px = fishPixels(species, width);
  const canvas = document.createElement('canvas');
  canvas.width = px.width;
  canvas.height = px.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(px.width, px.height);
  px.data.forEach((c, k) => {
    if (c < 0) return;
    img.data[k * 4] = (c >> 16) & 0xff;
    img.data[k * 4 + 1] = (c >> 8) & 0xff;
    img.data[k * 4 + 2] = c & 0xff;
    img.data[k * 4 + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  const sprite = { url: canvas.toDataURL(), width: px.width, height: px.height };
  cache.set(key, sprite);
  return sprite;
}

/**
 * Kalan kuva painoon suhteutettuna. `scale` on näyttöpikseleitä kuvan
 * pikseliä kohden CSS-lausekkeena, esim. 'calc(var(--u) * 2)' tai '1px'.
 */
export function fishImage(species: SpeciesId, weightKg: number, scale = '1px'): HTMLImageElement {
  const sprite = fishSprite(species, fishSpriteWidth(species, weightKg));
  const img = document.createElement('img');
  img.className = 'fish-art';
  img.src = sprite.url;
  img.alt = '';
  img.style.width = `calc(${scale} * ${sprite.width})`;
  img.style.height = `calc(${scale} * ${sprite.height})`;
  return img;
}
