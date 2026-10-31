import type { SpeciesId } from '../fishing/fish';
import type { RaceStats } from './raceStats';

/**
 * Kisan palkinnot (#367): vakavia ja hauskoja titteleitä saaliista ja
 * tilastoista. Järjestys on näyttöjärjestys: ensin kalat, sitten heitot,
 * menetykset ja lopuksi sattumukset.
 */
export const AWARD_IDS = [
  'biggest',
  'first',
  'speciesKing',
  'smallest',
  'sharpshooter',
  'longestCast',
  'busiest',
  'strikeMagnet',
  'theOneThatGotAway',
  'escapeClub',
  'sleepyhead',
  'pikeDentist',
  'lureDonor',
  'bottomRaker',
  'vegetarian',
  'gardener',
  'tangleMaster',
  'swimmer',
  'pilot',
  'lightningRod',
  'closeCall',
  'marathon',
  'dockGuard',
  'fastInflater',
  'fishFriend',
] as const;
export type AwardId = (typeof AWARD_IDS)[number];

export interface AwardCatch {
  species: SpeciesId;
  weight: number;
  /** Kisa-aika (s). */
  time: number;
}

export interface AwardEntrant {
  id: string;
  name: string;
  catches: readonly AwardCatch[];
  /** Null: tilastoja ei saatu (esim. vanha palvelin tai pelaaja lähti). */
  stats: RaceStats | null;
}

export interface Award {
  id: AwardId;
  /** Tasapelissä kaikki samaan tulokseen yltäneet. */
  winners: { id: string; name: string }[];
  /** Palkinnon luku (kg, m, s, kpl tai %); `every`-palkinnossa kertoo vain ehdon. */
  value: number;
  /** Kalapalkinnoissa palkittu kala (kuvaan ja selitteeseen). */
  fish?: { species: SpeciesId; weight: number };
}

interface Rule {
  id: AwardId;
  /** Paras on suurin (max) tai pienin (min); `every` = jokainen ehdon täyttävä. */
  best: 'max' | 'min' | 'every';
  /** Pelaajan luku; null = ei mukana tässä palkinnossa. */
  value: (e: AwardEntrant) => number | null;
  /** Kalapalkinnon kala. */
  fish?: (e: AwardEntrant) => { species: SpeciesId; weight: number };
}

const biggest = (e: AwardEntrant) =>
  e.catches.reduce<AwardCatch | null>((b, c) => (!b || c.weight > b.weight ? c : b), null);
const smallest = (e: AwardEntrant) =>
  e.catches.reduce<AwardCatch | null>((b, c) => (!b || c.weight < b.weight ? c : b), null);
const first = (e: AwardEntrant) =>
  e.catches.reduce<AwardCatch | null>((b, c) => (!b || c.time < b.time ? c : b), null);

const pickFish = (f: { species: SpeciesId; weight: number }) => ({
  species: f.species,
  weight: f.weight,
});

/** Tilastoluku, kun se ylittää rajan (`atLeast`); muuten ei palkintoa. */
const stat =
  (pick: (s: RaceStats) => number, atLeast: number) =>
  (e: AwardEntrant): number | null => {
    if (!e.stats) return null;
    const v = pick(e.stats);
    return v >= atLeast ? v : null;
  };

/** Rajat on valittu niin, ettei tavallinen kisa jaa jokaista palkintoa. */
const RULES: readonly Rule[] = [
  {
    id: 'biggest',
    best: 'max',
    value: (e) => biggest(e)?.weight ?? null,
    fish: (e) => biggest(e)!,
  },
  {
    id: 'first',
    best: 'min',
    value: (e) => first(e)?.time ?? null,
    fish: (e) => first(e)!,
  },
  {
    id: 'speciesKing',
    best: 'max',
    value: (e) => {
      const n = new Set(e.catches.map((c) => c.species)).size;
      return n >= 2 ? n : null;
    },
  },
  {
    // Yhden kalan saaliissa pienin on myös suurin: ei palkintoa.
    id: 'smallest',
    best: 'min',
    value: (e) => (e.catches.length >= 2 ? smallest(e)!.weight : null),
    fish: (e) => smallest(e)!,
  },
  {
    // Kaloja heittoa kohden (%), kun kaloja on vähintään kaksi.
    id: 'sharpshooter',
    best: 'max',
    value: (e) =>
      e.stats && e.catches.length >= 2 && e.stats.casts >= 3
        ? Math.round((100 * e.catches.length) / e.stats.casts)
        : null,
  },
  { id: 'longestCast', best: 'max', value: stat((s) => Math.round(s.longestCast), 20) },
  { id: 'busiest', best: 'max', value: stat((s) => s.casts, 15) },
  { id: 'strikeMagnet', best: 'max', value: stat((s) => s.strikes, 5) },
  {
    id: 'theOneThatGotAway',
    best: 'max',
    value: (e) => e.stats?.biggestLost?.weight ?? null,
    fish: (e) => e.stats!.biggestLost!,
  },
  { id: 'escapeClub', best: 'max', value: stat((s) => s.escaped, 2) },
  { id: 'sleepyhead', best: 'max', value: stat((s) => s.missed, 3) },
  { id: 'pikeDentist', best: 'max', value: stat((s) => s.bitOffs, 1) },
  { id: 'lureDonor', best: 'max', value: stat((s) => s.luresLost, 2) },
  { id: 'bottomRaker', best: 'max', value: stat((s) => s.snags, 3) },
  { id: 'vegetarian', best: 'max', value: stat((s) => s.fouled, 3) },
  { id: 'gardener', best: 'max', value: stat((s) => s.landCasts, 1) },
  { id: 'tangleMaster', best: 'max', value: stat((s) => s.tangles, 1) },
  { id: 'swimmer', best: 'max', value: stat((s) => s.capsizes, 1) },
  { id: 'pilot', best: 'max', value: stat((s) => s.flights, 1) },
  { id: 'lightningRod', best: 'max', value: stat((s) => s.lightningHits, 1) },
  {
    // Salama iski alle 80 m päähän, mutta ei osunut.
    id: 'closeCall',
    best: 'min',
    value: (e) => {
      const d = e.stats?.closestLightning;
      return e.stats && e.stats.lightningHits === 0 && d != null && d < 80 ? Math.round(d) : null;
    },
  },
  { id: 'marathon', best: 'max', value: stat((s) => Math.round(s.distance), 500) },
  { id: 'dockGuard', best: 'max', value: stat((s) => Math.round(s.idleSeconds), 300) },
  // Täyttökisa (#458): nopeimmin vesille.
  { id: 'fastInflater', best: 'min', value: (e) => e.stats?.inflateTime ?? null },
  {
    // Ei yhtään kalaa, vaikka yritystä riitti.
    id: 'fishFriend',
    best: 'every',
    value: (e) => (e.stats && e.catches.length === 0 && e.stats.casts >= 10 ? e.stats.casts : null),
  },
];

/**
 * Kisan palkinnot. Palkinto jaetaan vain, jos joku ylsi sen rajaan
 * (ei "Uimari: 0 kaatumista"), ja tasapelissä kaikille parhaille.
 * Yksinpelissä sama lista toimii saavutuksina.
 */
export function raceAwards(entrants: readonly AwardEntrant[]): Award[] {
  const awards: Award[] = [];
  for (const rule of RULES) {
    const scored = entrants.flatMap((e) => {
      const v = rule.value(e);
      return v === null ? [] : [{ e, v }];
    });
    if (scored.length === 0) continue;
    const best =
      rule.best === 'min'
        ? Math.min(...scored.map((s) => s.v))
        : Math.max(...scored.map((s) => s.v));
    const top = rule.best === 'every' ? scored : scored.filter((s) => s.v === best);
    const lead = top[0]!.e;
    awards.push({
      id: rule.id,
      winners: top.map((s) => ({ id: s.e.id, name: s.e.name })),
      value: best,
      ...(rule.fish ? { fish: pickFish(rule.fish(lead)) } : {}),
    });
  }
  return awards;
}
