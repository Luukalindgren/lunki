import {
  pointInRing,
  terrainHeightAt,
  type LakeMap,
  type LakeSurroundings,
  type Vec2,
} from '@lunki/shared';

/** Maastoverkon ruutu (m): korkeusmallia tiheämpi, jotta rantaviiva osuu kohdalleen. */
export const GROUND_CELL = 10;
/** Järven pohja painuu rannasta tähän syvyyteen (m). */
const LAKE_FLOOR = 3;
/** Ranta nousee vähintään näin jyrkästi (m/m) ensimmäisten metrien matkalla… */
const SHORE_RISE = 0.15;
/** …ja korkeintaan näin jyrkästi: korkeusmallin karkeat ruudut eivät tee rantaan seinää. */
const SHORE_MAX_SLOPE = 0.5;
/** Maa on rantaviivalla näin syvällä (m), jotta se ei peitä vettä ruudun sisällä. */
const SHORE_DIP = 0.4;
/** Rannan alin korkeus (m) muutaman metrin päässä vedestä. */
const SHORE_LOW = 0.3;

/**
 * POV-näkymän maanpinta: korkeusmalli tasoitettuna rannan kohdalta.
 *
 * Korkeusmallin 20 m ruudut eivät seuraa rantaviivaa: ruudun nurkka maalla
 * nosti koko ruudun pinnan veden päälle, jolloin rengasta vastassa oli
 * tasainen vihreä seinä. Siksi maa painetaan rantaviivalla hieman veden alle
 * ja nousee siitä rinteenä, ja järven pohja laskee rannasta syvemmälle.
 * Puut, metsänreuna ja rakennukset lukevat korkeuden samasta pinnasta kuin
 * maastoverkko, joten ne eivät leiju eivätkä uppoa.
 */
export class Ground {
  readonly minX: number;
  readonly minY: number;
  readonly cols: number;
  readonly rows: number;
  readonly cell = GROUND_CELL;
  /** Korkeus (m) ruudukon pisteissä riveittäin etelästä pohjoiseen. */
  readonly heights: Float32Array;
  /** Onko ruudukon piste järven vedessä (ei saarella). */
  readonly water: Uint8Array;

  constructor(
    map: LakeMap,
    readonly terrain: LakeSurroundings['terrain'],
  ) {
    const t = terrain;
    this.minX = t?.minX ?? 0;
    this.minY = t?.minY ?? 0;
    this.cols = t ? Math.round(((t.cols - 1) * t.cell) / GROUND_CELL) + 1 : 0;
    this.rows = t ? Math.round(((t.rows - 1) * t.cell) / GROUND_CELL) + 1 : 0;
    this.heights = new Float32Array(this.cols * this.rows);
    this.water = new Uint8Array(this.cols * this.rows);
    if (!t) return;
    const shore = new ShoreDistance([map.shore, ...map.islands]);
    const { minX, minY, maxX, maxY } = map.bounds;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const k = j * this.cols + i;
        const p = { x: this.minX + i * GROUND_CELL, y: this.minY + j * GROUND_CELL };
        const inBounds = p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
        const inLake =
          inBounds && pointInRing(p, map.shore) && !map.islands.some((isl) => pointInRing(p, isl));
        const d = shore.distance(p);
        if (inLake) {
          this.water[k] = 1;
          this.heights[k] = -Math.min(LAKE_FLOOR, SHORE_DIP + d * SHORE_MAX_SLOPE);
        } else {
          const dem = terrainHeightAt(t, p);
          const low = Math.min(SHORE_LOW, -SHORE_DIP + d * SHORE_RISE);
          const high = -SHORE_DIP + d * SHORE_MAX_SLOPE;
          this.heights[k] = Math.min(Math.max(dem, low), high);
        }
      }
    }
  }

  /**
   * Maanpinnan korkeus (m) pisteessä täsmälleen maastoverkon kolmioilta
   * (sama jako kuin createTerrainMesh). Ilman korkeusmallia 0.
   */
  heightAt(p: Vec2): number {
    if (!this.terrain) return 0;
    const fx = (p.x - this.minX) / GROUND_CELL;
    const fy = (p.y - this.minY) / GROUND_CELL;
    const i = Math.max(0, Math.min(this.cols - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(this.rows - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - i));
    const ty = Math.max(0, Math.min(1, fy - j));
    const h = (a: number, b: number) => this.heights[b * this.cols + a]!;
    // Ruutu jaetaan lävistäjällä (i+1, j)–(i, j+1).
    if (tx + ty <= 1) return h(i, j) + (h(i + 1, j) - h(i, j)) * tx + (h(i, j + 1) - h(i, j)) * ty;
    const d = h(i + 1, j + 1);
    return d + (h(i, j + 1) - d) * (1 - tx) + (h(i + 1, j) - d) * (1 - ty);
  }
}

/** Etäisyys lähimpään rantaviivaan ruudukon avulla (vain lähiruudut käydään läpi). */
class ShoreDistance {
  private static readonly CELL = 40;
  /** Kauempana rannasta etäisyydellä ei ole väliä: rinne on jo korkeusmallin yllä. */
  private static readonly REACH = 120;
  private readonly cells = new Map<string, [Vec2, Vec2][]>();

  constructor(rings: readonly (readonly Vec2[])[]) {
    const C = ShoreDistance.CELL;
    const r = Math.ceil(ShoreDistance.REACH / C);
    for (const ring of rings) {
      for (let n = 0; n < ring.length; n++) {
        const a = ring[n]!;
        const b = ring[(n + 1) % ring.length]!;
        const x0 = Math.floor(Math.min(a.x, b.x) / C) - r;
        const x1 = Math.floor(Math.max(a.x, b.x) / C) + r;
        const y0 = Math.floor(Math.min(a.y, b.y) / C) - r;
        const y1 = Math.floor(Math.max(a.y, b.y) / C) + r;
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const key = `${x},${y}`;
            const list = this.cells.get(key);
            if (list) list.push([a, b]);
            else this.cells.set(key, [[a, b]]);
          }
      }
    }
  }

  distance(p: Vec2): number {
    const C = ShoreDistance.CELL;
    const list = this.cells.get(`${Math.floor(p.x / C)},${Math.floor(p.y / C)}`);
    let best = Infinity;
    for (const [a, b] of list ?? []) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const s = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      best = Math.min(best, Math.hypot(p.x - a.x - dx * s, p.y - a.y - dy * s));
    }
    return best;
  }
}
