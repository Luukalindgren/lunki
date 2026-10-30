import type { AreaKind, Season } from '@lunki/shared';

/**
 * Maiseman värit vuodenajan mukaan (#427); paletti pyöristää ne. Kesä on
 * pelin alkuperäinen ilme. Keväällä lehtipuut ovat paljaita ja viime vuoden
 * heinät ja kaislat vaaleita, syksyllä ruska on pehmeä ja maassa on
 * keltaisia lehtiä. Talvi tulee pilkkikauden mukana (#140).
 */
export interface SeasonColors {
  /** Maankäyttöalueet, jotka poikkeavat kesästä. */
  areas: Partial<Record<AreaKind, number>>;
  /** Maaston väri, kun maankäyttöä ei tiedetä. */
  ground: number;
  /** Saarten matala maakansi (lakeMesh). */
  island: number;
  /** Rannan metsänreunan sävyt (shoreScenery). */
  treeLine: { dark: number; mid: number; birch: number };
  /** Kuusen latvus: valoisa ja varjon puoli. */
  spruce: [string, string];
  /** Männyn latvus: vaalea (30 %) ja tumma. */
  pine: [string, string];
  /** Koivun latvuksen pikseli satunnaisluvusta 0–1. */
  birchLeaf: (r: number) => string;
  /** Näin suuri osa koivun latvuksen pikseleistä jää tyhjäksi. */
  birchGap: number;
  /** Kaislan korsi satunnaisluvusta 0–1. */
  reed: (r: number) => string;
  /** Osuus korsista, jotka ovat matalia vihreitä versoja ilman tähkää. */
  freshReeds: number;
  /** Kaislikko ylhäältä (lakeMesh): latva, kaksi korren sävyä ja harva vaalea korsi. */
  reedsTop: [string, string, string, string];
}

const SUMMER: SeasonColors = {
  areas: {},
  ground: 0x3b7337,
  island: 0x2d5a30,
  treeLine: { dark: 0x1f3d22, mid: 0x2d5a2c, birch: 0x4d7a3a },
  spruce: ['#2d5a2c', '#1f3d22'],
  pine: ['#3b7337', '#24502c'],
  birchLeaf: (r) => (r < 0.4 ? '#6a9a3e' : '#4d7a3a'),
  birchGap: 0.25,
  reed: (r) => (r < 0.5 ? '#a3c45a' : '#7a9a3e'),
  freshReeds: 0,
  reedsTop: ['#a3c45a', '#6a9a3e', '#3b7337', '#e0cf9c'],
};

export const SEASON_COLORS: Record<Season, SeasonColors> = {
  summer: SUMMER,
  // Toukokuun alku: paljaat koivut (vain harvoja hiirenkorvia), vaalea
  // viimevuotinen heinä ja kaisla, jonka juurella uudet versot.
  spring: {
    areas: {
      field: 0x8a6a42,
      reeds: 0xe0cf9c,
      wetland: 0xb99a68,
      scrub: 0x8a7a52,
      forest: 0x3b4a2c,
    },
    ground: 0x8a7a52,
    island: 0x6b5a3a,
    treeLine: { dark: 0x1f3d22, mid: 0x3e4a36, birch: 0x7a6a58 },
    spruce: SUMMER.spruce,
    pine: SUMMER.pine,
    birchLeaf: (r) => (r < 0.15 ? '#a3c45a' : r < 0.6 ? '#5e432b' : '#8a6a42'),
    birchGap: 0.55,
    reed: (r) => (r < 0.6 ? '#e0cf9c' : '#b99a68'),
    freshReeds: 0.35,
    reedsTop: ['#e0cf9c', '#b99a68', '#8a6a42', '#a3c45a'],
  },
  // Lokakuun alku: ruskea-keltainen ruska, oliivit havupuut ja kellastunut
  // maa. Kirkkaat keltaiset ja oranssit vain pilkkuina, ettei kontrasti kasva.
  autumn: {
    areas: {
      field: 0xb99a68,
      reeds: 0xe0cf9c,
      wetland: 0x8a6a42,
      scrub: 0xb99a68,
      forest: 0xa89048,
    },
    ground: 0xa08a3e,
    island: 0x8a6a42,
    treeLine: { dark: 0x1f3d22, mid: 0x6a6a34, birch: 0xa89048 },
    spruce: ['#4a5a2c', '#2d3d22'],
    pine: ['#3b5a2c', '#24502c'],
    birchLeaf: (r) =>
      r < 0.2 ? '#f6d04d' : r < 0.65 ? '#b99a68' : r < 0.8 ? '#f08a2c' : '#8a6a42',
    birchGap: 0.25,
    reed: (r) => (r < 0.5 ? '#b99a68' : '#e0cf9c'),
    freshReeds: 0,
    reedsTop: ['#e0cf9c', '#b99a68', '#8a6a42', '#f6d04d'],
  },
  // Pilkkikauteen asti kesän värit (talvi ei ole vielä valittavissa).
  winter: SUMMER,
};
