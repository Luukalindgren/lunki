import type * as THREE from 'three';
import type { LookQuality } from './look';
import type { LookAttachment, LookLayer } from './lookLayer';

/** Näin kauan (ms) modernin ilmeen latausta odotetaan ennen kuin luovutaan. */
export const MODERN_TIMEOUT_MS = 15_000;

/**
 * Moderni ilme (#650) ladataan vasta, kun pelaaja valitsee sen: koodi, tyylit
 * ja fontit ovat omassa tiedostossaan (`src/modern/`), eikä Retron tai Terävän
 * pelaaja hae niitä koskaan. Lataus epäonnistuu aikarajaan, jos verkko on
 * poikki eikä tiedostoja ole vielä laitteella.
 */
export class ModernHost {
  private loading: Promise<LookLayer> | null = null;
  private layer: LookLayer | null = null;
  private scene: THREE.Scene | null = null;
  private attachment: LookAttachment | null = null;

  constructor(
    private readonly load: () => Promise<LookLayer> = () =>
      import('../modern/modernLook').then((m) => m.createModernLook()),
    private readonly timeoutMs = MODERN_TIMEOUT_MS,
  ) {}

  get loaded(): boolean {
    return this.layer !== null;
  }

  /** Hakee modernin ilmeen; epäonnistunut haku yritetään seuraavalla kerralla uudelleen. */
  ensure(): Promise<void> {
    if (this.layer) return Promise.resolve();
    if (!this.loading) {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('moderni ilme ei latautunut ajoissa')), this.timeoutMs),
      );
      this.loading = Promise.race([this.load(), timeout]);
      this.loading.then(
        (layer) => (this.layer = layer),
        () => (this.loading = null),
      );
    }
    return this.loading.then(() => undefined);
  }

  /**
   * Joka ruudulla ennen piirtoa: kerros on liitettynä siihen kohtaukseen, jota
   * piirretään, ja vain kun ilme on Moderni.
   */
  frame(
    active: boolean,
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    quality: LookQuality,
  ): void {
    if (!active || !this.layer) {
      if (this.attachment) {
        this.detach();
        // Ilme vaihtui pois: jaettu maisema ei jää viemään muistia.
        this.layer?.release?.();
      }
      return;
    }
    if (this.scene !== scene) {
      this.detach();
      this.scene = scene;
      this.attachment = this.layer.attach(scene, renderer);
    }
    this.attachment?.update(camera, quality);
  }

  detach(): void {
    this.attachment?.dispose();
    this.attachment = null;
    this.scene = null;
  }
}
