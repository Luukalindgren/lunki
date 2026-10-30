import * as THREE from 'three';
import type { Difficulty, Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import { pixelArt, pixelTexture } from './pixelSprite';

/**
 * Vieheen merkki järvellä (#391): pieni tilan värinen pikselitimantti
 * kiinteässä kuvapistekoossa kaikilla vaikeustasoilla ja molemmissa
 * näkymissä.
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

/** Timantti valkoisena (sävytetään materiaalin värillä) tummalla reunalla. */
const MARK = ['...o...', '..o#o..', '.o###o.', 'o#####o', '.o###o.', '..o#o..', '...o...'];
let markTexture: THREE.Texture | null = null;

/** Yhden vieheen merkki. */
export class LureMarker {
  readonly group = new THREE.Group();
  private readonly mark: THREE.Sprite;

  constructor() {
    markTexture ??= pixelTexture(pixelArt(MARK, 0xffffff, 0x1c232b));
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTexture, alphaTest: 0.5 }));
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
