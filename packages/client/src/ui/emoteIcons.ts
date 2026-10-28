import type { EmoteId } from '@lunki/shared';

/**
 * Käsimerkkien pikseli-ikonit (16 × 16): s iho, o hiha, y keltaiset
 * liikeviivat, r punainen, b sininen kala ja k tumma. Tumma ääriviiva
 * lisätään automaattisesti värien ympärille, joten ikoni erottuu sekä
 * vaalealta puhekuplalta että tummalta valikolta.
 */
export const ICON_SIZE = 16;

export const EMOTE_ICONS: Record<EmoteId, readonly string[]> = {
  wave: [
    '................',
    '........s.......',
    '......s.s.s.....',
    '......s.s.s.....',
    '.y....s.s.s.s.y.',
    'y.....s.s.s.s..y',
    'y.....s.s.s.s..y',
    'y.....sssssss..y',
    '.y.ss.sssssss.y.',
    '....ssssssss....',
    '.....sssssss....',
    '......ssssss....',
    '......ssssss....',
    '......oooooo....',
    '......oooooo....',
    '................',
  ],
  thumbsUp: [
    '................',
    '......ss........',
    '......ss........',
    '......ss........',
    '.....ssss.......',
    '...sssssssss....',
    '..ssssssssss....',
    '..kkkkkkksss....',
    '..ssssssssss....',
    '..kkkkkkksss....',
    '..ssssssssss....',
    '...sssssssss....',
    '...oooooooo.....',
    '...oooooooo.....',
    '................',
    '................',
  ],
  middleFinger: [
    '................',
    '.......ss.......',
    '.......ss.......',
    '.......ss.......',
    '.......ss.......',
    '....ss.ss.sss...',
    '...ssskssksss...',
    '...ssskssksss...',
    '...ssskssksss...',
    '...ssskssksss...',
    '...ssssssssss...',
    '....ssssssss....',
    '....oooooooo....',
    '....oooooooo....',
    '................',
    '................',
  ],
  fist: [
    '................',
    '................',
    '................',
    '....ss.ss.ss....',
    '.y.sss.ss.sss.y.',
    'y..sss.ss.sss..y',
    'y..sss.ss.sss..y',
    'y..sss.ss.sss..y',
    '.y.ssssssssss.y.',
    '...ssssssssss...',
    '....ssssssss....',
    '.....ssssss.....',
    '.....oooooo.....',
    '.....oooooo.....',
    '................',
    '................',
  ],
  comeHere: [
    '................',
    '................',
    '.....ssss.......',
    '....ssssss......',
    '....ss...ss.....',
    '....ss....s.....',
    '..y.ss..........',
    '.y..ss..........',
    '.y..ssssssssss..',
    '..y.sssssssssooo',
    '.....ssssssssooo',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  bigFish: [
    '................',
    '................',
    '.s............s.',
    '.ss..........ss.',
    '.ss..........ss.',
    '.ss..bbbb..b.ss.',
    '.ss.bkbbbbbb.ss.',
    '.ss.bbbbbbbb.ss.',
    '.ss..bbbb..b.ss.',
    '.ss..........ss.',
    '.ss..........ss.',
    '.ss..........ss.',
    '.oo..........oo.',
    '.oo..........oo.',
    '................',
    '................',
  ],
};

/**
 * Kala kiinni -merkki toisen kalastajan yllä (#368): huutomerkki ja kala.
 * Ei käsimerkki, joten sitä ei ole ympyrävalikossa.
 */
export const FISH_ON_ICON: readonly string[] = [
  '................',
  '..yy............',
  '..yy............',
  '..yy......b.....',
  '..yy.....bbb....',
  '..yy....bbbbb..b',
  '..yy...bbkbbbbbb',
  '..yy...bbbbbbbbb',
  '..yy....bbbbb..b',
  '.........bbb....',
  '..........b.....',
  '..yy............',
  '..yy............',
  '................',
  '................',
  '................',
];

const COLORS: Record<string, string> = {
  s: '#e0cf9c',
  r: '#d23a2a',
  y: '#f6d04d',
  b: '#5b8fb9',
  o: '#4f6f86',
  k: '#1c232b',
  w: '#eef2f3',
  g: '#6fae4f',
};
const OUTLINE = '#1c232b';

/**
 * Pikseli-ikoni riveistä kankaana (skaalautuu CSS:llä terävänä
 * pikseligrafiikkana). Sama piirto käsimerkeille ja tulossivun
 * palkinnoille (#367): w valkoinen ja g vihreä lisävärinä.
 */
export function pixelIcon(rows: readonly string[], className: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_SIZE;
  canvas.className = className;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const at = (x: number, y: number) => rows[y]?.[x] ?? '.';
  const coloured = (c: string) => c !== '.' && c !== 'k';
  for (let y = 0; y < ICON_SIZE; y++)
    for (let x = 0; x < ICON_SIZE; x++) {
      const c = at(x, y);
      if (c !== '.') g.fillStyle = COLORS[c] ?? OUTLINE;
      else if (
        // Ääriviiva: tyhjä pikseli kiinni värissä.
        [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(coloured)
      )
        g.fillStyle = OUTLINE;
      else continue;
      g.fillRect(x, y, 1, 1);
    }
  return canvas;
}

/** Käsimerkin ikoni. */
export const emoteIcon = (id: EmoteId): HTMLCanvasElement =>
  pixelIcon(EMOTE_ICONS[id], 'emote-icon');
