import { NATIVE_SPECIES, SPECIES_IDS, isSpeciesId, type SpeciesId } from '@lunki/shared';

/**
 * Tallennettujen asetusten lajistoversio. Kun oletuslajistoon tulee uusia
 * omia lajeja, versio kasvaa ja vanhat tallennetut lajistot saavat ne mukaan.
 */
export const SPECIES_VERSION = 2;

/** Omat lajit, jotka tulivat oletuslajistoon kussakin versiossa. */
const ADDED_NATIVES: Record<number, readonly SpeciesId[]> = {
  2: ['bream', 'ruffe', 'burbot'],
};

/**
 * Tallennettu lajisto nykyiseen versioon: tuntemattomat lajit pois ja
 * uudet omat lajit mukaan (#225). Tyhjästä tulee oletuslajisto.
 */
export function migrateSpecies(saved: unknown, version: unknown): SpeciesId[] {
  const list = Array.isArray(saved) ? saved.filter(isSpeciesId) : [];
  if (list.length === 0) return [...NATIVE_SPECIES];
  const from = typeof version === 'number' && Number.isFinite(version) ? version : 1;
  const wanted = new Set<SpeciesId>(list);
  for (let v = from + 1; v <= SPECIES_VERSION; v++)
    for (const id of ADDED_NATIVES[v] ?? []) wanted.add(id);
  return SPECIES_IDS.filter((id) => wanted.has(id));
}
