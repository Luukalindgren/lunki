import {
  DEFAULT_SETTINGS,
  GAME_NAME,
  LUNKINJARVI,
  WaterBody,
  isWeatherLevel,
  parseRoomCode,
  type CompetitionSettings,
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
import { Hud } from './ui/hud';
import { Screens, loadSettings } from './ui/screens';
import { Bench } from './dev/bench';
import { loadIdentity, saveName } from './net/identity';
import {
  NetSession,
  checkServer,
  describeJoinError,
  fetchRecords,
  inviteLink,
} from './net/session';
import { NetWorld } from './net/netWorld';
import { installErrorReporting, reportContext, sendFeedback } from './net/report';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app puuttuu');
document.title = GAME_NAME;

const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
app.appendChild(canvas);

const retro = new RetroRenderer(canvas);
const input = new Input(canvas);
const fps = new FpsMeter(app, import.meta.env.DEV);
const hud = new Hud(app);
hud.setVisible(false);
installErrorReporting();
const sfx = new Sfx();
window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', () => sfx.unlock());
// Kehitystä varten: ?difficulty=easy&seed=123&minutes=1&weather=chaos aloittaa suoraan.
const params = new URLSearchParams(location.search);
const devDifficulty = (['easy', 'normal', 'realistic'] as const).find(
  (d) => d === params.get('difficulty'),
);
const devSeed = params.has('seed') ? Number(params.get('seed')) : undefined;

const screens = new Screens(app);
let settings = loadSettings(DEFAULT_SETTINGS);
let game: SoloGame | null = null;
let paused = false;
let bench: Bench | null = null;
/** Moninpelihuone, jos pelaaja on sellaisessa. */
let session: NetSession | null = null;
let updateTime = 0;
let updateCount = 0;

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
  game.onFinished = () => showResults();
  if (import.meta.env.DEV) Object.assign(window, { lunki: game });
  paused = false;
  screens.hide();
  hud.setVisible(true);
}

function showMenu() {
  hud.setVisible(false);
  screens.showStart(
    settings,
    (s) => startGame(s),
    () => showMultiplayer(),
    () => void showRecords(),
    () => screens.showCredits(showMenu),
    () => screens.showAudio(sfx.audioSettings, (a) => sfx.setAudioSettings(a), showMenu),
    () =>
      screens.showFeedback(
        loadIdentity().name,
        (f) => sendFeedback({ ...f, context: reportContext() }),
        showMenu,
      ),
  );
}

async function showRecords() {
  let cancelled = false;
  screens.showMessage('Ennätykset', 'Haetaan ennätyksiä…', () => {
    cancelled = true;
    showMenu();
  });
  const board = await fetchRecords();
  if (!cancelled && !game) screens.showRecords(board, settings.difficulty, showMenu);
}

function showResults() {
  if (!game) return;
  hud.setVisible(false);
  if (session) {
    const s = session;
    const v = s.view();
    screens.showRaceResults(
      s.results(),
      v.settings,
      s.sessionId,
      v.amHost,
      () => s.restart(),
      leaveRoom,
      new Map(v.players.map((p) => [p.sessionId, p.tackle])),
    );
    return;
  }
  screens.showResults(
    game.competition,
    () => startGame(settings),
    () => showMenu(),
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
      else showMultiplayer(c, 'Tarkista koodi: muotoa LUNKI-XXXX.');
    },
    () => {
      history.replaceState(null, '', location.pathname);
      showMenu();
    },
    error,
  );
  void checkServer().then((ok) => screens.setServerStatus(ok));
}

async function connect(name: string, code: string | null) {
  const options = { name: saveName(name), playerId: loadIdentity().playerId };
  let cancelled = false;
  screens.showMessage(code ? 'Liitytään…' : 'Luodaan huonetta…', 'Yhdistetään palvelimeen.', () => {
    cancelled = true;
    showMultiplayer(code ?? '');
  });
  try {
    const s = code ? await NetSession.join(code, options) : await NetSession.create(options);
    if (cancelled) return void s.leave();
    enterLobby(s);
  } catch (err) {
    console.warn('Liittyminen epäonnistui', err);
    if (!cancelled) showMultiplayer(code ?? '', describeJoinError(err));
  }
}

function enterLobby(s: NetSession) {
  session = s;
  // Viimeksi käytetyt varusteet muiden nähtäväksi.
  s.sendTackle(loadTackle());
  let notice: string | undefined;
  const render = () => {
    if (session !== s || game || !s.ready) return;
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
        onLeave: leaveRoom,
        onSettings: (patch) => s.changeSettings(patch),
        onTackle: (t) => {
          saveTackle(t);
          s.sendTackle(t);
        },
      },
      notice,
    );
  };
  let wasReady = false;
  s.onChange = (v) => {
    // Kisa alkaa, kun tila aloituspaikkoineen on saapunut.
    if (v.phase !== 'lobby' && !game) return startGame(v.settings, s.room.state.seed);
    if (v.phase !== 'lobby') return;
    if (game) {
      // Isäntä palautti huoneen aulaan uutta kisaa varten.
      game.dispose();
      game = null;
      paused = false;
      hud.setVisible(false);
    }
    const ready = v.players.find((p) => p.me)?.ready ?? false;
    notice =
      wasReady && !ready && !v.amHost
        ? 'Asetukset muuttuivat: tarkista ne ja kuittaa valmius uudelleen.'
        : undefined;
    wasReady = ready;
    render();
  };
  s.onError = (m) => {
    notice = m;
    render();
  };
  s.onDisconnect = () => {
    session = null;
    game?.dispose();
    game = null;
    showMultiplayer('', 'Yhteys palvelimeen katkesi.');
  };
  s.onConnection = (connected) =>
    hud.showMessage(connected ? 'Yhteys palautui' : 'Yhteys katkesi – yhdistetään uudelleen…', 3);
  // Uudelleenyhdistäessä kisa voi olla jo käynnissä.
  if (s.ready) s.onChange(s.view());
  else render();
}

/** Sivun uudelleenlataus kesken kisan: palataan samaan renkaaseen. */
async function tryResume(): Promise<boolean> {
  if (!NetSession.canResume()) return false;
  screens.showMessage('Palataan kisaan…', 'Yhdistetään palvelimeen.');
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
      { current: game.tackle, onChange: (t) => game?.setTackle(t) },
      { current: sfx.audioSettings, onChange: (a) => sfx.setAudioSettings(a) },
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
    durationMinutes: Number(params.get('minutes') ?? settings.durationMinutes),
  });
} else {
  void tryResume().then((resumed) => {
    if (resumed) return;
    if (params.has('huone')) showMultiplayer(params.get('huone') ?? '');
    else showMenu();
  });
}

// Taustakohtaus valikon taakse: tyhjä järvi.
const menuScene = new SoloGame(
  input,
  hud,
  sfx,
  (x, y) => retro.screenToInternal(x, y),
  settings,
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
    if (input.wasPressed('Escape')) togglePause();
    bench?.script(dt);
    const t0 = performance.now();
    // Moninpelissä kisa jatkuu valikon ollessa auki.
    if (game && ((!paused && !screens.open) || (session && paused))) game.update(dt);
    else if (!game) sfx.updateAmbience(dt, MENU_AMBIENCE);
    updateTime += performance.now() - t0;
    updateCount++;
  },
  render(alpha, frameTime) {
    const active = game ?? menuScene;
    const t0 = performance.now();
    active.render(alpha);
    retro.render(active.scene, active.camera);
    bench?.timing(updateTime, performance.now() - t0, updateCount);
    updateTime = 0;
    updateCount = 0;
    const { width, height, scale } = retro.resolution;
    fps.frame(frameTime, `${width}×${height} ×${scale} · ${active.view.metersPerPixel} m/px`);
    bench?.frame(frameTime);
  },
});
