import * as THREE from 'three';
import {
  LUNKINJARVI,
  REEL,
  chargePower,
  WaterBody,
  collideTubeWithShore,
  createTube,
  findLaunchPoint,
  DIFFICULTIES,
  Rng,
  createFishPopulation,
  createFishing,
  formatWeight,
  lureInfo,
  stepFishPopulation,
  lerpAngle,
  protoDepthAt,
  stepFishing,
  stepTube,
  type Catch,
  type Difficulty,
  type FishPopulation,
  type FishingContext,
  type FishingState,
  type LakeMap,
  type Vec2,
  type TubeInput,
  type TubeState,
} from '@lunki/shared';
import type { Input } from '../engine/input';
import { createLakeMesh, toWorld } from '../world/lakeMesh';
import type { Sfx } from '../audio/sfx';
import type { Hud } from '../ui/hud';
import { FishingView } from './fishingView';
import { TopDownCamera } from './topDownCamera';
import { animateFins, createTubeMesh } from './tubeMesh';

/** Kalojen määrä järvessä. Saatujen tilalle syntyy uusia. */
const FISH_COUNT = 1800;

/** Näppäinasettelu: WASD tai nuolet. */
export function readTubeInput(input: Input): TubeInput {
  const down = (...codes: string[]) => codes.some((c) => input.isDown(c));
  return {
    kick: (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0),
    turn: (down('KeyA', 'ArrowLeft') ? 1 : 0) - (down('KeyD', 'ArrowRight') ? 1 : 0),
    sprint: down('ShiftLeft', 'ShiftRight'),
  };
}

/** Yksinpeli: yksi pelaaja järvellä. Kasvaa heiton, siiman ja kalojen myötä. */
export class SoloGame {
  readonly scene = new THREE.Scene();
  readonly view = new TopDownCamera();
  readonly water: WaterBody;
  tube: TubeState;
  private prevTube: TubeState;
  private readonly tubeMesh = createTubeMesh();
  readonly fishing: FishingState = createFishing();
  private readonly fishingView = new FishingView();
  /** Hiiren osoittama piste maailmassa. */
  aim: Vec2 = { x: 0, y: 0 };
  readonly rng: Rng;
  readonly fish: FishPopulation;
  readonly catches: Catch[] = [];
  private reelClickTimer = 0;

  constructor(
    private readonly input: Input,
    private readonly hud: Hud,
    private readonly sfx: Sfx,
    /** Muuntaa näytön CSS-pikselin sisäiseksi pikseliksi. */
    private readonly screenToInternal: (x: number, y: number) => { x: number; y: number },
    readonly difficulty: Difficulty = 'normal',
    seed = Date.now() >>> 0,
    readonly map: LakeMap = LUNKINJARVI,
  ) {
    this.water = new WaterBody(map);
    this.rng = new Rng(seed);
    this.fish = createFishPopulation(
      { isWater: (p) => this.water.isWater(p), depthAt: (p) => protoDepthAt(this.water, p) },
      map.bounds,
      this.rng,
      FISH_COUNT,
    );
    const start = findLaunchPoint(this.water, map.bounds, () => this.rng.next());
    // Selkä rantaan päin, katse järvelle.
    const shore = this.water.closestShorePoint(start)?.point ?? start;
    this.tube = createTube(start, Math.atan2(start.y - shore.y, start.x - shore.x));
    this.prevTube = this.tube;

    this.scene.background = new THREE.Color(0x24502c);
    this.scene.add(new THREE.HemisphereLight(0xeef2f3, 0x24502c, 1.5));
    const sun = new THREE.DirectionalLight(0xfff3b0, 1.5);
    sun.position.set(-50, 100, -30);
    this.scene.add(sun);
    this.scene.add(createLakeMesh(map));
    this.scene.add(this.tubeMesh);
    this.scene.add(this.fishingView.group);
    this.view.snapTo(this.tube.pos);
  }

  private fishingContext(strike?: number): FishingContext {
    return {
      tubePos: this.tube.pos,
      heading: this.tube.heading,
      isWater: (p) => this.water.isWater(p),
      depthAt: (p) => protoDepthAt(this.water, p),
      fish: { pop: this.fish, diff: DIFFICULTIES[this.difficulty], rng: this.rng, strike },
    };
  }

  update(dt: number): void {
    const input = this.input;
    if (input.wheel !== 0) this.view.zoom(input.wheel);
    if (input.wasPressed('KeyH')) this.hud.toggleHelp();

    this.prevTube = this.tube;
    const next = stepTube(this.tube, readTubeInput(input), dt);
    this.tube = collideTubeWithShore(this.tube, next, this.water);

    const internal = this.screenToInternal(input.mouseX, input.mouseY);
    this.aim = this.view.internalToWorld(internal.x, internal.y);
    const f = this.fishing;
    const lureOut = f.stage === 'flight' || f.stage === 'water';
    const reeling = lureOut && (input.isDown('Mouse0') || input.isDown('Space'));
    const world = {
      isWater: (p: Vec2) => this.water.isWater(p),
      depthAt: (p: Vec2) => protoDepthAt(this.water, p),
    };
    const fishEvents = stepFishPopulation(
      this.fish,
      lureInfo(f, this.fishingContext()),
      world,
      DIFFICULTIES[this.difficulty],
      this.rng,
      dt,
    );
    const events = stepFishing(
      f,
      {
        aim: this.aim,
        castHeld: input.isDown('Mouse0'),
        reel: reeling,
        cancel: input.isDown('Mouse2'),
        dragDelta: (input.wasPressed('KeyE') ? 1 : 0) - (input.wasPressed('KeyQ') ? 1 : 0),
        ...(input.wasPressed('Digit1') ? { gear: 0 } : {}),
        ...(input.wasPressed('Digit2') ? { gear: 1 } : {}),
        ...(input.wasPressed('Digit3') ? { gear: 2 } : {}),
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
    this.hud.setTension(f.tension, f.drag, REEL.lineStrength);
    this.hud.setStatus([
      `Siimaa ${f.lineLength.toFixed(1)} m`,
      `Jarru ${f.drag.toFixed(2)} kg · kela ${f.gear + 1}`,
      `Viehe ${f.stage === 'water' && !f.onLand ? f.depth.toFixed(1) : '0.0'} m`,
      `Pohja ${protoDepthAt(this.water, lureOut ? f.lure : this.tube.pos).toFixed(1)} m`,
      `Saalis ${this.catches.length} kpl · ${formatWeight(this.catches.reduce((a, c) => a + c.weight, 0))}`,
    ]);
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
    if (events.lineBroken) {
      sfx.lost();
      hud.showMessage('Siima katkesi! Löysää jarrua (Q)', 3);
    }
    if (events.caught) {
      sfx.caught();
      this.catches.push(events.caught);
      this.fishingView.startSplash(this.fishing.lure);
      hud.showMessage(`${events.caught.name} ${formatWeight(events.caught.weight)}`, 3);
    }
    if (this.fishing.dragSlipping) sfx.dragSlip();
    this.reelClickTimer -= dt;
    if (reeling && this.reelClickTimer <= 0) {
      sfx.reelClick();
      this.reelClickTimer = 0.09 / (this.fishing.gear + 1);
    }
  }

  /** Piirtää interpoloiden edellisen ja nykyisen askeleen välillä. */
  render(alpha: number): void {
    const a = this.prevTube;
    const b = this.tube;
    const pos = {
      x: a.pos.x + (b.pos.x - a.pos.x) * alpha,
      y: a.pos.y + (b.pos.y - a.pos.y) * alpha,
    };
    this.tubeMesh.position.copy(toWorld(pos));
    this.tubeMesh.rotation.y = lerpAngle(a.heading, b.heading, alpha);
    animateFins(this.tubeMesh, b.kickPhase);
    const hooked = this.fish.fish.find((x) => x.id === this.fishing.hookedId) ?? null;
    this.fishingView.update(this.fishing, this.fishingContext(), this.aim, 1 / 60, hooked);
    this.view.apply();
  }
}
