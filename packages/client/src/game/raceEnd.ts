/**
 * Kisan lopun merkit (#566): ilmoitus minuuttia ennen ja viimeiset
 * kymmenen sekuntia isoina numeroina lähtölaskennan paikalla. Laskee
 * kellosta, mitä tällä askeleella kuuluu näyttää ja soittaa.
 */

/** Viimeisen minuutin raja (s). */
export const LAST_MINUTE = 60;
/** Loppulaskennan pituus (s). */
export const FINAL_COUNT = 10;

export interface RaceEndCue {
  /** Kello ylitti minuutin rajan tällä askeleella. */
  minute: boolean;
  /** Loppulaskennan numero, kun se vaihtui tällä askeleella (piippaus). */
  tick: number | null;
  /** Loppulaskennan numero näkyviin, tai null. */
  count: number | null;
}

/** `prev` on edellisen askeleen jäljellä oleva aika, null ensimmäisellä askeleella. */
export function raceEndCue(prev: number | null, left: number): RaceEndCue {
  const count = left > 0 && left <= FINAL_COUNT ? Math.ceil(left) : null;
  const prevCount = prev !== null && prev > 0 && prev <= FINAL_COUNT ? Math.ceil(prev) : null;
  return {
    minute: prev !== null && prev > LAST_MINUTE && left <= LAST_MINUTE && left > 0,
    tick: count !== null && count !== prevCount ? count : null,
    count,
  };
}
