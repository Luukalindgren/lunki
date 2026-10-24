import '@fontsource/vt323';

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
  private readonly help: HTMLDivElement;
  private messageTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);
    this.status = el('div', 'hud-status hud-panel');
    this.power = el('div', 'hud-power hud-panel');
    this.powerFill = el('div', 'hud-power-fill');
    this.power.appendChild(this.powerFill);
    this.message = el('div', 'hud-message');
    this.help = el('div', 'hud-help hud-panel');
    this.help.innerHTML =
      'W/S potki · A/D käänny · Shift pikapotku<br>' +
      'Hiiri: tähtää, pidä pohjassa ja päästä = heitto<br>' +
      'Hiiri pohjassa / välilyönti = kelaa · rulla = zoom · H = ohje';
    this.root.append(this.status, this.power, this.message, this.help);
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

  toggleHelp(): void {
    this.help.hidden = !this.help.hidden;
  }

  showMessage(text: string, seconds = 2.5): void {
    this.message.textContent = text;
    this.message.hidden = false;
    this.messageTimer = seconds;
  }

  update(dt: number): void {
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
