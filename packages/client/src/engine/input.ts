/**
 * Näppäimistön ja hiiren tila. Tapahtumat kerätään ja luetaan kiinteän
 * päivitysaskeleen alussa, jotta "painettiin juuri" -tieto ei katoa.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedQueue = new Set<string>();
  private readonly releasedQueue = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();

  /** Hiiren sijainti näytön CSS-pikseleinä. */
  mouseX = 0;
  mouseY = 0;
  /** Rullan kertymä edellisestä askeleesta. */
  wheel = 0;
  private wheelAcc = 0;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('wheel', this.onWheel, { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Kutsutaan kerran jokaisen kiinteän askeleen alussa. */
  beginStep(): void {
    this.pressed = new Set(this.pressedQueue);
    this.released = new Set(this.releasedQueue);
    this.pressedQueue.clear();
    this.releasedQueue.clear();
    this.wheel = this.wheelAcc;
    this.wheelAcc = 0;
  }

  /** Onko näppäin (KeyboardEvent.code, esim. "KeyW") tai hiiren nappi ("Mouse0") pohjassa. */
  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Painettiinko tällä askeleella. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Päästettiinkö irti tällä askeleella. */
  wasReleased(code: string): boolean {
    return this.released.has(code);
  }

  /** Ohjelmallinen syöte (suorituskykytesti, automaattiset testit). */
  simulate(code: string, down: boolean, mouse?: { x: number; y: number }): void {
    if (mouse) {
      this.mouseX = mouse.x;
      this.mouseY = mouse.y;
    }
    if (down) this.press(code);
    else this.release(code);
  }

  private press(code: string) {
    if (!this.down.has(code)) this.pressedQueue.add(code);
    this.down.add(code);
  }

  private release(code: string) {
    if (this.down.has(code)) this.releasedQueue.add(code);
    this.down.delete(code);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Tekstikenttiin kirjoittaminen ei ohjaa peliä.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code.startsWith('F')) {
      if (e.code !== 'F5' && e.code !== 'F11' && e.code !== 'F12') e.preventDefault();
    }
    this.press(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => this.release(e.code);

  private onBlur = () => {
    for (const code of [...this.down]) this.release(code);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.onPointerMove(e);
    this.target.setPointerCapture?.(e.pointerId);
    this.press(`Mouse${e.button}`);
  };

  private onPointerUp = (e: PointerEvent) => this.release(`Mouse${e.button}`);

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.wheelAcc += Math.sign(e.deltaY);
  };
}
