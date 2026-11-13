/**
 * Pelin ilme (#674): Retro piirtää pieneen kuvaan pelin paletilla, Terävä
 * saman kohtauksen näytön täydellä tarkkuudella ilman palettia ja reunat
 * pehmennettyinä. Laitteen asetus kuten HUDin koko, ei pelaajan profiilissa.
 *
 * Moderni (#650) on tietokoneille tehty oma ilmeensä: sileä maalattu maailma,
 * varjot ja eräkarttateema. Sen koodi ja tyylit ladataan vasta valittaessa
 * (`engine/modernHost.ts`, `src/modern/`).
 *
 * Ilme muuttaa vain piirtoa: näkymän rajaus, merkkien koko, HUDin mitta ja
 * säännöt lasketaan kaikissa samasta sisäisestä (retron) tarkkuudesta.
 */
export type Look = 'retro' | 'sharp' | 'modern';

export const LOOKS: readonly Look[] = ['retro', 'sharp', 'modern'];

/** Näytön tarkkuudella ilman palettia piirtävät ilmeet (Terävä ja Moderni). */
export const smoothLook = (look: Look): boolean => look !== 'retro';

/** Modernin laatutaso (#650): tarkkuus, reunanpehmennys ja varjot yhdellä valinnalla. */
export type LookQuality = 'low' | 'medium' | 'high';

export const QUALITIES: readonly LookQuality[] = ['low', 'medium', 'high'];

/** Moderni on tehty tietokoneille, joten oletus on paras laatu. */
export const DEFAULT_QUALITY: LookQuality = 'high';

export interface QualityLevel {
  /**
   * Ylinäytteistys: kuva piirretään enintään näin moninkertaisella
   * tarkkuudella (sivua kohden) ja pienennetään näytölle, jolloin reunat
   * pehmenevät. 1 = näytön tarkkuus.
   */
  supersample: number;
  /** Varjokartan sivu (kuvapistettä); 0 = ei varjoja. */
  shadowMap: number;
  /** Pehmeät varjon reunat. */
  softShadows: boolean;
}

export const QUALITY: Record<LookQuality, QualityLevel> = {
  low: { supersample: 1, shadowMap: 1024, softShadows: false },
  medium: { supersample: 1, shadowMap: 2048, softShadows: true },
  high: { supersample: 2, shadowMap: 4096, softShadows: true },
};

/** Ylinäytteistetyn kuvan suurin koko (kuvapistettä): noin 4K-näytön verran. */
export const SUPERSAMPLE_MAX_PIXELS = 9_000_000;

/**
 * Montako kuvapistettä yhden sisäisen pikselin sivulla piirretään. Retro 1,
 * Terävä näytön tarkkuus (`scale`), Moderni laadun mukaan sitä enemmän.
 */
export function lookDetail(
  look: Look,
  quality: LookQuality,
  res: { width: number; height: number; scale: number },
): number {
  if (look === 'retro') return 1;
  if (look === 'sharp') return res.scale;
  const most = Math.floor(Math.sqrt(SUPERSAMPLE_MAX_PIXELS / (res.width * res.height)));
  const wanted = Math.round(res.scale * QUALITY[quality].supersample);
  return Math.max(res.scale, Math.min(wanted, most));
}

/** Yhtä kevyempi laatu, tai null kun kevyempää ei ole. */
export function lowerQuality(quality: LookQuality): LookQuality | null {
  return QUALITIES[QUALITIES.indexOf(quality) - 1] ?? null;
}

const QUALITY_KEY = 'lunki.look.quality';

export function loadQuality(): LookQuality {
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    return QUALITIES.includes(saved as LookQuality) ? (saved as LookQuality) : DEFAULT_QUALITY;
  } catch {
    return DEFAULT_QUALITY;
  }
}

export function saveQuality(quality: LookQuality): void {
  try {
    localStorage.setItem(QUALITY_KEY, quality);
  } catch {
    // Tallennus estetty: valinta on voimassa tämän käynnin.
  }
}

/**
 * Oletus on Terävä kaikilla laitteilla, joilla ilmettä ei ole valittu.
 * Liian hitaalla laitteella `LookGuard` palauttaa Retron ja tallentaa sen.
 */
export const DEFAULT_LOOK: Look = 'sharp';

/**
 * Ilme ilman tallennettua valintaa. Automaation ohjaama selain (selaintestit)
 * saa Retron: ohjelmistorenderöinnillä Terävä on liian hidas, ja testi, joka
 * koskee Terävää, valitsee sen itse.
 */
export function defaultLook(automated = globalThis.navigator?.webdriver === true): Look {
  return automated ? 'retro' : DEFAULT_LOOK;
}

const KEY = 'lunki.look';

export function loadLook(): Look {
  try {
    const saved = localStorage.getItem(KEY);
    return LOOKS.includes(saved as Look) ? (saved as Look) : defaultLook();
  } catch {
    return defaultLook();
  }
}

export function saveLook(look: Look): void {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // Tallennus estetty: valinta on voimassa tämän käynnin.
  }
}

let active: Look = 'retro';
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
  /** 1 = ei palettia (Terävä ja Moderni), 0 = Retro. */
  uLookSharp: { value: 0 },
  /** 1 = Moderni: sileä vesi ja omat sävyt. */
  uLookModern: { value: 0 },
  /** Montako piirrettyä kuvapistettä on yhden sisäisen pikselin sivulla. */
  uLookDetail: { value: 1 },
};

/** Alle tämän ruutunopeuden Terävä tai Moderni on laitteelle liian raskas. */
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
 * Vahtii raskaan ilmeen ruutunopeutta kisan aikana: `frame` palauttaa true,
 * kun mittausjakson keskiarvo jää alle rajan. Terävä palaa silloin Retroon,
 * ja Moderni pudottaa ensin laatua.
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
