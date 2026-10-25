/**
 * Kuikan (Gavia arctica) äänet syntetisoituna: ei äänitiedostoja eikä
 * lisenssejä. Kuikka on järven kuuluvin lintu: sen haikea, kauas kantava
 * huuto ja rytminen "kuikkaa"-laulu kaikuvat rannoista.
 */

/** Yksi sävel: taajuuden kulku (aika sävelen alusta, Hz) ja voimakkuus. */
export interface LoonNote {
  /** Alkuhetki kutsun alusta (s). */
  at: number;
  /** Kesto (s). */
  dur: number;
  /** Taajuuden tukipisteet [aika sävelen alusta (s), taajuus (Hz)]; lineaarinen liuku. */
  pitch: [number, number][];
  /** Huippuvoimakkuus 0–1. */
  peak: number;
  /** Vibraton syvyys (Hz); pitkissä sävelissä huuto väreilee. */
  vibrato: number;
}

export type LoonCallKind = 'wail' | 'song';

/**
 * Huuto: pitkä, nouseva ulvahdus, joka hyppää korkeammalle ja laskee.
 * Laulu: "kluu-ii-kok" -sarja, jossa nouseva pitkä sävel ja lyhyt matala
 * naksahdus vuorottelevat 2–4 kertaa ja lopuksi nouseva sävel vielä kerran.
 * `rand` palauttaa 0–1; sävelkorkeus vaihtelee hieman yksilöittäin.
 */
export function loonCall(kind: LoonCallKind, rand: () => number = Math.random): LoonNote[] {
  const k = 0.9 + rand() * 0.2;
  if (kind === 'wail') {
    return [
      {
        at: 0,
        dur: 1.5,
        pitch: [
          [0, 620 * k],
          [0.35, 880 * k],
          [1.2, 900 * k],
          [1.5, 820 * k],
        ],
        peak: 0.9,
        vibrato: 7,
      },
      {
        at: 1.55,
        dur: 1.3,
        pitch: [
          [0, 1080 * k],
          [0.15, 1150 * k],
          [0.9, 1120 * k],
          [1.3, 930 * k],
        ],
        peak: 1,
        vibrato: 9,
      },
    ];
  }
  const notes: LoonNote[] = [];
  const phrases = 2 + Math.floor(rand() * 3);
  let t = 0;
  for (let i = 0; i <= phrases; i++) {
    notes.push({
      at: t,
      dur: 0.55,
      pitch: [
        [0, 640 * k],
        [0.3, 1000 * k],
        [0.55, 960 * k],
      ],
      peak: 0.85,
      vibrato: 5,
    });
    t += 0.6;
    if (i === phrases) break;
    notes.push({
      at: t,
      dur: 0.14,
      pitch: [
        [0, 560 * k],
        [0.14, 430 * k],
      ],
      peak: 0.6,
      vibrato: 0,
    });
    t += 0.22;
  }
  return notes;
}

/** Kutsun kokonaiskesto (s). */
export const loonCallLength = (notes: readonly LoonNote[]): number =>
  notes.reduce((end, n) => Math.max(end, n.at + n.dur), 0);
