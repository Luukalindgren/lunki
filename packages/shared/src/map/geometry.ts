import type { Vec2 } from '../vec2';

/** Monikulmion etumerkillinen ala: positiivinen, kun kärjet ovat vastapäivään. */
export function signedArea(ring: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j]!.x - ring[i]!.x) * (ring[j]!.y + ring[i]!.y);
  }
  return a / 2;
}

/** Lähin piste janalla ab pisteelle p. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Douglas–Peucker-yksinkertaistus suljetulle renkaalle (ilman toistettua päätepistettä). */
export function simplifyRing(ring: readonly Vec2[], tolerance: number): Vec2[] {
  if (ring.length <= 4) return [...ring];
  // Jaetaan kahdeksi poluksi kauimmaisen pisteen kohdalta.
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i]!.x - ring[0]!.x, ring[i]!.y - ring[0]!.y);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const first = simplifyPath(ring.slice(0, far + 1), tolerance);
  const second = simplifyPath([...ring.slice(far), ring[0]!], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function simplifyPath(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return [...points];
  const a = points[0]!;
  const b = points[points.length - 1]!;
  let index = 0;
  let maxDist = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const c = closestPointOnSegment(points[i]!, a, b);
    const d = Math.hypot(points[i]!.x - c.x, points[i]!.y - c.y);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= tolerance) return [a, b];
  const left = simplifyPath(points.slice(0, index + 1), tolerance);
  const right = simplifyPath(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

/**
 * Etsii vesialueelta pisteen, joka on kauimpana rannasta (karkea ruudukkohaku).
 * Käytetään esim. aloituspaikan valintaan.
 */
export function findOpenWaterPoint(
  water: {
    isWater(p: Vec2): boolean;
    closestShorePoint(p: Vec2): { distance: number } | null;
  },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  step = 20,
): Vec2 {
  let best: Vec2 = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  let bestDist = -1;
  for (let y = bounds.minY + step / 2; y < bounds.maxY; y += step) {
    for (let x = bounds.minX + step / 2; x < bounds.maxX; x += step) {
      const p = { x, y };
      if (!water.isWater(p)) continue;
      const d = water.closestShorePoint(p)?.distance ?? 0;
      if (d > bestDist) {
        bestDist = d;
        best = p;
      }
    }
  }
  return best;
}

/**
 * Lähtöpaikka: satunnainen vesipiste noin `shoreDistance` metrin päässä
 * rannasta, kuin kalastaja olisi juuri potkinut rannasta vesille.
 */
export function findLaunchPoint(
  water: {
    isWater(p: Vec2): boolean;
    closestShorePoint(p: Vec2): { distance: number } | null;
  },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  random: () => number,
  shoreDistance = 20,
): Vec2 {
  for (let i = 0; i < 2000; i++) {
    const p = {
      x: bounds.minX + random() * (bounds.maxX - bounds.minX),
      y: bounds.minY + random() * (bounds.maxY - bounds.minY),
    };
    if (!water.isWater(p)) continue;
    const d = water.closestShorePoint(p)?.distance ?? 0;
    if (Math.abs(d - shoreDistance) < shoreDistance * 0.25) return p;
  }
  return findOpenWaterPoint(water, bounds);
}
