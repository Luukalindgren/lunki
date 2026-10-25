import '@fontsource/vt323';
import { LureSonarDisplay } from './lureSonar';
import { SonarDisplay } from './sonar';

/**
 * Pelin HUD DOM-elementteinä VT323-pikselifontilla. Koko skaalautuu samalla
 * kokonaislukukertoimella kuin pelikuva, joten HUD pysyy retron näköisenä.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly power: HTMLDivElement;
  private readonly powerFill: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly tension: HTMLDivElement;
  private readonly tensionFill: HTMLDivElement;
  private readonly tensionDrag: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly stamina: HTMLDivElement;
  private readonly staminaFill: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly weather: HTMLDivElement;
  private readonly catches: HTMLDivElement;
  private readonly weigh: HTMLDivElement;
  private readonly countdown: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private flashLevel = 0;
  readonly sonar: SonarDisplay;
  /** Vieheluotain: näkyy, kun viehe on vedessä. */
  readonly lureSonar: LureSonarDisplay;
  private messageTimer = 0;
  private weighTimer = 0;
  private multiplayer = false;
  /** Kosketusohjaus: ohjeessa napit näppäinten sijaan. */
  private touch = false;

  get touchMode(): boolean {
    return this.touch;
  }

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);
    // Salaman välähdys pelikuvan päällä, HUD-paneelien alla.
    this.flashEl = el('div', 'hud-flash');
    this.root.appendChild(this.flashEl);
    this.status = el('div', 'hud-status hud-panel');
    this.power = el('div', 'hud-power hud-panel');
    this.powerFill = el('div', 'hud-power-fill');
    this.power.appendChild(this.powerFill);
    this.message = el('div', 'hud-message');
    this.tension = el('div', 'hud-tension hud-panel');
    this.tensionFill = el('div', 'hud-tension-fill');
    this.tensionDrag = el('div', 'hud-tension-drag');
    const label = el('div', 'hud-tension-label');
    label.textContent = 'KIREYS';
    this.tension.append(this.tensionFill, this.tensionDrag, label);
    this.stamina = el('div', 'hud-stamina');
    this.staminaFill = el('div', 'hud-stamina-fill');
    const bar = el('div', 'hud-stamina-bar hud-panel');
    bar.appendChild(this.staminaFill);
    const staminaLabel = el('div', 'hud-stamina-label');
    staminaLabel.textContent = 'KUNTO';
    this.stamina.append(staminaLabel, bar);
    this.stamina.hidden = true;
    this.help = el('div', 'hud-help hud-panel');
    this.setHelpMode(false);
    this.timer = el('div', 'hud-timer hud-panel');
    this.weather = el('div', 'hud-weather hud-panel');
    this.catches = el('div', 'hud-catches hud-panel');
    this.catches.hidden = true;
    this.weigh = el('div', 'hud-weigh hud-panel');
    this.weigh.hidden = true;
    this.countdown = el('div', 'hud-countdown');
    this.countdown.hidden = true;
    this.root.append(
      this.status,
      this.power,
      this.tension,
      this.stamina,
      this.message,
      this.help,
      this.timer,
      this.weather,
      this.catches,
      this.weigh,
      this.countdown,
    );
    // Luotaimet oikeassa reunassa vierekkäin; kapealla ruudulla allekkain.
    const gauges = el('div', 'hud-gauges');
    this.root.appendChild(gauges);
    this.sonar = new SonarDisplay(gauges);
    this.lureSonar = new LureSonarDisplay(gauges);
  }

  /** Sisäisen pikselin koko CSS-pikseleinä. */
  setPixelSize(cssPx: number): void {
    this.root.style.setProperty('--u', `${cssPx}px`);
  }

  setStatus(lines: string[]): void {
    const text = lines.join('\n');
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  setPower(power: number | null): void {
    this.power.hidden = power === null;
    if (power !== null) this.powerFill.style.height = `${Math.round(power * 100)}%`;
  }

  /** Jännitysmittari: jännitys ja jarru suhteessa siiman kestävyyteen. */
  setTension(tension: number, drag: number, strength: number): void {
    const pct = (v: number) => `${Math.round(Math.min(1, v / strength) * 100)}%`;
    this.tensionFill.style.height = pct(tension);
    this.tensionFill.classList.toggle('slip', tension >= drag * 0.95 && tension > 0);
    this.tensionDrag.style.bottom = pct(drag);
  }

  /** Kuntopalkki: piilossa täysissä voimissa, väri vaihtuu väsyessä. */
  setStamina(stamina: number, tired: number): void {
    this.stamina.hidden = stamina >= 1;
    if (this.stamina.hidden) return;
    // Portaittain kuten muukin HUD.
    this.staminaFill.style.width = `${Math.round(stamina * 20) * 5}%`;
    this.staminaFill.classList.toggle('tired', stamina < tired);
    this.staminaFill.classList.toggle('spent', stamina <= 0);
  }

  setTimer(text: string, low: boolean): void {
    if (this.timer.textContent !== text) this.timer.textContent = text;
    this.timer.classList.toggle('low', low);
  }

  /** Sää ajastimen alla. */
  setWeather(text: string): void {
    if (this.weather.textContent !== text) this.weather.textContent = text;
  }

  /** Viimeisimmät saaliit vasemmassa yläkulmassa. */
  setCatches(lines: string[]): void {
    this.catches.hidden = lines.length === 0;
    const text = lines.join('\n');
    if (this.catches.textContent !== text) this.catches.textContent = text;
  }

  /** Punnitus: iso ilmoitus saaliista. */
  showWeighIn(title: string, detail: string, seconds = 3): void {
    this.weigh.replaceChildren(document.createTextNode(title));
    const small = document.createElement('small');
    small.textContent = detail;
    this.weigh.appendChild(small);
    this.weigh.hidden = false;
    this.weighTimer = seconds;
  }

  /** Iso lähtölaskenta ruudun keskellä; null piilottaa. */
  setCountdown(text: string | null): void {
    this.countdown.hidden = text === null;
    if (text !== null && this.countdown.textContent !== text) this.countdown.textContent = text;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** Kosketusohjaimet näkyvissä: HUD väistää ne ja ohje on aluksi piilossa. */
  setTouch(touch: boolean): void {
    this.touch = touch;
    this.root.classList.toggle('touch', touch);
    this.help.hidden = touch;
    this.setHelpMode(this.multiplayer);
  }

  /** Ohjeen rivit: lyhyet, jotta paneeli ei peitä tilapaneelia. */
  setHelpMode(multiplayer: boolean): void {
    this.multiplayer = multiplayer;
    const lines = this.touch
      ? [
          'Tatti ylös = kohti räpylöitä · alas = selkä edellä (nopein)',
          'Tatti sivuille = käänny · reunaan asti = pikapotku (vie kuntoa)',
          'Kosketa järveä: tähtää, pidä ja päästä = heitto',
          'Sormi järvellä tai KELAA = kelaa',
          'NOP kelausnopeus · JAR−/JAR+ jarru',
          'VIEHE vaihda · LUOT kaikuluotain · SYV vieheen syvyys',
          'KAM kalastajan silmin',
          '+/− zoom · ? ohje · II tauko',
          'Ukkosella kelaa viehe sisään ja pysy rannan lähellä',
          'Viehe maalla tai laiturilla: KATKO katkaisee siiman',
          ...(multiplayer
            ? ['Sotkussa kelatkaa yhdessä · KATKO katkaisee', 'VIESTI = kirjoita muille']
            : []),
        ]
      : [
          'W/S potki · A/D käänny · Shift pikapotku (vie kuntoa)',
          'Hiiri: tähtää, pidä pohjassa ja päästä = heitto',
          'Hiiri pohjassa tai välilyönti = kelaa',
          '1/2/3 kelausnopeus · Q/E jarru löysemmälle/kireämmälle',
          'R vaihda viehe · K kaikuluotain · L vieheen syvyys',
          'V kalastajan silmin',
          'Rulla = zoom · H = ohje · Esc = tauko',
          'Ukkosella kelaa viehe sisään ja pysy rannan lähellä',
          'Viehe maalla tai laiturilla: C katkaisee siiman',
          ...(multiplayer
            ? ['Sotkussa kelatkaa yhdessä · C katkaisee siiman', 'Enter = viesti muille']
            : []),
        ];
    this.help.textContent = lines.join('\n');
  }

  toggleHelp(): void {
    this.help.hidden = !this.help.hidden;
  }

  showMessage(text: string, seconds = 2.5): void {
    this.message.textContent = text;
    this.message.hidden = false;
    this.messageTimer = seconds;
  }

  /**
   * Salaman välähdys: koko ruudun vaaleus tällä hetkellä (0–1). `invert` =
   * aivan lähellä iskiessä kuva kääntyy hetkeksi negatiiviksi.
   */
  flash(strength: number, invert = false): void {
    this.flashLevel = strength;
    this.flashEl.classList.toggle('hud-flash-invert', invert && strength > 0);
  }

  update(dt: number): void {
    // Portaittain, kuten muukin retrografiikka.
    const opacity = String(Math.round(this.flashLevel * 5) / 5);
    if (this.flashEl.style.opacity !== opacity) this.flashEl.style.opacity = opacity;
    if (this.weighTimer > 0) {
      this.weighTimer -= dt;
      if (this.weighTimer <= 0) this.weigh.hidden = true;
    }
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message.hidden = true;
    }
  }
}

function el(tag: 'div', className: string): HTMLDivElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
