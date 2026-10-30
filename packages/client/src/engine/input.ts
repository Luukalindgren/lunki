import { PadMenuRepeat, readPads, type PadKind, type PadNavAction } from './gamepad';
import { WheelZoom } from './wheelZoom';

/** Yhden hiiritapahtuman suurin uskottava liike (px); suuremmat ovat lukituksen hyppyjä. */
const MAX_MOVE = 300;

/** Näppäimet, jotka menevät peliin myös valikon ollessa auki. */
const MENU_PASS = new Set(['Escape', 'Backspace']);

/** Ohjaustapa, jota pelaaja juuri käytti: ohjeet näyttävät sen napit. */
export type InputDevice = 'keys' | 'touch' | 'pad';

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
  /** Peliohjaimen valikkotoiminto (ristiohjain, A/✕, B/○), kun valikko on auki. */
  onPadNav: (action: PadNavAction) => void = () => {};
  /** Pelaaja vaihtoi ohjaustapaa (näppäimistö, kosketus tai peliohjain). */
  onDevice: (device: InputDevice, kind: PadKind) => void = () => {};
  /** Oikea tatti, -1…1 (y kasvaa alas): heiton suunta ja pikavalikot. */
  padAim = { x: 0, y: 0 };
  private device: InputDevice | null = null;
  private padKind: PadKind = 'xbox';
  /** Peliohjaimen koodit, jotka ovat pelille pohjassa. */
  private padDown = new Set<string>();
  /** Edellisen askeleen ohjaimen koodit (painallusten tunnistus valikossa). */
  private padPrev: ReadonlySet<string> = new Set();
  /** Valikon ja pelin välillä pohjassa pysyneet: eivät tee mitään ennen irrotusta. */
  private readonly padBlocked = new Set<string>();
  private padMenu = false;
  private readonly padRepeat = new PadMenuRepeat();

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
    this.pollPads();
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

  /**
   * Peliohjainten tila askeleen alussa (Gamepad API ei lähetä tapahtumia).
   * Valikon ollessa auki napit ohjaavat valikkoa; Menu/Options ja B/○
   * kulkevat peliin kuten Esc ja Backspace, kun valikolla ei ole omaa paluuta.
   */
  private pollPads(): void {
    const frame = readPads();
    const codes: ReadonlySet<string> = frame?.codes ?? new Set();
    this.padAim = frame?.aim ?? { x: 0, y: 0 };
    if (frame?.active) this.useDevice('pad', frame.kind);
    const menu = this.menuOpen();
    if (menu !== this.padMenu) {
      this.padMenu = menu;
      // Vain jo edellisellä askeleella pohjassa olleet: valikon ja pelin vaihdon
      // yli pidetty nappi ei tee mitään ennen irrotusta.
      const held = new Set([...codes].filter((c) => this.padPrev.has(c)));
      for (const c of held) this.padBlocked.add(c);
      if (menu) this.padRepeat.hold(held);
    }
    for (const c of [...this.padBlocked]) if (!codes.has(c)) this.padBlocked.delete(c);
    const game = new Set<string>();
    if (menu) {
      const pressed = (c: string) => codes.has(c) && !this.padPrev.has(c);
      for (const a of this.padRepeat.step(codes, performance.now() / 1000)) {
        if (a === 'back' && !this.menuBack()) game.add('Pad1');
        else this.onPadNav(a);
      }
      if (pressed('Pad9')) {
        if (this.menuBack()) this.onPadNav('back');
        else game.add('Pad9');
      }
    } else for (const c of codes) if (!this.padBlocked.has(c)) game.add(c);
    for (const c of this.padDown) if (!game.has(c)) this.release(c);
    for (const c of game) if (!this.padDown.has(c)) this.press(c);
    this.padDown = game;
    this.padPrev = codes;
  }

  private useDevice(device: InputDevice, kind = this.padKind): void {
    if (device === this.device && kind === this.padKind) return;
    this.device = device;
    this.padKind = kind;
    this.onDevice(device, kind);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.useDevice('keys');
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
    this.padDown.clear();
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
    this.useDevice(e.pointerType === 'mouse' ? 'keys' : 'touch');
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
