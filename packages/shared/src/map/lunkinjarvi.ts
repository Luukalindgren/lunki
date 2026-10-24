import data from './lunkinjarvi.json';
import type { LakeMap } from './types';

/**
 * Lunkinjärvi (Tammela) pelin karttamuodossa. Generoitu map-pipeline-paketilla
 * (`pnpm --filter @lunki/map-pipeline build-map`); älä muokkaa JSONia käsin.
 */
export const LUNKINJARVI: LakeMap = data;
