import * as THREE from 'three';
import { DEFAULT_APPEARANCE, type Appearance, type ShoreState, type Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import { applyAppearance, createTubeMesh } from './tubeMesh';
import { playerColorMaterial } from './playerColor';

/** Seisovan kalastajan jalkojen pituus: renkaan kalastajan yläruumis nousee tämän verran. */
const LEG = 0.82;
/** Kannettu rengas vyötärön korkeudella. */
const CARRY_HEIGHT = 0.55;
/** Seisovan silmän korkeus POV:ssa (m maanpinnasta). */
export const STANDING_EYE = 1.6;

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

  constructor(appearance: Appearance = DEFAULT_APPEARANCE) {
    const src = createTubeMesh(appearance);
    for (const c of [...src.children]) {
      if (c.name === 'tube' || c.name === 'apron') this.tube.add(c);
      else if (c.name === 'leg' || c.name === 'fin' || c.name === 'rod' || c.userData.seated)
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
    this.group.add(this.angler, this.tube);
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
