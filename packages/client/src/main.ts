import { DEFAULT_SETTINGS, GAME_NAME, type CompetitionSettings } from '@lunki/shared';
import { FpsMeter } from './engine/fpsMeter';
import { Input } from './engine/input';
import { startLoop } from './engine/loop';
import { RetroRenderer, type PaletteMode } from './engine/retroRenderer';
import { Sfx } from './audio/sfx';
import { SoloGame } from './game/soloGame';
import { Hud } from './ui/hud';
import { Screens, loadSettings } from './ui/screens';

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
const sfx = new Sfx();
window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', () => sfx.unlock());
// Kehitystä varten: ?difficulty=easy&seed=123&minutes=1 aloittaa suoraan.
const params = new URLSearchParams(location.search);
const devDifficulty = (['easy', 'normal', 'realistic'] as const).find(
  (d) => d === params.get('difficulty'),
);
const devSeed = params.has('seed') ? Number(params.get('seed')) : undefined;

const screens = new Screens(app);
let settings = loadSettings(DEFAULT_SETTINGS);
let game: SoloGame | null = null;
let paused = false;

function startGame(s: CompetitionSettings) {
  settings = s;
  game?.dispose();
  game = new SoloGame(input, hud, sfx, (x, y) => retro.screenToInternal(x, y), s, devSeed);
  game.view.setResolution(retro.resolution);
  game.onFinished = () => showResults();
  if (import.meta.env.DEV) Object.assign(window, { lunki: game });
  paused = false;
  screens.hide();
  hud.setVisible(true);
}

function showMenu() {
  hud.setVisible(false);
  screens.showStart(settings, startGame);
}

function showResults() {
  if (!game) return;
  hud.setVisible(false);
  screens.showResults(
    game.competition,
    () => startGame(settings),
    () => showMenu(),
  );
}

function togglePause() {
  if (!game || game.competition.finished) return;
  paused = !paused;
  if (paused) {
    hud.setVisible(false);
    screens.showPause(togglePause, () => {
      game!.competition.finished = true;
      showResults();
    });
  } else {
    screens.hide();
    hud.setVisible(true);
  }
}

retro.onResize((r) => {
  game?.view.setResolution(r);
  hud.setPixelSize(r.scale / (window.devicePixelRatio || 1));
});

if (devDifficulty) {
  startGame({
    ...settings,
    difficulty: devDifficulty,
    durationMinutes: Number(params.get('minutes') ?? settings.durationMinutes),
  });
} else {
  showMenu();
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
    if (game && !paused && !screens.open) game.update(dt);
  },
  render(alpha, frameTime) {
    const active = game ?? menuScene;
    active.render(alpha);
    retro.render(active.scene, active.view.camera);
    const { width, height, scale } = retro.resolution;
    fps.frame(frameTime, `${width}×${height} ×${scale} · ${active.view.metersPerPixel} m/px`);
  },
});
