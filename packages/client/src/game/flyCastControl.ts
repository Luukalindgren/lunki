import { FLY_CAST, idealArc, type FlyCastInput, type FlyCastState } from '@lunki/shared';

/** Hiiren pystyliike (px), joka vastaa vavan koko liikerataa (2). */
export const ROD_PIXELS = 400;
/**
 * Heittosuunnan siirto hiiren sivuliikkeestä (rad/px). Kulma kasvaa
 * vasemmalle, joten liike oikealle pienentää sitä (#397).
 */
export const AIM_PER_PIXEL = 0.002;
/** Näppäimistön rytmiheitossa yksi liike kestää näin kauan (s). */
export const KEY_STROKE_TIME = 0.15;
/**
 * Itsestään toimiva siimakäsi (ja rytmiheitto) päästää siimaa, kunnes ilmassa
 * on näin paljon (m). Pidempi heitto vaatii oman siimakäden (#622).
 */
export const KEY_TARGET_LINE = 12;
/**
 * Heiton aloittanut hiiren nappi pohjassa näin kauan (s): siimakäsi on pelaajan.
 * Kosketuslevyn napautus irtoaa nopeammin, ja siimakäsi jää automaattiseksi (#400).
 */
export const GRIP_HOLD = 0.2;
/** Kosketuksella vavan koko liikerata vastaa tätä osuutta ruudun korkeudesta (#236). */
export const TOUCH_ROD_SCREEN = 0.6;

/**
 * Peliohjaimen oikea tatti vapana: tatin ääriasennot ovat tämän verran
 * keskeltä (liikerata on -1…1), joten reunasta reunaan on pitkän siiman kaari.
 */
export const PAD_ROD_RANGE = 0.65;
/** Tatin sivuliike kääntää heiton suuntaa ylhäältä katsottuna (rad/s). */
export const PAD_AIM_SPEED = 0.8;

/**
 * Heittotapa: hiiri, näppäimistön rytmiheitto, sormen pyyhkäisy (#236) tai
 * peliohjaimen oikea tatti.
 */
export type FlyCastMode = 'mouse' | 'keyboard' | 'touch' | 'pad';

/** Sormen liike (CSS px) hiiren pikseleiksi: koko liikerata on osa ruudun korkeutta. */
export const touchToRodPixels = (d: number, screenHeight: number) =>
  (d * ROD_PIXELS) / (TOUCH_ROD_SCREEN * Math.max(1, screenHeight));

export interface FlyCastButtons {
  /** Siimakäsi pohjassa: hiiren vasen, välilyönti tai kosketuksen SIIMA. */
  grip: boolean;
  /** Siimakäden nappia painettiin juuri tällä askeleella. */
  gripPressed?: boolean;
  /** Veto painettiin: hiiren oikea, F tai kosketuksen VETO. */
  haul: boolean;
  /** Välilyönti painettiin (rytmiheitto). */
  key: boolean;
  /** Hiiren liike tällä askeleella (px); kosketuksella `touchToRodPixels`. */
  dx: number;
  dy: number;
  /**
   * Peliohjaimen oikea tatti (-1…1, y kasvaa alas). `aim`: sivuliike kääntää
   * heiton suuntaa (ylhäältä; kalastajan silmin se kääntää kalastajaa).
   */
  stick?: { x: number; y: number; aim: boolean };
}

/**
 * Perhoheiton ohjaus (#235). Hiirellä vapaa heilutetaan pystyliikkeellä
 * (poispäin = eteen). Näppäimistöllä välilyönti tekee rytmissä vuoroin taka-
 * ja eteenheiton, ja siimakäsi on automaattinen. Kosketuksella (#236)
 * pyyhkäisy ylös on eteenheitto ja alas takaheitto. Peliohjaimella oikea
 * tatti on vapa: tatin asento on vavan asento, eli alas takaheitto ja ylös
 * eteenheitto, ja tatti pidetään paikallaan, kunnes siima suoristuu. Jos
 * tattiin ei ole koskettu, heittonappi vaihtaa rytmiheittoon.
 *
 * Hiirellä ja kosketuksella siimakäsi toimii itsestään, kunnes pelaaja ottaa
 * sen: painaa siimakäden nappia (hiiren vasen, välilyönti, SIIMA) tai pitää
 * heiton aloittanutta hiiren nappia pohjassa. Kosketuslevyllä vapaa voi siis
 * heilauttaa painamatta mitään, ja siimakäden voi ottaa toisella kädellä
 * näppäimistöltä (#400).
 */
export class FlyCastControl {
  mode: FlyCastMode = 'mouse';
  private auto: { rate: number; left: number } | null = null;
  private queued = false;
  /** Siimakäden nappia on painettu tässä heitossa: siimakäsi on pelaajan. */
  private manualGrip = false;
  /** Siimakäden nappi on ollut yhtäjaksoisesti pohjassa (s). */
  private gripHeld = 0;
  /** Peliohjain: tatin edellinen asento vavan liikeradalla ja onko tattia liikutettu. */
  private stickRod = 0;
  private stickUsed = false;

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
    this.gripHeld = 0;
    // Tatti lähtee keskeltä: sen ensimmäinen liike on jo vavan liikettä.
    this.stickRod = 0;
    this.stickUsed = false;
  }

  read(c: FlyCastState, b: FlyCastButtons, dt: number): FlyCastInput {
    // Nosto ohjaimella: heittonappi ennen tatin liikettä jatkaa rytmiheittona.
    if (this.mode === 'pad' && b.key && !this.stickUsed) {
      this.mode = 'keyboard';
      this.queued = true;
    }
    if (this.mode !== 'keyboard') {
      this.gripHeld = b.grip ? this.gripHeld + dt : 0;
      // Kosketuksella SIIMA-nappi ei aloita heittoa, joten jo painallus ottaa käden.
      if (b.gripPressed || (b.grip && (this.mode === 'touch' || this.gripHeld >= GRIP_HOLD)))
        this.manualGrip = true;
      const pad = this.mode === 'pad';
      const to = pad ? -(b.stick?.y ?? 0) * PAD_ROD_RANGE : 0;
      const rod = pad ? to - this.stickRod : -b.dy * (2 / ROD_PIXELS);
      this.stickRod = to;
      if (pad && rod !== 0) this.stickUsed = true;
      // Silmukan aikana alkava liike: käsi puristaa jo liikkeen ensimmäisellä askeleella.
      const grip = this.manualGrip
        ? b.grip
        : autoGrip(c) || Math.abs(rod) >= FLY_CAST.moveStart * dt;
      return {
        rod,
        grip,
        haul: b.haul,
        aim: pad ? (b.stick?.aim ? -b.stick.x * PAD_AIM_SPEED * dt : 0) : -b.dx * AIM_PER_PIXEL,
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
