import { LUNKINJARVI, LUNKINJARVI_SURROUNDINGS } from './lunkinjarvi';

/** Järven perustiedot (pinta-ala, korkeustaso), joista pohja on arvioitu. */
export const LAKE_REGISTER_CREDIT =
  'Järven perustiedot: Suomen ympäristökeskus (Syke), järvirekisteri / Järvi-meriwiki, CC BY 4.0';

/**
 * Kartta-aineistojen lähdemaininnat. Rantaviivan ja ympäristön maininnat
 * tulevat aineistojen mukana, joten ne pysyvät ajan tasalla, jos lähde vaihtuu.
 */
export function mapCredits(): string[] {
  return [
    ...new Set([
      LUNKINJARVI.attribution,
      ...LUNKINJARVI_SURROUNDINGS.attribution,
      LAKE_REGISTER_CREDIT,
    ]),
  ];
}
