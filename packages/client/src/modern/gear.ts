import * as THREE from 'three';
import { backrestShape, gripShape, padShape, sleeveShape, WRIST } from './gearShapes';
import { paintedMaterial } from './shapes';
import { bakedTransform, SKIP } from './soften';

/** Kohtaus käydään läpi näin monen ruudun välein: uudet pelaajat saavat osansa. */
const SCAN_FRAMES = 20;
/** Lisättyjen osien nimi: pyöristys ja oma läpikäynti ohittavat ne. */
const ADDED = 'modern-gear';

/** Ponttoonin päällinen ja selkänoja: tumma kangas. */
const FABRIC = 0x353c44;
/** Päällisen leveys kehällä (rad), kallistus ulkolaitaan (rad) ja osuus pituudesta. */
const PAD = {
  tube: { span: 1.35, lean: 0, from: 0.1, to: 0.94 },
  pov: { span: 1.3, lean: 0, from: 0.2, to: 0.97 },
} as const;
/** Kyynärpää silmistä kalastajan silmin (m): oikealle, alas ja eteen. */
const ELBOW = { right: 0.36, down: 0.44, ahead: 0.12 } as const;

/** Verkkotason kudos: silmän koko (m) ja kuvan silmät sivullaan. */
const NET = { cell: 0.016, cells: 8, size: 128, ground: '#1c232b', thread: '#566270' } as const;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const w = new THREE.Vector3();
const q = new THREE.Quaternion();
const m3 = new THREE.Matrix3();

/**
 * Kalastajan varusteiden modernit osat (#650). Peli nimeää osansa, ja tämä
 * lisää tai vaihtaa niihin sen, mihin pelkkä pyöristys (`Softener`) ei riitä:
 *
 * - kalastajan silmin veden alla näkyvät sääret ja räpylät (`pov-wet`) sekä
 *   kela (`pov-reel`) valaistaan kuten muukin kohtaus; pelissä ne ovat
 *   tasavärisiä, koska paletti pyöristäisi varjostuksen,
 * - verkkotaso (`pov-net`) saa hienon kudoksen,
 * - ponttoonit (`tube`, `pov-pontoon`) saavat tumman päällisen ja istuin
 *   (`seat`) selkänojan, jotta rengas näyttää samalta omin ja muiden silmin,
 * - kalastajan silmin vapa (`pov-reel`) saa kahvan ja sitä pitävän käden;
 *   hiha on paidan värinen (`pov-tube`n `shirt`).
 *
 * Lisätyt osat ovat kohteensa lapsia, joten ne liikkuvat ja piiloutuvat sen
 * mukana. Kaikki palautetaan, kun ilme vaihtuu.
 */
export class Gear {
  private readonly fitted = new Map<THREE.Object3D, THREE.Mesh | null>();
  private readonly relit = new Map<THREE.Mesh, THREE.Material>();
  private readonly twins = new Map<THREE.Material, THREE.MeshLambertMaterial>();
  private readonly nets = new Map<THREE.Mesh, { map: THREE.Texture; fine: THREE.Texture }>();
  private readonly fabric = new THREE.MeshLambertMaterial({ color: FABRIC });
  private readonly seen = new Set<THREE.Object3D>();
  private weave: THREE.CanvasTexture | null = null;
  /** Vapaa pitävä käsi: kelan kehys, kahva ja nyrkki sekä hiha. */
  private arm: { reel: THREE.Object3D; grip: THREE.Mesh; sleeve: THREE.Mesh } | null = null;
  private readonly skin = paintedMaterial();
  private readonly cloth = new THREE.MeshLambertMaterial({ color: FABRIC });
  private frames = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {}

  update(camera: THREE.Camera): void {
    if (this.frames++ % SCAN_FRAMES === 0) this.refresh();
    this.holdRod(camera);
  }

  private refresh(): void {
    this.seen.clear();
    this.scan(this.scene, false);
    // Kohtauksesta poistuneet osat (lähtenyt pelaaja) unohdetaan.
    for (const [target, added] of this.fitted)
      if (!this.seen.has(target)) this.unfit(target, added);
    for (const [mesh, material] of this.relit)
      if (!this.seen.has(mesh)) {
        mesh.material = material;
        this.relit.delete(mesh);
      }
    if (this.arm && !this.seen.has(this.arm.reel)) this.dropArm();
  }

  /** Käsi seuraa vapaa: nyrkki kelan kehyksessä, hiha kyynärpäästä ranteeseen. */
  private holdRod(camera: THREE.Camera): void {
    const arm = this.arm;
    if (!arm) return;
    const { reel, grip, sleeve } = arm;
    const parent = reel.parent;
    if (!parent || !(camera instanceof THREE.PerspectiveCamera)) return;
    grip.position.copy(reel.position);
    grip.quaternion.copy(reel.quaternion);
    // Kyynärpää pysyy vartalon vieressä silmien alla katseen suunnasta riippumatta.
    camera.getWorldDirection(v).setY(0).normalize();
    w.crossVectors(v, Y_AXIS);
    const elbow = sleeve.position
      .setFromMatrixPosition(camera.matrixWorld)
      .addScaledVector(w, ELBOW.right)
      .addScaledVector(v, ELBOW.ahead);
    elbow.y -= ELBOW.down;
    parent.worldToLocal(elbow);
    v.copy(WRIST).applyQuaternion(reel.quaternion).add(reel.position).sub(elbow);
    sleeve.scale.y = v.length();
    sleeve.quaternion.setFromUnitVectors(Y_AXIS, v.normalize());
  }

  private fitArm(reel: THREE.Object3D): void {
    if (!reel.parent) return;
    const grip = new THREE.Mesh(gripShape(), this.skin);
    const sleeve = new THREE.Mesh(sleeveShape(), this.cloth);
    grip.name = sleeve.name = ADDED;
    reel.parent.add(grip, sleeve);
    this.arm = { reel, grip, sleeve };
  }

  private dropArm(): void {
    const arm = this.arm;
    if (!arm) return;
    for (const mesh of [arm.grip, arm.sleeve]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.arm = null;
  }

  private scan(o: THREE.Object3D, reel: boolean, own = false): void {
    if (SKIP.test(o.name)) return;
    const inReel = reel || o.name === 'pov-reel';
    const inOwn = own || o.name === 'pov-tube';
    if (o.name === 'pov-reel') {
      this.seen.add(o);
      if (!this.arm) this.fitArm(o);
    }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      this.seen.add(mesh);
      if (inReel || o.name === 'pov-wet') this.relight(mesh);
      // Hiha oman paidan väriseksi: sama väriolio seuraa värin vaihtoa.
      if (inOwn && o.name === 'shirt' && !Array.isArray(mesh.material))
        this.cloth.color = (mesh.material as THREE.MeshLambertMaterial).color;
      if (o.name === 'pov-net') this.weaveNet(mesh);
      if (!this.fitted.has(mesh)) {
        const added = this.fitting(mesh);
        if (added !== undefined) {
          this.fitted.set(mesh, added);
          if (added) mesh.add(added);
        }
      }
    }
    for (const child of o.children) this.scan(child, inReel, inOwn);
  }

  /** Tasavärinen osa valaistuksi: sama väri (jaettu), sama piirtojärjestys. */
  private relight(mesh: THREE.Mesh): void {
    const material = mesh.material;
    if (Array.isArray(material) || !(material instanceof THREE.MeshBasicMaterial)) return;
    if (material.map || material.transparent) return;
    let twin = this.twins.get(material);
    if (!twin) {
      twin = new THREE.MeshLambertMaterial({ depthTest: material.depthTest });
      // Peli vaihtaa väriä (veden kirkkaus, siiman väri): sama väriolio seuraa mukana.
      twin.color = material.color;
      this.twins.set(material, twin);
    }
    this.relit.set(mesh, material);
    mesh.material = twin;
  }

  private weaveNet(mesh: THREE.Mesh): void {
    if (this.nets.has(mesh)) return;
    const material = mesh.material as THREE.MeshLambertMaterial;
    const map = material.map;
    const plane = (mesh.geometry as THREE.PlaneGeometry).parameters;
    if (!map || !plane) return;
    const fine = this.weaveTexture()?.clone();
    if (!fine) return;
    const tile = NET.cell * NET.cells;
    fine.repeat.set(plane.width / tile, plane.height / tile);
    fine.needsUpdate = true;
    material.map = fine;
    this.nets.set(mesh, { map, fine });
  }

  private weaveTexture(): THREE.CanvasTexture | null {
    if (this.weave) return this.weave;
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = NET.size;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.fillStyle = NET.ground;
    g.fillRect(0, 0, NET.size, NET.size);
    g.fillStyle = NET.thread;
    const step = NET.size / NET.cells;
    for (let i = 0; i < NET.cells; i++) {
      g.fillRect(i * step, 0, 2, NET.size);
      g.fillRect(0, i * step, NET.size, 2);
    }
    const weave = new THREE.CanvasTexture(canvas);
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.weave = weave;
    return weave;
  }

  /** Osaan lisättävä kappale; null = ei lisättävää, undefined = ei vielä tiedossa. */
  private fitting(mesh: THREE.Mesh): THREE.Mesh | null | undefined {
    if (mesh.name === 'seat') {
      mesh.geometry.computeBoundingBox();
      const { min, max } = mesh.geometry.boundingBox!;
      const rest = this.added(backrestShape((max.z - min.z) * 0.92));
      rest.position.set(min.x + (max.x - min.x) * 0.3, max.y, (min.z + max.z) / 2);
      return rest;
    }
    const pov = mesh.name === 'pov-pontoon';
    if (!pov && mesh.name !== 'tube') return undefined;
    // Vain ponttoonin suora kylki; peli muotoilee täyttökisan rengasta itse (`reshape`).
    if (mesh.geometry.type !== 'CylinderGeometry' || mesh.userData.reshape) return null;
    const baked = bakedTransform(mesh.geometry);
    if (!baked) return null;
    const { radiusTop, height } = (mesh.geometry as THREE.CylinderGeometry).parameters;
    const pad = pov ? PAD.pov : PAD.tube;
    // Ylös ja ulkolaitaan lieriön omassa kehyksessä (akseli y, kehän kulma x:stä z:aan).
    const local = m3.setFromMatrix4(baked).invert();
    q.copy(mesh.quaternion).invert();
    mesh.geometry.computeBoundingBox();
    const side = Math.sign(
      mesh.geometry.boundingBox!.getCenter(v).applyQuaternion(mesh.quaternion).add(mesh.position).z,
    );
    v.set(0, Math.cos(pad.lean), Math.sin(pad.lean) * side)
      .applyQuaternion(q)
      .applyMatrix3(local);
    const shape = padShape(radiusTop, height, Math.atan2(v.x, v.z), pad.span, pad.from, pad.to);
    return this.added(shape.applyMatrix4(baked));
  }

  private added(geometry: THREE.BufferGeometry): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.fabric);
    mesh.name = ADDED;
    return mesh;
  }

  private unfit(target: THREE.Object3D, added: THREE.Mesh | null): void {
    if (added) {
      target.remove(added);
      added.geometry.dispose();
    }
    this.fitted.delete(target);
  }

  dispose(): void {
    for (const [target, added] of this.fitted) this.unfit(target, added);
    for (const [mesh, material] of this.relit) mesh.material = material;
    this.relit.clear();
    for (const twin of this.twins.values()) twin.dispose();
    this.twins.clear();
    for (const [mesh, { map, fine }] of this.nets) {
      (mesh.material as THREE.MeshLambertMaterial).map = map;
      fine.dispose();
    }
    this.nets.clear();
    this.weave?.dispose();
    this.weave = null;
    this.dropArm();
    this.fabric.dispose();
    this.skin.dispose();
    this.cloth.dispose();
  }
}
