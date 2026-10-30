import {
  DEFAULT_TACKLE,
  FLY_IDS,
  LURE_IDS,
  isCraft,
  parseTackle,
  type Craft,
  type Tackle,
} from '@lunki/shared';
import { profileKey } from '../net/identity';

/** Viimeksi käytetyt varusteet muistetaan selaimessa. */
export function loadTackle(): Tackle {
  try {
    const raw = localStorage.getItem(profileKey('tackle'));
    const t = raw ? parseTackle(JSON.parse(raw)) : null;
    if (t) return t;
  } catch {
    // oletukset kelpaavat
  }
  return { ...DEFAULT_TACKLE };
}

export function saveTackle(t: Tackle): void {
  try {
    localStorage.setItem(profileKey('tackle'), JSON.stringify(t));
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

/** Yksinpelin kulkupeli (#263) muistetaan selaimessa; oletus kelluntarengas. */
export function loadCraft(): Craft {
  try {
    const c = localStorage.getItem(profileKey('craft'));
    if (isCraft(c)) return c;
  } catch {
    // oletus kelpaa
  }
  return 'tube';
}

export function saveCraft(c: Craft): void {
  try {
    localStorage.setItem(profileKey('craft'), c);
  } catch {
    // ei haittaa
  }
}
