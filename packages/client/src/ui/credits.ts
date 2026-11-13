import { AERIAL_CREDIT, LAKE_REGISTER_CREDIT, LUNKINJARVI_SURROUNDINGS } from '@lunki/shared';
import { t, type MsgKey } from '../i18n';

/** Selaimeen ja palvelimelle päätyvät kirjastot lisensseineen (tekijätietonäkymä). */
export const LIBRARIES: { name: string; nameKey?: MsgKey; license: string; url: string }[] = [
  { name: 'three.js', license: 'MIT', url: 'https://github.com/mrdoob/three.js' },
  { name: 'Colyseus', license: 'MIT', url: 'https://github.com/colyseus/colyseus' },
  { name: 'Zod', license: 'MIT', url: 'https://github.com/colinhacks/zod' },
  {
    name: 'VT323-fontti (Peter Hull), Fontsource',
    nameKey: 'credits.font',
    license: 'SIL Open Font License 1.1',
    url: 'https://fontsource.org/fonts/vt323',
  },
  {
    name: 'Alegreya Sans -fontti (Huerta Tipográfica), moderni ilme',
    nameKey: 'credits.fontAlegreya',
    license: 'SIL Open Font License 1.1',
    url: 'https://github.com/huertatipografica/Alegreya-Sans',
  },
  {
    name: 'Fraunces-fontti (Undercase Type), moderni ilme',
    nameKey: 'credits.fontFraunces',
    license: 'SIL Open Font License 1.1',
    url: 'https://github.com/undercasetype/Fraunces',
  },
];

/**
 * Kartta-aineiston lähdemaininta pelaajan kielellä. Maininnat tulevat
 * aineistojen mukana suomeksi; tuntematon (uusi lähde) näytetään sellaisenaan.
 */
export function creditText(credit: string): string {
  const [osm, dem] = LUNKINJARVI_SURROUNDINGS.attribution;
  const keys: [string | undefined, MsgKey][] = [
    [osm, 'credits.osm'],
    [dem, 'credits.dem'],
    [LAKE_REGISTER_CREDIT, 'credits.register'],
    [AERIAL_CREDIT, 'credits.aerial'],
  ];
  const key = keys.find(([text]) => text === credit)?.[1];
  return key ? t(key) : credit;
}
