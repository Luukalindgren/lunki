import {
  APPEARANCE_PARTS,
  colorOptions,
  type Appearance,
  type AppearancePart,
  DIFFICULTY_NAMES,
  LINES,
  LINE_IDS,
  LURE_IDS,
  ROD_IDS,
  DEFAULT_TACKLE,
  NAME_MAX_LENGTH,
  LAND_PENALTIES,
  LATE_JOIN_OPTIONS,
  PENALTY_IDS,
  isPenalty,
  type Penalty,
  PLAYER_COUNTS,
  SPECIES_OPTIONS,
  TIME_OF_DAY_IDS,
  WEATHER_LEVEL_IDS,
  WIN_RULE_NAMES,
  formatRoomCode,
  DURATIONS,
  formatTime,
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
  type RecordMode,
  type RecordEntry,
  type TimeOfDay,
  type WeatherLevel,
  type WinRule,
} from '@lunki/shared';
import type { LobbyView } from '../net/session';
import { LIBRARIES, creditText } from './credits';
import { fishImage } from './fishArt';
import {
  cardBlob,
  cardFileName,
  drawWeighCard,
  weighCardText,
  type WeighCardInfo,
} from './weighCard';
import { LakeMapView, RACE_EVENT_STYLE, describeSpot } from './lakeMap';
import type { RaceEventKind, RaceMapData } from '../game/raceLog';
import { SPECIES_PIN_COLORS, formatDate, recordDetails, recordTitle } from './recordDetails';
import { drawTubePreview } from './tubePreview';
import { VOLUME_LEVELS, type AudioSettings, type VolumeLevel } from '../audio/settings';
import { MUSIC_CHOICES, type MusicChoice } from '../audio/music';
import { DEFAULT_HUD_SCALE, HUD_SCALES } from './hudScale';
import {
  LANGS,
  formatWeight,
  getLang,
  setLang,
  shortDecimal,
  t,
  type Lang,
  type MsgKey,
} from '../i18n';
import {
  colorName,
  describeFullTackle,
  difficultyName,
  landPenaltyName,
  lateJoinName,
  lineName,
  lureHint,
  lureName,
  penaltyName,
  rodHint,
  rodName,
  speciesName,
  timeOfDayName,
  weatherLevelName,
  winRuleName,
} from '../i18n/names';

const SETTINGS_KEY = 'lunki.soloSettings';

const MODE_HINTS: Record<RecordMode, MsgKey> = {
  race: 'records.raceHint',
  solo: 'records.soloHint',
};
/** Kielivalitsimen nimet kunkin kielen omalla kielellä. */
const LANG_NAMES: Record<Lang, string> = { fi: 'Suomi', en: 'English' };
/** Kalojen kuvat listoissa: kapealla näytöllä pienempinä (ks. style.css). */
const LIST_FISH_SCALE = 'var(--fish-px, 2px)';

const partName = (part: AppearancePart) => t(`part.${part}`);

/** Asetusten vaihtoehdot valintariveiksi pelaajan kielellä. */
const durationOptions = (): [string, string][] =>
  DURATIONS.map((d) => [String(d), t('common.minutes', { n: d })]);
const difficultyOptions = (): [string, string][] =>
  (Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => [d, difficultyName(d)]);
const timeOfDayOptions = (): [string, string][] =>
  TIME_OF_DAY_IDS.map((v) => [v, timeOfDayName(v)]);
const weatherOptions = (): [string, string][] =>
  WEATHER_LEVEL_IDS.map((v) => [v, weatherLevelName(v)]);
const penaltyOptions = (): [string, string][] => PENALTY_IDS.map((p) => [p, penaltyName(p)]);
const landOptions = (): [string, string][] =>
  LAND_PENALTIES.map((s) => [String(s), landPenaltyName(s)]);

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
  /** Tulossivulla valittuna saaliskartta (säilyy saman näkymän uudelleenpiirrossa). */
  private resultsOnMap = false;

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
    /** Kieli vaihtui: valikko piirretään uudelleen. */
    onLanguage: () => void;
  }): void {
    const panel = this.panel();
    const menu = this.buttons([
      ...(actions.rejoin
        ? ([
            [t('menu.rejoin', { code: formatRoomCode(actions.rejoin.code) }), actions.rejoin.run],
          ] as [string, () => void][])
        : []),
      [t('menu.solo'), actions.onSolo],
      [t('menu.multiplayer'), actions.onMultiplayer],
      [t('menu.lakeMap'), actions.onLakeMap],
      [t('menu.records'), actions.onRecords],
      [t('menu.audio'), actions.onAudio],
      [t('menu.feedback'), actions.onFeedback],
      [t('menu.credits'), actions.onCredits],
    ]);
    const language = this.choice(
      t('menu.language'),
      LANGS.map((l) => [l, LANG_NAMES[l]]),
      getLang(),
      (v) => {
        setLang(v as Lang);
        actions.onLanguage();
      },
    );
    language.classList.add('language-choice');
    menu.classList.add('main-menu');
    panel.classList.add('start-panel');
    panel.append(
      waveTitle('LUNKINJÄRVI'),
      h('p', t('menu.subtitle'), 'subtitle'),
      menu,
      language,
      h('p', t('menu.controls'), 'hint'),
      h('p', t('menu.mapCredit'), 'hint credit-line'),
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
      h('p', t('lakeMap.hint'), 'hint'),
      this.buttons([[t('common.back'), onBack]]),
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
    tackle: { current: Tackle; onChange: (t: Tackle) => void },
  ): void {
    const settings = { ...initial };
    const panel = this.panel();
    panel.append(
      h('h2', t('solo.title')),
      this.choice(
        t('settings.duration'),
        durationOptions(),
        String(settings.durationMinutes),
        (v) => (settings.durationMinutes = Number(v)),
      ),
      this.startChoice(
        settings.start ?? null,
        () => (settings.start = null),
        () => onPickStart({ ...settings }),
      ),
      this.choice(
        t('settings.difficulty'),
        difficultyOptions(),
        settings.difficulty,
        (v) => (settings.difficulty = v as Difficulty),
      ),
      h('p', t('settings.difficultyHint'), 'hint'),
      this.speciesChoice(settings.species ?? [], (list) => (settings.species = list)),
      this.choice(
        t('settings.timeOfDay'),
        timeOfDayOptions(),
        settings.timeOfDay ?? 'day',
        (v) => (settings.timeOfDay = v as TimeOfDay),
      ),
      this.choice(
        t('settings.weather'),
        weatherOptions(),
        settings.weather ?? 'realistic',
        (v) => (settings.weather = v as WeatherLevel),
      ),
      this.choice(
        t('settings.lightning'),
        penaltyOptions(),
        settings.lightningPenalty ?? 'time-out',
        (v) => (settings.lightningPenalty = v as Penalty),
      ),
      this.choice(
        t('settings.capsize'),
        penaltyOptions(),
        settings.capsizePenalty ?? 'none',
        (v) => (settings.capsizePenalty = v as Penalty),
      ),
      this.choice(
        t('settings.land'),
        landOptions(),
        String(settings.landPenalty ?? 30),
        (v) => (settings.landPenalty = Number(v)),
      ),
      h('p', t('settings.hazardHint'), 'hint'),
      h('p', t('settings.tackle'), 'choice-label'),
      this.tackleEditor(tackle.current, tackle.onChange, 'before'),
      h('p', t('settings.colors'), 'choice-label'),
      this.appearanceEditor(appearance.current, appearance.onChange),
      this.buttons([
        [
          t('settings.startRace'),
          () => {
            saveSettings(settings);
            onStart(settings);
          },
        ],
        [t('common.back'), onBack],
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
    const nameInput = this.input(t('common.nickname'), name, NAME_MAX_LENGTH, t('common.angler'));
    const codeInput = this.input(t('mp.roomCode'), code, 40, 'LUNKI-XXXX');
    const nameValue = () => (nameInput.querySelector('input') as HTMLInputElement).value;
    const codeValue = () => (codeInput.querySelector('input') as HTMLInputElement).value;
    const status = h('p', t('mp.checkingServer'), 'hint server-status');
    panel.append(h('h2', t('mp.title')), status, nameInput);
    if (error) panel.append(h('p', error, 'error'));
    panel.append(
      this.buttons([[t('mp.create'), () => onCreate(nameValue())]]),
      codeInput,
      this.buttons([
        [t('mp.join'), () => onJoin(nameValue(), codeValue())],
        [t('common.back'), onBack],
      ]),
      h('p', t('mp.hint'), 'hint'),
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
    el.textContent = ok ? t('mp.serverOk') : t('mp.serverDown');
    // Linkki voi ohjata vieraalle palvelimelle: kerrotaan, minne yhdistetään.
    if (custom) el.textContent += t('mp.customServer', { url: custom });
    el.classList.toggle('error', !ok);
    el.classList.toggle('ok', ok);
  }

  showMessage(title: string, text: string, onCancel?: () => void): void {
    const panel = this.panel();
    panel.append(h('h2', title), h('p', text));
    if (onCancel) panel.append(this.buttons([[t('common.cancel'), onCancel]]));
    this.show(panel);
  }

  /** Aula: pelaajat, valmius ja kisan aloitus. Piirretään uudelleen tilan muuttuessa. */
  showLobby(
    v: LobbyView,
    link: string,
    actions: {
      onReady: (ready: boolean) => void;
      onStart: () => void;
      /** Seuraava kisa katsojana (true) tai kalastajana. */
      onSpectate: (on: boolean) => void;
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
    copy.textContent = t('lobby.copyLink');
    copy.addEventListener('click', () => {
      // Leikepöytää ei ole suojaamattomalla http-sivulla (LAN-peli): näytetään linkki.
      if (!navigator.clipboard) {
        copy.textContent = link;
        return;
      }
      void navigator.clipboard.writeText(link).then(
        () => (copy.textContent = t('lobby.linkCopied')),
        () => (copy.textContent = link),
      );
    });
    const list = document.createElement('ul');
    list.className = 'player-list';
    for (const p of v.players) {
      const li = document.createElement('li');
      const state = t(
        !p.connected
          ? 'lobby.disconnected'
          : p.spectator
            ? p.host
              ? 'lobby.hostSpectator'
              : 'lobby.spectator'
            : p.host
              ? 'lobby.host'
              : p.ready
                ? 'lobby.ready'
                : 'lobby.waiting',
      );
      const swatch = h('span', '', 'player-color');
      swatch.style.background = cssColor(p.appearance.tube);
      const name = h('span', `${p.name}${p.me ? t('lobby.you') : ''}`);
      name.prepend(swatch);
      li.append(
        name,
        h('span', state, `player-state ${p.host || p.ready || p.spectator ? 'ok' : ''}`),
        // Katsoja ei kalasta: ei varusteita.
        ...(p.spectator ? [] : [h('span', describeFullTackle(p.tackle), 'player-gear')]),
      );
      list.appendChild(li);
    }
    panel.append(
      h('h2', t('lobby.title')),
      h('p', t('mp.roomCode'), 'hint'),
      code,
      copy,
      h('p', t('lobby.players', { n: v.players.length, max: v.maxPlayers }), 'choice-label'),
      list,
    );
    // Esim. turnauksessa karsitut voivat katsoa seuraavaa kisaa.
    if (v.canSpectate && me)
      panel.append(
        this.choice(
          t('lobby.nextRace'),
          [
            ['play', t('lobby.play')],
            ['watch', t('lobby.watch')],
          ],
          me.spectator ? 'watch' : 'play',
          (c) => actions.onSpectate(c === 'watch'),
        ),
        ...(me.spectator ? [h('p', t('lobby.spectatorHint'), 'hint')] : []),
      );
    if (chat) {
      panel.append(h('p', t('lobby.chat'), 'choice-label'));
      chat(panel);
    }
    panel.append(
      v.amHost
        ? this.settingsEditor(v.settings, v.players.length, actions.onSettings, actions.onPickStart)
        : this.settingsSummary(v.settings),
      // Katsoja ei kalasta, joten varusteita ei tarvita.
      ...(me?.spectator
        ? []
        : [
            h('p', t('settings.tackle'), 'choice-label'),
            this.tackleEditor(me?.tackle ?? DEFAULT_TACKLE, actions.onTackle, 'before'),
          ]),
      h('p', t('settings.colors'), 'choice-label'),
      this.appearanceEditor(me?.appearance ?? null, actions.onAppearance),
    );
    if (notice) panel.append(h('p', notice, 'error'));
    const buttons: [string, () => void][] = [];
    if (v.amHost)
      buttons.push([
        v.allReady ? t('settings.startRace') : t('lobby.startWaiting'),
        actions.onStart,
      ]);
    else if (!me?.spectator)
      buttons.push([
        me?.ready ? t('lobby.notReady') : t('lobby.setReady'),
        () => actions.onReady(!me?.ready),
      ]);
    buttons.push([t('common.leave'), actions.onLeave]);
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
    const nameRow = this.input(
      t('common.nickname'),
      name,
      FEEDBACK_LIMITS.name,
      t('feedback.optional'),
    );
    const nameInput = nameRow.querySelector('input')!;
    const text = document.createElement('textarea');
    text.maxLength = FEEDBACK_LIMITS.text;
    text.rows = 6;
    text.placeholder = t('feedback.placeholder');
    const status = h('p', '', 'hint');
    const send = async () => {
      if (!text.value.trim()) {
        status.textContent = t('feedback.empty');
        return;
      }
      status.textContent = t('feedback.sending');
      const ok = await onSend({ name: nameInput.value, text: text.value });
      if (ok) {
        text.value = '';
        status.textContent = t('feedback.thanks');
      } else {
        status.textContent = t('feedback.failed');
      }
    };
    panel.append(
      h('h2', t('feedback.title')),
      h('p', t('feedback.hint'), 'hint'),
      nameRow,
      text,
      status,
      this.buttons([
        [t('common.send'), () => void send()],
        [t('common.back'), onBack],
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
      h('h2', t('audio.title')),
      this.audioEditor(current, onChange),
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel);
  }

  private audioEditor(initial: AudioSettings, onChange: (a: AudioSettings) => void): HTMLElement {
    const a = { ...initial };
    const box = document.createElement('div');
    box.className = 'settings';
    const row = (label: string, key: 'effects' | 'ambience' | 'music') =>
      this.choice(
        label,
        VOLUME_LEVELS.map((v) => [String(v), t(`volume.${v}`)]),
        String(a[key]),
        (v) => {
          a[key] = Number(v) as VolumeLevel;
          onChange({ ...a });
        },
      );
    box.append(
      row(t('audio.effects'), 'effects'),
      row(t('audio.ambience'), 'ambience'),
      row(t('audio.music'), 'music'),
      this.choice(
        t('audio.track'),
        MUSIC_CHOICES.map((c) => [c, t(`music.${c}`)]),
        a.musicTrack,
        (v) => {
          a.musicTrack = v as MusicChoice;
          onChange({ ...a });
        },
      ),
    );
    return box;
  }

  /** HUDin koko portaittaisella liukusäätimellä (HUD_SCALES). */
  private hudSizeSlider({
    current: initial,
    onChange,
    effective,
  }: {
    current: number;
    onChange: (scale: number) => void;
    effective: () => number | null;
  }): HTMLElement {
    const row = document.createElement('div');
    row.className = 'choice hud-size';
    const label = h('label', '', 'choice-label') as HTMLLabelElement;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(HUD_SCALES.length - 1);
    slider.step = '1';
    const index = HUD_SCALES.indexOf(initial);
    slider.value = String(index >= 0 ? index : HUD_SCALES.indexOf(DEFAULT_HUD_SCALE));
    slider.id = 'hud-size';
    label.htmlFor = slider.id;
    const scale = () => HUD_SCALES[Number(slider.value)] ?? DEFAULT_HUD_SCALE;
    const relabel = () => {
      const pct = Math.round(scale() * 100);
      // Ruudulle mahtuu vain pienempi: kerrotaan, ettei liukusäädin näytä jumittuvan.
      const fits = effective();
      const capped = fits !== null && fits < scale() - 0.01;
      label.textContent = capped
        ? t('pause.hudSizeCapped', { pct, fits: Math.round(fits * 100) })
        : t('pause.hudSize', { pct });
      slider.setAttribute('aria-valuetext', label.textContent);
    };
    relabel();
    slider.addEventListener('input', () => {
      onChange(scale());
      relabel();
    });
    const small = h('span', 'A', 'hud-size-end small');
    const big = h('span', 'A', 'hud-size-end');
    const track = document.createElement('div');
    track.className = 'hud-size-track';
    track.append(small, slider, big);
    row.append(label, track);
    return row;
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
      h('h2', t('credits.title')),
      h('p', t('credits.authors')),
      h('p', t('credits.mapData'), 'choice-label'),
      list(mapCredits().map(creditText)),
      h('p', t('credits.depthNote'), 'hint'),
      h('p', t('credits.libraries'), 'choice-label'),
      list(
        LIBRARIES.map((l) => {
          const span = document.createElement('span');
          span.append(link(l.nameKey ? t(l.nameKey) : l.name, l.url), ` – ${l.license}`);
          return span;
        }),
      ),
      list([link(t('credits.osmCopyright'), 'https://www.openstreetmap.org/copyright')]),
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel);
  }

  /**
   * Järven ennätyslista vaikeustasoittain, moninpelin ja yksinpelin listat
   * erikseen; null = palvelinta ei tavoitettu (tai se ei tunne yksinpelin
   * listaa). Kartalla näkyy, mistä kukin ennätyskala saatiin, ja Tiedot-napin
   * takana saaliin aika, sää ja varusteet.
   */
  showRecords(
    raceBoard: RecordBoard | null,
    soloBoard: RecordBoard | null,
    initial: Difficulty,
    onBack: () => void,
  ): void {
    const panel = this.panel();
    panel.append(h('h2', t('records.title')));
    if (!raceBoard && !soloBoard) {
      panel.append(
        h('p', t('records.noServer'), 'error'),
        this.buttons([[t('common.back'), onBack]]),
      );
      this.show(panel);
      return;
    }
    let difficulty = initial;
    let mode: RecordMode = 'race';
    let board: RecordBoard = raceBoard ?? {};
    /** Kartalla näkyvät ennätykset (vain ne, joiden paikka on tallessa). */
    let placed: RecordEntry[] = [];
    const detailsBox = (r: RecordEntry) => {
      const box = document.createElement('div');
      box.className = 'settings-summary record-details';
      const spot = r.x !== undefined && r.y !== undefined ? describeSpot({ x: r.x, y: r.y }) : null;
      for (const [k, v] of recordDetails(r, spot)) {
        const row = document.createElement('div');
        row.append(h('span', k, 'choice-label'), h('span', v));
        box.append(row);
      }
      return box;
    };
    const selected = document.createElement('div');
    const showSelected = (i: number) => {
      const r = placed[i];
      selected.replaceChildren(
        ...(r ? [h('p', recordTitle(r), 'choice-label'), detailsBox(r)] : []),
      );
    };
    const map = new LakeMapView({ onPin: showSelected });
    const legend = document.createElement('div');
    legend.className = 'lake-map-legend';
    const mapView = document.createElement('div');
    mapView.append(map.element, selected, legend);

    const lists = document.createElement('div');
    const content = document.createElement('div');
    const toggle = document.createElement('div');
    const setView = (showMap: boolean) => {
      panel.classList.toggle('map-panel', showMap);
      content.replaceChildren(showMap ? mapView : lists);
      toggle.replaceChildren(
        this.choice(
          t('common.view'),
          [
            ['list', t('records.list')],
            ['map', t('records.map')],
          ],
          showMap ? 'map' : 'list',
          (v) => setView(v === 'map'),
        ),
      );
    };
    const openOnMap = (r: RecordEntry) => {
      setView(true);
      const i = placed.indexOf(r);
      map.selectPin(i);
      showSelected(i);
    };

    const render = () => {
      lists.replaceChildren();
      placed = [];
      const missing = mode === 'solo' ? !soloBoard : !raceBoard;
      if (missing)
        lists.append(
          h('p', mode === 'solo' ? t('records.soloMissing') : t('records.raceMissing'), 'error'),
        );
      board = (mode === 'solo' ? soloBoard : raceBoard) ?? {};
      modeHint.textContent = t(MODE_HINTS[mode]);
      const species = new Set<SpeciesId>();
      for (const o of SPECIES_OPTIONS) {
        const rows = board[difficulty]?.[o.value] ?? [];
        if (missing || (rows.length === 0 && !o.native)) continue;
        lists.append(h('p', speciesName(o.value), 'choice-label'));
        const ol = document.createElement('ol');
        ol.className = 'catch-list records';
        for (const r of rows) {
          if (r.x !== undefined && r.y !== undefined) {
            placed.push(r);
            species.add(r.species);
          }
          const li = document.createElement('li');
          li.textContent = `${formatWeight(r.weight).padStart(8)}  ${r.angler.padEnd(16)} ${formatDate(r.date)}`;
          const info = document.createElement('button');
          info.type = 'button';
          info.className = 'record-info';
          info.textContent = t('records.details');
          info.setAttribute('aria-expanded', 'false');
          // Tiedot avautuvat omalle rivilleen; koko rivin napautus käy myös puhelimella.
          let open: HTMLElement | null = null;
          const toggleInfo = (e: Event) => {
            e.stopPropagation();
            if (open) {
              open.remove();
              open = null;
            } else {
              open = document.createElement('li');
              open.className = 'record-more';
              open.append(detailsBox(r));
              if (r.x !== undefined)
                open.append(this.buttons([[t('records.showOnMap'), () => openOnMap(r)]]));
              li.after(open);
            }
            info.setAttribute('aria-expanded', String(open !== null));
          };
          info.addEventListener('click', toggleInfo);
          li.addEventListener('click', toggleInfo);
          li.className = 'record-row';
          li.append(info, fishImage(r.species, r.weight, LIST_FISH_SCALE));
          ol.appendChild(li);
        }
        if (rows.length === 0) ol.append(h('li', t('records.none'), 'hint'));
        lists.append(ol);
      }
      map.setPins(
        placed.map((r) => ({
          pos: { x: r.x!, y: r.y! },
          color: SPECIES_PIN_COLORS[r.species] ?? '#eef2f3',
          label: `${recordTitle(r)} · ${r.angler}`,
        })),
      );
      showSelected(-1);
      legend.replaceChildren(
        ...(placed.length === 0
          ? [h('span', t('records.noPlaced'))]
          : SPECIES_OPTIONS.filter((o) => species.has(o.value)).map((o) => {
              const item = h('span', speciesName(o.value));
              const swatch = document.createElement('i');
              swatch.style.background = SPECIES_PIN_COLORS[o.value];
              item.prepend(swatch);
              return item;
            })),
      );
    };
    const modeHint = h('p', '', 'hint');
    render();
    setView(false);
    panel.append(
      this.choice(
        t('records.board'),
        [
          ['race', t('menu.multiplayer')],
          ['solo', t('menu.solo')],
        ],
        mode,
        (v) => {
          mode = v as RecordMode;
          render();
        },
      ),
      this.choice(t('settings.difficultyShort'), difficultyOptions(), initial, (v) => {
        difficulty = v as Difficulty;
        render();
      }),
      toggle,
      content,
      modeHint,
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel, () => map.dispose());
  }

  showPause(
    onResume: () => void,
    onQuit: () => void,
    multiplayer = false,
    tackle?: { current: Tackle; onChange: (t: Tackle) => void },
    audio?: { current: AudioSettings; onChange: (a: AudioSettings) => void },
    /** Pelikellon aika järvellä, esim. 05:12. */
    clock?: string,
    hudSize?: {
      current: number;
      onChange: (scale: number) => void;
      /** Toteutunut koko, kun ruudulle ei mahdu valittua (null = ei tiedossa). */
      effective: () => number | null;
    },
  ): void {
    const panel = this.panel();
    panel.append(
      h('h2', multiplayer ? t('pause.menu') : t('pause.title')),
      ...(clock ? [h('p', t('pause.clock', { time: clock }))] : []),
      ...(multiplayer ? [h('p', t('pause.continues'), 'hint')] : []),
      ...(tackle ? [this.tackleEditor(tackle.current, tackle.onChange, 'during')] : []),
      ...(audio ? [this.audioEditor(audio.current, audio.onChange)] : []),
      ...(hudSize ? [this.hudSizeSlider(hudSize)] : []),
      this.buttons([
        [t('pause.resume'), onResume],
        [multiplayer ? t('pause.leaveRace') : t('pause.endRace'), onQuit],
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
    card?: WeighCardInfo | null,
    race?: RaceMapData | null,
  ): void {
    // Uudelleenpiirto (esim. isäntä vaihtui) säilyttää valitun näkymän.
    if (this.scrollOf('race-results') === null) this.resultsOnMap = false;
    const panel = this.panel();
    panel.dataset.screen = 'race-results';
    const winner = results[0];
    panel.append(
      h('h2', t('results.raceOver')),
      h(
        'p',
        winner && winner.summary.score > 0
          ? t('results.winner', { name: winner.name, weight: formatWeight(winner.summary.score) })
          : t('results.noFish'),
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
      li.textContent = t('results.row', {
        name: r.name.padEnd(12),
        count: String(r.summary.count).padStart(2),
        total: formatWeight(r.summary.total).padStart(8),
        biggest,
      });
      const gear = tackles?.get(r.id);
      const big = r.summary.biggest;
      if (big) li.append(fishImage(big.species, big.weight, LIST_FISH_SCALE));
      if (gear) li.append(h('span', describeFullTackle(gear), 'player-gear'));
      table.appendChild(li);
    }
    const map = race ? this.raceMap(race) : null;
    panel.append(
      ...this.resultsWithMap(panel, table, map),
      h(
        'p',
        `${winRuleName(settings.winRule)} · ${difficultyName(settings.difficulty)} · ${t('common.minutes', { n: settings.durationMinutes })}`,
        'hint',
      ),
    );
    if (card) panel.append(this.weighCard(card));
    if (chat) chat(panel);
    panel.append(
      this.buttons(
        amHost
          ? [
              [t('results.newRace'), onRestart],
              [t('common.leave'), onLeave],
            ]
          : [[t('common.leave'), onLeave]],
      ),
    );
    if (!amHost) panel.append(h('p', t('results.hostRestarts'), 'hint'));
    this.show(panel, map?.dispose);
  }

  showResults(
    c: CompetitionState,
    onAgain: () => void,
    onMenu: () => void,
    card?: WeighCardInfo | null,
    race?: RaceMapData | null,
    recordNotes: readonly string[] = [],
  ): void {
    this.resultsOnMap = false;
    const panel = this.panel();
    const sum = summarize(c.catches, c.settings.winRule);
    const map = race ? this.raceMap(race) : null;
    panel.append(
      h(
        'h2',
        c.elapsed >= c.settings.durationMinutes * 60 ? t('results.timeUp') : t('results.ended'),
      ),
    );
    if (sum.count === 0) {
      panel.append(h('p', t('results.empty')));
      // Reitistä näkee silti, missä tuli käytyä.
      if (map) panel.append(...this.resultsWithMap(panel, h('div', ''), map));
    } else {
      const list = document.createElement('ol');
      list.className = 'catch-list';
      for (const ct of [...c.catches].sort((a, b) => b.weight - a.weight)) {
        const li = document.createElement('li');
        li.textContent = `${speciesName(ct.species).padEnd(8)} ${formatWeight(ct.weight).padStart(8)}   ${formatTime(ct.time)}`;
        li.append(fishImage(ct.species, ct.weight, LIST_FISH_SCALE));
        list.appendChild(li);
      }
      panel.append(
        ...this.resultsWithMap(panel, list, map),
        h(
          'p',
          t('results.summary', {
            count: sum.count,
            total: formatWeight(sum.total),
            biggest: formatWeight(sum.biggest!.weight),
          }),
          'total',
        ),
        ...recordNotes.map((n) => h('p', n, 'total')),
      );
      if (card) panel.append(this.weighCard(card));
    }
    panel.append(
      h(
        'p',
        `${difficultyName(c.settings.difficulty)} · ${t('common.minutes', { n: c.settings.durationMinutes })}`,
        'hint',
      ),
      this.buttons([
        [t('results.again'), onAgain],
        [t('results.toMenu'), onMenu],
      ]),
    );
    this.show(panel, map?.dispose);
  }

  /**
   * Tulosten näkymävalinta: taulukko tai saaliskartta. Palauttaa paneeliin
   * lisättävät osat; ilman karttaa pelkän taulukon.
   */
  private resultsWithMap(
    panel: HTMLElement,
    table: HTMLElement,
    map: { element: HTMLElement } | null,
  ): HTMLElement[] {
    if (!map) return [table];
    const content = document.createElement('div');
    const setView = (onMap: boolean) => {
      this.resultsOnMap = onMap;
      panel.classList.toggle('map-panel', onMap);
      content.replaceChildren(onMap ? map.element : table);
    };
    setView(this.resultsOnMap);
    const toggle = this.choice(
      t('common.view'),
      [
        ['list', t('results.table')],
        ['map', t('results.catchMap')],
      ],
      this.resultsOnMap ? 'map' : 'list',
      (v) => setView(v === 'map'),
    );
    return [toggle, content];
  }

  /**
   * Kisan kulku järvikartalla: jokaisen reitti omalla värillään, saaliit
   * merkkeinä nostopaikassa ja salamat, kaatumiset ja sotkut pieninä
   * merkkeinä. Null, jos kisasta ei ole mitään näytettävää.
   */
  private raceMap(race: RaceMapData): { element: HTMLElement; dispose: () => void } | null {
    if (race.tracks.length === 0 && race.catches.length === 0) return null;
    const tracks = new Map(race.tracks.map((track) => [track.id, track]));
    const solo = race.tracks.length <= 1;
    const pins = race.catches.map((c) => ({
      pos: c.pos,
      color: tracks.get(c.id)?.color ?? '#eef2f3',
      label: `${solo ? '' : `${tracks.get(c.id)?.name ?? c.id}: `}${speciesName(c.species)} ${formatWeight(c.weight)} · ${formatTime(c.time)}`,
    }));
    const map = new LakeMapView({ pins, race, onPin: () => {} });
    const legend = document.createElement('div');
    legend.className = 'lake-map-legend race-legend';
    for (const track of race.tracks) {
      const n = race.catches.filter((c) => c.id === track.id).length;
      const item = h('span', t('results.trackCount', { name: track.name, n }));
      const swatch = document.createElement('i');
      swatch.style.background = track.color;
      item.prepend(swatch);
      legend.append(item);
    }
    legend.append(h('span', t('results.catchLegend')));
    const kinds = new Set(race.events.map((e) => e.kind));
    for (const kind of Object.keys(RACE_EVENT_STYLE) as RaceEventKind[]) {
      if (!kinds.has(kind)) continue;
      const style = RACE_EVENT_STYLE[kind];
      const glyph = h('b', style.glyph);
      glyph.style.color = style.color;
      const item = h('span', ` ${t(`raceEvent.${kind}`)}`);
      item.prepend(glyph);
      legend.append(item);
    }
    const element = document.createElement('div');
    element.className = 'race-map';
    element.append(map.element, legend);
    return { element, dispose: () => map.dispose() };
  }

  /** Kisan suurimman kalan punnituskortti: tallennus kuvana ja jakaminen. */
  private weighCard(info: WeighCardInfo): HTMLElement {
    const box = document.createElement('div');
    box.className = 'weigh-card-box';
    const canvas = drawWeighCard(info);
    const status = h('p', '', 'hint');
    const url = location.origin + location.pathname;
    const save = async () => {
      const blob = await cardBlob(canvas);
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = cardFileName(info);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      status.textContent = t('card.saved');
    };
    const share = async () => {
      const text = weighCardText(info, url);
      const blob = await cardBlob(canvas);
      try {
        const file = blob ? new File([blob], cardFileName(info), { type: 'image/png' }) : null;
        if (file && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text });
          return;
        }
        if (blob && typeof ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          status.textContent = t('card.imageCopied');
          return;
        }
        await navigator.clipboard.writeText(text);
        status.textContent = t('card.textCopied');
      } catch (err) {
        // Käyttäjä perui jakamisen tai selain esti leikepöydän.
        if ((err as Error).name !== 'AbortError') {
          status.textContent = t('card.shareFailed');
        }
      }
    };
    box.append(
      h('p', t('card.label'), 'choice-label'),
      canvas,
      this.buttons([
        [t('card.share'), () => void share()],
        [t('card.save'), () => void save()],
      ]),
      status,
    );
    return box;
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
      this.choice(t('settings.duration'), durationOptions(), String(s.durationMinutes), (v) =>
        change({ durationMinutes: Number(v) }),
      ),
      this.startChoice(s.start ?? null, () => change({ start: null }), pickStart),
      this.choice(
        t('settings.winRule'),
        (Object.keys(WIN_RULE_NAMES) as WinRule[]).map((w) => [w, winRuleName(w)]),
        s.winRule,
        (v) => change({ winRule: v as WinRule }),
      ),
      this.choice(t('settings.difficulty'), difficultyOptions(), s.difficulty, (v) =>
        change({ difficulty: v as Difficulty }),
      ),
      this.choice(
        t('settings.maxPlayers'),
        PLAYER_COUNTS.map((n) => [String(n), String(n), n < playerCount]),
        String(s.maxPlayers),
        (v) => change({ maxPlayers: Number(v) }),
      ),
      this.speciesChoice(s.species, (species) => change({ species })),
      this.choice(t('settings.timeOfDay'), timeOfDayOptions(), s.timeOfDay, (v) =>
        change({ timeOfDay: v as TimeOfDay }),
      ),
      this.choice(t('settings.weather'), weatherOptions(), s.weather, (v) =>
        change({ weather: v as WeatherLevel }),
      ),
      this.choice(t('settings.lightning'), penaltyOptions(), s.lightningPenalty, (v) =>
        change({ lightningPenalty: v as Penalty }),
      ),
      this.choice(t('settings.capsize'), penaltyOptions(), s.capsizePenalty, (v) =>
        change({ capsizePenalty: v as Penalty }),
      ),
      this.choice(t('settings.land'), landOptions(), String(s.landPenalty), (v) =>
        change({ landPenalty: Number(v) }),
      ),
      this.choice(
        t('settings.lateJoin'),
        LATE_JOIN_OPTIONS.map((o) => [o.value, lateJoinName(o.value)]),
        s.lateJoin,
        (v) => change({ lateJoin: v as RoomSettings['lateJoin'] }),
      ),
      h('p', t('settings.lateJoinHint'), 'hint'),
    );
    return box;
  }

  /**
   * Varusteet: vapa, viehe, siima ja teräsperuke. Ennen kisaa valitaan vapa
   * (viehe vaihdetaan kisan aikana), kisan aikana viehe (vapa pysyy samana).
   */
  private tackleEditor(
    initial: Tackle,
    onChange: (t: Tackle) => void,
    mode: 'before' | 'during',
  ): HTMLElement {
    const tk = { ...initial };
    const box = document.createElement('div');
    box.className = 'settings';
    box.dataset.tackle = mode;
    const rodText = h('p', rodHint(tk.rod), 'hint');
    const hint = h('p', lureHint(tk.lure), 'hint');
    const set = (patch: Partial<Tackle>) => {
      Object.assign(tk, patch);
      rodText.textContent = rodHint(tk.rod);
      hint.textContent = lureHint(tk.lure);
      onChange({ ...tk });
    };
    if (mode === 'before')
      box.append(
        this.choice(
          t('tackle.rod'),
          ROD_IDS.map((id) => [id, rodName(id)]),
          tk.rod,
          (v) => set({ rod: v as Tackle['rod'] }),
        ),
        rodText,
      );
    else
      box.append(
        this.choice(
          t('tackle.lure'),
          LURE_IDS.map((id) => [id, lureName(id)]),
          tk.lure,
          (v) => set({ lure: v as Tackle['lure'] }),
        ),
        hint,
      );
    box.append(
      this.choice(
        t('tackle.line'),
        LINE_IDS.map((id) => [
          id,
          t('tackle.lineOption', { name: lineName(id), kg: shortDecimal(LINES[id].strength) }),
        ]),
        tk.line,
        (v) => set({ line: v as Tackle['line'] }),
      ),
      this.choice(
        t('tackle.leader'),
        [
          ['no', t('common.no')],
          ['yes', t('common.yes')],
        ],
        tk.leader ? 'yes' : 'no',
        (v) => set({ leader: v === 'yes' }),
      ),
      h('p', t('tackle.hint'), 'hint'),
    );
    if (mode === 'during') {
      box.append(h('p', t('tackle.rodLocked', { rod: rodName(tk.rod) }), 'hint'));
      return box;
    }
    box.append(h('p', t('tackle.lureInRace'), 'hint'));
    // Viehettä ei valita ennen kisaa, joten se säilyy ennallaan.
    const beginner = document.createElement('button');
    beginner.textContent = t('tackle.beginner');
    beginner.title = describeFullTackle({ ...DEFAULT_TACKLE, lure: tk.lure });
    beginner.addEventListener('click', () => {
      const reset = { ...DEFAULT_TACKLE, lure: tk.lure };
      onChange(reset);
      box.replaceWith(this.tackleEditor(reset, onChange, mode));
    });
    box.append(beginner);
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
    preview.setAttribute('aria-label', t('appearance.preview'));
    drawTubePreview(preview, a);
    const rows = document.createElement('div');
    rows.className = 'appearance-rows';
    for (const part of APPEARANCE_PARTS) {
      const row = document.createElement('div');
      row.className = 'choice';
      row.append(h('span', partName(part), 'choice-label'));
      const group = document.createElement('div');
      group.className = 'choice-options swatches';
      for (const c of colorOptions(part)) {
        const b = document.createElement('button');
        b.className = 'swatch';
        // Ruksi tummana vaaleilla väreillä ja vaaleana tummilla.
        if (isLight(c.hex)) b.classList.add('light');
        b.style.background = cssColor(c.hex);
        const color = colorName(c.hex, c.name);
        b.title = color;
        b.setAttribute('aria-label', `${partName(part)}: ${color}`);
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
    row.append(h('span', t('settings.species'), 'choice-label'));
    const group = document.createElement('div');
    group.className = 'choice-options';
    for (const o of SPECIES_OPTIONS) {
      const b = document.createElement('button');
      b.textContent = o.native ? speciesName(o.value) : `${speciesName(o.value)}*`;
      if (!o.native) b.title = t('settings.notNative');
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
    row.append(group, h('p', t('settings.notNativeHint'), 'hint'));
    return row;
  }

  /** Aloituspaikka: satunnainen tai kartalta valittu. */
  private startChoice(start: Vec2 | null, onRandom: () => void, onPick: () => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'choice';
    row.append(h('span', t('settings.start'), 'choice-label'));
    const group = document.createElement('div');
    group.className = 'choice-options';
    const random = document.createElement('button');
    random.textContent = t('settings.startRandom');
    const pick = document.createElement('button');
    pick.textContent = start ? t('settings.startChange') : t('settings.startPick');
    const hint = h('p', startText(start), 'hint');
    const select = (chosen: boolean) => {
      random.classList.toggle('selected', !chosen);
      pick.classList.toggle('selected', chosen);
    };
    select(start !== null);
    random.addEventListener('click', () => {
      select(false);
      pick.textContent = t('settings.startPick');
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
      [t('startPicker.choose'), () => onDone(chosen)],
      [t('settings.startRandom'), () => onDone(null)],
      [t('common.cancel'), onCancel],
    ]);
    const confirm = buttons.querySelector('button')!;
    confirm.disabled = chosen === null;
    const map = new LakeMapView({
      marker: current,
      markerLabel: t('startPicker.marker'),
      onPick: (p) => {
        chosen = p;
        confirm.disabled = false;
      },
    });
    panel.append(
      h('h2', t('settings.start')),
      map.element,
      h('p', t('startPicker.hint'), 'hint'),
      buttons,
    );
    this.show(panel, () => map.dispose());
  }

  /** Muut pelaajat näkevät asetukset tekstinä. */
  private settingsSummary(s: RoomSettings): HTMLElement {
    const box = document.createElement('div');
    box.className = 'settings-summary';
    const rows: [string, string][] = [
      [t('settings.duration'), t('common.minutes', { n: s.durationMinutes })],
      [t('settings.winRule'), winRuleName(s.winRule)],
      [t('settings.difficultyShort'), difficultyName(s.difficulty)],
      [t('settings.maxPlayers'), String(s.maxPlayers)],
      [t('settings.timeOfDay'), timeOfDayName(s.timeOfDay)],
      [t('settings.weather'), weatherLevelName(s.weather)],
      [
        t('settings.lightningCapsize'),
        `${penaltyName(s.lightningPenalty)} / ${penaltyName(s.capsizePenalty)}`,
      ],
      [t('settings.land'), landPenaltyName(s.landPenalty)],
      [t('settings.lateJoin'), lateJoinName(s.lateJoin)],
      [t('settings.species'), s.species.map(speciesName).join(', ')],
      [t('settings.start'), startText(s.start ?? null)],
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
  if (!start) return t('settings.startRandomText');
  const spot = describeSpot(start);
  return spot
    ? t('settings.startPickedAt', { spot: `${spot.charAt(0).toLowerCase()}${spot.slice(1)}` })
    : t('settings.startPicked');
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
