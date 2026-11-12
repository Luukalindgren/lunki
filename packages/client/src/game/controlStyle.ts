/**
 * Ohjaustapa (#638): yksinkertainen tai täysi. Yksinkertaisella yksi nappi
 * heittää ja kelaa, kelaus nostaa pintaan väsyneen kalan, kelalla on yksi
 * nopeus, jarrua ei säädetä, kalastetaan vain virvelillä ja ohje on aina
 * lyhyt. Pelaajan oma valinta Asetuksissa kaikilla vaikeustasoilla: kisan
 * säännöt ja ennätyslistat eivät riipu siitä. Laitteen asetus kuten HUDin
 * koko, ei pelaajan profiilissa.
 */
export type ControlStyle = 'simple' | 'full';

const KEY = 'lunki.controlStyle';

let current: ControlStyle | null = null;

export function controlStyle(): ControlStyle {
  if (current) return current;
  try {
    current = localStorage.getItem(KEY) === 'simple' ? 'simple' : 'full';
  } catch {
    current = 'full';
  }
  return current;
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
