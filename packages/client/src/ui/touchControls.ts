import type { Input } from '../engine/input';

/** Tatin säde CSS-pikseleinä: näin pitkä työntö on täysi potku. */
const STICK_RADIUS = 52;
/** Tatin kuollut alue (osuus säteestä). */
const DEAD_ZONE = 0.35;
/** Tätä pidempi työntö eteenpäin = pikapotku. */
const SPRINT_AT = 0.95;
const GEARS = 3;

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
  /** VIESTI-nappi: avaa moninpelin chatin. */
  onChat: (() => void) | null = null;
  private stickPointer: number | null = null;
  private gear = 1;

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
    this.chatButton.textContent = 'VIESTI';
    this.chatButton.title = 'Kirjoita viesti muille';
    this.chatButton.hidden = true;
    this.chatButton.addEventListener('click', () => this.onChat?.());
    const tools = div('touch-tools');
    tools.append(
      this.tap('II', 'Escape', 'Tauko'),
      this.tap('?', 'KeyH', 'Ohje'),
      this.button('+', 'Lähemmäs', () => input.scroll(-1)),
      this.button('−', 'Kauemmas', () => input.scroll(1)),
      this.chatButton,
    );

    this.gearButton = this.button('NOP 2', 'Kelausnopeus', () =>
      this.tapKey(`Digit${((this.gear + 1) % GEARS) + 1}`),
    );
    this.cutButton = this.tap('KATKO', 'KeyC', 'Katkaise siima');
    const grid = div('touch-grid');
    grid.append(
      this.tap('VIEHE', 'KeyR', 'Vaihda viehe'),
      this.tap('LUOT', 'KeyK', 'Kaikuluotain'),
      this.tap('SYV', 'KeyL', 'Vieheen syvyys'),
      this.tap('KAM', 'KeyV', 'Kalastajan silmin'),
      this.tap('JAR−', 'KeyQ', 'Jarru löysemmälle'),
      this.tap('JAR+', 'KeyE', 'Jarru kireämmälle'),
      this.gearButton,
      this.hold('PERU', 'Mouse2', 'Peru heitto'),
      this.cutButton,
    );
    const reel = this.hold('KELAA', 'Space', 'Kelaa');
    reel.classList.add('touch-reel');
    const actions = div('touch-actions');
    actions.append(grid, reel);

    this.root.append(stick, tools, actions);
    parent.appendChild(this.root);
  }

  /** Chat on vain moninpelissä. */
  setMultiplayer(multiplayer: boolean): void {
    this.chatButton.hidden = !multiplayer;
  }

  /** Kelan vaihde napin tekstiin (0-pohjainen). */
  setGear(gear: number): void {
    if (gear === this.gear) return;
    this.gear = gear;
    this.gearButton.textContent = `NOP ${gear + 1}`;
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

  /** Tatin asento (-1…1, y alas) näppäimiksi. */
  private setStick(x: number, y: number) {
    this.knob.style.transform = `translate(${x * STICK_RADIUS}px, ${y * STICK_RADIUS}px)`;
    this.input.simulate('KeyW', y < -DEAD_ZONE);
    this.input.simulate('KeyS', y > DEAD_ZONE);
    this.input.simulate('KeyA', x < -DEAD_ZONE);
    this.input.simulate('KeyD', x > DEAD_ZONE);
    this.input.simulate('ShiftLeft', y < 0 && Math.hypot(x, y) >= SPRINT_AT);
  }

  private tapKey(code: string) {
    // Painallus ja irrotus samalle askeleelle: peli näkee "painettiin juuri".
    this.input.simulate(code, true);
    this.input.simulate(code, false);
  }

  private tap(label: string, code: string, title: string): HTMLButtonElement {
    return this.button(label, title, () => this.tapKey(code));
  }

  private button(label: string, title: string, onPress: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPress();
    });
    return b;
  }

  /** Nappi, joka pysyy pohjassa niin kauan kuin sormi on päällä. */
  private hold(label: string, code: string, title: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      this.input.simulate(code, true);
    });
    const up = () => {
      b.classList.remove('down');
      this.input.simulate(code, false);
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
