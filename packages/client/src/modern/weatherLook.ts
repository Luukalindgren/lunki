import * as THREE from 'three';
import { Bolts } from './bolts';
import { Rain, type Drops } from './rain';
import { Spouts } from './spouts';
import { Swells } from './swells';

/** Kohtaus käydään läpi näin monen ruudun välein (kisa vaihtuu, valikon tausta). */
const SCAN_FRAMES = 30;
/** Pisin ruudun kesto (s), jonka sään tehosteet etenevät kerralla. */
const MAX_STEP = 0.1;

const size = new THREE.Vector2();

/**
 * Sääilmiöt Modernissa ilmeessä (#650): sade, salama, trombi ja iso aalto.
 * Peli piirtää ne edelleen itse ja nimeää osansa (`rain`, `lightning`,
 * `spouts`, `bigWave-crest`); tämä etsii ne kohtauksesta ja antaa kullekin
 * modernin piirron samaan paikkaan. Usva ja kaukosumu ovat jo pehmeitä
 * (`MistView`, `SkyView.grade`), eikä niille tehdä omaa versiota.
 */
export class WeatherLook {
  private readonly rain = new Rain();
  private readonly bolts = new Bolts();
  private readonly spouts = new Spouts();
  private readonly swells = new Swells();
  private frames = 0;
  private last = performance.now();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {}

  update(camera: THREE.Camera): void {
    if (this.frames++ % SCAN_FRAMES === 0) this.find();
    const now = performance.now();
    const dt = Math.min(MAX_STEP, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const heightPx = this.renderer.getDrawingBufferSize(size).y;
    this.rain.update(camera, heightPx, dt);
    this.bolts.update(camera);
    this.spouts.update(camera);
  }

  private find(): void {
    const found = {
      rain: null as THREE.Object3D | null,
      lightning: null as THREE.Object3D | null,
      spouts: null as THREE.Object3D | null,
      'bigWave-crest': null as THREE.Object3D | null,
    };
    this.scene.traverse((o) => {
      if (o.name in found) found[o.name as keyof typeof found] ??= o;
    });
    this.rain.bind(found.rain as Drops | null);
    this.bolts.bind(found.lightning);
    this.spouts.bind(found.spouts);
    this.swells.bind(found['bigWave-crest']);
  }

  dispose(): void {
    this.rain.dispose();
    this.bolts.dispose();
    this.spouts.dispose();
    this.swells.dispose();
  }
}
