import { waveLength, wavePeriod, type Vec2 } from '@lunki/shared';

const G = 9.81;
/** Aallon jakso lasketaan tyypillisellä pyyhkäisymatkalla (m); korkeus tulee paikallisesti. */
const TYPICAL_FETCH = 800;
/**
 * Aallokko piirretään ja keinutetaan liioiteltuna: oikeat 2–4 m aallot
 * olisivat liian tiheitä ja matalia, jotta keinunnan huomaisi.
 */
const LENGTH_FACTOR = 4;
const MIN_LENGTH = 8;
/** Näkyvä korkeus suhteessa merkitsevään aallonkorkeuteen. */
export const SWELL_GAIN = 2.4;
/** Tuulen nopeuden tasoitus (s): puuskat eivät saa muuttaa aallonpituutta. */
const WIND_SMOOTHING = 10;

/**
 * Kolme aaltojonoa: pääaalto tuulen suuntaan ja kaksi lyhyempää vinosti,
 * jolloin pinta kumpuilee eikä näytä aaltopellilta. Summan huippu on noin
 * puolet merkitsevästä aallonkorkeudesta.
 */
const COMPONENTS = [
  { angle: 0, length: 1, amp: 0.32 },
  { angle: 0.55, length: 0.6, amp: 0.16 },
  { angle: -0.8, length: 0.45, amp: 0.09 },
] as const;

export interface SwellWave {
  /** Etenemissuunta (yksikkövektori), aaltoluku (rad/m), vaihe (rad) ja korkeuskerroin. */
  dir: Vec2;
  k: number;
  phase: number;
  amp: number;
}

/**
 * Tuulen aallokko keinuntaan ja POV-näkymän aaltoilevaan pintaan. Sama
 * kaava lasketaan täällä (kameran nosto ja kallistus) ja vesishaderissa
 * (pinnan korkeus), joten rengas keinuu täsmälleen näkyvän pinnan mukana.
 *
 * Vaihe kerätään askel kerrallaan: jos se laskettaisiin kaavalla
 * kello · ω, puuskien muuttama ω hyppyyttäisi vaihetta sitä enemmän,
 * mitä pidempään kisa on kestänyt. Aallonpituuden tai suunnan muuttuessa
 * vaihetta korjataan niin, että pinta pysyy jatkuvana kalastajan kohdalla.
 */
export class Swell {
  readonly waves: SwellWave[] = COMPONENTS.map(() => ({
    dir: { x: 1, y: 0 },
    k: (2 * Math.PI) / MIN_LENGTH,
    phase: 0,
    amp: 0,
  }));
  private wind = NaN;

  /** `origin` = vaiheen nollakohta (m): järven keskikohta, jotta luvut pysyvät pieninä. */
  constructor(readonly origin: Vec2 = { x: 0, y: 0 }) {}

  update(dt: number, windSpeed: number, windDir: number, anchor: Vec2): void {
    this.wind = Number.isFinite(this.wind)
      ? this.wind + (windSpeed - this.wind) * Math.min(1, dt / WIND_SMOOTHING)
      : windSpeed;
    const length = Math.max(
      MIN_LENGTH,
      waveLength(wavePeriod(this.wind, TYPICAL_FETCH)) * LENGTH_FACTOR,
    );
    const ax = anchor.x - this.origin.x;
    const ay = anchor.y - this.origin.y;
    COMPONENTS.forEach((c, i) => {
      const w = this.waves[i]!;
      const k = (2 * Math.PI) / (length * c.length);
      const dir = { x: Math.cos(windDir + c.angle), y: Math.sin(windDir + c.angle) };
      // Sama vaihe kalastajan kohdalla ennen ja jälkeen muutoksen.
      const before = w.k * (ax * w.dir.x + ay * w.dir.y);
      const after = k * (ax * dir.x + ay * dir.y);
      w.phase += after - before;
      w.k = k;
      w.dir = dir;
      w.amp = c.amp * SWELL_GAIN;
      // Syvän veden aallon kulmataajuus ω = √(g·k): pitkä aalto keinuu hitaasti.
      w.phase = (w.phase + Math.sqrt(G * k) * dt) % (Math.PI * 2000);
    });
  }

  /** Pinnan korkeus (m) ja kaltevuus (dh/dx, dh/dy) pisteessä, kun merkitsevä aallonkorkeus on hs. */
  sample(p: Vec2, hs: number): { height: number; slope: Vec2 } {
    const x = p.x - this.origin.x;
    const y = p.y - this.origin.y;
    let h = 0;
    let gx = 0;
    let gy = 0;
    for (const w of this.waves) {
      const a = w.k * (x * w.dir.x + y * w.dir.y) - w.phase;
      h += w.amp * Math.sin(a);
      const c = w.amp * Math.cos(a) * w.k;
      gx += c * w.dir.x;
      gy += c * w.dir.y;
    }
    return { height: h * hs, slope: { x: gx * hs, y: gy * hs } };
  }
}
