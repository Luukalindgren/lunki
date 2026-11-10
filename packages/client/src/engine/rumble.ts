/**
 * Peliohjaimen värinä (#592) selaimen Gamepad API:lla
 * (`vibrationActuator.playEffect('dual-rumble')`). Tuki tunnistetaan
 * ohjaimesta: Chrome ja Edge värisevät, muut selaimet jättävät värinän pois.
 *
 * Värinää ei kutsuta pelistä suoraan: äänikartan (`audio/sounds.ts`) rivin
 * `rumble`-kenttä päättää tapahtuman värinän, ja kalan veto tulee
 * `Sounds.pull`-kutsusta.
 */

/** Yksi värähdys: kesto ja moottorien voimat 0–1. */
export interface RumbleEffect {
  ms: number;
  /** Raskas moottori (matala jyrinä). */
  strong: number;
  /** Kevyt moottori (terävä värinä). */
  weak: number;
}

/** Tapahtumien värähdykset. */
export const RUMBLES = {
  /** Tärpin nykäys: lyhyt ja terävä. */
  tug: { ms: 70, strong: 0.25, weak: 0.9 },
  /** Ison kalan tärppi: sama tahti, raskaampi. */
  tugBig: { ms: 90, strong: 0.7, weak: 1 },
  /** Kala tarttui. */
  hooked: { ms: 140, strong: 0.6, weak: 0.6 },
  /** Perhosiima suoristui: pieni nykäys kertoo "nyt"-hetken. */
  tick: { ms: 50, strong: 0, weak: 0.6 },
  /** Pohjatartunta ja siiman katkeaminen: yksi tömähdys. */
  thud: { ms: 220, strong: 1, weak: 0.5 },
  /** Lähisalama, iso aalto ja kaatuminen. */
  slam: { ms: 450, strong: 1, weak: 1 },
} as const satisfies Record<string, RumbleEffect>;

export type RumbleId = keyof typeof RUMBLES;

/** Jatkuva veto uusitaan näin usein (ms); yksi pätkä kestää kaksi väliä. */
const PULL_EVERY = 100;

/**
 * Kalan vedon värinä siiman kuormasta (0 = löysä, 1 = katkeamassa): heikko
 * värinä voimistuu kireyden mukana, ja raskas moottori herää vasta lähellä
 * katkeamista.
 */
export function pullEffect(load: number): RumbleEffect {
  const l = Math.min(1, Math.max(0, load));
  return { ms: PULL_EVERY * 2, strong: l ** 3, weak: 0.12 + 0.45 * l };
}

interface Actuator {
  playEffect(type: 'dual-rumble', params: Record<string, number>): Promise<unknown>;
  reset?(): Promise<unknown>;
}

function actuators(): Actuator[] {
  try {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
    const out: Actuator[] = [];
    for (const pad of navigator.getGamepads()) {
      const a = (pad as { vibrationActuator?: Actuator | null } | null)?.vibrationActuator;
      if (a && typeof a.playEffect === 'function') out.push(a);
    }
    return out;
  } catch {
    return [];
  }
}

export class Rumble {
  /** Pelaajan asetus (Asetukset → Äänet). */
  enabled = true;
  /** Pelaaja käyttää ohjainta: pöydällä lepäävä ohjain ei värise. */
  active = false;
  private pulseUntil = 0;
  private nextPull = 0;
  private pulling = false;

  constructor(
    private readonly pads: () => Actuator[] = actuators,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Tapahtuman värähdys; ohittaa kalan vedon kestonsa ajaksi. */
  pulse(id: RumbleId): void {
    if (!this.enabled || !this.active) return;
    const e: RumbleEffect = RUMBLES[id];
    this.pulseUntil = this.now() + e.ms;
    this.send(e);
  }

  /**
   * Kalan veto: kutsutaan joka askeleella siiman kuormalla 0–1. Nolla
   * lopettaa värinän; kutsujen loppuessa (tauko) viimeinen pätkä hiipuu itse.
   */
  pull(load: number): void {
    if (!this.enabled || !this.active || load <= 0) {
      if (this.pulling) this.stop();
      return;
    }
    const now = this.now();
    if (now < this.pulseUntil || now < this.nextPull) return;
    this.nextPull = now + PULL_EVERY;
    this.pulling = true;
    this.send(pullEffect(load));
  }

  stop(): void {
    this.pulling = false;
    this.nextPull = 0;
    if (this.now() < this.pulseUntil) return;
    for (const a of this.pads()) void a.reset?.().catch(() => {});
  }

  private send(e: RumbleEffect): void {
    for (const a of this.pads())
      void a
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: e.ms,
          strongMagnitude: e.strong,
          weakMagnitude: e.weak,
        })
        // Uusi värähdys keskeyttää edellisen, ja selain hylkää sen lupauksen.
        .catch(() => {});
  }
}
