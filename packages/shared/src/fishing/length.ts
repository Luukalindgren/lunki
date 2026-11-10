import type { SpeciesId } from './fish';

/**
 * Lajin kunto (Fultonin K): paino g = K · pituus³ / 100, pituus cm. Hauki ja
 * made ovat hoikkia, karppi ja lahna tanakoita.
 */
export const FISH_CONDITION: Record<SpeciesId, number> = {
  perch: 1.25,
  pike: 0.65,
  roach: 1.15,
  zander: 0.85,
  trout: 1.1,
  bream: 1.35,
  ruffe: 1.3,
  burbot: 0.6,
  ide: 1.2,
  rainbow: 1.2,
  carp: 1.6,
  whitefish: 1.0,
};

/**
 * Kalan pituus (cm) painosta lajin kunnolla (#577). Pituutta ei tallenneta,
 * vaan asiakas ja palvelin laskevat saman luvun samasta painosta.
 */
export function fishLengthCm(species: SpeciesId, weightKg: number): number {
  return Math.cbrt((Math.max(0, weightKg) * 1000 * 100) / FISH_CONDITION[species]);
}
