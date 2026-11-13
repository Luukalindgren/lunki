import * as THREE from 'three';
import type { SpeciesId } from '@lunki/shared';
import type { LandedFishPose } from '../game/landingView';
import { fishShape } from './fishShape';
import { paintedMaterial } from './shapes';

/** Kohtaus käydään läpi näin monen ruudun välein. */
const SCAN_FRAMES = 20;
/** Lisättyjen osien nimi: pyöristys ohittaa ne. */
const ADDED = 'modern-landing';

/** Haavin kehän ja varren paksuus (m) sekä pussin langat. */
const NET = { rim: 0.014, handle: 0.012, meridians: 16, hoops: 3 } as const;

/** Pinnassa lepäävän kalan kallistus pystystä kalastajan silmin (rad). */
const LEAN = 1.1;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const w = new THREE.Vector3();
const turn = new THREE.Quaternion();
const roll = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface Fitted {
  group: THREE.Object3D;
  sprite: THREE.Sprite;
  fish: THREE.Mesh;
  species: SpeciesId | null;
  net: {
    target: THREE.Object3D;
    hidden: THREE.Object3D[];
    added: THREE.Object3D[];
    handle: THREE.Mesh;
    line: THREE.Line;
  } | null;
}

/**
 * Nosto Modernissa ilmeessä (#650): pelin nostonäkymä (`landing`) piirtää
 * kalan pikselikuvana ja haavin viivoina. Tämä piirtää kuvan tilalle lajin
 * mallin (`fishShape`) samaan paikkaan, kokoon ja asentoon ja tekee haavista
 * kehän, pussin ja varren. Liike on pelin: malli seuraa kuvaa joka ruudulla.
 */
export class Landing {
  private readonly fitted = new Map<THREE.Object3D, Fitted>();
  private readonly shapes = new Map<SpeciesId, THREE.BufferGeometry>();
  private readonly skin = paintedMaterial({ side: THREE.DoubleSide });
  private readonly frame = new THREE.MeshLambertMaterial();
  private readonly mesh = new THREE.LineBasicMaterial();
  private frames = 0;

  constructor(private readonly scene: THREE.Scene) {}

  update(camera: THREE.Camera): void {
    if (this.frames++ % SCAN_FRAMES === 0) this.refresh();
    for (const f of this.fitted.values()) {
      this.pose(f, camera);
      if (f.net) this.holdNet(f.net);
    }
  }

  private refresh(): void {
    const seen = new Set<THREE.Object3D>();
    this.scene.traverse((o) => {
      if (o.name !== 'landing') return;
      seen.add(o);
      if (!this.fitted.has(o)) this.fit(o);
    });
    for (const [group, f] of this.fitted) if (!seen.has(group)) this.unfit(f);
  }

  private fit(group: THREE.Object3D): void {
    const sprite = group.children.find((c): c is THREE.Sprite => (c as THREE.Sprite).isSprite);
    if (!sprite) return;
    const fish = new THREE.Mesh(new THREE.BufferGeometry(), this.skin);
    fish.name = ADDED;
    fish.visible = false;
    group.add(fish);
    const target = group.children.find((c) => c.name === 'landing-net');
    this.fitted.set(group, {
      group,
      sprite,
      fish,
      species: null,
      net: target ? this.fitNet(target) : null,
    });
  }

  /** Haavi: pelin viivat piiloon ja tilalle kehä, tiheämpi pussi ja varsi. */
  private fitNet(target: THREE.Object3D): Fitted['net'] {
    const [ring, bag] = target.children as THREE.LineSegments[];
    const line = target.userData.handle as THREE.Line | undefined;
    if (!ring || !bag || !line) return null;
    ring.geometry.computeBoundingSphere();
    bag.geometry.computeBoundingBox();
    const hoop = ring.geometry.boundingSphere!.radius;
    const depth = -bag.geometry.boundingBox!.min.y;
    this.frame.color.copy((ring.material as THREE.LineBasicMaterial).color);
    this.mesh.color.copy((bag.material as THREE.LineBasicMaterial).color);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(hoop, NET.rim, 8, 40), this.frame);
    rim.rotation.x = Math.PI / 2;
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(NET.handle, NET.handle, 1, 8).translate(0, 0.5, 0),
      this.frame,
    );
    const web = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(netWeb(hoop, depth)),
      this.mesh,
    );
    const added = [rim, handle, web];
    for (const o of added) o.name = ADDED;
    const hidden = [ring, bag, line].filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    target.add(...added);
    return { target, hidden, added, handle, line };
  }

  /** Varsi kehän takareunasta käteen: päätepisteet pelin varsiviivasta. */
  private holdNet(net: NonNullable<Fitted['net']>): void {
    const p = net.line.geometry.getAttribute('position');
    v.fromBufferAttribute(p, 0);
    w.fromBufferAttribute(p, 1).sub(v);
    const length = w.length();
    if (length < 1e-6) return;
    net.handle.position.copy(v);
    net.handle.scale.set(1, length, 1);
    net.handle.quaternion.setFromUnitVectors(Y_AXIS, w.divideScalar(length));
  }

  private pose(f: Fitted, camera: THREE.Camera): void {
    const pose = f.sprite.userData.fish as LandedFishPose | null | undefined;
    f.fish.visible = !!pose;
    if (!pose) return;
    f.sprite.visible = false;
    if (f.species !== pose.species) {
      f.species = pose.species;
      f.fish.geometry = this.shape(pose.species);
    }
    f.fish.position.copy(f.sprite.position);
    f.fish.scale.setScalar(f.sprite.scale.x);
    fishTurn(f.fish.quaternion, pose, f.fish.position, camera);
  }

  private shape(species: SpeciesId): THREE.BufferGeometry {
    let shape = this.shapes.get(species);
    if (!shape) this.shapes.set(species, (shape = fishShape(species)));
    return shape;
  }

  private unfit(f: Fitted): void {
    f.fish.removeFromParent();
    f.sprite.visible = !!f.sprite.userData.fish;
    if (f.net) {
      for (const o of f.net.added) {
        o.removeFromParent();
        (o as THREE.Mesh).geometry.dispose();
      }
      for (const o of f.net.hidden) o.visible = true;
    }
    this.fitted.delete(f.group);
  }

  dispose(): void {
    for (const f of [...this.fitted.values()]) this.unfit(f);
    for (const shape of this.shapes.values()) shape.dispose();
    this.shapes.clear();
    this.skin.dispose();
    this.frame.dispose();
    this.mesh.dispose();
  }
}

/**
 * Kalan asento: kyljellään kuono kulkusuuntaan (pinnassa, haavissa ja
 * ylhäältä) tai siimassa roikkuen pää ylöspäin kylki kameraan päin.
 */
export function fishTurn(
  out: THREE.Quaternion,
  pose: LandedFishPose,
  at: THREE.Vector3,
  camera: THREE.Camera,
): THREE.Quaternion {
  v.setFromMatrixPosition(camera.matrixWorld).sub(at);
  if (pose.hang < 0.5) {
    const yaw = pose.heading + pose.wiggle;
    out.setFromAxisAngle(Y_AXIS, yaw);
    // Ylhäältä kala on aivan kyljellään kuten pikselikuvassa. Silmin se
    // kallistuu kylki katsojaan päin, ettei matalalta näy pelkkä ohut viiva.
    if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera)
      return out.multiply(roll.setFromAxisAngle(X_AXIS, Math.PI / 2));
    const facing = v.x * Math.sin(yaw) + v.z * Math.cos(yaw) > 0;
    return out.multiply(roll.setFromAxisAngle(X_AXIS, facing ? -LEAN : LEAN));
  }
  out.setFromAxisAngle(Y_AXIS, Math.atan2(v.x, v.z));
  return out.multiply(turn.setFromAxisAngle(Z_AXIS, Math.PI / 2 + pose.wiggle));
}

/** Pussin langat: pituuslangat kehältä pohjaan ja muutama vannelanka. */
function netWeb(hoop: number, depth: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  // Pussi kapenee pohjaa kohti pyöreästi.
  const at = (angle: number, k: number) => {
    const r = hoop * (1 - 0.75 * k * k);
    return new THREE.Vector3(
      Math.cos(angle) * r,
      -depth * Math.sin((k * Math.PI) / 2),
      Math.sin(angle) * r,
    );
  };
  const steps = 6;
  for (let i = 0; i < NET.meridians; i++) {
    const angle = (i / NET.meridians) * Math.PI * 2;
    for (let s = 0; s < steps; s++) points.push(at(angle, s / steps), at(angle, (s + 1) / steps));
  }
  const around = 24;
  for (let h = 1; h <= NET.hoops; h++) {
    const k = h / NET.hoops;
    for (let i = 0; i < around; i++)
      points.push(at((i / around) * Math.PI * 2, k), at(((i + 1) / around) * Math.PI * 2, k));
  }
  return points;
}
