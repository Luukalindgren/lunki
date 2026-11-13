/**
 * Pelin ilme (#674): Retro piirtää pieneen kuvaan pelin paletilla, Terävä
 * saman kohtauksen näytön täydellä tarkkuudella ilman palettia ja reunat
 * pehmennettyinä. Laitteen asetus kuten HUDin koko, ei pelaajan profiilissa.
 *
 * Ilme muuttaa vain piirron tarkkuutta ja värien pyöristystä: näkymän rajaus,
 * merkkien koko, HUD ja säännöt lasketaan kummassakin samasta sisäisestä
 * (retron) tarkkuudesta.
 */
export type Look = 'retro' | 'sharp';

export const LOOKS: readonly Look[] = ['retro', 'sharp'];

export const DEFAULT_LOOK: Look = 'retro';

const KEY = 'lunki.look';

export function loadLook(): Look {
  try {
    const saved = localStorage.getItem(KEY);
    return LOOKS.includes(saved as Look) ? (saved as Look) : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

export function saveLook(look: Look): void {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // Tallennus estetty: valinta on voimassa tämän käynnin.
  }
}

let active: Look = DEFAULT_LOOK;
const listeners = new Set<(look: Look) => void>();

/** Käytössä oleva ilme: kuvat ja tekstuurit, jotka piirretään ilmeen mukaan, kysyvät tästä. */
export const activeLook = (): Look => active;

/** Vaihtaa käytössä olevan ilmeen ja kertoo siitä kuuntelijoille (`onLookChange`). */
export function setActiveLook(look: Look): void {
  if (look === active) return;
  active = look;
  for (const l of listeners) l(look);
}

/** Kutsutaan, kun ilme vaihtuu: jo piirretyt kuvat piirretään uudelleen. */
export function onLookChange(listener: (look: Look) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ilmeestä riippuvat varjostimien arvot. Materiaali, jonka kuva riippuu
 * ilmeestä, liittää nämä samat oliot omiin uniformeihinsa; `RetroRenderer`
 * päivittää arvot ilmeen ja ikkunan koon vaihtuessa.
 */
export const LOOK_UNIFORMS = {
  /** 1 = Terävä (ei palettia), 0 = Retro. */
  uLookSharp: { value: 0 },
  /** Montako piirrettyä kuvapistettä on yhden sisäisen pikselin sivulla. */
  uLookDetail: { value: 1 },
};

/** Alle tämän ruutunopeuden Terävä on laitteelle liian raskas. */
export const SHARP_MIN_FPS = 30;
/** Kisan alun varjostimien kääntöä ja latausta ei lasketa (s). */
const GUARD_WARMUP = 3;
/** Mittausjakso (s): yksittäinen nykäys ei vielä vaihda ilmettä. */
const GUARD_WINDOW = 4;
/** Tätä pidempi yksittäinen ruutu on tauko (välilehti taustalla), ei hidas piirto. */
const GUARD_PAUSE = 0.5;
/** Näin monta pitkää ruutua peräkkäin on hidasta piirtoa, ei taukoa. */
const GUARD_STALLS = 3;

/**
 * Vahtii Terävän ruutunopeutta kisan aikana: `frame` palauttaa true, kun
 * mittausjakson keskiarvo jää alle rajan ja ilme pitää palauttaa Retroon.
 */
export class LookGuard {
  private warm = 0;
  private time = 0;
  private frames = 0;
  private stalls = 0;

  reset(): void {
    this.stalls = 0;
    this.warm = 0;
    this.time = 0;
    this.frames = 0;
  }

  frame(frameTime: number): boolean {
    if (frameTime <= 0) return false;
    if (frameTime > GUARD_PAUSE) {
      // Tauon jälkeen mittaus alkaa alusta. Jos joka ruutu on näin pitkä,
      // laite piirtää alle kaksi kuvaa sekunnissa eikä kyse ole tauosta.
      this.time = 0;
      this.frames = 0;
      this.warm = Math.min(GUARD_WARMUP, this.warm + GUARD_PAUSE);
      if (++this.stalls < GUARD_STALLS || this.warm < GUARD_WARMUP) return false;
      this.stalls = 0;
      return true;
    }
    this.stalls = 0;
    if (this.warm < GUARD_WARMUP) {
      this.warm += frameTime;
      return false;
    }
    this.time += frameTime;
    this.frames++;
    if (this.time < GUARD_WINDOW) return false;
    const slow = this.frames / this.time < SHARP_MIN_FPS;
    this.time = 0;
    this.frames = 0;
    return slow;
  }
}
