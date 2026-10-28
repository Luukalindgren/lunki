import * as THREE from 'three';
import { EMOTE_DURATION, LureStage, rodTip, type Appearance, type EmoteId } from '@lunki/shared';
import type { RemotePlayer } from '../net/netWorld';
import { toWorld } from '../world/lakeMesh';
import { AIR_SAMPLES, ROD_TIP_Y, flightLine, hangLine, rodSideOffset, writeLine } from './lineHang';
import { FAR_BUBBLE, SpeechBubble, type BubbleContent } from './speechBubble';
import {
  SEATED_LIFT,
  animateEmote,
  animateFins,
  applyAppearance,
  createTubeMesh,
  setSeated,
} from './tubeMesh';
import { FLY_LINE_POINTS, RemoteFlyLine, flyLineProfile, flyLineWorld } from './flyLine';
import { flyRodTip } from './povRod';
import { screenAnchor } from './screenAnchor';

const cssColor = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
/** Muiden siiman kireyttä ei tiedetä: piirretään puolikireänä. */
const REMOTE_TAUT = 0.5;
/** Siiman kärkivälit: ilmassa roikkuva osuus ja suora pätkä vieheelle. */
const LINE_VERTS = AIR_SAMPLES + 2;

interface Entry {
  tube: THREE.Group;
  lure: THREE.Mesh;
  line: THREE.Line;
  /** Perhoheiton siima silmukkana (#236). */
  flyLine: THREE.Line;
  fly: RemoteFlyLine;
  tag: HTMLDivElement;
  bubble: SpeechBubble;
  /** Käynnissä oleva käsimerkki ja sen alku (ms). */
  emote: { id: EmoteId; start: number } | null;
  /** Viimeksi käytetyt värit: vaihdetaan vain muuttuessa. */
  appearance: Appearance;
}

/** Piirtää muut pelaajat, heidän vieheensä ja nimilaput. */
export class RemotePlayersView {
  readonly group = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private readonly tags: HTMLDivElement;
  private readonly v = new THREE.Vector3();
  /** Ele tai viesti pelaajalle, jota ei vielä ole piirretty. */
  private readonly pending = new Map<string, { content: BubbleContent; at: number }>();

  /** `below`: lappukerros tämän (HUD) alle, ettei se peitä nappeja ja paneeleja (#277). */
  constructor(parent: HTMLElement, below: Element | null = null) {
    this.tags = document.createElement('div');
    this.tags.className = 'name-tags';
    parent.insertBefore(this.tags, below?.parentNode === parent ? below : null);
  }

  /** Pelaajan käsimerkki: animaatio ja kupla. */
  showEmote(id: string, emote: EmoteId, now = performance.now()): void {
    this.bubble(id, { emote }, now);
  }

  /** Pelaajan chat-viesti kuplana. */
  showChat(id: string, text: string, now = performance.now()): void {
    this.bubble(id, { text }, now);
  }

  private bubble(id: string, content: BubbleContent, now: number): void {
    const e = this.entries.get(id);
    if (!e) {
      this.pending.set(id, { content, at: now });
      return;
    }
    e.bubble.show(content, now);
    if ('emote' in content) e.emote = { id: content.emote, start: now };
  }

  update(players: RemotePlayer[], camera: THREE.Camera, canvas: HTMLCanvasElement): void {
    const now = performance.now();
    const seen = new Set<string>();
    const rect = canvas.getBoundingClientRect();
    for (const p of players) {
      seen.add(p.id);
      const e = this.entries.get(p.id) ?? this.add(p.id, p.appearance);
      const waiting = this.pending.get(p.id);
      if (waiting) {
        this.pending.delete(p.id);
        this.bubble(p.id, waiting.content, waiting.at);
      }
      const age = e.emote ? (now - e.emote.start) / 1000 : Infinity;
      if (age > EMOTE_DURATION) e.emote = null;
      animateEmote(e.tube, e.emote?.id ?? null, age);
      if (!sameAppearance(e.appearance, p.appearance)) this.recolor(e, p.appearance);
      // Veneessä kalastaja istuu (vene piirretään BoatsView'ssa); soutaja voi
      // kääntyä tuhdolla (look), ja kaatuessa koko miehistö kallistuu veneen mukana.
      setSeated(e.tube, p.boat > 0);
      e.tube.position.copy(toWorld(p.pos, (p.lift ?? 0) + (p.boat > 0 ? SEATED_LIFT : 0)));
      e.tube.rotation.y = p.heading + p.look;
      e.tube.rotation.x = p.tumble ?? p.roll;
      animateFins(e.tube, p.kickPhase);

      const showLure = p.lure !== null && p.lureStage !== LureStage.none;
      // Perhovälineillä lento on perhoheittoa: perho kulkee edestakaisin silmukan kärjessä.
      const casting = showLure && p.fly === true && p.lureStage === LureStage.flight;
      e.lure.visible = showLure;
      e.line.visible = showLure && !casting;
      e.flyLine.visible = casting;
      if (casting) this.drawFlyCast(e, p);
      else e.fly.reset();
      e.lure.scale.setScalar(casting ? 0.5 : 1);
      if (showLure && !casting) {
        const tip = rodTip(p.pos, p.heading + p.look);
        const side = rodSideOffset(p.heading + p.look);
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
      // Kameran takana oleva piste karsitaan, muuten lappu näkyisi peilattuna.
      const at = screenAnchor(this.v.copy(e.tube.position).setY(1.5), camera, rect);
      e.tag.hidden = !at;
      if (at) {
        e.tag.textContent = p.name;
        e.tag.style.left = `${at.x}px`;
        e.tag.style.top = `${at.y}px`;
      }
      // Kaukana (kalastajan silmin) kupla pienenee eikä näytä viestin tekstiä.
      const far = camera.position.distanceTo(e.tube.position) > FAR_BUBBLE;
      e.bubble.place(at, far, now);
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) this.remove(id, e);
  }

  /** Muun pelaajan perhoheitto perhon paikasta päätellen. */
  private drawFlyCast(e: Entry, p: RemotePlayer): void {
    const heading = p.heading + p.look;
    const side = rodSideOffset(heading);
    const tip0 = flyRodTip(1);
    const tip = {
      x: p.pos.x + side.x + Math.cos(heading) * tip0.forward,
      y: p.pos.y + side.y + Math.sin(heading) * tip0.forward,
    };
    const along = (p.lure!.x - tip.x) * Math.cos(heading) + (p.lure!.y - tip.y) * Math.sin(heading);
    const prev = e.fly.pose(along, tip0);
    // Vapa on silmukan suunnan pysäytysasennossa.
    const pose = { ...prev, ...posed(flyRodTip(prev.dir)) };
    const pts = flyLineWorld(flyLineProfile(pose), p.pos, heading, heading, side);
    const pos = e.flyLine.geometry.attributes.position as THREE.BufferAttribute;
    writeLine(pos, pts);
    pos.needsUpdate = true;
    const end = pts[pts.length - 1]!;
    e.lure.position.set(end.x, end.h, -end.y);
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
    const flyLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: FLY_LINE_POINTS }, () => new THREE.Vector3()),
      ),
      line.material,
    );
    flyLine.frustumCulled = false;
    flyLine.visible = false;
    this.group.add(tube, lure, line, flyLine);
    const tag = document.createElement('div');
    tag.className = 'name-tag';
    tag.style.borderColor = cssColor(appearance.tube);
    this.tags.appendChild(tag);
    const bubble = new SpeechBubble(this.tags);
    const e: Entry = {
      tube,
      lure,
      line,
      flyLine,
      fly: new RemoteFlyLine(),
      tag,
      bubble,
      emote: null,
      appearance,
    };
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
    this.group.remove(e.tube, e.lure, e.line, e.flyLine);
    e.tag.remove();
    e.bubble.remove();
    this.entries.delete(id);
  }

  dispose(): void {
    for (const [id, e] of this.entries) this.remove(id, e);
    this.tags.remove();
  }
}

const sameAppearance = (a: Appearance, b: Appearance) =>
  a.tube === b.tube && a.fins === b.fins && a.shirt === b.shirt && a.line === b.line;

const posed = (tip: { forward: number; height: number }) => ({
  tipS: tip.forward,
  tipH: tip.height,
});
