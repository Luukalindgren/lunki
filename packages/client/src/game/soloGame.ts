import * as THREE from 'three';
import {
  LUNKINJARVI,
  chargePower,
  WaterBody,
  collideTubeWithShore,
  createTube,
  findOpenWaterPoint,
  createFishing,
  lerpAngle,
  protoDepthAt,
  stepFishing,
  stepTube,
  type FishingContext,
  type FishingState,
  type LakeMap,
  type Vec2,
  type TubeInput,
  type TubeState,
} from '@lunki/shared';
import type { Input } from '../engine/input';
import { createLakeMesh, toWorld } from '../world/lakeMesh';
import type { Hud } from '../ui/hud';
import { FishingView } from './fishingView';
import { TopDownCamera } from './topDownCamera';
import { animateFins, createTubeMesh } from './tubeMesh';

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

  constructor(
    private readonly input: Input,
    private readonly hud: Hud,
    /** Muuntaa näytön CSS-pikselin sisäiseksi pikseliksi. */
    private readonly screenToInternal: (x: number, y: number) => { x: number; y: number },
    readonly map: LakeMap = LUNKINJARVI,
  ) {
    this.water = new WaterBody(map);
    this.tube = createTube(findOpenWaterPoint(this.water, map.bounds));
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

  private fishingContext(): FishingContext {
    return {
      tubePos: this.tube.pos,
      heading: this.tube.heading,
      isWater: (p) => this.water.isWater(p),
      depthAt: (p) => protoDepthAt(this.water, p),
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
    const events = stepFishing(
      f,
      {
        aim: this.aim,
        castHeld: input.isDown('Mouse0'),
        reel: lureOut && (input.isDown('Mouse0') || input.isDown('Space')),
        cancel: input.isDown('Mouse2'),
      },
      this.fishingContext(),
      dt,
    );
    if (events.splash) this.fishingView.startSplash(events.splash);
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
    const lineOut = lureOut
      ? Math.hypot(f.lure.x - this.tube.pos.x, f.lure.y - this.tube.pos.y)
      : 0;
    this.hud.setStatus([
      `Siimaa ${lineOut.toFixed(1)} m`,
      `Viehe ${f.stage === 'water' && !f.onLand ? f.depth.toFixed(1) : '0.0'} m`,
      `Pohja ${protoDepthAt(this.water, lureOut ? f.lure : this.tube.pos).toFixed(1)} m`,
    ]);
    this.hud.update(dt);
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
    this.fishingView.update(this.fishing, this.fishingContext(), this.aim, 1 / 60);
    this.view.apply();
  }
}
