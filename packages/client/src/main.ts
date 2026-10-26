import {
  DEFAULT_SETTINGS,
  GAME_NAME,
  LUNKINJARVI,
  WaterBody,
  formatClock,
  formatTime,
  isTimeOfDay,
  isFly,
  isWeatherLevel,
  parseRoomCode,
  type CatchRecord,
  type CompetitionSettings,
  type TimeOfDay,
  type WeatherLevel,
} from '@lunki/shared';
import { FpsMeter } from './engine/fpsMeter';
import { Input } from './engine/input';
import { startLoop } from './engine/loop';
import { RetroRenderer, type PaletteMode } from './engine/retroRenderer';
import { MENU_AMBIENCE } from './audio/ambience';
import { Sfx } from './audio/sfx';
import { SoloGame } from './game/soloGame';
import { loadTackle, saveTackle } from './game/tackle';
import { loadAppearance, saveAppearance } from './game/appearance';
import { Hud } from './ui/hud';
import { loadHudScale, saveHudScale } from './ui/hudScale';
import { describeSpot } from './ui/lakeMap';
import type { WeighCardInfo } from './ui/weighCard';
import { ChatBox } from './ui/chat';
import { TouchControls, isTouchDevice } from './ui/touchControls';
import { Screens, loadSettings } from './ui/screens';
import { Bench } from './dev/bench';
import { clearLastRoom, loadIdentity, loadLastRoom, saveLastRoom, saveName } from './net/identity';
import {
  NetSession,
  checkServer,
  customServer,
  describeJoinError,
  fetchRecords,
  inviteLink,
  submitSoloRecord,
} from './net/session';
import { NetWorld } from './net/netWorld';
import { installErrorReporting, reportContext, sendFeedback } from './net/report';
import { formatWeight, ordinal, t } from './i18n';
import { speciesName } from './i18n/names';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app puuttuu');
document.title = GAME_NAME;

const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
app.appendChild(canvas);

const retro = createRenderer(canvas, app);
const input = new Input(canvas);
const fps = new FpsMeter(app, import.meta.env.DEV);
const hud = new Hud(app);
/** Pelaajan valitsema HUDin koko, tallessa selaimessa. */
let hudScale = loadHudScale();
hud.setScale(hudScale);
hud.setVisible(false);
const touch = isTouchDevice() ? new TouchControls(hud.root, input) : null;
hud.setTouch(touch !== null);
installErrorReporting();
const sfx = new Sfx();
// Kosketuksessa selain sallii äänen vasta sormen noustessa (pointerup/touchend),
// ei vielä painalluksessa, joten kuunnellaan molempia.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown'])
  window.addEventListener(type, () => sfx.unlock(), { passive: true });
// Kehitystä varten: ?difficulty=easy&seed=123&minutes=1&weather=chaos&time=evening aloittaa suoraan.
const params = new URLSearchParams(location.search);
const devDifficulty = (['easy', 'normal', 'realistic'] as const).find(
  (d) => d === params.get('difficulty'),
);
const devSeed = params.has('seed') ? Number(params.get('seed')) : undefined;

const screens = new Screens(app);
input.menuOpen = () => screens.open;
let settings = loadSettings(DEFAULT_SETTINGS);
let game: SoloGame | null = null;
let paused = false;
let bench: Bench | null = null;
/** Moninpelihuone, jos pelaaja on sellaisessa. */
let session: NetSession | null = null;
/** Moninpelin chat (aulassa, kisan aikana ja tulossivulla). */
let chat: ChatBox | null = null;
if (touch) touch.onChat = () => chat?.open();
let updateTime = 0;
let updateCount = 0;
/** Moninpelin tulossivu näkyy: oliko pelaaja silloin isäntä (null = ei tulossivua). */
let resultsAsHost: boolean | null = null;
/** Yksinpelin ennätyslistalle päässeet saaliit tulossivulle. */
let soloRecordNotes: string[] = [];

function startGame(s: CompetitionSettings, seed = devSeed) {
  if (!session) settings = s;
  game?.dispose();
  const net = session
    ? { world: new NetWorld(session, new WaterBody(LUNKINJARVI)), overlay: app!, canvas }
    : undefined;
  game = new SoloGame(
    input,
    hud,
    sfx,
    (x, y) => retro.screenToInternal(x, y),
    s,
    seed,
    LUNKINJARVI,
    net,
  );
  game.setResolution(retro.resolution);
  // Kisa alkaa kalastajan silmin; V / KAM vaihtaa ylhäältä katsottuun.
  // ?view=top (testit) ja suorituskykymittaus pysyvät ylhäällä.
  game.setViewMode(params.get('view') === 'top' || params.has('bench') ? 'top' : 'pov', false);
  resultsAsHost = null;
  game.onFinished = () => showResults();
  soloRecordNotes = [];
  // Kehitystilan valitulla siemenellä saalis ei ole reilu ennätys.
  if (!session && devSeed === undefined) {
    const g = game;
    g.onSoloCatch = (entry) =>
      void submitSoloRecord({
        ...entry,
        angler: loadIdentity().name,
        appearance: loadAppearance(),
      }).then((place) => {
        if (place === null || game !== g) return;
        const fish = `${speciesName(entry.species)} ${formatWeight(entry.weight)}`;
        const note =
          place === 1
            ? t('records.soloFirst', { fish })
            : t('records.soloPlace', { fish, place: ordinal(place) });
        soloRecordNotes.push(note);
        if (!g.competition.finished) hud.showMessage(note, 3.5);
      });
  }
  hud.setHelpMode(session !== null, game.spectating);
  if (session) chat?.mount(hud.root, 'hud');
  touch?.setMultiplayer(session !== null);
  if (import.meta.env.DEV) Object.assign(window, { lunki: game });
  paused = false;
  screens.hide();
  hud.setVisible(true);
}

function showMenu() {
  hud.setVisible(false);
  const lastRoom = loadLastRoom();
  screens.showStart({
    rejoin: lastRoom
      ? { code: lastRoom, run: () => void connect(loadIdentity().name, lastRoom, true) }
      : undefined,
    onSolo: () => showSoloSetup(settings),
    onMultiplayer: () => showMultiplayer(),
    onLakeMap: () => screens.showLakeMap(showMenu),
    onRecords: () => void showRecords(),
    onAudio: () => screens.showAudio(sfx.audioSettings, (a) => sfx.setAudioSettings(a), showMenu),
    onFeedback: () =>
      screens.showFeedback(
        loadIdentity().name,
        (f) => sendFeedback({ ...f, context: reportContext() }),
        showMenu,
      ),
    onCredits: () => screens.showCredits(showMenu),
    onLanguage: showMenu,
  });
}

function showSoloSetup(s: CompetitionSettings) {
  screens.showSoloSetup(
    s,
    (x) => startGame(x),
    showMenu,
    (current) =>
      screens.showStartPicker(
        current.start ?? null,
        (start) => showSoloSetup({ ...current, start }),
        () => showSoloSetup(current),
      ),
    { current: loadAppearance(), onChange: saveAppearance },
    { current: loadTackle(), onChange: saveTackle },
  );
}

async function showRecords() {
  let cancelled = false;
  screens.showMessage(t('menu.records'), t('records.loading'), () => {
    cancelled = true;
    showMenu();
  });
  const [board, solo] = await Promise.all([fetchRecords('race'), fetchRecords('solo')]);
  if (!cancelled && !game) screens.showRecords(board, solo, settings.difficulty, showMenu);
}

/** Punnituskortti oman kisan suurimmasta kalasta; null, jos saalista ei tullut. */
function weighCardFor(g: SoloGame): WeighCardInfo | null {
  const biggest = g.competition.catches.reduce<CatchRecord | null>(
    (best, c) => (!best || c.weight > best.weight ? c : best),
    null,
  );
  if (!biggest) return null;
  return {
    fish: biggest,
    // Moninpelissä nimi ja värit palvelimelta (sama selain voi olla kahdesti pelissä).
    angler: g.ownName ?? loadIdentity().name,
    appearance: g.appearance,
    timeOfDay: g.settings.timeOfDay ?? 'day',
    spot: biggest.at ? describeSpot(biggest.at) : null,
    date: new Date(),
  };
}

function showResults() {
  if (!game) return;
  const card = weighCardFor(game);
  hud.setVisible(false);
  if (session) {
    const s = session;
    const v = s.view();
    resultsAsHost = v.amHost;
    screens.showRaceResults(
      s.results(),
      v.settings,
      s.sessionId,
      v.amHost,
      () => s.restart(),
      leaveRoom,
      new Map(v.players.map((p) => [p.sessionId, p.tackle])),
      (parent) => chat?.mount(parent, 'panel'),
      card,
      game.raceMap(),
    );
    return;
  }
  screens.showResults(
    game.competition,
    () => startGame(settings),
    () => showMenu(),
    card,
    game.raceMap(),
    soloRecordNotes,
  );
}

// --- Moninpeli -------------------------------------------------------------

function showMultiplayer(code = '', error?: string) {
  hud.setVisible(false);
  const { name } = loadIdentity();
  screens.showMultiplayer(
    name,
    code,
    (n) => void connect(n, null),
    (n, c) => {
      const parsed = parseRoomCode(c);
      if (parsed) void connect(n, parsed);
      else showMultiplayer(c, t('mp.badCode'));
    },
    () => {
      history.replaceState(null, '', location.pathname);
      showMenu();
    },
    error,
  );
  void checkServer().then((ok) => screens.setServerStatus(ok, customServer()));
}

/** `rejoin`: päävalikon "Palaa kisaan"; epäonnistuessa huonetta ei enää tarjota. */
async function connect(name: string, code: string | null, rejoin = false) {
  const options = { name: saveName(name), playerId: loadIdentity().playerId };
  let cancelled = false;
  screens.showMessage(code ? t('mp.joining') : t('mp.creating'), t('mp.connecting'), () => {
    cancelled = true;
    showMultiplayer(code ?? '');
  });
  try {
    const s = code ? await NetSession.join(code, options) : await NetSession.create(options);
    if (cancelled) return void s.leave();
    enterLobby(s);
  } catch (err) {
    console.warn('Liittyminen epäonnistui', err);
    if (rejoin) clearLastRoom();
    if (!cancelled) showMultiplayer(code ?? '', describeJoinError(err));
  }
}

function enterLobby(s: NetSession) {
  session = s;
  if (s.ready) saveLastRoom(s.view().code);
  chat?.dispose();
  chat = new ChatBox(s);
  // Kirjoittaessa rengas ei jää potkimaan eikä kela kelaamaan.
  chat.onOpen = () => input.releaseAll();
  // Viimeksi käytetyt varusteet muiden nähtäväksi.
  s.sendTackle(loadTackle());
  s.sendAppearance(loadAppearance());
  let notice: string | undefined;
  /** Isäntä valitsee aloituspaikkaa: aula ei piirry kartan päälle. */
  let picking = false;
  const render = () => {
    if (session !== s || game || !s.ready || picking) return;
    const v = s.view();
    history.replaceState(null, '', inviteLink(v.code));
    screens.showLobby(
      v,
      inviteLink(v.code),
      {
        onReady: (r) => {
          wasReady = r;
          s.setReady(r);
        },
        onStart: () => s.start(),
        onSpectate: (on) => s.setSpectator(on),
        onLeave: leaveRoom,
        onSettings: (patch) => s.changeSettings(patch),
        onTackle: (t) => {
          saveTackle(t);
          s.sendTackle(t);
        },
        onAppearance: (a) => {
          saveAppearance(a);
          s.sendAppearance(a);
        },
        onPickStart: () => {
          picking = true;
          const done = () => {
            picking = false;
            render();
          };
          screens.showStartPicker(
            v.settings.start ?? null,
            (start) => {
              s.changeSettings({ start });
              done();
            },
            done,
          );
        },
      },
      notice,
      (parent) => chat?.mount(parent, 'panel'),
    );
  };
  let wasReady = false;
  s.onChange = (v) => {
    // Huoneesta jo lähdetty: myöhästynyt tila ei saa aloittaa kisaa uudelleen.
    if (session !== s) return;
    // Kisa alkaa, kun tila aloituspaikkoineen on saapunut.
    if (v.phase !== 'lobby' && !game) {
      picking = false;
      saveLastRoom(v.code);
      startGame(v.settings, s.room.state.seed);
      // Kesken kisan mukaan (uutena, paluuna tai sivun uudelleenlatauksen jälkeen).
      const left = v.settings.durationMinutes * 60 - s.room.state.clock;
      if (s.spectating)
        hud.showMessage(
          v.players.find((p) => p.me)?.spectator && s.room.state.clock > 1
            ? t('mp.lateSpectator', { time: formatTime(left) })
            : t('mp.spectating'),
          5,
        );
      else if (v.phase === 'playing' && s.room.state.clock > 1)
        hud.showMessage(t('mp.lateJoined', { time: formatTime(left) }), 4);
      return;
    }
    // Isäntä lähti tulossivulta: uudelle isännälle uuden kisan nappi.
    if (v.phase === 'finished' && resultsAsHost !== null && resultsAsHost !== v.amHost)
      showResults();
    if (v.phase !== 'lobby') return;
    resultsAsHost = null;
    if (game) {
      // Isäntä palautti huoneen aulaan uutta kisaa varten.
      game.dispose();
      game = null;
      paused = false;
      hud.setVisible(false);
    }
    const ready = v.players.find((p) => p.me)?.ready ?? false;
    notice = wasReady && !ready && !v.amHost ? t('mp.settingsChanged') : undefined;
    wasReady = ready;
    render();
  };
  s.onError = (m) => {
    if (session !== s) return;
    notice = m;
    render();
  };
  s.onDisconnect = () => {
    if (session !== s) return;
    session = null;
    chat?.dispose();
    chat = null;
    game?.dispose();
    game = null;
    showMultiplayer('', t('mp.disconnected'));
  };
  s.onConnection = (connected) => {
    if (session === s) hud.showMessage(connected ? t('mp.reconnected') : t('mp.reconnecting'), 3);
  };
  // Uudelleenyhdistäessä kisa voi olla jo käynnissä.
  if (s.ready) s.onChange(s.view());
  else render();
}

/** Sivun uudelleenlataus kesken kisan: palataan samaan renkaaseen. */
async function tryResume(): Promise<boolean> {
  if (!NetSession.canResume()) return false;
  screens.showMessage(t('mp.resuming'), t('mp.connecting'));
  const s = await NetSession.resume();
  if (!s) return false;
  // Odotetaan ensimmäistä tilaa.
  for (let i = 0; i < 100 && !s.ready; i++) await new Promise((r) => setTimeout(r, 20));
  enterLobby(s);
  return true;
}

function leaveRoom() {
  const s = session;
  session = null;
  clearLastRoom();
  chat?.dispose();
  chat = null;
  void s?.leave();
  game?.dispose();
  game = null;
  history.replaceState(null, '', location.pathname);
  showMenu();
}

function togglePause() {
  if (!game || game.competition.finished) return;
  paused = !paused;
  if (paused) {
    hud.setVisible(false);
    screens.showPause(
      togglePause,
      session
        ? leaveRoom
        : () => {
            game!.competition.finished = true;
            showResults();
          },
      session !== null,
      // Katsoja ei kalasta.
      game.spectating ? undefined : { current: game.tackle, onChange: (t) => game?.setTackle(t) },
      { current: sfx.audioSettings, onChange: (a) => sfx.setAudioSettings(a) },
      formatClock(game.clock),
      {
        current: hudScale,
        onChange: (scale) => {
          hudScale = scale;
          saveHudScale(scale);
          hud.setScale(scale);
          // Esikatselu: HUD näkyy valikon takana heti kokoa vaihdettaessa.
          hud.setVisible(true);
        },
        effective: () => hud.effectiveScale(),
      },
    );
  } else {
    screens.hide();
    hud.setVisible(true);
  }
}

retro.onResize((r) => {
  game?.setResolution(r);
  hud.setPixelSize(r.scale / (window.devicePixelRatio || 1));
});

if (params.has('bench')) {
  // Tyyni sää, jotta mittaukset ovat vertailukelpoisia.
  startGame({ durationMinutes: 10, difficulty: 'easy', winRule: 'total', weather: 'calm' });
  bench = new Bench(game!, input, retro, app);
} else if (devDifficulty) {
  startGame({
    ...settings,
    difficulty: devDifficulty,
    weather: isWeatherLevel(params.get('weather'))
      ? (params.get('weather') as WeatherLevel)
      : settings.weather,
    timeOfDay: isTimeOfDay(params.get('time'))
      ? (params.get('time') as TimeOfDay)
      : settings.timeOfDay,
    durationMinutes: Number(params.get('minutes') ?? settings.durationMinutes),
  });
} else {
  void tryResume().then((resumed) => {
    if (resumed) return;
    if (params.has('huone')) showMultiplayer(params.get('huone') ?? '');
    else showMenu();
  });
}

/**
 * Ilman WebGL:ää (laitteistokiihdytys pois, vanha selain) peli ei piirry:
 * tyhjän ruudun sijaan kerrotaan syy.
 */
function createRenderer(c: HTMLCanvasElement, parent: HTMLElement): RetroRenderer {
  try {
    return new RetroRenderer(c);
  } catch (err) {
    const screen = document.createElement('div');
    screen.className = 'screen';
    const panel = document.createElement('div');
    panel.className = 'screen-panel';
    const title = document.createElement('h2');
    title.textContent = t('error.webglTitle');
    const text = document.createElement('p');
    text.textContent = t('error.webgl');
    panel.append(title, text);
    screen.appendChild(panel);
    parent.replaceChildren(screen);
    throw err;
  }
}

// Taustakohtaus valikon taakse: tyhjä järvi.
const menuScene = new SoloGame(
  input,
  hud,
  sfx,
  (x, y) => retro.screenToInternal(x, y),
  // Valikon taustalla aina päivä, vaikka viime kisa olisi ollut yöllä.
  { ...settings, timeOfDay: 'day' },
  1,
);
menuScene.view.zoom(3);
retro.onResize((r) => menuScene.view.setResolution(r));

const paletteModes: PaletteMode[] = ['palette', 'dither', 'off'];

startLoop({
  update(dt) {
    input.beginStep();
    if (input.wasPressed('F2')) {
      const i = paletteModes.indexOf(retro.paletteMode);
      retro.paletteMode = paletteModes[(i + 1) % paletteModes.length]!;
    }
    if (input.wasPressed('F3')) fps.toggle();
    // Taukovalikossa myös Backspace jatkaa peliä (muissa valikoissa se palaa takaisin).
    if (input.wasPressed('Escape') || (paused && input.wasPressed('Backspace'))) togglePause();
    bench?.script(dt);
    const t0 = performance.now();
    // Moninpelissä kisa jatkuu valikon ollessa auki.
    if (game && ((!paused && !screens.open) || (session && paused))) game.update(dt);
    if (game) {
      touch?.setGear(game.fishing.gear);
      touch?.setFly(isFly(game.fishing.tackle), !game.fishing.onReel);
    } else sfx.updateAmbience(dt, MENU_AMBIENCE);
    updateTime += performance.now() - t0;
    updateCount++;
  },
  render(alpha, frameTime) {
    const active = game ?? menuScene;
    const t0 = performance.now();
    active.render(alpha);
    retro.render(active.scene, active.camera, active.grade);
    bench?.timing(updateTime, performance.now() - t0, updateCount);
    updateTime = 0;
    updateCount = 0;
    const { width, height, scale } = retro.resolution;
    fps.frame(frameTime, `${width}×${height} ×${scale} · ${active.view.metersPerPixel} m/px`);
    bench?.frame(frameTime);
  },
});
