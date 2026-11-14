import type { CameraInput } from './controls';

/** Kisan näkymä: ylhäältä, kalastajan silmin tai kalastajan takaa (#691). */
export type ViewMode = 'top' | 'pov' | 'chase';

/** Näkymä järven tasolta (perspektiivi): maisema, usva ja kaukosumu näkyvät. */
export const lakeLevel = (mode: ViewMode): boolean => mode !== 'top';

/**
 * Seuraava näkymä {view}-napilla: silmin → takaa → ylhäältä. Katsojalla ei ole
 * omaa kalastajaa, jonka takaa katsoa, joten hänellä vaihtuvat vain kaksi.
 */
export function nextView(mode: ViewMode, spectating = false): ViewMode {
  if (spectating) return mode === 'top' ? 'pov' : 'top';
  return mode === 'pov' ? 'chase' : mode === 'chase' ? 'top' : 'pov';
}

/**
 * Takaa-näkymän kameran rata. Kamera kulkee yhtä kaarta: alhaalla se on
 * lähellä ja matalalla selän takana, ylhäällä kaukana ja yläviistossa.
 */
export const CHASE = {
  /** Kaaren alapää: korkeuskulma (rad) ja etäisyys kalastajasta (m). */
  low: { elevation: 0.2, distance: 3 },
  /** Kaaren yläpää. */
  high: { elevation: 1.05, distance: 7.5 },
  /** Kohta kaarella näkymän auetessa (0 = alhaalla, 1 = ylhäällä). */
  start: 0.28,
  /** Näppäimillä ja tatilla: kierto (rad/s) ja nosto (kaarta/s). */
  turnRate: 1.9,
  tiltRate: 0.5,
  /** Sormella: kierto (rad) ja nosto (kaarta) vedettyä ruudun korkeutta kohden. */
  dragTurn: 3.2,
  dragTilt: 1.4,
  /** Potkiessa sivukierto palaa selän taakse tällä nopeudella (1/s). */
  returnRate: 2.2,
  /** Kohta, jota kamera katsoo: kalastajan hartiat (m vedenpinnasta). */
  lookHeight: 0.7,
  /** Katse nousee kohteesta tämän verran (rad), jotta järveä näkyy kalastajan edessä. */
  lookAhead: 0.1,
  /** Kamera pysyy tämän verran veden tai maan pinnan yllä (m). */
  clearance: 0.3,
  /**
   * Noston ajaksi (#707) kamera kiertää sivulle, jotta haavi ja kala eivät jää
   * kalastajan taakse: sivukierto (rad), nosto kaarella, liu'un nopeus (1/s)
   * ja aika, jonka kamera viipyy sivulla noston jälkeen (s, kalan nosto
   * haavilla kestää 1,4 s).
   */
  landing: { yaw: 0.85, tilt: 0.06, rate: 2.5, linger: 1.8 },
} as const;

/** Kameran paikka kaarella: korkeuskulma (rad) ja etäisyys (m). */
export function chaseArc(tilt: number): { elevation: number; distance: number } {
  const k = Math.min(1, Math.max(0, tilt));
  return {
    elevation: CHASE.low.elevation + (CHASE.high.elevation - CHASE.low.elevation) * k,
    distance: CHASE.low.distance + (CHASE.high.distance - CHASE.low.distance) * k,
  };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Takaa-näkymän kameran asento kalastajan suhteen: sivukierto katsesuunnasta
 * ja kohta kaarella. Kamera vain katsoo: liike ja heitto kulkevat edelleen
 * kalastajan suuntaan.
 */
export class ChaseOrbit {
  /** Katseen kierto kalastajan suunnasta (rad, + = vasemmalle). */
  yaw = 0;
  /** Kohta kaarella, 0–1. Jää siihen, mihin pelaaja sen asetti. */
  tilt: number = CHASE.start;
  /** Noston sivukierron osuus, 0–1 (#707). */
  private swing = 0;
  /** Aika, jonka kamera vielä viipyy sivulla noston jälkeen (s). */
  private linger = 0;
  /** Pelaaja käänsi kameraa itse noston aikana: kamera ei liiku itsestään. */
  private own = false;

  /** Kamera takaisin selän taakse (näkymän vaihtuessa). */
  center(): void {
    this.yaw = 0;
    this.swing = 0;
    this.linger = 0;
    this.own = false;
  }

  /** Kameran sivukierto ja kohta kaarella noston liuku mukana. */
  get view(): { yaw: number; tilt: number } {
    // Pehmeä lähtö ja pysähdys.
    const k = this.swing * this.swing * (3 - 2 * this.swing);
    return {
      yaw: wrap(this.yaw + CHASE.landing.yaw * k),
      tilt: Math.min(1, this.tilt + CHASE.landing.tilt * k),
    };
  }

  /**
   * `moving` = pelaaja potkii tai kääntyy: sivukierto palaa silloin selän
   * taakse, ellei pelaaja juuri käännä kameraa. `screenHeight` on ruudun
   * korkeus CSS-pikseleinä sormen vetoa varten. `landing` = kala on haavilla
   * tai nostettavana: kamera liukuu sivulle ja palaa noston jälkeen. Pelaajan
   * oma kääntö voittaa: kamera jää siihen, mihin hän sen käänsi.
   */
  step(
    dt: number,
    input: CameraInput,
    moving: boolean,
    screenHeight: number,
    landing = false,
  ): void {
    const drag = input.drag;
    const steering = input.turn !== 0 || input.tilt !== 0 || !!drag;
    if (landing) this.linger = CHASE.landing.linger;
    else this.linger = Math.max(0, this.linger - dt);
    const aside = this.linger > 0;
    if (!aside) this.own = false;
    else if (steering && !this.own) {
      // Liuku jää pelaajan omaksi kulmaksi, ettei kuva hyppää.
      const v = this.view;
      this.yaw = v.yaw;
      this.tilt = v.tilt;
      this.swing = 0;
      this.own = true;
    }
    const goal = aside && !this.own ? 1 : 0;
    const stride = CHASE.landing.rate * dt;
    this.swing += Math.min(stride, Math.max(-stride, goal - this.swing));
    const h = Math.max(1, screenHeight);
    // Sormen veto oikealle kääntää katsetta oikealle ja veto ylös nostaa kameraa.
    const turn = input.turn * CHASE.turnRate * dt - ((drag?.dx ?? 0) / h) * CHASE.dragTurn;
    const tilt = input.tilt * CHASE.tiltRate * dt - ((drag?.dy ?? 0) / h) * CHASE.dragTilt;
    this.yaw = wrap(this.yaw + turn);
    this.tilt = Math.min(1, Math.max(0, this.tilt + tilt));
    if (moving && input.turn === 0 && !drag) this.yaw *= Math.exp(-CHASE.returnRate * dt);
  }
}
