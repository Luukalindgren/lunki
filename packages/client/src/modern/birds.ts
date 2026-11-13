import * as THREE from 'three';
import type { BirdKind, BirdPose } from '../game/birdPose';
import { flies, floats, flyShape, swimShape, wingRoot, wingShape } from './birdShapes';
import { fishShape } from './fishShape';
import { paintedMaterial } from './shapes';

/** Kohtaus käydään läpi näin monen ruudun välein. */
const SCAN_FRAMES = 20;
/** Lisättyjen osien nimi: pyöristys ohittaa ne. */
const ADDED = 'modern-birds';
/** Siiven lyönnin laajuus (rad) ja siipien lepokulma ylöspäin. */
const FLAP = 0.62;
const DIHEDRAL = 0.12;
/** Kalasääsken kynsissä oleva kala: pituus (m) ja paikka ruumiin alla. */
const PREY = { length: 0.3, below: 0.13 } as const;

interface Model {
  root: THREE.Group;
  wings: [THREE.Mesh, THREE.Mesh] | null;
  prey: THREE.Mesh | null;
}

interface Flock {
  group: THREE.Object3D;
  holder: THREE.Group;
  pools: Map<string, { models: Model[]; used: number }>;
}

/**
 * Linnut Modernissa ilmeessä (#650): peli piirtää jokaisen linnun
 * pikselikuvana ja kertoo sen asennon (`userData.bird`, `userData.grow`).
 * Tämä piirtää kuvan tilalle maalatun mallin samaan paikkaan, kokoon ja
 * suuntaan: uiva lintu istuu vedessä, lentävän siivet lyövät pelin tahdissa.
 * Linnut ovat valaistuja pintoja, joten ne saavat varjot muun kohtauksen tapaan.
 */
export class Birds {
  private readonly flocks = new Map<THREE.Object3D, Flock>();
  private readonly shapes = new Map<string, THREE.BufferGeometry>();
  private readonly paint = paintedMaterial();
  private readonly scales = paintedMaterial({ side: THREE.DoubleSide });
  private frames = 0;

  constructor(private readonly scene: THREE.Scene) {}

  update(): void {
    if (this.frames++ % SCAN_FRAMES === 0) this.refresh();
    for (const flock of this.flocks.values()) this.draw(flock);
  }

  private refresh(): void {
    const seen = new Set<THREE.Object3D>();
    this.scene.traverse((o) => {
      if (o.name !== 'birds') return;
      seen.add(o);
      if (this.flocks.has(o)) return;
      const holder = new THREE.Group();
      holder.name = ADDED;
      o.add(holder);
      this.flocks.set(o, { group: o, holder, pools: new Map() });
    });
    for (const [group, flock] of this.flocks) if (!seen.has(group)) this.drop(flock);
  }

  private draw(flock: Flock): void {
    for (const pool of flock.pools.values()) pool.used = 0;
    for (const sprite of flock.group.children) {
      const pose = sprite.userData.bird as BirdPose | null | undefined;
      if (!pose) continue;
      sprite.visible = false;
      const flying = flies(pose.kind) && (pose.flying || !floats(pose.kind));
      const model = this.take(flock, pose.kind, flying);
      model.root.visible = true;
      model.root.position.copy(sprite.position);
      model.root.rotation.y = pose.heading;
      model.root.scale.setScalar((sprite.userData.grow as number | undefined) ?? 1);
      if (model.wings) {
        // Vedessä kalan päällä (kalasääski) siivet ovat koholla.
        const lift = pose.flying
          ? DIHEDRAL + FLAP * Math.sin(pose.flap * Math.PI * 2)
          : DIHEDRAL + FLAP * 0.8;
        model.wings[0].rotation.x = -lift;
        model.wings[1].rotation.x = lift;
      }
      if (model.prey) model.prey.visible = pose.carrying === true;
    }
    for (const pool of flock.pools.values())
      for (let i = pool.used; i < pool.models.length; i++) pool.models[i]!.root.visible = false;
  }

  private take(flock: Flock, kind: BirdKind, flying: boolean): Model {
    const key = `${kind}:${flying ? 'fly' : 'swim'}`;
    let pool = flock.pools.get(key);
    if (!pool) flock.pools.set(key, (pool = { models: [], used: 0 }));
    let model = pool.models[pool.used];
    if (!model) {
      model = this.build(kind, flying);
      flock.holder.add(model.root);
      pool.models.push(model);
    }
    pool.used++;
    return model;
  }

  private build(kind: BirdKind, flying: boolean): Model {
    const root = new THREE.Group();
    if (!flying) {
      root.add(
        new THREE.Mesh(
          this.shape(`${kind}:swim`, () => swimShape(kind)),
          this.paint,
        ),
      );
      return { root, wings: null, prey: null };
    }
    root.add(
      new THREE.Mesh(
        this.shape(`${kind}:fly`, () => flyShape(kind)),
        this.paint,
      ),
    );
    const wing = this.shape(`${kind}:wing`, () => wingShape(kind));
    const at = wingRoot(kind);
    const right = new THREE.Mesh(wing, this.paint);
    right.position.copy(at);
    // Vasen siipi on oikean peilikuva.
    const left = new THREE.Mesh(wing, this.paint);
    left.position.set(at.x, at.y, -at.z);
    left.scale.z = -1;
    root.add(right, left);
    let prey: THREE.Mesh | null = null;
    if (kind === 'osprey') {
      prey = new THREE.Mesh(
        this.shape('prey', () => fishShape('roach')),
        this.scales,
      );
      prey.position.y = -PREY.below;
      prey.scale.setScalar(PREY.length);
      prey.visible = false;
      root.add(prey);
    }
    return { root, wings: [right, left], prey };
  }

  private shape(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let shape = this.shapes.get(key);
    if (!shape) this.shapes.set(key, (shape = make()));
    return shape;
  }

  private drop(flock: Flock): void {
    flock.holder.removeFromParent();
    // Peli näyttää kuvat taas itse.
    for (const sprite of flock.group.children)
      if ((sprite as THREE.Sprite).isSprite) sprite.visible = !!sprite.userData.bird;
    this.flocks.delete(flock.group);
  }

  dispose(): void {
    for (const flock of [...this.flocks.values()]) this.drop(flock);
    for (const shape of this.shapes.values()) shape.dispose();
    this.shapes.clear();
    this.paint.dispose();
    this.scales.dispose();
  }
}
