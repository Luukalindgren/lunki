import {
  LUNKINJARVI,
  LUNKINJARVI_BOTTOM,
  LUNKINJARVI_SURROUNDINGS,
  WaterBody,
  distance,
  pierRing,
  type BottomFeature,
  type LakeBottom,
  type LakeMap,
  type LakeSurroundings,
  type Vec2,
} from '@lunki/shared';
import { bottomFor } from '../world/lakeData';
import { AREA_COLORS, DEFAULT_GROUND, LINE_COLORS } from '../world/surroundingsMesh';
import { DEPTH_BANDS, MapViewport, depthBand, scaleBarMeters, type Bounds } from './mapViewport';

/** Pohjakuvan tarkkuus (m pikselille) ja maareunus järven ympärillä (m). */
const RES = 2;
const MARGIN = 250;
/** Näin pieni liike (px) lasketaan napautukseksi eikä vedoksi. */
const TAP_SLOP = 8;

const FEATURE_NAMES: Partial<Record<BottomFeature['type'], string>> = {
  hole: 'syvänne',
  shoal: 'matalikko',
  dropoff: 'jyrkänne',
  rocks: 'kivikko',
  tree: 'kaatunut puu',
};

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
const fi = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');

interface LakeData {
  map: LakeMap;
  water: WaterBody;
  bottom: LakeBottom;
  features: BottomFeature[];
}

let lunki: LakeData | null = null;
const lunkiData = (): LakeData => {
  if (!lunki) {
    const water = new WaterBody(LUNKINJARVI);
    lunki = {
      map: LUNKINJARVI,
      water,
      bottom: bottomFor(LUNKINJARVI, water),
      features: LUNKINJARVI_BOTTOM.features,
    };
  }
  return lunki;
};

interface BaseImage {
  canvas: HTMLCanvasElement;
  extent: Bounds;
}

let baseCache: BaseImage | null = null;

/**
 * Kartan pohjakuva kerran: maankäyttö, tiet, järven syvyysvyöhykkeet
 * käyrineen, rakennukset ja laiturit. Pikselit ovat isoja kuten pelissä.
 */
function buildBase(d: LakeData, s: LakeSurroundings): BaseImage {
  if (baseCache) return baseCache;
  const b = d.map.bounds;
  const extent = {
    minX: b.minX - MARGIN,
    minY: b.minY - MARGIN,
    maxX: b.maxX + MARGIN,
    maxY: b.maxY + MARGIN,
  };
  const w = Math.ceil((extent.maxX - extent.minX) / RES);
  const h = Math.ceil((extent.maxY - extent.minY) / RES);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const px = (p: Vec2): [number, number] => [(p.x - extent.minX) / RES, (extent.maxY - p.y) / RES];
  const ringPath = (rings: Vec2[][]) => {
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((p, i) => (i === 0 ? ctx.moveTo(...px(p)) : ctx.lineTo(...px(p))));
      ctx.closePath();
    }
  };

  ctx.fillStyle = css(DEFAULT_GROUND);
  ctx.fillRect(0, 0, w, h);
  for (const a of s.areas) {
    if (a.kind === 'building') continue;
    ringPath(a.rings);
    ctx.fillStyle = css(AREA_COLORS[a.kind]);
    ctx.fill('evenodd');
  }
  ctx.lineWidth = 1;
  for (const l of s.lines) {
    ctx.beginPath();
    l.points.forEach((p, i) => (i === 0 ? ctx.moveTo(...px(p)) : ctx.lineTo(...px(p))));
    ctx.strokeStyle = css(LINE_COLORS[l.kind]);
    ctx.stroke();
  }

  // Järvi pikseleittäin: syvyysvyöhyke ja käyrä vyöhykkeiden rajalla.
  const [x0, y0] = px({ x: b.minX, y: b.maxY }).map(Math.floor) as [number, number];
  const [x1, y1] = px({ x: b.maxX, y: b.minY }).map(Math.ceil) as [number, number];
  const lw = x1 - x0;
  const lh = y1 - y0;
  const bands = new Int8Array(lw * lh).fill(-1);
  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      const p = {
        x: extent.minX + (x0 + i + 0.5) * RES,
        y: extent.maxY - (y0 + j + 0.5) * RES,
      };
      // Maalla syvyys on 0, vedessä aina vähintään matala.
      const depth = d.bottom.depthAt(p);
      if (depth > 0) bands[j * lw + i] = depthBand(depth);
    }
  }
  // Oma kuva vedelle: maan lukeminen takaisin näytönohjaimelta olisi hidasta.
  const img = new ImageData(lw, lh);
  const rgb = DEPTH_BANDS.map((band) => {
    const v = parseInt(band.color.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const;
  });
  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      const k = j * lw + i;
      const band = bands[k]!;
      if (band < 0) continue;
      const left = i > 0 ? bands[k - 1]! : band;
      const up = j > 0 ? bands[k - lw]! : band;
      // Käyrä: syvemmän puolen pikseli tummuu vyöhykkeen rajalla.
      const edge = (left >= 0 && left < band) || (up >= 0 && up < band);
      const c = rgb[Math.min(rgb.length - 1, band + (edge ? 1 : 0))]!;
      img.data.set([c[0], c[1], c[2], 255], k * 4);
    }
  }
  const lake = document.createElement('canvas');
  lake.width = lw;
  lake.height = lh;
  lake.getContext('2d')!.putImageData(img, 0, 0);
  ctx.drawImage(lake, x0, y0);

  ctx.fillStyle = css(AREA_COLORS.building);
  for (const a of s.areas) {
    if (a.kind !== 'building') continue;
    ringPath(a.rings);
    ctx.fill('evenodd');
  }
  ctx.fillStyle = css(AREA_COLORS.pier);
  for (const p of d.map.piers ?? []) {
    ringPath([pierRing(p)]);
    ctx.fill();
  }
  ctx.strokeStyle = '#5e432b';
  for (const f of d.features) {
    if (f.type !== 'tree') continue;
    ctx.beginPath();
    ctx.moveTo(...px(f));
    ctx.lineTo(
      ...px({ x: f.x + Math.cos(f.angle) * f.length, y: f.y + Math.sin(f.angle) * f.length }),
    );
    ctx.stroke();
  }
  baseCache = { canvas, extent };
  return baseCache;
}

export interface LakeMapOptions {
  /** Valintatila: napautus vedessä valitsee pisteen. */
  onPick?: (p: Vec2) => void;
  /** Valittu piste (esim. aloituspaikka) merkkinä kartalla. */
  marker?: Vec2 | null;
  markerLabel?: string;
}

/**
 * Lunkinjärvi karttana: vedä siirtää, rulla ja nipistys zoomaavat, napautus
 * kertoo syvyyden (valintatilassa valitsee pisteen). Toimii hiirellä ja
 * kosketuksella.
 */
export class LakeMapView {
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly info: HTMLParagraphElement;
  private readonly data = lunkiData();
  private readonly base: BaseImage;
  private readonly view: MapViewport;
  private readonly resize: ResizeObserver;
  private readonly pointers = new Map<number, Vec2>();
  private tap: { x: number; y: number; moved: number } | null = null;
  private touched = false;
  private marker: Vec2 | null;
  private probe: Vec2 | null = null;

  constructor(private readonly options: LakeMapOptions = {}) {
    this.base = buildBase(this.data, LUNKINJARVI_SURROUNDINGS);
    this.view = new MapViewport(this.base.extent);
    this.marker = options.marker ?? null;

    this.element = document.createElement('div');
    this.element.className = 'lake-map';
    const frame = document.createElement('div');
    frame.className = 'lake-map-frame';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lake-map-canvas';
    const zoom = document.createElement('div');
    zoom.className = 'lake-map-zoom';
    const zoomButton = (text: string, title: string, action: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.title = title;
      b.addEventListener('click', () => {
        this.touched = true;
        action();
        this.draw();
      });
      zoom.append(b);
    };
    zoomButton('+', 'Lähemmäs', () =>
      this.view.zoomAt(this.view.width / 2, this.view.height / 2, 2),
    );
    zoomButton('−', 'Kauemmas', () =>
      this.view.zoomAt(this.view.width / 2, this.view.height / 2, 0.5),
    );
    zoomButton('⌂', 'Koko järvi', () => this.view.fit(this.data.map.bounds));
    frame.append(this.canvas, zoom);
    this.info = document.createElement('p');
    this.info.className = 'hint lake-map-info';
    this.info.textContent = options.onPick
      ? 'Napauta kohtaa vedessä.'
      : 'Napauta kohtaa, niin näet syvyyden.';
    this.element.append(frame, this.info, this.legend());

    this.resize = new ResizeObserver(() => this.layout());
    this.resize.observe(this.canvas);
    this.bindInput();
  }

  dispose(): void {
    this.resize.disconnect();
  }

  setMarker(p: Vec2 | null): void {
    this.marker = p;
    this.draw();
  }

  private legend(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'lake-map-legend';
    for (const b of DEPTH_BANDS) {
      const item = document.createElement('span');
      const swatch = document.createElement('i');
      swatch.style.background = b.color;
      item.append(swatch, b.label);
      box.append(item);
    }
    return box;
  }

  private layout(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.view.setSize(w, h);
    // Kunnes pelaaja liikuttaa karttaa, koko järvi pysyy kuvassa.
    if (!this.touched) {
      this.view.fit(this.data.map.bounds);
      if (this.marker && this.options.onPick) this.view.center = { ...this.marker };
    }
    this.draw();
  }

  private local(e: PointerEvent | WheelEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        // Ei aktiivinen osoitin (esim. testin tapahtuma): veto toimii silti kartan päällä.
      }
      const p = this.local(e);
      this.pointers.set(e.pointerId, p);
      this.tap = this.pointers.size === 1 ? { ...p, moved: 0 } : null;
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.local(e);
      const prev = this.pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') this.showInfo(this.view.toWorld(p.x, p.y), false);
        return;
      }
      if (this.pointers.size === 1) {
        this.view.pan(p.x - prev.x, p.y - prev.y);
        if (this.tap) this.tap.moved += Math.hypot(p.x - prev.x, p.y - prev.y);
      } else if (this.pointers.size === 2) {
        // Nipistys: kahden sormen välimatka zoomaa, keskipiste siirtää.
        const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(p.x - other.x, p.y - other.y);
        const mid = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
        if (before > 1) this.view.zoomAt(mid.x, mid.y, after / before);
        this.view.pan((p.x - prev.x) / 2, (p.y - prev.y) / 2);
      }
      this.touched = true;
      this.pointers.set(e.pointerId, p);
      this.draw();
    });
    const release = (e: PointerEvent, cancelled: boolean) => {
      if (!this.pointers.delete(e.pointerId)) return;
      const tap = this.tap;
      this.tap = null;
      if (!cancelled && tap && tap.moved < TAP_SLOP && this.pointers.size === 0) {
        const p = this.local(e);
        this.onTap(this.view.toWorld(p.x, p.y));
      }
    };
    c.addEventListener('pointerup', (e) => release(e, false));
    c.addEventListener('pointercancel', (e) => release(e, true));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.local(e);
        this.touched = true;
        this.view.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
        this.draw();
      },
      { passive: false },
    );
  }

  private onTap(p: Vec2): void {
    const wet = this.data.water.isWater(p);
    if (this.options.onPick) {
      if (!wet) {
        this.info.textContent = 'Valitse kohta vedestä.';
        return;
      }
      this.marker = p;
      this.options.onPick(p);
    }
    this.probe = p;
    this.showInfo(p, true);
    this.draw();
  }

  /** Syvyys ja lähin pohjan muoto tekstinä kartan alle. */
  private showInfo(p: Vec2, picked: boolean): void {
    if (!this.data.water.isWater(p)) {
      this.info.textContent = 'Maata';
      return;
    }
    const depth = `Syvyys ${fi(this.data.bottom.depthAt(p))} m`;
    const feature = this.featureAt(p);
    const what = feature ? ` · ${feature.name} (${FEATURE_NAMES[feature.type]})` : '';
    const prefix =
      picked && this.options.onPick ? `${this.options.markerLabel ?? 'Valittu'}: ` : '';
    this.info.textContent = prefix + depth + what;
  }

  private featureAt(p: Vec2): (BottomFeature & { name: string }) | null {
    for (const f of this.data.features) {
      if (!f.name || !FEATURE_NAMES[f.type]) continue;
      const reach = f.type === 'tree' ? f.length : f.type === 'rocks' ? f.radius : f.radius * 0.6;
      if (distance(p, f) <= reach + 4) return f as BottomFeature & { name: string };
    }
    return null;
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || this.view.width <= 1) return;
    const v = this.view;
    const dpr = this.canvas.width / v.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = css(DEFAULT_GROUND);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const e = this.base.extent;
    const tl = v.toScreen({ x: e.minX, y: e.maxY });
    const span = (e.maxX - e.minX) * v.scale;
    ctx.drawImage(this.base.canvas, tl.x, tl.y, span, this.base.canvas.height * RES * v.scale);

    ctx.font = '16px VT323, monospace';
    ctx.textBaseline = 'middle';
    const labels = v.scale >= 0.45;
    for (const f of this.data.features) {
      if (!f.name || !FEATURE_NAMES[f.type] || f.type === 'tree') continue;
      const s = v.toScreen(f);
      if (f.type === 'rocks') {
        ctx.fillStyle = '#c3cbd2';
        for (const [dx, dy] of [
          [-2, 0],
          [2, -1],
          [0, 2],
        ])
          ctx.fillRect(Math.round(s.x + dx! - 1), Math.round(s.y + dy! - 1), 3, 3);
      }
      if (labels) this.label(ctx, f.name, s.x + 6, s.y, '#eef2f3');
    }
    if (v.scale < 0.45) this.label(ctx, this.data.map.name, v.width / 2, 14, '#fff3b0', 'center');

    if (this.probe && !this.options.onPick) this.cross(ctx, v.toScreen(this.probe), '#fff3b0', 4);
    if (this.marker) {
      const s = v.toScreen(this.marker);
      ctx.strokeStyle = '#0b0f14';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#f6d04d';
      ctx.lineWidth = 2;
      ctx.stroke();
      this.cross(ctx, s, '#f6d04d', 3);
      if (this.options.markerLabel)
        this.label(ctx, this.options.markerLabel, s.x + 12, s.y, '#f6d04d');
    }
    this.scaleBar(ctx);
    this.label(ctx, 'P ▲', v.width - 8, 14, '#eef2f3', 'right');
  }

  private label(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    align: CanvasTextAlign = 'left',
  ): void {
    ctx.textAlign = align;
    ctx.fillStyle = '#0b0f14';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private cross(ctx: CanvasRenderingContext2D, s: Vec2, color: string, r: number): void {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(s.x) - r, Math.round(s.y) - 1, r * 2, 2);
    ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - r, 2, r * 2);
  }

  private scaleBar(ctx: CanvasRenderingContext2D): void {
    const m = scaleBarMeters(this.view.scale);
    const len = m * this.view.scale;
    const x = 10;
    const y = this.view.height - 12;
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(x - 1, y - 4, len + 2, 7);
    ctx.fillStyle = '#eef2f3';
    ctx.fillRect(x, y - 3, len, 5);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(x + len / 2, y - 2, len / 2 - 1, 3);
    this.label(ctx, m >= 1000 ? `${m / 1000} km` : `${m} m`, x + len + 6, y, '#eef2f3');
  }
}
