import type { BottomFeatures } from './bottom';
import features from './lunkinjarvi-features.json';
import data from './lunkinjarvi.json';
import reeds from './lunkinjarvi-reeds.json';
import surroundings from './lunkinjarvi-surroundings.json';
import { planPiers } from './piers';
import type { LakeMap, LakeSurroundings } from './types';

/**
 * Lunkinjärvi (Tammela) pelin karttamuodossa. Generoitu map-pipeline-paketilla
 * (`pnpm --filter @lunki/map-pipeline build-map`); älä muokkaa JSONia käsin.
 * Laiturit päätellään rantamökeistä (ks. planPiers). Kaislikot on rajattu
 * käsin ilmakuvista (lunkinjarvi-reeds.json, saa muokata).
 */
export const LUNKINJARVI: LakeMap = {
  ...data,
  piers: planPiers(data, surroundings as LakeSurroundings),
  reeds: reeds.reeds,
};

/**
 * Lunkinjärven pohjan arvio ja käsin lisätyt erikoismuodot. Tätä tiedostoa
 * saa muokata käsin (ks. docs/pohja.md).
 */
export const LUNKINJARVI_BOTTOM = features as BottomFeatures;

/** Järven ympäristö: maankäyttö, rakennukset, tiet ja maasto (karttaputki, #19). */
export const LUNKINJARVI_SURROUNDINGS = surroundings as LakeSurroundings;
