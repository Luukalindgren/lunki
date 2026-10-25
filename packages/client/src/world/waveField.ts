import * as THREE from 'three';
import { fetchDistance, type LakeMap, type Vec2 } from '@lunki/shared';

const G = 9.81;
/** Ruudun koko (m) ja tallennettavan kertoimen yläraja. */
const CELL = 20;
const MAX_FACTOR = 0.04;
/** Pyyhkäisymatkat lasketaan uudelleen, kun tuuli kääntyy tätä enemmän (rad). */
const REDIRECT = 0.07;

/**
 * Aallonkorkeus järven eri kohdissa. Hs = 0,0016 · U · √(F/g) on suoraan
 * verrannollinen tuuleen, joten ruutuihin tallennetaan vain pyyhkäisymatkasta
 * riippuva kerroin, ja se lasketaan uudelleen vain tuulen kääntyessä.
 * Kerroin on myös tekstuurina vesishaderille.
 */
export class WaveField {
  readonly texture: THREE.DataTexture;
  /** minX, minY, leveys, korkeus (m) shaderille. */
  readonly bounds: THREE.Vector4;
  private readonly cols: number;
  private readonly rows: number;
  private readonly factors: Float32Array;
  private readonly data: Uint8Array;
  private dir = NaN;

  constructor(private readonly map: LakeMap) {
    const b = map.bounds;
    this.cols = Math.ceil((b.maxX - b.minX) / CELL) + 1;
    this.rows = Math.ceil((b.maxY - b.minY) / CELL) + 1;
    this.factors = new Float32Array(this.cols * this.rows);
    this.data = new Uint8Array(this.cols * this.rows * 4);
    this.texture = new THREE.DataTexture(this.data, this.cols, this.rows);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.bounds = new THREE.Vector4(
      b.minX - CELL / 2,
      b.minY - CELL / 2,
      this.cols * CELL,
      this.rows * CELL,
    );
  }

  /** Päivittää pyyhkäisymatkat, jos tuuli on kääntynyt. Palauttaa true, jos laskettiin. */
  update(windDir: number): boolean {
    const turn = Math.abs(Math.atan2(Math.sin(windDir - this.dir), Math.cos(windDir - this.dir)));
    if (turn < REDIRECT) return false;
    this.dir = windDir;
    const rings = [this.map.shore, ...this.map.islands];
    const b = this.map.bounds;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const p = { x: b.minX + i * CELL, y: b.minY + j * CELL };
        const f = 0.0016 * Math.sqrt(fetchDistance(rings, p, windDir) / G);
        const k = j * this.cols + i;
        this.factors[k] = f;
        this.data[k * 4] = Math.round(Math.min(1, f / MAX_FACTOR) * 255);
      }
    }
    this.texture.needsUpdate = true;
    return true;
  }

  /** Merkitsevä aallonkorkeus (m) pisteessä tuulen nopeudella windSpeed. */
  heightAt(p: Vec2, windSpeed: number): number {
    const b = this.map.bounds;
    const i = Math.max(0, Math.min(this.cols - 1, Math.round((p.x - b.minX) / CELL)));
    const j = Math.max(0, Math.min(this.rows - 1, Math.round((p.y - b.minY) / CELL)));
    return this.factors[j * this.cols + i]! * windSpeed;
  }
}

/** Shaderin tallentama kerroin → aallonkorkeus: hs = r · MAX_FACTOR · U. */
export const WAVE_FACTOR_SCALE = MAX_FACTOR;
