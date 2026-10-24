/** Tavoitekorkeus sisäiselle renderöinnille (pikseliä). */
export const TARGET_HEIGHT = 270;
export const MIN_HEIGHT = 180;

export interface RetroResolution {
  /** Sisäisen render targetin koko. */
  width: number;
  height: number;
  /** Kokonaislukukerroin, jolla yksi sisäinen pikseli piirretään näytölle. */
  scale: number;
}

/**
 * Valitsee kokonaislukuskaalauksen, jolla sisäinen korkeus on lähellä
 * tavoitetta. Kokonaisluku pitää pikselit terävinä ja tasakokoisina.
 */
export function computeResolution(
  screenWidth: number,
  screenHeight: number,
  targetHeight = TARGET_HEIGHT,
): RetroResolution {
  const w = Math.max(1, Math.floor(screenWidth));
  const h = Math.max(1, Math.floor(screenHeight));
  let scale = Math.max(1, Math.round(h / targetHeight));
  // Älä mene liian pieneen sisäiseen resoluutioon.
  while (scale > 1 && h / scale < MIN_HEIGHT) scale--;
  return { width: Math.ceil(w / scale), height: Math.ceil(h / scale), scale };
}
