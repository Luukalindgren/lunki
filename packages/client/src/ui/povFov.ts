/**
 * Kalastajan silmin -näkymän näkökenttä (#330): pelaajan valitsema pysty-FOV
 * asteina portaittain taukovalikon ja asetusten liukusäätimellä.
 */
export const POV_FOVS: readonly number[] = [60, 64, 68, 72, 76, 80, 85, 90];

export const DEFAULT_POV_FOV = 72;

/** Kapealla ruudulla vaakasuunnan näkökenttä vähintään (astetta)… */
export const MIN_HORIZONTAL_FOV = 55;
/** …ja leveällä enintään, ettei reunojen venymä karkaa. */
export const MAX_HORIZONTAL_FOV = 125;
/** Pysty-FOV:n yläraja kapeimmillakin ruuduilla. */
export const MAX_VERTICAL_FOV = 100;

const KEY = 'lunki.povFov';

export function loadPovFov(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return POV_FOVS.includes(v) ? v : DEFAULT_POV_FOV;
  } catch {
    return DEFAULT_POV_FOV;
  }
}

export function savePovFov(fov: number): void {
  try {
    localStorage.setItem(KEY, String(fov));
  } catch {
    // ei haittaa
  }
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Vaakasuunnan näkökenttä (astetta) pysty-FOV:sta ja kuvasuhteesta. */
export function horizontalFov(vertical: number, aspect: number): number {
  return deg(2 * Math.atan(Math.tan(rad(vertical) / 2) * aspect));
}

/** Pysty-FOV, jolla vaakasuunnan näkökenttä on annettu. */
function verticalFor(horizontal: number, aspect: number): number {
  return deg(2 * Math.atan(Math.tan(rad(horizontal) / 2) / aspect));
}

/**
 * Kameran pysty-FOV valinnasta ja kuvasuhteesta: pystypuhelimella kuvaa
 * levennetään, kunnes vaakaan mahtuu MIN_HORIZONTAL_FOV, ja hyvin leveällä
 * ruudulla kavennetaan MAX_HORIZONTAL_FOV:iin. 16:9-ruudulla valinta pätee sellaisenaan.
 */
export function effectivePovFov(setting: number, aspect: number): number {
  if (!(aspect > 0)) return setting;
  const h = horizontalFov(setting, aspect);
  if (h < MIN_HORIZONTAL_FOV)
    return Math.min(MAX_VERTICAL_FOV, verticalFor(MIN_HORIZONTAL_FOV, aspect));
  if (h > MAX_HORIZONTAL_FOV) return verticalFor(MAX_HORIZONTAL_FOV, aspect);
  return setting;
}
