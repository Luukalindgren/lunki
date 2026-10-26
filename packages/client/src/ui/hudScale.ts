/**
 * HUDin koko portaittain taukovalikon liukusäätimellä. Kerroin kertoo
 * HUD-pikselin (--u) koon; reunavälit ja pinojen välit eivät muutu, joten
 * paneelit pysyvät samoissa kulmissa ja samassa järjestyksessä.
 */
export const HUD_SCALES: readonly number[] = [0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5];

export const DEFAULT_HUD_SCALE = 1;

const KEY = 'lunki.hudScale';

export function loadHudScale(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return HUD_SCALES.includes(v) ? v : DEFAULT_HUD_SCALE;
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
