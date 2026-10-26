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
    '.....sss........',
    '..sssssssss.....',
    '.sssssssssss....',
    '..ssssssssss....',
    '.sssssssssss....',
    '..ssssssssss....',
    '.sssssssssss....',
    '..ssssssssss....',
    '...ooooooooo....',
    '...ooooooooo....',
    '................',
    '................',
  ],
  middleFinger: [
    '................',
    '.......ss.......',
    '.......ss.......',
    '.......ss.......',
    '.......ss.......',
    '....ss.ss.ss....',
    '...sssssssss....',
    '..ssssssssss....',
    '..ssssssssss....',
    '..ssssssssss....',
    '...sssssssss....',
    '....sssssss.....',
    '....ooooooo.....',
    '....ooooooo.....',
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

const COLORS: Record<string, string> = {
  s: '#e0cf9c',
  r: '#d23a2a',
  y: '#f6d04d',
  b: '#5b8fb9',
  o: '#4f6f86',
  k: '#1c232b',
};
const OUTLINE = '#1c232b';

/** Ikoni kankaana (skaalautuu CSS:llä terävänä pikseligrafiikkana). */
export function emoteIcon(id: EmoteId): HTMLCanvasElement {
  const rows = EMOTE_ICONS[id];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_SIZE;
  canvas.className = 'emote-icon';
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
