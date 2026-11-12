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
  isFly,
  type Method,
  NAME_MAX_LENGTH,
  LAND_PENALTIES,
  LATE_JOIN_OPTIONS,
  BOT_FILL_OPTIONS,
  BOT_LEVEL_OPTIONS,
  isBotLevel,
  type BotLevel,
  BOAT_CREW,
  BOAT_TUBE,
  CRAFT_IDS,
  type Craft,
  PENALTY_IDS,
  isPenalty,
  type Penalty,
  PLAYER_COUNTS,
  SPECIES_OPTIONS,
  SEASON_IDS,
  SEASONS,
  TIME_OF_DAY_IDS,
  WEATHER_LEVEL_IDS,
  WIN_RULE_NAMES,
  formatRoomCode,
  DURATIONS,
  SOLO_DURATIONS,
  UNTIMED,
  isUntimed,
  formatTime,
  isPlayableSeason,
  isTimeOfDay,
  seasonOf,
  DEFAULT_SETTINGS,
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
  type Season,
  type TimeOfDay,
  type WeatherLevel,
  type WinRule,
} from '@lunki/shared';
import type { LobbyPlayer, LobbyView, OldVersionView } from '../net/session';
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
import { MenuNav, type NavAction } from './menuNav';
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
import { controlText } from '../game/controls';
import { copyText } from './clipboard';
import { MANUAL_SECTIONS, manualTopics, type ManualSection } from './manual';
import { isMine, rankLabel } from '../game/raceScoreboard';
import type { RaceStatus } from '../game/raceStatus';
import { challengeOutcome, challengeScoreText } from '../game/challenge';
import { loadCraft, saveCraft } from '../game/tackle';
import {
  BOX_SLOTS,
  beginnerBox,
  loadTackleBox,
  saveTackleBox,
  slotOf,
  withSlot,
  type LureSlot,
  type TackleBox,
} from '../game/tackleBox';
import { baitSummary, loadJournal, type BaitSummary } from '../game/journal';
import { SOLO_BOT_COUNTS, isSoloBotCount } from '../game/soloBots';
import { COMPACT_RESULTS_OVER, resultRowName, resultsText, rulesLine } from './resultsText';
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
  botFillName,
  botLevelName,
  botSkillName,
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
  seasonName,
  timeOfDayName,
  weatherLevelName,
  weightWithLength,
  lengthText,
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

/** Yksinpelin uusinta ja haaste tulossivulle (#413). */
export interface SoloReplay {
  /** Aloittaa saman kisan uudelleen samalla siemenellä. */
  onSame: () => void;
  /** Haastelinkki tämän kisan tuloksella. */
  link: string;
  /** Kisa oli haaste: haastajan nimi ja tulos vertailuun. */
  challenge: { name: string; score: number; elapsed: number } | null;
}

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
/** Viehepakki näkymälle: selaimeen tallennettu pakki (#365). */
interface BoxBinding {
  current: TackleBox;
  onChange: (b: TackleBox) => void;
}

/** Varusteet näkymälle. */
export interface TackleBinding {
  current: Tackle;
  onChange: (t: Tackle) => void;
}

/** Taukovalikon alanäkymät: paluu kohdistaa sen napin. */
export type PauseView = 'tackle' | 'settings' | 'manual' | 'feedback';
const PAUSE_VIEW_LABELS: Record<PauseView, MsgKey> = {
  tackle: 'menu.tackle',
  settings: 'menu.settings',
  manual: 'menu.manual',
  feedback: 'menu.feedback',
};

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
/** Talvi näkyy, mutta ei ole valittavissa ennen pilkkikautta (#427, #140). */
const seasonOptions = (): [string, string, boolean][] =>
  SEASON_IDS.map((v) => [v, seasonName(v), !SEASONS[v].available]);
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
        season: isPlayableSeason(s.season) ? s.season : defaults.season,
        lightningPenalty: isPenalty(s.lightningPenalty)
          ? s.lightningPenalty
          : defaults.lightningPenalty,
        capsizePenalty: isPenalty(s.capsizePenalty) ? s.capsizePenalty : defaults.capsizePenalty,
        landPenalty: (LAND_PENALTIES as readonly unknown[]).includes(s.landPenalty)
          ? s.landPenalty
          : defaults.landPenalty,
        start: isPoint(s.start) ? { x: s.start.x, y: s.start.y } : null,
        inflate: s.inflate === true,
        soloBots: isSoloBotCount(s.soloBots) ? s.soloBots : 0,
        botLevel: isBotLevel(s.botLevel) ? s.botLevel : 'mixed',
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
/** Aulan tapahtuma isännälle (#516): teksti ja korostettavat pelaajat. */
export interface LobbyEvent {
  text: string;
  ids: readonly string[];
}

export class Screens {
  private readonly root: HTMLDivElement;
  /** Aulan uudelleenpiirto, joka odottaa värinäkymän sulkemista. */
  private pendingLobby: (() => void) | null = null;
  /** Värinäkymästä palataan: aula piirretään, vaikka näkymä on vielä auki. */
  private leavingLobbySub = false;
  /** Aulan kutsulinkki, joka on jo näytetty napissa (LAN): säilyy uudelleenpiirroissa. */
  private lobbyLinkShown: string | null = null;
  /** Näkymän siivous ennen seuraavaa (esim. kartan koon seuranta). */
  private cleanup: (() => void) | null = null;
  /** Tulossivulla valittuna saaliskartta (säilyy saman näkymän uudelleenpiirrossa). */
  /** Tulossivun valittu näkymä; uudelleenpiirto säilyttää sen. */
  private resultsView: ResultsView = 'list';
  /** Kenen tilastot tulossivulla näkyvät (moninpeli). */
  private statsPlayer: string | null = null;
  /** Ohjeiden viimeksi luettu osio. */
  private manualSection: ManualSection = 'start';
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

  /** Peliohjaimen valikkotoiminto (ristiohjain, A/✕, B/○). */
  padNav(action: NavAction): void {
    this.nav.pad(action);
  }

  /**
   * Peliohjaimen oikea tatti vierittää avointa näkymää: kohdistetun kohdan
   * vierivää aluetta, tai näkymän ensimmäistä vierivää aluetta.
   */
  padScroll(dy: number): void {
    if (!this.open) return;
    const scrolls = (e: Element) =>
      e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY);
    let target: Element | null = null;
    for (let e = document.activeElement; e && this.root.contains(e); e = e.parentElement)
      if (scrolls(e)) {
        target = e;
        break;
      }
    target ??= [this.root, ...this.root.querySelectorAll('*')].find(scrolls) ?? null;
    target?.scrollBy(0, dy);
  }

  hide(): void {
    this.rememberFocus();
    this.nav.back = null;
    this.runCleanup();
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  /**
   * Päävalikko: näkymät allekkain. Pelimuodot ovat Pelaa-napin takana, ja
   * palaute ja tekijät Tietoa ja palaute -napin takana; koko näyttö on
   * kuvake nurkassa.
   */
  showStart(actions: {
    /** Edellinen moninpelihuone, johon voi palata. */
    rejoin?: { code: string; run: () => void };
    /** Pelimuodot: yksinpeli ja moninpeli. */
    onPlay: () => void;
    /** Varusteet "kotona" ennen kalaan lähtöä (#383). */
    onTackle: () => void;
    onLakeMap: () => void;
    onRecords: () => void;
    /** Ohjeet: kalastuksen mekaniikat ja ohjaus (#401). */
    onManual: () => void;
    onSettings: () => void;
    /** Palaute sekä tekijät ja lähteet. */
    onAbout: () => void;
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
      [t('menu.play'), actions.onPlay],
      [t('menu.tackle'), actions.onTackle],
      [t('menu.lakeMap'), actions.onLakeMap],
      [t('menu.records'), actions.onRecords],
      [t('menu.manual'), actions.onManual],
      [t('menu.settings'), actions.onSettings],
      [t('menu.about'), actions.onAbout],
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
      ...this.takeStartNotes(),
      ...this.updateNotice(),
      menu,
      language,
      ...this.homeScreenHint(),
      h('p', t('menu.mapCredit'), 'hint credit-line'),
      ...this.fullscreenCorner(),
    );
    this.show(panel);
  }

  /**
   * Pelimuodot päävalikon Pelaa-napin takana. Nimimerkki valitsee profiilin,
   * johon omat tiedot tallentuvat (#415); se tallennetaan ennen pelimuotoa.
   */
  showPlay(
    actions: { onSolo: () => void; onMultiplayer: () => void },
    name: { current: string; onChange: (name: string) => void },
    onBack: () => void,
  ): void {
    const panel = this.panel('play');
    const nameInput = this.input(
      t('common.nickname'),
      name.current,
      NAME_MAX_LENGTH,
      t('common.angler'),
    );
    const field = nameInput.querySelector('input')!;
    const save = () => name.onChange(field.value);
    field.addEventListener('change', save);
    const menu = this.buttons([
      [t('menu.solo'), () => (save(), actions.onSolo())],
      [t('menu.multiplayer'), () => (save(), actions.onMultiplayer())],
      [t('common.back'), () => (save(), onBack())],
    ]);
    menu.classList.add('main-menu');
    panel.append(h('h2', t('menu.play')), nameInput, h('p', t('menu.profileHint'), 'hint'), menu);
    this.show(panel, { back: () => (save(), onBack()) });
  }

  /** Palaute sekä tekijät ja lähteet yhden päävalikon napin takana. */
  showAbout(actions: { onFeedback: () => void; onCredits: () => void }, onBack: () => void): void {
    const panel = this.panel('about');
    const menu = this.buttons([
      [t('menu.feedback'), actions.onFeedback],
      [t('menu.credits'), actions.onCredits],
      [t('common.back'), onBack],
    ]);
    menu.classList.add('main-menu');
    panel.append(h('h2', t('menu.about')), menu);
    this.show(panel, { back: onBack });
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
    /** Varusteet näkyvät yhteenvetona; ne vaihdetaan päävalikossa (#383). */
    tackle: Tackle,
  ): void {
    const settings = { ...initial };
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
      ...this.launchChoice(!!settings.inflate, (inflate) => (settings.inflate = inflate)),
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
        t('settings.season'),
        seasonOptions(),
        seasonOf(settings),
        (v) => (settings.season = v as Season),
      ),
      this.choice(
        t('settings.timeOfDay'),
        timeOfDayOptions(),
        settings.timeOfDay ?? 'day',
        (v) => (settings.timeOfDay = v as TimeOfDay),
      ),
      h('p', t('settings.seasonHint'), 'hint'),
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
      // Botit (#624): taito näkyy vain, kun botteja on.
      this.choice(
        t('settings.soloBots'),
        SOLO_BOT_COUNTS.map((n) => [String(n), n === 0 ? t('settings.soloBotsNone') : String(n)]),
        String(settings.soloBots ?? 0),
        (v) => {
          settings.soloBots = Number(v);
          reopen();
        },
      ),
      ...(settings.soloBots
        ? [
            this.choice(
              t('settings.botLevel'),
              BOT_LEVEL_OPTIONS.map((o) => [o.value, botLevelName(o.value)]),
              settings.botLevel ?? 'mixed',
              (v) => (settings.botLevel = v as BotLevel),
            ),
          ]
        : []),
      h('p', t('settings.soloBotsHint'), 'hint'),
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
      // Värit omassa näkymässään; paluu säilyttää kesken olevat valinnat.
      // Varusteet laitetaan kuntoon päävalikossa (#383).
      this.tackleNote(tackle),
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
    /** Iso näyttö (#564): huone avataan katsojan lähetysnäkymänä. */
    onBroadcast?: (code: string) => void,
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
    if (onBroadcast) {
      // Pieni nappi vihjeen alla: tarvitaan vain telkkarin tai videotykin koneella.
      const b = h('button', t('mp.broadcast'), 'quiet');
      b.title = t('mp.broadcastHint');
      b.addEventListener('click', () => onBroadcast(codeValue()));
      panel.append(b);
    }
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
  /**
   * Päivittää aulan rivien yhteysmerkit paikallaan (#575). Viive muuttuu
   * parin sekunnin välein: koko aulan uudelleenpiirto veisi napin painalluksen
   * kesken ja tyhjentäisi ilmoitukset.
   */
  updateLobbyPings(players: readonly LobbyPlayer[]): void {
    for (const p of players) {
      const row = [
        ...this.root.querySelectorAll<HTMLElement>('.player-list li[data-session]'),
      ].find((li) => li.dataset.session === p.sessionId);
      const state = row?.querySelector(':scope > .player-state');
      if (!state) continue;
      state.querySelector('.player-ping')?.remove();
      if (p.connected && p.ping !== undefined) state.prepend(pingBars(p.ping));
    }
  }

  showLobby(
    v: LobbyView,
    link: string,
    actions: {
      onReady: (ready: boolean) => void;
      /** Isännän Aloita; `force` = Aloita silti, kun kaikki eivät ole valmiina (#539). */
      onStart: (force: boolean) => void;
      /** Isäntä perui Aloita silti -kysymyksen. */
      onWait: () => void;
      /** Seuraava kisa katsojana (true) tai kalastajana. */
      onSpectate: (on: boolean) => void;
      onLeave: () => void;
      onSettings: (patch: Partial<RoomSettings>) => void;
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
    /** Isännälle: kuka juuri liittyi tai on valmis (#516); rivit korostetaan. */
    event?: LobbyEvent | null,
    /** Isäntä painoi Aloita, vaikka kaikki eivät ole valmiina (#539). */
    confirmStart = false,
  ): void {
    // Luettava ennen paneelin rakentamista: chatin siirto vanhasta paneelista
    // lyhentää sitä, ja selain siirtää vierityskohtaa ylös chatin korkeuden verran.
    // Värit auki: aula piirretään vasta paluun jälkeen uusimmalla tilalla.
    const redraw = () => this.showLobby(v, link, actions, notice, chat, event, confirmStart);
    const open = (this.root.firstElementChild as HTMLElement | null)?.dataset.screen;
    if (this.open && open === 'lobby-colors' && !this.leavingLobbySub) {
      this.pendingLobby = redraw;
      return;
    }
    this.pendingLobby = null;
    // Paluu ohittaa odotuksen: muuten aula jäisi odottamaan omaa sulkemistaan.
    const back = () => {
      this.leavingLobbySub = true;
      try {
        (this.pendingLobby ?? redraw)();
      } finally {
        this.leavingLobbySub = false;
      }
    };
    const scroll = this.scrollOf('lobby');
    const panel = this.panel('lobby');
    const me = v.players.find((p) => p.me);
    const myCraft: Craft = (me?.boat ?? 0) > 0 ? 'boat' : 'tube';
    const code = h('p', formatRoomCode(v.code), 'room-code');
    // Kutsulinkki: painallus kopioi sen, ja toinen painallus kopioi uudelleen.
    // Suojaamattomalla http-sivulla (LAN-peli) nappiin jää itse linkki, jotta
    // sen voi myös lukea ääneen tai kirjoittaa käsin.
    const copy = document.createElement('button');
    copy.className = 'room-link';
    const copyStatus = h('p', '', 'hint room-link-status');
    copyStatus.setAttribute('role', 'status');
    copyStatus.hidden = true;
    const showsLink = () => this.lobbyLinkShown === link;
    copy.textContent = showsLink() ? link : t('lobby.copyLink');
    copy.addEventListener('click', () => {
      void copyText(link).then((ok) => {
        if (!window.isSecureContext || !ok) this.lobbyLinkShown = link;
        if (!ok) {
          // Kopiointi estetty: linkki valittuna kentässä käsin kopioitavaksi.
          const field = document.createElement('input');
          field.type = 'text';
          field.readOnly = true;
          field.value = link;
          field.className = 'room-link-field';
          field.setAttribute('aria-label', t('lobby.copyManual'));
          copy.replaceWith(field);
          field.focus();
          field.select();
          copyStatus.textContent = t('lobby.copyManual');
        } else {
          copy.textContent = showsLink() ? link : t('lobby.linkCopied');
          copyStatus.textContent = showsLink() ? t('lobby.linkCopied') : '';
        }
        copyStatus.hidden = copyStatus.textContent === '';
      });
    });
    const list = document.createElement('ul');
    list.className = 'player-list';
    // Yksi rivi pelaajaa kohden (#529, #558): muiden varusteet eivät kuulu
    // aulaan, ja isäntä näkee kaikkien valmiuden vierittämättä. Omat varusteet
    // näkyvät yhteenvetona alempana.
    // Katsojat eivät vie kalastajapaikkoja (#274).
    // Botit (#624) väistyvät pelaajan tieltä, joten nekään eivät vie paikkoja.
    const anglers = v.players.filter((p) => !p.spectator && !p.bot).length;
    const botCount = v.players.filter((p) => p.bot).length;
    // Täyteen aulaan liittyneet odottavat katsojina vapaata paikkaa (#568).
    // Vanha palvelin ei kerro odottajia: silloin katsojat täydessä aulassa.
    const waitsSeat = (p: LobbyPlayer) =>
      p.waitingSeat ?? (anglers >= v.maxPlayers && p.spectator && !p.host);
    const playerRow = (p: LobbyPlayer) => {
      const li = document.createElement('li');
      li.dataset.session = p.sessionId;
      li.classList.toggle('lobby-new', event?.ids.includes(p.sessionId) ?? false);
      const seatWait = p.connected && p.spectator && waitsSeat(p);
      const state = p.bot
        ? t('lobby.bot', { skill: botSkillName(p.bot) })
        : t(
            !p.connected
              ? 'lobby.disconnected'
              : seatWait
                ? 'lobby.waitingSeat'
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
      li.classList.toggle('lobby-bot', !!p.bot);
      const swatch = h('span', '', 'player-color');
      swatch.style.background = cssColor(p.appearance.tube);
      const name = h('span', `${p.name}${p.me ? t('lobby.you') : ''}`);
      name.prepend(swatch);
      // Vanhan version pelaaja näkyy jo ennen kuin isäntä yrittää valita (#554).
      if (p.oldVersion) name.append(h('span', t('lobby.oldVersion'), 'player-old'));
      const stateEl = h(
        'span',
        state,
        `player-state ${seatWait ? 'seat-wait' : p.host || p.ready || p.spectator ? 'ok' : ''}`,
      );
      if (p.connected && p.ping !== undefined) stateEl.prepend(pingBars(p.ping));
      li.append(name, stateEl);
      return li;
    };
    // Pitkä bottilista tiivistyy: ensimmäiset näkyvät, loput yhtenä rivinä.
    const hidden = Math.max(0, botCount - LOBBY_BOT_ROWS);
    let botsShown = 0;
    const listed = v.players.filter((p) => !p.bot || ++botsShown <= LOBBY_BOT_ROWS);
    const shown = { ...v, players: listed };
    if (v.canBoat) list.append(...this.crewRows(shown, playerRow, actions.onBoat, actions.onSeat));
    else for (const p of listed) list.appendChild(playerRow(p));
    if (hidden > 0) {
      const more = h('li', t('lobby.moreBots', { n: hidden }), 'lobby-bot lobby-more-bots');
      list.appendChild(more);
    }
    // Odottajien määrä ja isännän vihje näkyvät otsikossa eivätkä vasta
    // pitkän listan alla (#516).
    const waiting = v.players.filter((p) => p.spectator && waitsSeat(p)).length;
    const full = waiting > 0;
    const header = h(
      'p',
      full
        ? t('lobby.playersWaiting', { n: anglers, max: v.maxPlayers, waiting })
        : botCount > 0
          ? t('lobby.playersBots', { n: anglers, max: v.maxPlayers, bots: botCount })
          : t('lobby.players', { n: anglers, max: v.maxPlayers }),
      'choice-label lobby-head',
    );
    // Ilmoitus samalla rivillä: lista ei hypi sen tullessa ja mennessä.
    if (event) header.append(h('span', event.text, 'lobby-event'));
    panel.append(
      h('h2', t('lobby.title')),
      h('p', t('mp.roomCode'), 'hint'),
      code,
      copy,
      copyStatus,
      header,
      ...(full && v.amHost ? [h('p', t('lobby.fullHost'), 'hint lobby-full')] : []),
      list,
      ...(v.oldVersion ? [h('p', oldVersionHint(v.oldVersion), 'hint lobby-old')] : []),
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
            // Täydessä aulassa katsoja ei saa paikkaa pyytämällä: se tulee
            // jonosta, kun paikka vapautuu (#514).
            ['play', t('lobby.play'), me.spectator && anglers >= v.maxPlayers],
            ['watch', t('lobby.watch')],
          ],
          me.spectator ? 'watch' : 'play',
          // Jo valitun painallus ei saa poistaa paikkajonosta (#514).
          (c) => {
            if ((c === 'watch') !== me.spectator) actions.onSpectate(c === 'watch');
          },
        ),
        ...(me.spectator
          ? [
              h('p', t('lobby.spectatorHint'), 'hint'),
              ...(full ? [h('p', t('lobby.fullWaiting'), 'hint')] : []),
            ]
          : []),
      );
    if (chat) {
      panel.append(h('p', t('lobby.chat'), 'choice-label'));
      chat(panel);
    }
    panel.append(
      v.amHost
        ? this.settingsEditor(
            v.settings,
            anglers,
            actions.onSettings,
            actions.onPickStart,
            v.canSeason,
            v.canInflate,
            v.canBots,
          )
        : this.settingsSummary(v.settings),
      // Katsoja ei kalasta, joten varusteita ei tarvita. Varusteet päävalikosta (#383).
      ...(me?.spectator ? [] : [this.tackleNote(me?.tackle ?? DEFAULT_TACKLE)]),
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
    const buttons: [string, () => void][] = [];
    // Aloita silti (#539): ei-valmiit kalastavat mukana tavallisina pelaajina.
    const asking = v.amHost && confirmStart && !v.allReady;
    if (asking) {
      notice = t('lobby.startAnywayAsk', { names: v.notReady.join(', ') });
      buttons.push(
        [t('lobby.startAnyway'), () => actions.onStart(true)],
        [t('lobby.wait'), actions.onWait],
      );
    } else if (v.amHost)
      buttons.push([
        v.allReady ? t('settings.startRace') : t('lobby.startWaiting', { n: v.notReady.length }),
        () => actions.onStart(false),
      ]);
    else if (!me?.spectator)
      buttons.push([
        me?.ready ? t('lobby.notReady') : t('lobby.setReady'),
        () => actions.onReady(!me?.ready),
      ]);
    buttons.push([t('common.leave'), actions.onLeave]);
    const footer = this.buttons(buttons);
    // Ilmoitus ("Odotetaan: …", asetukset muuttuivat) napin yläpuolelle, joka
    // pysyy näkyvissä: pitkän aulan lopussa se jäi vierityksen taakse, eikä
    // Aloita-napin painallus näyttänyt tekevän mitään.
    if (notice) footer.prepend(h('p', notice, 'error lobby-notice'));
    panel.append(footer);
    this.show(panel, { scroll });
  }

  /**
   * Aulan pelaajat kulkupeleittäin (#263): jokainen vene on oma joukkueensa
   * (otsikko, miehistö paikkoineen ja Liity kyytiin), renkaalla kalastavat
   * omana ryhmänään (#540). Katsojat lopussa.
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
    // Renkaalla kalastavat ilman toistuvaa kulkupelin nimeä (#540): veneiden
    // rinnalla otsikko kertoo jaon, ilman veneitä otsikko olisi turha.
    const tubes = v.players.filter((p) => !p.spectator && p.boat === 0);
    if (crews.size > 0 && tubes.length > 0)
      rows.push(h('li', t('lobby.tubeGroup', { n: tubes.length }), 'tube-group-head'));
    rows.push(...tubes.map(playerRow));
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

  /**
   * Omat varusteet omana näkymänään päävalikosta (#383): välineet laitetaan
   * kuntoon kotona. Kisassa vieheet vaihdetaan vain viehepakista (R).
   */
  showTackle(tackle: TackleBinding, onBack: () => void): void {
    // Viehepakin alanäkymästä palataan tähän viimeisimmin valituin varustein.
    let latest = tackle.current;
    const onChange = (next: Tackle) => {
      latest = next;
      tackle.onChange(next);
    };
    const pack: BoxBinding = {
      current: loadTackleBox(),
      onChange: (b) => {
        pack.current = b;
        saveTackleBox(b);
      },
    };
    const reopen = () => this.showTackle({ ...tackle, current: latest }, onBack);
    const panel = this.panel('tackle');
    panel.append(
      h('h2', t('settings.tackle')),
      this.tackleEditor(tackle.current, onChange, {
        pack,
        open: (method) => this.showBox('tackle-box', method, latest, pack, reopen),
      }),
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel, { back: onBack, focusFirst: true });
  }

  /**
   * Viehepakki tai perhorasia omana näkymänään (#365): enintään kahdeksan
   * lokeroa, joiden järjestys on R-kierron järjestys. Lokeron valinta
   * näyttää sen vieheen ja säädön; "Tyhjä" poistaa lokeron. Jigin paino ja
   * vaapun syvyys valitaan lokerolle (#383), ja vihje varoittaa, jos viehe ei
   * sovi vavan heittopainoon.
   */
  private showBox(
    screen: string,
    method: Method,
    tackle: Tackle,
    pack: BoxBinding,
    onBack: () => void,
  ): void {
    const fly = method === 'fly';
    const panel = this.panel(screen);
    const grid = document.createElement('div');
    grid.className = 'box-grid';
    const editor = document.createElement('div');
    editor.className = 'settings';
    let selected = 0;
    // Omat saaliit vieheittäin saalispäiväkirjasta (#415).
    const journal = loadJournal();
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
            const caught = baitSummary(journal, item).count;
            b.append(
              lureImage(typeof item === 'string' ? item : item.lure, '2px'),
              h('span', slotLabel(item), 'box-slot-name'),
              ...(caught > 0 ? [h('span', fishCount(caught), 'box-slot-catch')] : []),
            );
          } else {
            b.append(
              h('span', i === items.length ? t('box.add') : t('box.empty'), 'box-slot-name'),
            );
            b.classList.add('empty');
            // Lokerot täyttyvät järjestyksessä: tyhjän jälkeisiä ei voi valita.
            b.disabled = i > items.length;
          }
          b.addEventListener('click', () => {
            selected = i;
            render();
          });
          return b;
        }),
      );
      editor.replaceChildren();
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
        if (typeof item === 'string')
          editor.append(
            this.lureHintRow(item, flyHint(item)),
            h('p', catchesText(baitSummary(journal, item)), 'hint box-catches'),
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
      if (slot)
        editor.append(
          this.lureHintRow(slot.lure, lureHint(slot.lure)),
          h('p', catchesText(baitSummary(journal, slot)), 'hint box-catches'),
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
      if (slot?.variant)
        editor.append(
          h(
            'p',
            slot.lure === 'jig'
              ? jigWeightHint(slot.variant as JigWeightId)
              : crankDepthHint(slot.variant as CrankDepthId),
            'hint',
          ),
        );
      // Vavan heittopaino (#363): varoitus, jos lokeron viehe ei sovi vapaan.
      const rigged = slot ? withSlot(tackle, slot) : null;
      if (rigged && !fitsCastWeight(rigged)) {
        const [min, max] = RODS[rigged.rod].castWeight;
        const g = lureTuning(rigged).grams;
        editor.append(
          h('p', t('tackle.castWeightOff', { lure: tackleLureName(rigged), g, min, max }), 'hint'),
        );
      }
    };
    render();
    panel.append(
      h('h2', t(fly ? 'box.flyTitle' : 'box.title')),
      h('p', controlText('box.hint', { max: BOX_SLOTS }), 'hint'),
      grid,
      editor,
      this.buttons([
        [
          t('box.beginner'),
          () => {
            const b = beginnerBox();
            update(fly ? b.flies : b.lures);
          },
        ],
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

  /** Varusteet yhteenvetona yksinpelin asetuksissa ja aulassa: vaihto päävalikosta (#383). */
  private tackleNote(tackle: Tackle): HTMLElement {
    return h(
      'p',
      t('settings.tackleAtHome', {
        tackle: `${methodName(tackle.method)} · ${describeFullTackle(tackle)}`,
      }),
      'hint',
    );
  }

  /** Vieheen tai perhon kuva ja vihje rinnakkain (#362). */
  private lureHintRow(id: LureArtId, text: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'lure-hint';
    row.append(lureImage(id, LURE_HINT_SCALE), h('p', text, 'hint'));
    return row;
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
      this.choice(
        t('audio.rumble'),
        [
          ['1', t('common.yes')],
          ['0', t('common.no')],
        ],
        a.rumble ? '1' : '0',
        (v) => {
          a.rumble = v === '1';
          onChange({ ...a });
        },
      ),
      h('p', t('audio.rumbleHint'), 'hint'),
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

  /**
   * Ohjeet (#401): kalastuksen mekaniikat osioittain. Ohjaus näkyy pelaajan
   * ohjaustavalla, ja valittu osio säilyy, kun näkymä avataan uudelleen.
   */
  showManual(onBack: () => void): void {
    const panel = this.panel('manual');
    panel.classList.add('manual-panel');
    const content = document.createElement('div');
    content.className = 'manual';
    const render = () => {
      content.replaceChildren(
        ...manualTopics(this.manualSection).map((topic) => {
          const section = document.createElement('section');
          const list = document.createElement('ul');
          for (const line of topic.lines) list.append(h('li', line));
          section.append(h('h3', topic.title), list);
          return section;
        }),
      );
    };
    const sections = this.choice(
      '',
      MANUAL_SECTIONS.map((id) => [id, t(`manual.section.${id}` as const)]),
      this.manualSection,
      (v) => {
        this.manualSection = v as ManualSection;
        render();
        // Uusi osio alkaa alusta; osiot pysyvät näkyvissä vieritettäessä.
        panel.scrollTop = 0;
      },
    );
    sections.classList.add('manual-sections');
    render();
    panel.append(
      h('h2', t('manual.title')),
      h('p', t('manual.intro'), 'hint'),
      sections,
      content,
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel, { back: onBack });
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
    /** Kisan tilanne: kalat, paino, sija tai aika ja paras kala (#469). */
    status?: RaceStatus | null;
    /** Kisan säännöt luettavaksi: vaikeus, sää, kausi, voittaja ja kesto. */
    rules?: CompetitionSettings;
    /** Perukkeen vaihto kesken kisan; katsojalla ei ole varusteita. */
    onTackle?: () => void;
    onSettings: () => void;
    onManual: () => void;
    onFeedback: () => void;
    /** Paluu alinäkymästä: kohdistus sen napille Jatka-napin sijaan. */
    from?: PauseView;
  }): void {
    const panel = this.panel('pause');
    const menu = this.buttons([
      [t('pause.resume'), p.onResume],
      ...(p.onTackle ? [[t('menu.tackle'), p.onTackle] as [string, () => void]] : []),
      [t('menu.settings'), p.onSettings],
      [t('menu.manual'), p.onManual],
      [t('menu.feedback'), p.onFeedback],
      [
        p.multiplayer
          ? t('pause.leaveRace')
          : p.untimed
            ? t('pause.endSession')
            : t('pause.endRace'),
        p.onQuit,
      ],
    ]);
    menu.classList.add('main-menu', 'pause-menu');
    panel.classList.add('pause-panel');
    panel.append(
      h('h2', p.multiplayer ? t('pause.menu') : t('pause.title')),
      ...(p.clock ? [h('p', t('pause.clock', { time: p.clock }))] : []),
      ...(p.status ? pauseStatus(p.status) : []),
      ...(p.rules ? [pauseRules(p.rules)] : []),
      ...(p.multiplayer ? [h('p', t('pause.continues'), 'hint')] : []),
      menu,
      ...this.homeScreenHint(),
      // Firefox ja Safari eivät anna Escin jäädä peliin koko näytöllä.
      ...(escapeLeavesFullscreen() ? [h('p', t('fullscreen.escHint'), 'hint')] : []),
      ...this.fullscreenCorner(),
    );
    this.show(panel);
    if (p.from) {
      const label = t(PAUSE_VIEW_LABELS[p.from]);
      [...menu.querySelectorAll('button')].find((b) => b.textContent === label)?.focus();
    }
  }

  /**
   * Varusteet kesken kisan taukovalikosta: järvellä vaihdetaan siima ja
   * peruke. Vieheet vaihtuvat viehepakista ja kalastustapa omasta
   * pikavalikostaan, ja vapa laitetaan kuntoon päävalikon Varusteissa (#383).
   */
  showPauseTackle(tackle: TackleBinding, onBack: () => void): void {
    const tk = { ...tackle.current };
    const fly = isFly(tk);
    const now = h('p', '', 'hint');
    const lineHint = h('p', '', 'hint');
    const update = () => {
      now.textContent = t('pause.tackleNow', {
        tackle: `${methodName(tk.method)} · ${describeFullTackle(tk)}`,
      });
      if (fly) lineHint.textContent = flyLineHint(tk.flyLine);
    };
    const set = (patch: Partial<Tackle>) => {
      Object.assign(tk, patch);
      update();
      tackle.onChange({ ...tk });
    };
    update();
    const rig = document.createElement('div');
    rig.className = 'settings';
    rig.append(this.lineChoice(tk, set), ...(fly ? [lineHint] : []), this.leaderChoice(tk, set));
    const panel = this.panel('pause-tackle');
    panel.append(
      h('h2', t('menu.tackle')),
      rig,
      now,
      h('p', t(fly ? 'pause.flyLeaderHint' : 'tackle.hint'), 'hint'),
      h('p', controlText('pause.tackleHint'), 'hint'),
      this.buttons([[t('common.back'), onBack]]),
    );
    this.show(panel, { back: onBack, focusFirst: true });
  }

  /** Moninpelin lopputulokset voittoehdon mukaan. */
  showRaceResults(
    results: PlayerResult[],
    settings: CompetitionSettings,
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
    // Iso porukka (#507): varusteet pois riveiltä (ne ovat Tilastoissa) ja
    // pienet kalakuvat, jotta koko lista mahtuu ruutuun.
    const compact = results.length > COMPACT_RESULTS_OVER;
    // Nimisarake on pisimmän nimen levyinen, kuitenkin enintään RESULT_NAME_MAX
    // merkkiä: pidempi nimi lyhenee "…"-merkkiin (koko nimi vihjeessä), ettei
    // paino jää piiloon ja kalan kuva mahtuu rivin perään.
    const shortName = (name: string) =>
      name.length > RESULT_NAME_MAX ? `${name.slice(0, RESULT_NAME_MAX - 1)}…` : name;
    // Botin (#624) ja lähteneen merkintä on rivin lopussa, ettei se katkea nimen lyhennykseen.
    const nameWidth = Math.max(...results.map((r) => shortName(resultRowName(r).name).length));
    table.classList.toggle('compact', compact);
    for (const r of results) {
      const li = document.createElement('li');
      li.value = r.rank;
      li.classList.toggle('me', isMine(r, myId));
      // Saaliittomalle viiva kuten kisan taulussa (#528).
      li.classList.toggle('unranked', rankLabel(r) === '–');
      const biggest = r.summary.biggest ? formatWeight(r.summary.biggest.weight) : '–';
      const { name, tags } = resultRowName(r);
      const text =
        t('results.row', {
          name: shortName(name).padEnd(nameWidth),
          count: String(r.summary.count).padStart(2),
          total: formatWeight(r.summary.total).padStart(8),
          biggest,
        }) + tags.map((tag) => ` · ${tag}`).join('');
      const gear = tackles?.get(r.id);
      const big = r.summary.biggest;
      const row = resultRow(text, big ? sizedFish(big.species, big.weight) : null, {
        name,
        total: formatWeight(r.summary.total),
      });
      if (shortName(name) !== r.name) row.title = r.name;
      // Kapealla ruudulla (#634) kappalemäärä, suurin kala ja merkinnät ovat omalla rivillään.
      const detail = [
        t('results.rowCount', { count: r.summary.count }),
        ...(big ? [t('results.rowBiggest', { biggest })] : []),
        ...tags,
      ].join(' · ');
      li.append(row, h('span', detail, 'result-detail'));
      if (gear && !compact) li.append(h('span', describeFullTackle(gear), 'player-gear'));
      // Venekunta: joukkueen kalastajat veneen nimen alle.
      if (r.members?.length)
        li.append(h('span', r.members.map((m) => m.name).join(', '), 'player-gear'));
      table.appendChild(li);
    }
    const listBox = document.createElement('div');
    listBox.append(table, copyResults(results, settings));
    const map = race ? this.raceMap(race) : null;
    panel.append(
      ...this.resultsViews(panel, listBox, map, summary),
      h('p', rulesLine(settings), 'hint'),
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
    replay?: SoloReplay | null,
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
    const rival = replay?.challenge;
    if (rival) {
      const outcome = challengeOutcome(sum.score, rival.score);
      const key =
        outcome === 'won'
          ? 'results.challengeWon'
          : outcome === 'lost'
            ? 'results.challengeLost'
            : 'results.challengeTie';
      panel.append(
        h(
          'p',
          t(key, {
            mine: challengeScoreText(sum.score, c.settings, c.elapsed),
            name: rival.name,
            theirs: challengeScoreText(rival.score, c.settings, rival.elapsed),
          }),
          `total challenge-result ${outcome}`,
        ),
      );
    }
    if (sum.count === 0) {
      panel.append(h('p', controlText('results.empty')));
      // Reitistä ja tilastoista näkee silti, missä tuli käytyä ja mitä sattui.
      panel.append(...this.resultsViews(panel, h('div', ''), map, summary));
    } else {
      const list = document.createElement('ol');
      list.className = 'catch-list';
      for (const ct of [...c.catches].sort((a, b) => b.weight - a.weight)) {
        const li = document.createElement('li');
        li.append(
          resultRow(
            `${speciesName(ct.species).padEnd(8)} ${formatWeight(ct.weight).padStart(8)}   ${formatTime(ct.time)}`,
            sizedFish(ct.species, ct.weight),
          ),
        );
        list.appendChild(li);
      }
      panel.append(
        ...this.resultsViews(panel, list, map, summary),
        h(
          'p',
          t('results.summary', {
            count: sum.count,
            total: formatWeight(sum.total),
            biggest: weightWithLength(sum.biggest!.species, sum.biggest!.weight),
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
    );
    if (!replay) {
      panel.append(
        this.buttons([
          [t('results.again'), onAgain],
          [t('results.toMenu'), onMenu],
        ]),
      );
      this.show(panel, { cleanup: map?.dispose, back: onMenu });
      return;
    }
    const status = h('p', '', 'hint challenge-status');
    status.hidden = true;
    const scoreText = challengeScoreText(sum.score, c.settings, c.elapsed);
    panel.append(
      h('p', t('results.sameHint'), 'hint'),
      status,
      this.buttons([
        [t('results.again'), onAgain],
        [t('results.same'), replay.onSame],
        [t('results.challenge'), () => void shareChallenge(replay.link, scoreText, status)],
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
        const ok = await copyText(text);
        status.textContent = t(ok ? 'card.textCopied' : 'card.shareFailed');
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

  /** Kisan alku (#458): vesiltä tai täyttökisa rannalta, ja selitys. */
  private launchChoice(inflate: boolean, onChange: (inflate: boolean) => void): HTMLElement[] {
    return [
      this.choice(
        t('settings.launch'),
        [
          ['water', t('launch.water')],
          ['inflate', t('launch.inflate')],
        ],
        inflate ? 'inflate' : 'water',
        (v) => onChange(v === 'inflate'),
      ),
      h('p', t('settings.launchHint'), 'hint'),
    ];
  }

  /** Isännän asetusvalinnat aulassa. */
  private settingsEditor(
    s: RoomSettings,
    playerCount: number,
    change: (patch: Partial<RoomSettings>) => void,
    pickStart: () => void,
    canSeason: boolean,
    canInflate: boolean,
    canBots: boolean,
  ): HTMLElement {
    const box = document.createElement('div');
    box.className = 'settings';
    box.append(
      this.choice(t('settings.duration'), durationOptions(), String(s.durationMinutes), (v) =>
        change({ durationMinutes: Number(v) }),
      ),
      ...(canInflate ? this.launchChoice(!!s.inflate, (inflate) => change({ inflate })) : []),
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
      // Botit (#624) ovat kisan sääntö: ne täyttävät tyhjät kalastajapaikat.
      ...(canBots
        ? [
            this.choice(
              t('settings.bots'),
              BOT_FILL_OPTIONS.map((o) => [o.value, botFillName(o.value)]),
              s.bots,
              (v) => change({ bots: v as RoomSettings['bots'] }),
            ),
            ...(s.bots === 'fill'
              ? [
                  this.choice(
                    t('settings.botLevel'),
                    BOT_LEVEL_OPTIONS.map((o) => [o.value, botLevelName(o.value)]),
                    s.botLevel,
                    (v) => change({ botLevel: v as RoomSettings['botLevel'] }),
                  ),
                ]
              : []),
            h('p', t('settings.botsHint'), 'hint'),
          ]
        : []),
      this.speciesChoice(s.species, (species) => change({ species })),
      // Vanha palvelin ei tunne kausia: kisa on silloin aina kesällä.
      ...(canSeason
        ? [
            this.choice(t('settings.season'), seasonOptions(), s.season, (v) =>
              change({ season: v as Season }),
            ),
          ]
        : []),
      this.choice(t('settings.timeOfDay'), timeOfDayOptions(), s.timeOfDay, (v) =>
        change({ timeOfDay: v as TimeOfDay }),
      ),
      ...(canSeason ? [h('p', t('settings.seasonHint'), 'hint')] : []),
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

  /** Siima käytössä olevalle kalastustavalle: Varusteissa ja kisan taukovalikossa. */
  private lineChoice(tk: Tackle, set: (patch: Partial<Tackle>) => void): HTMLElement {
    if (isFly(tk))
      return this.choice(
        t('tackle.flyLine'),
        FLY_LINE_IDS.map((id) => [id, flyLineName(id)]),
        tk.flyLine,
        (v) => set({ flyLine: v as Tackle['flyLine'] }),
      );
    return this.choice(
      t('tackle.line'),
      LINE_IDS.map((id) => [
        id,
        t('tackle.lineOption', { name: lineName(id), kg: shortDecimal(LINES[id].strength) }),
      ]),
      tk.line,
      (v) => set({ line: v as Tackle['line'] }),
    );
  }

  /**
   * Peruke käytössä olevalle kalastustavalle: virvelissä teräsperuke päälle
   * tai pois, perhossa perukkeen materiaali. Sama rivi on Varusteissa ja
   * kisan taukovalikossa.
   */
  private leaderChoice(tk: Tackle, set: (patch: Partial<Tackle>) => void): HTMLElement {
    if (isFly(tk))
      return this.choice(
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
      );
    return this.choice(
      t('tackle.leader'),
      [
        ['no', t('common.no')],
        ['yes', t('common.yes')],
      ],
      tk.leader ? 'yes' : 'no',
      (v) => set({ leader: v === 'yes' }),
    );
  }

  /**
   * Varusteet: kalastustapa (virveli tai perho), viehepakki tai perhorasia
   * ja vavat siimoineen. Vieheet säätöineen ovat pakissa, josta R valitsee
   * kisan aikana (#383).
   */
  private tackleEditor(
    initial: Tackle,
    onChange: (t: Tackle) => void,
    pack: { pack: BoxBinding; open: (method: Method) => void },
  ): HTMLElement {
    const tk = { ...initial };
    const box = document.createElement('div');
    box.className = 'settings';
    const rebuild = (next: Tackle) => {
      onChange(next);
      box.replaceWith(this.tackleEditor(next, onChange, pack));
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
      hints.push([p, text]);
      return p;
    };
    const set = (patch: Partial<Tackle>) => {
      Object.assign(tk, patch);
      for (const [p, text] of hints) p.textContent = text();
      onChange({ ...tk });
    };
    if (fly) {
      box.append(
        this.choice(
          t('tackle.flyRod'),
          FLY_ROD_IDS.map((id) => [id, flyRodName(id)]),
          tk.flyRod,
          (v) => set({ flyRod: v as Tackle['flyRod'] }),
        ),
        hint(() => flyRodHint(tk.flyRod)),
        this.lineChoice(tk, set),
        hint(() => flyLineHint(tk.flyLine)),
        this.leaderChoice(tk, set),
        h('p', controlText('tackle.flyHint'), 'hint'),
      );
    } else {
      box.append(
        this.choice(
          t('tackle.rod'),
          ROD_IDS.map((id) => [id, rodName(id)]),
          tk.rod,
          (v) => set({ rod: v as Tackle['rod'] }),
        ),
        hint(() => {
          const [min, max] = RODS[tk.rod].castWeight;
          return `${rodHint(tk.rod)}. ${t('rod.castWeight', { min, max })}.`;
        }),
        this.lineChoice(tk, set),
        this.leaderChoice(tk, set),
        h('p', t('tackle.hint'), 'hint'),
      );
    }
    box.append(h('p', controlText('tackle.lureInRace'), 'hint'));
    // Vieheet ja perhot ovat pakissa, joten ne säilyvät ennallaan.
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
      ...(s.bots === 'fill'
        ? [
            [t('settings.bots'), `${botFillName(s.bots)} (${botLevelName(s.botLevel)})`] as [
              string,
              string,
            ],
          ]
        : []),
      [t('settings.season'), seasonName(s.season)],
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
      [t('settings.launch'), t(s.inflate ? 'launch.inflate' : 'launch.water')],
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

  /**
   * Koko näytön kuvake paneelin oikeaan yläkulmaan, jos selain sen osaa eikä
   * peli jo ole sovelluksena.
   */
  private fullscreenCorner(): HTMLElement[] {
    return fullscreenSupported() && !isStandalone() ? [fullscreenButton()] : [];
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

/** Tulossivun nimisarakkeen enimmäisleveys (merkkiä). */
const RESULT_NAME_MAX = 14;
/** Aulan listassa näytetään näin monta bottia; loput tiivistyvät yhdeksi riviksi (#624). */
const LOBBY_BOT_ROWS = 3;

/**
 * Tulosrivi: teksti vasemmalla ja kalan kuva oikeassa reunassa, joten kuva
 * näkyy aina kokonaan; liian pitkä teksti lyhenee "…"-merkkiin.
 */
function resultRow(
  text: string,
  fish: HTMLElement | null,
  narrow?: { name: string; total: string },
): HTMLElement {
  const row = h('div', '', 'result-row');
  row.append(h('span', text, 'result-text'));
  // Puhelin pystyssä (#634): nimi ja paino ylärivillä, loput rivin alla (`.result-detail`).
  if (narrow) {
    const top = h('span', '', 'result-narrow');
    top.append(h('span', narrow.name, 'result-name'), h('span', narrow.total, 'result-total'));
    row.append(top);
    row.classList.add('has-narrow');
  }
  if (fish) row.append(fish);
  return row;
}

/** Kalan kuva ja pituus sen alla (#577): rivin teksti ei veny. */
function sizedFish(species: SpeciesId, weight: number): HTMLElement {
  const fig = h('span', '', 'fish-sized');
  fig.append(
    fishImage(species, weight, LIST_FISH_SCALE),
    h('span', lengthText(species, weight), 'fish-length'),
  );
  return fig;
}

/** Yhteyden laatu (#575): hyvä alle 30 ms, kohtalainen alle 100 ms. */
export const pingLevel = (ms: number): 1 | 2 | 3 => (ms < 30 ? 3 : ms < 100 ? 2 : 1);

/** Aulan rivin hillitty yhteysmerkki (#575): kolme pientä palkkia ja viive. */
function pingBars(ms: number): HTMLElement {
  const level = pingLevel(ms);
  const el = h('span', '', `player-ping ping-${level}`);
  el.title = t('lobby.ping', { ms });
  const bars = h('span', '', 'ping-bars');
  for (let i = 1; i <= 3; i++) bars.append(h('i', '', i <= level ? 'on' : ''));
  el.append(bars, `${ms} ms`);
  return el;
}

const fishCount = (n: number) => (n === 1 ? t('box.fishOne') : t('box.fishMany', { n }));

/** Vieheen saaliit ja parhaat olot viehepakin vihjeeseen (#415). */
function catchesText(s: BaitSummary): string {
  if (s.count === 0) return t('box.noCatches');
  const catches = t('box.catches', {
    fish: fishCount(s.count),
    species: s.species.map(([id, n]) => `${speciesName(id).toLocaleLowerCase()} ${n}`).join(', '),
    biggest: s.biggest
      ? `${speciesName(s.biggest.species).toLocaleLowerCase()} ${weightWithLength(s.biggest.species, s.biggest.weight)}`
      : '',
  });
  if (!s.best) return catches;
  return t('box.catchesBest', {
    catches,
    season: t(`journal.season.${s.best.season}`),
    sky: t(`journal.sky.${s.best.sky}`),
    time: t(`journal.time.${s.best.timeOfDay}`),
    depth: t(`journal.depth.${s.best.depth}`),
  });
}

/** Aulan selitys vanhan version pelaajista ja siitä, mitä he estävät (#554). */
export function oldVersionHint(old: OldVersionView): string {
  const names = old.names.join(', ');
  if (old.whitefish && old.inflate) return t('lobby.oldVersionBoth', { names });
  if (old.whitefish) return t('lobby.oldVersionWhitefish', { names });
  if (old.inflate) return t('lobby.oldVersionInflate', { names });
  return t('lobby.oldVersionHint', { names });
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

/**
 * Kopioi tulokset (#507): nappi tulosten alle. Suojaamattomalla http-sivulla
 * (LAN-peli) leikepöytää ei ole, joten teksti tulee valittavaksi kenttään.
 */
function copyResults(results: readonly PlayerResult[], settings: CompetitionSettings): HTMLElement {
  const box = h('div', '', 'results-copy-row');
  const field = document.createElement('textarea');
  field.className = 'results-copy';
  field.readOnly = true;
  field.setAttribute('aria-label', t('results.copyHint'));
  const label = h('p', t('results.copyHint'), 'hint');
  const button = document.createElement('button');
  button.textContent = t('results.copy');
  const showText = (text: string) => {
    field.value = text;
    field.rows = Math.min(16, text.split('\n').length);
    box.replaceChildren(label, field);
    field.focus();
    field.select();
  };
  button.addEventListener('click', () => {
    const text = resultsText(results, settings, new Date());
    if (!navigator.clipboard) return showText(text);
    navigator.clipboard.writeText(text).then(
      () => (button.textContent = t('results.copied')),
      () => showText(text),
    );
  });
  box.append(button);
  return box;
}

/**
 * Haastelinkki kaverille (#413): puhelimessa jakotoiminnolla, muuten
 * leikepöydälle. Linkki näkyy myös tulossivulla, jos kopiointi ei onnistu.
 */
async function shareChallenge(link: string, score: string, status: HTMLElement): Promise<void> {
  const show = (text: string) => {
    const a = document.createElement('a');
    a.href = link;
    a.textContent = link;
    status.replaceChildren(`${text} `, a);
    status.hidden = false;
  };
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text: t('results.challengeShareText', { score }), url: link });
      show(t('results.challengeShared', { score }));
      return;
    }
    const ok = await copyText(link);
    show(ok ? t('results.challengeCopied', { score }) : t('results.challengeCopy'));
  } catch (err) {
    // Käyttäjä perui jakamisen.
    if ((err as Error).name === 'AbortError') return;
    show(t('results.challengeCopy'));
  }
}

/**
 * Taukovalikon kisatilanne (#469): kolme ruutua (Kalat, Paino ja moninpelissä
 * Sija, yksinpelissä kello) ja alla kisan paras kala vieheineen. Ennen
 * ensimmäistä kalaa paino ja sija ovat viivoja (#488).
 */
const NO_VALUE = '–';

function pauseStatus(s: RaceStatus): HTMLElement[] {
  const tile = (label: string, value: string) => {
    const e = h('div', '', 'pause-stat');
    e.append(h('span', label, 'pause-stat-label'), h('span', value, 'pause-stat-value'));
    return e;
  };
  const grid = h('div', '', 'pause-stats');
  grid.append(
    tile(t('pause.fish'), String(s.count)),
    tile(t('pause.weight'), s.count > 0 ? formatWeight(s.total) : NO_VALUE),
    s.place
      ? tile(
          t('pause.place'),
          s.place.rank === null
            ? NO_VALUE
            : t('pause.placeOf', { rank: s.place.rank, of: s.place.of }),
        )
      : tile(
          t(s.time.kind === 'left' ? 'pause.timeLeft' : 'pause.elapsed'),
          formatTime(s.time.seconds),
        ),
  );
  if (!s.best) return [grid];
  const b = s.best;
  const fish = speciesName(b.species).toLowerCase();
  const weight = formatWeight(b.weight);
  const best = b.bait
    ? t('pause.bestBait', {
        fish,
        weight,
        bait: typeof b.bait === 'string' ? flyName(b.bait) : lureLabel(b.bait.lure, b.bait.variant),
      })
    : t('pause.best', { fish, weight });
  return [grid, h('p', best, 'pause-best')];
}

/**
 * Kisan säännöt taukovalikossa: vaikeus, sää, kausi ja vuorokaudenaika,
 * voittaja ja kesto yhtenä rivinä. Kisan aikana niitä ei voi vaihtaa, joten
 * ne ovat vain luettavissa; valinnat tehdään yksinpelin asetuksissa ja aulassa.
 */
function pauseRules(s: CompetitionSettings): HTMLElement {
  const item = (label: string, value: string) => {
    const e = h('span', '', 'pause-rule');
    e.append(h('span', `${label} `, 'pause-rule-label'), value);
    return e;
  };
  const row = h('p', '', 'pause-rules');
  row.append(
    item(t('settings.difficultyShort'), difficultyName(s.difficulty)),
    item(t('settings.weather'), weatherLevelName(s.weather ?? DEFAULT_SETTINGS.weather!)),
    item(
      t('settings.season'),
      `${seasonName(seasonOf(s))}, ${timeOfDayName(s.timeOfDay ?? DEFAULT_SETTINGS.timeOfDay!).toLowerCase()}`,
    ),
    item(t('settings.winRule'), winRuleName(s.winRule)),
    item(t('settings.duration'), durationName(s.durationMinutes)),
  );
  return row;
}

function h(tag: string, text: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}
