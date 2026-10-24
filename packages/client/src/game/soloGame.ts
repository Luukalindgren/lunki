import * as THREE from 'three';
import {
  LINES,
  LUNKINJARVI,
  LURES,
  chargePower,
  describeTackle,
  WaterBody,
  collideTubeWithShore,
  createTube,
  findLaunchPoint,
  DIFFICULTIES,
  Rng,
  createCompetition,
  createFishPopulation,
  formatTime,
  recordCatch,
  stepCompetition,
  timeLeft,
  createFishing,
  formatWeight,
  lureInfo,
  stepFishPopulation,
  lerpAngle,
  LureStage,
  LakeBottom,
  LUNKINJARVI_BOTTOM,
  resetFishing,
  rodTip,
  sonarPing,
  stepFishing,
  stepTube,
  type CompetitionSettings,
  type CompetitionState,
  type FishPopulation,
  type FishingContext,
  type FishingState,
  type PlayerResult,
  type LakeMap,
  type Tackle,
  type Vec2,
  type TubeInput,
  type TubeState,
} from '@lunki/shared';
import type { Input } from '../engine/input';
import { createBottomMesh } from '../world/bottomMesh';
import { createShoreScenery } from '../world/shoreScenery';
import type { RetroResolution } from '../engine/resolution';
import { PovCamera } from './povCamera';
import { createLakeMesh, toWorld } from '../world/lakeMesh';
import type { NetWorld } from '../net/netWorld';
import { RemotePlayersView } from './remotePlayersView';
import type { Sfx } from '../audio/sfx';
import type { Hud } from '../ui/hud';
import { FishingView } from './fishingView';
import { loadTackle, nextLure, saveTackle } from './tackle';
import { TopDownCamera } from './topDownCamera';
import { animateFins, createTubeMesh } from './tubeMesh';

/** Kalojen määrä järvessä. Saatujen tilalle syntyy uusia. */
const FISH_COUNT = 1800;
const LAND_COLOR = 0x24502c;
const SKY_COLOR = 0x83c2db;

/** Pohja lasketaan kerran karttaa kohden (valikon taustajärvi ja kisa jakavat sen). */
const bottoms = new WeakMap<LakeMap, LakeBottom>();
function bottomFor(map: LakeMap, water: WaterBody): LakeBottom {
  let b = bottoms.get(map);
  if (!b) {
    const features = map === LUNKINJARVI ? LUNKINJARVI_BOTTOM : { maxDepth: 6, features: [] };
    b = new LakeBottom(water, map.bounds, features);
    bottoms.set(map, b);
  }
  return b;
}

/** Näppäinasettelu: WASD tai nuolet. */
export function readTubeInput(input: Input): TubeInput {
  const down = (...codes: string[]) => codes.some((c) => input.isDown(c));
  return {
    kick: (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0),
    turn: (down('KeyA', 'ArrowLeft') ? 1 : 0) - (down('KeyD', 'ArrowRight') ? 1 : 0),
    sprint: down('ShiftLeft', 'ShiftRight'),
  };
}

/** Moninpelin kytkentä: palvelin ajaa renkaan, muut pelaajat piirretään. */
export interface NetLink {
  world: NetWorld;
  /** Nimilappujen kerros ja canvas, jonka päälle ne asemoidaan. */
  overlay: HTMLElement;
  canvas: HTMLCanvasElement;
}

/**
 * Pelikierros järvellä. Yksinpelissä rengas liikkuu paikallisesti;
 * moninpelissä (net) oma rengas ennakoidaan ja palvelin on totuus.
 */
export class SoloGame {
  readonly scene = new THREE.Scene();
  readonly view = new TopDownCamera();
  /** Kalastajan silmin -näkymä (V vaihtaa). */
  readonly pov = new PovCamera();
  viewMode: 'top' | 'pov' = 'top';
  private readonly scenery: THREE.Group;
  private readonly povRod: THREE.Line;
  readonly water: WaterBody;
  readonly bottom: LakeBottom;
  tube: TubeState;
  private prevTube: TubeState;
  private readonly tubeMesh = createTubeMesh();
  readonly fishing: FishingState = createFishing(loadTackle());
  /** Vaihdettavat varusteet: otetaan käyttöön, kun viehe on kelalla. */
  private pendingTackle: Tackle | null = null;
  private readonly fishingView = new FishingView();
  /** Hiiren osoittama piste maailmassa. */
  aim: Vec2 = { x: 0, y: 0 };
  readonly rng: Rng;
  readonly fish: FishPopulation;
  readonly competition: CompetitionState;
  private reelClickTimer = 0;
  /** Kutsutaan, kun kilpailuaika loppuu. */
  onFinished: (() => void) | null = null;
  private readonly remoteView: RemotePlayersView | null = null;

  constructor(
    private readonly input: Input,
    private readonly hud: Hud,
    private readonly sfx: Sfx,
    /** Muuntaa näytön CSS-pikselin sisäiseksi pikseliksi. */
    private readonly screenToInternal: (x: number, y: number) => { x: number; y: number },
    readonly settings: CompetitionSettings,
    seed = Date.now() >>> 0,
    readonly map: LakeMap = LUNKINJARVI,
    private readonly net?: NetLink,
  ) {
    this.competition = createCompetition(settings);
    this.water = new WaterBody(map);
    this.bottom = bottomFor(map, this.water);
    this.rng = new Rng(seed);
    this.fish = createFishPopulation(
      {
        isWater: (p) => this.water.isWater(p),
        depthAt: (p) => this.bottom.depthAt(p),
        structures: this.bottom.structures,
      },
      map.bounds,
      this.rng,
      FISH_COUNT,
      settings.species,
    );
    if (net) {
      // Palvelin arpoi aloituspaikan.
      this.tube = net.world.predictor.tube;
    } else {
      const start = findLaunchPoint(this.water, map.bounds, () => this.rng.next());
      // Selkä rantaan päin, katse järvelle.
      const shore = this.water.closestShorePoint(start)?.point ?? start;
      this.tube = createTube(start, Math.atan2(start.y - shore.y, start.x - shore.x));
    }
    this.prevTube = this.tube;

    this.scene.background = new THREE.Color(LAND_COLOR);
    this.scene.add(new THREE.HemisphereLight(0xeef2f3, 0x24502c, 1.5));
    const sun = new THREE.DirectionalLight(0xfff3b0, 1.5);
    sun.position.set(-50, 100, -30);
    this.scene.add(sun);
    this.scene.add(createLakeMesh(map));
    this.scene.add(createBottomMesh(this.bottom));
    this.scene.add(this.tubeMesh);
    this.scenery = createShoreScenery(map);
    this.scenery.visible = false;
    this.scene.add(this.scenery);
    this.povRod = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xf6d04d }),
    );
    this.povRod.visible = false;
    this.povRod.frustumCulled = false;
    this.scene.add(this.povRod);
    this.scene.add(this.fishingView.group);
    this.view.snapTo(this.tube.pos);
    hud.setCountdown(null);
    if (net) {
      this.remoteView = new RemotePlayersView(net.overlay);
      this.scene.add(this.remoteView.group);
      net.world.onPeerConnection = (name, connected) =>
        this.hud.showMessage(
          connected ? `${name} palasi kisaan` : `${name}: yhteys katkesi, odotetaan…`,
          3,
        );
      net.world.onPeerLeft = (name) => this.hud.showMessage(`${name} poistui kisasta`, 3);
      net.world.onCatchRejected = () =>
        this.hud.showMessage('Palvelin ei hyväksynyt saalista punnitukseen', 2.5);
      net.world.onCastRejected = () => {
        resetFishing(this.fishing);
        this.hud.showMessage('Palvelin hylkäsi heiton', 2);
      };
    }
  }

  private fishingContext(strike?: number): FishingContext {
    return {
      tubePos: this.tube.pos,
      heading: this.tube.heading,
      isWater: (p) => this.water.isWater(p),
      depthAt: (p) => this.bottom.depthAt(p),
      structureAt: (p) => this.bottom.structureAt(p),
      fish: { pop: this.fish, diff: DIFFICULTIES[this.settings.difficulty], rng: this.rng, strike },
    };
  }

  /** Aktiivinen kamera piirtoa varten. */
  get camera(): THREE.Camera {
    return this.viewMode === 'pov' ? this.pov.camera : this.view.camera;
  }

  setResolution(r: RetroResolution): void {
    this.view.setResolution(r);
    this.pov.setResolution(r);
  }

  setViewMode(mode: 'top' | 'pov'): void {
    this.viewMode = mode;
    const pov = mode === 'pov';
    this.scenery.visible = pov;
    this.povRod.visible = pov;
    this.tubeMesh.visible = !pov;
    this.scene.background = new THREE.Color(pov ? SKY_COLOR : LAND_COLOR);
    this.scene.fog = pov ? new THREE.Fog(SKY_COLOR, 500, 2600) : null;
    this.fishingView.pov = pov;
    this.hud.showMessage(pov ? 'Kalastajan silmin (V)' : 'Ylhäältä (V)', 1.2);
  }

  /** Vaihtaa varusteet heti, tai kun viehe seuraavan kerran on kelalla. */
  setTackle(t: Tackle): void {
    this.pendingTackle = { ...t };
    const f = this.fishing.stage;
    if (f !== 'idle' && f !== 'charging')
      this.hud.showMessage(`${LURES[t.lure].name} vaihtuu, kun viehe on kelalla`, 1.5);
  }

  /** Varusteet sellaisina kuin ne ovat seuraavassa heitossa. */
  get tackle(): Tackle {
    return this.pendingTackle ?? this.fishing.tackle;
  }

  get difficulty() {
    return this.settings.difficulty;
  }

  update(dt: number): void {
    const input = this.input;
    if (this.competition.finished) return;
    if (this.net ? this.syncCompetition() : stepCompetition(this.competition, dt)) {
      this.sfx.caught();
      this.onFinished?.();
      return;
    }
    // Lähtölaskennan aikana rengas ja vapa odottavat.
    const frozen = this.net?.world.phase === 'countdown';
    if (input.wheel !== 0) this.view.zoom(input.wheel);
    if (input.wasPressed('KeyH')) this.hud.toggleHelp();
    if (input.wasPressed('KeyK')) this.hud.sonar.toggle();
    if (input.wasPressed('KeyV')) this.setViewMode(this.viewMode === 'top' ? 'pov' : 'top');
    if (input.wasPressed('KeyR'))
      this.setTackle(nextLure(this.pendingTackle ?? this.fishing.tackle));

    this.prevTube = this.tube;
    if (this.net) {
      const f = this.fishing;
      const stage =
        f.hookedId !== null
          ? LureStage.hooked
          : f.stage === 'flight'
            ? LureStage.flight
            : f.stage === 'water'
              ? LureStage.water
              : LureStage.none;
      const tubeInput = frozen ? { kick: 0, turn: 0, sprint: false } : readTubeInput(input);
      this.tube = this.net.world.stepOwn(tubeInput, f.lure, stage);
    } else {
      const next = stepTube(this.tube, readTubeInput(input), dt);
      this.tube = collideTubeWithShore(this.tube, next, this.water);
    }

    const internal = this.screenToInternal(input.mouseX, input.mouseY);
    this.aim = (this.viewMode === 'pov' ? this.pov : this.view).internalToWorld(
      internal.x,
      internal.y,
    );
    const f = this.fishing;
    const lureOut = f.stage === 'flight' || f.stage === 'water';
    const reeling = !frozen && lureOut && (input.isDown('Mouse0') || input.isDown('Space'));
    const world = {
      isWater: (p: Vec2) => this.water.isWater(p),
      depthAt: (p: Vec2) => this.bottom.depthAt(p),
    };
    const fishEvents = stepFishPopulation(
      this.fish,
      lureInfo(f, this.fishingContext()),
      world,
      DIFFICULTIES[this.settings.difficulty],
      this.rng,
      dt,
    );
    const events = stepFishing(
      f,
      {
        aim: this.aim,
        castHeld: !frozen && input.isDown('Mouse0'),
        reel: reeling,
        cancel: input.isDown('Mouse2'),
        dragDelta: (input.wasPressed('KeyE') ? 1 : 0) - (input.wasPressed('KeyQ') ? 1 : 0),
        ...(input.wasPressed('Digit1') ? { gear: 0 } : {}),
        ...(input.wasPressed('Digit2') ? { gear: 1 } : {}),
        ...(input.wasPressed('Digit3') ? { gear: 2 } : {}),
        ...(this.pendingTackle ? { tackle: this.pendingTackle } : {}),
      },
      this.fishingContext(fishEvents.strike),
      dt,
    );
    this.handleEvents(events, fishEvents.follow !== undefined, reeling, dt);
    if (f.onLand && f.stage === 'water')
      this.hud.showMessage('Viehe rannalla – kelaa takaisin', 0.2);

    // Kamera: kun viehe on ulkona, seurataan renkaan ja vieheen väliä ja loitonnetaan tarvittaessa.
    if (lureOut) {
      const mid = { x: (this.tube.pos.x + f.lure.x) / 2, y: (this.tube.pos.y + f.lure.y) / 2 };
      this.view.follow(mid, dt, 2);
      this.view.fitSpan(
        Math.abs(f.lure.x - this.tube.pos.x) * 1.3 + 10,
        Math.abs(f.lure.y - this.tube.pos.y) * 1.3 + 10,
      );
    } else {
      this.view.follow(this.tube.pos, dt, 3);
      this.view.fitSpan(0, 0);
    }

    this.hud.setPower(f.stage === 'charging' ? chargePower(f.charge) : null);
    this.hud.setTension(f.tension, f.drag, LINES[f.tackle.line].strength);
    this.hud.setStatus([
      describeTackle(f.tackle),
      `Siimaa ${f.lineLength.toFixed(1)} m`,
      `Jarru ${f.drag.toFixed(2)} kg · kela ${f.gear + 1}`,
      `Viehe ${f.stage === 'water' && !f.onLand ? f.depth.toFixed(1) : '0.0'} m`,
      `Pohja ${this.bottom.depthAt(lureOut ? f.lure : this.tube.pos).toFixed(1)} m`,
    ]);
    this.hud.sonar.update(dt, () =>
      sonarPing(this.tube.pos, this.fish.fish, this.bottom.depthAt(this.tube.pos)),
    );
    const left = timeLeft(this.competition);
    this.hud.setTimer(formatTime(left), left < 60);
    if (this.net) {
      this.updateRaceHud();
      this.hud.update(dt);
      return;
    }
    const catches = this.competition.catches;
    const total = catches.reduce((a, c) => a + c.weight, 0);
    this.hud.setCatches(
      catches.length === 0
        ? []
        : [
            `Saalis ${catches.length} kpl  ${formatWeight(total)}`,
            ...catches
              .slice(-5)
              .reverse()
              .map((c) => `${formatTime(c.time)} ${c.name} ${formatWeight(c.weight)}`),
          ],
    );
    this.hud.update(dt);
  }

  private handleEvents(
    events: ReturnType<typeof stepFishing>,
    follow: boolean,
    reeling: boolean,
    dt: number,
  ): void {
    const { hud, sfx } = this;
    if (events.splash) {
      this.fishingView.startSplash(events.splash);
      sfx.splash();
      this.net?.world.sendSplash(events.splash);
    }
    if (follow) sfx.tick();
    if (events.strike) {
      sfx.strike();
      hud.showMessage('Tärppi!', 1.2);
    }
    if (events.hooked) {
      sfx.hooked();
      hud.showMessage('Kala kiinni!', 1.5);
    }
    if (events.missed) hud.showMessage('Ohi meni – kelaa heti tärpin jälkeen', 2);
    if (events.escaped) {
      sfx.lost();
      hud.showMessage('Kala irtosi – pidä siima kireällä', 2.5);
    }
    if (events.tackleChanged) {
      this.pendingTackle = null;
      saveTackle(this.fishing.tackle);
      hud.showMessage(`Viehe: ${LURES[this.fishing.tackle.lure].name}`, 1.5);
    }
    if (events.snagged) {
      sfx.strike();
      hud.showMessage('Pohjatartunta! Kelaa irrottaaksesi', 2);
    }
    if (events.unsnagged) hud.showMessage('Viehe irtosi pohjasta', 1.5);
    if (events.bitOff) {
      sfx.lost();
      hud.showMessage('Hauki katkaisi siiman hampaillaan – kokeile teräsperukkaa', 3.5);
    } else if (events.lureLost) {
      sfx.lost();
      hud.showMessage('Siima katkesi – viehe jäi pohjaan', 3);
    } else if (events.lineBroken) {
      sfx.lost();
      hud.showMessage('Siima katkesi! Löysää jarrua (Q) tai vaihda paksumpi siima', 3);
    }
    if (events.caught) {
      sfx.caught();
      this.net?.world.sendCatch(events.caught);
      const record = recordCatch(this.competition, events.caught);
      this.fishingView.startSplash(this.fishing.lure);
      const catches = this.competition.catches;
      const biggest = catches.every((c) => c === record || c.weight < events.caught!.weight);
      hud.showWeighIn(
        `${events.caught.name} ${formatWeight(events.caught.weight)}`,
        catches.length > 1 && biggest ? 'Kisan suurin tähän asti!' : `${catches.length}. kala`,
      );
    }
    if (this.fishing.dragSlipping) sfx.dragSlip();
    this.reelClickTimer -= dt;
    if (reeling && this.reelClickTimer <= 0) {
      sfx.reelClick();
      this.reelClickTimer = 0.09 / (this.fishing.gear + 1);
    }
  }

  /** Moninpeli: kello ja loppu palvelimelta. Palauttaa true, kun kisa päättyy. */
  private syncCompetition(): boolean {
    const w = this.net!.world;
    this.competition.elapsed = w.raceClock;
    if (w.phase !== 'finished') return false;
    this.competition.finished = true;
    return true;
  }

  private raceHudTimer = 0;

  /** Lähtölaskenta ja tulostaulu (top 5 + oma sijoitus). */
  private updateRaceHud(): void {
    const w = this.net!.world;
    const cd = w.phase === 'countdown' ? Math.ceil(w.countdown) : 0;
    this.hud.setCountdown(
      w.phase === 'countdown'
        ? String(Math.max(1, cd))
        : this.competition.elapsed < 1.2
          ? 'Kalastamaan!'
          : null,
    );
    if ((this.raceHudTimer = (this.raceHudTimer + 1) % 15) !== 1) return;
    const results = w.results();
    const lines = results.slice(0, 5).map((r) => scoreLine(r, r.id === w.myId));
    const me = results.find((r) => r.id === w.myId);
    if (me && me.rank > 5 && !results.slice(0, 5).includes(me))
      lines.push('…', scoreLine(me, true));
    this.hud.setCatches(['Tulostaulu', ...lines]);
  }

  /** Vapauttaa GPU-resurssit, kun kierros päättyy. */
  dispose(): void {
    this.remoteView?.dispose();
    this.net?.world.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    });
  }

  /** Piirtää interpoloiden edellisen ja nykyisen askeleen välillä. */
  render(alpha: number): void {
    const a = this.prevTube;
    const b = this.tube;
    const offset = this.net?.world.renderOffset ?? { x: 0, y: 0 };
    const pos = {
      x: a.pos.x + (b.pos.x - a.pos.x) * alpha + offset.x,
      y: a.pos.y + (b.pos.y - a.pos.y) * alpha + offset.y,
    };
    const heading = lerpAngle(a.heading, b.heading, alpha);
    this.tubeMesh.position.copy(toWorld(pos));
    this.tubeMesh.rotation.y = heading;
    animateFins(this.tubeMesh, b.kickPhase);
    const hooked = this.fish.fish.find((x) => x.id === this.fishing.hookedId) ?? null;
    this.fishingView.update(this.fishing, this.fishingContext(), this.aim, 1 / 60, hooked);
    this.view.apply();
    if (this.viewMode === 'pov') {
      this.pov.apply(pos, heading, b.kickPhase);
      // Vapa oikeasta kädestä kärkeen; kärki on siiman alkupiste.
      const tip = rodTip(pos, heading);
      const hand = {
        x: pos.x + Math.cos(heading - 1.1) * 0.45,
        y: pos.y + Math.sin(heading - 1.1) * 0.45,
      };
      const attr = this.povRod.geometry.getAttribute('position') as THREE.BufferAttribute;
      const h0 = toWorld(hand, 0.3);
      const h1 = toWorld(tip, 1.2);
      attr.setXYZ(0, h0.x, h0.y, h0.z);
      attr.setXYZ(1, h1.x, h1.y, h1.z);
      attr.needsUpdate = true;
    }
    if (this.net && this.remoteView)
      this.remoteView.update(this.net.world.others(), this.camera, this.net.canvas);
  }
}

function scoreLine(r: PlayerResult, me: boolean): string {
  const name = r.name.length > 10 ? `${r.name.slice(0, 9)}…` : r.name;
  return `${me ? '>' : ' '}${r.rank}. ${name.padEnd(10)} ${formatWeight(r.summary.score).padStart(7)}`;
}
