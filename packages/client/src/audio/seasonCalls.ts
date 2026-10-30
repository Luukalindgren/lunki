import type { LoonNote } from './loon';

/**
 * Vuodenajan linnut syntetisoituna (#427), samaan tapaan kuin kuikka:
 * keväällä ja syksyllä kurjet toitottavat, ja syksyllä etelään lentävät
 * hanhiaurat kailottavat. Sävelet ovat kuikan muotoa (`LoonNote`), ja
 * `trill` on kurjen rullaavan äänen nopea värinä (Hz).
 */
export interface CallNote extends LoonNote {
  trill?: number;
}

/** Kurki: 2–4 rullaavaa, torvimaista "krruu"-toitotusta, viimeinen matalin. */
export function craneCall(rand: () => number = Math.random): CallNote[] {
  const k = 0.9 + rand() * 0.2;
  const count = 2 + Math.floor(rand() * 3);
  const notes: CallNote[] = [];
  for (let i = 0; i < count; i++) {
    const f = (600 - i * 25) * k;
    notes.push({
      at: i * 0.55,
      dur: 0.42,
      pitch: [
        [0, f * 0.92],
        [0.08, f],
        [0.42, f * 0.88],
      ],
      peak: 0.9,
      vibrato: 0,
      trill: 28 + rand() * 6,
    });
  }
  return notes;
}

/** Hanhiaura: 8–14 lyhyttä kahden tavun "ank-ank"-ääntä limittäin muutaman sekunnin ajan. */
export function gooseFlock(rand: () => number = Math.random): CallNote[] {
  const count = 8 + Math.floor(rand() * 7);
  const notes: CallNote[] = [];
  for (let i = 0; i < count; i++) {
    // Jokainen hanhi omalla korkeudellaan; aura lähestyy ja loittonee.
    const f = 300 + rand() * 120;
    const at = (i / count) * 3.5 + rand() * 0.3;
    const near = Math.sin((Math.PI * at) / 3.8);
    const dur = 0.14 + rand() * 0.08;
    notes.push({
      at,
      dur,
      pitch: [
        [0, f * 1.12],
        [dur * 0.4, f],
        [dur, f * 0.9],
      ],
      peak: 0.35 + 0.65 * near,
      vibrato: 0,
    });
  }
  return notes.sort((a, b) => a.at - b.at);
}
