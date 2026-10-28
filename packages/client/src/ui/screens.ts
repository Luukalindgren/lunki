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
  RODS,
  JIG_WEIGHT_IDS,
  CRANK_DEPTH_IDS,
  fitsCastWeight,
  lureTuning,
  DEFAULT_TACKLE,
  FLY_IDS,
  FLY_LEADERS,
  FLY_LEADER_IDS,
  FLY_LINE_IDS,
  FLY_ROD_IDS,
  METHODS,
  type Method,
  NAME_MAX_LENGTH,
  LAND_PENALTIES,
  LATE_JOIN_OPTIONS,
  BOAT_CREW,
  BOAT_TUBE,
  CRAFT_IDS,
  type Craft,
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
  SOLO_DURATIONS,
  UNTIMED,
  isUntimed,
  formatTime,
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
  type Award,
  type CrankDepthId,
  type FlyId,
  type JigWeightId,
  type LureId,
  FEEDBACK_LIMITS,
  mapCredits,
  type RecordBoard,
  type RecordMode,
  type RecordEntry,
  type TimeOfDay,
  type WeatherLevel,
  type WinRule,
} from '@lunki/shared';
import type { LobbyPlayer, LobbyView } from '../net/session';
import type { SendResult } from '../net/report';
import { LIBRARIES, creditText } from './credits';
import { fishImage } from './fishArt';
import { lureImage, type LureArtId } from './lureArt';
import { awardList, statsTable, type StatsPlayer } from './raceSummary';
import type { LifetimeStats } from '../game/lifetimeStats';
import {
  cardBlob,
  cardFileName,
  drawWeighCard,
  recordCard,
  weighCardText,
  type WeighCardInfo,
} from './weighCard';
import { LakeMapView, RACE_EVENT_STYLE, describeSpot } from './lakeMap';
import type { RaceEventKind, RaceMapData } from '../game/raceLog';
import { SPECIES_PIN_COLORS, formatDate, recordDetails, recordTitle } from './recordDetails';
import { drawCraftPreview } from './tubePreview';
import { SPECIES_VERSION, migrateSpecies } from './speciesSettings';
import { MenuNav } from './menuNav';
import { createLoader } from './loader';
import { VOLUME_LEVELS, type AudioSettings, type VolumeLevel } from '../audio/settings';
import { MUSIC_CHOICES, type MusicChoice } from '../audio/music';
import { DEFAULT_HUD_SCALE, HUD_SCALES } from './hudScale';
import { DEFAULT_POV_FOV, POV_FOVS } from './povFov';
import {
  escapeLeavesFullscreen,
  fullscreenButton,
  fullscreenSupported,
  isStandalone,
  needsHomeScreenHint,
} from './fullscreen';
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
import { controlText, withKey } from '../game/controls';
import { isMine } from '../game/raceScoreboard';
import { loadCraft, saveCraft } from '../game/tackle';
import {
  BOX_SLOTS,
  beginnerBox,
  loadTackleBox,
  saveTackleBox,
  slotOf,
  type LureSlot,
  type TackleBox,
} from '../game/tackleBox';
import {
  colorName,
  describeFullTackle,
  difficultyName,
  flyHint,
  flyLeaderName,
  flyLineHint,
  flyLineName,
  flyName,
  flyRodHint,
  flyRodName,
  methodName,
  landPenaltyName,
  lateJoinName,
  craftName,
  seatName,
  lineName,
  lureHint,
  lureName,
  penaltyName,
  rodHint,
  rodName,
  jigWeightName,
  jigWeightHint,
  crankDepthName,
  crankDepthHint,
  tackleLureName,
  lureLabel,
  speciesName,
  timeOfDayName,
  weatherLevelName,
  winRuleName,
} from '../i18n/names';

const SETTINGS_KEY = 'lunki.soloSettings';
/**
 * Tallennettujen kestojen versio: ennen aikarajatonta sessiota (#360)
 * tallennettu kesto oli vanha oletus, joten se vaihtuu kerran Vapaaksi.
 */
const DURATION_VERSION = 1;
/** Näkymät, jotka avautuvat aina alusta eivätkä muista kohdistusta. */
const NO_FOCUS_MEMORY = new Set(['pause', 'results', 'race-results', 'message']);

/** Asetusnäkymän säätimet (päävalikko ja tauko). */
type ResultsView = 'list' | 'stats' | 'map';

/** Tulossivun palkinnot ja tilastot (#367). */
export interface ResultsSummary {
  awards: Award[];
  /** Tilastot pelaajittain, oma ensin; yksinpelissä vain oma. */
  players: StatsPlayer[];
  myId: string;
  /** Kaikkien kisojen yhteistilastot laitteelta (omat). */
  life: LifetimeStats | null;
  /** Vanha palvelin ei välitä muiden tilastoja. */
  othersMissing?: boolean;
}

export interface SettingsControls {
  audio: { current: AudioSettings; onChange: (a: AudioSettings) => void };
  hudSize: {
    current: number;
    onChange: (scale: number) => void;
    /** Toteutunut koko, kun ruudulle ei mahdu valittua (null = ei tiedossa). */
    effective: () => number | null;
  };
  povFov: {
    current: number;
    onChange: (fov: number) => void;
    /** Toteutunut pysty-FOV tällä ruudulla valinnalla `fov`. */
    effective: (fov: number) => number;
  };
  /** Opastus ensimmäiseen kalaan (#370): päälle alusta tai pois. */
  guide: { current: boolean; onChange: (on: boolean) => void };
  /** Kieli vaihtui: näkymä avataan uudelleen uudella kielellä. */
  onLanguage: () => void;
}

interface ShowOptions {
  /** Näkymän siivous ennen seuraavaa. */
  cleanup?: () => void;
  /** Uudelleenpiirrossa säilytettävä vierityskohta. */
  scroll?: [number, number] | null;
  /** Esc / Backspace: paluu edelliseen näkymään. */
  back?: () => void;
  /** Kohdistus alkaa ensimmäiseltä riviltä ensisijaisen napin sijaan. */
  focusFirst?: boolean;
}

const MODE_HINTS: Record<RecordMode, MsgKey> = {
  race: 'records.raceHint',
  solo: 'records.soloHint',
};
/** Kielivalitsimen nimet kunkin kielen omalla kielellä. */
const LANG_NAMES: Record<Lang, string> = { fi: 'Suomi', en: 'English' };
/** Kalojen kuvat listoissa: kapealla näytöllä pienempinä (ks. style.css). */
const LIST_FISH_SCALE = 'var(--fish-px, 2px)';
/** Viehepakki näkymälle: tallennettu tai kisan pakki (#365). */
export interface BoxBinding {
  current: TackleBox;
  onChange: (b: TackleBox) => void;
  /** Realistisella pakkia ei täydennetä kesken kisan (menetetyt vieheet). */
  locked: boolean;
}

/** Varusteet näkymälle; `box` puuttuu = selaimeen tallennettu pakki. */
export interface TackleBinding {
  current: Tackle;
  onChange: (t: Tackle) => void;
  box?: BoxBinding;
}

/** Vieheen kuvan pikselikoko Varusteet-näkymässä. */
const LURE_HINT_SCALE = '2px';

const partName = (part: AppearancePart) => t(`part.${part}`);

/** Asetusten vaihtoehdot valintariveiksi pelaajan kielellä. */
const durationName = (d: number) =>
  d === UNTIMED ? t('settings.untimed') : t('common.minutes', { n: d });
const durationOptions = (): [string, string][] =>
  DURATIONS.map((d) => [String(d), durationName(d)]);
/** Yksinpelissä myös aikarajaton sessio. */
const soloDurationOptions = (): [string, string][] =>
  SOLO_DURATIONS.map((d) => [String(d), durationName(d)]);
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
      const saved = JSON.parse(raw) as Partial<CompetitionSettings> & {
        speciesVersion?: number;
        durationVersion?: number;
      };
      const { speciesVersion, durationVersion, ...s } = { ...defaults, ...saved };
      return {
        ...s,
        durationMinutes:
          durationVersion === DURATION_VERSION &&
          (SOLO_DURATIONS as readonly unknown[]).includes(s.durationMinutes)
            ? s.durationMinutes
            : defaults.durationMinutes,
        species: saved.species ? migrateSpecies(saved.species, speciesVersion) : defaults.species,
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
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...s,
        speciesVersion: SPECIES_VERSION,
        durationVersion: DURATION_VERSION,
      }),
    );
  } catch {
    // ei haittaa
  }
}

/** Valikot ja ruudut (aloitus, tauko, tulokset) HUD:n päällä. */
export class Screens {
  private readonly root: HTMLDivElement;
  /** Aulan uudelleenpiirto, joka odottaa varuste- tai värinäkymän sulkemista. */
  private pendingLobby: (() => void) | null = null;
  /** Näkymän siivous ennen seuraavaa (esim. kartan koon seuranta). */
  private cleanup: (() => void) | null = null;
  /** Tulossivulla valittuna saaliskartta (säilyy saman näkymän uudelleenpiirrossa). */
  /** Tulossivun valittu näkymä; uudelleenpiirto säilyttää sen. */
  private resultsView: ResultsView = 'list';
  /** Kenen tilastot tulossivulla näkyvät (moninpeli). */
  private statsPlayer: string | null = null;
  /** Näppäimistöohjaus (#237). */
  private readonly nav: MenuNav;
  /** Kohdistettu kohde näkymittäin, jotta paluu palaa samaan kohtaan. */
  private readonly focusMemory = new Map<string, number>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.hidden = true;
    parent.appendChild(this.root);
    this.nav = new MenuNav(this.root, () => this.open);
  }

  /** Uusi versio odottaa: päävalikkoon päivitysnappi (#328). */
  private update: (() => void) | null = null;

  /** Näyttää päivitysnapin päävalikossa nyt tai seuraavalla avauksella. */
  setUpdate(apply: () => void): void {
    this.update = apply;
    const start = this.root.querySelector('[data-screen="start"]');
    if (start && !start.querySelector('.update-notice'))
      start.querySelector('.subtitle')?.after(...this.updateNotice());
  }

  /** Päävalikon kertailmoitukset (palvelimen palattua listalle päässeet saaliit). */
  private startNotes: string[] = [];

  /** Näyttää ilmoitukset päävalikossa nyt tai sen seuraavalla avauksella, kerran. */
  showStartNotes(notes: string[]): void {
    if (!notes.length) return;
    this.startNotes.push(...notes);
    const start = this.root.querySelector('[data-screen="start"]');
    if (start && !this.root.hidden)
      start.querySelector('.subtitle')?.after(...this.takeStartNotes());
  }

  private takeStartNotes(): HTMLElement[] {
    return this.startNotes.splice(0).map((n) => h('p', n, 'start-note'));
  }

  private updateNotice(): HTMLElement[] {
    if (!this.update) return [];
    const b = document.createElement('button');
    b.className = 'update-notice';
    b.textContent = t('menu.update');
    b.addEventListener('click', this.update);
    return [b];
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Avoimella näkymällä on oma paluu (Esc / Backspace palaa eikä mene peliin). */
  get hasBack(): boolean {
    return this.open && this.nav.back !== null;
  }

  hide(): void {
    this.rememberFocus();
    this.nav.back = null;
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
    onSettings: () => void;
    onFeedback: () => void;
    onCredits: () => void;
    /** Kieli vaihtui: valikko piirretään uudelleen. */
    onLanguage: () => void;
  }): void {
    const panel = this.panel('start');
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
      [t('menu.settings'), actions.onSettings],
      [t('menu.feedback'), actions.onFeedback],
      [t('menu.credits'), actions.onCredits],
    ]);
    this.addFullscreen(menu);
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
      ...this.takeStartNotes(),
      ...this.updateNotice(),
      menu,
      language,
      ...this.homeScreenHint(),
      h('p', controlText('menu.controls'), 'hint'),
      h('p', t('menu.mapCredit'), 'hint credit-line'),
    );
    this.show(panel);
  }

  /** Koko Lunkinjärvi karttana: syvyydet, pohjan muodot, laiturit ja rakennukset. */
  showLakeMap(onBack: () => void): void {
    const panel = this.panel('lake-map');
    panel.classList.add('map-panel');
    const map = new LakeMapView();
    panel.append(
      h('h2', 'Lunkinjärvi'),
      map.element,
      h('p', t('lakeMap.hint'), 'hint'),
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel, { cleanup: () => map.dispose(), back: onBack });
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
    const setTackle = (next: Tackle) => {
      tackle = { ...tackle, current: next };
      tackle.onChange(next);
    };
    const setAppearance = (next: Appearance) => {
      appearance = { ...appearance, current: next };
      appearance.onChange(next);
    };
    const reopen = () =>
      this.showSoloSetup({ ...settings }, onStart, onBack, onPickStart, appearance, tackle);
    let craft = loadCraft();
    const colors = () =>
      this.colorsSummary(
        appearance.current,
        () =>
          this.showColors(
            'solo-colors',
            { current: appearance.current, onChange: setAppearance },
            reopen,
            craft,
          ),
        craft,
      );
    let current = colors();
    const panel = this.panel('solo');
    panel.append(
      h('h2', t('solo.title')),
      this.choice(
        t('settings.duration'),
        soloDurationOptions(),
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
      this.choice(
        t('settings.craft'),
        CRAFT_IDS.map((c) => [c, craftName(c)]),
        craft,
        (v) => {
          craft = v as Craft;
          saveCraft(craft);
          // Värien kuva ja valinnat kulkupelin mukaan (veneessä ei räpylöitä).
          const next = colors();
          current.replaceWith(next);
          current = next;
        },
      ),
      h('p', t('solo.craftHint'), 'hint'),
      // Varusteet ja värit omissa näkymissään; paluu säilyttää kesken olevat valinnat.
      this.tackleSummary(tackle.current, () =>
        this.showTackle(
          'solo-tackle',
          { current: tackle.current, onChange: setTackle },
          'before',
          reopen,
        ),
      ),
      current,
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
    this.show(panel, { back: onBack });
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
    const panel = this.panel('multiplayer');
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
    this.show(panel, { back: onBack });
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
    // Kiinni oleva palvelin isommalla: se on näkymän tärkein tieto.
    el.classList.toggle('hint', ok);
  }

  /** Odotus palvelimen vastausta: otsikko, latausanimaatio ja teksti. */
  showLoading(title: string, text: string, onCancel?: () => void): void {
    const panel = this.panel('message');
    panel.append(h('h2', title), createLoader(), h('p', text));
    if (onCancel) panel.append(this.buttons([[t('common.cancel'), onCancel]]));
    this.show(panel, onCancel ? { back: onCancel } : {});
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
      /** Kulkupeli: veneeseen n, omaan uuteen veneeseen (0) tai renkaaseen (BOAT_TUBE). */
      onBoat: (boat: number) => void;
      /** Paikanvaihto omassa veneessä (#357): toisen paikka. */
      onSeat: (seat: number) => void;
    },
    notice?: string,
    /** Liittää chatin paneeliin (sama elementti säilyy uudelleenpiirroissa). */
    chat?: (parent: HTMLElement) => void,
  ): void {
    // Luettava ennen paneelin rakentamista: chatin siirto vanhasta paneelista
    // lyhentää sitä, ja selain siirtää vierityskohtaa ylös chatin korkeuden verran.
    // Varusteet tai värit auki: aula piirretään vasta paluun jälkeen uusimmalla tilalla.
    const redraw = () => this.showLobby(v, link, actions, notice, chat);
    const open = (this.root.firstElementChild as HTMLElement | null)?.dataset.screen;
    if (this.open && (open === 'lobby-tackle' || open === 'lobby-colors')) {
      this.pendingLobby = redraw;
      return;
    }
    this.pendingLobby = null;
    const back = () => (this.pendingLobby ?? redraw)();
    const scroll = this.scrollOf('lobby');
    const panel = this.panel('lobby');
    const me = v.players.find((p) => p.me);
    const myCraft: Craft = (me?.boat ?? 0) > 0 ? 'boat' : 'tube';
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
    const playerRow = (p: LobbyPlayer) => {
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
      return li;
    };
    if (v.canBoat) list.append(...this.crewRows(v, playerRow, actions.onBoat, actions.onSeat));
    else for (const p of v.players) list.appendChild(playerRow(p));
    // Katsojat eivät vie kalastajapaikkoja (#274).
    const anglers = v.players.filter((p) => !p.spectator).length;
    panel.append(
      h('h2', t('lobby.title')),
      h('p', t('mp.roomCode'), 'hint'),
      code,
      copy,
      h('p', t('lobby.players', { n: anglers, max: v.maxPlayers }), 'choice-label'),
      list,
    );
    // Oma kulkupeli: rengas tai oma vene; kyytiin pääsee veneen Liity-napista.
    if (v.canBoat && me && !me.spectator) {
      panel.append(
        this.choice(
          t('settings.craft'),
          CRAFT_IDS.map((c) => [c, c === 'boat' ? t('boat.own') : craftName(c)]),
          myCraft,
          (c) => {
            if (c !== myCraft) actions.onBoat(c === 'boat' ? 0 : BOAT_TUBE);
          },
        ),
        h('p', t('settings.craftHint'), 'hint'),
      );
    }
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
        ? this.settingsEditor(v.settings, anglers, actions.onSettings, actions.onPickStart)
        : this.settingsSummary(v.settings),
      // Katsoja ei kalasta, joten varusteita ei tarvita.
      ...(me?.spectator
        ? []
        : [
            this.tackleSummary(me?.tackle ?? DEFAULT_TACKLE, () =>
              this.showTackle(
                'lobby-tackle',
                { current: me?.tackle ?? DEFAULT_TACKLE, onChange: actions.onTackle },
                'before',
                back,
              ),
            ),
          ]),
      ...(me
        ? [
            this.colorsSummary(
              me.appearance,
              () =>
                this.showColors(
                  'lobby-colors',
                  { current: me.appearance, onChange: actions.onAppearance },
                  back,
                  myCraft,
                ),
              myCraft,
            ),
          ]
        : []),
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
    this.show(panel, { scroll });
  }

  /**
   * Aulan pelaajat kulkupeleittäin (#263): jokainen vene on oma joukkueensa
   * (otsikko, miehistö paikkoineen ja Liity kyytiin), renkaalla kalastavat
   * omina riveinään. Katsojat lopussa.
   */
  private crewRows(
    v: LobbyView,
    playerRow: (p: LobbyPlayer) => HTMLElement,
    onBoat: (boat: number) => void,
    onSeat: (seat: number) => void,
  ): HTMLElement[] {
    const me = v.players.find((p) => p.me);
    // Paikanvaihto omassa veneessä (#357): pyyntö, ja toisen pyyntöön sama nappi vastaa.
    const swap = (p: LobbyPlayer, row: HTMLElement) => {
      if (!v.canSwapSeats || !me || p.me || me.boat === 0 || p.boat !== me.boat) return;
      const asked = me.seatAsk === p.seat;
      const asks = p.seatAsk === me.seat;
      const button = document.createElement('button');
      button.className = 'seat-swap';
      button.textContent = t(asked ? 'boat.swapAsked' : 'boat.swap');
      button.disabled = asked;
      button.addEventListener('click', () => onSeat(p.seat));
      const line = h('div', '', 'seat-swap-row');
      if (asks) line.append(h('span', t('boat.swapAsk'), 'player-state ok'));
      line.append(button);
      row.append(line);
    };
    const crews = new Map<number, LobbyPlayer[]>();
    for (const p of v.players)
      if (!p.spectator && p.boat > 0) crews.set(p.boat, [...(crews.get(p.boat) ?? []), p]);
    const withSeat = (p: LobbyPlayer, seat: string) => {
      const row = playerRow(p);
      row.firstElementChild?.after(h('span', seat, 'player-seat'));
      swap(p, row);
      return row;
    };
    const rows: HTMLElement[] = [];
    for (const [boat, crew] of [...crews].sort(([a], [b]) => a - b)) {
      const team = h('li', '', 'boat-crew');
      const head = h('div', '', 'boat-crew-head');
      head.append(
        h('span', t('boat.name', { n: boat })),
        h('span', t('boat.team', { n: crew.length, max: BOAT_CREW }), 'player-state'),
      );
      if (crew.length < BOAT_CREW && me && !me.spectator && me.boat !== boat) {
        const join = document.createElement('button');
        join.textContent = t('boat.join');
        join.addEventListener('click', () => onBoat(boat));
        head.append(join);
      }
      const members = document.createElement('ul');
      members.className = 'player-list';
      members.append(
        ...crew.sort((a, b) => a.seat - b.seat).map((p) => withSeat(p, seatName(p.seat))),
      );
      team.append(head, members);
      rows.push(team);
    }
    for (const p of v.players)
      if (!p.spectator && p.boat === 0) rows.push(withSeat(p, t('boat.tube')));
    rows.push(...v.players.filter((p) => p.spectator).map(playerRow));
    return rows;
  }

  /** Testaajan palaute: teksti lähetetään pelipalvelimelle. */
  showFeedback(
    name: string,
    onSend: (f: { name: string; text: string }) => Promise<SendResult>,
    onBack: () => void,
  ): void {
    const panel = this.panel('feedback');
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
      const result = await onSend({ name: nameInput.value, text: text.value });
      // Kiinni olevan palvelimen palaute jää selaimeen odottamaan.
      if (result !== 'rejected') text.value = '';
      status.textContent = t(
        result === 'sent'
          ? 'feedback.thanks'
          : result === 'offline'
            ? 'feedback.queued'
            : 'feedback.failed',
      );
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
    this.show(panel, { back: onBack });
    text.focus();
  }

  /**
   * Yhteinen asetusnäkymä päävalikosta ja tauolta: näyttö (HUDin koko,
   * näkökenttä), äänet ja kieli. Takaisin palaa sinne, mistä tultiin.
   */
  showSettings(c: SettingsControls, onBack: () => void): void {
    const panel = this.panel('settings');
    const language = this.choice(
      t('menu.language'),
      LANGS.map((l) => [l, LANG_NAMES[l]]),
      getLang(),
      (v) => {
        setLang(v as Lang);
        c.onLanguage();
      },
    );
    panel.append(
      h('h2', t('menu.settings')),
      h('h3', t('settings.display'), 'settings-section'),
      this.hudSizeSlider(c.hudSize),
      this.povFovSlider(c.povFov),
      this.choice(
        t('settings.guide'),
        [
          ['on', t('settings.guideOn')],
          ['off', t('settings.guideOff')],
        ],
        c.guide.current ? 'on' : 'off',
        (v) => c.guide.onChange(v === 'on'),
      ),
      h('h3', t('settings.sound'), 'settings-section'),
      this.audioEditor(c.audio.current, c.audio.onChange),
      h('h3', t('menu.language'), 'settings-section'),
      language,
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel, { back: onBack });
  }

  /** Omat varusteet omana näkymänään (tauko, yksinpelin valmistelu, aula). */
  private showTackle(
    screen: string,
    tackle: TackleBinding,
    mode: 'before' | 'during',
    onBack: () => void,
  ): void {
    // Viehepakin alanäkymästä palataan tähän viimeisimmin valituin varustein.
    let latest = tackle.current;
    const onChange = (next: Tackle) => {
      latest = next;
      tackle.onChange(next);
    };
    const given = tackle.box ?? {
      current: loadTackleBox(),
      onChange: saveTackleBox,
      locked: false,
    };
    const pack: BoxBinding = {
      ...given,
      onChange: (b) => {
        pack.current = b;
        given.onChange(b);
      },
    };
    const reopen = () =>
      this.showTackle(screen, { ...tackle, current: latest, box: pack }, mode, onBack);
    const panel = this.panel(screen);
    panel.append(
      h('h2', t('settings.tackle')),
      this.tackleEditor(tackle.current, onChange, mode, {
        pack,
        open: (method) => this.showBox(`${screen}-box`, method, pack, reopen),
      }),
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel, { back: onBack, focusFirst: true });
  }

  /**
   * Viehepakki tai perhorasia omana näkymänään (#365): enintään kuusi
   * lokeroa, joiden järjestys on R-kierron järjestys. Lokeron valinta
   * näyttää sen vieheen ja säädön; "Tyhjä" poistaa lokeron.
   */
  private showBox(screen: string, method: Method, pack: BoxBinding, onBack: () => void): void {
    const fly = method === 'fly';
    const panel = this.panel(screen);
    const grid = document.createElement('div');
    grid.className = 'box-grid';
    const editor = document.createElement('div');
    editor.className = 'settings';
    let selected = 0;
    const list = (): (LureSlot | FlyId)[] => (fly ? pack.current.flies : pack.current.lures);
    const update = (items: (LureSlot | FlyId)[]) => {
      pack.onChange(
        fly
          ? { ...pack.current, flies: items as FlyId[] }
          : { ...pack.current, lures: items as LureSlot[] },
      );
      render();
    };
    const slotLabel = (item: LureSlot | FlyId) =>
      typeof item === 'string' ? flyName(item) : lureLabel(item.lure, item.variant);
    const render = () => {
      const items = list();
      grid.replaceChildren(
        ...Array.from({ length: BOX_SLOTS }, (_, i) => {
          const item = items[i];
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'box-slot';
          b.classList.toggle('selected', i === selected);
          if (item !== undefined) {
            b.append(
              lureImage(typeof item === 'string' ? item : item.lure, '2px'),
              h('span', slotLabel(item), 'box-slot-name'),
            );
          } else {
            b.append(
              h('span', i === items.length ? t('box.add') : t('box.empty'), 'box-slot-name'),
            );
            b.classList.add('empty');
            // Lokerot täyttyvät järjestyksessä: tyhjän jälkeisiä ei voi valita.
            b.disabled = i > items.length || pack.locked;
          }
          b.addEventListener('click', () => {
            selected = i;
            render();
          });
          return b;
        }),
      );
      editor.replaceChildren();
      if (pack.locked) {
        editor.append(h('p', t('box.locked'), 'hint'));
        return;
      }
      const item = items[selected];
      const none: [string, string] = ['', t('box.empty')];
      if (fly) {
        editor.append(
          this.choice(
            t('tackle.fly'),
            [
              ...(item !== undefined ? [none] : []),
              ...FLY_IDS.map((id): [string, string] => [id, flyName(id)]),
            ],
            typeof item === 'string' ? item : '',
            (v) => {
              const next = [...(list() as FlyId[])];
              if (v === '') next.splice(selected, 1);
              else next[selected] = v as FlyId;
              update(next);
            },
          ),
        );
        return;
      }
      const slot = typeof item === 'object' ? item : undefined;
      const setSlot = (next: LureSlot | null) => {
        const all = [...(list() as LureSlot[])];
        if (next) all[selected] = next;
        else all.splice(selected, 1);
        update(all);
      };
      editor.append(
        this.choice(
          t('tackle.lure'),
          [...(slot ? [none] : []), ...LURE_IDS.map((id): [string, string] => [id, lureName(id)])],
          slot?.lure ?? '',
          (v) => setSlot(v === '' ? null : slotOf({ ...DEFAULT_TACKLE, lure: v as LureId })),
        ),
      );
      if (slot?.lure === 'jig')
        editor.append(
          this.choice(
            t('tackle.jigWeight'),
            JIG_WEIGHT_IDS.map((id) => [id, jigWeightName(id)]),
            slot.variant ?? DEFAULT_TACKLE.jigWeight,
            (v) => setSlot({ lure: 'jig', variant: v as JigWeightId }),
          ),
        );
      if (slot?.lure === 'wobbler')
        editor.append(
          this.choice(
            t('tackle.crankDepth'),
            CRANK_DEPTH_IDS.map((id) => {
              const name = crankDepthName(id);
              return [id, name.charAt(0).toUpperCase() + name.slice(1)];
            }),
            slot.variant ?? DEFAULT_TACKLE.crankDepth,
            (v) => setSlot({ lure: 'wobbler', variant: v as CrankDepthId }),
          ),
        );
    };
    render();
    panel.append(
      h('h2', t(fly ? 'box.flyTitle' : 'box.title')),
      h('p', controlText('box.hint'), 'hint'),
      grid,
      editor,
      this.buttons([
        ...(pack.locked
          ? []
          : ([
              [
                t('box.beginner'),
                () => {
                  const b = beginnerBox();
                  update(fly ? b.flies : b.lures);
                },
              ],
            ] as [string, () => void][])),
        [t('common.back'), onBack],
      ]),
    );
    this.show(panel, { back: onBack, focusFirst: true });
  }

  /** Viehepakin tai perhorasian yhteenvetorivi Varusteet-näkymässä. */
  private boxSummary(pack: TackleBox, method: Method, onOpen: () => void): HTMLElement {
    const fly = method === 'fly';
    const items = fly ? pack.flies : pack.lures;
    const icons = items.map((item) =>
      lureImage(typeof item === 'string' ? item : item.lure, '1px'),
    );
    return this.summaryRow(
      t(fly ? 'box.flyTitle' : 'box.title'),
      [...icons, h('span', t('box.count', { n: items.length, max: BOX_SLOTS }), 'summary-text')],
      onOpen,
    );
  }

  /** Omat värit omana näkymänään (yksinpelin valmistelu, aula). */
  private showColors(
    screen: string,
    appearance: { current: Appearance; onChange: (a: Appearance) => void },
    onBack: () => void,
    craft: Craft,
  ): void {
    const panel = this.panel(screen);
    panel.append(
      h('h2', t('settings.colors')),
      this.appearanceEditor(appearance.current, appearance.onChange, craft),
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel, { back: onBack, focusFirst: true });
  }

  /** Tiivistetty rivi: otsikko ja nappi, josta avautuu oma näkymä. */
  private summaryRow(label: string, content: (string | Node)[], onOpen: () => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'choice summary-row';
    const b = document.createElement('button');
    b.className = 'summary-button';
    b.append(...content, h('span', '›', 'summary-arrow'));
    b.addEventListener('click', onOpen);
    row.append(h('span', label, 'choice-label'), b);
    return row;
  }

  /** Varusteiden yhteenvetorivi. */
  private tackleSummary(tackle: Tackle, onOpen: () => void): HTMLElement {
    return this.summaryRow(
      t('settings.tackle'),
      [h('span', `${methodName(tackle.method)} · ${describeFullTackle(tackle)}`, 'summary-text')],
      onOpen,
    );
  }

  /** Värien yhteenvetorivi: pieni kuva renkaasta tai veneestä. */
  private colorsSummary(
    appearance: Appearance | null,
    onOpen: () => void,
    craft: Craft,
  ): HTMLElement {
    const preview = document.createElement('canvas');
    preview.className = 'tube-preview small';
    preview.width = preview.height = 40;
    preview.setAttribute('aria-hidden', 'true');
    if (appearance) drawCraftPreview(preview, appearance, craft);
    return this.summaryRow(
      t('settings.colors'),
      [preview, h('span', t('settings.changeColors'), 'summary-text')],
      onOpen,
    );
  }

  private audioEditor(initial: AudioSettings, onChange: (a: AudioSettings) => void): HTMLElement {
    const a = { ...initial };
    const box = document.createElement('div');
    box.className = 'settings';
    const row = (label: string, key: 'effects' | 'ambience' | 'music' | 'voice') =>
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
      row(t('audio.voice'), 'voice'),
      this.choice(
        t('audio.eventVoices'),
        [
          ['1', t('common.yes')],
          ['0', t('common.no')],
        ],
        a.eventVoices ? '1' : '0',
        (v) => {
          a.eventVoices = v === '1';
          onChange({ ...a });
        },
      ),
      h('p', t('audio.voiceHint'), 'hint'),
    );
    return box;
  }

  /** HUDin koko portaittaisella liukusäätimellä (HUD_SCALES). */
  private hudSizeSlider({
    current,
    onChange,
    effective,
  }: {
    current: number;
    onChange: (scale: number) => void;
    effective: () => number | null;
  }): HTMLElement {
    return this.stepSlider({
      id: 'hud-size',
      steps: HUD_SCALES,
      current,
      fallback: DEFAULT_HUD_SCALE,
      onChange,
      ends: ['A', 'A'],
      label: (scale) => {
        const pct = Math.round(scale * 100);
        // Ruudulle mahtuu vain pienempi: kerrotaan, ettei liukusäädin näytä jumittuvan.
        const fits = effective();
        return fits !== null && fits < scale - 0.01
          ? t('pause.hudSizeCapped', { pct, fits: Math.round(fits * 100) })
          : t('pause.hudSize', { pct });
      },
    });
  }

  /** Kalastajan silmin -näkymän näkökenttä (#330). */
  private povFovSlider({
    current,
    onChange,
    effective,
  }: {
    current: number;
    onChange: (fov: number) => void;
    /** Toteutunut pysty-FOV tällä ruudulla valinnalla `fov`. */
    effective: (fov: number) => number;
  }): HTMLElement {
    return this.stepSlider({
      id: 'pov-fov',
      steps: POV_FOVS,
      current,
      fallback: DEFAULT_POV_FOV,
      onChange,
      ends: ['-', '+'],
      label: (fov) => {
        // Kapea tai hyvin leveä ruutu muuttaa arvoa: näytetään toteutunut.
        const fits = Math.round(effective(fov));
        return fits !== fov ? t('pause.fovCapped', { fov, fits }) : t('pause.fov', { fov });
      },
    });
  }

  /** Portaittainen liukusäädin retrotyyliin: otsikko, päätymerkit ja portaat. */
  private stepSlider({
    id,
    steps,
    current,
    fallback,
    onChange,
    label: describe,
    ends: [smallEnd, bigEnd],
  }: {
    id: string;
    steps: readonly number[];
    current: number;
    fallback: number;
    onChange: (value: number) => void;
    label: (value: number) => string;
    ends: [string, string];
  }): HTMLElement {
    const row = document.createElement('div');
    row.className = `choice hud-size ${id}`;
    const label = h('label', '', 'choice-label') as HTMLLabelElement;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(steps.length - 1);
    slider.step = '1';
    const index = steps.indexOf(current);
    slider.value = String(index >= 0 ? index : steps.indexOf(fallback));
    slider.id = id;
    label.htmlFor = slider.id;
    const value = () => steps[Number(slider.value)] ?? fallback;
    const relabel = () => {
      label.textContent = describe(value());
      slider.setAttribute('aria-valuetext', label.textContent);
    };
    relabel();
    slider.addEventListener('input', () => {
      onChange(value());
      relabel();
    });
    const small = h('span', smallEnd, 'hud-size-end small');
    const big = h('span', bigEnd, 'hud-size-end');
    const track = document.createElement('div');
    track.className = 'hud-size-track';
    track.append(small, slider, big);
    row.append(label, track);
    return row;
  }

  /** Tekijät, kartta-aineistojen lähdemaininnat ja kirjastojen lisenssit. */
  showCredits(onBack: () => void): void {
    const panel = this.panel('credits');
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
    this.show(panel, { back: onBack });
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
    const panel = this.panel('records');
    panel.append(h('h2', t('records.title')));
    if (!raceBoard && !soloBoard) {
      panel.append(
        h('p', t('records.noServer'), 'error'),
        this.buttons([[t('common.back'), onBack]]),
      );
      this.show(panel, { back: onBack });
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
        rows.forEach((r, i) => {
          if (r.x !== undefined && r.y !== undefined) {
            placed.push(r);
            species.add(r.species);
          }
          const li = document.createElement('li');
          // Sarakkeet asettuvat listan ruudukkoon (style.css); pitkä nimi lyhenee "…"-merkillä
          // ja näkyy kokonaan Tiedoissa.
          const name = h('span', r.angler, 'record-name');
          name.title = r.angler;
          const when = h('span', '', 'record-when');
          const who = document.createElement('span');
          who.className = 'record-who';
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
              const card = (e: Event) => {
                const spot =
                  r.x !== undefined && r.y !== undefined ? describeSpot({ x: r.x, y: r.y }) : null;
                this.cardModal(recordCard(r, spot), e.currentTarget as HTMLElement);
              };
              open.append(
                this.buttons([
                  ...(r.x !== undefined
                    ? ([[t('records.showOnMap'), () => openOnMap(r)]] as const)
                    : []),
                  [t('records.showCard'), card],
                ]),
              );
              li.after(open);
            }
            info.setAttribute('aria-expanded', String(open !== null));
          };
          info.addEventListener('click', toggleInfo);
          li.addEventListener('click', toggleInfo);
          li.className = 'record-row';
          when.append(h('span', formatDate(r.date), 'record-date'), info);
          who.append(name, when);
          li.append(
            h('span', `${i + 1}.`, 'record-rank'),
            h('span', formatWeight(r.weight), 'record-weight'),
            who,
            fishImage(r.species, r.weight, LIST_FISH_SCALE),
          );
          ol.appendChild(li);
        });
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
    this.show(panel, { cleanup: () => map.dispose(), back: onBack, focusFirst: true });
  }

  /** Taukovalikko: lyhyt nappilista, varusteet ja asetukset omina näkyminään. */
  showPause(p: {
    onResume: () => void;
    onQuit: () => void;
    multiplayer: boolean;
    /** Aikarajaton yksinpelin sessio: lopetus punnitsee saaliin (#360). */
    untimed?: boolean;
    /** Pelikellon aika järvellä, esim. 05:12. */
    clock?: string;
    /** Varusteet-näkymä; puuttuu katsojalta, joka ei kalasta. */
    onTackle?: () => void;
    onSettings: () => void;
    /** Paluu alinäkymästä: kohdistus sen napille Jatka-napin sijaan. */
    from?: 'tackle' | 'settings';
  }): void {
    const panel = this.panel('pause');
    const menu = this.buttons([
      [t('pause.resume'), p.onResume],
      ...(p.onTackle ? ([[t('pause.tackle'), p.onTackle]] as [string, () => void][]) : []),
      [t('menu.settings'), p.onSettings],
      [
        p.multiplayer
          ? t('pause.leaveRace')
          : p.untimed
            ? t('pause.endSession')
            : t('pause.endRace'),
        p.onQuit,
      ],
    ]);
    // Koko näyttö ennen kisan lopetusta, joka pysyy viimeisenä.
    this.addFullscreen(menu, menu.lastElementChild);
    menu.classList.add('main-menu', 'pause-menu');
    panel.classList.add('pause-panel');
    panel.append(
      h('h2', p.multiplayer ? t('pause.menu') : t('pause.title')),
      ...(p.clock ? [h('p', t('pause.clock', { time: p.clock }))] : []),
      ...(p.multiplayer ? [h('p', t('pause.continues'), 'hint')] : []),
      menu,
      ...this.homeScreenHint(),
      // Firefox ja Safari eivät anna Escin jäädä peliin koko näytöllä.
      ...(escapeLeavesFullscreen() ? [h('p', t('fullscreen.escHint'), 'hint')] : []),
    );
    this.show(panel);
    if (p.from) {
      const label = t(p.from === 'tackle' ? 'pause.tackle' : 'menu.settings');
      [...menu.querySelectorAll('button')].find((b) => b.textContent === label)?.focus();
    }
  }

  /** Tauon Varusteet-näkymä; paluu taukoon. Kisan viehepakki tulee pelistä. */
  showPauseTackle(tackle: TackleBinding, onBack: () => void): void {
    this.showTackle('pause-tackle', tackle, 'during', onBack);
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
    summary?: ResultsSummary | null,
  ): void {
    // Uudelleenpiirto (esim. isäntä vaihtui) säilyttää valitun näkymän.
    if (this.scrollOf('race-results') === null) {
      this.resultsView = 'list';
      this.statsPlayer = null;
    }
    const panel = this.panel('race-results');
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
      li.classList.toggle('me', isMine(r, myId));
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
      // Venekunta: joukkueen kalastajat veneen nimen alle.
      if (r.members?.length)
        li.append(h('span', r.members.map((m) => m.name).join(', '), 'player-gear'));
      table.appendChild(li);
    }
    const map = race ? this.raceMap(race) : null;
    panel.append(
      ...this.resultsViews(panel, table, map, summary),
      h(
        'p',
        `${winRuleName(settings.winRule)} · ${difficultyName(settings.difficulty)} · ${t('common.minutes', { n: settings.durationMinutes })}`,
        'hint',
      ),
    );
    if (card) panel.append(this.weighCard(card));
    if (chat) chat(panel);
    // Vihje ennen nappeja: viimeisenä olevat napit pysyvät näkyvissä (#278).
    if (!amHost) panel.append(h('p', t('results.hostRestarts'), 'hint'));
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
    this.show(panel, { cleanup: map?.dispose });
  }

  showResults(
    c: CompetitionState,
    onAgain: () => void,
    onMenu: () => void,
    card?: WeighCardInfo | null,
    race?: RaceMapData | null,
    recordNotes: readonly string[] = [],
    summary?: ResultsSummary | null,
  ): void {
    this.resultsView = 'list';
    this.statsPlayer = null;
    const panel = this.panel('results');
    const sum = summarize(c.catches, c.settings.winRule);
    const map = race ? this.raceMap(race) : null;
    const untimed = isUntimed(c.settings);
    panel.append(
      h(
        'h2',
        untimed
          ? t('results.sessionOver')
          : c.elapsed >= c.settings.durationMinutes * 60
            ? t('results.timeUp')
            : t('results.ended'),
      ),
    );
    if (sum.count === 0) {
      panel.append(h('p', t('results.empty')));
      // Reitistä ja tilastoista näkee silti, missä tuli käytyä ja mitä sattui.
      panel.append(...this.resultsViews(panel, h('div', ''), map, summary));
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
        ...this.resultsViews(panel, list, map, summary),
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
        `${difficultyName(c.settings.difficulty)} · ${
          untimed
            ? t('results.sessionLength', { time: formatTime(Math.floor(c.elapsed)) })
            : t('common.minutes', { n: c.settings.durationMinutes })
        }`,
        'hint',
      ),
      this.buttons([
        [t('results.again'), onAgain],
        [t('results.toMenu'), onMenu],
      ]),
    );
    this.show(panel, { cleanup: map?.dispose, back: onMenu });
  }

  /**
   * Tulosten näkymävalinta (#367): taulukko palkintoineen, tilastot ja
   * saaliskartta. Palauttaa paneeliin lisättävät osat; ilman karttaa ja
   * tilastoja pelkän taulukon.
   */
  private resultsViews(
    panel: HTMLElement,
    table: HTMLElement,
    map: { element: HTMLElement } | null,
    summary?: ResultsSummary | null,
  ): HTMLElement[] {
    const list = document.createElement('div');
    list.append(table);
    if (summary) {
      list.append(
        h('h3', t('results.awards'), 'awards-title'),
        awardList(summary.awards, { myId: summary.myId, solo: summary.players.length <= 1 }),
      );
    }
    const views: [ResultsView, string, HTMLElement][] = [['list', t('results.table'), list]];
    if (summary) views.push(['stats', t('results.stats'), this.statsView(summary)]);
    if (map) views.push(['map', t('results.catchMap'), map.element]);
    if (views.length === 1) return [list];
    if (!views.some(([v]) => v === this.resultsView)) this.resultsView = 'list';
    const content = document.createElement('div');
    const setView = (view: ResultsView) => {
      this.resultsView = view;
      panel.classList.toggle('map-panel', view === 'map');
      content.replaceChildren(views.find(([v]) => v === view)![2]);
    };
    setView(this.resultsView);
    const toggle = this.choice(
      t('common.view'),
      views.map(([v, label]) => [v, label]),
      this.resultsView,
      (v) => setView(v as ResultsView),
    );
    return [toggle, content];
  }

  /** Tilastot: moninpelissä valitaan pelaaja, omissa myös kaikki kisat yhteensä. */
  private statsView(summary: ResultsSummary): HTMLElement {
    const box = document.createElement('div');
    const players = summary.players;
    const selected = players.find((p) => p.id === this.statsPlayer) ?? players[0];
    if (!selected) return box;
    const table = document.createElement('div');
    const show = (id: string) => {
      this.statsPlayer = id;
      const p = players.find((x) => x.id === id) ?? selected;
      table.replaceChildren(statsTable(p, p.id === summary.myId ? summary.life : null));
    };
    if (players.length > 1)
      box.append(
        this.choice(
          t('results.statsOf'),
          players.map((p) => [p.id, p.id === summary.myId ? t('common.youCapital') : p.name]),
          selected.id,
          show,
        ),
      );
    if (summary.othersMissing) box.append(h('p', t('results.statsOldServer'), 'hint'));
    box.append(table);
    show(selected.id);
    return box;
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

  /**
   * Punnituskortti ennätyslistan päällä (#238). Esc, Takaisin tai klikkaus
   * kortin ohi sulkee sen, ja kohdistus palaa avanneeseen nappiin.
   */
  private cardModal(info: WeighCardInfo, opener: HTMLElement): void {
    const overlay = document.createElement('div');
    overlay.className = 'screen-modal';
    const box = document.createElement('div');
    box.className = 'screen-panel modal-panel';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const back = this.nav.back;
    const close = () => {
      overlay.remove();
      this.nav.back = back;
      opener.focus({ preventScroll: true });
    };
    const buttons = this.buttons([[t('common.back'), close]]);
    const backButton = buttons.querySelector('button')!;
    // Jaa on kortin ensisijainen toiminto; Takaisin tavallisena.
    backButton.classList.remove('primary');
    box.append(this.weighCard(info, t('card.recordLabel')), buttons);
    overlay.append(box);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    this.nav.back = close;
    this.root.append(overlay);
    backButton.focus({ preventScroll: true });
  }

  /** Punnituskortti: tallennus kuvana ja jakaminen. */
  private weighCard(info: WeighCardInfo, label = t('card.label')): HTMLElement {
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
      h('p', label, 'choice-label'),
      canvas,
      this.buttons([
        [t('card.share'), () => void share()],
        [t('card.save'), () => void save()],
      ]),
      status,
    );
    return box;
  }

  /** Uusi paneeli; `screen` nimeää näkymän (uudelleenpiirto, kohdistuksen muisti). */
  private panel(screen: string): HTMLDivElement {
    const p = document.createElement('div');
    p.className = 'screen-panel';
    p.dataset.screen = screen;
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

  /** Kohdistetun kohteen järjestysnumero näkymän muistiin; -1 = ei kohdistusta. */
  private rememberFocus(): number {
    const prev = this.root.firstElementChild as HTMLElement | null;
    const screen = prev?.dataset.screen;
    if (!screen || this.root.hidden) return -1;
    const index = this.nav.currentIndex();
    if (index >= 0 && !NO_FOCUS_MEMORY.has(screen)) this.focusMemory.set(screen, index);
    return index;
  }

  private show(panel: HTMLElement, { cleanup, scroll, back, focusFirst }: ShowOptions = {}): void {
    // Saman näkymän uudelleenpiirto (aula, tulokset) ei toista avausanimaatiota,
    // muuten paneeli välähtäisi jokaisella tilamuutoksella.
    const prev = this.root.firstElementChild as HTMLElement | null;
    const redraw =
      !this.root.hidden && !!panel.dataset.screen && prev?.dataset.screen === panel.dataset.screen;
    const focused = this.rememberFocus();
    this.runCleanup();
    this.cleanup = cleanup ?? null;
    this.nav.back = back ?? null;
    if (!redraw) panel.classList.add('enter');
    this.root.replaceChildren(panel);
    this.root.hidden = false;
    // Saman näkymän uudelleenpiirto (aula) säilyttää vierityksen.
    if (scroll) [panel.scrollTop, this.root.scrollTop] = scroll;
    // Uudelleenpiirto pitää kohdistuksen paikallaan, ja näkymään palatessa
    // jatketaan siitä, mihin jäätiin.
    const index = redraw ? focused : (this.focusMemory.get(panel.dataset.screen!) ?? -1);
    if (index >= 0 && this.nav.focusIndex(index, redraw)) return;
    if (scroll) return;
    // Kohdistus ei saa vierittää pitkää näkymää alas.
    const first = focusFirst
      ? this.nav.items()[0]
      : panel.querySelector<HTMLButtonElement>('button.primary');
    first?.focus({ preventScroll: true });
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
   * Varusteet: kalastustapa (virveli tai perho) ja sen välineet. Ennen kisaa
   * valitaan vavat (viehe tai perho vaihdetaan kisan aikana), kisan aikana
   * viehe tai perho (vavat pysyvät samoina). Tavan voi vaihtaa milloin vain.
   */
  private tackleEditor(
    initial: Tackle,
    onChange: (t: Tackle) => void,
    mode: 'before' | 'during',
    pack: { pack: BoxBinding; open: (method: Method) => void },
  ): HTMLElement {
    const tk = { ...initial };
    const box = document.createElement('div');
    box.className = 'settings';
    box.dataset.tackle = mode;
    const rebuild = (next: Tackle) => {
      onChange(next);
      box.replaceWith(this.tackleEditor(next, onChange, mode, pack));
    };
    box.append(
      this.choice(
        t('tackle.method'),
        (Object.keys(METHODS) as Method[]).map((id) => [id, methodName(id)]),
        tk.method,
        (v) => rebuild({ ...tk, method: v as Method }),
      ),
    );
    const fly = tk.method === 'fly';
    // Viehepakki tai perhorasia (#365): mitkä vieheet R kiertää.
    box.append(this.boxSummary(pack.pack.current, tk.method, () => pack.open(tk.method)));
    // Vihjeet päivittyvät valinnan mukana.
    const hints: [HTMLElement, () => string][] = [];
    const hint = (text: () => string) => {
      const p = h('p', text(), 'hint');
      p.hidden = p.textContent === '';
      hints.push([p, text]);
      return p;
    };
    // Valitun vieheen tai perhon kuva vihjeen vieressä (#362).
    const arts: [HTMLElement, () => LureArtId][] = [];
    const lureHintRow = (id: () => LureArtId, text: () => string) => {
      const row = document.createElement('div');
      row.className = 'lure-hint';
      row.append(lureImage(id(), LURE_HINT_SCALE), hint(text));
      arts.push([row, id]);
      return row;
    };
    const set = (patch: Partial<Tackle>) => {
      Object.assign(tk, patch);
      for (const [p, text] of hints) {
        p.textContent = text();
        p.hidden = p.textContent === '';
      }
      for (const [row, id] of arts)
        row.firstElementChild!.replaceWith(lureImage(id(), LURE_HINT_SCALE));
      onChange({ ...tk });
    };
    if (fly) {
      if (mode === 'before')
        box.append(
          this.choice(
            t('tackle.flyRod'),
            FLY_ROD_IDS.map((id) => [id, flyRodName(id)]),
            tk.flyRod,
            (v) => set({ flyRod: v as Tackle['flyRod'] }),
          ),
          hint(() => flyRodHint(tk.flyRod)),
        );
      else
        box.append(
          this.choice(
            withKey('tackle.fly', 'lure'),
            FLY_IDS.map((id) => [id, flyName(id)]),
            tk.fly,
            (v) => set({ fly: v as Tackle['fly'] }),
          ),
          lureHintRow(
            () => tk.fly,
            () => flyHint(tk.fly),
          ),
        );
      box.append(
        this.choice(
          t('tackle.flyLine'),
          FLY_LINE_IDS.map((id) => [id, flyLineName(id)]),
          tk.flyLine,
          (v) => set({ flyLine: v as Tackle['flyLine'] }),
        ),
        hint(() => flyLineHint(tk.flyLine)),
        this.choice(
          t('tackle.flyLeader'),
          FLY_LEADER_IDS.map((id) => [
            id,
            t('tackle.flyLeaderOption', {
              name: flyLeaderName(id),
              kg: shortDecimal(FLY_LEADERS[id].strength),
            }),
          ]),
          tk.flyLeader,
          (v) => set({ flyLeader: v as Tackle['flyLeader'] }),
        ),
        h('p', controlText('tackle.flyHint'), 'hint'),
      );
    } else {
      const castWeight = () => {
        const [min, max] = RODS[tk.rod].castWeight;
        return t('rod.castWeight', { min, max });
      };
      // Jigin paino ja vaapun syvyys (#363): ennen kisaa molemmat, kisan aikana käytössä olevan.
      const jigWeight = () => [
        this.choice(
          t('tackle.jigWeight'),
          JIG_WEIGHT_IDS.map((id) => [id, jigWeightName(id)]),
          tk.jigWeight,
          (v) => set({ jigWeight: v as Tackle['jigWeight'] }),
        ),
        hint(() => jigWeightHint(tk.jigWeight)),
      ];
      const crankDepth = () => [
        this.choice(
          t('tackle.crankDepth'),
          // Valinnan nimi isolla alkukirjaimella; vieheen nimessä pienellä ("Vaappu syvä").
          CRANK_DEPTH_IDS.map((id) => {
            const name = crankDepthName(id);
            return [id, name.charAt(0).toUpperCase() + name.slice(1)];
          }),
          tk.crankDepth,
          (v) => set({ crankDepth: v as Tackle['crankDepth'] }),
        ),
        hint(() => crankDepthHint(tk.crankDepth)),
      ];
      if (mode === 'before')
        box.append(
          this.choice(
            t('tackle.rod'),
            ROD_IDS.map((id) => [id, rodName(id)]),
            tk.rod,
            (v) => set({ rod: v as Tackle['rod'] }),
          ),
          hint(() => `${rodHint(tk.rod)}. ${castWeight()}.`),
          ...jigWeight(),
          ...crankDepth(),
        );
      else
        box.append(
          this.choice(
            withKey('tackle.lure', 'lure'),
            LURE_IDS.map((id) => [id, lureName(id)]),
            tk.lure,
            (v) => rebuild({ ...tk, lure: v as Tackle['lure'] }),
          ),
          lureHintRow(
            () => tk.lure,
            () => lureHint(tk.lure),
          ),
          ...(tk.lure === 'jig' ? jigWeight() : tk.lure === 'wobbler' ? crankDepth() : []),
          // Vavan heittopaino (#363): varoitus, jos viehe ei sovi vapaan.
          hint(() => {
            if (fitsCastWeight(tk)) return '';
            const [min, max] = RODS[tk.rod].castWeight;
            const g = lureTuning(tk).grams;
            return t('tackle.castWeightOff', { lure: tackleLureName(tk), g, min, max });
          }),
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
    }
    if (mode === 'during') {
      const rod = fly ? flyRodName(tk.flyRod) : rodName(tk.rod);
      box.append(
        h('p', t('tackle.rodLocked', { rod }), 'hint'),
        h('p', t('tackle.methodInRace'), 'hint'),
      );
      return box;
    }
    box.append(h('p', controlText('tackle.lureInRace'), 'hint'));
    // Viehettä ja perhoa ei valita ennen kisaa, joten ne säilyvät ennallaan.
    const reset: Tackle = fly
      ? {
          ...tk,
          flyRod: DEFAULT_TACKLE.flyRod,
          flyLine: DEFAULT_TACKLE.flyLine,
          flyLeader: DEFAULT_TACKLE.flyLeader,
        }
      : {
          ...tk,
          rod: DEFAULT_TACKLE.rod,
          jigWeight: DEFAULT_TACKLE.jigWeight,
          crankDepth: DEFAULT_TACKLE.crankDepth,
          line: DEFAULT_TACKLE.line,
          leader: DEFAULT_TACKLE.leader,
        };
    const beginner = document.createElement('button');
    beginner.textContent = t('tackle.beginner');
    beginner.title = describeFullTackle(reset);
    beginner.addEventListener('click', () => rebuild({ ...reset }));
    box.append(beginner);
    return box;
  }

  /**
   * Värit: rengas, räpylät, paita ja siima. Veneellä renkaan väri on veneen
   * ulkokuori ja reunalista, eikä räpylöitä ole. Esikatselu päivittyy heti.
   */
  private appearanceEditor(
    initial: Appearance | null,
    onChange: (a: Appearance) => void,
    craft: Craft,
  ): HTMLElement {
    const box = document.createElement('div');
    box.className = 'settings appearance';
    if (!initial) return box;
    const a = { ...initial };
    const preview = document.createElement('canvas');
    preview.className = 'tube-preview';
    preview.width = preview.height = 40;
    preview.setAttribute('aria-label', t('appearance.preview'));
    drawCraftPreview(preview, a, craft);
    const rows = document.createElement('div');
    rows.className = 'appearance-rows';
    const label = (part: AppearancePart) =>
      craft === 'boat' && part === 'tube' ? t('part.boat') : partName(part);
    for (const part of APPEARANCE_PARTS) {
      if (craft === 'boat' && part === 'fins') continue;
      const row = document.createElement('div');
      row.className = 'choice';
      row.append(h('span', label(part), 'choice-label'));
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
        b.setAttribute('aria-label', `${label(part)}: ${color}`);
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
          drawCraftPreview(preview, a, craft);
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
    // Monivalinta: nuolet vain kohdistavat, Enter valitsee.
    group.dataset.nav = 'focus';
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
    // Kartalta valinta avaa uuden näkymän, joten nuolet vain kohdistavat.
    group.dataset.nav = 'focus';
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
    const panel = this.panel('start-picker');
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
    this.show(panel, { cleanup: () => map.dispose(), back: onCancel });
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

  /** Koko näytön nappi rivin loppuun, jos selain sen osaa eikä peli jo ole sovelluksena. */
  private addFullscreen(row: HTMLElement, before: Element | null = null): HTMLElement {
    if (fullscreenSupported() && !isStandalone()) {
      const b = fullscreenButton();
      row.insertBefore(b, before);
      // Porrastettu sisääntulo järjestyksessä.
      [...row.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));
    }
    return row;
  }

  /** iPhonella koko näyttö onnistuu vain Koti-valikon kuvakkeesta. */
  private homeScreenHint(): HTMLElement[] {
    return needsHomeScreenHint() ? [h('p', t('fullscreen.homeScreenHint'), 'hint')] : [];
  }

  private buttons(list: (readonly [string, (e: Event) => void])[]): HTMLElement {
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
