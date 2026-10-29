import { FLY_IDS, LURE_IDS, type FlyId, type LureId, type Method } from '@lunki/shared';

/**
 * Vieheiden, perhojen ja vapojen pikselikuvat (#362) samaan tyyliin kuin
 * kalojen kuvat (`fishArt.ts`): kuva lasketaan koodista, värit ovat pelin
 * paletista ja reunassa on tumma ääriviiva. Jokaisella kuvalla on lyhyt
 * animaatio (lipan siipi pyörii, jigin pyrstö heiluu, kelan kampi pyörii),
 * joka piirretään kerran vaakaliuskaksi. CSS siirtää liuskaa askelin, joten
 * animaatio ei tarvitse JavaScript-silmukkaa.
 */

export type LureArtId = LureId | FlyId;
/** Kalastustavan vapa: virvelivapa kelalla tai perhovapa siimalenkkeineen. */
export type RodArtId = `${Method}Rod`;
type ArtId = LureArtId | RodArtId;

/** Kuvan koko pikseleinä ja animaation kuvien määrä. */
export const LURE_ART_W = 32;
export const LURE_ART_H = 16;
export const LURE_FRAMES = 8;

const OUTLINE = 0x0b0f14;
const EYE = 0xf6d04d;

/** Piirtofunktio: väri pisteessä (x, y) tai -1 (läpinäkyvä). */
type Shape = (x: number, y: number) => number;

/** Pisteen etäisyys janasta. */
function segDist(x: number, y: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const k = len2 > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2)) : 0;
  return Math.hypot(x - x0 - k * dx, y - y0 - k * dy);
}

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** Kolmihaarakoukku riippumassa pisteestä (x0, y0): varsi ja kaksi kaarta. */
function treble(x: number, y: number, x0: number, y0: number, len = 4): boolean {
  const bend = y0 + len;
  return (
    segDist(x, y, x0, y0, x0, bend) < 0.55 ||
    segDist(x, y, x0, bend, x0 - 2, bend - 1.5) < 0.55 ||
    segDist(x, y, x0, bend, x0 + 2, bend - 1.5) < 0.55
  );
}

/** Kolmioaalto -1…1: tasaiset askeleet, joten jokainen kuva eroaa edellisestä. */
const tri = (frame: number) => {
  const p = (frame / LURE_FRAMES) * 4;
  return p < 1 ? p : p < 3 ? 2 - p : p - 4;
};

/** Kiertää piirtoa kulman `a` verran pisteen (px, py) ympäri. */
const rotate =
  (shape: Shape, a: number, px: number, py: number): Shape =>
  (x, y) => {
    const c = Math.cos(-a);
    const s = Math.sin(-a);
    const dx = x - px;
    const dy = y - py;
    return shape(px + dx * c - dy * s, py + dx * s + dy * c);
  };

/** Lusikka: munuaismainen lapa keinuu, ja kirkas puoli välähtää. */
function spoon(frame: number): Shape {
  const phase = (frame / LURE_FRAMES) * Math.PI * 2;
  const c = Math.cos(phase);
  const ry = 5.6 * Math.max(0.3, Math.abs(c));
  const front = c >= 0;
  const tilt = tri(frame) * 0.12;
  return rotate(
    (x, y) => {
      // Lenkki ja jakorengas lavan kärjessä.
      if (Math.abs(Math.hypot(x - 3.5, y - 8) - 1.3) < 0.5) return 0x8e99a4;
      const cy = 8 - Math.sin(((x - 6) / 16) * Math.PI) * 0.8;
      // Lapa levenee takaosaa kohti (munuaisen muoto).
      const r = ry * (0.6 + 0.4 * Math.min(1, (x - 5.5) / 12));
      if (x >= 5.5 && x <= 22.5 && inEllipse(x, y, 14, cy, 8.5, r)) {
        if (!front) return y < cy ? 0xf6d04d : 0xf08a2c;
        if (Math.abs(y - cy) < r * 0.28 && x > 9 && x < 19) return 0xd23a2a;
        if (frame === 0 && x > 10 && x < 13 && y < cy - r * 0.4) return 0xeef2f3;
        return y < cy ? 0xc3cbd2 : 0x8e99a4;
      }
      if (segDist(x, y, 22.5, 8, 24.5, 8) < 0.6) return 0x8e99a4;
      return treble(x, y, 25.5, 7.2) ? 0x8e99a4 : -1;
    },
    tilt,
    4,
    8,
  );
}

/** Vaappu: ahvenkuvioinen runko heiluu lipan ympäri. */
function wobbler(frame: number): Shape {
  return rotate(
    (x, y) => {
      // Läpinäkyvä lippa kuonon edessä vinosti alaspäin.
      if (segDist(x, y, 5.5, 8.5, 2.5, 11.5) < 1) return 0x83c2db;
      if (inEllipse(x, y, 15, 7.5, 9.5, 3.2)) {
        const r = (y - 7.5) / 3.2;
        if (Math.hypot(x - 8.5, y - 6.8) < 1.2)
          return Math.hypot(x - 8.5, y - 6.8) < 0.6 ? OUTLINE : EYE;
        if (r > 0.4) return 0xe0cf9c;
        if (x > 11 && x < 22 && Math.floor(x - 11) % 3 === 0 && r < 0.3) return 0x14301e;
        return r < -0.35 ? 0x24502c : 0x6a9a3e;
      }
      if (x > 24 && x < 26.5 && Math.abs(y - 7.5) < 0.6) return 0x8e99a4;
      return treble(x, y, 12, 10.5, 3) || treble(x, y, 21, 10.5, 3) ? 0x8e99a4 : -1;
    },
    tri(frame) * 0.15,
    4,
    9,
  );
}

/** Jigi: lyijypää ja lapiopyrstöinen kumikala, jonka pyrstö heilahtaa. */
function jig(frame: number): Shape {
  const s = tri(frame);
  const tailX = 25.5;
  const bend = (x: number) => 8 + s * 2.2 * Math.max(0, (x - 9) / (tailX - 9)) ** 2;
  return (x, y) => {
    if (Math.hypot(x - 6, y - 8) < 3.6) {
      if (Math.hypot(x - 5, y - 7) < 1.2) return Math.hypot(x - 5, y - 7) < 0.6 ? OUTLINE : EYE;
      return y < 7 ? 0xd23a2a : 0x8c1c1c;
    }
    // Siiman silmukka pään päällä ja koukun kärki selästä.
    if (Math.abs(Math.hypot(x - 6.5, y - 3.2) - 1) < 0.5) return 0x8e99a4;
    if (segDist(x, y, 15, bend(15) - 1.5, 16.5, bend(16.5) - 4) < 0.55) return 0x8e99a4;
    if (x >= 9 && x <= tailX - 2) {
      const half = 2.6 - ((x - 9) / (tailX - 11)) * 1.6;
      const dy = y - bend(x);
      if (Math.abs(dy) <= half) return dy > half * 0.35 ? 0xf6d04d : 0xa3c45a;
    }
    // Lapiopyrstö kääntyy: kapea sivulta, leveä edestä.
    const cy = bend(tailX);
    const rx = 0.8 + 1.4 * Math.abs(Math.cos((frame / LURE_FRAMES) * Math.PI * 2));
    if (inEllipse(x, y, tailX, cy, rx, 3.2)) return 0xa3c45a;
    return -1;
  };
}

/** Lippa: akseli, helmet ja siipi, joka pyörii akselin ympäri. */
function spinner(frame: number): Shape {
  const phase = (frame / LURE_FRAMES) * Math.PI * 2;
  const c = Math.cos(phase);
  const bright = Math.sin(phase) >= 0;
  const tuft = tri(frame);
  return (x, y) => {
    // Siipi on akselin yhdellä puolella: projektio kapenee ja vaihtaa puolta.
    const reach = 6 * c;
    const ry = Math.max(0.8, Math.abs(reach) / 2);
    if (inEllipse(x, y, 9, 8 - reach / 2, 4.2, ry))
      return bright ? (x < 9 ? 0xeef2f3 : 0xc3cbd2) : 0x5f6b78;
    if (Math.abs(Math.hypot(x - 2.8, y - 8) - 1) < 0.5) return 0x8e99a4;
    if (Math.hypot(x - 14.5, y - 8) < 1.3 || Math.hypot(x - 16.8, y - 8) < 1.3) return 0xd23a2a;
    if (inEllipse(x, y, 20, 8, 2.4, 1.8)) return 0xf6d04d;
    // Tupsu koukun ympärillä hulmuaa.
    if (x > 22 && x < 28 && Math.abs(y - 8 - tuft * (x - 22) * 0.35) < 1.6 - (x - 22) * 0.15)
      return Math.floor(x) % 2 === 0 ? 0xd23a2a : 0xeef2f3;
    if (segDist(x, y, 3.8, 8, 22, 8) < 0.5) return 0x8e99a4;
    return treble(x, y, 26.5, 8.5, 3.5) ? 0x8e99a4 : -1;
  };
}

/** Streamerin sulat aaltoilevat pään takana; koukku vatsan alla. */
function streamer(
  frame: number,
  look: { head: number; from: number; to: number; top: number; bottom: number; flash: number },
): Shape {
  const phase = (frame / LURE_FRAMES) * Math.PI * 2;
  const len = look.to - look.from;
  return (x, y) => {
    if (inEllipse(x, y, look.from + 1.5, 8, 2.2, 2.2)) {
      if (Math.hypot(x - look.from - 1, y - 7.4) < 0.7) return OUTLINE;
      return look.head;
    }
    if (x > look.from + 2 && x <= look.to) {
      const k = (x - look.from) / len;
      const wave = Math.sin(k * 5 - phase) * 1.8 * k;
      const half = 3 * (1 - k * 0.6);
      const dy = y - 8 - wave;
      if (Math.abs(dy) <= half) {
        if (Math.abs(dy) < 0.5 && k > 0.2 && k < 0.8) return look.flash;
        return dy < 0 ? look.top : look.bottom;
      }
    }
    return segDist(x, y, look.from + 3, 10.5, look.from + 7, 12.5) < 0.6 ||
      segDist(x, y, look.from + 7, 12.5, look.from + 8, 11) < 0.6
      ? 0x8e99a4
      : -1;
  };
}

/** Pintapopperi: kova pää pulpahtaa ja roiskii; sulkapyrstö perässä. */
function popper(frame: number): Shape {
  const bob = tri(frame) * 0.8;
  const splash = frame >= 1 && frame <= 3 ? frame : 0;
  return (x, y) => {
    if (splash) {
      // Roiskepisarat kuonon edessä.
      for (const [dx, dy] of [
        [2.5, 5],
        [1.5, 8],
        [3, 11],
      ] as const) {
        const px = dx - splash * 0.5;
        const py = dy + (dy - 8) * splash * 0.3;
        if (Math.hypot(x - px, y - py) < 0.8) return splash === 2 ? 0xeef2f3 : 0x83c2db;
      }
    }
    const cy = 8 + bob;
    if (x >= 5 && x <= 13 && Math.abs(y - cy) <= 3.3 - (x - 5) * 0.12) {
      if (Math.hypot(x - 7, y - cy + 1) < 0.9) return OUTLINE;
      if (x < 6) return 0xd23a2a;
      return y < cy ? 0xf6d04d : 0xf08a2c;
    }
    if (x > 13 && x < 24) {
      const k = (x - 13) / 11;
      if (Math.abs(y - cy - Math.sin(k * 4 - frame) * 0.6 * k) < 2.2 - k * 1.2)
        return Math.floor(y + 8) % 2 === 0 ? 0xeef2f3 : 0xd23a2a;
    }
    return segDist(x, y, 12, cy + 3.3, 13, cy + 6) < 0.6 ||
      segDist(x, y, 13, cy + 6, 14.5, cy + 4.8) < 0.6
      ? 0x8e99a4
      : -1;
  };
}

/** Nymfi: kultahelmipää ja rengastettu ruumis keinuu hieman. */
function nymph(frame: number): Shape {
  return rotate(
    (x, y) => {
      if (Math.hypot(x - 10, y - 8) < 1.8)
        return Math.hypot(x - 9.4, y - 7.4) < 0.6 ? 0xfff3b0 : 0xf6d04d;
      if (x >= 11.5 && x <= 21 && Math.abs(y - 8) <= 2.6 - (x - 11.5) * 0.15)
        return Math.floor(x) % 3 === 0 ? 0xb99a68 : 0x5e432b;
      // Jalat ja pyrstösukat.
      if (segDist(x, y, 13, 10, 12, 12.5) < 0.5 || segDist(x, y, 15, 10, 15.5, 12.5) < 0.5)
        return 0x3b2a1e;
      if (segDist(x, y, 21, 8, 24.5, 6.5) < 0.5 || segDist(x, y, 21, 8, 24.5, 9.5) < 0.5)
        return 0x8a6a42;
      return segDist(x, y, 19, 10.8, 22, 12.5) < 0.6 ? 0x8e99a4 : -1;
    },
    tri(frame) * 0.2,
    16,
    8,
  );
}

/** Ruoholusikka (#364): lapa keinuu pyörimättä, yksi koukku ja sen suojalanka. */
function weedless(frame: number): Shape {
  const ry = 4 + tri(frame) * 0.8;
  return rotate(
    (x, y) => {
      if (Math.abs(Math.hypot(x - 3.5, y - 8) - 1.3) < 0.5) return 0x8e99a4;
      const r = ry * (0.6 + 0.4 * Math.min(1, (x - 5.5) / 12));
      if (x >= 5.5 && x <= 22 && inEllipse(x, y, 14, 8, 8.5, r)) {
        if (frame === 2 && x > 9 && x < 12 && y < 8 - r * 0.3) return 0xeef2f3;
        return y < 8 ? 0xf6d04d : 0xf08a2c;
      }
      // Suojalanka lavan perästä koukun kärjen eteen.
      if (segDist(x, y, 20.5, 6, 28, 6.5) < 0.45) return 0xeef2f3;
      return segDist(x, y, 22, 8.5, 25, 10.5) < 0.6 || segDist(x, y, 25, 10.5, 27, 7) < 0.6
        ? 0x8e99a4
        : -1;
    },
    tri(frame) * 0.1,
    4,
    8,
  );
}

/** Ruohostreameri (#364): hauki-streameri, jonka koukkua suojaa lanka. */
function weedlessStreamer(frame: number): Shape {
  const body = streamer(frame, {
    head: 0x24502c,
    from: 3,
    to: 28,
    top: 0xa3c45a,
    bottom: 0xeef2f3,
    flash: 0xf6d04d,
  });
  return (x, y) => (segDist(x, y, 5, 10, 11.5, 13.2) < 0.45 ? 0xc3cbd2 : body(x, y));
}

/** Vavan pisteet kahvasta (k = 0) kärkeen (k = 1); taivutus painaa kärkeä. */
function rodPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bend: number,
): [number, number][] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  // Kohtisuora suunta, joka osoittaa vavan alapuolelle.
  const nx = (y0 - y1) / len;
  const ny = (x1 - x0) / len;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    const off = bend * k * k;
    pts.push([x0 + (x1 - x0) * k + nx * off, y0 + (y1 - y0) * k + ny * off]);
  }
  return pts;
}

/** Kohta k, jossa piste osuu vapaan (paksuus `width(k)`), tai -1. */
function onRod(x: number, y: number, pts: [number, number][], width: (k: number) => number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const k = (i + 0.5) / (pts.length - 1);
    if (segDist(x, y, ax, ay, bx, by) < width(k)) return k;
  }
  return -1;
}

/** Virvelivapa: kärki nyökkii, kelan kampi pyörii ja viehe heiluu siiman päässä. */
function spinRod(frame: number): Shape {
  const phase = (frame / LURE_FRAMES) * Math.PI * 2;
  const pts = rodPoints(2.5, 11, 26.5, 3, 1.4 + Math.sin(phase) * 1.4);
  const [tx, ty] = pts[pts.length - 1]!;
  const lx = tx + tri(frame) * 1.3;
  const ly = 11.5;
  // Kampi kiertää akselin ympäri: sivulta katsottuna nuppi kulkee ylös ja alas.
  const knobX = 11.2 + Math.sin(phase) * 0.7;
  const knobY = 12.6 - Math.cos(phase) * 1.6;
  return (x, y) => {
    // Lusikka siiman päässä.
    if (inEllipse(x, y, lx, ly + 0.8, 1, 1.6)) return y < ly + 0.8 ? 0xf6d04d : 0xd23a2a;
    if (segDist(x, y, tx, ty, lx, ly) < 0.55) return 0xeef2f3;
    if (Math.hypot(x - knobX, y - knobY) < 0.8) return 0xf6d04d;
    if (segDist(x, y, 10, 12.6, knobX, knobY) < 0.5) return 0x8e99a4;
    // Kelan kela: raidat kiertävät rummun ympäri.
    if (inEllipse(x, y, 7.8, 12.6, 2.1, 1.6))
      return (Math.floor(x) + frame) % 3 === 0 ? 0x5f6b78 : 0xc3cbd2;
    if (segDist(x, y, 7.8, 9, 7.8, 11) < 0.55) return 0x8e99a4;
    const k = onRod(x, y, pts, (k) => (k < 0.2 ? 0.85 : 0.6));
    if (k < 0) return -1;
    if (k < 0.2) return 0xb99a68;
    return k < 0.26 ? 0x8e99a4 : 0x8c1c1c;
  };
}

/** Perhovapa: vapa joustaa, ja siiman lenkki aukeaa taaksepäin perho kärjessä. */
function flyRod(frame: number): Shape {
  const phase = (frame / LURE_FRAMES) * Math.PI * 2;
  const p = frame / LURE_FRAMES;
  const pts = rodPoints(2.5, 11.2, 25, 3.8, 0.6 + Math.sin(phase) * 1.6);
  const [tx, ty] = pts[pts.length - 1]!;
  // Lenkki kulkee vasemmalle; ylempi perhon puoleinen haara lyhenee.
  const loopX = 17 - p * 9;
  const flyX = loopX + 1 + (1 - p) * 8;
  const spoke = phase * 0.5;
  return (x, y) => {
    if (Math.hypot(x - flyX, y - 1.6) < 0.9) return 0xd23a2a;
    if (segDist(x, y, tx, ty, loopX, 4.8) < 0.55) return 0xf6d04d;
    if (x <= loopX && Math.abs(Math.hypot(x - loopX, y - 3.2) - 1.6) < 0.55) return 0xf6d04d;
    if (segDist(x, y, loopX, 1.6, flyX, 1.6) < 0.55) return 0xf6d04d;
    // Perhokela kahvan perässä, puola pyörii.
    const r = Math.hypot(x - 5.2, y - 12.6);
    if (r < 2) {
      if (segDist(x, y, 5.2, 12.6, 5.2 + Math.cos(spoke) * 1.6, 12.6 + Math.sin(spoke) * 1.6) < 0.5)
        return 0xc3cbd2;
      return r > 1.2 ? 0x5f6b78 : 0x8e99a4;
    }
    const k = onRod(x, y, pts, (k) => (k < 0.22 ? 0.8 : 0.55));
    if (k < 0) return -1;
    return k < 0.22 ? 0xb99a68 : 0x6a9a3e;
  };
}

const SHAPES: Record<ArtId, (frame: number) => Shape> = {
  spoon,
  wobbler,
  jig,
  spinner,
  weedless,
  pikeStreamer: (f) =>
    streamer(f, {
      head: 0xd23a2a,
      from: 3,
      to: 29,
      top: 0xd23a2a,
      bottom: 0xeef2f3,
      flash: 0xf6d04d,
    }),
  popper,
  perchStreamer: (f) =>
    streamer(f, {
      head: 0x3b2a1e,
      from: 7,
      to: 25,
      top: 0x6a9a3e,
      bottom: 0xe0cf9c,
      flash: 0xf08a2c,
    }),
  nymph,
  weedlessStreamer,
  spinRod,
  flyRod,
};

export const LURE_ART_IDS: LureArtId[] = [...LURE_IDS, ...FLY_IDS];
export const ROD_ART_IDS: RodArtId[] = ['spinRod', 'flyRod'];

export interface LurePixels {
  width: number;
  height: number;
  /** Värit riveittäin; -1 on läpinäkyvä. */
  data: number[];
}

/** Vieheen tai vavan yksi animaatiokuva pikseleinä, reunassa tumma ääriviiva. */
export function lurePixels(id: ArtId, frame: number): LurePixels {
  const W = LURE_ART_W;
  const H = LURE_ART_H;
  const shape = SHAPES[id](((frame % LURE_FRAMES) + LURE_FRAMES) % LURE_FRAMES);
  const data: number[] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      // Reunarivit jäävät ääriviivalle.
      const inside = i > 0 && j > 0 && i < W - 1 && j < H - 1;
      data.push(inside ? shape(i + 0.5, j + 0.5) : -1);
    }
  }
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

const cache = new Map<ArtId, string>();

/** Kaikki animaatiokuvat vierekkäin yhtenä data-URL:na (välimuistissa). */
function lureStrip(id: ArtId): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = LURE_ART_W * LURE_FRAMES;
  canvas.height = LURE_ART_H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let f = 0; f < LURE_FRAMES; f++) {
    lurePixels(id, f).data.forEach((c, k) => {
      if (c < 0) return;
      const i = (k % LURE_ART_W) + f * LURE_ART_W;
      const o = (Math.floor(k / LURE_ART_W) * canvas.width + i) * 4;
      img.data[o] = (c >> 16) & 0xff;
      img.data[o + 1] = (c >> 8) & 0xff;
      img.data[o + 2] = c & 0xff;
      img.data[o + 3] = 255;
    });
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}

/**
 * Vieheen animoitu kuva. `scale` on näyttöpikseleitä kuvan pikseliä kohden
 * CSS-lausekkeena, esim. 'calc(var(--u) * 1.5)' tai '3px'. Kuva on ikkuna,
 * jonka takana liuska liikkuu askelin (`style.css`, `.lure-art`).
 */
export function lureImage(id: ArtId, scale = '2px'): HTMLElement {
  const box = document.createElement('span');
  box.className = 'lure-art';
  box.dataset.lure = id;
  box.style.width = `calc(${scale} * ${LURE_ART_W})`;
  box.style.height = `calc(${scale} * ${LURE_ART_H})`;
  box.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.src = lureStrip(id);
  img.alt = '';
  img.style.width = `calc(${scale} * ${LURE_ART_W * LURE_FRAMES})`;
  img.style.height = `calc(${scale} * ${LURE_ART_H})`;
  box.appendChild(img);
  return box;
}

/** Kalastustavan vavan animoitu kuva (kalastustavan pikavalikko). */
export function rodImage(method: Method, scale = '4px'): HTMLElement {
  return lureImage(`${method}Rod`, scale);
}
