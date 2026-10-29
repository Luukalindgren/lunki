import * as THREE from 'three';
import {
  EMOTE_DURATION,
  LureStage,
  distance,
  type Appearance,
  type Difficulty,
  type EmoteId,
  type Vec2,
} from '@lunki/shared';
import type { RemotePlayer } from '../net/netWorld';
import { toWorld } from '../world/lakeMesh';
import { AIR_SAMPLES, flightLine, hangLine, rodSideOffset, writeLine } from './lineHang';
import { FAR_BUBBLE, SpeechBubble, type BubbleContent } from './speechBubble';
import {
  SEATED_LIFT,
  aimRod,
  animateEmote,
  animateFins,
  applyAppearance,
  createTubeMesh,
  setSeated,
} from './tubeMesh';
import { FLY_LINE_POINTS, RemoteFlyLine, flyLineProfile, flyLineWorld } from './flyLine';
import { flyRodTip } from './povRod';
import { screenAnchor } from './screenAnchor';
import { REMOTE_FIGHT, RemoteFight } from './remoteFight';
import { SplashRings } from './splashRings';
import { ROD_MOTION, RodMotion } from './rodMotion';
import { LureMarker, markerPosition } from './lureMarker';
import { lureColor } from './lureColor';

const cssColor = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
/** Muiden siiman kireyttä ei tiedetä: piirretään puolikireänä. */
const REMOTE_TAUT = 0.5;
/** Siiman kärkivälit: ilmassa roikkuva osuus ja suora pätkä vieheelle. */
const LINE_VERTS = AIR_SAMPLES + 2;

interface Entry {
  tube: THREE.Group;
  /** Vieheen merkki oman vaikeustason mukaan; vieheen lajia ja tilaa ei tiedetä. */
  lure: LureMarker;
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
  /** Väsytys (#368): vavan taipuma ja kalan molskahdukset. */
  fight: RemoteFight;
  /** Vavan nosto: heitto ja vastaisku näkyvät myös muilla. */
  rod: RodMotion;
  /** Vieheen edellinen vaihe (LureStage): vaihdoksista heitto ja vastaisku. */
  stage: number;
}

/** Piirtää muut pelaajat, heidän vieheensä ja nimilaput. */
export class RemotePlayersView {
  readonly group = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private readonly tags: HTMLDivElement;
  private readonly v = new THREE.Vector3();
  /** Ele tai viesti pelaajalle, jota ei vielä ole piirretty. */
  private readonly pending = new Map<string, { content: BubbleContent; at: number }>();
  /** Muiden väsyttämien kalojen molskahdukset (#368). */
  private readonly splashes = new SplashRings(6);
  private readonly tip = new THREE.Vector3();
  private lastUpdate = performance.now();
  /** Näkymä ja vaikeustaso vieheiden merkkejä varten (kuten `FishingView`). */
  pov = false;
  pixel = 0.125;
  difficulty: Difficulty = 'normal';

  /** `below`: lappukerros tämän (HUD) alle, ettei se peitä nappeja ja paneeleja (#277). */
  constructor(parent: HTMLElement, below: Element | null = null) {
    this.tags = document.createElement('div');
    this.tags.className = 'name-tags';
    parent.insertBefore(this.tags, below?.parentNode === parent ? below : null);
    this.group.add(this.splashes.group);
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

  /** `me` = oma paikka: kala kiinni -merkki näkyy vain lähellä oleville (#368). */
  update(
    players: RemotePlayer[],
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    me: Vec2 | null = null,
  ): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastUpdate) / 1000);
    this.lastUpdate = now;
    this.splashes.update(dt);
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
      const hooked = p.lure !== null && p.lureStage === LureStage.hooked;
      if (p.lureStage !== e.stage) {
        const m = ROD_MOTION;
        if (p.lureStage === LureStage.flight && !p.fly)
          e.rod.pulse(m.castThrow.lift, m.castThrow.time);
        if (hooked) e.rod.pulse(m.hookSet.lift, m.hookSet.time);
        e.stage = p.lureStage;
      }
      let tip: THREE.Vector3;
      if (hooked) tip = this.drawFight(e, p, dt);
      else {
        e.fight.reset();
        tip = aimRod(e.tube, { ...e.rod.step(0, 0, dt), pull: null }, this.tip);
      }

      const showLure = p.lure !== null && p.lureStage !== LureStage.none;
      // Perhovälineillä lento on perhoheittoa: perho kulkee edestakaisin silmukan kärjessä.
      const casting = showLure && p.fly === true && p.lureStage === LureStage.flight;
      if (!showLure) e.lure.hide();
      e.line.visible = showLure && !casting;
      e.flyLine.visible = casting;
      if (casting) this.drawFlyCast(e, p);
      else e.fly.reset();
      if (showLure && !casting && !hooked) {
        // Siima lähtee hahmon vavan kärjestä.
        const from = { x: tip.x, y: -tip.z };
        const flying = p.lureStage === LureStage.flight;
        const lure = markerPosition(p.lure!, flying ? 1 : 0, this.pov);
        this.mark(e, p, p.lure!, flying ? 1 : 0);
        const pts = flying
          ? flightLine(
              { ...from, h: tip.y },
              { x: lure.x, y: -lure.z, h: lure.y },
              LINE_VERTS,
              0.05,
            )
          : hangLine([from, p.lure!], tip.y, REMOTE_TAUT, 0.05);
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
      if (hooked && me && distance(me, p.pos) < REMOTE_FIGHT.markRange)
        e.bubble.hold('fishOn', now);
      e.bubble.place(at, far, now);
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) this.remove(id, e);
  }

  /**
   * Toisella kala kiinni (#368): vapa taipuu kalaa kohti ja nykii kalan
   * liikkeen mukaan, siima on kireä vavan kärjestä kalaan ja kala
   * molskahtaa silloin tällöin. Kalan paikka on vieheen paikka. Palauttaa
   * vavan kärjen.
   */
  private drawFight(e: Entry, p: RemotePlayer, dt: number): THREE.Vector3 {
    const fish = p.lure!;
    const pose = e.fight.update(fish, dt);
    // Vapa pystyssä ja taipuneena kalaa kohti; nykiminen näkyy taipumassa.
    const bend = ROD_MOTION.maxBend.spin * Math.min(1, pose.bend + pose.jerk * 4);
    const w = aimRod(
      e.tube,
      { ...e.rod.step(ROD_MOTION.fight, bend, dt), pull: { ...fish, depth: 1 } },
      this.tip,
    );
    const pts = hangLine([{ x: w.x, y: -w.z }, fish], w.y, 1, 0.05);
    const pos = e.line.geometry.attributes.position as THREE.BufferAttribute;
    writeLine(pos, pts);
    pos.needsUpdate = true;
    e.line.geometry.computeBoundingSphere();
    this.mark(e, p, fish, 0);
    if (pose.splash !== null) this.splashes.start(fish, pose.splash);
    return w;
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
    this.mark(e, p, end, end.h);
  }

  /** Vieheen merkki: muiden vieheen lajia, syvyyttä ja tilaa ei tiedetä. */
  private mark(e: Entry, p: RemotePlayer, at: Vec2, height: number): void {
    e.lure.update({
      at,
      height,
      depth: 0,
      from: p.pos,
      onLand: false,
      flying: height > 0,
      moving: false,
      color: lureColor(0),
      art: null,
      difficulty: this.difficulty,
      pov: this.pov,
      pixel: this.pixel,
    });
  }

  private add(id: string, appearance: Appearance): Entry {
    const tube = createTubeMesh(appearance);
    const lure = new LureMarker();
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
    this.group.add(tube, lure.group, line, flyLine);
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
      fight: new RemoteFight(),
      rod: new RodMotion(),
      stage: LureStage.none,
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
    this.group.remove(e.tube, e.lure.group, e.line, e.flyLine);
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
