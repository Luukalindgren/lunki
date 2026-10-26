import { NATIVE_SPECIES } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { SPECIES_VERSION, migrateSpecies } from './speciesSettings';

describe('tallennettu lajisto (#225)', () => {
  it('vanhaan tallennukseen tulevat uudet omat lajit mukaan', () => {
    expect(migrateSpecies(['perch', 'pike', 'roach'], undefined)).toEqual(NATIVE_SPECIES);
    expect(migrateSpecies(['pike', 'zander'], undefined)).toEqual([
      'pike',
      'zander',
      'bream',
      'ruffe',
      'burbot',
    ]);
  });

  it('uuden version tallennus pysyy ennallaan', () => {
    expect(migrateSpecies(['pike', 'carp'], SPECIES_VERSION)).toEqual(['pike', 'carp']);
  });

  it('tuntemattomat lajit pois, tyhjästä oletuslajisto', () => {
    expect(migrateSpecies(['kala', 'perch'], SPECIES_VERSION)).toEqual(['perch']);
    expect(migrateSpecies([], SPECIES_VERSION)).toEqual(NATIVE_SPECIES);
    expect(migrateSpecies(null, undefined)).toEqual(NATIVE_SPECIES);
  });
});
