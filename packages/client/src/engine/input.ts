import { WheelZoom } from './wheelZoom';

/** Yhden hiiritapahtuman suurin uskottava liike (px); suuremmat ovat lukituksen hyppyjä. */
const MAX_MOVE = 300;

/** Näppäimet, jotka menevät peliin myös valikon ollessa auki. */
const MENU_PASS = new Set(['Escape', 'Backspace']);

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
  private readonly wheelZoom = new WheelZoom();
  /**
   * Hiiren liike (CSS-pikseleinä) edellisestä askeleesta. Toimii myös
   * lukitulla osoittimella, jolloin sijainti ei muutu (perhoheitto, #235).
   */
  mouseDX = 0;
  mouseDY = 0;
  private moveAccX = 0;
  private moveAccY = 0;
  /**
   * Vasen nappi tai sormi pohjassa kuljettu matka (CSS-pikseleinä) edellisestä
   * askeleesta. Kerätään tapahtumista, joten nopea pyyhkäisy ei katoa, vaikka
   * se alkaisi tai loppuisi askelten välissä (perhoheitto sormella, #236).
   */
  dragDX = 0;
  dragDY = 0;
  private dragAccX = 0;
  private dragAccY = 0;
  /** Kosketus, joka toimii hiirenä pelikuvan päällä (yksi kerrallaan). */
  private aimPointer: number | null = null;
  /**
   * Valikko auki: näppäimet ohjaavat valikkoa eivätkä peliä (esim. välilyönti
   * ei kelaa taustalla moninpelin tauolla). Esc, Backspace ja F-näppäimet
   * menevät silti peliin (tauon avaus ja sulku, paletti, FPS).
   */
  menuOpen: () => boolean = () => false;
  /** Avoimella valikolla on oma paluu: Esc ja Backspace eivät mene peliin. */
  menuBack: () => boolean = () => false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
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
    this.mouseDX = this.moveAccX;
    this.mouseDY = this.moveAccY;
    this.moveAccX = 0;
    this.moveAccY = 0;
    this.dragDX = this.dragAccX;
    this.dragDY = this.dragAccY;
    this.dragAccX = 0;
    this.dragAccY = 0;
  }

  /**
   * Unohtaa painallukset, joita ei ole vielä käsitelty. Valikon Esc kulkee
   * pelille (MENU_PASS), ja jos peli alkaa ennen seuraavaa askelta, sama
   * painallus avaisi muuten heti taukovalikon.
   */
  dropPresses(): void {
    this.pressedQueue.clear();
  }

  /** Lukitsee osoittimen pelikuvaan, jotta liike ei lopu ruudun reunaan. */
  lockPointer(): void {
    if (document.pointerLockElement === this.target || !this.target.requestPointerLock) return;
    // Selain voi kieltäytyä (esim. ilman käyttäjän painallusta): liike toimii silti.
    Promise.resolve(this.target.requestPointerLock()).catch(() => {});
  }

  unlockPointer(): void {
    if (document.pointerLockElement === this.target) document.exitPointerLock();
  }

  /** Ohjelmallinen hiiren liike (automaattiset testit). */
  simulateMove(dx: number, dy: number): void {
    this.moveAccX += dx;
    this.moveAccY += dy;
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

  /** Zoomaus ilman rullaa (kosketusnapit): positiivinen loitontaa. */
  scroll(steps: number): void {
    this.wheelAcc += steps;
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
    if (this.menuOpen() && !e.code.startsWith('F')) {
      if (!MENU_PASS.has(e.code) || this.menuBack()) return;
    }
    if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code.startsWith('F')) {
      if (e.code !== 'F5' && e.code !== 'F11' && e.code !== 'F12') e.preventDefault();
    }
    this.press(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => this.release(e.code);

  /** Kaikki napit irti (ikkunasta poistuttaessa tai tekstikenttään siirryttäessä). */
  releaseAll(): void {
    this.aimPointer = null;
    for (const code of [...this.down]) this.release(code);
  }

  private onBlur = () => this.releaseAll();

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerId !== this.aimPointer) return;
    if (e.pointerType === 'mouse') {
      // Osoittimen lukitus voi tuottaa yksittäisiä hyppäyksiä (kursori siirretään keskelle).
      if (Math.abs(e.movementX) < MAX_MOVE && Math.abs(e.movementY) < MAX_MOVE) {
        this.moveAccX += e.movementX || 0;
        this.moveAccY += e.movementY || 0;
      }
      // Toinen nappi toisen ollessa pohjassa tulee liikkeenä (chorded button).
      if (e.type === 'pointermove' && e.button >= 0) {
        const bit = [1, 4, 2, 8, 16][e.button] ?? 0;
        if (e.buttons & bit) this.press(`Mouse${e.button}`);
        else this.release(`Mouse${e.button}`);
      }
    }
    if (document.pointerLockElement === this.target) return;
    // Painalluksen alussa (onPointerDown) nappi ei ole vielä pohjassa: hyppy
    // edellisestä paikasta painalluskohtaan ei ole vetoa.
    if (this.down.has('Mouse0')) {
      this.dragAccX += e.clientX - this.mouseX;
      this.dragAccY += e.clientY - this.mouseY;
    }
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      // Toinen sormi pelikuvalla ei siirrä tähtäystä eikä irrota nappia.
      if (this.aimPointer !== null) return;
      this.aimPointer = e.pointerId;
    }
    this.onPointerMove(e);
    // Lukitulla osoittimella kaappaus ei ole sallittu (eikä tarpeen).
    if (document.pointerLockElement !== this.target) this.target.setPointerCapture?.(e.pointerId);
    this.press(`Mouse${e.button}`);
  };

  private onPointerUp = (e: PointerEvent) => {
    // Kosketusnappien sormet eivät irrota pelikuvaa pitelevää sormea.
    if (e.pointerType !== 'mouse') {
      if (e.pointerId !== this.aimPointer) return;
      this.aimPointer = null;
      this.release('Mouse0');
      return;
    }
    this.release(`Mouse${e.button}`);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.wheelAcc += this.wheelZoom.feed(e, e.timeStamp);
  };
}
