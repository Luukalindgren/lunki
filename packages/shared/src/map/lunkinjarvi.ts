import type { BottomFeatures } from './bottom';
import features from './lunkinjarvi-features.json';
import data from './lunkinjarvi.json';
import type { LakeMap } from './types';

/**
 * Lunkinjärvi (Tammela) pelin karttamuodossa. Generoitu map-pipeline-paketilla
 * (`pnpm --filter @lunki/map-pipeline build-map`); älä muokkaa JSONia käsin.
 */
export const LUNKINJARVI: LakeMap = data;

/**
 * Lunkinjärven pohjan arvio ja käsin lisätyt erikoismuodot. Tätä tiedostoa
 * saa muokata käsin (ks. docs/pohja.md).
 */
export const LUNKINJARVI_BOTTOM = features as BottomFeatures;
