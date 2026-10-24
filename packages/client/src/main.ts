import * as THREE from 'three';
import { GAME_NAME } from '@lunki/shared';
import { FpsMeter } from './engine/fpsMeter';
import { Input } from './engine/input';
import { startLoop } from './engine/loop';
import { RetroRenderer, type PaletteMode } from './engine/retroRenderer';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app puuttuu');
document.title = GAME_NAME;

const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
app.appendChild(canvas);

const retro = new RetroRenderer(canvas);
const input = new Input(canvas);
const fps = new FpsMeter(app, import.meta.env.DEV);

// Testikohtaus: vettä, pari saarta ja pyörivä kelluntarengas.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x83c2db);
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 500);
camera.position.set(0, 30, 30);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xeef2f3, 0x24502c, 1.2));
const sun = new THREE.DirectionalLight(0xfff3b0, 2);
sun.position.set(20, 40, 10);
scene.add(sun);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshLambertMaterial({ color: 0x1b5a84 }),
);
water.rotation.x = -Math.PI / 2;
scene.add(water);

const islandMat = new THREE.MeshLambertMaterial({ color: 0x3b7337 });
for (const [x, z, r] of [
  [-14, -6, 5],
  [12, -10, 3],
  [6, 12, 4],
] as const) {
  const island = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 1.5, 1.5, 12), islandMat);
  island.position.set(x, 0.4, z);
  scene.add(island);
}

const tube = new THREE.Mesh(
  new THREE.TorusGeometry(2, 0.7, 8, 16),
  new THREE.MeshLambertMaterial({ color: 0xd23a2a }),
);
tube.rotation.x = -Math.PI / 2;
tube.position.y = 0.5;
scene.add(tube);

retro.onResize(({ width, height }) => {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});

const paletteModes: PaletteMode[] = ['palette', 'dither', 'off'];
let t = 0;

startLoop({
  update(dt) {
    input.beginStep();
    t += dt;
    if (input.wasPressed('F2')) {
      const i = paletteModes.indexOf(retro.paletteMode);
      retro.paletteMode = paletteModes[(i + 1) % paletteModes.length]!;
    }
    if (input.wasPressed('F3')) fps.toggle();
    const speed = 8;
    if (input.isDown('KeyW')) tube.position.z -= speed * dt;
    if (input.isDown('KeyS')) tube.position.z += speed * dt;
    if (input.isDown('KeyA')) tube.position.x -= speed * dt;
    if (input.isDown('KeyD')) tube.position.x += speed * dt;
    tube.rotation.z = t * 0.8;
  },
  render(_alpha, frameTime) {
    retro.render(scene, camera);
    const { width, height, scale } = retro.resolution;
    fps.frame(frameTime, `${width}×${height} ×${scale} · ${retro.paletteMode}`);
  },
});
