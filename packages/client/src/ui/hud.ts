import '@fontsource/vt323';
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
  private readonly timer: HTMLDivElement;
  private readonly weather: HTMLDivElement;
  private readonly catches: HTMLDivElement;
  private readonly weigh: HTMLDivElement;
  private readonly countdown: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private flashLevel = 0;
  readonly sonar: SonarDisplay;
  private messageTimer = 0;
  private weighTimer = 0;

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
    label.textContent = 'VETO';
    this.tension.append(this.tensionFill, this.tensionDrag, label);
    this.help = el('div', 'hud-help hud-panel');
    this.help.innerHTML =
      'W/S potki · A/D käänny · Shift pikapotku<br>' +
      'Hiiri: tähtää, pidä pohjassa ja päästä = heitto<br>' +
      'Hiiri pohjassa / välilyönti = kelaa · 1/2/3 kelausnopeus · R vaihda viehe<br>' +
      'K kaikuluotain · V kalastajan silmin · ' +
      'Q/E jarru löysemmälle/kireämmälle · rulla = zoom · H = ohje · Esc = tauko<br>' +
      'Ukkosella salama voi iskeä vapaan: kelaa viehe sisään, ja pysy lähellä rantaa';
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
      this.message,
      this.help,
      this.timer,
      this.weather,
      this.catches,
      this.weigh,
      this.countdown,
    );
    this.sonar = new SonarDisplay(this.root);
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

  toggleHelp(): void {
    this.help.hidden = !this.help.hidden;
  }

  showMessage(text: string, seconds = 2.5): void {
    this.message.textContent = text;
    this.message.hidden = false;
    this.messageTimer = seconds;
  }

  /** Salaman välähdys: koko ruutu vaalenee hetkeksi (0–1). */
  flash(strength: number): void {
    this.flashLevel = Math.max(this.flashLevel, strength);
  }

  update(dt: number): void {
    if (this.flashLevel > 0 || this.flashEl.style.opacity !== '0') {
      this.flashLevel = Math.max(0, this.flashLevel - dt * 2.5);
      // Portaittain, kuten muukin retrografiikka.
      this.flashEl.style.opacity = String(Math.round(this.flashLevel * 4) / 5);
    }
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
