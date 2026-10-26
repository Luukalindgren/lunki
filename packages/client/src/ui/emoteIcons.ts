import type { EmoteId } from '@lunki/shared';

/**
 * Käsimerkkien pikseli-ikonit (12 × 12): s iho, r punainen, y keltainen,
 * b sininen kala. Tumma ääriviiva lisätään automaattisesti.
 */
export const EMOTE_ICONS: Record<EmoteId, readonly string[]> = {
  wave: [
    '............',
    '..s.s.s.....',
    '..s.s.s.s...',
    '..s.s.s.s...',
    '..sssssss.s.',
    'y.ssssssss..',
    '.yssssssss..',
    'y..ssssss...',
    '...ssssss...',
    '....ssss....',
    '....ssss....',
    '............',
  ],
  thumbsUp: [
    '............',
    '.....ss.....',
    '.....ss.....',
    '.....ss.....',
    '..sssssss...',
    '.ssssssss...',
    '.ssssssss...',
    '.ssssssss...',
    '..sssssss...',
    '..ssssss....',
    '............',
    '............',
  ],
  middleFinger: [
    '.....ss.....',
    '.....ss.....',
    '.....ss.....',
    '.....ss.....',
    '..s.sssss...',
    '.ssssssss...',
    '.ssssssss...',
    '.ssssssss...',
    '..ssssss....',
    '..ssssss....',
    '...ssss.....',
    '............',
  ],
  fist: [
    'r..........r',
    '.r........r.',
    '...ssssss...',
    '..ssssssss..',
    '..ssssssss..',
    '..ssssssss..',
    '...sssssss..',
    '...ssssss...',
    '....ssss....',
    '....ssss....',
    '....ssss....',
    '............',
  ],
  comeHere: [
    '............',
    '.y..........',
    'yy..sss.....',
    '.y.s...s....',
    '...s...s....',
    '....ssssss..',
    '...sssssss..',
    '...sssssss..',
    '....sssss...',
    '....sssss...',
    '.....sss....',
    '............',
  ],
  bigFish: [
    '............',
    '............',
    '............',
    '............',
    'y..bbbb..b.y',
    'yybbbbbbbbyy',
    'y..bbbb..b.y',
    '............',
    '............',
    '............',
    '............',
    '............',
  ],
};

const COLORS: Record<string, string> = {
  s: '#e0cf9c',
  r: '#d23a2a',
  y: '#f6d04d',
  b: '#5b8fb9',
};
const OUTLINE = '#1c232b';

/** Ikoni kankaana (skaalautuu CSS:llä terävänä pikseligrafiikkana). */
export function emoteIcon(id: EmoteId): HTMLCanvasElement {
  const rows = EMOTE_ICONS[id];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 12;
  canvas.className = 'emote-icon';
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const at = (x: number, y: number) => rows[y]?.[x] ?? '.';
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      const c = at(x, y);
      if (c !== '.') g.fillStyle = COLORS[c] ?? OUTLINE;
      else if (
        // Iholle ääriviiva: tyhjä pikseli kiinni ihossa.
        [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].includes('s')
      )
        g.fillStyle = OUTLINE;
      else continue;
      g.fillRect(x, y, 1, 1);
    }
  return canvas;
}
