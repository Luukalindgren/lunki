import type { FlyCastState, Vec2 } from '@lunki/shared';
import type { LinePoint } from './lineHang';

/**
 * Perhosiiman muoto heiton aikana (#236). Siima lasketaan sivulta katsottuna
 * heittosuunnan tasossa: `s` = matka renkaan keskeltä heittosuuntaan (m),
 * `h` = korkeus vedenpinnasta (m) ja `lat` = sivusiirtymä oikealle (m).
 * Samaa muotoa käyttävät 3D-näkymät, sivukuvapaneeli ja muiden pelaajien heitot.
 */

/** Siiman pisteet (kiinteä määrä, jotta piirtopuskuri pysyy samana). */
export const FLY_LINE_POINTS = 40;

const SHAPE = {
  /** Siiman korkeus pinnalla. */
  surface: 0.04,
  /** Silmukan leveys (m): kapea hyvällä pysäytyksellä, leveä laimealla. */
  narrow: 0.45,
  wide: 1.3,
  /** Takaheitto nousee taakse, eteenheitto kulkee lähes vaakasuoraan (m/m). */
  backSlope: 0.12,
  frontSlope: -0.02,
  /** Suoristunut siima putoaa ilmanvastuksen hidastamana (m/s²). */
  fall: 3,
  /** Silmukka on kallellaan oikealle, jotta se näkyy ylhäältä kapeana lenkkinä. */
  tilt: 0.6,
  /** Liikkeen aikana perässä laahaava siima painuu kärjestä tämän verran (m/m). */
  trailDrop: 0.2,
} as const;

/** Siiman asento piirtoa varten. */
export interface FlyLinePose {
  /** Vavan kärki: matka renkaan keskeltä heittosuuntaan ja korkeus (m). */
  tipS: number;
  tipH: number;
  /** Ilmassa oleva siima (m). */
  length: number;
  /** `ready` = siima vedessä tai roikkuu, `stroke` = laahaa vavan perässä, `loop` = silmukka. */
  phase: FlyCastState['phase'];
  /** Silmukan tai liikkeen suunta: -1 taakse, +1 eteen. */
  dir: -1 | 1;
  /** Silmukan aukeaminen 0–1 (1 = siima suorassa). */
  unroll: number;
  /** Suoristumisen jälkeen kulunut aika (s): siima alkaa pudota. */
  late: number;
  /** Leveä silmukka. */
  wide: boolean;
}

export interface SidePoint {
  s: number;
  h: number;
  lat: number;
}

/** Perhoheiton tila ja vavan kärki siiman asennoksi. */
export function flyLinePose(
  c: FlyCastState,
  tip: { forward: number; height: number },
): FlyLinePose {
  const loop = c.phase === 'loop' && c.loopTime > 0;
  return {
    tipS: tip.forward,
    tipH: tip.height,
    length: c.aerial,
    phase: c.phase,
    dir: c.dir,
    unroll: loop ? Math.min(1, c.loopAge / c.loopTime) : 0,
    late: loop ? Math.max(0, c.loopAge - c.loopTime) : 0,
    wide: c.wide,
  };
}

/** Siiman pisteet vavan kärjestä perhoon (`FLY_LINE_POINTS` kpl). */
export function flyLineProfile(p: FlyLinePose): SidePoint[] {
  const n = FLY_LINE_POINTS;
  const L = Math.max(0.5, p.length);
  const out: SidePoint[] = [];
  const at = (i: number) => (i / (n - 1)) * L;

  if (p.phase === 'ready') {
    // Siima roikkuu kärjestä veteen ja lepää pinnalla edessä.
    const hang = Math.min(L, Math.max(0.3, p.tipH));
    for (let i = 0; i < n; i++) {
      const sigma = at(i);
      if (sigma < hang) {
        const k = sigma / hang;
        out.push({
          s: p.tipS + 0.5 * k,
          h: SHAPE.surface + (p.tipH - SHAPE.surface) * (1 - k) ** 2,
          lat: 0,
        });
      } else out.push({ s: p.tipS + 0.5 + (sigma - hang), h: SHAPE.surface, lat: 0 });
    }
    return out;
  }

  if (p.phase === 'stroke') {
    // Edellinen silmukka on auennut: siima laahaa vavan perässä vastakkaiseen suuntaan.
    const end = Math.max(SHAPE.surface, p.tipH - SHAPE.trailDrop * L);
    for (let i = 0; i < n; i++) {
      const k = at(i) / L;
      out.push({ s: p.tipS - p.dir * at(i), h: p.tipH - (p.tipH - end) * k ** 1.3, lat: 0 });
    }
    return out;
  }

  // Silmukka: alempi (vavan) osa kulkee kärjestä liikkeen suuntaan, ylempi
  // (perhon) osa palaa sen yläpuolella, ja kärki kiertää puoliympyränä.
  const w = p.wide ? SHAPE.wide : SHAPE.narrow;
  const arc = (Math.PI * w) / 2;
  const x = L * Math.min(1, Math.max(0, p.unroll));
  const slope = p.dir < 0 ? SHAPE.backSlope : SHAPE.frontSlope;
  const drop = 0.5 * SHAPE.fall * p.late * p.late;
  const base = (along: number) => p.tipH + slope * along;
  for (let i = 0; i < n; i++) {
    const sigma = at(i);
    let along: number;
    let lift: number;
    if (sigma <= x) {
      along = sigma;
      lift = 0;
    } else if (sigma <= x + arc) {
      const a = ((sigma - x) / arc) * Math.PI;
      along = x + (w / 2) * Math.sin(a);
      lift = (w / 2) * (1 - Math.cos(a));
    } else {
      along = x - (sigma - x - arc);
      lift = w;
    }
    // Suoristunut siima putoaa: kärki pysyy vavassa, perhon pää putoaa eniten.
    const h = base(along) + lift - drop * (sigma / L);
    out.push({ s: p.tipS + p.dir * along, h: Math.max(SHAPE.surface, h), lat: lift * SHAPE.tilt });
  }
  return out;
}

/**
 * Sivukuvan pisteet järven koordinaatteihin. Vavan kärki on katsesuunnassa
 * `heading` (ja `side` verran oikealla), siima kulkee siitä heittosuuntaan `axis`.
 */
export function flyLineWorld(
  pts: readonly SidePoint[],
  pos: Vec2,
  heading: number,
  axis: number,
  side: Vec2,
  out: LinePoint[] = [],
): LinePoint[] {
  const tipS = pts[0]?.s ?? 0;
  const tx = pos.x + side.x + Math.cos(heading) * tipS;
  const ty = pos.y + side.y + Math.sin(heading) * tipS;
  const cx = Math.cos(axis);
  const cy = Math.sin(axis);
  // Oikea puoli: suunta käännettynä 90° myötäpäivään.
  const rx = Math.cos(axis - Math.PI / 2);
  const ry = Math.sin(axis - Math.PI / 2);
  out.length = pts.length;
  pts.forEach((p, i) => {
    const d = p.s - tipS;
    out[i] = { x: tx + cx * d + rx * p.lat, y: ty + cy * d + ry * p.lat, h: p.h };
  });
  return out;
}

/**
 * Muiden pelaajien perhoheitto (#236): palvelin välittää vain perhon paikan,
 * joten silmukan suunta päätellään perhon liikkeestä ja siiman pituus
 * suurimmasta perhon etäisyydestä. Silmukassa perho on kohdassa
 * kärki + suunta × pituus × (2 × aukeaminen − 1).
 */
export class RemoteFlyLine {
  private length = 0;
  private prev: number | null = null;
  private dir: -1 | 1 = -1;

  reset(): void {
    this.length = 0;
    this.prev = null;
    this.dir = -1;
  }

  /** `along` = perhon matka vavan kärjestä heittosuuntaan (m, - = takana). */
  pose(along: number, tip: { forward: number; height: number }): FlyLinePose {
    if (this.prev !== null && Math.abs(along - this.prev) > 0.02)
      this.dir = along > this.prev ? 1 : -1;
    this.prev = along;
    this.length = Math.max(this.length, Math.abs(along), 1);
    return {
      tipS: tip.forward,
      tipH: tip.height,
      length: this.length,
      phase: 'loop',
      dir: this.dir,
      unroll: Math.min(1, Math.max(0, (this.dir * along) / this.length + 1) / 2),
      late: 0,
      wide: false,
    };
  }
}
