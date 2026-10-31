import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE,
  inflateSequence,
  type Appearance,
  type InflateState,
  type ShoreState,
  type Vec2,
} from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import type { BailPose } from '../net/netWorld';
import {
  PONTOON_TIP,
  SEAT,
  TUBE_CENTER,
  TUBE_LIFT,
  applyAppearance,
  createTubeMesh,
} from './tubeMesh';
import { playerColorMaterial } from './playerColor';
import { groundRest } from './groundRest';

/** Seisovan kalastajan jalkojen pituus: renkaan kalastajan yläruumis nousee tämän verran. */
const LEG = 0.82;
/**
 * Rengas kannetaan reppuna (Luuka): istuin selkää vasten, U:n kärjet alaspäin
 * ja takakaari pään yläpuolella. Renkaan keskipiste kalastajan takana (m)
 * ja maanpinnasta.
 */
const CARRY = { back: 0.24, height: 1.0 } as const;
/** Renkaan omat akselit reppuna kalastajan koordinaateissa: kärjet (+x) alas, yläpinta (+y) taakse. */
const CARRY_BASIS = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ),
);
/** Kyytiin hypätessä rengas otetaan selästä ja lasketaan veteen tämän osan aikana hypystä. */
const UNSLING = 0.4;
/** Maassa lepäävän renkaan ulottuma rinteen lukemiseen (m eteen/taakse ja sivuille). */
const TUBE_REACH = { length: TUBE_CENTER, width: TUBE_CENTER } as const;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Seisovan silmän korkeus POV:ssa (m maanpinnasta). */
export const STANDING_EYE = 1.6;
/** Tyhjän ponttoonin litteys (osuus täydestä korkeudesta). */
const FLAT = 0.2;
/** Äyskäröijä kumartuu kauhaistessa (m). */
const BAIL_DIP = 0.25;
/** Tyhjän puoliskon leveneminen (osuus paksuudesta). */
const SPREAD = 0.6;
/** Käsipumppu kalastajan edessä (m) ja kahvan liike (#458). */
const PUMP = { ahead: 0.45, barrel: 0.55, rodLow: 0.62, rodHigh: 0.98, dip: 0.18 } as const;
/** Ponttoonien venttiilit renkaan omissa koordinaateissa (katse +x). */
const VALVES: readonly Vec2[] = [
  { x: PONTOON_TIP * 0.5, y: -TUBE_CENTER },
  { x: PONTOON_TIP * 0.5, y: TUBE_CENTER },
  { x: SEAT.x, y: 0 },
];

/** Maalla olevan kalastajan asento piirtohetkellä (#457). */
export interface AshorePose {
  /** Kalastajan paikka ja katse. */
  pos: Vec2;
  heading: number;
  /** Askelvaihe 0–1 (kävellessä). */
  step: number;
  shore: ShoreState;
}

/**
 * Maalla seisova kalastaja ja rengas maassa tai vyötäröllä (#457). Kalastaja
 * on renkaan kalastajan yläruumis jaloilla (ilman vapaa), rengas sama
 * U-rengas ilman kalastajaa. Kyytiin hypätessä kalastaja liukuu takaperin
 * veteen laskettuun renkaaseen ja painuu istumaan.
 */
export class AshoreFigure {
  readonly group = new THREE.Group();
  private readonly angler = new THREE.Group();
  private readonly tube = new THREE.Group();
  private readonly legs: THREE.Object3D[] = [];
  private readonly finMat: THREE.MeshLambertMaterial;
  /** Renkaan putken osat ponttooneittain (tyhjänä litteä, #458). */
  private readonly pontoons: THREE.Mesh[][] = [[], [], []];
  /** Seisova käsipumppu: jalusta ja sylinteri sekä liikkuva kahva. */
  private readonly pump = new THREE.Group();
  private readonly pumpRod = new THREE.Group();
  private readonly hose: THREE.Line;
  /** Äyskäröinnin kauha kädessä (#458). */
  private readonly scoop: THREE.Mesh;

  constructor(appearance: Appearance = DEFAULT_APPEARANCE) {
    const src = createTubeMesh(appearance);
    for (const c of [...src.children]) {
      if (c.name === 'tube' || c.name === 'seat' || c.name === 'apron') {
        this.tube.add(c);
        const k = c.userData.pontoon as number | undefined;
        if (k !== undefined) {
          const m = c as THREE.Mesh;
          // Puoliskon kärjet muistiin: tyhjänä se lässähtää keskilinjansa ympäriltä leveäksi.
          if (k < 2) m.userData.deflate = deflateBase(m.geometry, k === 0 ? -1 : 1);
          this.pontoons[k]!.push(m);
        }
      } else if (c.name === 'leg' || c.name === 'fin' || c.name === 'rod' || c.userData.seated)
        continue;
      else {
        c.position.y += LEG;
        this.angler.add(c);
      }
    }
    const legMat = new THREE.MeshLambertMaterial({ color: 0x3b4630 });
    this.finMat = playerColorMaterial(appearance.fins);
    for (const z of [-0.14, 0.14]) {
      const leg = new THREE.Group();
      leg.position.set(0, LEG, z);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, LEG, 0.17), legMat);
      thigh.position.y = -LEG / 2;
      // Räpylät ovat kädessä tai jalassa: maalla kengät räpylöiden värisinä.
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.18), this.finMat);
      boot.name = 'fin';
      boot.position.set(0.06, -LEG + 0.04, 0);
      leg.add(thigh, boot);
      this.legs.push(leg);
      this.angler.add(leg);
    }
    this.hose = buildPump(this.pump, this.pumpRod);
    this.scoop = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.12, 0.18),
      new THREE.MeshLambertMaterial({ color: 0x4f6f86 }),
    );
    this.scoop.visible = false;
    this.angler.add(this.scoop);
    this.group.add(this.angler, this.tube, this.pump, this.hose);
    this.group.visible = false;
  }

  /** Värit vaihtuivat (aulan valinta). */
  recolor(a: Appearance): void {
    applyAppearance(this.angler, a);
    applyAppearance(this.tube, a);
  }

  /** Piirtää asennon; `heightAt` antaa maanpinnan (POV:ssa maasto, ylhäältä 0). */
  update(p: AshorePose, heightAt: (p: Vec2) => number): void {
    this.group.visible = true;
    this.tube.visible = true;
    this.scoop.visible = false;
    const s = p.shore;
    // Kyytiin hypätessä kalastaja kulkee takaperin renkaaseen ja istuu.
    const k = s.board ?? 0;
    const ease = k * k * (3 - 2 * k);
    const at = {
      x: p.pos.x + (s.tube.x - p.pos.x) * ease,
      y: p.pos.y + (s.tube.y - p.pos.y) * ease,
    };
    const ground = Math.max(0, heightAt(at)) * (1 - ease);
    this.angler.position.copy(toWorld(at, ground - LEG * ease));
    this.angler.rotation.y = s.board !== undefined ? s.tubeHeading : p.heading;
    const swing = s.board !== undefined ? 0 : Math.sin(p.step * Math.PI * 2) * 0.45;
    this.legs.forEach((leg, i) => (leg.rotation.z = i === 0 ? swing : -swing));
    if (s.carrying) this.carry(p.pos, p.heading, heightAt);
    else if (s.board === undefined) {
      // Maassa rengas myötäilee rinnettä eikä uppoa ylärinteen puolelta.
      const rest = groundRest(s.tube, s.tubeHeading, heightAt, TUBE_REACH);
      this.tube.position.copy(toWorld(s.tube, rest.lift));
      this.tube.quaternion.copy(rest.quaternion);
    } else {
      // Hypyn alussa rengas otetaan selästä ja lasketaan veteen kalastajan taakse.
      const u = Math.min(1, s.board / UNSLING);
      const swing = u * u * (3 - 2 * u);
      this.carry(p.pos, s.tubeHeading, heightAt);
      const from = this.tube.position.clone();
      const fromQ = this.tube.quaternion.clone();
      const to = toWorld(s.tube, 0);
      this.tube.position.lerpVectors(from, to, swing);
      this.tube.position.y += Math.sin(swing * Math.PI) * 0.3;
      this.tube.quaternion.slerpQuaternions(
        fromQ,
        new THREE.Quaternion().setFromAxisAngle(Y_AXIS, s.tubeHeading),
        swing,
      );
    }
    this.inflate(p, s.inflate, heightAt);
  }

  /** Rengas reppuna kalastajan selässä (paikka ja katse). */
  private carry(pos: Vec2, heading: number, heightAt: (p: Vec2) => number): void {
    const back = {
      x: pos.x - Math.cos(heading) * CARRY.back,
      y: pos.y - Math.sin(heading) * CARRY.back,
    };
    this.tube.position.copy(toWorld(back, Math.max(0, heightAt(pos)) + CARRY.height));
    this.tube.quaternion.setFromAxisAngle(Y_AXIS, heading).multiply(CARRY_BASIS);
  }

  /**
   * Täyttökisa (#458): ponttoonit täytön mukaan, pumppu kalastajan edessä,
   * kahva vedon mukaan ja letku venttiiliin (siirrossa matkalla seuraavaan).
   */
  private inflate(p: AshorePose, f: InflateState | undefined, heightAt: (p: Vec2) => number) {
    this.pontoons.forEach((parts, i) => {
      const k = f ? FLAT + (1 - FLAT) * f.fill[i]! : 1;
      for (const m of parts) {
        // Ylhäältäkin näkyy: tyhjä puolisko on litteä ja leveä, istuin litteä.
        if (i < 2) deflate(m, k);
        else m.scale.y = k;
      }
    });
    this.pump.visible = this.hose.visible = !!f;
    if (!f) return;
    const dir = { x: Math.cos(p.heading), y: Math.sin(p.heading) };
    const at = { x: p.pos.x + dir.x * PUMP.ahead, y: p.pos.y + dir.y * PUMP.ahead };
    const ground = Math.max(0, heightAt(at));
    this.pump.position.copy(toWorld(at, ground));
    this.pump.rotation.y = p.heading;
    this.pumpRod.position.y = PUMP.rodLow + (PUMP.rodHigh - PUMP.rodLow) * f.handle;
    // Kalastaja painaa kahvaa: vartalo notkahtaa vedon mukana.
    this.angler.position.y -= PUMP.dip * (1 - f.handle);
    const valve = (k: number): THREE.Vector3 => {
      const v = VALVES[Math.min(2, k)]!;
      // Renkaan suunta ja rinteen kallistus: paikallinen (x, z) maailmaan.
      return new THREE.Vector3(v.x, TUBE_LIFT * 0.5, v.y)
        .applyQuaternion(this.tube.quaternion)
        .add(this.tube.position);
    };
    let end = valve(f.valve);
    if (f.moving !== null) {
      const share = (f.moving + 0.5) / (inflateSequence(f.seed, f.valve).length + 1);
      end = end.lerp(valve(f.valve + 1), share);
    }
    const start = this.pump.position.clone().setY(this.pump.position.y + 0.05);
    const mid = start
      .clone()
      .lerp(end, 0.5)
      .setY(Math.min(start.y, end.y) + 0.02);
    const pos = this.hose.geometry.getAttribute('position') as THREE.BufferAttribute;
    [start, mid, end].forEach((v, i) => pos.setXYZ(i, v.x, v.y, v.z));
    pos.needsUpdate = true;
  }

  /**
   * Äyskäröijä rannalla olevan veneen vieressä (#458): ilman rengasta, kauha
   * kädessä. Kalastaja kumartuu kauhaisemaan ja nousee kauhan palatessa.
   */
  updateBailer(p: BailPose, heightAt: (p: Vec2) => number): void {
    this.group.visible = true;
    this.tube.visible = this.pump.visible = this.hose.visible = false;
    this.scoop.visible = true;
    this.angler.position.copy(
      toWorld(p.pos, Math.max(0, heightAt(p.pos)) - BAIL_DIP * (1 - p.handle)),
    );
    this.angler.rotation.y = p.heading;
    this.legs.forEach((leg) => (leg.rotation.z = 0));
    // Kauha veneen laidan yli: alhaalla kauhaistessa, ylhäällä heittäessä.
    this.scoop.position.set(0.55, 0.55 + 0.35 * p.handle, 0.2);
  }

  /** Kalastajan oma vartalo piiloon omin silmin (POV); rengas näkyy silti. */
  showAngler(show: boolean): void {
    this.angler.visible = show;
  }

  hide(): void {
    this.group.visible = false;
  }

  /** Kalastajan pää näkymän kiinnityskohdaksi (nimilappu). */
  get anchor(): THREE.Object3D {
    return this.angler;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
  }
}

/** Tyhjän puoliskon kärjet: alkuperäinen paikka ja lähin kohta putken keskilinjalla. */
interface DeflateBase {
  base: Float32Array;
  center: Float32Array;
  /** Viimeksi piirretty täyttö (ei turhia päivityksiä). */
  k: number;
}

/**
 * Kärkien keskilinja U:n puoliskossa (`side` -1 vasen, 1 oikea): takakaaren
 * osalla lähin kohta kaarella, kyljessä ja kärjessä kyljen akselilla.
 */
function deflateBase(geometry: THREE.BufferGeometry, side: number): DeflateBase {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const base = new Float32Array(pos.array as ArrayLike<number>);
  const center = new Float32Array(base.length);
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3]!;
    const z = base[i * 3 + 2]!;
    if (x < 0) {
      const l = Math.hypot(x, z) || 1;
      center[i * 3] = (x / l) * TUBE_CENTER;
      center[i * 3 + 2] = (z / l) * TUBE_CENTER;
    } else {
      center[i * 3] = Math.min(x, PONTOON_TIP);
      center[i * 3 + 2] = side * TUBE_CENTER;
    }
  }
  return { base, center, k: 1 };
}

/**
 * Puolisko täytön `k` mukaan (FLAT … 1): putki litistyy keskilinjansa
 * ympäriltä matalaksi ja leveäksi ja painuu maahan.
 */
function deflate(m: THREE.Mesh, k: number): void {
  const d = m.userData.deflate as DeflateBase;
  m.position.y = TUBE_LIFT * k;
  if (d.k === k) return;
  d.k = k;
  const spread = 1 + (1 - k) * SPREAD;
  const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const j = i * 3;
    const cx = d.center[j]!;
    const cz = d.center[j + 2]!;
    pos.setXYZ(
      i,
      cx + (d.base[j]! - cx) * spread,
      d.base[j + 1]! * k,
      cz + (d.base[j + 2]! - cz) * spread,
    );
  }
  pos.needsUpdate = true;
  m.geometry.computeBoundingSphere();
}

/**
 * Seisova käsipumppu (#458): jalusta painemittareineen, sylinteri ja
 * T-kahva tankoineen (`rod` liikkuu pystysuunnassa). Palauttaa letkun.
 */
function buildPump(pump: THREE.Group, rod: THREE.Group): THREE.Line {
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c232b });
  const barrelMat = new THREE.MeshLambertMaterial({ color: 0x4f6f86 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.34), dark);
  base.position.y = 0.015;
  const gauge = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.06),
    new THREE.MeshLambertMaterial({ color: 0xeef2f3 }),
  );
  gauge.position.set(0.07, 0.06, 0);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, PUMP.barrel, 6), barrelMat);
  barrel.position.y = PUMP.barrel / 2 + 0.03;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.02), dark);
  shaft.position.y = -0.2;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.42), dark);
  rod.add(shaft, handle);
  pump.add(base, gauge, barrel, rod);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const hose = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x1c232b }));
  hose.frustumCulled = false;
  return hose;
}
