import type { Vec2 } from '@lunki/shared';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Syvyysvyöhykkeet kartalla: [alaraja (m), väri, selite]. */
export const DEPTH_BANDS: readonly { below: number; color: string; label: string }[] = [
  { below: 1, color: '#83c2db', label: 'alle 1 m' },
  { below: 2, color: '#4d9cc2', label: '1–2 m' },
  { below: 4, color: '#2b7aa6', label: '2–4 m' },
  { below: 6, color: '#1b5a84', label: '4–6 m' },
  { below: 8, color: '#123a5c', label: '6–8 m' },
  { below: Infinity, color: '#0d2238', label: 'yli 8 m' },
];

/** Syvyyden vyöhyke DEPTH_BANDS-listassa. */
export const depthBand = (depth: number): number => DEPTH_BANDS.findIndex((b) => depth < b.below);

/** Mittakaavajanan pituus (m): pyöreä luku, joka on näytöllä enintään `maxPx` leveä. */
export function scaleBarMeters(pxPerMeter: number, maxPx = 110): number {
  const steps = [10, 20, 50, 100, 200, 250, 500, 1000];
  let best = steps[0]!;
  for (const m of steps) if (m * pxPerMeter <= maxPx) best = m;
  return best;
}

/**
 * Kartan näkymä: keskipiste pelin metreinä ja mittakaava (CSS-pikseliä
 * metrille). Pohjoinen ylöspäin, kuten pelissä.
 */
export class MapViewport {
  center: Vec2 = { x: 0, y: 0 };
  scale = 1;
  width = 1;
  height = 1;
  private minScale = 0.01;

  /** Suurin zoom: 8 px metrille näyttää kartan pikselit isoina. */
  static readonly MAX_SCALE = 8;

  constructor(
    /** Alue, jonka ulkopuolelle näkymän keskipiste ei saa mennä. */
    readonly limits: Bounds,
  ) {}

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    // Loitommaksi kuin koko rajattu alue ei ole syytä mennä.
    const w = this.limits.maxX - this.limits.minX;
    const h = this.limits.maxY - this.limits.minY;
    this.minScale = Math.min(this.width / w, this.height / h) * 0.9;
    this.scale = Math.max(this.minScale, this.scale);
  }

  /** Sovittaa alueen näkymään reunavaralla. */
  fit(b: Bounds, padding = 12): void {
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    this.scale = this.clampScale(
      Math.min((this.width - padding * 2) / w, (this.height - padding * 2) / h),
    );
    this.center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }

  toScreen(p: Vec2): Vec2 {
    return {
      x: this.width / 2 + (p.x - this.center.x) * this.scale,
      y: this.height / 2 - (p.y - this.center.y) * this.scale,
    };
  }

  toWorld(sx: number, sy: number): Vec2 {
    return {
      x: this.center.x + (sx - this.width / 2) / this.scale,
      y: this.center.y - (sy - this.height / 2) / this.scale,
    };
  }

  /** Siirtää näkymää näytön pikseleinä (veto). */
  pan(dx: number, dy: number): void {
    this.center = this.clampCenter({
      x: this.center.x - dx / this.scale,
      y: this.center.y + dy / this.scale,
    });
  }

  /** Zoomaa kertoimella niin, että näytön piste (sx, sy) pysyy paikallaan. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toWorld(sx, sy);
    this.scale = this.clampScale(this.scale * factor);
    const after = this.toWorld(sx, sy);
    this.center = this.clampCenter({
      x: this.center.x + before.x - after.x,
      y: this.center.y + before.y - after.y,
    });
  }

  private clampScale(s: number): number {
    return Math.max(this.minScale, Math.min(MapViewport.MAX_SCALE, s));
  }

  private clampCenter(c: Vec2): Vec2 {
    const l = this.limits;
    return {
      x: Math.max(l.minX, Math.min(l.maxX, c.x)),
      y: Math.max(l.minY, Math.min(l.maxY, c.y)),
    };
  }
}
