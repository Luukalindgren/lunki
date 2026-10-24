import type { Vec2 } from '../vec2';
import type { AreaKind, LakeSurroundings } from './types';

/** Maaston korkeus (m järven pinnasta) bilineaarisesti; ilman aineistoa 0. */
export function terrainHeightAt(terrain: LakeSurroundings['terrain'], p: Vec2): number {
  if (!terrain) return 0;
  const fx = (p.x - terrain.minX) / terrain.cell;
  const fy = (p.y - terrain.minY) / terrain.cell;
  const i = Math.max(0, Math.min(terrain.cols - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(terrain.rows - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - i));
  const ty = Math.max(0, Math.min(1, fy - j));
  const h = (a: number, b: number) => terrain.heights[b * terrain.cols + a]!;
  return (
    (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - ty) +
    (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * ty
  );
}

export function pointInRing(p: Vec2, ring: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/**
 * Maankäyttö pisteessä: pienin alue, jonka sisällä piste on (alueet ovat
 * isoimmasta pienimpään, joten viimeinen osuma voittaa). Rakennukset ohitetaan.
 */
export class LandCover {
  private readonly boxes: { minX: number; minY: number; maxX: number; maxY: number }[];

  constructor(private readonly surroundings: LakeSurroundings) {
    this.boxes = surroundings.areas.map((a) => {
      const xs = a.rings[0]!.map((p) => p.x);
      const ys = a.rings[0]!.map((p) => p.y);
      return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      };
    });
  }

  kindAt(p: Vec2): AreaKind | null {
    let kind: AreaKind | null = null;
    this.surroundings.areas.forEach((a, i) => {
      const b = this.boxes[i]!;
      if (a.kind === 'building' || p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY)
        return;
      if (!pointInRing(p, a.rings[0]!)) return;
      if (a.rings.slice(1).some((hole) => pointInRing(p, hole))) return;
      kind = a.kind;
    });
    return kind;
  }
}
