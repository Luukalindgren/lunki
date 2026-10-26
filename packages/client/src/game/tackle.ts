import { DEFAULT_TACKLE, FLY_IDS, LURE_IDS, parseTackle, type Tackle } from '@lunki/shared';

const TACKLE_KEY = 'lunki.tackle';

/** Viimeksi käytetyt varusteet muistetaan selaimessa. */
export function loadTackle(): Tackle {
  try {
    const raw = localStorage.getItem(TACKLE_KEY);
    const t = raw ? parseTackle(JSON.parse(raw)) : null;
    if (t) return t;
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

/** Seuraava viehe (perhovälineillä perho) pikanäppäintä varten. */
export function nextLure(t: Tackle): Tackle {
  if (t.method === 'fly') {
    const i = FLY_IDS.indexOf(t.fly);
    return { ...t, fly: FLY_IDS[(i + 1) % FLY_IDS.length]! };
  }
  const i = LURE_IDS.indexOf(t.lure);
  return { ...t, lure: LURE_IDS[(i + 1) % LURE_IDS.length]! };
}
