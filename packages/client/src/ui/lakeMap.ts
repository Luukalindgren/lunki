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
import { activeLook, onLookChange, smoothLook, type Look } from '../engine/look';
import { pixelBytes, smoothPixels } from '../engine/smoothPixels';
import type { RaceEventKind, RaceMapData } from '../game/raceLog';
import { bottomFor } from '../world/lakeData';
import { DEPTH_BANDS, MapViewport, depthBand, scaleBarMeters, type Bounds } from './mapViewport';
import { uiFont } from './lookArt';
import { planVegetation } from '../world/vegetation';
import { mapColors } from './mapColors';
import { navCode } from './menuNav';
import { decimal, hasKey, t } from '../i18n';

/** Pohjakuvan tarkkuus (m pikselille) ja maareunus järven ympärillä (m). */
const RES = 2;
const MARGIN = 250;
/** Puun latvuksen säde kartalla suhteessa puun korkeuteen. */
const CROWN = 0.2;
/** Näin pieni liike (px) lasketaan napautukseksi eikä vedoksi. */
const TAP_SLOP = 8;
/** Napautus osuu merkkiin näin läheltä (px). */
const PIN_REACH = 14;

/** Kartalla nimetyt pohjan muodot (jyrkkää rantaa ei nimetä); nimet sanakirjassa. */
type NamedFeature = Exclude<BottomFeature['type'], 'steep'>;
const isNamed = (type: BottomFeature['type']): type is NamedFeature => type !== 'steep';

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
  /** Kuvapisteitä Retron pikseliä kohden. */
  detail: number;
}

const baseCache: Partial<Record<Look, BaseImage>> = {};
/** Terävän pohjakuvan kuvapisteitä Retron pikseliä kohden. */
const FINE = 2;

/**
 * Kartan pohjakuva kerran: maankäyttö, tiet, järven syvyysvyöhykkeet
 * käyrineen, saaret, kaislikot, rakennukset ja laiturit. Retrossa pikselit ovat
 * isoja kuten pelissä. Terävällä (#674) sama kuva piirretään kaksinkertaisella
 * tarkkuudella: alueiden reunat ovat sileitä, syvyysvyöhykkeistä tehdään sileä
 * versio (`smoothPixels`) ja kartta suurennetaan pehmeästi. Värit tulevat
 * ilmeen mukaan (`mapColors`): Modernissa kartta on järvi kuten kisassa
 * ylhäältä, ja rannan puut piirretään latvuksina.
 */
function buildBase(d: LakeData, s: LakeSurroundings): BaseImage {
  const look = activeLook();
  const cached = baseCache[look];
  if (cached) return cached;
  const fine = smoothLook(look);
  const c = mapColors();
  const detail = fine ? FINE : 1;
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
  canvas.width = w * detail;
  canvas.height = h * detail;
  const ctx = canvas.getContext('2d')!;
  // Piirto on aina Retron pikseleinä; Terävällä yksi pikseli on `FINE` kuvapistettä.
  ctx.scale(detail, detail);
  const px = (p: Vec2): [number, number] => [(p.x - extent.minX) / RES, (extent.maxY - p.y) / RES];
  const ringPath = (rings: Vec2[][]) => {
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((p, i) => (i === 0 ? ctx.moveTo(...px(p)) : ctx.lineTo(...px(p))));
      ctx.closePath();
    }
  };

  ctx.fillStyle = c.ground;
  ctx.fillRect(0, 0, w, h);
  for (const a of s.areas) {
    if (a.kind === 'building') continue;
    ringPath(a.rings);
    ctx.fillStyle = c.areas[a.kind];
    ctx.fill('evenodd');
  }
  ctx.lineWidth = 1;
  for (const l of s.lines) {
    ctx.beginPath();
    l.points.forEach((p, i) => (i === 0 ? ctx.moveTo(...px(p)) : ctx.lineTo(...px(p))));
    ctx.strokeStyle = c.lines[l.kind];
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
  const colors = new Int32Array(lw * lh).fill(-1);
  const int = (color: string) => parseInt(color.slice(1), 16);
  const rgb = c.bands.map(int);
  const contours = c.contours?.map(int);
  const shore = c.shore ? int(c.shore) : null;
  const land = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < lw && j < lh && bands[j * lw + i]! < 0;
  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      const k = j * lw + i;
      const band = bands[k]!;
      if (band < 0) continue;
      const left = i > 0 ? bands[k - 1]! : band;
      const up = j > 0 ? bands[k - lw]! : band;
      // Käyrä: syvemmän puolen pikseli tummuu vyöhykkeen rajalla.
      const edge = (left >= 0 && left < band) || (up >= 0 && up < band);
      // Rantaviiva: veden pikseli, jonka vieressä on maata.
      if (shore !== null && (land(i - 1, j) || land(i + 1, j) || land(i, j - 1) || land(i, j + 1)))
        colors[k] = shore;
      else if (edge && contours) colors[k] = contours[band]!;
      else colors[k] = rgb[Math.min(rgb.length - 1, band + (edge ? 1 : 0))]!;
    }
  }
  const water = { width: lw, height: lh, data: colors };
  const shown = fine ? smoothPixels(water, FINE) : water;
  const img = new ImageData(shown.width, shown.height);
  img.data.set(pixelBytes(shown));
  const lake = document.createElement('canvas');
  lake.width = shown.width;
  lake.height = shown.height;
  lake.getContext('2d')!.putImageData(img, 0, 0);
  ctx.drawImage(lake, x0, y0, lw, lh);

  // Saaret ovat metsää.
  ctx.fillStyle = c.areas.forest;
  for (const island of d.map.islands) {
    ringPath([island]);
    ctx.fill();
  }
  // Rannan puut latvuksina samoilla paikoilla kuin järvellä.
  if (c.trees) {
    for (const plant of planVegetation(d.map, s)) {
      if (plant.kind === 'reeds') continue;
      const [x, y] = px(plant.pos);
      ctx.fillStyle = c.trees[plant.kind];
      ctx.globalAlpha = Math.min(1, plant.shade);
      ctx.beginPath();
      ctx.arc(x, y, (plant.height * CROWN) / RES, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
        ctx.fillStyle = c.reeds[(x + y) % 3 === 0 ? 0 : 1];
        if (fine) {
          // Terävällä pisteet ovat pyöreitä korsia.
          ctx.beginPath();
          ctx.arc(x + 0.5, y + 0.5, 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();
  }

  ctx.fillStyle = c.areas.building;
  for (const a of s.areas) {
    if (a.kind !== 'building') continue;
    ringPath(a.rings);
    ctx.fill('evenodd');
  }
  ctx.fillStyle = c.areas.pier;
  for (const p of d.map.piers ?? []) {
    ringPath([pierRing(p)]);
    ctx.fill();
  }
  ctx.strokeStyle = c.log;
  for (const f of d.features) {
    if (f.type !== 'tree') continue;
    ctx.beginPath();
    ctx.moveTo(...px(f));
    ctx.lineTo(
      ...px({ x: f.x + Math.cos(f.angle) * f.length, y: f.y + Math.sin(f.angle) * f.length }),
    );
    ctx.stroke();
  }
  return (baseCache[look] = { canvas, extent, detail });
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
  private legendBox: HTMLElement;
  private readonly data = lunkiData();
  private base: BaseImage;
  private readonly unwatchLook: () => void;
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
    this.legendBox = this.legend();
    this.element.append(frame, this.info, this.legendBox);

    this.resize = new ResizeObserver(() => this.layout());
    this.resize.observe(this.canvas);
    this.bindInput();
    // Ilmeen vaihtuessa pohjakuva piirretään uudelleen.
    this.unwatchLook = onLookChange(() => {
      this.base = buildBase(this.data, LUNKINJARVI_SURROUNDINGS);
      // Selitteen värit ovat ilmeen syvyysvärit.
      const legend = this.legend();
      this.legendBox.replaceWith(legend);
      this.legendBox = legend;
      this.draw();
    });
  }

  dispose(): void {
    this.resize.disconnect();
    this.unwatchLook();
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
    DEPTH_BANDS.forEach((b, i) => {
      const item = document.createElement('span');
      const swatch = document.createElement('i');
      swatch.style.background = mapColors().bands[i]!;
      item.append(swatch, hasKey(b.label) ? t(b.label) : b.label);
      box.append(item);
    });
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
    const c = mapColors();
    const dpr = this.canvas.width / v.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = c.ground;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sharp = smoothLook(activeLook());
    ctx.imageSmoothingEnabled = sharp;
    const e = this.base.extent;
    const tl = v.toScreen({ x: e.minX, y: e.maxY });
    ctx.drawImage(
      this.base.canvas,
      tl.x,
      tl.y,
      (e.maxX - e.minX) * v.scale,
      (this.base.canvas.height / this.base.detail) * RES * v.scale,
    );

    ctx.font = uiFont(16);
    ctx.textBaseline = 'middle';
    const labels = v.scale >= 0.45;
    for (const f of this.data.features) {
      if (!f.name || !isNamed(f.type) || f.type === 'tree') continue;
      const s = v.toScreen(f);
      if (f.type === 'rocks') {
        ctx.fillStyle = c.rocks;
        for (const [dx, dy] of [
          [-2, 0],
          [2, -1],
          [0, 2],
        ]) {
          if (sharp) {
            ctx.beginPath();
            ctx.arc(s.x + dx!, s.y + dy!, 1.6, 0, Math.PI * 2);
            ctx.fill();
          } else ctx.fillRect(Math.round(s.x + dx! - 1), Math.round(s.y + dy! - 1), 3, 3);
        }
      }
      if (labels) this.label(ctx, f.name, s.x + 6, s.y, c.text);
    }
    if (v.scale < 0.45) this.label(ctx, this.data.map.name, v.width / 2, 14, c.highlight, 'center');

    this.drawRace(ctx);
    if (this.probe && !this.options.onPick) this.probeMark(ctx, v.toScreen(this.probe));
    if (this.marker) {
      const s = v.toScreen(this.marker);
      ctx.strokeStyle = c.backing;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = c.marker;
      ctx.lineWidth = 2;
      ctx.stroke();
      this.cross(ctx, s, c.marker, 3);
      if (this.options.markerLabel)
        this.label(ctx, this.options.markerLabel, s.x + 12, s.y, c.marker);
    }
    this.drawPins(ctx);
    if (document.activeElement === this.canvas && this.canvas.matches('.kb *')) {
      const mid = { x: v.width / 2, y: v.height / 2 };
      this.cross(ctx, mid, c.backing, 9);
      this.cross(ctx, mid, c.text, 7);
    }
    this.scaleBar(ctx);
    this.label(ctx, t('map.north'), v.width - 8, 14, c.text, 'right');
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
      const c = mapColors();
      if (c.roundPins) {
        // Modernissa merkit ovat pyöreitä.
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 1, 0, Math.PI * 2);
        ctx.fillStyle = c.edge;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s.x, s.y, r - 0.5, 0, Math.PI * 2);
        ctx.fillStyle = pin.color;
        ctx.fill();
      } else {
        ctx.fillStyle = c.edge;
        ctx.fillRect(Math.round(s.x) - r - 1, Math.round(s.y) - r - 1, r * 2 + 2, r * 2 + 2);
        ctx.fillStyle = pin.color;
        ctx.fillRect(Math.round(s.x) - r, Math.round(s.y) - r, r * 2, r * 2);
      }
      if (selected) {
        ctx.strokeStyle = c.highlight;
        ctx.lineWidth = 2;
        if (c.roundPins) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, r + 4.5, 0, Math.PI * 2);
          ctx.stroke();
        } else
          ctx.strokeRect(Math.round(s.x) - r - 4, Math.round(s.y) - r - 4, r * 2 + 8, r * 2 + 8);
        this.label(ctx, pin.label, s.x + r + 8, s.y, c.highlight);
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
    const c = mapColors();
    ctx.textAlign = align;
    if (c.halo) {
      // Reunus pitää tekstin luettavana veden ja metsän päällä.
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.backing;
      ctx.strokeText(text, x, y);
      ctx.lineJoin = 'miter';
    } else {
      ctx.fillStyle = c.backing;
      ctx.fillText(text, x + 1, y + 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  /** Luotauskohdan merkki: risti, jolla on Modernissa reunus. */
  private probeMark(ctx: CanvasRenderingContext2D, s: Vec2): void {
    const c = mapColors();
    if (c.halo) {
      ctx.fillStyle = c.backing;
      ctx.fillRect(Math.round(s.x) - 6, Math.round(s.y) - 2, 12, 4);
      ctx.fillRect(Math.round(s.x) - 2, Math.round(s.y) - 6, 4, 12);
      this.cross(ctx, s, c.highlight, 5);
    } else this.cross(ctx, s, c.highlight, 4);
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
    const c = mapColors();
    ctx.fillStyle = c.backing;
    ctx.fillRect(x - 1, y - 4, len + 2, 7);
    ctx.fillStyle = c.text;
    ctx.fillRect(x, y - 3, len, 5);
    ctx.fillStyle = c.backing;
    ctx.fillRect(x + len / 2, y - 2, len / 2 - 1, 3);
    this.label(ctx, m >= 1000 ? `${m / 1000} km` : `${m} m`, x + len + 6, y, c.text);
  }
}
