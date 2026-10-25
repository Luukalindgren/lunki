import type { Vec2 } from '../vec2';
import { closestPointOnSegment } from './geometry';
import { pointInRing } from './surroundings';

/**
 * Kaislikko tai lumpeikko rantavedessä. Rengas on pelin metrikoordinaateissa
 * (ks. lunkinjarvi-reeds.json, jota saa muokata käsin).
 */
export interface ReedBed {
  name?: string;
  ring: Vec2[];
}

export const REEDS = {
  /** Kaislikossa vesi on matalaa: pohja nousee tähän syvyyteen (m). */
  depth: 1.2,
  /** Kuinka leveällä reunalla (m) syvyys vaihtuu ympäröivästä kaislikon syvyyteen. */
  edge: 8,
  /** Kaislikko jarruttaa rengasta: vedenvastuksen kerroin. */
  drag: 3.5,
} as const;

interface Indexed {
  bed: ReedBed;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Kaislikot nopeaa pistekyselyä varten (rajauslaatikot ensin). */
export class ReedIndex {
  private readonly beds: Indexed[];

  constructor(beds: readonly ReedBed[] = []) {
    this.beds = beds.map((bed) => {
      const xs = bed.ring.map((p) => p.x);
      const ys = bed.ring.map((p) => p.y);
      return {
        bed,
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      };
    });
  }

  /** Kaislikko, jonka sisällä piste on, tai null. */
  at(p: Vec2): ReedBed | null {
    for (const b of this.beds) {
      if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) continue;
      if (pointInRing(p, b.bed.ring)) return b.bed;
    }
    return null;
  }

  /**
   * Kuinka syvällä kaislikon sisällä piste on (m reunasta), 0 ulkopuolella.
   * Käytetään pohjan pehmeään madaltamiseen.
   */
  insideDistance(p: Vec2): number {
    const bed = this.at(p);
    return bed ? distanceToRing(p, bed.ring) : 0;
  }
}

/** Pisteen etäisyys renkaan reunaan (m). */
export function distanceToRing(p: Vec2, ring: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const c = closestPointOnSegment(p, ring[j]!, ring[i]!);
    best = Math.min(best, Math.hypot(c.x - p.x, c.y - p.y));
  }
  return best;
}
