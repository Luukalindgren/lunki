import { isFly, type FishingState } from '@lunki/shared';
import type { PadKind } from '../engine/gamepad';
import type { Input } from '../engine/input';
import { hasKey, t, type MsgKey } from '../i18n';

/**
 * Yksi toimintokartta: jokaiselle pelaajan toiminnolle näppäimet, kosketusohjaimen
 * nappi tai ele, peliohjaimen napit sekä nimet ohjeisiin. Peli kysyy toimintoja
 * eikä näppäimiä, kosketusnapit painavat toimintoja suoraan, ja ohjetekstien
 * {toiminto}-kohdat täytetään tästä kartasta pelaajan ohjaustavan mukaan.
 */
interface Binding {
  /** KeyboardEvent.code tai hiiren nappi (Mouse0 = vasen, Mouse2 = oikea). */
  readonly keys: readonly string[];
  /** Näppäimistön ja hiiren nimi ohjeessa, kun se ei ole näppäin (hiiren liike, rulla). */
  readonly label?: MsgKey;
  /** Kosketusnapin teksti tai ele (sanakirjan avain tai symboli); puuttuu = ei kosketuksella. */
  readonly touch?: MsgKey | string;
  /** Kosketusnapin vihje (title). */
  readonly title?: MsgKey;
  /**
   * Peliohjaimen napit vakioasettelussa (`Pad0` = A/✕, ks. engine/gamepad.ts)
   * ja vasemman tatin suunnat (`PadLsUp`…).
   */
  readonly pad?: readonly string[];
  /** Peliohjaimen nimi ohjeessa, kun se ei ole nappi (oikea tatti). */
  readonly padLabel?: MsgKey;
}

/** Ristiohjain. */
const DPAD = { up: 'Pad12', down: 'Pad13', left: 'Pad14', right: 'Pad15' } as const;
/** A/✕ ja oikea liipaisin: heitto, kelaus ja nosto kuten välilyönti. */
const PAD_MAIN = ['Pad0', 'Pad7'];

export const CONTROLS = {
  // Liikkuminen: W vie katseen suuntaan kohti räpylöitä, S selkä edellä (nopein potku).
  forward: { keys: ['KeyW', 'ArrowUp'], touch: 'ctl.stickUp', pad: ['PadLsUp'] },
  back: { keys: ['KeyS', 'ArrowDown'], touch: 'ctl.stickDown', pad: ['PadLsDown'] },
  left: { keys: ['KeyA', 'ArrowLeft'], pad: ['PadLsLeft'] },
  right: { keys: ['KeyD', 'ArrowRight'], pad: ['PadLsRight'] },
  turn: { keys: [], label: 'ctl.turnKeys', touch: 'ctl.stickSide', padLabel: 'pad.stickSide' },
  /** Peliohjaimella vasen liipaisin: tatti on reunassa jo tavallisessa potkussa. */
  sprint: { keys: ['ShiftLeft', 'ShiftRight'], touch: 'ctl.stickEdge', pad: ['Pad6'] },
  /**
   * Veneen soutaja: airot tai vapa (#263). Kosketuksella asento vaihtuu itse:
   * heitto vie vapaan ja soutaminen airoihin.
   */
  oars: { keys: ['KeyB'] },
  /** Ankkuri alas tai ylös: rengas ja veneen soutaja (#355). */
  anchor: { keys: ['KeyN'], touch: '⚓', title: 'touch.anchorTitle', pad: ['Pad10'] },
  /**
   * Paikanvaihto veneessä (#357): vapaalle paikalle tai pyyntö vaihtaa; sama
   * toiminto hyväksyy toisen pyynnön.
   */
  seat: { keys: ['KeyT'], touch: '⇄', title: 'touch.seatTitle' },
  /**
   * Maalla (#457) pääkonteksti on välilyönti kuten heitto: renkaan otto,
   * lasku maahan ja vesirajassa kyytiin hyppy. Maalta ei heitetä, joten
   * napit eivät mene ristiin.
   */
  pickUp: { keys: ['Space'], touch: 'touch.pickUp', title: 'touch.pickUpTitle', pad: PAD_MAIN },
  putDown: { keys: ['Space'], touch: 'touch.putDown', title: 'touch.putDownTitle', pad: PAD_MAIN },
  board: { keys: ['Space'], touch: 'touch.board', title: 'touch.boardTitle', pad: PAD_MAIN },

  // Kalastus. Hiiren vasen ja sormi järvellä tähtäävät, heittävät ja kelaavat.
  pointer: { keys: ['Mouse0'], label: 'ctl.mouse', touch: 'ctl.finger' },
  /** Peliohjaimen oikea tatti kääntää heiton suunnan katsesuunnasta (castControl.ts). */
  aim: { keys: [], padLabel: 'pad.rightStick' },
  castForward: { keys: ['Space'], touch: 'touch.cast', title: 'touch.castTitle', pad: PAD_MAIN },
  reel: { keys: ['Space'], touch: 'touch.reel', title: 'touch.reelTitle', pad: PAD_MAIN },
  /**
   * Nosto väsytyksen lopuksi (#366): uusi painallus, kun kala on pinnassa.
   * Pohjassa pidetty kelaus ei nosta. Haavi isoimmille kaloille.
   */
  land: { keys: ['Space', 'Mouse0'], touch: 'touch.land', title: 'touch.landTitle', pad: PAD_MAIN },
  landNet: {
    keys: ['Space', 'Mouse0'],
    touch: 'touch.landNet',
    title: 'touch.landNetTitle',
    pad: PAD_MAIN,
  },
  cancel: { keys: ['KeyX'], touch: 'touch.cancel', title: 'touch.cancelTitle', pad: ['Pad1'] },
  /** Hiiren oikea peruu latauksen; heitossa se on veto ja vedessä perhon nosto. */
  cancelCharge: { keys: ['Mouse2'] },
  gear: { keys: [], label: 'ctl.gearKeys', touch: 'ctl.gearButton', pad: [DPAD.right] },
  gear1: { keys: ['Digit1'] },
  gear2: { keys: ['Digit2'] },
  gear3: { keys: ['Digit3'] },
  gearFast: { keys: ['Digit4'], touch: 'touch.gearFast' },
  /** Kosketuksen NOP-nappi ja ristiohjain oikealle kiertävät vaihteet ja pikakelauksen. */
  gearNext: { keys: [], title: 'touch.gearTitle', pad: [DPAD.right] },
  dragLess: {
    keys: ['KeyQ'],
    touch: 'touch.dragLess',
    title: 'touch.dragLessTitle',
    pad: [DPAD.down],
  },
  dragMore: {
    keys: ['KeyE'],
    touch: 'touch.dragMore',
    title: 'touch.dragMoreTitle',
    pad: [DPAD.up],
  },
  cut: { keys: ['KeyC'], touch: 'touch.cut', title: 'touch.cutTitle', pad: [DPAD.left] },
  /** Virvelin nykäisy (#363): hiiren oikea tai J, kosketuksella KATKO-napin paikalla. */
  twitch: {
    keys: ['Mouse2', 'KeyJ'],
    touch: 'touch.twitch',
    title: 'touch.twitchTitle',
    pad: ['Pad2'],
  },

  // Perho.
  backCast: { keys: [], label: 'ctl.mouseBack', touch: 'ctl.swipeDown' },
  forwardCast: { keys: [], label: 'ctl.mouseForward', touch: 'ctl.swipeUp' },
  /** Perhoheitto sormella: pyyhkäisy järvellä (hiirellä vavan liike, ei erillistä nimeä). */
  swipe: { keys: [], touch: 'ctl.swipe' },
  /**
   * Siimakäsi heiton aikana: välilyönti tai hiiren vasen (pointer), kosketuksella
   * SIIMA. Käsi on automaattinen, kunnes pelaaja painaa sitä (#400). Sormi
   * järvellä on myös Mouse0, joten hiiren nappi luetaan pointerista.
   */
  lineGrip: {
    keys: ['Space'],
    label: 'ctl.lineGripKeys',
    touch: 'touch.line',
    title: 'touch.lineTitle',
    pad: PAD_MAIN,
  },
  /** Siimakäden veto heiton aikana: kosketuslevyllä F toisella kädellä (#400). */
  haul: {
    keys: ['Mouse2', 'KeyF'],
    touch: 'touch.strip',
    title: 'touch.stripTitle',
    pad: ['Pad2'],
  },
  strip: {
    keys: ['Space'],
    label: 'ctl.stripKeys',
    touch: 'touch.strip',
    title: 'touch.stripTitle',
    pad: PAD_MAIN,
  },
  lift: { keys: ['Mouse2'], touch: 'touch.lift', title: 'touch.liftTitle', pad: ['Pad2'] },
  reelSlack: {
    keys: ['KeyF'],
    touch: 'touch.reelSlack',
    title: 'touch.reelSlackTitle',
    pad: ['Pad1'],
  },
  flyPanel: { keys: ['KeyP'], touch: 'touch.depth' },

  // Työkalut.
  lure: { keys: ['KeyR'], touch: 'touch.lure', title: 'touch.lureTitle', pad: ['Pad4'] },
  /** Kalastustavan pikavalikko kisan aikana: virveli tai perho. */
  method: { keys: ['KeyM'], touch: 'touch.method', title: 'touch.methodTitle', pad: ['Pad5'] },
  sonar: { keys: ['KeyK'], touch: 'touch.sonar', title: 'touch.sonarTitle', pad: ['Pad11'] },
  lureSonar: { keys: ['KeyL'], touch: 'touch.depth', title: 'touch.depthTitle' },
  view: { keys: ['KeyV'], touch: 'touch.cam', title: 'touch.camTitle', pad: ['Pad3'] },
  emote: { keys: ['KeyG'], touch: 'touch.emote', title: 'touch.emoteTitle', pad: ['Pad8'] },
  zoom: { keys: [], label: 'ctl.wheel', touch: '+/−' },
  help: { keys: ['KeyH'], touch: '?', title: 'touch.helpTitle' },
  pause: { keys: ['Escape'], touch: 'II', title: 'touch.pauseTitle', pad: ['Pad9'] },
  /** Taukovalikossa Backspace tai B/○ jatkaa peliä (muissa valikoissa se palaa takaisin). */
  resume: { keys: ['Backspace'], pad: ['Pad1'] },
  /** Chat kuuntelee Enteriä itse (ui/chat.ts); tässä vain ohjetta varten. */
  chat: { keys: ['Enter'], touch: 'touch.chat', title: 'touch.chatTitle' },

  // Katsoja.
  spectate: { keys: [], label: 'ctl.spectateKeys', touch: 'ctl.tap', pad: ['Pad0'] },
  next: { keys: ['ArrowRight', 'KeyD', 'Mouse0'], pad: ['Pad0', 'PadLsRight', DPAD.right] },
  prev: { keys: ['ArrowLeft', 'KeyA'], pad: ['PadLsLeft', DPAD.left] },

  // Kehittäjälle.
  palette: { keys: ['F2'] },
  fps: { keys: ['F3'] },
} as const satisfies Record<string, Binding>;

export type Action = keyof typeof CONTROLS;

/** Kosketusnapin painama toiminto syötteessä (ei ole oikea näppäin). */
const virtual = (a: Action) => `@${a}`;

/** Toiminnon näppäimet ja peliohjaimen napit syötteen koodeina. */
const CODES = {} as Record<Action, readonly string[]>;
for (const a of Object.keys(CONTROLS) as Action[]) {
  const b: Binding = CONTROLS[a];
  CODES[a] = [...b.keys, ...(b.pad ?? [])];
}

/** Toimintojen tila askeleen syötteestä: näppäimet, peliohjain ja kosketusnapit yhdessä. */
export class Controls {
  constructor(readonly input: Input) {}

  isDown(a: Action): boolean {
    return this.input.isDown(virtual(a)) || CODES[a].some((k) => this.input.isDown(k));
  }

  wasPressed(a: Action): boolean {
    return this.input.wasPressed(virtual(a)) || CODES[a].some((k) => this.input.wasPressed(k));
  }

  /** Kosketusnappi pohjaan tai irti. */
  set(a: Action, down: boolean): void {
    this.input.simulate(virtual(a), down);
  }

  /** Napautus: painallus ja irrotus samalle askeleelle, peli näkee "painettiin juuri". */
  tap(a: Action): void {
    this.set(a, true);
    this.set(a, false);
  }
}

/** Ison napin toiminto maalla (#457). */
export type ShoreMain = 'pickUp' | 'putDown' | 'board';

/**
 * Tilannenappien toiminnot kosketuksella: iso nappi, perhon siimanappi ja
 * katkaisunappi tekevät eri asioita kalastuksen vaiheen mukaan.
 */
export interface ContextActions {
  /** Iso punainen nappi: HEITÄ, KELAA, VETO, nostossa NOSTA/HAAVI ja maalla OTA/LASKE/KYYTIIN. */
  main: 'castForward' | 'reel' | 'strip' | 'haul' | 'land' | 'landNet' | ShoreMain;
  /** Perhon nappi: SIIMA heitossa, NOSTA vedestä ja tärpissä, KELALLE kalan kanssa. */
  line: 'lineGrip' | 'lift' | 'reelSlack';
  /** KATKO, heiton aikana PERU, virvelin vapaalla vieheellä ja tärpissä NYKÄISE. */
  tool: 'cut' | 'cancel' | 'twitch';
}

/**
 * Mitä tilannenapit tekevät nyt. `rhythm`: perhoa heitetään rytmissä
 * (välilyönti tai HEITÄ), jolloin iso nappi on yhä HEITÄ. `tangled`: siima
 * on sotkussa toisen kanssa, ja KATKO katkaisee sen.
 */
export function contextActions(
  f: FishingState,
  rhythm: boolean,
  tangled = false,
  /** Maalla (#457): pääkonteksti renkaalle; null = maalla, mutta rengas ei ulotu. */
  shore?: ShoreMain | null,
): ContextActions {
  const fly = isFly(f.tackle);
  const inHand = fly && !f.onReel;
  const casting = f.stage === 'casting';
  const free = f.hookedId === null && f.struckId === null && f.snag === null && !f.onLand;
  return {
    main: shore
      ? shore
      : f.landing
        ? f.landing.net
          ? 'landNet'
          : 'land'
        : f.stage === 'idle' || f.stage === 'charging' || (casting && rhythm)
          ? 'castForward'
          : casting
            ? 'haul'
            : inHand && f.stage === 'water'
              ? 'strip'
              : 'reel',
    // Tärpissä NOSTA on vastaisku (#399).
    line:
      f.stage !== 'water'
        ? 'lineGrip'
        : inHand && !free && f.struckId === null
          ? 'reelSlack'
          : 'lift',
    tool:
      f.stage === 'charging' || casting
        ? 'cancel'
        : !fly && f.stage === 'water' && (free || f.struckId !== null) && !tangled
          ? 'twitch'
          : 'cut',
  };
}

/** Peliohjaimen nappien nimet vakioasettelun järjestyksessä. */
const PAD_NAMES: Record<PadKind, readonly string[]> = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS'],
  playstation: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3'],
};

const ARROWS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
};

/** Peliohjaimen napin nimi: Pad0 → A tai ✕, Pad12 → ✚↑, PadLsUp → vasen tatti ↑. */
function padName(code: string, kind: PadKind): string {
  const stick = /^PadLs(\w+)$/.exec(code);
  if (stick) return `${t('pad.leftStick')} ${ARROWS[stick[1]!] ?? ''}`;
  const i = Number(code.slice(3));
  const dpad = ['Up', 'Down', 'Left', 'Right'][i - 12];
  if (dpad) return `✚${ARROWS[dpad]}`;
  return PAD_NAMES[kind][i] ?? code;
}

/** Näppäimen nimi ohjeessa: KeyW → W, ArrowUp → ↑, Space → välilyönti, Pad0 → A. */
export function keyName(code: string, kind: PadKind = padKind): string {
  if (code.startsWith('Pad')) return padName(code, kind);
  const named: Partial<Record<string, MsgKey>> = {
    Space: 'key.space',
    Mouse0: 'key.mouseLeft',
    Mouse2: 'key.mouseRight',
    Escape: 'key.esc',
  };
  const key = named[code];
  if (key) return t(key);
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Shift')) return 'Shift';
  const arrows: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  };
  return arrows[code] ?? code;
}

/** Ohjaustapa ohjeteksteihin: näppäimistö ja hiiri, kosketus tai peliohjain. */
export type ControlMode = 'keys' | 'touch' | 'pad';

let mode: ControlMode = 'keys';
let padKind: PadKind = 'xbox';

/**
 * Ohjaustapa ohjeteksteihin. Asetetaan käynnistyksessä ja aina, kun pelaaja
 * vaihtaa näppäimistön tai kosketuksen peliohjaimeen tai takaisin.
 */
export function setControlMode(m: ControlMode, kind: PadKind = padKind): void {
  mode = m;
  padKind = kind;
}

export function controlMode(): ControlMode {
  return mode;
}

/** Toiminnon ohjaus pelaajan ohjaustavalla, tai null, jos sitä ei ole. */
export function bindingText(a: Action, m: ControlMode = mode): string | null {
  const b: Binding = CONTROLS[a];
  if (m === 'touch') {
    if (!b.touch) return null;
    return hasKey(b.touch) ? t(b.touch) : b.touch;
  }
  if (m === 'pad') {
    if (b.padLabel) return t(b.padLabel);
    const names = [...new Set((b.pad ?? []).map((c) => keyName(c)))];
    return names.length ? names.join('/') : null;
  }
  if (b.label) return t(b.label);
  const names = [...new Set(b.keys.map((c) => keyName(c)))];
  return names.length ? names.join('/') : null;
}

/**
 * Otsikko ja sen näppäin, esim. "Viehe (R)" tai peliohjaimella "Viehe (LB)".
 * Kosketuksella pelkkä otsikko: nappi on samanniminen (VIEHE).
 */
export function withKey(label: MsgKey, a: Action, m: ControlMode = mode): string {
  const b = m === 'touch' ? null : bindingText(a, m);
  return b ? `${t(label)} (${b})` : t(label);
}

const isAction = (k: string): k is Action => Object.hasOwn(CONTROLS, k);

/**
 * Teksti, jonka {toiminto}-kohdat täytetään ohjauksella. Osat erotetaan
 * merkillä " · ": osa, jonka toimintoa ei ole tällä ohjaustavalla (tai joka
 * on `skip`-joukossa), jätetään pois. `{a|b}` on "a tai b" niistä, jotka
 * ohjaustavalla on. Rivin alku isolla kirjaimella.
 */
export function controlText(
  key: MsgKey,
  vars: Record<string, string | number> = {},
  opts: { mode?: ControlMode; skip?: readonly Action[] } = {},
): string {
  const m = opts.mode ?? mode;
  return t(key, vars)
    .split('\n')
    .map((line) =>
      capitalize(
        line
          .split(' · ')
          .map((part) => fillPart(part, m, opts.skip ?? []))
          .filter((p): p is string => p !== null)
          .join(' · '),
      ),
    )
    .filter((line) => line !== '')
    .join('\n');
}

function fillPart(part: string, m: ControlMode, skip: readonly Action[]): string | null {
  let missing = false;
  const text = part.replace(/\{(\w+(?:\|\w+)*)\}/g, (whole, ks: string) => {
    const actions = ks.split('|');
    if (!actions.every(isAction)) return whole;
    const names = actions
      .map((a) => (skip.includes(a) ? null : bindingText(a, m)))
      .filter((b): b is string => b !== null);
    const unique = [...new Set(names)];
    if (unique.length === 0) missing = true;
    return unique.join(` ${t('ctl.or')} `);
  });
  return missing ? null : text;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
