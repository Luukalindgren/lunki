import * as THREE from 'three';
import type { Difficulty, Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import { pixelTexture, type Pixels } from './pixelSprite';

/**
 * Vieheen merkki järvellä (#391): pieni tilan värinen pikselitimantti
 * kiinteässä kuvapistekoossa kaikilla vaikeustasoilla ja molemmissa
 * näkymissä. Terävällä ilmeellä sama timantti on tarkempi (`diamondPixels`).
 */
export const LURE_MARKER = {
  /** Koko kuvapisteinä. */
  markPx: 7,
  /** Merkin korkeus pinnasta (m): silmin aivan pinnassa, ylhäältä veden päällä. */
  povY: 0.06,
  topY: 0.3,
  /** Viehettä seuraavan kalan pyörteet ja pohjan pölläys: realistisella ei. */
  signs: { easy: true, normal: true, realistic: false } satisfies Record<Difficulty, boolean>,
} as const;

/** Merkin paikka: ylhäältä lentokorkeus näkyy siirtymänä pohjoiseen kuten varjosta. */
export function markerPosition(at: Vec2, height: number, pov: boolean): THREE.Vector3 {
  return pov
    ? toWorld(at, LURE_MARKER.povY + height)
    : toWorld({ x: at.x, y: at.y + height * 0.35 }, LURE_MARKER.topY);
}

export interface MarkerInput {
  at: Vec2;
  /** Lentokorkeus (m), vedessä 0. */
  height: number;
  /** Tilan väri (`lureLook`). */
  color: number;
  pov: boolean;
  /** Kuvapisteen koko: ylhäältä metreinä, silmin metreinä metrin päässä kamerasta. */
  pixel: number;
  /**
   * Tärpin nykäys: merkki siirtyy `px` kuvapistettä suuntaan `dir`
   * (yksikkövektori järvellä), silmin se painuu saman verran pinnan alle.
   */
  tug?: { px: number; dir: Vec2 };
}

/** Timantin reunan väri; täyttö on valkoinen ja sävytetään materiaalin värillä. */
const EDGE = 0x1c232b;
/** Terävän timantin kuvapisteitä merkin pikseliä kohden. */
const FINE = 6;

/**
 * Timantti `size` × `size` kuvapisteenä: tumma reuna ja valkoinen täyttö.
 * Retrossa koko on merkin pikselit ja reuna yhden pikselin levyinen. Terävällä
 * sama timantti piirretään tarkempana: reuna on ohut, ja oikea alapuoli on
 * varjossa, jolloin merkki näyttää hiotulta eikä litteältä.
 */
export function diamondPixels(size: number, edge: number, facets: boolean): Pixels {
  const data: number[] = [];
  const c = (size - 1) / 2;
  const reach = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.abs(x - c) + Math.abs(y - c);
      if (d > reach) data.push(-1);
      else if (d > reach - edge) data.push(EDGE);
      else if (!facets) data.push(0xffffff);
      else {
        const lit = x - c + (y - c);
        // Kolme pintaa: valo ylävasemmalta, varjo alaoikealla ja kiilto yläkulmassa.
        const glint = y - c < -reach * 0.25 && Math.abs(x - c + reach * 0.12) < reach * 0.1;
        data.push(
          glint
            ? 0xffffff
            : lit > reach * 0.15
              ? 0xb4b4b4
              : lit > -reach * 0.3
                ? 0xdcdcdc
                : 0xf4f4f4,
        );
      }
    }
  return { width: size, height: size, data };
}

let markTexture: THREE.Texture | null = null;

/** Yhden vieheen merkki. */
export class LureMarker {
  readonly group = new THREE.Group();
  private readonly mark: THREE.Sprite;

  constructor() {
    markTexture ??= pixelTexture(
      diamondPixels(LURE_MARKER.markPx, 1, false),
      diamondPixels(LURE_MARKER.markPx * FINE, FINE * 0.5, true),
    );
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTexture, alphaTest: 0.5 }));
    this.group.name = 'lure-marker';
    this.group.add(this.mark);
    this.group.visible = false;
  }

  /** Näkyykö merkki (testejä varten). */
  get shown(): boolean {
    return this.group.visible;
  }

  hide(): void {
    this.group.visible = false;
  }

  update(m: MarkerInput): void {
    this.group.visible = true;
    const s = this.mark;
    s.position.copy(markerPosition(m.at, m.height, m.pov));
    const tug = m.tug?.px ?? 0;
    if (tug > 0 && !m.pov) {
      s.position.x += m.tug!.dir.x * tug * m.pixel;
      s.position.z -= m.tug!.dir.y * tug * m.pixel;
    }
    // Ylhäältä lentävä viehe kasvaa korkeuden mukaan kuten ennen.
    const size = LURE_MARKER.markPx * m.pixel * (m.pov ? 1 : 1 + m.height * 0.08);
    s.scale.set(size, size, 1);
    // Silmin koko on kuvapisteinä etäisyydestä riippumatta, ylhäältä metreinä.
    if (s.material.sizeAttenuation === m.pov) {
      s.material.sizeAttenuation = !m.pov;
      s.material.needsUpdate = true;
    }
    s.material.color.setHex(m.color);
    // Silmin timantti seisoo pinnalla, ettei aalto peitä sen alaosaa kaukana;
    // tärpissä se painuu nykäyksittäin pinnan alle.
    s.center.set(0.5, m.pov ? tug / LURE_MARKER.markPx : 0.5);
  }
}
