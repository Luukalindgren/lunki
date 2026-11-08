import { NATIVE_SPECIES } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { SPECIES_VERSION, migrateSpecies } from './speciesSettings';

describe('tallennettu lajisto (#225)', () => {
  it('vanhaan tallennukseen tulevat uudet omat lajit mukaan', () => {
    expect(migrateSpecies(['perch', 'pike', 'roach'], undefined)).toEqual(NATIVE_SPECIES);
    expect(migrateSpecies(['pike', 'zander'], undefined)).toEqual([
      'pike',
      'zander',
      'ruffe',
      'whitefish',
    ]);
  });

  it('made ja lahna lisälajeiksi, siika mukaan (#535)', () => {
    expect(NATIVE_SPECIES).toEqual(['perch', 'pike', 'roach', 'ruffe', 'whitefish']);
    expect(migrateSpecies(['perch', 'pike', 'bream', 'ruffe', 'burbot', 'carp'], 2)).toEqual([
      'perch',
      'pike',
      'ruffe',
      'carp',
      'whitefish',
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
