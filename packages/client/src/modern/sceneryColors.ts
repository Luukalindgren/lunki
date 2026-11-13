import type { AreaKind, LineKind, Season } from '@lunki/shared';

/**
 * Modernin ilmeen (#650, tyyli "Maalattu") maiseman värit vuodenajan mukaan.
 * Sävyjä ei pyöristetä palettiin, joten ne ovat vaaleampia ja lämpimämpiä
 * kuin Retron (`world/seasonColors.ts`). Jokainen lista on tummasta vaaleaan
 * tai kuten kentän kuvaus kertoo.
 */
export interface SceneryColors {
  /** Kuusen havut: tyven tumma, keskisävy, valoisa kärki ja helman alapinta. */
  spruce: [number, number, number, number];
  /** Männyn latvus: kolme valoisaa sävyä ja varjon sävy. */
  pine: [number, number, number, number];
  /** Koivun lehvästö: neljä sävyä, joista kumpare saa yhden. */
  birch: [number, number, number, number];
  /** Koivun latvuksen koko suhteessa kesään (keväällä lehdet ovat pieniä). */
  birchCrown: number;
  trunk: { spruce: number; pine: [number, number]; birch: number };
  /** Ranta vedestä maalle: hiekka, rantaniitty, nurmi ja metsänpohja. */
  shore: [number, number, number, number];
  rock: [number, number, number];
  /** Kaislan ja rantaheinän lehti: tyvi ja kärki. */
  reed: [number, number];
  grass: [number, number];
  /** Kaislikko ylhäältä: neljä korren sävyä. */
  reedBed: [string, string, string, string];
  /** Maankäytön värit maastossa; puuttuva on `ground`. */
  areas: Partial<Record<AreaKind, number>>;
  ground: number;
  lines: Record<Exclude<LineKind, 'pier'>, number>;
}

const SUMMER: SceneryColors = {
  spruce: [0x2f6b4a, 0x3d7f55, 0x57976a, 0x24553c],
  pine: [0x4f8a52, 0x67a05c, 0x86b56a, 0x3c7046],
  birch: [0x9cc75a, 0xb7d86c, 0x86b34c, 0xd0e58a],
  birchCrown: 1,
  trunk: { spruce: 0x5a4636, pine: [0x6e5546, 0xc77c4c], birch: 0xf0ece0 },
  shore: [0xb9ad8e, 0x9dbb62, 0x5f8a4a, 0x4a7446],
  rock: [0x8d8a92, 0xa29ea3, 0x77768a],
  reed: [0x5c8a44, 0xc8d27a],
  grass: [0x5f8f46, 0xb4cf70],
  reedBed: ['#c8d27a', '#8fb257', '#5c8a44', '#e6dca6'],
  areas: {
    forest: 0x3f6f47,
    field: 0xa9c267,
    residential: 0x8cb062,
    wetland: 0x7f9c56,
    reeds: 0xa8b964,
    scrub: 0x6c9450,
    beach: 0xdccf9f,
    bare: 0x9a968f,
    water: 0x2f6f84,
  },
  ground: 0x5f8a4a,
  lines: { road: 0xc9b48a, track: 0xa58a62, path: 0xd8c9a0, stream: 0x3f8aa0 },
};

export const SCENERY_COLORS: Record<Season, SceneryColors> = {
  summer: SUMMER,
  // Toukokuun alku: koivuissa hiirenkorvat, maa ja kaislat viime vuoden vaaleita.
  spring: {
    ...SUMMER,
    birch: [0xb9d27a, 0xcfe08e, 0xa3bf68, 0xe0eaa6],
    birchCrown: 0.72,
    shore: [0xbdb090, 0xb8ae78, 0x8f9a5c, 0x6f7f52],
    reed: [0xb99a68, 0xe6d9a8],
    grass: [0x9a9a5c, 0xd8d09a],
    reedBed: ['#e6d9a8', '#c9b27e', '#a58a5a', '#b7d27a'],
    areas: {
      ...SUMMER.areas,
      forest: 0x56704a,
      field: 0xa08a5c,
      residential: 0x9aa868,
      wetland: 0xb39e6c,
      reeds: 0xdccf9f,
      scrub: 0x94895c,
    },
    ground: 0x8c8a58,
  },
  // Lokakuun alku: koivut keltaisia ja oransseja, havut oliiveja ja maa kellastunut.
  autumn: {
    ...SUMMER,
    spruce: [0x38664a, 0x477852, 0x5e8c62, 0x2a503c],
    pine: [0x577f4c, 0x6e9456, 0x8aa864, 0x436844],
    birch: [0xe6b84a, 0xf2cf5c, 0xd9953c, 0xf6e07a],
    shore: [0xbdb090, 0xb8ac62, 0x8f8e4a, 0x7a7a44],
    reed: [0xa58a52, 0xe0cf9c],
    grass: [0x9a904a, 0xdcc878],
    reedBed: ['#e0cf9c', '#c2a868', '#9a7e4a', '#f0d266'],
    areas: {
      ...SUMMER.areas,
      forest: 0x6f7a42,
      field: 0xc2aa6a,
      residential: 0xa8a45c,
      wetland: 0x9a7e4a,
      reeds: 0xdccf9f,
      scrub: 0xb39a5a,
    },
    ground: 0x94893f,
  },
  // Pilkkikauteen (#140) asti kesän värit: talvi ei ole vielä valittavissa.
  winter: SUMMER,
};
