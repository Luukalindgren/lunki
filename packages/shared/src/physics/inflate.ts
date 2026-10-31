import { Rng } from '../rng';
import { STAMINA, staminaThrust, type TubeInput } from './tube';

/**
 * Täyttökisa (#458): kisa alkaa rannalta tyhjällä renkaalla. Seisovalla
 * käsipumpulla täytetään kolme ponttoonia järjestyksessä (U:n vasen ja oikea
 * puolisko, niiden välissä istuin). Pääkonteksti (välilyönti, A/✕, PUMPPAA) on yksi veto:
 * kahva nousee takaisin noin 0,25 s:ssa, ja kesken nousun painettu veto on
 * vajaa. Täyden ponttoonin jälkeen letku siirretään seuraavaan nuolisarjalla;
 * väärä nuoli irrottaa letkun, sarja alkaa alusta, ja täytetystä ponttoonista
 * karkaa vähän ilmaa. Jaettu asiakkaan ja palvelimen kesken.
 */
export interface InflateState {
  /** Ponttoonien täyttö 0–1: vasen puolisko, oikea puolisko, istuin. */
  fill: [number, number, number];
  /** Ponttooni, jossa letku on (tai josta sitä siirretään). */
  valve: number;
  /** Letkun siirto seuraavaan käynnissä: montako nuolta sarjasta on osuttu. */
  moving: number | null;
  /** Kahvan korkeus 0–1 (1 = ylhäällä, täysi veto). */
  handle: number;
  /** Edellisen askeleen nuoli (Arrow), reunojen tunnistukseen. */
  arrow: number;
  /** Kisan siemen: nuolisarjat ovat kaikilla samat. */
  seed: number;
}

/** Nuolet: ylös (W), alas (S), vasen (A), oikea (D). 0 = ei nuolta. */
export const Arrow = { none: 0, up: 1, down: 2, left: 3, right: 4 } as const;

export const INFLATE = {
  /** Täysiä vetoja ponttoonia kohden: puoliskot ja istuin (Luuka: noin 75 yhteensä on sopiva). */
  strokes: [30, 30, 15],
  /** Kahva nousee alhaalta ylös (s). */
  handleTime: 0.25,
  /** Täysi veto kuluttaa kuntoa; levossa ja pumpatessa kunto palautuu puolella vauhdilla. */
  strokeDrain: 0.02,
  regen: 0.5,
  /** Letkun siirron nuolisarjan pituus: ensimmäinen ja toinen siirto. */
  sequence: [4, 5],
  /** Väärä nuoli päästää täytetystä ponttoonista näin monen vedon verran ilmaa. */
  leakStrokes: 3,
} as const;

/** Uusi tyhjä rengas, letku vasemmassa puoliskossa. */
export const createInflate = (seed: number): InflateState => ({
  fill: [0, 0, 0],
  valve: 0,
  moving: null,
  handle: 1,
  arrow: Arrow.none,
  seed: seed >>> 0,
});

/** Letkun siirron `k` (0 = puoliskosta toiseen, 1 = istuimeen) nuolisarja kisan siemenestä. */
export function inflateSequence(
  seed: number,
  k: number,
  n = INFLATE.sequence[k] ?? INFLATE.sequence[INFLATE.sequence.length - 1]!,
): number[] {
  const rng = new Rng(((seed >>> 0) ^ (0x9e3779b9 * (k + 1))) >>> 0);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    // Sama nuoli ei toistu peräkkäin: jokainen painallus on selvä reuna.
    let a: number;
    do a = 1 + Math.floor(rng.next() * 4);
    while (a === out[out.length - 1]);
    out.push(a);
  }
  return out;
}

/** Nuoli liikesyötteestä: W ylös, S alas, A vasen, D oikea (potku ensin). */
export function arrowOf(input: TubeInput): number {
  if (input.kick < 0) return Arrow.up;
  if (input.kick > 0) return Arrow.down;
  if (input.turn > 0) return Arrow.left;
  if (input.turn < 0) return Arrow.right;
  return Arrow.none;
}

/** Kaikki kolme ponttoonia täynnä. */
export const inflated = (s: InflateState): boolean => s.fill.every((f) => f >= 1);

/** Täyttö yhteensä 0–1 vetojen mukaan painotettuna (muiden palkkeihin). */
export function inflateProgress(s: InflateState): number {
  const total = INFLATE.strokes.reduce((a, b) => a + b, 0);
  return s.fill.reduce((sum, f, i) => sum + f * INFLATE.strokes[i]!, 0) / total;
}

/** Askeleen tulos: uusi tila ja kunto sekä tapahtumat äänille ja ilmoituksille. */
export interface InflateStep {
  state: InflateState;
  stamina: number;
  /** Veto tällä askeleella (0–1 vedon täyteys), ponttooni täyttyi, letku irtosi. */
  stroke: number;
  full: boolean;
  slipped: boolean;
}

/**
 * Yksi askel: kahva nousee, painallus vetää (kunto kuluu ja väsyneenä veto
 * heikkenee), ja täyden ponttoonin jälkeen nuolet siirtävät letkua.
 */
export function stepInflate(
  s: InflateState,
  input: TubeInput,
  stamina: number,
  dt: number,
): InflateStep {
  const fill: [number, number, number] = [...s.fill];
  let { valve, moving, handle } = s;
  let stroke = 0;
  let full = false;
  let slipped = false;
  const arrow = arrowOf(input);
  const pressedArrow = arrow !== Arrow.none && arrow !== s.arrow ? arrow : Arrow.none;
  handle = Math.min(1, handle + dt / INFLATE.handleTime);
  let st = Math.min(1, stamina + STAMINA.restRegen * INFLATE.regen * dt);
  if (moving !== null) {
    if (pressedArrow !== Arrow.none) {
      const seq = inflateSequence(s.seed, valve);
      if (seq[moving] === pressedArrow) {
        moving++;
        if (moving >= seq.length) {
          valve++;
          moving = null;
        }
      } else {
        // Letku irtosi: ilmaa karkaa, ja letku palaa täytettyyn ponttooniin.
        fill[valve] = Math.max(0, fill[valve]! - INFLATE.leakStrokes / INFLATE.strokes[valve]!);
        moving = null;
        slipped = true;
      }
    }
  } else if (input.main && fill[valve]! < 1) {
    stroke = handle;
    const amount = (handle * staminaThrust(st)) / INFLATE.strokes[valve]!;
    st = Math.max(0, st - INFLATE.strokeDrain * handle);
    handle = 0;
    // Pyöristysvara: 30 täyttä vetoa täyttää 30 vedon ponttoonin.
    const next = fill[valve]! + amount;
    fill[valve] = next >= 1 - 1e-9 ? 1 : next;
    if (fill[valve]! >= 1) {
      full = true;
      if (valve < 2) moving = 0;
    }
  }
  return {
    state: { ...s, fill, valve, moving, handle, arrow },
    stamina: st,
    stroke,
    full,
    slipped,
  };
}
