import { DEFAULT_TACKLE, LURE_IDS, isTackle, type Tackle } from '@lunki/shared';

const TACKLE_KEY = 'lunki.tackle';

/** Viimeksi käytetyt varusteet muistetaan selaimessa. */
export function loadTackle(): Tackle {
  try {
    const raw = localStorage.getItem(TACKLE_KEY);
    const t: unknown = raw ? JSON.parse(raw) : null;
    if (isTackle(t)) return t;
  } catch {
    // oletukset kelpaavat
  }
  return { ...DEFAULT_TACKLE };
}

export function saveTackle(t: Tackle): void {
  try {
    localStorage.setItem(TACKLE_KEY, JSON.stringify(t));
  } catch {
    // ei haittaa
  }
}

/** Seuraava viehe pikanäppäintä varten. */
export function nextLure(t: Tackle): Tackle {
  const i = LURE_IDS.indexOf(t.lure);
  return { ...t, lure: LURE_IDS[(i + 1) % LURE_IDS.length]! };
}
