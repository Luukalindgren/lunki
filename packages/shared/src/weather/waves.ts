import type { Vec2 } from '../vec2';

const G = 9.81;

export const WAVES = {
  /** Pisin huomioitava pyyhkäisymatka (m). */
  maxFetch: 5000,
} as const;

/**
 * Pyyhkäisymatka: kuinka pitkän matkan tuuli on puhaltanut veden yllä ennen
 * pistettä p (m). Säde lähetetään vastatuuleen ja etsitään lähin ranta tai saari.
 */
export function fetchDistance(
  rings: readonly (readonly Vec2[])[],
  p: Vec2,
  windDir: number,
): number {
  const dx = -Math.cos(windDir);
  const dy = -Math.sin(windDir);
  let best: number = WAVES.maxFetch;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]!;
      const b = ring[i]!;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const ax = a.x - p.x;
      const ay = a.y - p.y;
      // p + t·d = a + s·e
      const t = (ax * ey - ay * ex) / den;
      const s = (ax * dy - ay * dx) / den;
      if (t > 0 && s >= 0 && s <= 1 && t < best) best = t;
    }
  }
  return best;
}

/**
 * Merkitsevä aallonkorkeus (m) tuulesta ja pyyhkäisymatkasta
 * (JONSWAP, rajoitettu pyyhkäisymatka): Hs = 0,0016 · U · √(F / g).
 */
export function waveHeight(windSpeed: number, fetch: number): number {
  return 0.0016 * windSpeed * Math.sqrt(Math.max(0, fetch) / G);
}

/** Aallon huippujakso (s): T = 0,286 · (gF/U²)^⅓ · U/g, vähintään 0,6 s. */
export function wavePeriod(windSpeed: number, fetch: number): number {
  if (windSpeed < 0.5) return 0.6;
  const u = windSpeed;
  return Math.max(0.6, 0.286 * Math.cbrt((G * Math.max(1, fetch)) / (u * u)) * (u / G));
}

/** Syvän veden aallonpituus jaksosta (m). */
export const waveLength = (period: number) => (G * period * period) / (2 * Math.PI);
