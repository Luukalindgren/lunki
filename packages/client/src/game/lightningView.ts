import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';

/** Salaman näkyvyysaika (s) ja korkeus (m). */
const BOLT_SECONDS = 0.5;
const TOP = 160;
const SEGMENTS = 14;

/**
 * Salamanisku: rosoinen viiva taivaalta veteen ja valon välähdys.
 */
export class LightningView {
  readonly group = new THREE.Group();
  private readonly bolt: THREE.Line;
  private readonly positions = new Float32Array((SEGMENTS + 1) * 3);
  private timer = 0;
  private seed = 1;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.bolt = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xeef2f3 }));
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.group.add(this.bolt);
    this.group.name = 'lightning';
  }

  /** Välähdyksen voimakkuus 0–1 valaistukseen. */
  get flash(): number {
    return this.timer > 0 ? Math.min(1, this.timer / BOLT_SECONDS) : 0;
  }

  strike(pos: Vec2): void {
    let x = pos.x;
    let z = -pos.y;
    // Alhaalta ylös, jotta isku osuu täsmälleen kohtaan `pos`.
    for (let i = 0; i <= SEGMENTS; i++) {
      const o = i * 3;
      this.positions[o] = x;
      this.positions[o + 1] = (TOP * i) / SEGMENTS;
      this.positions[o + 2] = z;
      // Siksak: sivuttain vuorotellen ja hieman pohjoiseen, joten salama
      // näyttää salamalta myös ylhäältä katsottuna.
      x += (i % 2 === 0 ? 1 : -1) * (3 + this.rand() * 6);
      z -= this.rand() * 4;
    }
    this.bolt.geometry.getAttribute('position').needsUpdate = true;
    this.timer = BOLT_SECONDS;
  }

  update(dt: number): void {
    this.timer = Math.max(0, this.timer - dt);
    // Välkkyy: näkyy ja katoaa pari kertaa ennen sammumista.
    this.bolt.visible = this.timer > 0 && Math.floor(this.timer * 12) % 4 !== 2;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
