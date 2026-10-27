/**
 * HUDin koko portaittain taukovalikon liukusäätimellä. Kerroin kertoo
 * HUD-pikselin (--u) koon; reunavälit ja pinojen välit eivät muutu, joten
 * paneelit pysyvät samoissa kulmissa ja samassa järjestyksessä.
 */
export const HUD_SCALES: readonly number[] = [0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];

export const DEFAULT_HUD_SCALE = 1;

/**
 * Valitsimen 100 % on työpöydällä tämän verran HUD-pikselin peruskoosta (--m):
 * aiemmin pienin 70 % osoittautui sopivaksi oletukseksi, joten siitä tuli 100 %.
 * Puhelimella HUD on jo valmiiksi ruudun rajaama, joten siellä koko pysyy ennallaan.
 */
export const HUD_BASE = 0.7;

/** Valitsimen 100 %:n kerroin laitteelle. */
export const hudBase = (touch: boolean): number => (touch ? 1 : HUD_BASE);

const KEY = 'lunki.hudSize';
/** Ennen HUD_BASEa tallennettu kerroin (suoraan --m:n kerroin). */
const OLD_KEY = 'lunki.hudScale';

export function loadHudScale(touch = false): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (HUD_SCALES.includes(v)) return v;
    // Vanha asetus samaan kokoon uudella asteikolla (vanha 70 % = uusi 100 %).
    const old = Number(localStorage.getItem(OLD_KEY));
    return old > 0 ? nearestScale(old / hudBase(touch)) : DEFAULT_HUD_SCALE;
  } catch {
    return DEFAULT_HUD_SCALE;
  }
}

export function saveHudScale(scale: number): void {
  try {
    localStorage.setItem(KEY, String(scale));
  } catch {
    // ei haittaa
  }
}

function nearestScale(v: number): number {
  return HUD_SCALES.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best));
}
