import '@fontsource/vt323';
import type { SpeciesId } from '@lunki/shared';
import { CompassDisplay } from './compass';
import { fishImage } from './fishArt';
import { LureSonarDisplay } from './lureSonar';
import { FlyCastPanel } from './flyCastPanel';
import { SonarDisplay } from './sonar';
import { onLangChange, t, type MsgKey } from '../i18n';

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
  private readonly messageText: HTMLSpanElement;
  /** Vasen yläkulma: kello ja saaliit (kosketuksella myös tilapaneeli) allekkain. */
  private readonly topLeft: HTMLDivElement;
  /** Yläreunan keskellä: kompassi, sää ja (työpöydällä) kuntopalkki allekkain. */
  private readonly topCenter: HTMLDivElement;
  private readonly tension: HTMLDivElement;
  private readonly tensionFill: HTMLDivElement;
  private readonly tensionDrag: HTMLDivElement;
  private readonly tensionLabel: HTMLDivElement;
  private readonly staminaLabel: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly stamina: HTMLDivElement;
  private readonly staminaFill: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly weather: HTMLDivElement;
  private readonly catches: HTMLDivElement;
  private readonly weigh: HTMLDivElement;
  private readonly countdown: HTMLDivElement;
  /** Ruudun keskellä allekkain: lähtölaskenta, punnitus ja ilmoitus. */
  private readonly notices: HTMLDivElement;
  private readonly gauges: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private flashLevel = 0;
  readonly sonar: SonarDisplay;
  /** Kompassinauha ajastimen alla. */
  readonly compass: CompassDisplay;
  /** Vieheluotain: näkyy, kun viehe on vedessä. */
  readonly lureSonar: LureSonarDisplay;
  /** Perhoheiton sivukuva (#236). */
  readonly flyPanel: FlyCastPanel;
  private readonly probeU: HTMLDivElement;
  private readonly probeM: HTMLDivElement;
  private messageTimer = 0;
  /** Pysyvä ilmoitus (yhteyskatko), joka palaa näkyviin muiden viestien jälkeen. */
  private standing: string | null = null;
  private weighTimer = 0;
  /** Punnituskortti on saaliista: uuden heiton aloitus piilottaa sen. */
  private weighCatch = false;
  private multiplayer = false;
  private spectator = false;
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
    this.messageText = document.createElement('span');
    this.message.appendChild(this.messageText);
    this.message.hidden = true;
    this.tension = el('div', 'hud-tension hud-panel');
    this.tensionFill = el('div', 'hud-tension-fill');
    this.tensionDrag = el('div', 'hud-tension-drag');
    this.tensionLabel = el('div', 'hud-tension-label');
    this.tension.append(this.tensionFill, this.tensionDrag, this.tensionLabel);
    this.stamina = el('div', 'hud-stamina');
    this.staminaFill = el('div', 'hud-stamina-fill');
    const bar = el('div', 'hud-stamina-bar hud-panel');
    bar.appendChild(this.staminaFill);
    this.staminaLabel = el('div', 'hud-stamina-label');
    this.stamina.append(this.staminaLabel, bar);
    this.stamina.hidden = true;
    this.help = el('div', 'hud-help hud-panel');
    this.timer = el('div', 'hud-timer hud-panel');
    this.weather = el('div', 'hud-weather hud-panel');
    this.catches = el('div', 'hud-catches hud-panel');
    this.catches.hidden = true;
    this.weigh = el('div', 'hud-weigh');
    this.weigh.hidden = true;
    this.countdown = el('div', 'hud-countdown');
    this.countdown.hidden = true;
    // Kulmiin ja yläreunaan pinot, jotta paneelit eivät mene päällekkäin
    // eivätkä peitä ilmoituksia keskellä ruutua.
    this.topLeft = el('div', 'hud-top-left');
    this.topLeft.append(this.timer, this.catches);
    this.topCenter = el('div', 'hud-top-center');
    this.root.append(this.status, this.power, this.tension, this.topLeft, this.topCenter);
    this.compass = new CompassDisplay(this.topCenter);
    this.topCenter.append(this.weather, this.stamina);
    // Luotaimet oikeassa alakulmassa ohjeen yläpuolella. Kosketusnäytöllä
    // alakulmassa ovat ohjaimet, joten ne nousevat kireysmittarin alle.
    const bottomRight = el('div', 'hud-bottom-right');
    this.gauges = el('div', 'hud-gauges');
    bottomRight.append(this.gauges, this.help);
    this.root.appendChild(bottomRight);
    this.sonar = new SonarDisplay(this.gauges);
    this.lureSonar = new LureSonarDisplay(this.gauges);
    this.flyPanel = new FlyCastPanel(this.gauges);
    // Lähtölaskenta, punnitus ja ilmoitus allekkain reunojen paneelien välissä,
    // jotta ne eivät mene toistensa eivätkä muiden paneelien päälle.
    this.notices = el('div', 'hud-notices');
    this.notices.append(this.countdown, this.weigh, this.message);
    this.root.appendChild(this.notices);
    this.probeU = el('div', 'hud-probe');
    this.probeU.style.width = 'calc(var(--u) * 100)';
    this.probeM = el('div', 'hud-probe');
    this.probeM.style.width = 'calc(var(--m) * 100)';
    this.root.append(this.probeU, this.probeM);
    this.relabel();
    onLangChange(() => this.relabel());
    this.updateHelpOpen();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.measureEdges());
      for (const e of [this.root, this.topLeft, this.status, this.gauges, this.flyPanel.root]) {
        observer.observe(e);
      }
    }
  }

  /**
   * Reunojen paneelien mitat tyylitiedostolle, joka rajaa ilmoitusalueen niiden
   * väliin: leveys riippuu kielestä, saaliista ja siitä, mitkä luotaimet näkyvät.
   */
  private measureEdges(): void {
    const px = (v: number) => `${Math.ceil(v)}px`;
    const s = this.root.style;
    // Työpöydällä tilapaneeli on omana paneelinaan vasemmassa alakulmassa.
    const status = this.touch ? 0 : this.status.offsetWidth;
    const left = Math.max(this.topLeft.offsetWidth, status);
    s.setProperty('--left-w', px(left));
    s.setProperty('--left-h', px(this.topLeft.offsetHeight));
    const gauges = this.gauges.offsetWidth;
    s.setProperty('--right-w', px(gauges));
    s.setProperty('--right-h', px(this.gauges.offsetHeight));
    // Työpöydällä vieheluotain ja perhoheiton sivukuva luotaimen rinnalla vievät
    // leveyden: kapean sarakkeen sijaan ilmoitukset luotainten yläpuolelle.
    const m = this.probeM.offsetWidth / 100;
    const free = this.root.clientWidth - left - gauges - m * 16;
    this.root.classList.toggle('wide-gauges', !this.touch && free < this.root.clientWidth * 0.3);
    const fly = this.flyPanel.root.offsetHeight;
    s.setProperty('--fly-h', fly > 0 ? `calc(${px(fly)} + var(--m) * 4)` : '0px');
    s.setProperty('--fly-on', fly > 0 ? '1' : '0');
  }

  /** Kiinteät tekstit pelaajan kielellä (kieli voi vaihtua päävalikossa). */
  private relabel(): void {
    this.tensionLabel.textContent = t('hud.tension');
    this.staminaLabel.textContent = t('hud.stamina');
    this.compass.relabel();
    this.setHelpMode(this.multiplayer, this.spectator);
  }

  /** Sisäisen pikselin koko CSS-pikseleinä. */
  setPixelSize(cssPx: number): void {
    // --u lasketaan tästä tyylitiedostossa: kapealla pystyruudulla HUD pienenee.
    this.root.style.setProperty('--u0', `${cssPx}px`);
  }

  /** Pelaajan valitsema HUDin koko (taukovalikon kokovalitsin), 1 = oletus. */
  setScale(scale: number): void {
    this.root.style.setProperty('--hud-scale', String(scale));
  }

  /**
   * Toteutunut koko: tyylitiedosto rajaa HUDin siihen, mikä mahtuu ruudulle.
   * null, kun HUD on piilossa eikä sitä voi mitata.
   */
  effectiveScale(): number | null {
    const m = this.probeM.getBoundingClientRect().width;
    return m > 0 ? this.probeU.getBoundingClientRect().width / m : null;
  }

  setStatus(lines: string[]): void {
    const text = lines.join('\n');
    if (this.status.textContent !== text) this.status.textContent = text;
  }

  setPower(power: number | null): void {
    this.power.hidden = power === null;
    this.power.classList.remove('fly-now');
    // Uusi heitto: saaliskortti pois, ettei se peitä rengasta ja heittoa.
    if (power !== null && this.weighCatch) this.hideWeighIn();
    if (power !== null) this.powerFill.style.height = `${Math.round(power * 100)}%`;
  }

  /** Perhoheiton ajoitusmittari (#235): silmukan aukeaminen ja "nyt!"-merkki. */
  setFlyLoop(progress: number, now: boolean): void {
    this.power.hidden = false;
    this.powerFill.style.height = `${Math.round(progress * 100)}%`;
    this.power.classList.toggle('fly-now', now);
    this.power.dataset.now = t('game.flyNow');
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
    // Työpöydällä kuntopalkki on sään alla: ilmoitukset sen alapuolelle.
    this.root.classList.toggle('tired', !this.stamina.hidden);
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

  /**
   * Punnitus: iso ilmoitus saaliista, kalan kuva painoon suhteutettuna. Saaliin
   * kortti katoaa viimeistään, kun pelaaja alkaa heittää uudelleen.
   */
  showWeighIn(
    title: string,
    detail: string,
    seconds = 3,
    fish?: { species: SpeciesId; weight: number },
  ): void {
    this.weigh.replaceChildren();
    if (fish) this.weigh.appendChild(fishImage(fish.species, fish.weight, 'calc(var(--u) * 2)'));
    const heading = document.createElement('span');
    heading.textContent = title;
    const small = document.createElement('small');
    small.textContent = detail;
    this.weigh.append(heading, small);
    this.weigh.hidden = false;
    this.weighTimer = seconds;
    this.weighCatch = fish !== undefined;
  }

  private hideWeighIn(): void {
    this.weigh.hidden = true;
    this.weighTimer = 0;
    this.weighCatch = false;
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
    // Kosketuksella tila vasempaan pinoon, alhaalla ovat ohjaimet.
    if (touch) this.topLeft.appendChild(this.status);
    else this.root.insertBefore(this.status, this.root.firstChild!.nextSibling);
    // Kuntopalkki: kosketuksella tatin yläpuolelle, muuten sään alle.
    if (touch) this.root.insertBefore(this.stamina, this.topLeft);
    else this.topCenter.appendChild(this.stamina);
    // Perhoheiton sivukuva: kosketuksella renkaan alle, jotta se ei peitä siimaa.
    if (touch) this.root.insertBefore(this.flyPanel.root, this.notices);
    else this.lureSonar.root.after(this.flyPanel.root);
    this.help.hidden = touch;
    this.setHelpMode(this.multiplayer, this.spectator);
    this.updateHelpOpen();
    this.measureEdges();
  }

  /** Ohjeen rivit: lyhyet, jotta paneeli ei peitä tilapaneelia. Katsojalle omat. */
  setHelpMode(multiplayer: boolean, spectator = false): void {
    this.multiplayer = multiplayer;
    this.spectator = spectator;
    // Moninpelissä chat ja (kosketuksella) VIESTI-nappi vievät tilaa.
    this.root.classList.toggle('mp', multiplayer);
    // Katsojalla ei ole omaa siimaa: luotaimet ja kireysmittari piiloon (#280).
    this.root.classList.toggle('spectator', spectator);
    const lines: MsgKey[] = spectator
      ? this.touch
        ? ['help.spectatorTouch1', 'help.spectatorTouch2', 'help.touchTools']
        : ['help.spectator1', 'help.spectator2', 'help.keysTools', 'help.chatKey']
      : this.touch
        ? [
            'help.touch1',
            'help.touch2',
            'help.touch3',
            'help.touch4',
            'help.touch5',
            'help.touch6',
            'help.touch7',
            'help.touchFly',
            'help.touchFlyCast',
            'help.touchTools',
            'help.thunder',
            'help.touchLand',
            ...(multiplayer ? (['help.touchTangle', 'help.touchChat'] as const) : []),
          ]
        : [
            'help.keys1',
            'help.keys2',
            'help.keysSpace',
            'help.keys3',
            'help.keys4',
            'help.keys5',
            'help.keys6',
            'help.keysFly',
            'help.keysFlyCast',
            'help.keysTools',
            'help.thunder',
            'help.keysLand',
            ...(multiplayer ? (['help.keysTangle', 'help.chatKey'] as const) : []),
          ];
    const text = lines.map((k) => t(k));
    this.help.textContent = text.join('\n');
    // Ohjeen koko HUD-pikseleinä (rivi 8, merkki 3,2 + täyte ja kehys 6):
    // tyylitiedosto rajaa HUDin koon niin, että ohje mahtuu luotainten alle.
    const cols = Math.max(...text.map((l) => l.length));
    this.root.style.setProperty('--help-h', String(6 + 8 * text.length));
    this.root.style.setProperty('--help-w', String(Math.ceil(6 + 3.2 * cols)));
  }

  toggleHelp(): void {
    this.help.hidden = !this.help.hidden;
    this.updateHelpOpen();
  }

  /** Työpöydän ohje alhaalla: ilmoitukset sen yläpuolelle. */
  private updateHelpOpen(): void {
    this.root.classList.toggle('help-open', !this.help.hidden && !this.touch);
  }

  showMessage(text: string, seconds = 2.5): void {
    this.messageText.textContent = text;
    this.message.hidden = false;
    this.messageTimer = seconds;
  }

  /**
   * Ilmoitus, joka pysyy näkyvissä kunnes se poistetaan (null). Väliin
   * tulevat viestit näkyvät tavalliseen tapaan, minkä jälkeen tämä palaa.
   */
  setStandingMessage(text: string | null): void {
    this.standing = text;
    if (this.messageTimer > 0) return;
    this.messageText.textContent = text ?? '';
    this.message.hidden = text === null;
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
      if (this.weighTimer <= 0) this.hideWeighIn();
    }
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.setStandingMessage(this.standing);
    }
  }
}

function el(tag: 'div', className: string): HTMLDivElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
