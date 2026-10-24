import type { Vec2 } from '../vec2';

/**
 * Pelin karttamuoto. Koordinaatit ovat metrejä: x = itään, y = pohjoiseen,
 * origona `origin` (ETRS-TM35FIN). Three.js:ssä x = x ja z = -y.
 */
export interface LakeMap {
  name: string;
  /** Lähde ja lisenssi. */
  attribution: string;
  /** Pelikoordinaatiston origo ETRS-TM35FIN-koordinaateissa. */
  origin: { e: number; n: number };
  /** Järven rantaviiva (vastapäivään). */
  shore: Vec2[];
  /** Saarten rantaviivat (myötäpäivään). */
  islands: Vec2[][];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}
