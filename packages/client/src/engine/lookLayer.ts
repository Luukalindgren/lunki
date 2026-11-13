import type * as THREE from 'three';
import type { LookQuality } from './look';

/**
 * Ilmeen oma piirtokerros (#650). Modernin ilmeen koodi ladataan vasta
 * valittaessa, ja se liittyy pelin kohtaukseen tämän rajapinnan kautta: peli
 * ei tiedä kerroksen sisällöstä, eikä kerros pelin säännöistä.
 */
export interface LookLayer {
  /** Liittää kerroksen kohtaukseen (kisa tai valikon tausta). */
  attach(scene: THREE.Scene, renderer: THREE.WebGLRenderer): LookAttachment;
  /**
   * Vapauttaa sen, minkä kerros on rakentanut kohtausten kesken jaettavaksi
   * (maisema). Kutsutaan, kun ilme vaihtuu pois eikä kerros ole liitettynä.
   */
  release?(): void;
}

export interface LookAttachment {
  /** Kutsutaan joka ruudulla juuri ennen piirtoa. */
  update(camera: THREE.Camera, quality: LookQuality): void;
  /** Palauttaa kohtauksen ennalleen. */
  dispose(): void;
}
