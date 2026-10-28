import '@fontsource/vt323';
import { formatTime, type SpeciesId } from '@lunki/shared';
import { CompassDisplay } from './compass';
import { fishImage } from './fishArt';
import { LureSonarDisplay } from './lureSonar';
import { FlyCastPanel } from './flyCastPanel';
import { hudBase } from './hudScale';
import { SonarDisplay } from './sonar';
import { onLangChange, t, type MsgKey } from '../i18n';
import { controlText } from '../game/controls';

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
  /** Ohjeelle varattu tila: ohjeen vaihtuminen ei siirrä luotaimia. */
  private readonly helpSlot: HTMLDivElement;
  private helpContext: HelpContext = { fly: false, pov: false, seat: 'tube' };
  /** Tilanneohje (viehe maalla, sotku, perhoheitto): näkyy niin kauan kuin tilanne kestää. */
  private readonly situation: HTMLDivElement;
  private helpKey = '';
  private readonly stamina: HTMLDivElement;
  private readonly staminaFill: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly weather: HTMLDivElement;
  private readonly catches: HTMLDivElement;
  private readonly weigh: HTMLDivElement;
  private readonly countdown: HTMLDivElement;
  /** Rangaistukset (jäähy, kumossa, trombin kyydissä) ajastimineen. */
  private readonly penalty: HTMLDivElement;
  private penaltyKey = '';
  /** Ruudun keskellä allekkain: lähtölaskenta, rangaistus, punnitus ja ilmoitus. */
  private readonly notices: HTMLDivElement;
  private readonly gauges: HTMLDivElement;
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
  /** Näkyvän ilmoituksen tärkeys: vähemmän tärkeä ei korvaa sitä kesken. */
  private messageLevel: MessageLevel = 'info';
  /** Vähemmän tärkeä ilmoitus odottaa, kunnes näkyvä on ohi (uusin voittaa). */
  private queued: { text: string; seconds: number; level: MessageLevel; age: number } | null = null;
  /** Pysyvä ilmoitus (yhteyskatko), joka palaa näkyviin muiden viestien jälkeen. */
  private standing: string | null = null;
  private weighTimer = 0;
  /** Punnituskortti on saaliista: uuden heiton aloitus piilottaa sen. */
  private weighCatch = false;
  private multiplayer = false;
  private spectator = false;
  /** Kosketusohjaus: ohjeessa napit näppäinten sijaan. */
  private touch = false;
  /** Taukovalikon kokovalitsimen arvo (1 = 100 %). */
  private scale = 1;
  /** Pystyasento (kosketuksella vieheluotain siirtyy vasempaan pinoon). */
  private readonly portrait: { matches: boolean } =
    typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : { matches: false };

  get touchMode(): boolean {
    return this.touch;
  }

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);
    // Salaman välähdys pelikuvan päällä, HUD-paneelien alla.
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
    this.helpSlot = el('div', 'hud-help-slot');
    this.helpSlot.appendChild(this.help);
    this.timer = el('div', 'hud-timer hud-panel');
    this.weather = el('div', 'hud-weather hud-panel');
    this.catches = el('div', 'hud-catches hud-panel');
    this.catches.hidden = true;
    this.weigh = el('div', 'hud-weigh');
    this.weigh.hidden = true;
    this.countdown = el('div', 'hud-countdown');
    this.countdown.hidden = true;
    this.penalty = el('div', 'hud-penalty');
    this.penalty.hidden = true;
    this.situation = el('div', 'hud-situation');
    this.situation.hidden = true;
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
    bottomRight.append(this.gauges, this.helpSlot);
    this.root.appendChild(bottomRight);
    this.sonar = new SonarDisplay(this.gauges);
    this.lureSonar = new LureSonarDisplay(this.gauges);
    this.flyPanel = new FlyCastPanel(this.gauges);
    // Lähtölaskenta, rangaistus, punnitus ja ilmoitus allekkain reunojen
    // paneelien välissä, jotta ne eivät mene toistensa eivätkä muiden päälle.
    // Pino keskitetään ruudun keskilinjaan niin pitkälle kuin alueeseen mahtuu.
    this.notices = el('div', 'hud-notices');
    const stack = el('div', 'hud-notices-stack');
    stack.append(this.countdown, this.penalty, this.weigh, this.message, this.situation);
    this.notices.appendChild(stack);
    this.root.appendChild(this.notices);
    this.probeU = el('div', 'hud-probe');
    this.probeU.style.width = 'calc(var(--u) * 100)';
    this.probeM = el('div', 'hud-probe');
    this.probeM.style.width = 'calc(var(--m) * 100)';
    this.root.append(this.probeU, this.probeM);
    this.relabel();
    onLangChange(() => this.relabel());
    this.updateHelpOpen();
    if (this.portrait instanceof EventTarget) {
      this.portrait.addEventListener('change', () => this.placeLureSonar());
    }
    if (typeof ResizeObserver !== 'undefined') {
      // Seuraavassa ruudussa: mitat muuttavat marginaaleja (pystyssä kellon ja
      // sään välit), ja saman kierroksen muutos olisi ResizeObserver-silmukka.
      let pending = false;
      const observer = new ResizeObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          this.measureEdges();
        });
      });
      for (const e of [
        this.root,
        this.topLeft,
        this.topCenter,
        this.status,
        this.gauges,
        this.flyPanel.root,
      ]) {
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
    // Kompassi, sää (1–2 riviä) ja työpöydällä kuntopalkki: ilmoitukset niiden alle.
    s.setProperty('--top-h', px(this.topCenter.offsetHeight));
    // Pystypuhelimella kompassi kellon viereen ja sää kellon alle.
    s.setProperty('--timer-w', px(this.timer.offsetWidth));
    s.setProperty('--timer-h', px(this.timer.offsetHeight));
    s.setProperty('--compass-w', px(this.compass.root.offsetWidth));
    s.setProperty('--compass-h', px(this.compass.root.offsetHeight));
    const gauges = this.gauges.offsetWidth;
    s.setProperty('--right-w', px(gauges));
    s.setProperty('--right-h', px(this.gauges.offsetHeight));
    // Työpöydällä vieheluotain ja perhoheiton sivukuva luotaimen rinnalla vievät
    // leveyden: kapean sarakkeen sijaan ilmoitukset luotainten yläpuolelle.
    // Ilmoitusalue on keskilinjan ympärillä, joten leveämpi reuna rajaa molemmat.
    const m = this.probeM.offsetWidth / 100;
    const free = this.root.clientWidth - 2 * Math.max(left, gauges) - m * 16;
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
    this.scale = scale;
    this.root.style.setProperty('--hud-scale', String(scale * hudBase(this.touch)));
  }

  /**
   * Toteutunut koko: tyylitiedosto rajaa HUDin siihen, mikä mahtuu ruudulle.
   * null, kun HUD on piilossa eikä sitä voi mitata.
   */
  effectiveScale(): number | null {
    const m = this.probeM.getBoundingClientRect().width;
    return m > 0 ? this.probeU.getBoundingClientRect().width / m / hudBase(this.touch) : null;
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

  /** Sää kompassin alla; lisätiedot (aallot, salamavaara, trombi) omalle rivilleen. */
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

  /**
   * Rangaistukset keltaisena ilmoitusalueen yläosassa, jotta jäähyn huomaa:
   * jokaisesta rivi ja jäljellä oleva aika (m:ss). Ilman aikaa (trombin kyydissä,
   * kisasta pudonnut) pelkkä teksti. Tyhjä lista piilottaa.
   */
  setPenalties(penalties: { label: string; seconds?: number }[], note?: string): void {
    const rows = penalties.map((p) => [
      p.label,
      p.seconds === undefined ? '' : formatTime(Math.max(0, p.seconds)),
    ]);
    const key = rows.map((r) => r.join('\t')).join('\n') + (note ? `\n${note}` : '');
    if (key === this.penaltyKey) return;
    this.penaltyKey = key;
    this.penalty.hidden = rows.length === 0;
    this.penalty.replaceChildren(
      ...rows.map(([label, time]) => {
        const row = el('div', 'hud-penalty-row');
        const name = document.createElement('span');
        name.textContent = label!;
        row.appendChild(name);
        if (time) {
          const clock = document.createElement('b');
          clock.textContent = time;
          row.appendChild(clock);
        }
        return row;
      }),
      // Miksi ja mitä tehdä (Kaaduit! Käänny aaltoa kohti…) samassa kortissa.
      ...(note && rows.length > 0 ? [smallText(note)] : []),
    );
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    // Edellisen kisan jäähy ei jää näkyviin seuraavaan.
    if (!visible) this.setPenalties([]);
  }

  /**
   * Pystypuhelimella vieheluotain tilapaneelin alle: oikean reunan sarakkeessa
   * luotainten alle ei jäisi korkeutta ilmoituksille.
   */
  private placeLureSonar(): void {
    if (this.touch && this.portrait.matches) this.topLeft.appendChild(this.lureSonar.root);
    else if (this.lureSonar.root.parentElement !== this.gauges)
      this.sonar.root.after(this.lureSonar.root);
  }

  /** Kosketusohjaimet näkyvissä: HUD väistää ne ja ohje on aluksi piilossa. */
  setTouch(touch: boolean): void {
    this.touch = touch;
    this.root.classList.toggle('touch', touch);
    this.setScale(this.scale);
    // Kosketuksella tila vasempaan pinoon, alhaalla ovat ohjaimet.
    if (touch) this.topLeft.appendChild(this.status);
    else this.root.insertBefore(this.status, this.root.firstChild!.nextSibling);
    // Kuntopalkki: kosketuksella tatin yläpuolelle, muuten sään alle.
    if (touch) this.root.insertBefore(this.stamina, this.topLeft);
    else this.topCenter.appendChild(this.stamina);
    // Perhoheiton sivukuva: kosketuksella renkaan alle, jotta se ei peitä siimaa.
    if (touch) this.root.insertBefore(this.flyPanel.root, this.notices);
    else this.lureSonar.root.after(this.flyPanel.root);
    this.placeLureSonar();
    this.helpSlot.hidden = touch;
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
    this.renderHelp();
  }

  /**
   * Pelitilanne ohjeelle: vain valitun välineen ohjeet. Tilanteen omat ohjeet
   * (ukkonen, viehe maalla, sotku) ovat tilanneohjeessa. Kutsutaan joka ruudulla.
   */
  setHelpContext(context: HelpContext): void {
    const c = this.helpContext;
    if (c.fly === context.fly && c.pov === context.pov && c.seat === context.seat) return;
    this.helpContext = { ...context };
    this.renderHelp();
  }

  /**
   * Tilanneohje ilmoitusten alla: mitä nyt pitää tehdä (viehe maalla, sotku,
   * perhoheitto, ukkonen). Pysyy näkyvissä, kunnes tilanne ohi (null).
   */
  setSituation(text: string | null): void {
    this.situation.hidden = text === null;
    if (text !== null && this.situation.textContent !== text) this.situation.textContent = text;
  }

  private renderHelp(): void {
    const mp = this.multiplayer;
    const c = this.helpContext;
    const tail: MsgKey[] = [
      this.spectator ? 'help.spectateBar' : 'help.bar',
      ...(mp ? ['help.chat' as const] : []),
    ];
    // Kaikki tässä tilassa mahdolliset rivit: niiden mukaan varataan tila.
    // Liikkumisen rivit kulkupelin mukaan: räpylät, airot tai kyyti (#263).
    const moves = Object.values(MOVE_HELP);
    const bases = this.spectator
      ? [HELP.spectator]
      : [HELP.spin, HELP.fly].flatMap((b) => moves.map((m) => [...m, ...b]));
    const base = this.spectator
      ? HELP.spectator
      : [...MOVE_HELP[c.seat], ...(c.fly ? HELP.fly : HELP.spin)];
    // Zoom toimii vain ylhäältä katsottaessa.
    const opts = { touch: this.touch, skip: c.pov ? (['zoom'] as const) : [] };
    const lines = [...base, ...tail].map((k) => controlText(k, {}, opts));
    const key = lines.join('\n');
    if (key === this.helpKey) return;
    this.helpKey = key;
    this.help.replaceChildren(
      ...lines.map((text) => {
        const row = el('div', '');
        row.textContent = text;
        return row;
      }),
    );
    // Varatun tilan koko HUD-pikseleinä (rivi 8, merkki 3,2 + täyte ja kehys 6):
    // tyylitiedosto rajaa HUDin koon niin, että ohje mahtuu luotainten alle.
    // Koko ei muutu välineen tai näkymän mukana, joten HUD ei hypi.
    const rows = Math.max(...bases.map((b) => b.length)) + tail.length;
    const all = [...bases.flat(), ...tail].map((k) => controlText(k, {}, { touch: this.touch }));
    const cols = Math.max(...all.map((l) => l.length));
    this.root.style.setProperty('--help-h', String(6 + 8 * rows));
    this.root.style.setProperty('--help-w', String(Math.ceil(6 + 3.2 * cols)));
  }

  toggleHelp(): void {
    this.helpSlot.hidden = !this.helpSlot.hidden;
    this.updateHelpOpen();
  }

  /** Työpöydän ohje alhaalla: ilmoitukset sen yläpuolelle. */
  private updateHelpOpen(): void {
    this.root.classList.toggle('help-open', !this.helpSlot.hidden && !this.touch);
  }

  /**
   * Ilmoitus ruudun keskellä. Vähemmän tärkeä ei korvaa näkyvää kesken
   * (esim. vinkki ei peitä salamavaroitusta), vaan näkyy sen jälkeen.
   */
  showMessage(text: string, seconds = 2.5, level: MessageLevel = 'event'): void {
    if (this.messageTimer > 0 && RANK[level] < RANK[this.messageLevel]) {
      this.queued = { text, seconds, level, age: 0 };
      return;
    }
    this.messageText.textContent = text;
    this.message.hidden = false;
    this.messageTimer = seconds;
    this.messageLevel = level;
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

  update(dt: number): void {
    if (this.weighTimer > 0) {
      this.weighTimer -= dt;
      if (this.weighTimer <= 0) this.hideWeighIn();
    }
    if (this.queued) this.queued.age += dt;
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer > 0) return;
      // Odottanut ilmoitus, jos se on vielä ajankohtainen.
      const q = this.queued;
      this.queued = null;
      if (q && q.age < q.seconds) this.showMessage(q.text, q.seconds - q.age, q.level);
      else this.setStandingMessage(this.standing);
    }
  }
}

/** Pelitilanne, jonka mukaan ohje näyttää vain oleelliset rivit. */
export interface HelpContext {
  /** Perhovälineet (muuten virveli). */
  fly: boolean;
  /** Kalastajan näkymä: zoomia ei ole. */
  pov: boolean;
  /** Kulkupeli: kelluntarengas, veneen soutaja tai kyytiläinen (#263). */
  seat: 'tube' | 'rower' | 'passenger';
}

/**
 * Ilmoituksen tärkeys: `alert` = vaara (sää, trombi, sotku), `event` = kalastuksen
 * tapahtumat, `info` = vinkit ja vahvistukset (näkymä, viehe vaihdettu…).
 */
export type MessageLevel = 'alert' | 'event' | 'info';
const RANK: Record<MessageLevel, number> = { info: 0, event: 1, alert: 2 };

function smallText(text: string): HTMLElement {
  const small = document.createElement('small');
  small.textContent = text;
  return small;
}

/**
 * Ohjeen rivit. Sama teksti näppäimistölle ja kosketukselle: {toiminto}-kohdat
 * täytetään toimintokartasta (game/controls.ts) pelaajan ohjaustavalla.
 */
const HELP = {
  spin: ['help.cast', 'help.castForward', 'help.reel', 'help.gear', 'help.tools'],
  fly: ['help.flyCast', 'help.flyCast2', 'help.flyStrip', 'help.flyReel', 'help.tools'],
  spectator: ['help.spectate'],
} as const satisfies Record<'spin' | 'fly' | 'spectator', readonly MsgKey[]>;

/** Liikkumisen ohjeet kulkupelin mukaan. */
const MOVE_HELP = {
  tube: ['help.move', 'help.turn'],
  rower: ['help.row', 'help.rowTurn'],
  passenger: ['help.passenger', 'help.passengerTurn'],
} as const satisfies Record<HelpContext['seat'], readonly MsgKey[]>;

function el(tag: 'div', className: string): HTMLDivElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
