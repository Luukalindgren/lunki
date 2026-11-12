/**
 * Peliohjaimen asetukset (#594): kääntymisen herkkyys, perhoheiton tatin
 * suunta ja kelaus pidolla tai kytkimenä. Laitteen asetus kuten HUDin koko,
 * ei pelaajan profiilissa. Värinä on ääniasetuksissa (`AudioSettings.rumble`),
 * koska se lähtee äänikartasta.
 */
export interface PadSettings {
  /** Kääntymisen herkkyys 0…1: osuus askelista, joilla tatin käännös vaikuttaa. */
  turn: number;
  /** Perhoheiton tatti käänteisenä: ylös = takaheitto, alas = eteenheitto. */
  flyInvert: boolean;
  /** Kelaus kytkimenä: painallus aloittaa kelauksen ja toinen lopettaa. */
  reelToggle: boolean;
}

/** Herkkyyden portaat; täysi (1) on sama kuin näppäimistöllä. */
export const PAD_TURNS: readonly number[] = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export const DEFAULT_PAD_SETTINGS: PadSettings = { turn: 1, flyInvert: false, reelToggle: false };

const KEY = 'lunki.pad';

let current: PadSettings | null = null;

export function parsePadSettings(raw: unknown): PadSettings {
  const s = { ...DEFAULT_PAD_SETTINGS };
  if (typeof raw !== 'object' || raw === null) return s;
  const r = raw as Partial<Record<keyof PadSettings, unknown>>;
  if (typeof r.turn === 'number' && PAD_TURNS.includes(r.turn)) s.turn = r.turn;
  if (typeof r.flyInvert === 'boolean') s.flyInvert = r.flyInvert;
  if (typeof r.reelToggle === 'boolean') s.reelToggle = r.reelToggle;
  return s;
}

/** Voimassa olevat asetukset; luetaan selaimesta ensimmäisellä kerralla. */
export function padSettings(): PadSettings {
  if (current) return current;
  try {
    current = parsePadSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    current = { ...DEFAULT_PAD_SETTINGS };
  }
  return current;
}

export function setPadSettings(s: PadSettings): void {
  current = { ...s };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ei haittaa
  }
}

/**
 * Kääntymisen herkkyys ilman uutta syötettä: palvelimelle käännös kulkee
 * arvoina -1, 0 ja 1 (`packInput`), joten pienempi herkkyys jättää osan
 * askelista väliin tasaisin välein. Renkaan hitaus tasoittaa tuloksen.
 */
export class TurnPulse {
  private acc = 0;

  step(turn: number, sensitivity: number): number {
    if (turn === 0 || sensitivity >= 1) {
      this.acc = 0;
      return turn;
    }
    // Kokonaislukuina (prosentteina): liukulukujen summa ajelehtisi.
    this.acc += Math.round(sensitivity * 100);
    if (this.acc < 100) return 0;
    this.acc -= 100;
    return turn;
  }
}

/**
 * Kelaus kytkimenä (#594): kun asetus on päällä ja viehe on vedessä,
 * painallus aloittaa kelauksen ja seuraava lopettaa. Muulloin kelaus on
 * pohjassa pidetty nappi kuten ennen.
 */
export class ReelLatch {
  private on = false;

  /** `held`: nappi pohjassa, `pressed`: painettiin juuri, `active`: kytkin käytössä nyt. */
  step(held: boolean, pressed: boolean, active: boolean): boolean {
    if (!active) {
      this.on = false;
      return held;
    }
    if (pressed) this.on = !this.on;
    return this.on;
  }
}
