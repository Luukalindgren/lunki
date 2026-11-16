import type { AreaKind, LineKind } from '@lunki/shared';
import { activeLook } from '../engine/look';
import { AREA_COLORS, DEFAULT_GROUND, LINE_COLORS } from '../world/surroundingsMesh';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
const cssAll = <K extends string>(colors: Record<K, number>) =>
  Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, css(v as number)])) as Record<
    K,
    string
  >;

export type TreeKind = 'spruce' | 'pine' | 'birch';

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
  /**
   * Rannan puiden latvukset (kuusi, mänty, koivu) pelin puiden paikoilla
   * (`planVegetation`); null = puita ei piirretä.
   */
  trees: Record<TreeKind, string> | null;
  log: string;
  rocks: string;
  /** Tekstit ja mittakaava. */
  text: string;
  /** Tekstin tausta: varjo tai reunus (`halo`). */
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
  trees: null,
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
 * Modernin kartta on järvi ylhäältä sellaisena kuin se näkyy kisassa
 * kesäpäivänä (kisan oletus): tumma sinivihreä vesi, jonka matala ranta on
 * vaalea ja syvyyskäyrät ohuita vaaleita viivoja, vihreä maa ja rannan puut
 * latvuksina. Sävyt on poimittu pelin kuvasta, koska sävytys (`SkyView.grade`)
 * ja valo muuttavat taulukoiden (`SCENERY_COLORS`, `MODERN_DEPTH`) värejä.
 * Tekstit ovat vaaleita tummalla reunuksella, kuten nimet järvellä.
 */
const MODERN_MAP: MapColors = {
  ground: '#3a6a2e',
  areas: {
    forest: '#37662e',
    field: '#758e35',
    residential: '#557c2c',
    wetland: '#4f7030',
    reeds: '#6f8c3a',
    scrub: '#44702c',
    beach: '#a39a5c',
    bare: '#6d7150',
    water: '#266764',
    building: '#b5482e',
    pier: '#8a6a44',
  },
  lines: {
    road: '#588230',
    track: '#4c782e',
    path: '#4a742e',
    pier: '#8a6a44',
    stream: '#2b6f6c',
  },
  bands: ['#3c766b', '#2b625a', '#225550', '#1a4844', '#133c3b', '#0b3335'],
  contours: ['#5c9688', '#4a8277', '#3f756d', '#356862', '#2c5c58', '#245150'],
  shore: '#8fa457',
  reeds: ['#9fb658', '#6f9440'],
  trees: { spruce: '#285a2a', pine: '#34662c', birch: '#7ea233' },
  log: '#8a6a44',
  rocks: '#b9c0b4',
  text: '#f6efd8',
  backing: '#0a2424',
  halo: true,
  highlight: '#ffe9a0',
  marker: '#ffe9a0',
  edge: '#0a2424',
  roundPins: true,
};

/** Järvikartan värit käytössä olevan ilmeen mukaan. */
export const mapColors = (): MapColors => (activeLook() === 'modern' ? MODERN_MAP : RETRO_MAP);
