import {
  SPECIES,
  TIME_OF_DAY_NAMES,
  formatTime,
  formatWeight,
  type Appearance,
  type CatchRecord,
  type SpeciesId,
  type TimeOfDay,
} from '@lunki/shared';
import { fishLengthCm, fishPixels, type FishPixels } from './fishArt';

/**
 * Punnituskortti: pikselikuva, jossa kalastaja pitelee saalista renkaassaan,
 * ja saaliin tiedot. Kortin voi tallentaa kuvana tai jakaa kavereille.
 */

export interface WeighCardInfo {
  fish: CatchRecord;
  angler: string;
  appearance: Appearance;
  timeOfDay: TimeOfDay;
  /** Paikan kuvaus järvellä, esim. "Syvyys 2,1 m · Isokivi (kivikko)". */
  spot: string | null;
  date: Date;
}

export const SCENE_WIDTH = 128;
export const SCENE_HEIGHT = 96;
/** Kuvan mittakaava: pikseliä senttimetriä kohden (rengas ~110 cm). */
const PX_PER_CM = 0.7;
const HORIZON = 44;
const WATERLINE = 80;
const SKIN = 0xe0a87c;

interface SkyLook {
  sky: [number, number, number];
  trees: number;
  water: number;
  glint: number;
  /** Aurinko tai kuu: paikka, säde ja väri. */
  light: { x: number; y: number; r: number; color: number; moon?: boolean };
  mist?: number;
  stars?: boolean;
}

const SKIES: Record<TimeOfDay, SkyLook> = {
  morning: {
    sky: [0x4d9cc2, 0x83c2db, 0xfff3b0],
    trees: 0x24502c,
    water: 0x2b7aa6,
    glint: 0xfff3b0,
    light: { x: 104, y: 42, r: 6, color: 0xf6d04d },
    mist: 0xc3cbd2,
  },
  day: {
    sky: [0x2b7aa6, 0x4d9cc2, 0x83c2db],
    trees: 0x14301e,
    water: 0x1b5a84,
    glint: 0x83c2db,
    light: { x: 108, y: 14, r: 6, color: 0xfff3b0 },
  },
  evening: {
    sky: [0x6b2d6e, 0xc05bb4, 0xf08a2c],
    trees: 0x14301e,
    water: 0x123a5c,
    glint: 0xf08a2c,
    light: { x: 104, y: 43, r: 7, color: 0xf6d04d },
  },
  night: {
    sky: [0x0b0f14, 0x0d2238, 0x123a5c],
    trees: 0x0b0f14,
    water: 0x0d2238,
    glint: 0xc3cbd2,
    light: { x: 106, y: 15, r: 5, color: 0xeef2f3, moon: true },
    stars: true,
  },
};

/** Värin tummennus tai vaalennus varjoja ja kiiltoja varten. */
function shade(hex: number, k: number): number {
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v * k)));
  return (c((hex >> 16) & 0xff) << 16) | (c((hex >> 8) & 0xff) << 8) | c(hex & 0xff);
}

/** Toistettava satunnaisluku 0–1 puiden ja tähtien paikoille. */
function hash(x: number, salt: number): number {
  let h = (x * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Kalan kuvan leveys kortilla: samassa mittakaavassa kuin kalastaja. */
export function sceneFishWidth(species: SpeciesId, weightKg: number): number {
  return Math.max(10, Math.round(fishLengthCm(species, weightKg) * PX_PER_CM));
}

/** Kortin kuva: kalastaja renkaassa pitelee kalaa järvellä. */
export function anglerScene(
  species: SpeciesId,
  weightKg: number,
  look: Appearance,
  time: TimeOfDay,
): FishPixels {
  const W = SCENE_WIDTH;
  const H = SCENE_HEIGHT;
  const data = new Int32Array(W * H);
  const set = (x: number, y: number, c: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < W && y >= 0 && y < H) data[y * W + x] = c;
  };
  const sky = SKIES[time];

  // Taivas kolmena kaistana, rajoilla ruudukkorasterointi.
  for (let y = 0; y < HORIZON; y++) {
    const band = (y / HORIZON) * 3;
    for (let x = 0; x < W; x++) {
      const i = Math.floor(band);
      const next = Math.min(2, i + 1);
      const dither = band - i > 0.75 && (x + y) % 2 === 0;
      set(x, y, sky.sky[dither ? next : i]!);
    }
  }
  if (sky.stars) {
    for (let k = 0; k < 40; k++) {
      set(hash(k, 1) * W, hash(k, 2) * (HORIZON - 12), hash(k, 3) < 0.3 ? 0xf6d04d : 0xc3cbd2);
    }
  }
  const l = sky.light;
  for (let dy = -l.r; dy <= l.r; dy++) {
    for (let dx = -l.r; dx <= l.r; dx++) {
      if (dx * dx + dy * dy > l.r * l.r + 1) continue;
      // Kuunsirppi: varjo peittää toisen reunan.
      const shadow = l.moon && (dx + 3) ** 2 + (dy - 1) ** 2 <= l.r * l.r;
      if (!shadow) set(l.x + dx, l.y + dy, l.color);
    }
  }

  // Vastaranta: kuusimetsän siluetti.
  let x = 0;
  while (x < W) {
    const h = 5 + Math.floor(hash(x, 7) * 12);
    const half = 2 + Math.floor(h / 4);
    for (let dx = -half; dx <= half; dx++) {
      const top = HORIZON - h + Math.abs(dx) * 2;
      for (let y = top; y < HORIZON; y++) set(x + dx, y, sky.trees);
    }
    x += 3 + Math.floor(hash(x, 9) * 4);
  }
  for (let x = 0; x < W; x++) for (let y = HORIZON - 3; y < HORIZON; y++) set(x, y, sky.trees);

  // Vesi: viivoina välkkeitä ja valon heijastus.
  for (let y = HORIZON; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = sky.water;
      const near = (y - HORIZON) / (H - HORIZON);
      const wave = hash(Math.floor(x / (4 + near * 10)) + y * 131, 11);
      if (wave < 0.12 + near * 0.08) c = shade(sky.water, 1.35);
      // Valon heijastus kapenee kohti katsojaa ja hajoaa väreiksi.
      if (Math.abs(x - l.x) < l.r * (1 - near * 0.6) && hash(x + y * 97, 13) < 0.3) c = sky.glint;
      if (sky.mist && y < HORIZON + 8 && (x + y) % 2 === 0) c = sky.mist;
      set(x, y, c);
    }
  }

  const cx = W / 2;
  // Vapa nojaa olkaa vasten ja siima kaartuu veteen.
  for (let t = 0; t <= 1; t += 0.01) set(cx + 22 + t * 30, WATERLINE - 14 - t * 70, 0x3b2a1e);

  // Kalastajan vartalo, kaula ja pää.
  const shoulder = WATERLINE - 46;
  for (let y = shoulder; y < WATERLINE - 6; y++) {
    const round = y - shoulder < 3 ? 3 - (y - shoulder) : 0;
    for (let dx = -14 + round; dx <= 13 - round; dx++) {
      set(cx + dx, y, dx > 8 ? shade(look.shirt, 0.75) : look.shirt);
    }
  }
  for (let y = shoulder - 3; y < shoulder; y++)
    for (let dx = -2; dx <= 2; dx++) set(cx + dx, y, SKIN);
  const headY = shoulder - 10;
  for (let dy = -7; dy <= 7; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      if ((dx * dx) / 42 + (dy * dy) / 56 <= 1) set(cx + dx, headY + dy, SKIN);
    }
  }
  // Lippis lipan kera, silmät ja hymy.
  for (let dy = -8; dy <= -3; dy++) {
    for (let dx = -7; dx <= 7; dx++) {
      if ((dx * dx) / 49 + ((dy + 2) * (dy + 2)) / 40 <= 1) set(cx + dx, headY + dy, 0x8c1c1c);
    }
  }
  for (let dx = -8; dx <= 8; dx++) set(cx + dx, headY - 2, 0x5c1010);
  set(cx - 3, headY + 1, 0x0b0f14);
  set(cx + 2, headY + 1, 0x0b0f14);
  for (let dx = -2; dx <= 2; dx++)
    set(cx + dx, headY + 4 + (Math.abs(dx) === 2 ? -1 : 0), 0x8c1c1c);

  // Rengas: ellipsi vedenpinnalla, varjo alla ja kiilto päällä.
  const ringY = WATERLINE - 4;
  for (let dy = -9; dy <= 9; dy++) {
    for (let dx = -40; dx <= 40; dx++) {
      if ((dx * dx) / 1600 + (dy * dy) / 81 > 1) continue;
      const c = dy > 3 ? shade(look.tube, 0.7) : dy < -6 ? shade(look.tube, 1.3) : look.tube;
      set(cx + dx, ringY + dy, c);
    }
  }

  // Kala käsissä rinnan edessä.
  const fish = fishPixels(species, sceneFishWidth(species, weightKg));
  const fx = Math.round(cx - fish.width / 2);
  const fy = Math.round(shoulder + 18 - fish.height / 2);
  const grip = Math.min(Math.round(fish.width * 0.3), 24);
  // Kädet olkapäiltä otteisiin.
  for (const side of [-1, 1]) {
    const sx = cx + side * 12;
    const hx = cx + side * Math.max(grip, 8);
    for (let t = 0; t <= 1; t += 0.05) {
      const ax = sx + (hx - sx) * t;
      const ay = shoulder + 3 + (fy + fish.height / 2 - shoulder - 3) * t;
      for (let w = -1; w <= 1; w++) set(ax + w, ay, shade(look.shirt, 0.7));
      set(ax + side * 2, ay, 0x0b0f14);
    }
  }
  for (let j = 0; j < fish.height; j++) {
    for (let i = 0; i < fish.width; i++) {
      const c = fish.data[j * fish.width + i]!;
      if (c >= 0) set(fx + i, fy + j, c);
    }
  }
  for (const side of [-1, 1]) {
    const hx = cx + side * Math.max(grip, 8);
    const hy = fy + Math.round(fish.height / 2);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) < 4)
          set(hx + dx, hy + dy, Math.abs(dx) === 2 ? shade(SKIN, 0.75) : SKIN);
      }
    }
  }

  // Vesi peittää renkaan alaosan, pinnassa vaalea vana.
  for (let x = 0; x < W; x++) {
    for (let y = WATERLINE + 2; y < H; y++) {
      if (y >= ringY + 3 && Math.abs(x - cx) <= 42) {
        if (y === WATERLINE + 2) set(x, y, shade(sky.water, 1.6));
        else if (y <= ringY + 9 && hash(x + y * 71, 17) < 0.3) set(x, y, shade(look.tube, 0.45));
      }
    }
  }
  return { width: W, height: H, data };
}

const CARD_SCALE = 4;
const PANEL_WIDTH = 384;
const FRAME = 8;
export const CARD_WIDTH = SCENE_WIDTH * CARD_SCALE + PANEL_WIDTH + FRAME * 3;
export const CARD_HEIGHT = SCENE_HEIGHT * CARD_SCALE + FRAME * 2;

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

export const formatCardDate = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;

/** Lyhyt jaettava teksti saaliista. */
export function weighCardText(info: WeighCardInfo, url?: string): string {
  const f = info.fish;
  const name = SPECIES[f.species].name.toLowerCase();
  const length = Math.round(fishLengthCm(f.species, f.weight));
  const who = info.angler ? `${info.angler}: ` : '';
  return `${who}${name} ${formatWeight(f.weight)} (${length} cm) Lunkinjärveltä!${url ? ` ${url}` : ''}`;
}

/** Piirtää kortin kankaalle. Fontin latauduttua kortti piirretään uudelleen. */
export function drawWeighCard(info: WeighCardInfo): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  canvas.className = 'weigh-card';
  paintCard(canvas, info);
  document.fonts?.load('40px VT323').then(
    () => paintCard(canvas, info),
    () => undefined,
  );
  return canvas;
}

function paintCard(canvas: HTMLCanvasElement, info: WeighCardInfo): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const f = info.fish;
  ctx.fillStyle = css(0x39424d);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scene = anglerScene(f.species, f.weight, info.appearance, info.timeOfDay);
  const img = ctx.createImageData(scene.width, scene.height);
  scene.data.forEach((c, k) => {
    img.data[k * 4] = (c >> 16) & 0xff;
    img.data[k * 4 + 1] = (c >> 8) & 0xff;
    img.data[k * 4 + 2] = c & 0xff;
    img.data[k * 4 + 3] = 255;
  });
  const small = document.createElement('canvas');
  small.width = scene.width;
  small.height = scene.height;
  small.getContext('2d')?.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, FRAME, FRAME, scene.width * CARD_SCALE, scene.height * CARD_SCALE);

  const px = FRAME * 2 + scene.width * CARD_SCALE;
  ctx.fillStyle = css(0x1c232b);
  ctx.fillRect(px, FRAME, PANEL_WIDTH, CARD_HEIGHT - FRAME * 2);
  const left = px + 20;
  const maxWidth = PANEL_WIDTH - 40;
  let y = FRAME + 14;
  const line = (text: string, size: number, color: number, gap = 6) => {
    ctx.font = `${size}px VT323, monospace`;
    // Pitkä rivi pienenee, jotta se mahtuu paneeliin.
    let s = size;
    while (s > 16 && ctx.measureText(text).width > maxWidth) {
      s -= 2;
      ctx.font = `${s}px VT323, monospace`;
    }
    ctx.fillStyle = css(color);
    ctx.textBaseline = 'top';
    ctx.fillText(text, left, y);
    y += s + gap;
  };
  line('PUNNITUSKORTTI', 26, 0x8e99a4, 10);
  line(SPECIES[f.species].name, 56, 0xfff3b0, 0);
  line(formatWeight(f.weight), 76, 0xf6d04d, 2);
  line(`${Math.round(fishLengthCm(f.species, f.weight))} cm`, 36, 0xeef2f3, 14);
  line(`Kisa-aika ${formatTime(f.time)} · ${TIME_OF_DAY_NAMES[info.timeOfDay]}`, 26, 0xc3cbd2);
  if (info.spot) line(info.spot, 26, 0xc3cbd2);
  if (info.angler) line(`Kalastaja: ${info.angler}`, 26, 0xc3cbd2);
  y = CARD_HEIGHT - FRAME - 38;
  line(`Lunkinjärvi, Tammela · ${formatCardDate(info.date)}`, 24, 0x8e99a4);
}

/** Kortti PNG-kuvana. */
export function cardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export const cardFileName = (info: WeighCardInfo) =>
  `lunki-${info.fish.species}-${info.fish.weight.toFixed(2).replace('.', '_')}kg.png`;
