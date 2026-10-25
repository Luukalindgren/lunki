/**
 * Muiden kirjoittaman tekstin siistiminen (nimi, chat, palaute).
 *
 * Ohjausmerkit pois, myös C1-alue ja ESC: niillä voisi ohjata päätettä, jossa
 * palautteet luetaan (`pnpm report`). Näkymättömät suunta- ja leveysmerkit
 * pois, jottei nimeä voi naamioida toiseksi. Emojien yhdistäjä (U+200D) jää.
 */
// eslint-disable-next-line no-control-regex
export const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
export const INVISIBLE_CHARS = /[\u200b\u200c\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** Rivinvaihdot ja sarkaimet jäävät, muut ohjausmerkit ja näkymättömät pois. */
export const cleanMultiline = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '').replace(INVISIBLE_CHARS, '');
