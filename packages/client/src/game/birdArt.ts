import type { Pixels } from './pixelSprite';
import type { BirdKind } from './birdPose';

/**
 * Lintujen pikselikuvat (#571, #572) paletin väreillä. Ylhäältä kuva
 * osoittaa ylös (pohjoiseen) ja kääntyy kulkusuuntaan, silmin kuva on
 * sivulta oikealle päin ja peilataan. Yksi kuvapiste on `BIRD_PX` metriä,
 * joten linnut ovat oikean kokoisia: sorsa puoli metriä, joutsen puolitoista.
 */
export const BIRD_PX = 0.1;

const C: Record<string, number> = {
  W: 0xeef2f3, // valkoinen
  L: 0xc3cbd2, // vaaleanharmaa
  G: 0x8e99a4, // harmaa
  S: 0x5f6b78, // tummanharmaa
  D: 0x1c232b, // lähes musta
  K: 0x0b0f14, // musta
  B: 0x5e432b, // ruskea
  b: 0x8a6a42, // vaaleanruskea
  T: 0xb99a68, // kellanruskea
  g: 0x24502c, // sorsakoiraan vihreä pää
  Y: 0xf6d04d, // keltainen nokka
  O: 0xf08a2c, // oranssi nokka
  R: 0xd23a2a, // tiiran punainen nokka
  F: 0x5f6b78, // sääksen kynsissä kala
};

/** Pikselikuva merkkijonoista: kirjain = väri taulukosta `C`, piste = läpinäkyvä. */
export function birdPixels(rows: readonly string[]): Pixels {
  const width = Math.max(...rows.map((r) => r.length));
  const data: number[] = [];
  for (const row of rows) for (let i = 0; i < width; i++) data.push(C[row[i] ?? '.'] ?? -1);
  return { width, height: rows.length, data };
}

export interface BirdFrames {
  /** Ylhäältä: uiva tai siivet levällään ja alhaalla (lento). */
  top: readonly (readonly string[])[];
  /** Sivulta: uiva tai siivet ylhäällä ja alhaalla (lento). */
  side: readonly (readonly string[])[];
}

const MALLARD_FLY: BirdFrames = {
  top: [
    ['....O....', '....g....', 'BB.GGG.BB', 'BBBGGGBBB', '...GGG...', '....K....'],
    ['....O....', '....g....', '..BGGGB..', '.BBGGGBB.', '...GGG...', '....K....'],
  ],
  side: [
    ['...BB....', '....BB...', '.....Bgg.', '.GGGGGggO', '..LLLL...'],
    ['.GGGGGggO', '..LBBL...', '....BB...', '...BB....'],
  ],
};

/** Uivat ja lentävät kuvat lajeittain; `fly` puuttuu, jos laji ei lennä pelissä. */
export const BIRD_ART: Record<BirdKind, { swim?: BirdFrames; fly?: BirdFrames }> = {
  drake: {
    swim: {
      top: [['..O..', '.ggg.', '.WgW.', 'BGGGB', 'GGGGG', 'GGSGG', '.DKD.']],
      side: [['.....gg.', '.....ggO', 'K...BB..', 'KGGGGBB.', '.LGGGG..']],
    },
    fly: MALLARD_FLY,
  },
  hen: {
    swim: {
      top: [['..O..', '.bBb.', '.bbb.', 'bBbBb', 'bbBbb', 'bBbBb', '.BbB.']],
      side: [['.....bb.', '.....BbO', 'B...bb..', 'BbBbBbb.', '.bbbbb..']],
    },
    fly: MALLARD_FLY,
  },
  duckling: {
    swim: {
      top: [['.b.', 'TTT', 'TbT', 'TTT']],
      side: [['..Tb', 'bTT.', '.bb.']],
    },
  },
  swan: {
    swim: {
      top: [
        [
          '...K...',
          '...Y...',
          '...W...',
          '...W...',
          '...W...',
          '...W...',
          '..WWW..',
          '.WWWWW.',
          'WWWWWWW',
          'WWWLWWW',
          'WWWLWWW',
          'WWWLWWW',
          'WWWWWWW',
          '.WWWWW.',
          '..WLW..',
        ],
      ],
      side: [
        [
          '........WW..',
          '........WWYK',
          '........W...',
          '........W...',
          '........W...',
          '.WWWWWWWW...',
          'WWWWWWWWW...',
          '.WWWWWWWL...',
          '..LLLLLL....',
        ],
      ],
    },
    fly: {
      top: [
        [
          '........K........',
          '........Y........',
          '........W........',
          '........W........',
          '.WWWWWWWWWWWWWWW.',
          'WWWWWWWWWWWWWWWWW',
          '.......WWW.......',
          '........W........',
        ],
        [
          '........K........',
          '........Y........',
          '........W........',
          '........W........',
          '....WWWWWWWWW....',
          '...WWWWWWWWWWW...',
          '.......WWW.......',
          '........W........',
        ],
      ],
      side: [
        [
          '.....WW........',
          '......WWW......',
          '........WW.....',
          'WWWWWWWWWWWWWYK',
          '..WWWWWW.......',
        ],
        ['WWWWWWWWWWWWWYK', '..WWWWWW.......', '......WWW......', '.....WW........'],
      ],
    },
  },
  loon: {
    swim: {
      top: [['..K..', '..S..', '.SSS.', '.KWK.', 'KWKWK', 'KKWKK', 'KWKWK', '.KKK.']],
      side: [['.......SS.', '......SSSD', 'KWKWKKKK..', '.KKKKKK...']],
    },
  },
  gull: {
    fly: {
      top: [
        ['.....W.....', 'KLLLLWLLLLK', '.KLLWWWLLK.', '.....W.....', '....W.W....'],
        ['.....W.....', '...LLWLL...', '..KLWWWLK..', '.....W.....', '....W.W....'],
      ],
      side: [
        ['...KL....', '....LL...', '.....L...', '.WWWWWWWY', '..WWWWW..'],
        ['.WWWWWWWY', '..WWLWW..', '....LL...', '...KL....'],
      ],
    },
  },
  tern: {
    fly: {
      top: [
        ['....R....', '....K....', 'LLLLWLLLL', '.LLWWWLL.', '....W....', '...W.W...'],
        ['....R....', '....K....', '..LLWLL..', '.LLWWWLL.', '....W....', '...W.W...'],
      ],
      side: [
        ['...KL....', '....LL...', '.....L...', '.WWWWWWKR', '..WWWW...'],
        ['.WWWWWWKR', '..WWLW...', '....LL...', '...KL....'],
      ],
    },
  },
  osprey: {
    swim: {
      // Pinnassa siivet levällään kalan päällä.
      top: [
        [
          '.......K.......',
          '......WDW......',
          'BBBBBBBBBBBBBBB',
          '.BBBBBBBBBBBBB.',
          '......BBB......',
        ],
      ],
      side: [['.BB.......BB..', '..BBBBBBBWWK..', '....FFFFFF....']],
    },
    fly: {
      top: [
        [
          '.......K.......',
          '......WDW......',
          'BBBBBBBBBBBBBBB',
          '.BBBBBBBBBBBBB.',
          '......BBB......',
          '......BBB......',
          '.......B.......',
        ],
        [
          '.......K.......',
          '......WDW......',
          '...BBBBBBBBB...',
          '..BBBBBBBBBBB..',
          '......BBB......',
          '......BBB......',
          '.......B.......',
        ],
      ],
      side: [
        ['..BB.........', '...BBB.......', '.....BBB.....', '.BBBBBBBWWK..', '..WWWWWWWW...'],
        ['.BBBBBBBWWK..', '..WWWBWWWW...', '....BBB......', '...BBB.......', '..BB.........'],
      ],
    },
  },
};

/** Kala sääksen kynsissä: kuvan alle lisätyt rivit. */
export const CARRY_TOP = ['.....FFFFF.....'];
export const CARRY_SIDE = ['....FFFFF....'];
