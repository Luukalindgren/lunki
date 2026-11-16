import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';
import type { RetroResolution } from '../engine/resolution';
import { activeLook, smoothLook } from '../engine/look';

/** Zoomitasot: montako metriä yksi sisäinen pikseli kattaa. */
export const ZOOM_LEVELS = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8] as const;

/**
 * Suoraan ylhäältä katsova ortografinen kamera, pohjoinen ylöspäin.
 * Seuraa kohdetta pehmeästi.
 */
export class TopDownCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  /** Pelaajan valitsema zoomitaso. */
  zoomIndex = 1;
  /** Automaattinen loitonnus (esim. kauas heitetty viehe näkyviin). */
  private autoZoomIndex = 0;
  readonly center: Vec2 = { x: 0, y: 0 };
  /** Keskipiste edellisellä askeleella: piirto liukuu siitä nykyiseen. */
  private readonly prev: Vec2 = { x: 0, y: 0 };
  /** Piirretty keskipiste (askelten väliltä, Retrossa pikselin rajalla). */
  private readonly shown: Vec2 = { x: 0, y: 0 };
  private resolution: RetroResolution = { width: 1, height: 1, scale: 1 };

  constructor() {
    this.camera.up.set(0, 0, -1);
  }

  /** Näkymän leveys sisäisinä pikseleinä. */
  get width(): number {
    return this.resolution.width;
  }

  get metersPerPixel(): number {
    return ZOOM_LEVELS[Math.max(this.zoomIndex, this.autoZoomIndex)]!;
  }

  /** Loitontaa tarvittaessa niin, että annettu alue (m) mahtuu kuvaan. */
  fitSpan(width: number, height: number): void {
    const { width: w, height: h } = this.resolution;
    const need = Math.max(width / w, height / h);
    let i = 0;
    while (i < ZOOM_LEVELS.length - 1 && ZOOM_LEVELS[i]! < need) i++;
    if (i !== this.autoZoomIndex) {
      this.autoZoomIndex = i;
      this.updateProjection();
    }
  }

  setResolution(r: RetroResolution): void {
    this.resolution = r;
    this.updateProjection();
  }

  zoom(steps: number): void {
    this.zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, this.zoomIndex + steps));
    this.updateProjection();
  }

  /** Siirtää kameraa kohti kohdetta (pehmennys 0–1 sekunnissa). */
  follow(target: Vec2, dt: number, stiffness = 6): void {
    this.prev.x = this.center.x;
    this.prev.y = this.center.y;
    const k = 1 - Math.exp(-stiffness * dt);
    this.center.x += (target.x - this.center.x) * k;
    this.center.y += (target.y - this.center.y) * k;
  }

  snapTo(target: Vec2): void {
    this.center.x = this.prev.x = this.shown.x = target.x;
    this.center.y = this.prev.y = this.shown.y = target.y;
  }

  /**
   * Päivitetään ennen piirtoa. `alpha` = osuus askelten välistä (0–1): kamera
   * seuraa kohdetta kiintein askelin, ja ilman liukua kuva nykisi näytöllä,
   * joka piirtää askelta tiheämmin. Retrossa kamera kohdistetaan sisäisen
   * pikselin rajalle, jotta kuva ei väreile; Terävä ja
   * Moderni piirtävät näytön tarkkuudella, ja niissä kamera liukuu portaatta.
   */
  apply(alpha = 1): void {
    const m = this.metersPerPixel;
    const cx = this.prev.x + (this.center.x - this.prev.x) * alpha;
    const cy = this.prev.y + (this.center.y - this.prev.y) * alpha;
    const snap = !smoothLook(activeLook());
    const x = (this.shown.x = snap ? Math.round(cx / m) * m : cx);
    const y = (this.shown.y = snap ? Math.round(cy / m) * m : cy);
    this.camera.position.set(x, 200, -y);
    this.camera.lookAt(x, 0, -y);
  }

  /** Sisäisen resoluution pikseli → pelikoordinaatti vedenpinnalla. */
  internalToWorld(px: number, py: number): Vec2 {
    const m = this.metersPerPixel;
    const { width, height } = this.resolution;
    const { x: cx, y: cy } = this.shown;
    return { x: cx + (px - width / 2) * m, y: cy - (py - height / 2) * m };
  }

  private updateProjection(): void {
    const m = this.metersPerPixel;
    const halfW = (this.resolution.width * m) / 2;
    const halfH = (this.resolution.height * m) / 2;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }
}
