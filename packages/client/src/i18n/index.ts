import { en } from './en';
import { fi } from './fi';

/**
 * Pelin kielet. Suomi on lähdekieli: sen sanakirja määrää avaimet, ja
 * englannista puuttuva avain on käännösvirhe (ks. en.ts).
 */
export type Lang = 'fi' | 'en';
export const LANGS: readonly Lang[] = ['fi', 'en'];
export type MsgKey = keyof typeof fi;
export type Dictionary = Record<MsgKey, string>;
type Vars = Record<string, string | number>;

const DICTS: Record<Lang, Dictionary> = { fi, en };
const KEY = 'lunki.lang';

/** Tallennettu valinta, muuten selaimen kieli: suomi vain suomenkieliselle selaimelle. */
export function detectLang(saved: string | null, browser: string | undefined): Lang {
  if (saved === 'fi' || saved === 'en') return saved;
  return browser?.toLowerCase().startsWith('fi') ? 'fi' : 'en';
}

function savedLang(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let current: Lang = detectLang(
  savedLang(),
  typeof navigator === 'undefined' ? undefined : navigator.language,
);
const listeners = new Set<() => void>();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLang = (): Lang => current;

/** Vaihtaa kielen heti: valikot piirretään uudelleen ja HUD päivittää tekstinsä. */
export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Selaimen muisti ei käytössä: valinta kestää tämän käynnin.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn();
}

/** Kuuntelee kielen vaihtoa; palauttaa kuuntelun lopetuksen. */
export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Käännös avaimella; `{nimi}` korvautuu muuttujalla. */
export function t(key: MsgKey, vars?: Vars): string {
  const text = DICTS[current][key] ?? fi[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Onko avain olemassa (esim. tietokannasta tulevan arvon käännös). */
export const hasKey = (key: string): key is MsgKey => Object.hasOwn(fi, key);

/** Desimaaliluku kielen mukaan: suomeksi pilkulla, englanniksi pisteellä. */
export function decimal(v: number, digits = 1): string {
  const s = v.toFixed(digits);
  return current === 'fi' ? s.replace('.', ',') : s;
}

/** Desimaaliluku ilman turhia nollia (esim. tuuli 4,6 m/s, siima 3,5 kg). */
export const shortDecimal = (v: number): string =>
  current === 'fi' ? String(v).replace('.', ',') : String(v);

/** Paino: alle kilon grammoina, muuten kahdella desimaalilla. */
export function formatWeight(kg: number): string {
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${decimal(kg, 2)} kg`;
}

/** Järjestysluku: suomeksi "2.", englanniksi "2nd". */
export function ordinal(n: number): string {
  if (current === 'fi') return `${n}.`;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

const MONTHS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Päivämäärä: suomeksi 25.10.2026, englanniksi 25 Oct 2026. */
export function formatDay(day: number, month: number, year: number | string): string {
  return current === 'fi'
    ? `${day}.${month}.${year}`
    : `${day} ${MONTHS_EN[month - 1] ?? month} ${year}`;
}

/** Kellonaika: suomeksi "klo 19.40", englanniksi "19:40". */
export function formatClock(hours: number, minutes: number): string {
  const mm = String(minutes).padStart(2, '0');
  return current === 'fi' ? `klo ${hours}.${mm}` : `${hours}:${mm}`;
}

/** Testejä varten: kieli ilman tallennusta ja kuuntelijoita. */
export function setLangForTest(lang: Lang): void {
  current = lang;
}
