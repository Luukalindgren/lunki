import { isFly, type FishingState } from '@lunki/shared';
import type { Input } from '../engine/input';
import { hasKey, t, type MsgKey } from '../i18n';

/**
 * Yksi toimintokartta: jokaiselle pelaajan toiminnolle näppäimet, kosketusohjaimen
 * nappi tai ele sekä nimet ohjeisiin. Peli kysyy toimintoja eikä näppäimiä,
 * kosketusnapit painavat toimintoja suoraan, ja ohjetekstien {toiminto}-kohdat
 * täytetään tästä kartasta pelaajan ohjaustavan mukaan.
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
}

export const CONTROLS = {
  // Liikkuminen: W vie katseen suuntaan kohti räpylöitä, S selkä edellä (nopein potku).
  forward: { keys: ['KeyW', 'ArrowUp'], touch: 'ctl.stickUp' },
  back: { keys: ['KeyS', 'ArrowDown'], touch: 'ctl.stickDown' },
  left: { keys: ['KeyA', 'ArrowLeft'] },
  right: { keys: ['KeyD', 'ArrowRight'] },
  turn: { keys: [], label: 'ctl.turnKeys', touch: 'ctl.stickSide' },
  sprint: { keys: ['ShiftLeft', 'ShiftRight'], touch: 'ctl.stickEdge' },
  /**
   * Veneen soutaja: airot tai vapa (#263). Kosketuksella asento vaihtuu itse:
   * heitto vie vapaan ja soutaminen airoihin.
   */
  oars: { keys: ['KeyB'] },
  /** Ankkuri alas tai ylös: rengas ja veneen soutaja (#355). */
  anchor: { keys: ['KeyN'], touch: '⚓', title: 'touch.anchorTitle' },

  // Kalastus. Hiiren vasen ja sormi järvellä tähtäävät, heittävät ja kelaavat.
  pointer: { keys: ['Mouse0'], label: 'ctl.mouse', touch: 'ctl.finger' },
  castForward: { keys: ['Space'], touch: 'touch.cast', title: 'touch.castTitle' },
  reel: { keys: ['Space'], touch: 'touch.reel', title: 'touch.reelTitle' },
  cancel: { keys: ['KeyX'], touch: 'touch.cancel', title: 'touch.cancelTitle' },
  /** Hiiren oikea peruu latauksen; heitossa se on veto ja vedessä perhon nosto. */
  cancelCharge: { keys: ['Mouse2'] },
  gear: { keys: [], label: 'ctl.gearKeys', touch: 'ctl.gearButton' },
  gear1: { keys: ['Digit1'] },
  gear2: { keys: ['Digit2'] },
  gear3: { keys: ['Digit3'] },
  gearFast: { keys: ['Digit4'], touch: 'touch.gearFast' },
  /** Kosketuksen NOP-nappi kiertää vaihteet ja pikakelauksen. */
  gearNext: { keys: [], title: 'touch.gearTitle' },
  dragLess: { keys: ['KeyQ'], touch: 'touch.dragLess', title: 'touch.dragLessTitle' },
  dragMore: { keys: ['KeyE'], touch: 'touch.dragMore', title: 'touch.dragMoreTitle' },
  cut: { keys: ['KeyC'], touch: 'touch.cut', title: 'touch.cutTitle' },

  // Perho.
  backCast: { keys: [], label: 'ctl.mouseBack', touch: 'ctl.swipeDown' },
  forwardCast: { keys: [], label: 'ctl.mouseForward', touch: 'ctl.swipeUp' },
  /** Perhoheitto sormella: pyyhkäisy järvellä (hiirellä vavan liike, ei erillistä nimeä). */
  swipe: { keys: [], touch: 'ctl.swipe' },
  /** Siimakäsi heiton aikana: hiirellä vasen nappi (pointer), kosketuksella SIIMA. */
  lineGrip: { keys: [], label: 'key.mouseLeft', touch: 'touch.line', title: 'touch.lineTitle' },
  haul: { keys: ['Mouse2'], touch: 'touch.strip', title: 'touch.stripTitle' },
  strip: {
    keys: ['Space'],
    label: 'ctl.stripKeys',
    touch: 'touch.strip',
    title: 'touch.stripTitle',
  },
  lift: { keys: ['Mouse2'], touch: 'touch.lift', title: 'touch.liftTitle' },
  reelSlack: { keys: ['KeyF'], touch: 'touch.reelSlack', title: 'touch.reelSlackTitle' },
  flyPanel: { keys: ['KeyP'], touch: 'touch.depth' },

  // Työkalut.
  lure: { keys: ['KeyR'], touch: 'touch.lure', title: 'touch.lureTitle' },
  sonar: { keys: ['KeyK'], touch: 'touch.sonar', title: 'touch.sonarTitle' },
  lureSonar: { keys: ['KeyL'], touch: 'touch.depth', title: 'touch.depthTitle' },
  view: { keys: ['KeyV'], touch: 'touch.cam', title: 'touch.camTitle' },
  emote: { keys: ['KeyG'], touch: 'touch.emote', title: 'touch.emoteTitle' },
  zoom: { keys: [], label: 'ctl.wheel', touch: '+/−' },
  help: { keys: ['KeyH'], touch: '?', title: 'touch.helpTitle' },
  pause: { keys: ['Escape'], touch: 'II', title: 'touch.pauseTitle' },
  /** Taukovalikossa Backspace jatkaa peliä (muissa valikoissa se palaa takaisin). */
  resume: { keys: ['Backspace'] },
  /** Chat kuuntelee Enteriä itse (ui/chat.ts); tässä vain ohjetta varten. */
  chat: { keys: ['Enter'], touch: 'touch.chat', title: 'touch.chatTitle' },

  // Katsoja.
  spectate: { keys: [], label: 'ctl.spectateKeys', touch: 'ctl.tap' },
  next: { keys: ['ArrowRight', 'KeyD', 'Mouse0'] },
  prev: { keys: ['ArrowLeft', 'KeyA'] },

  // Kehittäjälle.
  palette: { keys: ['F2'] },
  fps: { keys: ['F3'] },
} as const satisfies Record<string, Binding>;

export type Action = keyof typeof CONTROLS;

/** Kosketusnapin painama toiminto syötteessä (ei ole oikea näppäin). */
const virtual = (a: Action) => `@${a}`;

/** Toimintojen tila askeleen syötteestä: näppäimet ja kosketusnapit yhdessä. */
export class Controls {
  constructor(readonly input: Input) {}

  isDown(a: Action): boolean {
    return this.input.isDown(virtual(a)) || CONTROLS[a].keys.some((k) => this.input.isDown(k));
  }

  wasPressed(a: Action): boolean {
    return (
      this.input.wasPressed(virtual(a)) || CONTROLS[a].keys.some((k) => this.input.wasPressed(k))
    );
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

/**
 * Tilannenappien toiminnot kosketuksella: iso nappi, perhon siimanappi ja
 * katkaisunappi tekevät eri asioita kalastuksen vaiheen mukaan.
 */
export interface ContextActions {
  /** Iso punainen nappi: HEITÄ, KELAA tai VETO. */
  main: 'castForward' | 'reel' | 'strip' | 'haul';
  /** Perhon nappi: SIIMA heitossa, NOSTA vedestä, KELALLE kalan kanssa. */
  line: 'lineGrip' | 'lift' | 'reelSlack';
  /** KATKO, heiton aikana PERU. */
  tool: 'cut' | 'cancel';
}

/**
 * Mitä tilannenapit tekevät nyt. `rhythm`: perhoa heitetään rytmissä
 * (välilyönti tai HEITÄ), jolloin iso nappi on yhä HEITÄ.
 */
export function contextActions(f: FishingState, rhythm: boolean): ContextActions {
  const fly = isFly(f.tackle);
  const inHand = fly && !f.onReel;
  const casting = f.stage === 'casting';
  const free = f.hookedId === null && f.struckId === null && f.snag === null && !f.onLand;
  return {
    main:
      f.stage === 'idle' || f.stage === 'charging' || (casting && rhythm)
        ? 'castForward'
        : casting
          ? 'haul'
          : inHand && f.stage === 'water'
            ? 'strip'
            : 'reel',
    line: f.stage !== 'water' ? 'lineGrip' : inHand && !free ? 'reelSlack' : 'lift',
    tool: f.stage === 'charging' || casting ? 'cancel' : 'cut',
  };
}

/** Näppäimen nimi ohjeessa: KeyW → W, ArrowUp → ↑, Space → välilyönti. */
export function keyName(code: string): string {
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

let touchMode = false;

/** Ohjaustapa ohjeteksteihin: kosketus vai näppäimistö ja hiiri. Asetetaan käynnistyksessä. */
export function setControlMode(touch: boolean): void {
  touchMode = touch;
}

/** Toiminnon ohjaus pelaajan ohjaustavalla, tai null, jos sitä ei ole. */
export function bindingText(a: Action, touch = touchMode): string | null {
  const b: Binding = CONTROLS[a];
  if (touch) {
    if (!b.touch) return null;
    return hasKey(b.touch) ? t(b.touch) : b.touch;
  }
  if (b.label) return t(b.label);
  const names = [...new Set(b.keys.map(keyName))];
  return names.length ? names.join('/') : null;
}

/**
 * Otsikko ja sen näppäin, esim. "Viehe (R)". Kosketuksella pelkkä otsikko:
 * nappi on samanniminen (VIEHE).
 */
export function withKey(label: MsgKey, a: Action, touch = touchMode): string {
  const b = touch ? null : bindingText(a, false);
  return b ? `${t(label)} (${b})` : t(label);
}

const isAction = (k: string): k is Action => Object.hasOwn(CONTROLS, k);

/**
 * Teksti, jonka {toiminto}-kohdat täytetään ohjauksella. Osat erotetaan
 * merkillä " · ": osa, jonka toimintoa ei ole tällä ohjaustavalla (tai joka
 * on `skip`-joukossa), jätetään pois. Rivin alku isolla kirjaimella.
 */
export function controlText(
  key: MsgKey,
  vars: Record<string, string | number> = {},
  opts: { touch?: boolean; skip?: readonly Action[] } = {},
): string {
  const touch = opts.touch ?? touchMode;
  return t(key, vars)
    .split('\n')
    .map((line) =>
      capitalize(
        line
          .split(' · ')
          .map((part) => fillPart(part, touch, opts.skip ?? []))
          .filter((p): p is string => p !== null)
          .join(' · '),
      ),
    )
    .filter((line) => line !== '')
    .join('\n');
}

function fillPart(part: string, touch: boolean, skip: readonly Action[]): string | null {
  let missing = false;
  const text = part.replace(/\{(\w+)\}/g, (m, k: string) => {
    if (!isAction(k)) return m;
    const b = skip.includes(k) ? null : bindingText(k, touch);
    if (b === null) missing = true;
    return b ?? '';
  });
  return missing ? null : text;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
