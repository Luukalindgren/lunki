import * as THREE from 'three';
import {
  LUNKINJARVI,
  WaterBody,
  collideTubeWithShore,
  createTube,
  findOpenWaterPoint,
  lerpAngle,
  stepTube,
  type LakeMap,
  type TubeInput,
  type TubeState,
} from '@lunki/shared';
import type { Input } from '../engine/input';
import { createLakeMesh, toWorld } from '../world/lakeMesh';
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

  constructor(
    private readonly input: Input,
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
    this.view.snapTo(this.tube.pos);
  }

  update(dt: number): void {
    if (this.input.wheel !== 0) this.view.zoom(this.input.wheel);
    this.prevTube = this.tube;
    const next = stepTube(this.tube, readTubeInput(this.input), dt);
    this.tube = collideTubeWithShore(this.tube, next, this.water);
    this.view.follow(this.tube.pos, dt, 3);
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
    this.view.apply();
  }
}
