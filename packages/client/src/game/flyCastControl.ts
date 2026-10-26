import { idealArc, type FlyCastInput, type FlyCastState } from '@lunki/shared';

/** Hiiren pystyliike (px), joka vastaa vavan koko liikerataa (2). */
export const ROD_PIXELS = 400;
/** Heittosuunnan siirto hiiren sivuliikkeestä (rad/px). */
export const AIM_PER_PIXEL = 0.002;
/** Näppäimistön rytmiheitossa yksi liike kestää näin kauan (s). */
export const KEY_STROKE_TIME = 0.15;
/** Näppäimistöllä siimakäsi päästää siimaa, kunnes ilmassa on näin paljon (m). */
export const KEY_TARGET_LINE = 16;
/** Kosketuksella vavan koko liikerata vastaa tätä osuutta ruudun korkeudesta (#236). */
export const TOUCH_ROD_SCREEN = 0.6;

/** Heittotapa: hiiri, näppäimistön rytmiheitto tai sormen pyyhkäisy (#236). */
export type FlyCastMode = 'mouse' | 'keyboard' | 'touch';

/** Sormen liike (CSS px) hiiren pikseleiksi: koko liikerata on osa ruudun korkeutta. */
export const touchToRodPixels = (d: number, screenHeight: number) =>
  (d * ROD_PIXELS) / (TOUCH_ROD_SCREEN * Math.max(1, screenHeight));

export interface FlyCastButtons {
  /** Hiiren vasen tai kosketuksen SIIMA pohjassa (siimakäsi). */
  grip: boolean;
  /** Hiiren oikea tai kosketuksen VETO painettiin (siimakäden veto). */
  haul: boolean;
  /** Välilyönti painettiin (rytmiheitto). */
  key: boolean;
  /** Hiiren liike tällä askeleella (px); kosketuksella `touchToRodPixels`. */
  dx: number;
  dy: number;
}

/**
 * Perhoheiton ohjaus (#235). Hiirellä vapaa heilutetaan pystyliikkeellä
 * (poispäin = eteen) ja vasen nappi on siimakäsi. Näppäimistöllä välilyönti
 * tekee rytmissä vuoroin taka- ja eteenheiton, ja siimakäsi on automaattinen.
 * Kosketuksella (#236) pyyhkäisy ylös on eteenheitto ja alas takaheitto;
 * siimakäsi toimii itsestään, kunnes pelaaja painaa SIIMA-nappia.
 */
export class FlyCastControl {
  mode: FlyCastMode = 'mouse';
  private auto: { rate: number; left: number } | null = null;
  private queued = false;
  /** Kosketuksella SIIMA-nappia on painettu tässä heitossa: siimakäsi on pelaajan. */
  private manualGrip = false;

  /** Heitetäänkö näppäimistöllä. */
  get keyboard(): boolean {
    return this.mode === 'keyboard';
  }

  /** Heitto alkaa: näppäimistöllä ensimmäinen painallus on jo takaheitto. */
  start(mode: FlyCastMode): void {
    this.mode = mode;
    this.auto = null;
    this.queued = mode === 'keyboard';
    this.manualGrip = false;
  }

  read(c: FlyCastState, b: FlyCastButtons, dt: number): FlyCastInput {
    if (this.mode !== 'keyboard') {
      if (this.mode === 'touch' && b.grip) this.manualGrip = true;
      const grip = this.mode === 'touch' && !this.manualGrip ? autoGrip(c) : b.grip;
      return {
        rod: -b.dy * (2 / ROD_PIXELS),
        grip,
        haul: b.haul,
        aim: b.dx * AIM_PER_PIXEL,
      };
    }
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
    const grip = this.auto !== null || autoGrip(c);
    if (this.auto) {
      const step = Math.min(dt, this.auto.left);
      rod = this.auto.rate * step;
      this.auto.left -= step;
      if (this.auto.left <= 1e-9) this.auto = null;
    }
    return { rod, grip };
  }
}

/** Automaattinen siimakäsi: pitää liikkeen ajan, silmukoiden auetessa pidentää siimaa. */
const autoGrip = (c: FlyCastState) => c.phase !== 'loop' || c.aerial >= KEY_TARGET_LINE;
