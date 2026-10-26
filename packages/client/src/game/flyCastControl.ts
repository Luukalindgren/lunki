import { idealArc, type FlyCastInput, type FlyCastState } from '@lunki/shared';

/** Hiiren pystyliike (px), joka vastaa vavan koko liikerataa (2). */
export const ROD_PIXELS = 400;
/** Heittosuunnan siirto hiiren sivuliikkeestä (rad/px). */
export const AIM_PER_PIXEL = 0.002;
/** Näppäimistön rytmiheitossa yksi liike kestää näin kauan (s). */
export const KEY_STROKE_TIME = 0.15;
/** Näppäimistöllä siimakäsi päästää siimaa, kunnes ilmassa on näin paljon (m). */
export const KEY_TARGET_LINE = 16;

export interface FlyCastButtons {
  /** Hiiren vasen pohjassa (siimakäsi). */
  grip: boolean;
  /** Hiiren oikea painettiin (siimakäden veto). */
  haul: boolean;
  /** Välilyönti painettiin (rytmiheitto). */
  key: boolean;
  /** Hiiren liike tällä askeleella (px). */
  dx: number;
  dy: number;
}

/**
 * Perhoheiton ohjaus (#235). Hiirellä vapaa heilutetaan pystyliikkeellä
 * (poispäin = eteen) ja vasen nappi on siimakäsi. Näppäimistöllä välilyönti
 * tekee rytmissä vuoroin taka- ja eteenheiton, ja siimakäsi on automaattinen.
 */
export class FlyCastControl {
  /** Heitetäänkö näppäimistöllä. */
  keyboard = false;
  private auto: { rate: number; left: number } | null = null;
  private queued = false;

  /** Heitto alkaa: näppäimistöllä ensimmäinen painallus on jo takaheitto. */
  start(keyboard: boolean): void {
    this.keyboard = keyboard;
    this.auto = null;
    this.queued = keyboard;
  }

  read(c: FlyCastState, b: FlyCastButtons, dt: number): FlyCastInput {
    if (!this.keyboard)
      return {
        rod: -b.dy * (2 / ROD_PIXELS),
        grip: b.grip,
        haul: b.haul,
        aim: b.dx * AIM_PER_PIXEL,
      };
    if (b.key) this.queued = true;
    if (this.queued && !this.auto && c.phase !== 'stroke' && c.busy === 0) {
      this.queued = false;
      // Valmiusasennosta takaheitto, muuten vastakkaiseen suuntaan.
      const dir = c.phase === 'ready' ? -1 : -c.dir;
      const to = (dir * idealArc(c.aerial)) / 2;
      this.auto = { rate: (to - c.rod) / KEY_STROKE_TIME, left: KEY_STROKE_TIME };
    }
    let rod = 0;
    // Liikkeen ajan siimakäsi puristaa, silmukoiden auetessa siimaa pidennetään.
    const grip = this.auto !== null || c.phase !== 'loop' || c.aerial >= KEY_TARGET_LINE;
    if (this.auto) {
      const step = Math.min(dt, this.auto.left);
      rod = this.auto.rate * step;
      this.auto.left -= step;
      if (this.auto.left <= 1e-9) this.auto = null;
    }
    return { rod, grip };
  }
}
