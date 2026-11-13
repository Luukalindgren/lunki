import { ringWaterTest, type LakeMap, type Vec2 } from '@lunki/shared';

/** Etäisyys (m), jota kauempaa rantaa ei oletuksena haeta. */
export const SHORE_REACH = 32;

/**
 * Etäisyys rantaviivaan merkillä: maalla positiivinen, vedessä negatiivinen.
 * Modernin ilmeen ranta (penkka, kivet, heinät) muotoillaan tämän mukaan.
 * Kauempana kuin `reach` etäisyys on ±`reach`.
 */
export class ShoreField {
  private readonly cells = new Map<number, number[]>();
  /** Särmät peräkkäin: ax, ay, bx − ax, by − ay, pituuden neliö. */
  private readonly segs: number[] = [];
  readonly isWater: (p: Vec2) => boolean;

  /** Hakuruudun koko (m). */
  private readonly cell: number;

  constructor(
    map: LakeMap,
    private readonly reach = SHORE_REACH,
  ) {
    this.isWater = ringWaterTest(map.shore, map.islands);
    const r = reach;
    const CELL = (this.cell = reach / 2);
    for (const ring of [map.shore, ...map.islands]) {
      for (let n = 0; n < ring.length; n++) {
        const a = ring[n]!;
        const b = ring[(n + 1) % ring.length]!;
        const e = this.segs.length;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        this.segs.push(a.x, a.y, dx, dy, dx * dx + dy * dy || 1);
        const x1 = Math.floor((Math.max(a.x, b.x) + r) / CELL);
        const y1 = Math.floor((Math.max(a.y, b.y) + r) / CELL);
        for (let y = Math.floor((Math.min(a.y, b.y) - r) / CELL); y <= y1; y++)
          for (let x = Math.floor((Math.min(a.x, b.x) - r) / CELL); x <= x1; x++) {
            const key = cellKey(x, y);
            const list = this.cells.get(key);
            if (list) list.push(e);
            else this.cells.set(key, [e]);
          }
      }
    }
  }

  /** Onko piste niin lähellä rantaa, että etäisyys kannattaa laskea. */
  near(x: number, y: number): boolean {
    return this.cells.has(cellKey(Math.floor(x / this.cell), Math.floor(y / this.cell)));
  }

  /** Lähimmän särmän paikka taulukossa ja kohta särmällä (0–1) viimeisimmästä hausta. */
  private hit = -1;
  private hitAt = 0;

  /** Etäisyys rantaan (m) ilman merkkiä, enintään `reach`. */
  distance(x: number, y: number): number {
    this.hit = -1;
    const list = this.cells.get(cellKey(Math.floor(x / this.cell), Math.floor(y / this.cell)));
    if (!list) return this.reach;
    const s = this.segs;
    let best = this.reach * this.reach;
    for (const e of list) {
      const px = x - s[e]!;
      const py = y - s[e + 1]!;
      const t = Math.max(0, Math.min(1, (px * s[e + 2]! + py * s[e + 3]!) / s[e + 4]!));
      const dx = px - s[e + 2]! * t;
      const dy = py - s[e + 3]! * t;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        this.hit = e;
        this.hitAt = t;
      }
    }
    return Math.sqrt(best);
  }

  /** Etäisyys merkillä: maalla positiivinen, vedessä negatiivinen. */
  signed(x: number, y: number): number {
    const d = this.distance(x, y);
    const e = this.hit;
    // Särmän keskellä puolen kertoo särmän suunta: maa on kulkusuunnasta
    // oikealla (järvi kiertää vastapäivään, saaret myötäpäivään). Kärjen
    // kohdalla ja kaukana rannasta puoli tarkistetaan vesialueesta.
    if (e >= 0 && this.hitAt > 0 && this.hitAt < 1) {
      const s = this.segs;
      const side = s[e + 2]! * (y - s[e + 1]!) - s[e + 3]! * (x - s[e]!);
      if (side !== 0) return side < 0 ? d : -d;
    }
    return this.isWater({ x, y }) ? -d : d;
  }
}

const cellKey = (x: number, y: number): number => (x + 32768) * 65536 + (y + 32768);
