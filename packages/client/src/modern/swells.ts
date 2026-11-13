import * as THREE from 'three';
import { BIG_WAVE_CREST } from '../game/bigWaveView';
import { clamp01, noise3, sstep } from './shapes';
import { VEIL } from './veil';

/** Lisätyn osan nimi: pyöristys ja varjot ohittavat sen (`modern-`). */
const ADDED = 'modern-swell';
/** Mainingin korkeus (m), rinteiden leveydet (m): jyrkkä etureuna, loiva selkä. */
export const SWELL = { height: 0.45, front: 1.0, back: 3.2 } as const;
/** Verkon jako harjan poikki ja pituussuuntaan. */
const ACROSS = 22;
const ALONG = 90;
/**
 * Veden väri (lineaarinen, sama kuin Modernin vesi), harjan vaalea selkä ja vaahto.
 * Pinta on valaisematon kuten järvi: kirkkaus tulee koko kuvan sävytyksestä.
 */
const WATER = [0.009, 0.056, 0.082] as const;
const LIFT = [0.03, 0.13, 0.17] as const;
const FOAM = [0.86, 0.92, 0.96] as const;

/**
 * Iso aalto mallina: pitkä, päistään mataloituva maininki, jonka etureuna
 * (+x, kulkusuunta) on jyrkkä ja selkä loiva. Harjan laella on katkonainen
 * vaahto, ja reunat häipyvät veteen. Pituus on z-akselilla kuten pelin harjassa.
 */
export function swellShape(): THREE.BufferGeometry {
  const { length } = BIG_WAVE_CREST;
  const from = -SWELL.back * 2.2;
  const to = SWELL.front * 2.4;
  const position: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= ALONG; j++) {
    const v = j / ALONG;
    const z = (v - 0.5) * length;
    // Päät mataloituvat, ja harja aaltoilee pituussuunnassa kuten oikea aalto.
    const ends = 1 - Math.pow(Math.abs(v * 2 - 1), 3);
    const swellK = ends * (0.72 + 0.28 * noise3(z * 0.09, 3.1, 0.7));
    const lean = noise3(z * 0.05, 9.4, 2.2) * 0.8;
    for (let i = 0; i <= ACROSS; i++) {
      const u = i / ACROSS;
      const x = from + (to - from) * u;
      const s = x >= 0 ? x / SWELL.front : x / SWELL.back;
      const h = SWELL.height * swellK * Math.exp(-s * s);
      position.push(x + lean, h, z);
      // Selkä vaalenee laelle, etureuna jää varjoon.
      const top = h / SWELL.height;
      const shade = x > 0 ? 1 - 0.45 * sstep(0, 1.6, s) * (1 - top) : 1;
      // Vaahto laella ja hieman selän puolella, laikkuina.
      const patch =
        0.5 + 0.325 * noise3(z * 0.42, x * 0.9, 5.3) + 0.175 * noise3(z * 1.7, x * 2.3, 1.9);
      // Etureunalla vaahto valuu laelta alemmas kuin selän puolella.
      const spill = x > 0 ? 0.4 : 0.66;
      const crest =
        sstep(spill, spill + 0.3, top) * sstep(0.4, 0.62, patch) * sstep(0.25, 0.6, swellK);
      for (let c = 0; c < 3; c++) {
        const water = (WATER[c]! + LIFT[c]! * top * top) * shade;
        color.push(water + (FOAM[c]! - water) * crest);
      }
      // Reunoilla ja päissä pinta sulautuu järveen.
      const edge = sstep(0, 0.16, u) * sstep(0, 0.2, 1 - u);
      color.push(clamp01(edge * sstep(0.02, 0.2, swellK) * (0.55 + 0.45 * top + crest)));
    }
  }
  const row = ACROSS + 1;
  for (let j = 0; j < ALONG; j++)
    for (let i = 0; i < ACROSS; i++) {
      const p = j * row + i;
      index.push(p, p + row, p + 1, p + 1, p + row, p + row + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Iso aalto Modernissa ilmeessä (#650): pelin vaahtopätkien ja tumman
 * aallonpohjan (`bigWave-crest`) tilalla vyöryy maininki, jonka
 * laella on vaahto. Paikka, suunta ja ajoitus ovat pelin (`BigWaveView`).
 */
export class Swells {
  private crest: THREE.Object3D | null = null;
  private readonly hidden: THREE.Material[] = [];
  private readonly mesh = new THREE.Mesh(
    swellShape(),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...VEIL }),
  );

  constructor() {
    this.mesh.name = ADDED;
    this.mesh.frustumCulled = false;
  }

  /** Pelin aallonharja; `null` irrottaa (kohtaus vaihtui). */
  bind(crest: THREE.Object3D | null): void {
    if (crest === this.crest) return;
    this.release();
    this.crest = crest;
    if (!crest) return;
    for (const part of crest.children) {
      const material = (part as THREE.Mesh).material as THREE.Material | undefined;
      if (!material) continue;
      material.visible = false;
      this.hidden.push(material);
    }
    crest.add(this.mesh);
  }

  private release(): void {
    for (const material of this.hidden) material.visible = true;
    this.hidden.length = 0;
    this.mesh.removeFromParent();
    this.crest = null;
  }

  dispose(): void {
    this.release();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
