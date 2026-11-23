import { CAST, POLE, distance, type Vec2 } from '@lunki/shared';

/** Muiden väsytyksen näkyvyys (#368, vaihe A ilman protokollamuutosta). */
export const REMOTE_FIGHT = {
  /** Kalan nopeus (m/s), jolla vapa on täysin taipunut. */
  fullSpeed: 2.5,
  /** Taipuma levossa olevan kalan kanssa (0–1). */
  restBend: 0.45,
  /** Nopeuden tasoitus (s): taipuma ei hypi verkon näytteiden mukana. */
  smoothing: 0.35,
  /** Molskahdusten väli keskimäärin (s); pakeneva kala molskahtaa tiheämmin. */
  splashEvery: 4,
  /** Kalastajan yllä oleva merkki näkyy tätä lähempänä (m). */
  markRange: 120,
  /**
   * Onkivavan suurin taipuma muiden kuvassa (rad, #811): jännitystä ei
   * tiedetä, joten taipuma on suunnilleen kevyen kalan oma taipuma
   * (`loadBend` noin 0,3 kg:lla). Täysi `ROD_MOTION.pole.maxBend` kaarsi
   * kärjen yli pystyn.
   */
  poleBend: 1.2,
  /** Pystyyn nousun tasoitus (s): vapa nousee ja laskee pehmeästi. */
  uprightSmoothing: 0.6,
} as const;

/**
 * Muiden onkivapa pystyssä 0–1 (#811): oma vapa nousee pystyyn väsytyksen
 * lopussa (#805), jolloin kala tulee kärjen mukana virvelin kärjen kohdalle.
 * Nostoa ei lähetetä verkon yli, joten se päätellään kalan etäisyydestä
 * kalastajaan: laskettuna kärki on `POLE.reach` päässä, pystyssä virvelin
 * kärjen kohdalla.
 */
export function poleUprightAt(fishDistance: number): number {
  const c = Math.max(0, Math.min(1, (POLE.reach - fishDistance) / (POLE.reach - CAST.rodReach)));
  return c * c * (3 - 2 * c);
}

export interface FightPose {
  /** Vavan taipuma 0–1. */
  bend: number;
  /** Nykäisy (rad), lisätään taipumaan. */
  jerk: number;
  /** Tässä ruudussa kalan kohdalle molskahdus (koko), tai null. */
  splash: number | null;
  /** Onkivapa pystyssä 0–1 (#811); 0, kun kalastajan paikkaa ei annettu. */
  upright: number;
}

/**
 * Yhden pelaajan väsytys: kalan paikka on vieheen paikka, joten taipuma ja
 * molskahdukset päätellään sen liikkeestä. Satunnaisuus vain piirrossa
 * (`random`), ei kalakannan arvonnassa.
 */
export class RemoteFight {
  private last: Vec2 | null = null;
  private speed = 0;
  private phase = 0;
  private upright: number | null = null;

  constructor(private readonly random: () => number = Math.random) {}

  /**
   * Kala kiinni kohdassa `fish`; `dt` = aika edellisestä (s). Ongella
   * `angler` on kalastajan paikka, josta päätellään vavan nosto.
   */
  update(fish: Vec2, dt: number, angler?: Vec2): FightPose {
    const raw = this.last && dt > 0 ? distance(this.last, fish) / dt : 0;
    this.last = { x: fish.x, y: fish.y };
    // Muiden paikat ovat tasoitettuja näytteitä, joten nopeus on ruudusta ruutuun sileä.
    const k = Math.min(1, dt / REMOTE_FIGHT.smoothing);
    this.speed += (Math.min(raw, REMOTE_FIGHT.fullSpeed * 2) - this.speed) * k;
    const run = Math.min(1, this.speed / REMOTE_FIGHT.fullSpeed);
    const bend = REMOTE_FIGHT.restBend + (1 - REMOTE_FIGHT.restBend) * run;
    this.phase += dt * (6 + 10 * run);
    const jerk = Math.sin(this.phase) * 0.04 * (0.5 + run);
    const rate = (1 + 2 * run) / REMOTE_FIGHT.splashEvery;
    const splash = this.random() < rate * dt ? 0.5 + 0.5 * run : null;
    let upright = 0;
    if (angler) {
      const want = poleUprightAt(distance(angler, fish));
      this.upright =
        this.upright === null
          ? want
          : this.upright + (want - this.upright) * Math.min(1, dt / REMOTE_FIGHT.uprightSmoothing);
      upright = this.upright;
    }
    return { bend, jerk, splash, upright };
  }

  /** Kala irtosi tai nostettiin: seuraava väsytys alkaa levosta. */
  reset(): void {
    this.last = null;
    this.speed = 0;
    this.upright = null;
  }
}
