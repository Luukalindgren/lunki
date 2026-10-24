import { GAME_NAME } from '@lunki/shared';
import { FpsMeter } from './engine/fpsMeter';
import { Input } from './engine/input';
import { startLoop } from './engine/loop';
import { RetroRenderer, type PaletteMode } from './engine/retroRenderer';
import { SoloGame } from './game/soloGame';
import { Hud } from './ui/hud';

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
const game = new SoloGame(input, hud, (x, y) => retro.screenToInternal(x, y));
retro.onResize((r) => {
  game.view.setResolution(r);
  hud.setPixelSize(r.scale / (window.devicePixelRatio || 1));
});

const paletteModes: PaletteMode[] = ['palette', 'dither', 'off'];

startLoop({
  update(dt) {
    input.beginStep();
    if (input.wasPressed('F2')) {
      const i = paletteModes.indexOf(retro.paletteMode);
      retro.paletteMode = paletteModes[(i + 1) % paletteModes.length]!;
    }
    if (input.wasPressed('F3')) fps.toggle();
    game.update(dt);
  },
  render(alpha, frameTime) {
    game.render(alpha);
    retro.render(game.scene, game.view.camera);
    const { width, height, scale } = retro.resolution;
    const speed = Math.hypot(game.tube.vel.x, game.tube.vel.y);
    fps.frame(
      frameTime,
      `${width}×${height} ×${scale} · ${game.view.metersPerPixel} m/px · ${speed.toFixed(1)} m/s`,
    );
  },
});
