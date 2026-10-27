import {
  LUNKINJARVI,
  LUNKINJARVI_BOTTOM,
  LUNKINJARVI_SURROUNDINGS,
  WaterBody,
  distance,
  isValidStart,
  pierRing,
  type BottomFeature,
  type LakeBottom,
  type LakeMap,
  type LakeSurroundings,
  type Vec2,
} from '@lunki/shared';
import type { RaceEventKind, RaceMapData } from '../game/raceLog';
import { bottomFor } from '../world/lakeData';
import { AREA_COLORS, DEFAULT_GROUND, LINE_COLORS } from '../world/surroundingsMesh';
import { DEPTH_BANDS, MapViewport, depthBand, scaleBarMeters, type Bounds } from './mapViewport';
import { navCode } from './menuNav';
import { decimal, hasKey, t } from '../i18n';

/** Pohjakuvan tarkkuus (m pikselille) ja maareunus järven ympärillä (m). */
const RES = 2;
const MARGIN = 250;
/** Näin pieni liike (px) lasketaan napautukseksi eikä vedoksi. */
const TAP_SLOP = 8;
/** Napautus osuu merkkiin näin läheltä (px). */
const PIN_REACH = 14;

/** Kartalla nimetyt pohjan muodot (jyrkkää rantaa ei nimetä); nimet sanakirjassa. */
type NamedFeature = Exclude<BottomFeature['type'], 'steep'>;
const isNamed = (type: BottomFeature['type']): type is NamedFeature => type !== 'steep';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

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

const featureAt = (d: LakeData, p: Vec2): (BottomFeature & { name: string }) | null => {
  for (const f of d.features) {
    if (!f.name || !isNamed(f.type)) continue;
    const reach = f.type === 'tree' ? f.length : f.type === 'rocks' ? f.radius : f.radius * 0.6;
    if (distance(p, f) <= reach + 4) return f as BottomFeature & { name: string };
  }
  return null;
};

/** Kohdan syvyys ja pohjan muoto tekstinä, esim. "Syvyys 3,2 m · Lahden kivikko (kivikko)"; maalla null. */
export function describeSpot(p: Vec2): string | null {
  const d = lunkiData();
  if (!d.water.isWater(p)) return null;
  const feature = featureAt(d, p);
  const reeds = d.water.reedsAt(p);
  const what = feature
    ? ` · ${feature.name} (${t(`feature.${feature.type as NamedFeature}`)})`
    : reeds
      ? ` · ${reeds.name ?? t('map.reeds')}`
      : '';
  return t('map.depth', { depth: decimal(d.bottom.depthAt(p)) }) + what;
}

interface BaseImage {
  canvas: HTMLCanvasElement;
  extent: Bounds;
}

let baseCache: BaseImage | null = null;

/**
 * Kartan pohjakuva kerran: maankäyttö, tiet, järven syvyysvyöhykkeet
 * käyrineen, saaret, kaislikot, rakennukset ja laiturit. Pikselit ovat isoja kuten pelissä.
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

  // Saaret ovat metsää.
  ctx.fillStyle = css(AREA_COLORS.forest);
  for (const island of d.map.islands) {
    ringPath([island]);
    ctx.fill();
  }
  // Kaislikko pisteityksenä: syvyysväri näkyy pisteiden välistä.
  for (const bed of d.map.reeds ?? []) {
    ctx.save();
    ringPath([bed.ring]);
    ctx.clip();
    const xs = bed.ring.map((p) => px(p)[0]);
    const ys = bed.ring.map((p) => px(p)[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y += 2) {
      for (
        let x = Math.floor(Math.min(...xs)) + (y % 4 === 0 ? 0 : 1);
        x <= Math.max(...xs);
        x += 2
      ) {
        ctx.fillStyle = css((x + y) % 3 === 0 ? AREA_COLORS.field : AREA_COLORS.reeds);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();
  }

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
  /** Merkit (esim. ennätyskalat); napautus merkin kohdalla valitsee sen. */
  pins?: MapPin[];
  onPin?: (index: number) => void;
  /** Kisan reitit ja tapahtumat (tulossivu); saaliit annetaan merkkeinä. */
  race?: Pick<RaceMapData, 'tracks' | 'events'>;
}

/** Kisan tapahtumien merkkien värit (myös selitteeseen). */
export const RACE_EVENT_STYLE: Record<RaceEventKind, { color: string; glyph: string }> = {
  lightning: { color: '#fff36b', glyph: 'ϟ' },
  capsize: { color: '#ff8a3d', glyph: '○' },
  tangle: { color: '#eef2f3', glyph: '×' },
};

export interface MapPin {
  pos: Vec2;
  /** CSS-väri. */
  color: string;
  /** Näytetään valitun merkin vieressä. */
  label: string;
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
  private pins: MapPin[];
  private selectedPin = -1;

  constructor(private readonly options: LakeMapOptions = {}) {
    this.base = buildBase(this.data, LUNKINJARVI_SURROUNDINGS);
    this.view = new MapViewport(this.base.extent);
    this.marker = options.marker ?? null;
    this.pins = options.pins ?? [];

    this.element = document.createElement('div');
    this.element.className = 'lake-map';
    const frame = document.createElement('div');
    frame.className = 'lake-map-frame';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lake-map-canvas';
    // Näppäimistöllä: nuolet (tai h/j/k/l) panoroivat, +/− zoomaa, Enter valitsee keskeltä (#237).
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', t('map.keys'));
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
    zoomButton('+', t('common.closer'), () =>
      this.view.zoomAt(this.view.width / 2, this.view.height / 2, 2),
    );
    zoomButton('−', t('common.farther'), () =>
      this.view.zoomAt(this.view.width / 2, this.view.height / 2, 0.5),
    );
    zoomButton('⌂', t('map.wholeLake'), () => this.view.fit(this.data.map.bounds));
    frame.append(this.canvas, zoom);
    this.info = document.createElement('p');
    this.info.className = 'hint lake-map-info';
    this.info.textContent = t(
      options.onPick ? 'map.tapWater' : options.onPin ? 'map.tapPin' : 'map.tapDepth',
    );
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

  /** Vaihtaa merkit; `selected` (indeksi) korostetaan ja keskitetään. */
  setPins(pins: MapPin[], selected = -1): void {
    this.pins = pins;
    this.selectPin(selected);
  }

  selectPin(index: number): void {
    const pin = this.pins[index];
    this.selectedPin = pin ? index : -1;
    if (pin) {
      this.view.center = { ...pin.pos };
      this.showInfo(pin.pos, false);
    }
    this.draw();
  }

  private legend(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'lake-map-legend';
    for (const b of DEPTH_BANDS) {
      const item = document.createElement('span');
      const swatch = document.createElement('i');
      swatch.style.background = b.color;
      item.append(swatch, hasKey(b.label) ? t(b.label) : b.label);
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
      const pin = this.pins[this.selectedPin];
      if (pin) this.view.center = { ...pin.pos };
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
    c.addEventListener('keydown', (e) => {
      if (this.onKey(navCode(e), e.key)) e.preventDefault();
    });
    // Tähtäin kartan keskellä vain näppäimistön kohdistuksessa.
    c.addEventListener('focus', () => this.draw());
    c.addEventListener('blur', () => this.draw());
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

  /**
   * Näppäin kartan ollessa kohdistettuna. Ylös/alas kartan reunassa ei käsitellä,
   * jolloin valikko siirtyy seuraavalle riville. Palauttaa true, jos käsiteltiin.
   */
  private onKey(code: string, key: string): boolean {
    const v = this.view;
    const step = Math.max(24, Math.min(v.width, v.height) / 5);
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    // Merkin mukaan, koska +/− ovat eri näppäimissä eri kielten asetteluissa.
    const zoom: Record<string, number> = { '+': 2, '=': 2, '-': 0.5, '−': 0.5 };
    if (pan[code]) {
      const before = { ...v.center };
      v.pan(...pan[code]);
      const moved = v.center.x !== before.x || v.center.y !== before.y;
      if (!moved && (code === 'ArrowUp' || code === 'ArrowDown')) return false;
      this.touched = true;
    } else if (zoom[key]) {
      v.zoomAt(v.width / 2, v.height / 2, zoom[key]);
      this.touched = true;
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      this.onTap({ ...v.center });
    } else return false;
    this.draw();
    return true;
  }

  private onTap(p: Vec2): void {
    const hit = this.pinAt(this.view.toScreen(p));
    if (hit >= 0) {
      this.selectedPin = hit;
      this.options.onPin?.(hit);
      this.showInfo(this.pins[hit]!.pos, false);
      this.draw();
      return;
    }
    if (this.options.onPick) {
      if (!isValidStart(this.data.water, p)) {
        this.info.textContent = t('map.pickWater');
        return;
      }
      this.marker = p;
      this.options.onPick(p);
    }
    this.probe = p;
    this.showInfo(p, true);
    this.draw();
  }

  /** Lähin merkki napautuskohdan vieressä; -1 = ei osumaa. */
  private pinAt(s: Vec2): number {
    let best = -1;
    let bestD = PIN_REACH;
    this.pins.forEach((pin, i) => {
      const d = distance(this.view.toScreen(pin.pos), s);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  /** Syvyys ja lähin pohjan muoto tekstinä kartan alle. */
  private showInfo(p: Vec2, picked: boolean): void {
    const spot = describeSpot(p);
    const prefix =
      picked && spot && this.options.onPick
        ? `${this.options.markerLabel ?? t('map.selected')}: `
        : '';
    this.info.textContent = spot ? prefix + spot : t('map.land');
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
      if (!f.name || !isNamed(f.type) || f.type === 'tree') continue;
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

    this.drawRace(ctx);
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
    this.drawPins(ctx);
    if (document.activeElement === this.canvas && this.canvas.matches('.kb *')) {
      const mid = { x: v.width / 2, y: v.height / 2 };
      this.cross(ctx, mid, '#0b0f14', 9);
      this.cross(ctx, mid, '#eef2f3', 7);
    }
    this.scaleBar(ctx);
    this.label(ctx, t('map.north'), v.width - 8, 14, '#eef2f3', 'right');
  }

  /** Reitit viivoina pelaajan värillä ja tapahtumat pieninä merkkeinä. */
  private drawRace(ctx: CanvasRenderingContext2D): void {
    const race = this.options.race;
    if (!race) return;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const [width, outline] of [
      [4, true],
      [2, false],
    ] as const) {
      for (const t of race.tracks) {
        ctx.strokeStyle = outline ? '#0b0f14' : t.color;
        ctx.lineWidth = width;
        for (const seg of t.segments) {
          if (seg.length < 2) continue;
          ctx.beginPath();
          seg.forEach((p, i) => {
            const s = this.view.toScreen(p);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
          });
          ctx.stroke();
        }
      }
    }
    for (const e of race.events) this.eventIcon(ctx, e.kind, this.view.toScreen(e.pos));
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  }

  private eventIcon(ctx: CanvasRenderingContext2D, kind: RaceEventKind, s: Vec2): void {
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    const path = () => {
      ctx.beginPath();
      if (kind === 'lightning') {
        ctx.moveTo(x + 2, y - 7);
        ctx.lineTo(x - 2, y);
        ctx.lineTo(x + 2, y);
        ctx.lineTo(x - 2, y + 7);
      } else if (kind === 'capsize') {
        ctx.arc(x, y, 5, 0, Math.PI * 2);
      } else {
        ctx.moveTo(x - 4, y - 4);
        ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4);
        ctx.lineTo(x - 4, y + 4);
      }
    };
    path();
    ctx.strokeStyle = '#0b0f14';
    ctx.lineWidth = 5;
    ctx.stroke();
    path();
    ctx.strokeStyle = RACE_EVENT_STYLE[kind].color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** Merkit pisteinä; valittu isompana nimen kera ja muiden päällä. */
  private drawPins(ctx: CanvasRenderingContext2D): void {
    const order = this.pins.map((_, i) => i).filter((i) => i !== this.selectedPin);
    if (this.pins[this.selectedPin]) order.push(this.selectedPin);
    for (const i of order) {
      const pin = this.pins[i]!;
      const s = this.view.toScreen(pin.pos);
      const selected = i === this.selectedPin;
      const r = selected ? 7 : 5;
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(Math.round(s.x) - r - 1, Math.round(s.y) - r - 1, r * 2 + 2, r * 2 + 2);
      ctx.fillStyle = pin.color;
      ctx.fillRect(Math.round(s.x) - r, Math.round(s.y) - r, r * 2, r * 2);
      if (selected) {
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.round(s.x) - r - 4, Math.round(s.y) - r - 4, r * 2 + 8, r * 2 + 8);
        this.label(ctx, pin.label, s.x + r + 8, s.y, '#fff3b0');
      }
    }
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
