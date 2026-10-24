import * as THREE from 'three';
import { GAME_NAME, LUNKINJARVI, WaterBody, findOpenWaterPoint, type Vec2 } from '@lunki/shared';
import { FpsMeter } from './engine/fpsMeter';
import { Input } from './engine/input';
import { startLoop } from './engine/loop';
import { RetroRenderer, type PaletteMode } from './engine/retroRenderer';
import { TopDownCamera } from './game/topDownCamera';
import { createLakeMesh, toWorld } from './world/lakeMesh';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app puuttuu');
document.title = GAME_NAME;

const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
app.appendChild(canvas);

const retro = new RetroRenderer(canvas);
const input = new Input(canvas);
const fps = new FpsMeter(app, import.meta.env.DEV);

const map = LUNKINJARVI;
const water = new WaterBody(map);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24502c);
scene.add(new THREE.HemisphereLight(0xeef2f3, 0x24502c, 1.5));
const sun = new THREE.DirectionalLight(0xfff3b0, 1.5);
sun.position.set(-50, 100, -30);
scene.add(sun);
scene.add(createLakeMesh(map));

// Väliaikainen kelluntarengas: suora WASD-liike, kunnes oikea fysiikka (#6) tulee.
const TUBE_RADIUS = 0.8;
const tube = new THREE.Mesh(
  new THREE.TorusGeometry(TUBE_RADIUS * 0.75, TUBE_RADIUS * 0.3, 6, 12),
  new THREE.MeshLambertMaterial({ color: 0xd23a2a }),
);
tube.rotation.x = -Math.PI / 2;
scene.add(tube);
let player: Vec2 = findOpenWaterPoint(water, map.bounds);

const view = new TopDownCamera();
view.snapTo(player);
retro.onResize((r) => view.setResolution(r));

const paletteModes: PaletteMode[] = ['palette', 'dither', 'off'];

startLoop({
  update(dt) {
    input.beginStep();
    if (input.wasPressed('F2')) {
      const i = paletteModes.indexOf(retro.paletteMode);
      retro.paletteMode = paletteModes[(i + 1) % paletteModes.length]!;
    }
    if (input.wasPressed('F3')) fps.toggle();
    if (input.wheel !== 0) view.zoom(input.wheel);

    const speed = input.isDown('ShiftLeft') ? 40 : 4;
    const move = { x: 0, y: 0 };
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) move.y += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) move.y -= 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) move.x -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) move.x += 1;
    if (move.x !== 0 || move.y !== 0) {
      const len = Math.hypot(move.x, move.y);
      const next = {
        x: player.x + (move.x / len) * speed * dt,
        y: player.y + (move.y / len) * speed * dt,
      };
      player = water.moveCircle(player, next, TUBE_RADIUS)?.position ?? next;
    }
    view.follow(player, dt);
  },
  render(_alpha, frameTime) {
    tube.position.copy(toWorld(player, 0.1));
    view.apply();
    retro.render(scene, view.camera);
    const { width, height, scale } = retro.resolution;
    fps.frame(
      frameTime,
      `${width}×${height} ×${scale} · ${view.metersPerPixel} m/px · ${retro.paletteMode}`,
    );
  },
});
