import {
  addRaceStats,
  emptyRaceStats,
  parseRaceStats,
  SPECIES,
  type RaceStats,
  type SpeciesId,
} from '@lunki/shared';

/** Kaikkien kisojen yhteistilastot laitteella (#367). */
export interface LifetimeStats {
  races: number;
  fish: number;
  /** Saaliin yhteispaino (kg). */
  weight: number;
  biggest: { species: SpeciesId; weight: number } | null;
  /** Lajit, joita on saatu ainakin kerran. */
  species: SpeciesId[];
  stats: RaceStats;
}

const KEY = 'lunki.stats';
const isSpecies = (s: string) => Object.hasOwn(SPECIES, s);

const empty = (): LifetimeStats => ({
  races: 0,
  fish: 0,
  weight: 0,
  biggest: null,
  species: [],
  stats: emptyRaceStats(),
});

const count = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, 1e9) : 0;

export function loadLifetimeStats(): LifetimeStats {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<LifetimeStats> | null;
    if (!raw || typeof raw !== 'object') return empty();
    const big = raw.biggest;
    return {
      races: count(raw.races),
      fish: count(raw.fish),
      weight: count(raw.weight),
      biggest:
        big && typeof big.species === 'string' && isSpecies(big.species) && count(big.weight)
          ? { species: big.species, weight: count(big.weight) }
          : null,
      species: Array.isArray(raw.species)
        ? raw.species.filter((s): s is SpeciesId => typeof s === 'string' && isSpecies(s))
        : [],
      stats: parseRaceStats(raw.stats, isSpecies),
    };
  } catch {
    return empty();
  }
}

/** Lisää päättyneen kisan yhteistilastoihin ja palauttaa uudet luvut. */
export function addLifetimeRace(
  stats: RaceStats,
  catches: readonly { species: SpeciesId; weight: number }[],
): LifetimeStats {
  const prev = loadLifetimeStats();
  const biggest = catches.reduce(
    (b, c) => (!b || c.weight > b.weight ? { species: c.species, weight: c.weight } : b),
    prev.biggest,
  );
  const next: LifetimeStats = {
    races: prev.races + 1,
    fish: prev.fish + catches.length,
    weight: prev.weight + catches.reduce((sum, c) => sum + c.weight, 0),
    biggest,
    species: [...new Set([...prev.species, ...catches.map((c) => c.species)])],
    stats: addRaceStats(prev.stats, stats),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Muisti täynnä tai estetty: tilastot näkyvät silti tältä kisalta.
  }
  return next;
}
