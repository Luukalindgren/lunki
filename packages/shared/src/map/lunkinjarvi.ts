import type { BottomFeatures } from './bottom';
import features from './lunkinjarvi-features.json';
import data from './lunkinjarvi.json';
import reeds from './lunkinjarvi-reeds.json';
import surroundings from './lunkinjarvi-surroundings.json';
import { roundRing } from './geometry';
import { planPiers } from './piers';
import type { LakeMap, LakeSurroundings } from './types';

/**
 * Lunkinjärvi (Tammela) pelin karttamuodossa. Generoitu map-pipeline-paketilla
 * (`pnpm --filter @lunki/map-pipeline build-map`); älä muokkaa JSONia käsin.
 * Laiturit päätellään rantamökeistä (ks. planPiers). Kaislikot on rajattu
 * käsin ilmakuvista (lunkinjarvi-reeds.json, saa muokata).
 */
/**
 * Rantaviivan kulmien pyöristys (m): OSM-rannan pitkät suorat ja terävät
 * kulmat näyttivät kulmikkailta. Pyöristys tehdään tässä, jotta peli,
 * palvelin ja kaikki rannasta lasketut asiat käyttävät samaa rantaa.
 */
const SHORE_ROUNDING = 5;

const rounded = {
  ...data,
  shore: roundRing(data.shore, SHORE_ROUNDING),
  islands: data.islands.map((ring) => roundRing(ring, SHORE_ROUNDING)),
};

export const LUNKINJARVI: LakeMap = {
  ...rounded,
  piers: planPiers(rounded, surroundings as LakeSurroundings),
  reeds: reeds.reeds,
};

/**
 * Lunkinjärven pohjan arvio ja käsin lisätyt erikoismuodot. Tätä tiedostoa
 * saa muokata käsin (ks. docs/pohja.md).
 */
export const LUNKINJARVI_BOTTOM = features as BottomFeatures;

/** Järven ympäristö: maankäyttö, rakennukset, tiet ja maasto (karttaputki, #19). */
export const LUNKINJARVI_SURROUNDINGS = surroundings as LakeSurroundings;
