import { SPECIES } from '../fishing/fish';
import type { Catch } from '../fishing/fishing';
import { summarize, type CatchRecord, type CatchSummary, type WinRule } from './competition';

/** Lähtölaskennan pituus (s) ennen kisan alkua. */
export const COUNTDOWN_SECONDS = 3;
/** Kahden saaliin väli vähintään (s): kala pitää ensin heittää, väsyttää ja nostaa. */
export const MIN_CATCH_INTERVAL = 4;

export interface PlayerCatches {
  id: string;
  name: string;
  catches: readonly CatchRecord[];
  /** Venekisan joukkueen kalastajat (sessionId ja nimi). */
  members?: readonly { id: string; name: string }[];
}

export interface PlayerResult extends PlayerCatches {
  summary: CatchSummary;
  /** Sijoitus 1…; tasapisteissä sama sijoitus. */
  rank: number;
}

/**
 * Tulostaulu voittoehdon mukaan. Tasapisteissä edellä on se, joka saavutti
 * tuloksensa aiemmin (viimeisimmän saaliin aika).
 */
export function rankPlayers(players: readonly PlayerCatches[], rule: WinRule): PlayerResult[] {
  const reachedAt = (p: PlayerCatches, s: CatchSummary) =>
    rule === 'biggest'
      ? (s.biggest?.time ?? Infinity)
      : p.catches.reduce((t, c) => Math.max(t, c.time), p.catches.length ? 0 : Infinity);
  const rows = players.map((p) => {
    const summary = summarize(p.catches, rule);
    return { ...p, summary, rank: 0, at: reachedAt(p, summary) };
  });
  rows.sort(
    (a, b) => b.summary.score - a.summary.score || a.at - b.at || a.name.localeCompare(b.name),
  );
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.summary.score === r.summary.score && prev.at === r.at ? prev.rank : i + 1;
  });
  return rows.map(({ at: _at, ...r }) => r);
}

/**
 * Venekisan tulostaulu (#263): vene on joukkue, jonka saaliit lasketaan
 * yhteen riippumatta siitä, kuka veneestä kalan nosti. Saalis kuuluu
 * veneelle, jossa se saatiin, vaikka nostaja olisi jo lähtenyt.
 */
export function rankBoats(
  catches: readonly (CatchRecord & { boat: number })[],
  crews: readonly { id: string; name: string; boat: number }[],
  rule: WinRule,
  boatName: (boat: number) => string,
): PlayerResult[] {
  type Member = { id: string; name: string };
  const teams = new Map<
    number,
    { id: string; name: string; catches: CatchRecord[]; members: Member[] }
  >();
  const team = (boat: number) => {
    let t = teams.get(boat);
    if (!t)
      teams.set(boat, (t = { id: `boat:${boat}`, name: boatName(boat), catches: [], members: [] }));
    return t;
  };
  for (const c of [...crews].filter((c) => c.boat > 0).sort((a, b) => a.boat - b.boat))
    team(c.boat).members.push({ id: c.id, name: c.name });
  for (const { boat, ...c } of catches) team(boat).catches.push(c);
  return rankPlayers([...teams.values()], rule);
}

/**
 * Palvelimen tarkistus saaliille: laji on järvessä, paino lajin rajoissa,
 * viehe on käynyt vedessä edellisen saaliin jälkeen eikä saaliita tule liian
 * tiheään.
 */
export function isPlausibleCatch(
  c: Partial<Catch> | null | undefined,
  ctx: {
    splashedSinceLastCatch: boolean;
    now: number;
    lastCatchAt: number;
    /** Huoneen lajisto: muita lajeja järvessä ei ole. */
    species?: readonly string[];
  },
): c is Catch {
  if (!c || typeof c.species !== 'string' || !Object.hasOwn(SPECIES, c.species)) return false;
  if (ctx.species && !ctx.species.includes(c.species)) return false;
  const sp = SPECIES[c.species];
  if (typeof c.weight !== 'number' || !Number.isFinite(c.weight)) return false;
  if (c.weight < sp.minWeight - 1e-9 || c.weight > sp.maxWeight + 1e-9) return false;
  if (!ctx.splashedSinceLastCatch) return false;
  return ctx.now - ctx.lastCatchAt >= MIN_CATCH_INTERVAL;
}
