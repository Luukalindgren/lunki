import type { AreaKind, LineKind } from '@lunki/shared';
import { activeLook } from '../engine/look';
import { AREA_COLORS, DEFAULT_GROUND, LINE_COLORS } from '../world/surroundingsMesh';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
const cssAll = <K extends string>(colors: Record<K, number>) =>
  Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, css(v as number)])) as Record<
    K,
    string
  >;

/** Järvikartan värit: pohjakuva, syvyysvyöhykkeet ja kartan päälle piirrettävät merkit. */
export interface MapColors {
  /** Maa, jonka maankäyttöä ei tiedetä. */
  ground: string;
  areas: Record<AreaKind, string>;
  lines: Record<LineKind, string>;
  /** Syvyysvyöhykkeet matalasta syvään (`DEPTH_BANDS`). */
  bands: readonly string[];
  /** Syvyyskäyrän väri vyöhykkeittäin; null = seuraavan vyöhykkeen väri. */
  contours: readonly string[] | null;
  /** Rantaviiva veden reunassa; null = ei viivaa. */
  shore: string | null;
  reeds: readonly [string, string];
  log: string;
  rocks: string;
  /** Tekstit ja mittakaava. */
  text: string;
  /** Tekstin tausta: varjo tai paperin värinen reunus (`halo`). */
  backing: string;
  halo: boolean;
  /** Kartan nimi, luotauskohta ja valittu merkki. */
  highlight: string;
  /** Valittu piste (aloituspaikka). */
  marker: string;
  /** Merkkien ja reittien reunus. */
  edge: string;
  /** Merkit pyöreinä (muuten neliöinä). */
  roundPins: boolean;
}

/** Retron ja Terävän kartta: pelin palettisävyt. */
const RETRO_MAP: MapColors = {
  ground: css(DEFAULT_GROUND),
  areas: cssAll(AREA_COLORS),
  lines: cssAll(LINE_COLORS),
  bands: ['#83c2db', '#4d9cc2', '#2b7aa6', '#1b5a84', '#123a5c', '#0d2238'],
  contours: null,
  shore: null,
  reeds: [css(AREA_COLORS.field), css(AREA_COLORS.reeds)],
  log: '#5e432b',
  rocks: '#c3cbd2',
  text: '#eef2f3',
  backing: '#0b0f14',
  halo: false,
  highlight: '#fff3b0',
  marker: '#f6d04d',
  edge: '#0b0f14',
  roundPins: false,
};

/**
 * Modernin kartta on eräkartta (#650): paperin värinen maa, haaleat metsät ja
 * pellot, sinivihreä vesi, jonka syvyyskäyrät ja rantaviiva on vedetty
 * musteella, ja tekstit musteella paperin värisellä reunuksella. Sävyt ovat
 * teeman (`modern/theme.css`: paperi, muste, ruoste) ja Modernin veden
 * (`MODERN_DEPTH`) mukaiset.
 */
const MODERN_MAP: MapColors = {
  ground: '#e6dcb9',
  areas: {
    forest: '#c5d2a2',
    field: '#eee0a0',
    residential: '#ead9bc',
    wetland: '#bfd3b4',
    reeds: '#a9bd78',
    scrub: '#d6dcae',
    beach: '#f6ecc8',
    bare: '#d9d0ba',
    water: '#a5cdcc',
    building: '#8a2a22',
    pier: '#6e4c2c',
  },
  lines: {
    road: '#a8693a',
    track: '#9a7a4e',
    path: '#a8966a',
    pier: '#6e4c2c',
    stream: '#5a9ba3',
  },
  bands: ['#d3e8df', '#abd4cd', '#80bcba', '#5a9da6', '#3a7a8c', '#235669'],
  contours: ['#7fb0ac', '#63a09f', '#44868b', '#2c6676', '#1c4b5d', '#123746'],
  shore: '#2a5560',
  reeds: ['#8fa85e', '#6f8f4a'],
  log: '#6e4c2c',
  rocks: '#5c5a4c',
  text: '#24362a',
  backing: '#fbf6e6',
  halo: true,
  highlight: '#8a2a22',
  marker: '#8a2a22',
  edge: '#fbf6e6',
  roundPins: true,
};

/** Järvikartan värit käytössä olevan ilmeen mukaan. */
export const mapColors = (): MapColors => (activeLook() === 'modern' ? MODERN_MAP : RETRO_MAP);
