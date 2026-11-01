import type { Vec2 } from '../vec2';
import { closestPointOnSegment } from './geometry';
import { pierDeckRing, pierRing } from './piers';
import { ReedIndex, type ReedBed } from './reeds';
import type { LakeMap } from './types';

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface ShoreHit {
  /** Korjattu sijainti vedessä. */
  position: Vec2;
  /** Rannan normaali kohti vettä (yksikkövektori). */
  normal: Vec2;
}

/**
 * Järven vesialue törmäyksiä varten: onko piste vedessä, lähin rantapiste ja
 * ympyrän (kelluntarengas, kala) työntäminen pois rannasta.
 *
 * Kiihdytys: janat jaetaan ruudukkoon lähimmän rannan hakua varten ja
 * vaakakaistoihin pisteen sisällä olon testiä varten.
 */
export class WaterBody {
  private readonly segments: Segment[] = [];
  private readonly cells = new Map<number, number[]>();
  private readonly bands = new Map<number, number[]>();
  private readonly reeds: ReedIndex;
  /** Laiturien kannet maalta kärkeen: niillä kävellään kuin maalla (#457). */
  private readonly deckRings: Vec2[][];

  constructor(
    readonly map: LakeMap,
    private readonly cellSize = 16,
    private readonly bandHeight = 8,
  ) {
    this.reeds = new ReedIndex(map.reeds);
    this.deckRings = (map.piers ?? []).map(pierDeckRing);
    // Laiturit ovat vesialueen sisällä kuin pienet saaret.
    for (const ring of [map.shore, ...map.islands, ...(map.piers ?? []).map(pierRing)]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        this.segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
    }
    this.segments.forEach((s, i) => {
      const minX = Math.min(s.ax, s.bx);
      const maxX = Math.max(s.ax, s.bx);
      const minY = Math.min(s.ay, s.by);
      const maxY = Math.max(s.ay, s.by);
      for (let cy = this.cell(minY); cy <= this.cell(maxY); cy++) {
        for (let cx = this.cell(minX); cx <= this.cell(maxX); cx++) {
          push(this.cells, cellKey(cx, cy), i);
        }
      }
      for (let b = this.band(minY); b <= this.band(maxY); b++) push(this.bands, b, i);
    });
  }

  /** Onko piste vedessä (järven sisällä eikä saarella). */
  isWater(p: Vec2): boolean {
    const list = this.bands.get(this.band(p.y));
    if (!list) return false;
    let inside = false;
    for (const i of list) {
      const s = this.segments[i]!;
      if (s.ay > p.y !== s.by > p.y) {
        const x = s.ax + ((p.y - s.ay) / (s.by - s.ay)) * (s.bx - s.ax);
        if (x > p.x) inside = !inside;
      }
    }
    return inside;
  }

  /** Onko piste maata, jolla voi seistä: rantaa, saarta tai laiturin kantta (#457). */
  isLand(p: Vec2): boolean {
    return !this.isWater(p) || this.onPier(p);
  }

  /** Onko piste laiturin kannella (maalla seisova on silloin kannen korkeudella). */
  onPier(p: Vec2): boolean {
    return this.deckRings.some((r) => insideRing(r, p));
  }

  /** Kaislikko pisteessä (vedessä), tai null. */
  reedsAt(p: Vec2): ReedBed | null {
    return this.reeds.at(p);
  }

  /** Lähin rantaviivan piste. Hakee laajenevista ruuduista. */
  closestShorePoint(p: Vec2, maxDistance = Infinity): { point: Vec2; distance: number } | null {
    const cx = this.cell(p.x);
    const cy = this.cell(p.y);
    let best: Vec2 | null = null;
    let bestDist = Infinity;
    const maxRing = Math.min(
      Number.isFinite(maxDistance) ? Math.ceil(maxDistance / this.cellSize) + 1 : Infinity,
      this.maxRings(),
    );
    for (let r = 0; r <= maxRing; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          const list = this.cells.get(cellKey(x, y));
          if (!list) continue;
          for (const i of list) {
            const s = this.segments[i]!;
            const c = closestPointOnSegment(p, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by });
            const d = Math.hypot(c.x - p.x, c.y - p.y);
            if (d < bestDist) {
              bestDist = d;
              best = c;
            }
          }
        }
      }
      // Kaikki kauempana olevat ruudut ovat vähintään r * cellSize päässä.
      if (best && bestDist <= r * this.cellSize) break;
    }
    if (!best || bestDist > maxDistance) return null;
    return { point: best, distance: bestDist };
  }

  /**
   * Siirtää r-säteisen ympyrän pisteestä `from` pisteeseen `to` ja pitää sen
   * vedessä. Jos korjaus ei onnistu (esim. kapea poukama), ympyrä jää paikalleen.
   */
  moveCircle(from: Vec2, to: Vec2, radius: number): ShoreHit | null {
    let p = to;
    let normal: Vec2 | null = null;
    // Terävissä kulmissa yksi korjaus voi työntää toisen rantajanan päälle.
    for (let i = 0; i < 4; i++) {
      const hit = this.resolveCircle(p, radius);
      if (!hit) return normal ? { position: p, normal } : null;
      p = hit.position;
      normal = hit.normal;
    }
    if (
      this.isWater(p) &&
      (this.closestShorePoint(p, radius)?.distance ?? radius) >= radius * 0.9
    ) {
      return { position: p, normal: normal! };
    }
    const back = this.resolveCircle(from, radius);
    return { position: back?.position ?? from, normal: normal ?? back?.normal ?? { x: 0, y: 0 } };
  }

  /**
   * Yksi korjausaskel: työntää r-säteisen ympyrän pois lähimmästä rannasta.
   * Palauttaa korjauksen, jos ympyrä osui rantaan, muuten null.
   */
  resolveCircle(p: Vec2, radius: number): ShoreHit | null {
    const inWater = this.isWater(p);
    const closest = this.closestShorePoint(p, inWater ? radius : Infinity);
    if (!closest) return null;
    const { point, distance } = closest;
    if (inWater && distance >= radius) return null;
    let nx: number;
    let ny: number;
    if (distance > 1e-9) {
      nx = (p.x - point.x) / distance;
      ny = (p.y - point.y) / distance;
      if (!inWater) {
        nx = -nx;
        ny = -ny;
      }
    } else {
      // Täsmälleen rantaviivalla: käytetään janan normaalia.
      const n = this.normalNear(point);
      nx = n.x;
      ny = n.y;
    }
    return {
      position: { x: point.x + nx * radius, y: point.y + ny * radius },
      normal: { x: nx, y: ny },
    };
  }

  private normalNear(p: Vec2): Vec2 {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      if (this.isWater({ x: p.x + dx * 0.01, y: p.y + dy * 0.01 })) return { x: dx, y: dy };
    }
    return { x: 1, y: 0 };
  }

  private maxRings(): number {
    const b = this.map.bounds;
    return Math.ceil(Math.max(b.maxX - b.minX, b.maxY - b.minY) / this.cellSize) + 2;
  }

  private cell(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  private band(y: number): number {
    return Math.floor(y / this.bandHeight);
  }
}

function insideRing(ring: readonly Vec2[], p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x))
      inside = !inside;
  }
  return inside;
}

const cellKey = (x: number, y: number) => (x + 32768) * 65536 + (y + 32768);

function push(map: Map<number, number[]>, key: number, value: number) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
