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

/** Ympäristön aluetyypit (maankäyttö ja rakennukset). */
export type AreaKind =
  | 'forest'
  | 'field'
  | 'residential'
  | 'wetland'
  | 'reeds'
  | 'scrub'
  | 'beach'
  | 'bare'
  | 'water'
  | 'building'
  | 'pier';

export type LineKind = 'road' | 'track' | 'path' | 'pier' | 'stream';

/**
 * Järven ympäristö pelin koordinaateissa: maankäyttöalueet, rakennukset,
 * tiet ja maaston korkeus. Generoidaan karttaputkella (#19).
 */
export interface LakeSurroundings {
  attribution: string[];
  /** Alueet: ensimmäinen rengas on ulkoreuna, loput reikiä. */
  areas: { kind: AreaKind; name?: string; rings: Vec2[][] }[];
  lines: { kind: LineKind; name?: string; points: Vec2[] }[];
  /** Maaston korkeus (m) järven pinnasta, säännöllinen ruudukko; null jos ei aineistoa. */
  terrain: {
    minX: number;
    minY: number;
    cell: number;
    cols: number;
    rows: number;
    /** Järven pinnan korkeus merenpinnasta (m). */
    waterLevel: number;
    /** Riveittäin etelästä pohjoiseen, länsi → itä, metreinä (0,1 m tarkkuus). */
    heights: number[];
  } | null;
}
