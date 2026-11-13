import { loadGuide } from './guide';

/**
 * Ohjaustapa (#638): yksinkertainen tai täysi. Yksinkertaisella yksi nappi
 * heittää ja kelaa, kelaus nostaa pintaan väsyneen kalan, kelalla on yksi
 * nopeus, jarrua ei säädetä, kalastetaan vain virvelillä ja ohje on aina
 * lyhyt. Pelaajan oma valinta Asetuksissa kaikilla vaikeustasoilla: kisan
 * säännöt ja ennätyslistat eivät riipu siitä. Laitteen asetus kuten HUDin
 * koko, ei pelaajan profiilissa.
 *
 * Uuden pelaajan oletus on yksinkertainen. Laite, jolla on jo saatu kala
 * tai ohitettu opastus ennen tätä oletusta, jatkaa täydellä ohjauksella,
 * jolla siellä on tähänkin asti pelattu.
 */

export type ControlStyle = 'simple' | 'full';

const KEY = 'lunki.controlStyle';

let current: ControlStyle | null = null;

export function controlStyle(): ControlStyle {
  if (current) return current;
  try {
    current = defaultStyle(localStorage.getItem(KEY), loadGuide());
  } catch {
    current = 'simple';
  }
  return current;
}

/** Tallennettu valinta, muuten yksinkertainen; kokeneen pelaajan laitteella täysi. */
export function defaultStyle(
  saved: string | null,
  guide: { off: boolean; done: readonly string[] },
): ControlStyle {
  if (saved === 'simple' || saved === 'full') return saved;
  return guide.off || guide.done.includes('catch') ? 'full' : 'simple';
}

export function setControlStyle(style: ControlStyle): void {
  current = style;
  try {
    localStorage.setItem(KEY, style);
  } catch {
    // Tallennus estetty: valinta on voimassa tämän käynnin.
  }
}

/** Yksinkertainen ohjaus on käytössä. */
export const simpleControls = (): boolean => controlStyle() === 'simple';
