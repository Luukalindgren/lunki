import { distance, type Vec2 } from '@lunki/shared';

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
} as const;

export interface FightPose {
  /** Vavan taipuma 0–1. */
  bend: number;
  /** Nykäisy (rad), lisätään taipumaan. */
  jerk: number;
  /** Tässä ruudussa kalan kohdalle molskahdus (koko), tai null. */
  splash: number | null;
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

  constructor(private readonly random: () => number = Math.random) {}

  /** Kala kiinni kohdassa `fish`; `dt` = aika edellisestä (s). */
  update(fish: Vec2, dt: number): FightPose {
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
    return { bend, jerk, splash };
  }

  /** Kala irtosi tai nostettiin: seuraava väsytys alkaa levosta. */
  reset(): void {
    this.last = null;
    this.speed = 0;
  }
}
