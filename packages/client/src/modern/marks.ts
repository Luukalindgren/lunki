import * as THREE from 'three';
import { FLOAT_WIDTH, floatShape, gemShape } from './markShapes';
import { paintedMaterial } from './shapes';
import { unveil, veil } from './veil';

/** Kohtaus käydään läpi näin monen ruudun välein: uudet pelaajat saavat merkkinsä. */
const SCAN_FRAMES = 20;
/** Lisätyn merkin nimi: pyöristys ohittaa sen eikä se heitä varjoa (`NO_CAST`). */
const ADDED = 'modern-mark';

/** Väreen peitto alussa; haalistuu renkaan iän mukana. */
const RIPPLE_ALPHA = 0.85;
/** Timantin reuna (sama kuin pikselitimantissa), reunan paksuus ja oma hehku pimeää varten. */
const GEM = { edge: 0x1c232b, rim: 1.28, glow: 0.4 } as const;

const v = new THREE.Vector3();

/** Kohon reunaviiva (sama tumma kuin pikselikohossa) ja sen paksuus. */
const BOB = { edge: 0x1c232b, rim: 1.1 } as const;

interface Bob {
  group: THREE.Object3D;
  sprite: THREE.Sprite;
  bob: THREE.Mesh;
  face: THREE.MeshLambertMaterial;
}

interface Gem {
  group: THREE.Object3D;
  sprite: THREE.Sprite;
  gem: THREE.Mesh;
  face: THREE.MeshLambertMaterial;
}

/**
 * Veden pinnan merkit Modernissa ilmeessä (#650):
 *
 * - roiskerenkaat (`splash-rings`: vieheen molskahdus, kalojen merkit, tärpin
 *   renkaat, lintujen pulahdukset) haalistuvat laajetessaan sen sijaan, että
 *   katoaisivat kerralla; renkaan ikä on pelin (`userData.life`),
 * - vieheen merkki (`lure-marker`) on hiottu timantti pikselikuvan paikalla
 *   samassa koossa ja tilan värissä,
 * - ongen koho (`pole-float`, #570) on sorvattu koho pikselikohon paikalla:
 *   painuessaan se uppoaa veteen, ja ylhäältä se on punainen kiekko.
 *
 * Renkaiden muodon vaihtaa `Softener`. Kaikki palautetaan, kun ilme vaihtuu.
 */
export class Marks {
  private readonly ripples = new Set<THREE.Mesh>();
  private readonly gems = new Map<THREE.Object3D, Gem>();
  private readonly shape = gemShape();
  private readonly rim = new THREE.MeshBasicMaterial({ color: GEM.edge, side: THREE.BackSide });
  private readonly bobs = new Map<THREE.Object3D, Bob>();
  private readonly bobShape = floatShape();
  private readonly bobRim = new THREE.MeshBasicMaterial({ color: BOB.edge, side: THREE.BackSide });
  private frames = 0;

  constructor(private readonly scene: THREE.Scene) {}

  update(camera: THREE.Camera): void {
    if (this.frames++ % SCAN_FRAMES === 0) this.refresh();
    for (const ring of this.ripples) {
      const life = (ring.userData.life as number | undefined) ?? 0;
      (ring.material as THREE.MeshBasicMaterial).opacity =
        RIPPLE_ALPHA * Math.pow(Math.max(0, 1 - life), 1.3);
    }
    for (const gem of this.gems.values()) this.place(gem, camera);
    for (const bob of this.bobs.values()) this.placeBob(bob, camera);
  }

  private refresh(): void {
    const seen = new Set<THREE.Object3D>();
    this.scene.traverse((o) => {
      if (o.name === 'splash-rings') {
        for (const ring of o.children) {
          seen.add(ring);
          if ((ring as THREE.Mesh).isMesh && !this.ripples.has(ring as THREE.Mesh))
            this.fade(ring as THREE.Mesh);
        }
      } else if (o.name === 'lure-marker') {
        seen.add(o);
        if (!this.gems.has(o)) this.fit(o);
      } else if (o.name === 'pole-float') {
        seen.add(o);
        if (!this.bobs.has(o)) this.fitBob(o);
      }
    });
    for (const ring of this.ripples) if (!seen.has(ring)) this.ripples.delete(ring);
    for (const [group, gem] of this.gems) if (!seen.has(group)) this.unfit(gem);
    for (const [group, bob] of this.bobs) if (!seen.has(group)) this.unfitBob(bob);
  }

  private fitBob(group: THREE.Object3D): void {
    const sprite = group.children.find((c): c is THREE.Sprite => (c as THREE.Sprite).isSprite);
    if (!sprite) return;
    const face = paintedMaterial() as THREE.MeshLambertMaterial;
    // Sama väriolio: ylhäältä painunut koho tummuu kuten pikselikohokin.
    face.color = sprite.material.color;
    const bob = new THREE.Mesh(this.bobShape, face);
    const rim = new THREE.Mesh(this.bobShape, this.bobRim);
    rim.scale.set(BOB.rim, 1 + (BOB.rim - 1) * FLOAT_WIDTH, BOB.rim);
    rim.position.y = -(BOB.rim - 1) * FLOAT_WIDTH * 0.5;
    rim.name = ADDED;
    bob.add(rim);
    bob.name = ADDED;
    group.add(bob);
    sprite.visible = false;
    this.bobs.set(group, { group, sprite, bob, face });
  }

  /**
   * Koho kuvan paikalle ja kokoon. Silmin kuva on sivukuva (korkeus 1), ja
   * ankkuri kertoo, kuinka suuri osa siitä on pinnan alla: koho uppoaa saman
   * verran, ja vesi peittää vedenalaisen osan. Ylhäältä kuva on neliö, jonka
   * leveys on kohon leveys.
   */
  private placeBob({ group, sprite, bob }: Bob, camera: THREE.Camera): void {
    const eyes = (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
    let size = sprite.material.sizeAttenuation ? sprite.scale.x / FLOAT_WIDTH : sprite.scale.y;
    if (!sprite.material.sizeAttenuation && eyes)
      size *= -v.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse).z;
    bob.scale.setScalar(Math.max(size, 1e-4));
    bob.position.copy(sprite.position);
    const lie = group.userData.lie as number | null | undefined;
    if (typeof lie === 'number') {
      // Kyljellään (#799): akseli siiman suuntaan, keskikohta kuvan paikalla
      // ja puolet kohosta pinnan alla.
      bob.rotation.set(0, lie, -Math.PI / 2);
      bob.position.x -= Math.cos(lie) * size * 0.5;
      bob.position.z += Math.sin(lie) * size * 0.5;
      return;
    }
    bob.rotation.set(0, 0, 0);
    bob.position.y -= sprite.material.sizeAttenuation ? size * 0.5 : size * sprite.center.y;
  }

  private unfitBob(bob: Bob): void {
    bob.bob.removeFromParent();
    bob.face.dispose();
    bob.sprite.visible = true;
    this.bobs.delete(bob.group);
  }

  /** Rengas läpikuultavaksi. Alfakanava on usvan tiheys, joten siihen ei kirjoiteta. */
  private fade(ring: THREE.Mesh): void {
    veil(ring.material as THREE.Material);
    this.ripples.add(ring);
  }

  private fit(group: THREE.Object3D): void {
    const sprite = group.children.find((c): c is THREE.Sprite => (c as THREE.Sprite).isSprite);
    if (!sprite) return;
    const face = new THREE.MeshLambertMaterial({ flatShading: true });
    // Sama väriolio: timantti vaihtaa väriä vieheen tilan mukana.
    face.color = sprite.material.color;
    const gem = new THREE.Mesh(this.shape, face);
    const rim = new THREE.Mesh(this.shape, this.rim);
    rim.scale.setScalar(GEM.rim);
    rim.name = ADDED;
    gem.add(rim);
    gem.name = ADDED;
    group.add(gem);
    sprite.visible = false;
    this.gems.set(group, { group, sprite, gem, face });
  }

  /** Timantti kuvan paikalle ja kokoon: silmin koko on kuvapisteinä etäisyydestä riippumatta. */
  private place({ sprite, gem, face }: Gem, camera: THREE.Camera): void {
    const eyes = (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
    let size = sprite.scale.x;
    if (!sprite.material.sizeAttenuation && eyes)
      size *= -v.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse).z;
    gem.scale.setScalar(Math.max(size, 1e-4));
    gem.position.copy(sprite.position);
    // Kuvan ankkuri: silmin timantti seisoo pinnalla ja painuu tärpissä sen alle.
    gem.position.y += size * (0.5 - sprite.center.y);
    // Silmin kärki kameraan päin, jolloin ääriviiva on timantti joka suunnasta;
    // ylhäältä kärjet ovat ilmansuunnissa kuten pikselitimantissa.
    v.setFromMatrixPosition(camera.matrixWorld).sub(gem.position);
    gem.rotation.y = eyes ? Math.atan2(v.x, v.z) : 0;
    face.emissive.copy(face.color).multiplyScalar(GEM.glow);
  }

  private unfit(gem: Gem): void {
    gem.gem.removeFromParent();
    gem.face.dispose();
    gem.sprite.visible = true;
    this.gems.delete(gem.group);
  }

  dispose(): void {
    for (const ring of this.ripples) unveil(ring.material as THREE.Material);
    this.ripples.clear();
    for (const gem of [...this.gems.values()]) this.unfit(gem);
    for (const bob of [...this.bobs.values()]) this.unfitBob(bob);
    this.shape.dispose();
    this.rim.dispose();
    this.bobShape.dispose();
    this.bobRim.dispose();
  }
}
