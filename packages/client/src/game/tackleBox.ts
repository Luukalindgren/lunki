import {
  CRANK_DEPTHS,
  FLIES,
  FLY_IDS,
  JIG_WEIGHTS,
  LURES,
  LURE_IDS,
  DEFAULT_TACKLE,
  lureVariant,
  type CrankDepthId,
  type FlyId,
  type JigWeightId,
  type LureId,
  type Tackle,
} from '@lunki/shared';
import { profileKey } from '../net/identity';

/**
 * Viehepakki (#365): pelaaja valitsee mukaan enintään kahdeksan viehettä
 * säätöineen ("Jigi 5 g", "Jigi 20 g", "Vaappu syvä") ja perhorasiaan
 * enintään kahdeksan perhoa. R ja viehenappi kiertävät pakin lokerot
 * järjestyksessä, ja pikavalikko näyttää ne. Pakki on vain selaimen tietoa:
 * palvelin näkee käytössä olevan vieheen (Tackle) kuten ennenkin.
 */

/** Lokeroiden enimmäismäärä (Luuka 2026-10-29: kahdeksan, #383). */
export const BOX_SLOTS = 8;

/** Virvelin lokero: viehe ja sen säätö (jigillä paino, vaapulla syvyys). */
export interface LureSlot {
  lure: LureId;
  variant?: JigWeightId | CrankDepthId;
}

export interface TackleBox {
  lures: LureSlot[];
  flies: FlyId[];
}

/** Aloittelijan pakki: kaikki vieheet ja perhot oletussäädöillä, kuten R-kierto ennen pakkia. */
export function beginnerBox(): TackleBox {
  return {
    lures: LURE_IDS.slice(0, BOX_SLOTS).map((lure) => slotOf({ ...DEFAULT_TACKLE, lure })),
    flies: FLY_IDS.slice(0, BOX_SLOTS),
  };
}

/** Käytössä olevan vieheen lokero. */
export function slotOf(t: Pick<Tackle, 'lure' | 'jigWeight' | 'crankDepth'>): LureSlot {
  const variant = lureVariant(t);
  return variant ? { lure: t.lure, variant } : { lure: t.lure };
}

export const sameSlot = (a: LureSlot, b: LureSlot) =>
  a.lure === b.lure && (a.variant ?? null) === (b.variant ?? null);

/** Varusteet, joissa on lokeron viehe säätöineen. */
export function withSlot(t: Tackle, slot: LureSlot): Tackle {
  const next: Tackle = { ...t, lure: slot.lure };
  if (slot.lure === 'jig' && slot.variant) next.jigWeight = slot.variant as JigWeightId;
  if (slot.lure === 'wobbler' && slot.variant) next.crankDepth = slot.variant as CrankDepthId;
  return next;
}

/** Tallennettu tai muokattu lokero: tuntematon viehe tai väärä säätö hylätään. */
export function parseSlot(v: unknown): LureSlot | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.lure !== 'string' || !Object.hasOwn(LURES, o.lure)) return null;
  const lure = o.lure as LureId;
  const table = lure === 'jig' ? JIG_WEIGHTS : lure === 'wobbler' ? CRANK_DEPTHS : null;
  if (!table) return { lure };
  const variant =
    typeof o.variant === 'string' && Object.hasOwn(table, o.variant)
      ? (o.variant as JigWeightId | CrankDepthId)
      : lure === 'jig'
        ? DEFAULT_TACKLE.jigWeight
        : DEFAULT_TACKLE.crankDepth;
  return { lure, variant };
}

/**
 * Tallennettu pakki: kelvottomat lokerot pudotetaan ja ylimääräiset
 * leikataan. Tyhjä tai rikki tallennus antaa aloittelijan pakin.
 */
export function parseTackleBox(v: unknown): TackleBox {
  const o = (v ?? {}) as Record<string, unknown>;
  const lures = (Array.isArray(o.lures) ? o.lures : [])
    .map(parseSlot)
    .filter((s): s is LureSlot => s !== null)
    .slice(0, BOX_SLOTS);
  const flies = (Array.isArray(o.flies) ? o.flies : [])
    .filter((f): f is FlyId => typeof f === 'string' && Object.hasOwn(FLIES, f))
    .slice(0, BOX_SLOTS);
  const beginner = beginnerBox();
  return {
    lures: lures.length > 0 ? lures : beginner.lures,
    flies: flies.length > 0 ? flies : beginner.flies,
  };
}

export function loadTackleBox(): TackleBox {
  try {
    const raw = localStorage.getItem(profileKey('tackleBox'));
    return parseTackleBox(raw ? JSON.parse(raw) : null);
  } catch {
    return beginnerBox();
  }
}

export function saveTackleBox(box: TackleBox): void {
  try {
    localStorage.setItem(profileKey('tackleBox'), JSON.stringify(box));
  } catch {
    // ei haittaa
  }
}

/** Kalastustavan lokerot varusteina pikavalikkoa ja kiertoa varten. */
export function boxTackles(t: Tackle, box: TackleBox): Tackle[] {
  return t.method === 'fly'
    ? box.flies.map((fly) => ({ ...t, fly }))
    : box.lures.map((slot) => withSlot(t, slot));
}

/** Käytössä olevan vieheen tai perhon lokero pakissa, tai -1. */
export function currentSlot(t: Tackle, box: TackleBox): number {
  if (t.method === 'fly') return box.flies.indexOf(t.fly);
  const here = slotOf(t);
  return box.lures.findIndex((s) => sameSlot(s, here));
}

/**
 * Seuraava lokero R:lle ja viehenapille. Jos käytössä oleva viehe ei ole
 * pakissa (esim. valittu Varusteet-näkymästä), kierto alkaa ensimmäisestä.
 */
export function nextInBox(t: Tackle, box: TackleBox): Tackle {
  const all = boxTackles(t, box);
  if (all.length === 0) return t;
  return all[(currentSlot(t, box) + 1) % all.length]!;
}

/**
 * Siima poikki realistisella vaikeustasolla: menetetty viehe poistuu kisan
 * pakista (Luuka 2026-10-28). Viimeistä lokeroa ei poisteta, vaan se jää
 * varavieheeksi. Palauttaa uuden pakin ja vieheen, joka otetaan käyttöön.
 */
export function loseFromBox(
  t: Tackle,
  box: TackleBox,
): { box: TackleBox; next: Tackle | null; left: number } {
  const i = currentSlot(t, box);
  const fly = t.method === 'fly';
  const count = fly ? box.flies.length : box.lures.length;
  if (i < 0 || count <= 1) return { box, next: null, left: count };
  const next: TackleBox = fly
    ? { ...box, flies: box.flies.filter((_, k) => k !== i) }
    : { ...box, lures: box.lures.filter((_, k) => k !== i) };
  const all = boxTackles(t, next);
  return { box: next, next: all[i % all.length]!, left: all.length };
}
