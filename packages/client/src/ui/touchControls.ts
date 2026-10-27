import { REEL } from '@lunki/shared';
import type { Input } from '../engine/input';
import { hasKey, onLangChange, t, type MsgKey } from '../i18n';

/** Tatin säde CSS-pikseleinä: näin pitkä työntö on täysi potku. */
const STICK_RADIUS = 52;
/** Tatin kuollut alue (osuus säteestä). */
const DEAD_ZONE = 0.35;
/** Tätä pidempi työntö ylös tai alas = pikapotku. */
const SPRINT_AT = 0.95;
const GEARS = REEL.gears.length;

/** Laitteessa on kosketusnäyttö pääosoittimena (tai ?kosketus kehitystä varten). */
export function isTouchDevice(): boolean {
  if (new URLSearchParams(location.search).has('kosketus')) return true;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/**
 * Puhelimen ja tabletin ohjaimet HUD:n päällä. Napit syöttävät samoja
 * näppäinkoodeja kuin näppäimistö, joten peli ei erottele ohjaustapoja.
 * Pelikuvan koskettaminen toimii hiirenä (tähtäys, heitto, kelaus).
 */
export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly gearButton: HTMLButtonElement;
  private readonly cutButton: HTMLButtonElement;
  private readonly chatButton: HTMLButtonElement;
  /** Perhon siimakäsi (#236): pohjassa puristaa siimaa. */
  private readonly lineButton: HTMLButtonElement;
  private readonly reelButton: HTMLButtonElement;
  private readonly reelText: { label?: MsgKey; title: MsgKey };
  private fly = false;
  private flyInHand = false;
  /** Viehe ei ole vielä vedessä: KELAA on HEITÄ. */
  private castReady = false;
  /** VIESTI-nappi: avaa moninpelin chatin. */
  onChat: (() => void) | null = null;
  private stickPointer: number | null = null;
  private gear = 1;
  /** Nappien tekstit ja vihjeet sanakirjasta; symbolinapeilla (+, II) vain vihje. */
  private readonly texts: { b: HTMLButtonElement; label?: MsgKey; title: MsgKey }[] = [];

  constructor(
    parent: HTMLElement,
    private readonly input: Input,
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
    this.chatButton = document.createElement('button');
    this.chatButton.type = 'button';
    this.chatButton.className = 'touch-chat';
    this.texts.push({ b: this.chatButton, label: 'touch.chat', title: 'touch.chatTitle' });
    this.chatButton.hidden = true;
    this.chatButton.addEventListener('click', () => this.onChat?.());
    const tools = div('touch-tools');
    tools.append(
      this.tap('II', 'Escape', 'touch.pauseTitle'),
      this.tap('?', 'KeyH', 'touch.helpTitle'),
      this.button('+', 'common.closer', () => input.scroll(-1)),
      this.button('−', 'common.farther', () => input.scroll(1)),
      this.chatButton,
    );

    this.gearButton = this.button(null, 'touch.gearTitle', () =>
      this.tapKey(`Digit${((this.gear + 1) % GEARS) + 1}`),
    );
    this.cutButton = this.tap('touch.cut', 'KeyC', 'touch.cutTitle');
    this.lineButton = this.hold('touch.line', 'LineGrip', 'touch.lineTitle');
    this.lineButton.hidden = true;
    const camButton = this.tap('touch.cam', 'KeyV', 'touch.camTitle');
    camButton.classList.add('touch-cam');
    const grid = div('touch-grid');
    grid.append(
      this.tap('touch.lure', 'KeyR', 'touch.lureTitle'),
      this.tap('touch.sonar', 'KeyK', 'touch.sonarTitle'),
      this.tap('touch.depth', 'KeyL', 'touch.depthTitle'),
      camButton,
      this.tap('touch.emote', 'KeyG', 'touch.emoteTitle'),
      this.tap('touch.dragLess', 'KeyQ', 'touch.dragLessTitle'),
      this.tap('touch.dragMore', 'KeyE', 'touch.dragMoreTitle'),
      this.gearButton,
      this.lineButton,
      this.hold('touch.cancel', 'Mouse2', 'touch.cancelTitle'),
      this.cutButton,
    );
    // Ennen heittoa nappi on HEITÄ ja painaa välilyöntiä: heitto katsesuuntaan (#227).
    this.reelButton = this.hold(
      'touch.reel',
      () => (this.castReady && !this.fly ? 'Space' : 'Reel'),
      'touch.reelTitle',
    );
    this.reelButton.classList.add('touch-reel');
    this.reelText = this.texts[this.texts.length - 1]!;
    const actions = div('touch-actions');
    actions.append(grid, this.reelButton);

    this.root.append(stick, tools, actions);
    parent.appendChild(this.root);
    this.relabel();
    onLangChange(() => this.relabel());
  }

  /** Nappien tekstit pelaajan kielellä. */
  private relabel(): void {
    for (const { b, label, title } of this.texts) {
      if (label) b.textContent = t(label);
      b.title = t(title);
    }
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

  /** Katsojalle vain näkymän napit: kalastajan ohjaimet eivät tee mitään (#280). */
  setSpectator(spectator: boolean): void {
    this.root.classList.toggle('spectator', spectator);
  }

  /**
   * Perhovälineet (#236): SIIMA-nappi siimakädelle kelausnopeuden tilalle, ja
   * kun siima on kädessä, KELAA on VETO (uitto, heitossa siimakäden veto).
   */
  setFly(fly: boolean, inHand: boolean): void {
    if (fly === this.fly && inHand === this.flyInHand) return;
    this.fly = fly;
    this.flyInHand = inHand;
    this.lineButton.hidden = !fly;
    this.gearButton.hidden = fly;
    this.relabelReel();
  }

  /**
   * Viehe ei ole vielä vedessä (vapa valmiina tai heitto latautumassa): KELAA on
   * HEITÄ ja tekee saman kuin välilyönti. Perhoa heitetään yhä pyyhkäisyllä.
   */
  setCastReady(ready: boolean): void {
    if (ready === this.castReady) return;
    this.castReady = ready;
    this.relabelReel();
  }

  /** KELAA-napin teksti: HEITÄ ennen heittoa, perhon siima kädessä VETO. */
  private relabelReel(): void {
    const cast = this.castReady && !this.fly;
    const strip = this.fly && this.flyInHand;
    this.reelText.label = cast ? 'touch.cast' : strip ? 'touch.strip' : 'touch.reel';
    this.reelText.title = cast ? 'touch.castTitle' : strip ? 'touch.stripTitle' : 'touch.reelTitle';
    this.relabel();
  }

  /** Kelan vaihde napin tekstiin (0-pohjainen). */
  setGear(gear: number): void {
    if (gear === this.gear) return;
    this.gear = gear;
    this.gearButton.textContent = this.gearLabel();
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
   * Tatin asento (-1…1, y alas) näppäimiksi kuten W/S: ylös liikuttaa kohti
   * räpylöitä eli katseen suuntaan (W), alas selkä edellä (S, nopeampi potku).
   */
  private setStick(x: number, y: number) {
    this.knob.style.transform = `translate(${x * STICK_RADIUS}px, ${y * STICK_RADIUS}px)`;
    const kicking = Math.abs(y) > DEAD_ZONE;
    this.input.simulate('KeyW', y < -DEAD_ZONE);
    this.input.simulate('KeyS', y > DEAD_ZONE);
    this.input.simulate('KeyA', x < -DEAD_ZONE);
    this.input.simulate('KeyD', x > DEAD_ZONE);
    this.input.simulate('ShiftLeft', kicking && Math.hypot(x, y) >= SPRINT_AT);
  }

  private tapKey(code: string) {
    // Painallus ja irrotus samalle askeleelle: peli näkee "painettiin juuri".
    this.input.simulate(code, true);
    this.input.simulate(code, false);
  }

  private tap(label: MsgKey | string, code: string, title: MsgKey): HTMLButtonElement {
    return this.button(label, title, () => this.tapKey(code));
  }

  /** `label`: sanakirjan avain tai symboli (+, II); null = teksti asetetaan muualla. */
  private labelled(label: MsgKey | string | null, title: MsgKey): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    const key = label !== null && hasKey(label) ? label : undefined;
    if (!key && label !== null) b.textContent = label;
    this.texts.push({ b, label: key, title });
    return b;
  }

  private button(
    label: MsgKey | string | null,
    title: MsgKey,
    onPress: () => void,
  ): HTMLButtonElement {
    const b = this.labelled(label, title);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPress();
    });
    return b;
  }

  /**
   * Nappi, joka pysyy pohjassa niin kauan kuin sormi on päällä. Funktiona annettu
   * `code` valitaan painettaessa, ja irrotus päästää saman näppäimen.
   */
  private hold(label: MsgKey, code: string | (() => string), title: MsgKey): HTMLButtonElement {
    const b = this.labelled(label, title);
    let pressed: string | null = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      if (pressed) this.input.simulate(pressed, false);
      pressed = typeof code === 'string' ? code : code();
      this.input.simulate(pressed, true);
    });
    const up = () => {
      b.classList.remove('down');
      if (pressed) this.input.simulate(pressed, false);
      pressed = null;
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return b;
  }
}

function div(className: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = className;
  return e;
}
