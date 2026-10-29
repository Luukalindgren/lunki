import { REEL } from '@lunki/shared';
import {
  CONTROLS,
  bindingText,
  type Action,
  type ContextActions,
  type Controls,
} from '../game/controls';
import { onLangChange, t, type MsgKey } from '../i18n';

/** Tatin säde CSS-pikseleinä: näin pitkä työntö on täysi potku. */
const STICK_RADIUS = 52;
/** Tatin kuollut alue (osuus säteestä). */
const DEAD_ZONE = 0.35;
/** Tätä pidempi työntö ylös tai alas = pikapotku. */
const SPRINT_AT = 0.95;

/** Laitteessa on kosketusnäyttö pääosoittimena (tai ?kosketus kehitystä varten). */
export function isTouchDevice(): boolean {
  if (new URLSearchParams(location.search).has('kosketus')) return true;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/**
 * Puhelimen ja tabletin ohjaimet HUD:n päällä. Napit painavat toimintokartan
 * toimintoja (game/controls.ts) samoin kuin näppäimistö, joten peli ei erottele
 * ohjaustapoja. Pelikuvan koskettaminen toimii hiirenä (tähtäys, heitto, kelaus).
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly gearButton: HTMLButtonElement;
  private readonly chatButton: HTMLButtonElement;
  /** Paikanvaihto (#357): vain moninpelin veneessä. */
  private readonly seatButton: HTMLButtonElement;
  /** Iso punainen nappi: HEITÄ, KELAA tai VETO kalastuksen vaiheen mukaan. */
  private readonly mainButton: ContextButton<ContextActions['main']>;
  /** Perhon nappi: SIIMA heitossa, NOSTA vedestä, KELALLE kalan kanssa. */
  private readonly lineButton: ContextButton<ContextActions['line']>;
  /** KATKO, heiton aikana PERU. */
  private readonly toolButton: ContextButton<ContextActions['tool']>;
  private fly = false;
  /** VIESTI-nappi: avaa moninpelin chatin. */
  onChat: (() => void) | null = null;
  private stickPointer: number | null = null;
  private gear = 1;
  /** Nappien tekstit ja vihjeet nykyisellä kielellä. */
  private readonly relabels: (() => void)[] = [];

  constructor(
    parent: HTMLElement,
    private readonly controls: Controls,
  ) {
    this.root = div('touch-controls');

    const stick = div('touch-stick');
    this.knob = div('touch-stick-knob');
    stick.appendChild(this.knob);
    stick.addEventListener('pointerdown', (e) => {
      if (this.stickPointer !== null) return;
      this.stickPointer = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      this.moveStick(stick, e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) this.moveStick(stick, e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.setStick(0, 0);
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    // Napautus (click), jotta puhelin avaa näppäimistön kenttään siirryttäessä.
    this.chatButton = this.labelled(() => 'chat');
    this.chatButton.className = 'touch-chat';
    this.chatButton.hidden = true;
    this.chatButton.addEventListener('click', () => this.onChat?.());
    // Ankkuri liikkumisen vieressä: tatin yllä pystyssä, oikealla vaakatasossa (#355).
    const anchorButton = this.tap('anchor');
    anchorButton.classList.add('touch-anchor');
    this.seatButton = this.tap('seat');
    this.seatButton.classList.add('touch-seat');
    this.seatButton.hidden = true;
    // Kalastustapaa vaihdetaan harvoin: VAPA ankkurin luona, ei 3×3-ruudukossa.
    const methodButton = this.hold('method');
    methodButton.classList.add('touch-method');
    const tools = div('touch-tools');
    tools.append(
      this.tap('pause'),
      this.tap('help'),
      this.button('+', 'common.closer', () => controls.input.scroll(-1)),
      this.button('−', 'common.farther', () => controls.input.scroll(1)),
      this.chatButton,
    );

    this.gearButton = this.tap('gearNext');
    this.toolButton = this.contextButton<ContextActions['tool']>('cut');
    this.lineButton = this.contextButton<ContextActions['line']>('lineGrip');
    this.lineButton.b.hidden = true;
    const camButton = this.tap('view');
    camButton.classList.add('touch-cam');
    const grid = div('touch-grid');
    grid.append(
      this.hold('lure'),
      this.tap('sonar'),
      this.tap('lureSonar'),
      camButton,
      this.hold('emote'),
      this.tap('dragLess'),
      this.tap('dragMore'),
      this.gearButton,
      this.lineButton.b,
      this.toolButton.b,
    );
    this.mainButton = this.contextButton<ContextActions['main']>('castForward');
    this.mainButton.b.classList.add('touch-reel');
    const actions = div('touch-actions');
    actions.append(grid, this.mainButton.b);

    this.root.append(stick, anchorButton, this.seatButton, methodButton, tools, actions);
    parent.appendChild(this.root);
    this.relabel();
    onLangChange(() => this.relabel());
  }

  /** Nappien tekstit pelaajan kielellä. */
  private relabel(): void {
    for (const r of this.relabels) r();
    this.gearButton.textContent = this.gearLabel();
  }

  /** Vaihteen numero, pikakelauksella PIKA. */
  private gearLabel(): string {
    return this.gear === REEL.fastGear
      ? t('touch.gearFast')
      : t('touch.gear', { n: this.gear + 1 });
  }

  /** Chat on vain moninpelissä. */
  setMultiplayer(multiplayer: boolean): void {
    this.chatButton.hidden = !multiplayer;
  }

  /** Paikanvaihdon nappi näkyy moninpelin veneessä (#357). */
  setCrew(crew: boolean): void {
    if (this.seatButton.hidden === crew) this.seatButton.hidden = !crew;
  }

  /** Katsojalle vain näkymän napit: kalastajan ohjaimet eivät tee mitään (#280). */
  setSpectator(spectator: boolean): void {
    this.root.classList.toggle('spectator', spectator);
  }

  /**
   * Kalastuksen tilanne joka ruudulla: tilannenapit vaihtavat toimintoa
   * (contextActions), ja perhovälineillä SIIMA-nappi on kelausnopeuden tilalla.
   */
  update(context: ContextActions, fly: boolean, gear: number): void {
    if (fly !== this.fly) {
      this.fly = fly;
      this.lineButton.b.hidden = !fly;
      this.gearButton.hidden = fly;
    }
    this.mainButton.set(context.main);
    this.lineButton.set(context.line);
    this.toolButton.set(context.tool);
    if (gear !== this.gear) {
      this.gear = gear;
      this.gearButton.textContent = this.gearLabel();
    }
  }

  private moveStick(stick: HTMLElement, e: PointerEvent) {
    const r = stick.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / STICK_RADIUS;
    let y = (e.clientY - (r.top + r.height / 2)) / STICK_RADIUS;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.setStick(x, y);
  }

  /**
   * Tatin asento (-1…1, y alas) toiminnoiksi kuten W/S: ylös liikuttaa kohti
   * räpylöitä eli katseen suuntaan, alas selkä edellä (nopeampi potku).
   */
  private setStick(x: number, y: number) {
    this.knob.style.transform = `translate(${x * STICK_RADIUS}px, ${y * STICK_RADIUS}px)`;
    const kicking = Math.abs(y) > DEAD_ZONE;
    this.controls.set('forward', y < -DEAD_ZONE);
    this.controls.set('back', y > DEAD_ZONE);
    this.controls.set('left', x < -DEAD_ZONE);
    this.controls.set('right', x > DEAD_ZONE);
    this.controls.set('sprint', kicking && Math.hypot(x, y) >= SPRINT_AT);
  }

  /** Nappi, jonka teksti ja vihje tulevat toimintokartasta; teksti seuraa kieltä. */
  private labelled(action: () => Action): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    const relabel = () => {
      const a = action();
      const label = bindingText(a, true);
      if (label !== null) b.textContent = label;
      const title: MsgKey | undefined = (CONTROLS[a] as { title?: MsgKey }).title;
      b.title = title ? t(title) : '';
    };
    this.relabels.push(relabel);
    return b;
  }

  /** Napautus painaa toimintoa kerran. */
  private tap(action: Action): HTMLButtonElement {
    const b = this.labelled(() => action);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.controls.tap(action);
    });
    return b;
  }

  /**
   * Pohjassa pidettävä nappi: toiminto on pohjassa niin kauan kuin sormi on
   * päällä (VIEHE: napautus vaihtaa, pito avaa viehepakin, #365). Pikavalikossa
   * sormi liu'utetaan lohkon päälle ja irrotus valitsee sen (#387).
   */
  private hold(action: Action): HTMLButtonElement {
    const b = this.labelled(() => action);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      this.controls.set(action, true);
    });
    const up = () => this.controls.set(action, false);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return b;
  }

  /** Symbolinappi (+, −) omalla toiminnollaan. */
  private button(label: string, title: MsgKey, onPress: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    this.relabels.push(() => (b.title = t(title)));
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPress();
    });
    return b;
  }

  /**
   * Tilannenappi: pysyy pohjassa niin kauan kuin sormi on päällä. Toiminto
   * valitaan painettaessa, ja irrotus päästää saman toiminnon, vaikka teksti
   * ehtisi vaihtua kesken (esim. HEITÄ → KELAA heiton lähtiessä).
   */
  private contextButton<A extends Action>(initial: A): ContextButton<A> {
    let current = initial;
    let pressed: Action | null = null;
    const b = this.labelled(() => current);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      if (pressed) this.controls.set(pressed, false);
      pressed = current;
      this.controls.set(pressed, true);
    });
    const up = () => {
      b.classList.remove('down');
      if (pressed) this.controls.set(pressed, false);
      pressed = null;
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    const relabel = this.relabels[this.relabels.length - 1]!;
    return {
      b,
      set: (a) => {
        if (a === current) return;
        current = a;
        relabel();
      },
    };
  }
}

interface ContextButton<A extends Action> {
  b: HTMLButtonElement;
  set(action: A): void;
}

function div(className: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = className;
  return e;
}
