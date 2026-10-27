import { LUNKINJARVI, LUNKINJARVI_BOTTOM } from '../map/lunkinjarvi';
import { LakeBottom } from '../map/bottom';
import { WaterBody } from '../map/waterBody';
import { findLaunchPoint } from '../map/geometry';
import { Rng } from '../rng';
import type { Vec2 } from '../vec2';
import { CAST, rodTip } from './cast';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import {
  DAYTIME,
  FISH_COUNT,
  NATIVE_SPECIES,
  createFishPopulation,
  stepFishPopulation,
  type FishConditions,
} from './fish';
import { createFishing, lureInfo, stepFishing, type FishingContext } from './fishing';

/** Kalastusta tuntemattoman pelaajan saldo simulaatiosta. */
export interface NaiveResult {
  minutes: number;
  casts: number;
  follows: number;
  strikes: number;
  hooked: number;
  caught: number;
  missed: number;
  escaped: number;
  lineBroken: number;
  snagged: number;
  lureLost: number;
}

let lake: { water: WaterBody; bottom: LakeBottom } | null = null;
function lunkinjarvi() {
  if (!lake) {
    const water = new WaterBody(LUNKINJARVI);
    const bottom = new LakeBottom(
      water,
      LUNKINJARVI.bounds,
      LUNKINJARVI_BOTTOM,
      LUNKINJARVI.reeds,
      LUNKINJARVI.piers,
    );
    lake = { water, bottom };
  }
  return lake;
}

/**
 * Naiivi pelaaja Lunkinjärvellä: heittää satunnaiseen suuntaan satunnaisella
 * voimalla, kelaa tasaisesti normaalivaihteella eikä koske jarruun tai
 * varusteisiin. Pohjaan tarttunutta kelataan, maalle juuttunut katkaistaan.
 * Paikka vaihtuu `move` sekunnin välein (rannan lähelle, kuin potkien).
 */
export function simulateNaiveAngler(
  difficulty: Difficulty,
  seed: number,
  minutes = 10,
  opts: { dt?: number; move?: number; cond?: FishConditions } = {},
): NaiveResult {
  const dt = opts.dt ?? 1 / 30;
  const move = opts.move ?? 120;
  const cond = opts.cond ?? DAYTIME;
  const { water, bottom } = lunkinjarvi();
  const rng = new Rng(seed);
  const me = new Rng(seed ^ 0x9e3779b9);
  const world = {
    isWater: (p: Vec2) => water.isWater(p),
    depthAt: (p: Vec2) => bottom.depthAt(p),
  };
  const pop = createFishPopulation(
    { ...world, structures: bottom.structures },
    LUNKINJARVI.bounds,
    rng,
    FISH_COUNT,
    [...NATIVE_SPECIES],
  );
  const diff = DIFFICULTIES[difficulty];
  const s = createFishing();
  const r: NaiveResult = {
    minutes,
    casts: 0,
    follows: 0,
    strikes: 0,
    hooked: 0,
    caught: 0,
    missed: 0,
    escaped: 0,
    lineBroken: 0,
    snagged: 0,
    lureLost: 0,
  };
  let pos = { x: 0, y: 0 };
  let heading = 0;
  const relocate = () => {
    pos = findLaunchPoint(water, LUNKINJARVI.bounds, () => me.next());
    const shore = water.closestShorePoint(pos)?.point ?? pos;
    heading = Math.atan2(pos.y - shore.y, pos.x - shore.x);
  };
  relocate();
  let nextMove = move;
  let charge = 0;
  let aim = pos;
  const end = minutes * 60;
  for (let t = 0; t < end; t += dt) {
    if (t >= nextMove && s.stage === 'idle') {
      relocate();
      nextMove = t + move;
    }
    const ctx: FishingContext = {
      tubePos: pos,
      heading,
      ...world,
      structureAt: (p) => bottom.structureAt(p),
      bottomTypeAt: (p) => bottom.bottomTypeAt(p),
    };
    const fe = stepFishPopulation(pop, lureInfo(s, ctx), world, diff, rng, dt, cond);
    if (fe.follow !== undefined) r.follows++;
    if (s.stage === 'idle' && charge <= 0) {
      // Uusi heitto: suunta katseen ympäriltä, voimamittari pysäytetään sattumalta.
      const a = heading + me.range(-1.2, 1.2);
      const tip = rodTip(pos, heading);
      aim = { x: tip.x + Math.cos(a) * 20, y: tip.y + Math.sin(a) * 20 };
      charge = me.range(0.35, 1) * CAST.chargeTime;
    }
    const charging = s.stage === 'idle' || s.stage === 'charging';
    const castHeld = charging && charge > 0 && !(s.stage === 'idle' && s.needRelease);
    if (s.stage === 'charging') charge -= dt;
    const ev = stepFishing(
      s,
      {
        aim,
        castHeld,
        reel: s.stage === 'water',
        cancel: false,
        cut: s.stage === 'water' && s.onLand,
      },
      { ...ctx, fish: { pop, diff, rng, strike: fe.strike } },
      dt,
    );
    if (ev.cast !== undefined) {
      r.casts++;
      charge = 0;
    }
    if (ev.strike) r.strikes++;
    if (ev.hooked) r.hooked++;
    if (ev.caught) r.caught++;
    if (ev.missed) r.missed++;
    if (ev.escaped) r.escaped++;
    if (ev.lineBroken) r.lineBroken++;
    if (ev.snagged) r.snagged++;
    if (ev.lureLost) r.lureLost++;
  }
  return r;
}
