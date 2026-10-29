import * as THREE from 'three';
import { distance, type Difficulty, type Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import { LURE_FRAMES, lurePixels, type LureArtId } from '../ui/lureArt';
import { LURE_DEEP, lureColor } from './lureColor';
import { pixelArt, pixelTexture } from './pixelSprite';

/**
 * Vieheen merkki järvellä kalastuksen vaikeustason mukaan (#391). Helpolla
 * merkki on pelimerkki, normaalilla kalastaja seuraa siiman vesirajaa ja näkee
 * vieheen vain läheltä ja matalalta, realistisella silmin näkyy vain siima.
 */
export const LURE_MARKER = {
  /** Normaalilla viehe näkyy silmin, kun se on näin matalalla (m) tai lähellä (m). */
  seeDepth: 0.6,
  seeRange: 6,
  /** Koot kuvapisteinä. */
  markPx: 7,
  dotPx: 5,
  imagePx: 16,
  foamPx: 3,
  /** Liikkuva viehe (m/s) jättää vanan ja uintiliikkeen. */
  moving: 0.05,
  /** Uintiliikkeen tahti (kuvaa/s). */
  fps: 10,
  /** Syvällä vieheen kuva tummuu tähän kirkkauteen. */
  deepShade: 0.55,
  /** Merkin korkeus pinnasta (m): silmin aivan pinnassa, ylhäältä veden päällä. */
  povY: 0.06,
  topY: 0.3,
  /** Viehettä seuraavan kalan pyörteet ja pohjan pölläys: realistisella ei. */
  signs: { easy: true, normal: true, realistic: false } satisfies Record<Difficulty, boolean>,
} as const;

/** Mitkä merkin osat näkyvät. */
export interface MarkerParts {
  /** Tilan värinen pikselitimantti (helppo). */
  mark: boolean;
  /** Vieheen oma pikselikuva. */
  image: boolean;
  /** Siiman vesiraja silmin: vaahtopiste ja liikkuvalla vieheellä V-vana. */
  entry: boolean;
  /** Pieni neutraali merkki (realistinen ylhäältä). */
  dot: boolean;
}

/**
 * Merkin osat: helpolla tilan värinen merkki aina; normaalilla ylhäältä
 * vieheen kuva ja silmin vesiraja sekä kuva läheltä ja matalalta;
 * realistisella ylhäältä pieni merkki ja silmin vain maalle jäänyt viehe.
 */
export function markerParts(
  difficulty: Difficulty,
  pov: boolean,
  l: { depth: number; range: number; onLand: boolean; flying: boolean },
): MarkerParts {
  const parts = { mark: false, image: false, entry: false, dot: false };
  if (difficulty === 'easy') return { ...parts, mark: true };
  if (!pov) return difficulty === 'normal' ? { ...parts, image: true } : { ...parts, dot: true };
  if (difficulty === 'realistic') return { ...parts, image: l.onLand };
  const seen = l.onLand || l.depth <= LURE_MARKER.seeDepth || l.range <= LURE_MARKER.seeRange;
  return { ...parts, image: seen, entry: !l.onLand && !l.flying };
}

/** Merkin paikka: ylhäältä lentokorkeus näkyy siirtymänä pohjoiseen kuten varjosta. */
export function markerPosition(at: Vec2, height: number, pov: boolean): THREE.Vector3 {
  return pov
    ? toWorld(at, LURE_MARKER.povY + height)
    : toWorld({ x: at.x, y: at.y + height * 0.35 }, LURE_MARKER.topY);
}

/** Vieheen kuvan kirkkaus syvyyden mukaan (1 = pinnassa). */
export function lureShade(depth: number): number {
  const k = Math.min(1, Math.max(0, depth) / LURE_DEEP);
  return 1 - (1 - LURE_MARKER.deepShade) * k;
}

export interface MarkerInput {
  at: Vec2;
  /** Lentokorkeus (m), vedessä 0. */
  height: number;
  depth: number;
  /** Kalastajan paikka: etäisyys ja uintisuunta. */
  from: Vec2;
  onLand: boolean;
  flying: boolean;
  moving: boolean;
  /** Tilan väri (`lureLook`). */
  color: number;
  /** Vieheen kuva; null = ei tiedossa (muut pelaajat), kuvan tilalla pieni merkki. */
  art: LureArtId | null;
  difficulty: Difficulty;
  pov: boolean;
  /** Kuvapisteen koko: ylhäältä metreinä, silmin metreinä metrin päässä kamerasta. */
  pixel: number;
}

const OUTLINE = 0x1c232b;
const FOAM = 0xe6f2ff;
/** Tilan värinen timantti (valkoinen sävytetään materiaalin värillä) ja pieni merkki. */
const MARK = ['...o...', '..o#o..', '.o###o.', 'o#####o', '.o###o.', '..o#o..', '...o...'];
const DOT = ['..o..', '.o#o.', 'o###o', '.o#o.', '..o..'];
const FOAM_DOT = ['.#.', '###', '.#.'];
/** V-vana vieheen takana: kärki vaahtopisteessä, haarat kalastajasta poispäin. */
const WAKE = ['#.........#', '.#.......#.', '..##...##..', '....#.#....'];

let shared: Record<'mark' | 'dot' | 'foam' | 'wake', THREE.Texture> | null = null;
const textures = () =>
  (shared ??= {
    mark: pixelTexture(pixelArt(MARK, 0xffffff, OUTLINE)),
    dot: pixelTexture(pixelArt(DOT, 0xffffff, OUTLINE)),
    foam: pixelTexture(pixelArt(FOAM_DOT, FOAM)),
    wake: pixelTexture(pixelArt(WAKE, FOAM)),
  });
const images = new Map<string, THREE.Texture>();
function lureTexture(id: LureArtId, frame: number): THREE.Texture {
  const key = `${id}:${frame}`;
  let tex = images.get(key);
  if (!tex) images.set(key, (tex = pixelTexture(lurePixels(id, frame))));
  return tex;
}

const sprite = (map: THREE.Texture | null = null) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map, alphaTest: 0.5 }));

/** Yhden vieheen merkki: osat pikselikuvina kiinteässä kuvapistekoossa. */
export class LureMarker {
  readonly group = new THREE.Group();
  private readonly mark: THREE.Sprite;
  private readonly dot: THREE.Sprite;
  private readonly image = sprite();
  private readonly foam: THREE.Sprite;
  private readonly wake: THREE.Sprite;

  constructor() {
    const t = textures();
    this.mark = sprite(t.mark);
    this.dot = sprite(t.dot);
    this.dot.material.color.setHex(lureColor(0));
    this.foam = sprite(t.foam);
    this.wake = sprite(t.wake);
    this.wake.center.set(0.5, 0);
    this.group.add(this.mark, this.dot, this.image, this.foam, this.wake);
    this.group.visible = false;
  }

  /** Näkyvät osat (testejä ja kuvia varten). */
  get shown(): MarkerParts & { wake: boolean } {
    const v = this.group.visible;
    return {
      mark: v && this.mark.visible,
      image: v && this.image.visible,
      entry: v && this.foam.visible,
      dot: v && this.dot.visible,
      wake: v && this.wake.visible,
    };
  }

  hide(): void {
    this.group.visible = false;
  }

  update(m: MarkerInput): void {
    this.group.visible = true;
    const parts = markerParts(m.difficulty, m.pov, {
      depth: m.depth,
      range: distance(m.at, m.from),
      onLand: m.onLand,
      flying: m.flying,
    });
    if (parts.image && m.art === null) {
      parts.image = false;
      parts.dot = true;
    }
    const at = markerPosition(m.at, m.height, m.pov);
    const grow = m.pov ? 1 : 1 + m.height * 0.08;
    const place = (s: THREE.Sprite, show: boolean, w: number, h = w) => {
      s.visible = show;
      if (!show) return;
      s.position.copy(at);
      s.scale.set(w * m.pixel * grow, h * m.pixel * grow, 1);
      // Silmin koko on kuvapisteinä etäisyydestä riippumatta, ylhäältä metreinä.
      if (s.material.sizeAttenuation === m.pov) {
        s.material.sizeAttenuation = !m.pov;
        s.material.needsUpdate = true;
      }
    };
    place(this.mark, parts.mark, LURE_MARKER.markPx);
    this.mark.material.color.setHex(m.color);
    place(this.dot, parts.dot, LURE_MARKER.dotPx);
    place(this.foam, parts.entry, LURE_MARKER.foamPx);
    place(this.wake, parts.entry && m.moving, WAKE[0]!.length, WAKE.length);
    const size = LURE_MARKER.imagePx;
    place(this.image, parts.image, size, size / 2);
    if (parts.image && m.art !== null) {
      const frame = m.moving ? Math.floor((performance.now() / 1000) * LURE_MARKER.fps) : 0;
      const tex = lureTexture(m.art, frame % LURE_FRAMES);
      const mat = this.image.material;
      if (mat.map !== tex) {
        mat.map = tex;
        mat.needsUpdate = true;
      }
      // Erikoistila (pohja, rikka, tartunta) sävyttää kuvan, muuten syvyys tummentaa.
      const special = m.color !== lureColor(m.depth, m.onLand);
      if (special) mat.color.setHex(m.color);
      else mat.color.setScalar(lureShade(m.depth));
      // Kuvassa kärki on vasemmalla: ylhäältä viehe ui kalastajaa kohti.
      mat.rotation = m.pov ? 0 : Math.atan2(m.from.y - m.at.y, m.from.x - m.at.x) - Math.PI;
    }
  }
}
