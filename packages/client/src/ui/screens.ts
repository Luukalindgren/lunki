import {
  APPEARANCE_PARTS,
  colorOptions,
  type Appearance,
  type AppearancePart,
  DIFFICULTY_NAMES,
  LINES,
  LINE_IDS,
  LURES,
  LURE_IDS,
  RODS,
  ROD_IDS,
  DEFAULT_TACKLE,
  describeFullTackle,
  NAME_MAX_LENGTH,
  CAPSIZE_PENALTY_OPTIONS,
  LAND_PENALTIES,
  LAND_PENALTY_OPTIONS,
  LATE_JOIN_OPTIONS,
  LIGHTNING_PENALTY_OPTIONS,
  isPenalty,
  type Penalty,
  PLAYER_COUNTS,
  SPECIES_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  WEATHER_OPTIONS,
  WIN_RULE_NAMES,
  formatRoomCode,
  DURATIONS,
  formatTime,
  formatWeight,
  isSpeciesId,
  isTimeOfDay,
  isWeatherLevel,
  summarize,
  type CompetitionSettings,
  type CompetitionState,
  type Difficulty,
  type PlayerResult,
  type RoomSettings,
  type SpeciesId,
  type Tackle,
  type Vec2,
  FEEDBACK_LIMITS,
  mapCredits,
  type RecordBoard,
  type TimeOfDay,
  type WeatherLevel,
  type WinRule,
} from '@lunki/shared';
import type { LobbyView } from '../net/session';
import { LIBRARIES } from './credits';
import { LakeMapView, describeSpot } from './lakeMap';
import { drawTubePreview } from './tubePreview';
import { VOLUME_LEVELS, type AudioSettings, type VolumeLevel } from '../audio/settings';

const SETTINGS_KEY = 'lunki.soloSettings';

const PART_NAMES: Record<AppearancePart, string> = {
  tube: 'Kelluntarengas',
  fins: 'Räpylät',
  shirt: 'Paita',
  line: 'Siima',
};

const cssColor = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

/** Vaalea väri (suhteellinen kirkkaus), jolle tumma merkki erottuu paremmin. */
const isLight = (hex: number) =>
  0.299 * ((hex >> 16) & 0xff) + 0.587 * ((hex >> 8) & 0xff) + 0.114 * (hex & 0xff) > 140;

export function loadSettings(defaults: CompetitionSettings): CompetitionSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = { ...defaults, ...(JSON.parse(raw) as Partial<CompetitionSettings>) };
      const species = Array.isArray(s.species) ? s.species.filter(isSpeciesId) : [];
      return {
        ...s,
        species: species.length > 0 ? species : defaults.species,
        weather: isWeatherLevel(s.weather) ? s.weather : defaults.weather,
        timeOfDay: isTimeOfDay(s.timeOfDay) ? s.timeOfDay : defaults.timeOfDay,
        lightningPenalty: isPenalty(s.lightningPenalty)
          ? s.lightningPenalty
          : defaults.lightningPenalty,
        capsizePenalty: isPenalty(s.capsizePenalty) ? s.capsizePenalty : defaults.capsizePenalty,
        landPenalty: (LAND_PENALTIES as readonly unknown[]).includes(s.landPenalty)
          ? s.landPenalty
          : defaults.landPenalty,
        start: isPoint(s.start) ? { x: s.start.x, y: s.start.y } : null,
      };
    }
  } catch {
    // Selaimen muisti ei käytössä: oletukset kelpaavat.
  }
  return { ...defaults };
}

const isPoint = (v: unknown): v is Vec2 =>
  !!v && Number.isFinite((v as Vec2).x) && Number.isFinite((v as Vec2).y);

function saveSettings(s: CompetitionSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ei haittaa
  }
}

/** Valikot ja ruudut (aloitus, tauko, tulokset) HUD:n päällä. */
export class Screens {
  private readonly root: HTMLDivElement;
  /** Näkymän siivous ennen seuraavaa (esim. kartan koon seuranta). */
  private cleanup: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.runCleanup();
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  /** Päävalikko: pelimuodot ja muut näkymät allekkain. */
  showStart(actions: {
    /** Edellinen moninpelihuone, johon voi palata. */
    rejoin?: { code: string; run: () => void };
    onSolo: () => void;
    onMultiplayer: () => void;
    onLakeMap: () => void;
    onRecords: () => void;
    onAudio: () => void;
    onFeedback: () => void;
    onCredits: () => void;
  }): void {
    const panel = this.panel();
    const menu = this.buttons([
      ...(actions.rejoin
        ? ([[`Palaa kisaan ${formatRoomCode(actions.rejoin.code)}`, actions.rejoin.run]] as [
            string,
            () => void,
          ][])
        : []),
      ['Yksinpeli', actions.onSolo],
      ['Moninpeli', actions.onMultiplayer],
      ['Järvikartta', actions.onLakeMap],
      ['Ennätykset', actions.onRecords],
      ['Äänet', actions.onAudio],
      ['Palaute', actions.onFeedback],
      ['Tekijät ja lähteet', actions.onCredits],
    ]);
    menu.classList.add('main-menu');
    panel.classList.add('start-panel');
    panel.append(
      waveTitle('LUNKI'),
      h('p', 'Kelluntarengaskalastusta Tammelan Lunkinjärvellä', 'subtitle'),
      menu,
      h(
        'p',
        'W kohti räpylöitä · S selkä edellä (nopein) · A/D käänny · hiiri tähtää ja heittää · kelaa hiirellä tai välilyönnillä · Q/E jarru · Esc tauko',
        'hint',
      ),
      h('p', 'Kartta © OpenStreetMapin tekijät, Copernicus DEM, Syke', 'hint credit-line'),
    );
    this.show(panel);
  }

  /** Koko Lunkinjärvi karttana: syvyydet, pohjan muodot, laiturit ja rakennukset. */
  showLakeMap(onBack: () => void): void {
    const panel = this.panel();
    panel.classList.add('map-panel');
    const map = new LakeMapView();
    panel.append(
      h('h2', 'Lunkinjärvi'),
      map.element,
      h(
        'p',
        'Vedä siirtääksesi, zoomaa rullalla, nipistämällä tai napeilla. Syvyydet ovat arvioita: järvestä ei ole julkista luotausta.',
        'hint',
      ),
      this.buttons([['Takaisin', onBack]]),
    );
    this.show(panel, () => map.dispose());
  }

  /** Yksinpelin asetukset ennen kisaa. */
  showSoloSetup(
    initial: CompetitionSettings,
    onStart: (s: CompetitionSettings) => void,
    onBack: () => void,
    /** Avaa kartan aloituspaikan valintaan; saa asetukset sellaisinaan. */
    onPickStart: (s: CompetitionSettings) => void,
    appearance: { current: Appearance; onChange: (a: Appearance) => void },
  ): void {
    const settings = { ...initial };
    const panel = this.panel();
    panel.append(
      h('h2', 'Yksinpeli'),
      this.choice(
        'Kilpailuaika',
        DURATIONS.map((d) => [String(d), `${d} min`]),
        String(settings.durationMinutes),
        (v) => (settings.durationMinutes = Number(v)),
      ),
      this.startChoice(
        settings.start ?? null,
        () => (settings.start = null),
        () => onPickStart({ ...settings }),
      ),
      this.choice(
        'Kalastuksen vaikeus',
        (Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => [d, DIFFICULTY_NAMES[d]]),
        settings.difficulty,
        (v) => (settings.difficulty = v as Difficulty),
      ),
      h(
        'p',
        'Helppo: kala tarttuu aina ja tulee ylös kelaamalla. Realistinen: vastaisku, jarru ja siiman kireys ratkaisevat.',
        'hint',
      ),
      this.speciesChoice(settings.species ?? [], (list) => (settings.species = list)),
      this.choice(
        'Vuorokaudenaika',
        TIME_OF_DAY_OPTIONS.map((o) => [o.value, o.label]),
        settings.timeOfDay ?? 'day',
        (v) => (settings.timeOfDay = v as TimeOfDay),
      ),
      this.choice(
        'Sää',
        WEATHER_OPTIONS.map((o) => [o.value, o.label]),
        settings.weather ?? 'realistic',
        (v) => (settings.weather = v as WeatherLevel),
      ),
      this.choice(
        'Salama',
        LIGHTNING_PENALTY_OPTIONS.map((o) => [o.value, o.label]),
        settings.lightningPenalty ?? 'time-out',
        (v) => (settings.lightningPenalty = v as Penalty),
      ),
      this.choice(
        'Kaatuminen',
        CAPSIZE_PENALTY_OPTIONS.map((o) => [o.value, o.label]),
        settings.capsizePenalty ?? 'none',
        (v) => (settings.capsizePenalty = v as Penalty),
      ),
      this.choice(
        'Heitto maalle',
        LAND_PENALTY_OPTIONS.map((o) => [String(o.value), o.label]),
        String(settings.landPenalty ?? 30),
        (v) => (settings.landPenalty = Number(v)),
      ),
      h(
        'p',
        'Ukkosella salama voi iskeä, jos vapa on ylhäällä: kelaa viehe sisään. Iso aalto kaataa renkaan sivulta: käänny aaltoa kohti. Maalle tai laiturille heitetty viehe juuttuu, ja siima on katkaistava.',
        'hint',
      ),
      h('p', 'Omat värit', 'choice-label'),
      this.appearanceEditor(appearance.current, appearance.onChange),
      this.buttons([
        [
          'Aloita kisa',
          () => {
            saveSettings(settings);
            onStart(settings);
          },
        ],
        ['Takaisin', onBack],
      ]),
    );
    this.show(panel);
  }

  /** Moninpelin aloitus: nimimerkki, uusi huone tai liittyminen koodilla. */
  showMultiplayer(
    name: string,
    code: string,
    onCreate: (name: string) => void,
    onJoin: (name: string, code: string) => void,
    onBack: () => void,
    error?: string,
  ): void {
    const panel = this.panel();
    const nameInput = this.input('Nimimerkki', name, NAME_MAX_LENGTH, 'Kalastaja');
    const codeInput = this.input('Huonekoodi', code, 40, 'LUNKI-XXXX');
    const nameValue = () => (nameInput.querySelector('input') as HTMLInputElement).value;
    const codeValue = () => (codeInput.querySelector('input') as HTMLInputElement).value;
    const status = h('p', 'Tarkistetaan palvelinta…', 'hint server-status');
    panel.append(h('h2', 'Moninpeli'), status, nameInput);
    if (error) panel.append(h('p', error, 'error'));
    panel.append(
      this.buttons([['Luo uusi huone', () => onCreate(nameValue())]]),
      codeInput,
      this.buttons([
        ['Liity koodilla', () => onJoin(nameValue(), codeValue())],
        ['Takaisin', onBack],
      ]),
      h('p', 'Luo huone ja lähetä koodi tai linkki kavereille. Kirjautumista ei tarvita.', 'hint'),
    );
    codeInput.querySelector('input')!.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onJoin(nameValue(), codeValue());
    });
    this.show(panel);
    if (code) codeInput.querySelector('input')!.focus();
    else nameInput.querySelector('input')!.select();
  }

  /** Moninpelivalikon palvelinrivi. */
  setServerStatus(ok: boolean, custom: string | null = null): void {
    const el = this.root.querySelector<HTMLElement>('.server-status');
    if (!el) return;
    el.textContent = ok
      ? 'Palvelin päällä'
      : 'Palvelimeen ei saada yhteyttä. Yksinpeli toimii silti, mutta moninpeliin palvelimen pitää olla päällä.';
    // Linkki voi ohjata vieraalle palvelimelle: kerrotaan, minne yhdistetään.
    if (custom) el.textContent += ` · Muu kuin pelin oma palvelin: ${custom}`;
    el.classList.toggle('error', !ok);
    el.classList.toggle('ok', ok);
  }

  showMessage(title: string, text: string, onCancel?: () => void): void {
    const panel = this.panel();
    panel.append(h('h2', title), h('p', text));
    if (onCancel) panel.append(this.buttons([['Peruuta', onCancel]]));
    this.show(panel);
  }

  /** Aula: pelaajat, valmius ja kisan aloitus. Piirretään uudelleen tilan muuttuessa. */
  showLobby(
    v: LobbyView,
    link: string,
    actions: {
      onReady: (ready: boolean) => void;
      onStart: () => void;
      onLeave: () => void;
      onSettings: (patch: Partial<RoomSettings>) => void;
      onTackle: (t: Tackle) => void;
      onAppearance: (a: Appearance) => void;
      /** Isäntä avaa kartan aloituspaikan valintaan. */
      onPickStart: () => void;
    },
    notice?: string,
    /** Liittää chatin paneeliin (sama elementti säilyy uudelleenpiirroissa). */
    chat?: (parent: HTMLElement) => void,
  ): void {
    // Luettava ennen paneelin rakentamista: chatin siirto vanhasta paneelista
    // lyhentää sitä, ja selain siirtää vierityskohtaa ylös chatin korkeuden verran.
    const scroll = this.scrollOf('lobby');
    const panel = this.panel();
    panel.dataset.screen = 'lobby';
    const me = v.players.find((p) => p.me);
    const code = h('p', formatRoomCode(v.code), 'room-code');
    const copy = document.createElement('button');
    copy.textContent = 'Kopioi kutsulinkki';
    copy.addEventListener('click', () => {
      // Leikepöytää ei ole suojaamattomalla http-sivulla (LAN-peli): näytetään linkki.
      if (!navigator.clipboard) {
        copy.textContent = link;
        return;
      }
      void navigator.clipboard.writeText(link).then(
        () => (copy.textContent = 'Linkki kopioitu!'),
        () => (copy.textContent = link),
      );
    });
    const list = document.createElement('ul');
    list.className = 'player-list';
    for (const p of v.players) {
      const li = document.createElement('li');
      const state = !p.connected
        ? 'yhteys poikki'
        : p.host
          ? 'luoja'
          : p.ready
            ? 'valmis'
            : 'odottaa';
      const swatch = h('span', '', 'player-color');
      swatch.style.background = cssColor(p.appearance.tube);
      const name = h('span', `${p.name}${p.me ? ' (sinä)' : ''}`);
      name.prepend(swatch);
      li.append(
        name,
        h('span', state, `player-state ${p.host || p.ready ? 'ok' : ''}`),
        h('span', describeFullTackle(p.tackle), 'player-gear'),
      );
      list.appendChild(li);
    }
    panel.append(
      h('h2', 'Aula'),
      h('p', 'Huonekoodi', 'hint'),
      code,
      copy,
      h('p', `Pelaajat ${v.players.length}/${v.maxPlayers}`, 'choice-label'),
      list,
    );
    if (chat) {
      panel.append(h('p', 'Chat', 'choice-label'));
      chat(panel);
    }
    panel.append(
      v.amHost
        ? this.settingsEditor(v.settings, v.players.length, actions.onSettings, actions.onPickStart)
        : this.settingsSummary(v.settings),
      h('p', 'Omat varusteet', 'choice-label'),
      this.tackleEditor(me?.tackle ?? DEFAULT_TACKLE, actions.onTackle),
      h('p', 'Omat värit', 'choice-label'),
      this.appearanceEditor(me?.appearance ?? null, actions.onAppearance),
    );
    if (notice) panel.append(h('p', notice, 'error'));
    const buttons: [string, () => void][] = [];
    if (v.amHost)
      buttons.push([v.allReady ? 'Aloita kisa' : 'Aloita (odotetaan muita)', actions.onStart]);
    else
      buttons.push([
        me?.ready ? 'En olekaan valmis' : 'Valmis!',
        () => actions.onReady(!me?.ready),
      ]);
    buttons.push(['Poistu', actions.onLeave]);
    panel.append(this.buttons(buttons));
    this.show(panel, undefined, scroll);
  }

  /** Testaajan palaute: teksti lähetetään pelipalvelimelle. */
  showFeedback(
    name: string,
    onSend: (f: { name: string; text: string }) => Promise<boolean>,
    onBack: () => void,
  ): void {
    const panel = this.panel();
    const nameRow = this.input('Nimimerkki', name, FEEDBACK_LIMITS.name, 'valinnainen');
    const nameInput = nameRow.querySelector('input')!;
    const text = document.createElement('textarea');
    text.maxLength = FEEDBACK_LIMITS.text;
    text.rows = 6;
    text.placeholder = 'Mikä toimi, mikä ei? Bugit, toiveet, kalajutut…';
    const status = h('p', '', 'hint');
    const send = async () => {
      if (!text.value.trim()) {
        status.textContent = 'Kirjoita ensin jotain.';
        return;
      }
      status.textContent = 'Lähetetään…';
      const ok = await onSend({ name: nameInput.value, text: text.value });
      if (ok) {
        text.value = '';
        status.textContent = 'Kiitos! Palaute tallentui.';
      } else {
        status.textContent = 'Lähetys epäonnistui: pelipalvelin ei vastaa. Yritä myöhemmin.';
      }
    };
    panel.append(
      h('h2', 'Palaute'),
      h(
        'p',
        'Palaute menee Luukan luettavaksi ja julkaistaan nimimerkin kanssa pelin GitHubissa.',
        'hint',
      ),
      nameRow,
      text,
      status,
      this.buttons([
        ['Lähetä', () => void send()],
        ['Takaisin', onBack],
      ]),
    );
    this.show(panel);
    text.focus();
  }

  /** Äänenvoimakkuudet alkuvalikosta. */
  showAudio(
    current: AudioSettings,
    onChange: (a: AudioSettings) => void,
    onBack: () => void,
  ): void {
    const panel = this.panel();
    panel.append(
      h('h2', 'Äänet'),
      this.audioEditor(current, onChange),
      this.buttons([['Takaisin', onBack]]),
    );
    this.show(panel);
  }

  private audioEditor(initial: AudioSettings, onChange: (a: AudioSettings) => void): HTMLElement {
    const a = { ...initial };
    const box = document.createElement('div');
    box.className = 'settings';
    const row = (label: string, key: keyof AudioSettings) =>
      this.choice(
        label,
        VOLUME_LEVELS.map((o) => [String(o.value), o.label]),
        String(a[key]),
        (v) => {
          a[key] = Number(v) as VolumeLevel;
          onChange({ ...a });
        },
      );
    box.append(
      row('Tehosteet', 'effects'),
      row('Tuuli, sade ja linnut', 'ambience'),
      row('Musiikki', 'music'),
    );
    return box;
  }

  /** Tekijät, kartta-aineistojen lähdemaininnat ja kirjastojen lisenssit. */
  showCredits(onBack: () => void): void {
    const panel = this.panel();
    const list = (items: (string | HTMLElement)[]) => {
      const ul = document.createElement('ul');
      ul.className = 'credits';
      for (const item of items) {
        const li = document.createElement('li');
        li.append(item);
        ul.appendChild(li);
      }
      return ul;
    };
    const link = (text: string, url: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = text;
      return a;
    };
    panel.append(
      h('h2', 'Tekijät ja lähteet'),
      h('p', 'Lunki: Luuka Lindgren ja Claude Code. Äänet syntetisoidaan selaimessa.'),
      h('p', 'Kartta-aineistot', 'choice-label'),
      list(mapCredits()),
      h(
        'p',
        'Lunkinjärvestä ei ole julkista luotausaineistoa, joten pohja on laskettu rantaviivasta ja syvänteet ja karikot ovat keksittyjä.',
        'hint',
      ),
      h('p', 'Kirjastot', 'choice-label'),
      list(
        LIBRARIES.map((l) => {
          const span = document.createElement('span');
          span.append(link(l.name, l.url), ` – ${l.license}`);
          return span;
        }),
      ),
      list([link('OpenStreetMapin tekijänoikeudet', 'https://www.openstreetmap.org/copyright')]),
      this.buttons([['Takaisin', onBack]]),
    );
    this.show(panel);
  }

  /** Järven ennätyslista vaikeustasoittain; null = palvelinta ei tavoitettu. */
  showRecords(board: RecordBoard | null, initial: Difficulty, onBack: () => void): void {
    const panel = this.panel();
    panel.append(h('h2', 'Lunkinjärven ennätykset'));
    if (!board) {
      panel.append(
        h('p', 'Pelipalvelimeen ei saatu yhteyttä, joten ennätyksiä ei voitu hakea.', 'error'),
        this.buttons([['Takaisin', onBack]]),
      );
      this.show(panel);
      return;
    }
    const lists = document.createElement('div');
    const render = (d: Difficulty) => {
      lists.replaceChildren();
      for (const o of SPECIES_OPTIONS) {
        const rows = board[d]?.[o.value] ?? [];
        if (rows.length === 0 && !o.native) continue;
        lists.append(h('p', o.label, 'choice-label'));
        const ol = document.createElement('ol');
        ol.className = 'catch-list records';
        for (const r of rows) {
          const li = document.createElement('li');
          li.textContent = `${formatWeight(r.weight).padStart(8)}  ${r.angler.padEnd(16)} ${formatDate(r.date)}`;
          ol.appendChild(li);
        }
        if (rows.length === 0) ol.append(h('li', 'Ei vielä saaliita', 'hint'));
        lists.append(ol);
      }
    };
    render(initial);
    panel.append(
      this.choice(
        'Vaikeus',
        (Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => [d, DIFFICULTY_NAMES[d]]),
        initial,
        (v) => render(v as Difficulty),
      ),
      lists,
      h('p', 'Listalle pääsevät moninpelikisoissa palvelimella punnitut kalat.', 'hint'),
      this.buttons([['Takaisin', onBack]]),
    );
    this.show(panel);
  }

  showPause(
    onResume: () => void,
    onQuit: () => void,
    multiplayer = false,
    tackle?: { current: Tackle; onChange: (t: Tackle) => void },
    audio?: { current: AudioSettings; onChange: (a: AudioSettings) => void },
  ): void {
    const panel = this.panel();
    panel.append(
      h('h2', multiplayer ? 'Valikko' : 'Tauko'),
      ...(multiplayer ? [h('p', 'Kisa jatkuu muilla taustalla.', 'hint')] : []),
      ...(tackle ? [this.tackleEditor(tackle.current, tackle.onChange)] : []),
      ...(audio ? [this.audioEditor(audio.current, audio.onChange)] : []),
      this.buttons([
        ['Jatka', onResume],
        [multiplayer ? 'Poistu kisasta' : 'Lopeta kisa', onQuit],
      ]),
    );
    this.show(panel);
  }

  /** Moninpelin lopputulokset voittoehdon mukaan. */
  showRaceResults(
    results: PlayerResult[],
    settings: RoomSettings,
    myId: string,
    amHost: boolean,
    onRestart: () => void,
    onLeave: () => void,
    tackles?: ReadonlyMap<string, Tackle>,
    chat?: (parent: HTMLElement) => void,
  ): void {
    const panel = this.panel();
    panel.dataset.screen = 'race-results';
    const winner = results[0];
    panel.append(
      h('h2', 'Kisa päättyi!'),
      h(
        'p',
        winner && winner.summary.score > 0
          ? `Voittaja: ${winner.name} (${formatWeight(winner.summary.score)})`
          : 'Kukaan ei saanut kalaa.',
        'total',
      ),
    );
    const table = document.createElement('ol');
    table.className = 'catch-list results';
    for (const r of results) {
      const li = document.createElement('li');
      li.value = r.rank;
      li.classList.toggle('me', r.id === myId);
      const biggest = r.summary.biggest ? formatWeight(r.summary.biggest.weight) : '–';
      li.textContent = `${r.name.padEnd(12)} ${String(r.summary.count).padStart(2)} kpl  ${formatWeight(r.summary.total).padStart(8)}  suurin ${biggest}`;
      const gear = tackles?.get(r.id);
      if (gear) li.append(h('span', describeFullTackle(gear), 'player-gear'));
      table.appendChild(li);
    }
    panel.append(
      table,
      h(
        'p',
        `${WIN_RULE_NAMES[settings.winRule]} · ${DIFFICULTY_NAMES[settings.difficulty]} · ${settings.durationMinutes} min`,
        'hint',
      ),
    );
    if (chat) chat(panel);
    panel.append(
      this.buttons(
        amHost
          ? [
              ['Uusi kisa samalla porukalla', onRestart],
              ['Poistu', onLeave],
            ]
          : [['Poistu', onLeave]],
      ),
    );
    if (!amHost) panel.append(h('p', 'Huoneen luoja voi aloittaa uuden kisan.', 'hint'));
    this.show(panel);
  }

  showResults(c: CompetitionState, onAgain: () => void, onMenu: () => void): void {
    const panel = this.panel();
    const sum = summarize(c.catches, c.settings.winRule);
    panel.append(
      h('h2', c.elapsed >= c.settings.durationMinutes * 60 ? 'Aika loppui!' : 'Kisa päättyi'),
    );
    if (sum.count === 0) {
      panel.append(
        h(
          'p',
          'Ei saalista tällä kertaa. Jos tärppejä ei tule, potki uuteen paikkaan: kaikuluotain (K) näyttää kalat.',
        ),
      );
    } else {
      const list = document.createElement('ol');
      list.className = 'catch-list';
      for (const ct of [...c.catches].sort((a, b) => b.weight - a.weight)) {
        const li = document.createElement('li');
        li.textContent = `${ct.name.padEnd(8)} ${formatWeight(ct.weight).padStart(8)}   ${formatTime(ct.time)}`;
        list.appendChild(li);
      }
      panel.append(
        list,
        h(
          'p',
          `Kaloja ${sum.count} · yhteensä ${formatWeight(sum.total)} · suurin ${formatWeight(sum.biggest!.weight)}`,
          'total',
        ),
      );
    }
    panel.append(
      h(
        'p',
        `${DIFFICULTY_NAMES[c.settings.difficulty]} · ${c.settings.durationMinutes} min`,
        'hint',
      ),
      this.buttons([
        ['Uusi kisa', onAgain],
        ['Valikkoon', onMenu],
      ]),
    );
    this.show(panel);
  }

  private panel(): HTMLDivElement {
    const p = document.createElement('div');
    p.className = 'screen-panel';
    return p;
  }

  private runCleanup(): void {
    this.cleanup?.();
    this.cleanup = null;
  }

  /** Saman näkymän (data-screen) vierityskohta uudelleenpiirtoa varten. */
  private scrollOf(screen: string): [number, number] | null {
    const prev = this.root.firstElementChild as HTMLElement | null;
    return prev?.dataset.screen === screen ? [prev.scrollTop, this.root.scrollTop] : null;
  }

  private show(panel: HTMLElement, cleanup?: () => void, scroll?: [number, number] | null): void {
    this.runCleanup();
    this.cleanup = cleanup ?? null;
    // Saman näkymän uudelleenpiirto (aula, tulokset) ei toista avausanimaatiota,
    // muuten paneeli välähtäisi jokaisella tilamuutoksella.
    const prev = this.root.firstElementChild as HTMLElement | null;
    const redraw =
      !this.root.hidden && !!panel.dataset.screen && prev?.dataset.screen === panel.dataset.screen;
    if (!redraw) panel.classList.add('enter');
    this.root.replaceChildren(panel);
    this.root.hidden = false;
    // Saman näkymän uudelleenpiirto (aula) säilyttää vierityksen.
    if (scroll) {
      [panel.scrollTop, this.root.scrollTop] = scroll;
      return;
    }
    // Kohdistus ei saa vierittää pitkää näkymää alas.
    panel.querySelector<HTMLButtonElement>('button.primary')?.focus({ preventScroll: true });
  }

  private choice(
    label: string,
    options: [string, string, boolean?][],
    selected: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'choice';
    row.append(h('span', label, 'choice-label'));
    const group = document.createElement('div');
    group.className = 'choice-options';
    for (const [value, text, disabled] of options) {
      const b = document.createElement('button');
      b.textContent = text;
      b.disabled = disabled === true;
      b.classList.toggle('selected', value === selected);
      b.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        onChange(value);
      });
      group.appendChild(b);
    }
    row.append(group);
    return row;
  }

  /** Isännän asetusvalinnat aulassa. */
  private settingsEditor(
    s: RoomSettings,
    playerCount: number,
    change: (patch: Partial<RoomSettings>) => void,
    pickStart: () => void,
  ): HTMLElement {
    const box = document.createElement('div');
    box.className = 'settings';
    box.append(
      this.choice(
        'Kilpailuaika',
        DURATIONS.map((d) => [String(d), `${d} min`]),
        String(s.durationMinutes),
        (v) => change({ durationMinutes: Number(v) }),
      ),
      this.startChoice(s.start ?? null, () => change({ start: null }), pickStart),
      this.choice(
        'Voittaja',
        (Object.keys(WIN_RULE_NAMES) as WinRule[]).map((w) => [w, WIN_RULE_NAMES[w]]),
        s.winRule,
        (v) => change({ winRule: v as WinRule }),
      ),
      this.choice(
        'Kalastuksen vaikeus',
        (Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => [d, DIFFICULTY_NAMES[d]]),
        s.difficulty,
        (v) => change({ difficulty: v as Difficulty }),
      ),
      this.choice(
        'Pelaajia enintään',
        PLAYER_COUNTS.map((n) => [String(n), String(n), n < playerCount]),
        String(s.maxPlayers),
        (v) => change({ maxPlayers: Number(v) }),
      ),
      this.speciesChoice(s.species, (species) => change({ species })),
      this.choice(
        'Vuorokaudenaika',
        TIME_OF_DAY_OPTIONS.map((o) => [o.value, o.label]),
        s.timeOfDay,
        (v) => change({ timeOfDay: v as TimeOfDay }),
      ),
      this.choice(
        'Sää',
        WEATHER_OPTIONS.map((o) => [o.value, o.label]),
        s.weather,
        (v) => change({ weather: v as WeatherLevel }),
      ),
      this.choice(
        'Salama',
        LIGHTNING_PENALTY_OPTIONS.map((o) => [o.value, o.label]),
        s.lightningPenalty,
        (v) => change({ lightningPenalty: v as Penalty }),
      ),
      this.choice(
        'Kaatuminen',
        CAPSIZE_PENALTY_OPTIONS.map((o) => [o.value, o.label]),
        s.capsizePenalty,
        (v) => change({ capsizePenalty: v as Penalty }),
      ),
      this.choice(
        'Heitto maalle',
        LAND_PENALTY_OPTIONS.map((o) => [String(o.value), o.label]),
        String(s.landPenalty),
        (v) => change({ landPenalty: Number(v) }),
      ),
      this.choice(
        'Liittyminen kesken kisan',
        LATE_JOIN_OPTIONS.map((o) => [o.value, o.label]),
        s.lateJoin,
        (v) => change({ lateJoin: v as RoomSettings['lateJoin'] }),
      ),
      h(
        'p',
        'Sallittu: kaverit pääsevät mukaan vielä kisan alettua, ja yhteyden katkettua pääsee takaisin omalle paikalleen. Vain paluu: vain takaisin. Ei: kumpikaan.',
        'hint',
      ),
    );
    return box;
  }

  /** Varusteet: vapa, viehe, siima ja teräsperuke. */
  private tackleEditor(initial: Tackle, onChange: (t: Tackle) => void): HTMLElement {
    const t = { ...initial };
    const box = document.createElement('div');
    box.className = 'settings';
    const rodHint = h('p', RODS[t.rod].hint, 'hint');
    const hint = h('p', LURES[t.lure].hint, 'hint');
    const set = (patch: Partial<Tackle>) => {
      Object.assign(t, patch);
      rodHint.textContent = RODS[t.rod].hint;
      hint.textContent = LURES[t.lure].hint;
      onChange({ ...t });
    };
    const beginner = document.createElement('button');
    beginner.textContent = 'Aloittelijan varusteet';
    beginner.title = describeFullTackle(DEFAULT_TACKLE);
    beginner.addEventListener('click', () => {
      onChange({ ...DEFAULT_TACKLE });
      box.replaceWith(this.tackleEditor(DEFAULT_TACKLE, onChange));
    });
    box.append(
      this.choice(
        'Vapa',
        ROD_IDS.map((id) => [id, RODS[id].name]),
        t.rod,
        (v) => set({ rod: v as Tackle['rod'] }),
      ),
      rodHint,
      this.choice(
        'Viehe (R)',
        LURE_IDS.map((id) => [id, LURES[id].name]),
        t.lure,
        (v) => set({ lure: v as Tackle['lure'] }),
      ),
      hint,
      this.choice(
        'Siima',
        LINE_IDS.map((id) => [
          id,
          `${LINES[id].name} (${String(LINES[id].strength).replace('.', ',')} kg)`,
        ]),
        t.line,
        (v) => set({ line: v as Tackle['line'] }),
      ),
      this.choice(
        'Teräsperuke',
        [
          ['no', 'Ei'],
          ['yes', 'Kyllä'],
        ],
        t.leader ? 'yes' : 'no',
        (v) => set({ leader: v === 'yes' }),
      ),
      h(
        'p',
        'Ohut siima heittyy pidemmälle mutta katkeaa helpommin. Hauki voi purra siiman poikki ilman peruketta.',
        'hint',
      ),
      beginner,
    );
    return box;
  }

  /** Värit: rengas, räpylät, paita ja siima. Esikatselu päivittyy heti. */
  private appearanceEditor(
    initial: Appearance | null,
    onChange: (a: Appearance) => void,
  ): HTMLElement {
    const box = document.createElement('div');
    box.className = 'settings appearance';
    if (!initial) return box;
    const a = { ...initial };
    const preview = document.createElement('canvas');
    preview.className = 'tube-preview';
    preview.width = preview.height = 40;
    preview.setAttribute('aria-label', 'Esikatselu');
    drawTubePreview(preview, a);
    const rows = document.createElement('div');
    rows.className = 'appearance-rows';
    for (const part of APPEARANCE_PARTS) {
      const row = document.createElement('div');
      row.className = 'choice';
      row.append(h('span', PART_NAMES[part], 'choice-label'));
      const group = document.createElement('div');
      group.className = 'choice-options swatches';
      for (const c of colorOptions(part)) {
        const b = document.createElement('button');
        b.className = 'swatch';
        // Ruksi tummana vaaleilla väreillä ja vaaleana tummilla.
        if (isLight(c.hex)) b.classList.add('light');
        b.style.background = cssColor(c.hex);
        b.title = c.name;
        b.setAttribute('aria-label', `${PART_NAMES[part]}: ${c.name}`);
        const select = (on: boolean) => {
          b.classList.toggle('selected', on);
          b.setAttribute('aria-pressed', String(on));
        };
        select(c.hex === a[part]);
        b.addEventListener('click', () => {
          group.querySelectorAll('button').forEach((x) => {
            x.classList.remove('selected');
            x.setAttribute('aria-pressed', 'false');
          });
          select(true);
          a[part] = c.hex;
          drawTubePreview(preview, a);
          onChange({ ...a });
        });
        group.appendChild(b);
      }
      row.append(group);
      rows.append(row);
    }
    box.append(preview, rows);
    return box;
  }

  /** Monivalinta: järven kalalajit. Vähintään yksi laji jää aina valituksi. */
  private speciesChoice(
    initial: readonly SpeciesId[],
    onChange: (species: SpeciesId[]) => void,
  ): HTMLElement {
    const selected = new Set(initial);
    const row = document.createElement('div');
    row.className = 'choice';
    row.append(h('span', 'Kalalajit', 'choice-label'));
    const group = document.createElement('div');
    group.className = 'choice-options';
    for (const o of SPECIES_OPTIONS) {
      const b = document.createElement('button');
      b.textContent = o.native ? o.label : `${o.label}*`;
      if (!o.native) b.title = 'Ei elä Lunkinjärvessä';
      b.classList.toggle('selected', selected.has(o.value));
      b.addEventListener('click', () => {
        if (selected.has(o.value)) {
          if (selected.size === 1) return;
          selected.delete(o.value);
        } else selected.add(o.value);
        b.classList.toggle('selected', selected.has(o.value));
        onChange(SPECIES_OPTIONS.map((x) => x.value).filter((v) => selected.has(v)));
      });
      group.appendChild(b);
    }
    row.append(group, h('p', '* Ei Lunkinjärven oma laji, lisätään huvin vuoksi.', 'hint'));
    return row;
  }

  /** Aloituspaikka: satunnainen tai kartalta valittu. */
  private startChoice(start: Vec2 | null, onRandom: () => void, onPick: () => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'choice';
    row.append(h('span', 'Aloituspaikka', 'choice-label'));
    const group = document.createElement('div');
    group.className = 'choice-options';
    const random = document.createElement('button');
    random.textContent = 'Satunnainen';
    const pick = document.createElement('button');
    pick.textContent = start ? 'Kartalta (vaihda)' : 'Valitse kartalta';
    const hint = h('p', startText(start), 'hint');
    const select = (chosen: boolean) => {
      random.classList.toggle('selected', !chosen);
      pick.classList.toggle('selected', chosen);
    };
    select(start !== null);
    random.addEventListener('click', () => {
      select(false);
      pick.textContent = 'Valitse kartalta';
      hint.textContent = startText(null);
      onRandom();
    });
    pick.addEventListener('click', onPick);
    group.append(random, pick);
    row.append(group, hint);
    return row;
  }

  /** Aloituspaikan valinta kartalta: napautus vedessä, sitten vahvistus. */
  showStartPicker(
    current: Vec2 | null,
    onDone: (start: Vec2 | null) => void,
    onCancel: () => void,
  ): void {
    const panel = this.panel();
    panel.classList.add('map-panel');
    let chosen = current;
    const buttons = this.buttons([
      ['Valitse tämä', () => onDone(chosen)],
      ['Satunnainen', () => onDone(null)],
      ['Peruuta', onCancel],
    ]);
    const confirm = buttons.querySelector('button')!;
    confirm.disabled = chosen === null;
    const map = new LakeMapView({
      marker: current,
      markerLabel: 'Aloitus',
      onPick: (p) => {
        chosen = p;
        confirm.disabled = false;
      },
    });
    panel.append(
      h('h2', 'Aloituspaikka'),
      map.element,
      h(
        'p',
        'Napauta kohtaa vedessä. Moninpelissä muut aloittavat sen läheltä. Järvellä voi liikkua vapaasti kisan aikana.',
        'hint',
      ),
      buttons,
    );
    this.show(panel, () => map.dispose());
  }

  /** Muut pelaajat näkevät asetukset tekstinä. */
  private settingsSummary(s: RoomSettings): HTMLElement {
    const label = <T>(list: { value: T; label: string }[], v: T) =>
      list.find((o) => o.value === v)?.label ?? String(v);
    const box = document.createElement('div');
    box.className = 'settings-summary';
    const rows: [string, string][] = [
      ['Kilpailuaika', `${s.durationMinutes} min`],
      ['Voittaja', WIN_RULE_NAMES[s.winRule]],
      ['Vaikeus', DIFFICULTY_NAMES[s.difficulty]],
      ['Pelaajia enintään', String(s.maxPlayers)],
      ['Vuorokaudenaika', label(TIME_OF_DAY_OPTIONS, s.timeOfDay)],
      ['Sää', label(WEATHER_OPTIONS, s.weather)],
      [
        'Salama / kaatuminen',
        `${label(LIGHTNING_PENALTY_OPTIONS, s.lightningPenalty)} / ${label(CAPSIZE_PENALTY_OPTIONS, s.capsizePenalty)}`,
      ],
      ['Heitto maalle', label(LAND_PENALTY_OPTIONS, s.landPenalty)],
      ['Liittyminen kesken kisan', label(LATE_JOIN_OPTIONS, s.lateJoin)],
      ['Kalalajit', s.species.map((v) => label(SPECIES_OPTIONS, v)).join(', ')],
      ['Aloituspaikka', startText(s.start ?? null)],
    ];
    for (const [k, v] of rows) {
      const row = document.createElement('div');
      row.append(h('span', k, 'choice-label'), h('span', v));
      box.append(row);
    }
    return box;
  }

  private input(label: string, value: string, maxLength: number, placeholder: string): HTMLElement {
    const row = document.createElement('label');
    row.className = 'choice';
    row.append(h('span', label, 'choice-label'));
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.maxLength = maxLength;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    row.append(input);
    return row;
  }

  private buttons(list: [string, () => void][]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'buttons';
    list.forEach(([text, action], i) => {
      const b = document.createElement('button');
      b.textContent = text;
      // Porrastettu sisääntulo päävalikossa.
      b.style.setProperty('--i', String(i));
      if (i === 0) b.classList.add('primary');
      b.addEventListener('click', action);
      row.appendChild(b);
    });
    return row;
  }
}

/** Aloituspaikan kuvaus asetuksiin. */
function startText(start: Vec2 | null): string {
  if (!start) return 'Satunnainen kohta rannan tuntumassa.';
  const spot = describeSpot(start);
  return `Kartalta valittu kohta${spot ? `: ${spot.charAt(0).toLowerCase()}${spot.slice(1)}` : ''}.`;
}

/** Otsikko, jonka kirjaimet keinuvat vuorotellen kuin laineilla. */
function waveTitle(text: string): HTMLElement {
  const title = document.createElement('h1');
  title.setAttribute('aria-label', text);
  for (const [i, ch] of [...text].entries()) {
    const letter = h('span', ch, 'wave-letter');
    letter.setAttribute('aria-hidden', 'true');
    letter.style.setProperty('--i', String(i));
    title.append(letter);
  }
  return title;
}

function h(tag: string, text: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}

/** 2026-10-25 → 25.10.2026 */
const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${Number(d)}.${Number(m)}.${y}` : iso;
};
