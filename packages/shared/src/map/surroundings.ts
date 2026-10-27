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
 * Monen renkaan pistetesti vaakakaistoittain: pisteen korkeudelta testataan
 * vain sen kaistan särmät. Tulos on sama kuin pointInRing jokaiselle renkaalle
 * (sama laskukaava), mutta tuhansissa kyselyissä moninkertaisesti nopeampi (#327).
 */
export class RingIndex {
  /** Särmät peräkkäin: ax, ay, bx, by. */
  private readonly edges: number[] = [];
  private readonly edgeRing: number[] = [];
  private readonly bands = new Map<number, number[]>();
  private readonly parity: Uint8Array;
  private readonly hits: number[] = [];

  constructor(
    rings: readonly (readonly Vec2[])[],
    private readonly bandHeight = 8,
  ) {
    this.parity = new Uint8Array(rings.length);
    rings.forEach((ring, r) => {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        if (a.y === b.y) continue;
        const e = this.edgeRing.length;
        this.edges.push(a.x, a.y, b.x, b.y);
        this.edgeRing.push(r);
        const last = this.band(Math.max(a.y, b.y));
        for (let k = this.band(Math.min(a.y, b.y)); k <= last; k++) {
          let list = this.bands.get(k);
          if (!list) this.bands.set(k, (list = []));
          list.push(e);
        }
      }
    });
  }

  private band(y: number): number {
    return Math.floor(y / this.bandHeight);
  }

  /**
   * Renkaat, joiden sisällä piste on, nousevassa järjestyksessä. Palautettu
   * taulukko käytetään uudelleen seuraavassa kyselyssä.
   */
  containing(p: Vec2): readonly number[] {
    const hits = this.hits;
    hits.length = 0;
    const list = this.bands.get(this.band(p.y));
    if (!list) return hits;
    const ed = this.edges;
    for (const e of list) {
      const ax = ed[e * 4]!;
      const ay = ed[e * 4 + 1]!;
      const bx = ed[e * 4 + 2]!;
      const by = ed[e * 4 + 3]!;
      if (ay > p.y !== by > p.y && p.x < ((bx - ax) * (p.y - ay)) / (by - ay) + ax) {
        const r = this.edgeRing[e]!;
        if (this.parity[r] === 0) hits.push(r);
        this.parity[r] = this.parity[r]! ^ 1;
      }
    }
    let n = 0;
    for (const r of hits) {
      if (this.parity[r] === 1) hits[n++] = r;
      this.parity[r] = 0;
    }
    hits.length = n;
    // Kaistan särmät ovat lisäysjärjestyksessä, joten renkaat ovat jo nousevassa järjestyksessä.
    return hits;
  }
}

/**
 * Järven vesialue (rantaviivan sisällä, ei saarella) samoin tuloksin kuin
 * pointInRing-testit erikseen, mutta nopeasti.
 */
export function ringWaterTest(
  shore: readonly Vec2[],
  islands: readonly (readonly Vec2[])[],
): (p: Vec2) => boolean {
  const index = new RingIndex([shore, ...islands]);
  return (p) => {
    const hits = index.containing(p);
    return hits.length === 1 && hits[0] === 0;
  };
}

/**
 * Maankäyttö pisteessä: pienin alue, jonka sisällä piste on (alueet ovat
 * isoimmasta pienimpään, joten viimeinen osuma voittaa). Rakennukset ohitetaan.
 */
export class LandCover {
  private readonly index: RingIndex;
  /** Renkaan alue (indeksi surroundings.areas-taulukkoon) ja onko rengas reikä. */
  private readonly ringArea: number[] = [];
  private readonly ringHole: boolean[] = [];

  constructor(private readonly surroundings: LakeSurroundings) {
    const rings: (readonly Vec2[])[] = [];
    surroundings.areas.forEach((a, i) => {
      if (a.kind === 'building') return;
      a.rings.forEach((ring, k) => {
        rings.push(ring);
        this.ringArea.push(i);
        this.ringHole.push(k > 0);
      });
    });
    this.index = new RingIndex(rings);
  }

  kindAt(p: Vec2): AreaKind | null {
    const hits = this.index.containing(p);
    // Renkaat ovat alueittain peräkkäin: käydään lopusta alkuun, ja ensimmäinen
    // alue, jonka ulkoreunan sisällä piste on ilman reikää, voittaa.
    let holed = -1;
    for (let k = hits.length - 1; k >= 0; k--) {
      const r = hits[k]!;
      const area = this.ringArea[r]!;
      if (this.ringHole[r]) holed = area;
      else if (area !== holed) return this.surroundings.areas[area]!.kind;
    }
    return null;
  }
}
