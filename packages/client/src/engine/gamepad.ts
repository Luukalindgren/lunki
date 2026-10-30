/**
 * Peliohjaimet selaimen Gamepad API:lla: Xbox-, PlayStation- ja muut
 * ohjaimet, joilla on selaimen vakioasettelu (`mapping: 'standard'`).
 * Napit ja tattien suunnat muutetaan koodeiksi (`Pad0`, `PadLsUp`…), jotka
 * syöte käsittelee kuten näppäimiä; toimintokartta (game/controls.ts)
 * päättää, mitä ne tekevät.
 *
 * Vakioasettelun napit: 0 A/✕, 1 B/○, 2 X/□, 3 Y/△, 4 LB/L1, 5 RB/R1,
 * 6 LT/L2, 7 RT/R2, 8 View/Create, 9 Menu/Options, 10 vasen tatti painettuna,
 * 11 oikea tatti painettuna, 12–15 ristiohjain ylös, alas, vasen, oikea.
 */

/** Ohjaimen merkintätapa napeille: Xbox (A B X Y) tai PlayStation (✕ ○ □ △). */
export type PadKind = 'xbox' | 'playstation';

/** Tatin liike, jota pienempää ei lueta (tatit eivät palaa aivan keskelle). */
export const PAD_DEAD_ZONE = 0.25;
/** Tatin suunta on "pohjassa" tästä taipumasta (liikkuminen, valikot). */
export const PAD_STICK_PRESS = 0.5;
/** Liipaisin on pohjassa tästä painumasta. */
const TRIGGER_PRESS = 0.3;

/** Vasemman tatin suunnat koodeina. */
export const STICK_CODES = ['PadLsUp', 'PadLsDown', 'PadLsLeft', 'PadLsRight'] as const;

/** Valikon toiminnot ohjaimesta (samat kuin ui/menuNav.ts:n NavAction). */
export type PadNavAction = 'up' | 'down' | 'left' | 'right' | 'select' | 'back';

/** Yhden askeleen ohjaintila: pohjassa olevat koodit ja oikea tatti. */
export interface PadFrame {
  readonly codes: ReadonlySet<string>;
  /** Oikea tatti kuolleen alueen jälkeen, -1…1 (y kasvaa alas). */
  readonly aim: { x: number; y: number };
  readonly kind: PadKind;
  /** Painoiko pelaaja jotain: ohjeet vaihtuvat ohjaimen napeiksi. */
  readonly active: boolean;
}

/**
 * Sonyn ohjaimet tunnistetaan valmistajan tunnuksesta (054c) tai nimestä;
 * Sonyn nimi voi olla pelkkä "Wireless Controller", joten Microsoftin (045e)
 * ohjain tarkistetaan ensin.
 */
export function padKind(id: string): PadKind {
  if (/xbox|045e/i.test(id)) return 'xbox';
  return /054c|playstation|dualshock|dualsense|wireless controller/i.test(id)
    ? 'playstation'
    : 'xbox';
}

/** Tatin akselit kuolleen alueen jälkeen: pieni liike nollaksi, loppu 0…1. */
export function deadZone(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < PAD_DEAD_ZONE) return { x: 0, y: 0 };
  const k = Math.min(1, (len - PAD_DEAD_ZONE) / (1 - PAD_DEAD_ZONE)) / len;
  return { x: x * k, y: y * k };
}

type PadLike = Pick<Gamepad, 'id' | 'buttons' | 'axes'>;

/** Yhden ohjaimen tila koodeina. */
export function readPad(pad: PadLike): PadFrame {
  const codes = new Set<string>();
  pad.buttons.forEach((b, i) => {
    // Liipaisimet ovat portaattomia: osa ohjaimista ilmoittaa vain arvon.
    if (b.pressed || b.value > TRIGGER_PRESS) codes.add(`Pad${i}`);
  });
  const lx = pad.axes[0] ?? 0;
  const ly = pad.axes[1] ?? 0;
  if (ly < -PAD_STICK_PRESS) codes.add('PadLsUp');
  if (ly > PAD_STICK_PRESS) codes.add('PadLsDown');
  if (lx < -PAD_STICK_PRESS) codes.add('PadLsLeft');
  if (lx > PAD_STICK_PRESS) codes.add('PadLsRight');
  const aim = deadZone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
  return {
    codes,
    aim,
    kind: padKind(pad.id),
    active: codes.size > 0 || Math.hypot(aim.x, aim.y) > PAD_STICK_PRESS,
  };
}

/** Kaikki kytketyt ohjaimet yhdessä; null, jos ohjaimia ei ole. */
export function readPads(pads: readonly (PadLike | null)[] = connectedPads()): PadFrame | null {
  let merged: PadFrame | null = null;
  for (const pad of pads) {
    if (!pad) continue;
    const frame = readPad(pad);
    if (!merged) merged = frame;
    else
      merged = {
        codes: new Set([...merged.codes, ...frame.codes]),
        aim:
          Math.hypot(frame.aim.x, frame.aim.y) > Math.hypot(merged.aim.x, merged.aim.y)
            ? frame.aim
            : merged.aim,
        kind: frame.active && !merged.active ? frame.kind : merged.kind,
        active: merged.active || frame.active,
      };
  }
  return merged;
}

function connectedPads(): readonly (Gamepad | null)[] {
  try {
    return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  } catch {
    // Upotetussa kehyksessä selain voi kieltää ohjaimet.
    return [];
  }
}

const NAV_CODES: Record<string, PadNavAction> = {
  Pad12: 'up',
  PadLsUp: 'up',
  Pad13: 'down',
  PadLsDown: 'down',
  Pad14: 'left',
  PadLsLeft: 'left',
  Pad15: 'right',
  PadLsRight: 'right',
  Pad0: 'select',
  Pad1: 'back',
};

/** Pohjassa pidetty suunta toistuu valikossa tämän viiveen jälkeen (s)… */
const REPEAT_DELAY = 0.4;
/** …ja sitten tällä välillä (s). */
const REPEAT_EVERY = 0.12;

/**
 * Valikon ohjaus ohjaimesta: ristiohjain ja vasen tatti liikkuvat, A/✕
 * valitsee ja B/○ palaa. Pohjassa pidetty suunta toistuu kuten näppäin.
 */
export class PadMenuRepeat {
  private held = new Map<PadNavAction, number>();

  /** Askeleen valikkotoiminnot; `now` sekunteina. */
  step(codes: ReadonlySet<string>, now: number): PadNavAction[] {
    const down = new Set<PadNavAction>();
    for (const c of codes) {
      const a = NAV_CODES[c];
      if (a) down.add(a);
    }
    const out: PadNavAction[] = [];
    for (const a of down) {
      const next = this.held.get(a);
      if (next === undefined) {
        out.push(a);
        this.held.set(a, now + REPEAT_DELAY);
      } else if (now >= next && a !== 'select' && a !== 'back') {
        out.push(a);
        this.held.set(a, Math.max(next + REPEAT_EVERY, now));
      }
    }
    for (const a of [...this.held.keys()]) if (!down.has(a)) this.held.delete(a);
    return out;
  }

  /**
   * Valikko aukesi: jo pohjassa olevat napit eivät tee mitään ennen irrotusta
   * (kelausnappi kisan lopussa ei valitse tulosnäkymän nappia).
   */
  hold(codes: ReadonlySet<string>): void {
    for (const c of codes) {
      const a = NAV_CODES[c];
      if (a) this.held.set(a, Infinity);
    }
  }
}
