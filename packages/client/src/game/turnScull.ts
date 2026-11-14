/**
 * Paikallaan kääntyminen (A/D): räpylät meloo vuorotellen eteen ja taakse ja
 * kääntyvät käännöksen suuntaan. Liike lasketaan suunnasta, joten räpylät
 * liikkuvat täsmälleen renkaan kääntymisen tahdissa samalla tavalla omalla
 * ja muiden renkaalla, kaikissa näkymissä.
 */
export const SCULL = {
  /** Edestakaisia vetoja täydellä kierroksella (kokonaisluku: suunta kiertyy ±π:ssä ympäri). */
  strokes: 9,
  /** Kulmanopeus (rad/s), jolla veto on täysimittainen. */
  full: 0.5,
  /** Räpylän liike eteen ja taakse renkaan mallissa (m). */
  reach: 0.2,
  /** Räpylän kääntö käännöksen suuntaan (rad). */
  yaw: 0.4,
  /** Kalastajan silmin: säären heilahdus (rad). */
  swing: 0.1,
  /** Potkiessa melonta jää potkun alle: osuus liikkeestä. */
  kicking: 0.35,
} as const;

export interface Scull {
  /** Vasemman räpylän vaihe −1…1; oikea on vastakkainen. */
  wave: number;
  /** Liikkeen laajuus 0–1 kääntymisen nopeudesta. */
  strength: number;
  /** Käännös −1…1 (+ = vasemmalle). */
  turn: number;
}

export const NO_SCULL: Scull = { wave: 0, strength: 0, turn: 0 };

/** Räpylöiden melonta renkaan suunnasta (rad) ja kulmanopeudesta (rad/s). */
export function turnScull(heading: number, angVel: number): Scull {
  const turn = Math.max(-1, Math.min(1, angVel / SCULL.full));
  const k = Math.abs(turn);
  return { wave: Math.sin(heading * SCULL.strokes), strength: k * k * (3 - 2 * k), turn };
}
