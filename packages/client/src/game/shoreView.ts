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
import { PONTOON_TIP, TUBE_CENTER, TUBE_LIFT, applyAppearance, createTubeMesh } from './tubeMesh';
import { playerColorMaterial } from './playerColor';

/** Seisovan kalastajan jalkojen pituus: renkaan kalastajan yläruumis nousee tämän verran. */
const LEG = 0.82;
/** Kannettu rengas vyötärön korkeudella. */
const CARRY_HEIGHT = 0.55;
/** Seisovan silmän korkeus POV:ssa (m maanpinnasta). */
export const STANDING_EYE = 1.6;
/** Tyhjän ponttoonin litteys (osuus täydestä korkeudesta). */
const FLAT = 0.2;
/** Tyhjän sivuponttoonin leveneminen (osuus paksuudesta). */
const SPREAD = 0.6;
/** Käsipumppu kalastajan edessä (m) ja kahvan liike (#458). */
const PUMP = { ahead: 0.45, barrel: 0.55, rodLow: 0.62, rodHigh: 0.98, dip: 0.18 } as const;
/** Ponttoonien venttiilit renkaan omissa koordinaateissa (katse +x). */
const VALVES: readonly Vec2[] = [
  { x: PONTOON_TIP * 0.5, y: -TUBE_CENTER },
  { x: PONTOON_TIP * 0.5, y: TUBE_CENTER },
  { x: -TUBE_CENTER, y: 0 },
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

  constructor(appearance: Appearance = DEFAULT_APPEARANCE) {
    const src = createTubeMesh(appearance);
    for (const c of [...src.children]) {
      if (c.name === 'tube' || c.name === 'apron') {
        this.tube.add(c);
        const k = c.userData.pontoon as number | undefined;
        if (k !== undefined) {
          const m = c as THREE.Mesh;
          // Sivuponttoonin oma keskilinja nivelkohdaksi: tyhjänä se lässähtää leveäksi.
          if (k < 2) {
            const z = k === 0 ? -TUBE_CENTER : TUBE_CENTER;
            m.geometry.translate(0, 0, -z);
            m.position.z = z;
          }
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
    if (s.carrying) {
      this.tube.position.copy(toWorld(p.pos, Math.max(0, heightAt(p.pos)) + CARRY_HEIGHT));
      this.tube.rotation.y = p.heading;
    } else {
      const lying = s.board === undefined;
      this.tube.position.copy(toWorld(s.tube, lying ? Math.max(0, heightAt(s.tube)) : 0));
      this.tube.rotation.y = s.tubeHeading;
    }
    this.inflate(p, s.inflate, heightAt);
  }

  /**
   * Täyttökisa (#458): ponttoonit täytön mukaan, pumppu kalastajan edessä,
   * kahva vedon mukaan ja letku venttiiliin (siirrossa matkalla seuraavaan).
   */
  private inflate(p: AshorePose, f: InflateState | undefined, heightAt: (p: Vec2) => number) {
    this.pontoons.forEach((parts, i) => {
      const k = f ? FLAT + (1 - FLAT) * f.fill[i]! : 1;
      for (const m of parts) {
        m.scale.y = k;
        // Ylhäältäkin näkyy: tyhjä kylki on litteä ja leveä.
        if (i < 2) m.scale.z = 1 + (1 - k) * SPREAD;
        m.position.y = TUBE_LIFT * k;
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
      const t = this.tube.rotation.y;
      // Renkaan kierto y-akselin ympäri: paikallinen (x, z) maailmaan.
      const local = new THREE.Vector3(v.x, TUBE_LIFT * 0.5, v.y).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        t,
      );
      return local.add(this.tube.position);
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
