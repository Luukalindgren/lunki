import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import { LURE_MARKER } from './lureMarker';
import { pixelTexture, type Pixels } from './pixelSprite';

/**
 * Ongen koho järvellä (#570) vieheen merkin paikalla: kalastajan silmin
 * sivulta nähty koho (keltainen antenni, punainen yläpää ja valkoinen
 * alapää), ylhäältä punainen nuppi. Koho kertoo tärpin itse: näykinnässä se
 * nytkähtää ja viennissä painuu pinnan alle ja kulkee kalan mukana.
 */
export const FLOAT_MARKER = {
  /** Sivukuvan koko kuvapisteinä (leveys × korkeus) ja ylhäältä nähty koko. */
  sideW: 5,
  sideH: 11,
  topPx: 6,
  /** Osuus kohosta pinnan alla levossa: alapää on vedessä. */
  rest: 0.3,
  /** Näykkäisy painaa kohoa tämän osuuden ja kestää näin kauan (s). */
  nibble: 0.25,
  nibbleTime: 0.3,
  /** Viennissä koho on lähes kokonaan pinnan alla. */
  run: 0.85,
  /** Viennissä koho kulkee kuvapisteinä poispäin kalastajasta. */
  runPx: 2,
  /** Ylhäältä painunut koho näkyy tummempana. */
  sunkTint: 0x5f6b78,
  /**
   * Koho makaa kyljellään, kun syötti on tätä enemmän (m) säädettyä kohon
   * syvyyttä ylempänä (#799): paino on pohjassa tai vasta vajoamassa, eikä
   * koho nouse pystyyn. Tärpissä koho nousee pystyyn ja painuu.
   */
  lieGap: 0.1,
} as const;

const EDGE = 0x1c232b;
const RED = 0xd23a2a;
const WHITE = 0xeef2f3;
const ANTENNA = 0xf6d04d;
/** Terävän kohon kuvapisteitä pikseliä kohden. */
const FINE = 6;

/**
 * Sivulta nähty koho `scale`-kertaisena: antenni ylhäällä ja pisaran muotoinen
 * runko, jonka yläpuoli on punainen ja alapuoli valkoinen. Terävällä sama muoto
 * lasketaan tarkempana, ja reuna on ohut.
 */
export function floatSidePixels(scale = 1): Pixels {
  const w = FLOAT_MARKER.sideW * scale;
  const h = FLOAT_MARKER.sideH * scale;
  const data: number[] = [];
  const edge = scale === 1 ? 1 : scale * 0.5;
  const cx = w / 2;
  // Runko riveillä 3–11 (pikseleinä), leveimmillään kolmanneksen kohdalla.
  const top = 3 * scale;
  const inBody = (x: number, y: number) => {
    const k = (y - top) / (h - top);
    if (k < 0 || k > 1) return false;
    const half = (w / 2) * Math.sin(Math.PI * Math.min(1, k * 1.35 + 0.05));
    return Math.abs(x - cx) <= half;
  };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = i + 0.5;
      const y = j + 0.5;
      if (y < top) {
        const near = Math.abs(x - cx) <= Math.max(0.5, scale * 0.35);
        data.push(near ? ANTENNA : -1);
        continue;
      }
      if (!inBody(x, y)) {
        data.push(-1);
        continue;
      }
      const border =
        !inBody(x - edge, y) || !inBody(x + edge, y) || !inBody(x, y + edge) || y < top + edge;
      data.push(border ? EDGE : y < top + (h - top) * 0.45 ? RED : WHITE);
    }
  return { width: w, height: h, data };
}

/** Ylhäältä nähty koho: punainen nuppi, keltainen antenni keskellä ja tumma reuna. */
export function floatTopPixels(scale = 1): Pixels {
  const size = FLOAT_MARKER.topPx * scale;
  const c = size / 2;
  const data: number[] = [];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const r = Math.hypot(i + 0.5 - c, j + 0.5 - c);
      data.push(
        r > c
          ? -1
          : r > c - (scale === 1 ? 1 : scale * 0.5)
            ? EDGE
            : r < scale * 0.9
              ? ANTENNA
              : RED,
      );
    }
  return { width: size, height: size, data };
}

let side: THREE.Texture | null = null;
let top: THREE.Texture | null = null;

export interface FloatInput {
  at: Vec2;
  /** Lentokorkeus (m), vedessä 0. */
  height: number;
  pov: boolean;
  /** Kuvapisteen koko: ylhäältä metreinä, silmin metreinä metrin päässä kamerasta. */
  pixel: number;
  /** Kuinka syvällä koho on: 0 = levossa pinnalla, 1 = kokonaan pinnan alla. */
  dip: number;
  /** Viennin suunta (yksikkövektori järvellä) ja siirtymä kuvapisteinä. */
  pull?: { px: number; dir: Vec2 };
  /**
   * Koho makaa kyljellään siiman suuntaisena (yksikkövektori järvellä), kun
   * syötti on pohjassa (#799). Vain levossa: tärpissä koho nousee pystyyn.
   */
  lie?: Vec2;
}

/** Oman ja muiden pelaajien koho. */
export class FloatMarker {
  readonly group = new THREE.Group();
  private readonly sprite: THREE.Sprite;

  constructor() {
    side ??= pixelTexture(floatSidePixels(), floatSidePixels(FINE));
    top ??= pixelTexture(floatTopPixels(), floatTopPixels(FINE));
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: side, alphaTest: 0.5 }));
    this.group.name = 'pole-float';
    this.group.add(this.sprite);
    this.group.visible = false;
  }

  get shown(): boolean {
    return this.group.visible;
  }

  hide(): void {
    this.group.visible = false;
  }

  update(m: FloatInput): void {
    this.group.visible = true;
    const s = this.sprite;
    const mat = s.material;
    const map = m.pov ? side! : top!;
    if (mat.map !== map) {
      mat.map = map;
      mat.needsUpdate = true;
    }
    if (mat.sizeAttenuation === m.pov) {
      mat.sizeAttenuation = !m.pov;
      mat.needsUpdate = true;
    }
    const dip = Math.max(0, Math.min(1, m.dip));
    const lie = m.lie && dip === 0 && m.height <= 0 && !m.pull ? m.lie : null;
    // Kyljellään makaavan kohon suunta (Moderni kääntää mallinsa samoin).
    this.group.userData.lie = lie ? Math.atan2(lie.y, lie.x) : null;
    if (lie) {
      // Kyljellään ylhäältäkin näkyy kohon sivu siiman suuntaisena.
      if (mat.map !== side) {
        mat.map = side!;
        mat.needsUpdate = true;
      }
      mat.rotation = m.pov ? Math.PI / 2 : Math.atan2(lie.y, lie.x) - Math.PI / 2;
      mat.color.setHex(0xffffff);
      s.center.set(0.5, 0.5);
      if (m.pov) {
        // Silmin koho on vaakatasossa puoliksi vedessä.
        s.position.copy(toWorld(m.at, 0.02));
        s.scale.set(FLOAT_MARKER.sideW * m.pixel, FLOAT_MARKER.sideH * m.pixel, 1);
      } else {
        s.position.copy(toWorld(m.at, LURE_MARKER.topY));
        const k = (FLOAT_MARKER.topPx / FLOAT_MARKER.sideW) * m.pixel;
        s.scale.set(FLOAT_MARKER.sideW * k, FLOAT_MARKER.sideH * k, 1);
      }
      return;
    }
    mat.rotation = 0;
    if (m.pov) {
      // Silmin koho seisoo pinnalla alapää vedessä, ja painuessaan se uppoaa.
      s.position.copy(toWorld(m.at, m.height + 0.02));
      s.scale.set(FLOAT_MARKER.sideW * m.pixel, FLOAT_MARKER.sideH * m.pixel, 1);
      s.center.set(0.5, m.height > 0 ? 0.5 : FLOAT_MARKER.rest + dip * (1 - FLOAT_MARKER.rest));
      mat.color.setHex(0xffffff);
    } else {
      s.position.copy(toWorld({ x: m.at.x, y: m.at.y + m.height * 0.35 }, LURE_MARKER.topY));
      const size = FLOAT_MARKER.topPx * m.pixel * (1 + m.height * 0.08) * (1 - dip * 0.35);
      s.scale.set(size, size, 1);
      s.center.set(0.5, 0.5);
      mat.color.setHex(dip > 0.5 ? FLOAT_MARKER.sunkTint : 0xffffff);
    }
    const pull = m.pull?.px ?? 0;
    if (pull > 0) {
      // Silmin siirtymä on metreinä (kuvapisteen kymmenyksiä), ylhäältä kuvapisteinä.
      const k = m.pov ? 0.12 : m.pixel;
      s.position.x += m.pull!.dir.x * pull * k;
      s.position.z -= m.pull!.dir.y * pull * k;
    }
  }
}
