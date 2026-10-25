import * as THREE from 'three';
import { LureStage, rodTip, type Appearance } from '@lunki/shared';
import type { RemotePlayer } from '../net/netWorld';
import { toWorld } from '../world/lakeMesh';
import { AIR_SAMPLES, ROD_TIP_Y, flightLine, hangLine, rodSideOffset, writeLine } from './lineHang';
import { animateFins, applyAppearance, createTubeMesh } from './tubeMesh';

const cssColor = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
/** Muiden siiman kireyttä ei tiedetä: piirretään puolikireänä. */
const REMOTE_TAUT = 0.5;
/** Siiman kärkivälit: ilmassa roikkuva osuus ja suora pätkä vieheelle. */
const LINE_VERTS = AIR_SAMPLES + 2;

interface Entry {
  tube: THREE.Group;
  lure: THREE.Mesh;
  line: THREE.Line;
  tag: HTMLDivElement;
  /** Viimeksi käytetyt värit: vaihdetaan vain muuttuessa. */
  appearance: Appearance;
}

/** Piirtää muut pelaajat, heidän vieheensä ja nimilaput. */
export class RemotePlayersView {
  readonly group = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private readonly tags: HTMLDivElement;
  private readonly v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.tags = document.createElement('div');
    this.tags.className = 'name-tags';
    parent.appendChild(this.tags);
  }

  update(players: RemotePlayer[], camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    const seen = new Set<string>();
    const rect = canvas.getBoundingClientRect();
    for (const p of players) {
      seen.add(p.id);
      const e = this.entries.get(p.id) ?? this.add(p.id, p.appearance);
      if (!sameAppearance(e.appearance, p.appearance)) this.recolor(e, p.appearance);
      e.tube.position.copy(toWorld(p.pos));
      e.tube.rotation.y = p.heading;
      animateFins(e.tube, p.kickPhase);

      const showLure = p.lure !== null && p.lureStage !== LureStage.none;
      e.lure.visible = e.line.visible = showLure;
      if (showLure) {
        const tip = rodTip(p.pos, p.heading);
        const side = rodSideOffset(p.heading);
        const flying = p.lureStage === LureStage.flight;
        const lure = toWorld(p.lure!, flying ? 1 : 0.05);
        e.lure.position.copy(lure);
        const pts = flying
          ? flightLine(
              { x: tip.x + side.x, y: tip.y + side.y, h: ROD_TIP_Y },
              { x: p.lure!.x, y: p.lure!.y, h: 1 },
              LINE_VERTS,
              0.05,
            )
          : hangLine([tip, p.lure!], ROD_TIP_Y, REMOTE_TAUT, 0.05, side);
        const pos = e.line.geometry.attributes.position as THREE.BufferAttribute;
        writeLine(pos, pts);
        pos.needsUpdate = true;
        e.line.geometry.computeBoundingSphere();
      }

      // Nimilappu renkaan yläpuolelle näytön koordinaateissa.
      this.v.copy(e.tube.position).setY(1.5).project(camera);
      const visible = Math.abs(this.v.x) <= 1.1 && Math.abs(this.v.y) <= 1.1;
      e.tag.hidden = !visible;
      if (visible) {
        e.tag.textContent = p.name;
        e.tag.style.left = `${rect.left + ((this.v.x + 1) / 2) * rect.width}px`;
        e.tag.style.top = `${rect.top + ((1 - this.v.y) / 2) * rect.height}px`;
      }
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) this.remove(id, e);
  }

  private add(id: string, appearance: Appearance): Entry {
    const tube = createTubeMesh(appearance);
    const lure = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xf08a2c }),
    );
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: LINE_VERTS }, () => new THREE.Vector3()),
      ),
      new THREE.LineBasicMaterial({ color: appearance.line }),
    );
    line.frustumCulled = false;
    this.group.add(tube, lure, line);
    const tag = document.createElement('div');
    tag.className = 'name-tag';
    tag.style.borderColor = cssColor(appearance.tube);
    this.tags.appendChild(tag);
    const e = { tube, lure, line, tag, appearance };
    this.entries.set(id, e);
    return e;
  }

  private recolor(e: Entry, a: Appearance): void {
    applyAppearance(e.tube, a);
    (e.line.material as THREE.LineBasicMaterial).color.setHex(a.line);
    e.tag.style.borderColor = cssColor(a.tube);
    e.appearance = a;
  }

  private remove(id: string, e: Entry): void {
    this.group.remove(e.tube, e.lure, e.line);
    e.tag.remove();
    this.entries.delete(id);
  }

  dispose(): void {
    for (const [id, e] of this.entries) this.remove(id, e);
    this.tags.remove();
  }
}

const sameAppearance = (a: Appearance, b: Appearance) =>
  a.tube === b.tube && a.fins === b.fins && a.shirt === b.shirt && a.line === b.line;
