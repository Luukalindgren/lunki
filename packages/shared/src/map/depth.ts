import type { Vec2 } from '../vec2';

/** Prototyypin pohjamalli: syvyys kasvaa rannasta poispäin. Korvataan vaiheessa 3 (#20). */
export const PROTO_DEPTH = {
  /** Syvyys rantaviivalla (m). */
  shoreDepth: 0.4,
  /** Pohjan kaltevuus rannasta poispäin (m syvyyttä / m matkaa). */
  slope: 0.05,
  /** Suurin syvyys (m). */
  maxDepth: 6.5,
} as const;

/** Pohjan syvyys pisteessä (m, positiivinen alaspäin). Maalla 0. */
export function protoDepthAt(
  water: {
    isWater(p: Vec2): boolean;
    closestShorePoint(p: Vec2): { distance: number } | null;
  },
  p: Vec2,
): number {
  if (!water.isWater(p)) return 0;
  const d = water.closestShorePoint(p)?.distance ?? 0;
  // Loiva vaihtelu, ettei pohja ole täysin tasainen.
  const ripple = 0.4 * Math.sin(p.x * 0.031) * Math.sin(p.y * 0.027);
  const depth = PROTO_DEPTH.shoreDepth + d * PROTO_DEPTH.slope + ripple * Math.min(1, d / 40);
  return Math.max(0.2, Math.min(PROTO_DEPTH.maxDepth, depth));
}
