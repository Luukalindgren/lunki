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

/** Kesken kisan vaihdettavat siima ja peruke kalastustavoittain (taukovalikon Varusteet). */
const RIG_KEYS = {
  spin: ['line', 'leader'],
  fly: ['flyLine', 'flyLeader'],
} as const satisfies Record<Tackle['method'], readonly (keyof Tackle)[]>;

export type RigKey = (typeof RIG_KEYS)[keyof typeof RIG_KEYS][number];

/**
 * Käytössä olevan kalastustavan siima tai peruke vaihtui eikä mikään muu:
 * palauttaa vaihtuneet kentät, jotta ilmoitus kertoo niistä eikä toista
 * vieheen nimeä. Muu vaihto (viehe, kalastustapa) tai ei muutosta: null.
 */
export function rigChanges(from: Tackle, to: Tackle): RigKey[] | null {
  const keys: readonly RigKey[] = RIG_KEYS[to.method];
  const changed = keys.filter((k) => from[k] !== to[k]);
  const rest = (Object.keys(to) as (keyof Tackle)[]).filter((k) => !changed.includes(k as RigKey));
  return changed.length && rest.every((k) => from[k] === to[k]) ? changed : null;
}
