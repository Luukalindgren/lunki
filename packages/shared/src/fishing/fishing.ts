import { distance, type Vec2 } from '../vec2';
import {
  chargePower,
  clampCastAngle,
  launchLure,
  rodTip,
  stepFlight,
  type LureFlight,
} from './cast';

/** Kalastuksen vaiheet: vapa valmiina, heiton lataus, viehe ilmassa, viehe vedessä. */
export type FishingStage = 'idle' | 'charging' | 'flight' | 'water';

export interface FishingInput {
  /** Tähtäyspiste maailmassa (hiiri). */
  aim: Vec2;
  /** Heittonappi pohjassa (hiiren vasen). */
  castHeld: boolean;
  /** Kelaus (hiiren vasen vieheen ollessa vedessä, tai välilyönti). */
  reel: boolean;
  /** Peruu latauksen (hiiren oikea). */
  cancel: boolean;
}

export interface FishingState {
  stage: FishingStage;
  /** Latausaika sekunteina. */
  charge: number;
  /** Viimeisimmän heiton voima 0–1. */
  power: number;
  flight: LureFlight | null;
  /** Vieheen sijainti vaakatasossa ja syvyys (m, positiivinen alaspäin). */
  lure: Vec2;
  depth: number;
  /** Onko viehe maalla (heitetty rannalle). */
  onLand: boolean;
  /** Heittonappi pitää päästää irti ennen uutta latausta (esim. kelauksen jälkeen). */
  needRelease: boolean;
}

export interface FishingContext {
  tubePos: Vec2;
  heading: number;
  isWater(p: Vec2): boolean;
  depthAt(p: Vec2): number;
}

export const LURE = {
  /** Uppoamisnopeus löysällä siimalla (m/s). */
  sinkRate: 0.35,
  /** Kelausnopeus (m/s). */
  reelSpeed: 0.9,
  /** Kelatessa viehe nousee: nousu (m/s) per kelausnopeus. */
  lift: 0.5,
  /** Viehe on kotona, kun se on näin lähellä vavan kärkeä. */
  homeDistance: 1.5,
} as const;

export const createFishing = (): FishingState => ({
  stage: 'idle',
  charge: 0,
  power: 0,
  flight: null,
  lure: { x: 0, y: 0 },
  depth: 0,
  onLand: false,
  needRelease: false,
});

export interface FishingEvents {
  cast?: number;
  splash?: Vec2;
  home?: boolean;
}

/** Heiton suunta: hiiren suunta renkaasta, rajattuna kalastajan ulottuville. */
export function castAngle(ctx: FishingContext, aim: Vec2): number {
  const tip = rodTip(ctx.tubePos, ctx.heading);
  return clampCastAngle(Math.atan2(aim.y - tip.y, aim.x - tip.x), ctx.heading);
}

/** Etenee yhden askeleen. Muokkaa tilaa paikallaan ja palauttaa askeleen tapahtumat. */
export function stepFishing(
  s: FishingState,
  input: FishingInput,
  ctx: FishingContext,
  dt: number,
): FishingEvents {
  const events: FishingEvents = {};
  const tip = rodTip(ctx.tubePos, ctx.heading);

  switch (s.stage) {
    case 'idle':
      s.lure = tip;
      s.depth = 0;
      if (!input.castHeld) s.needRelease = false;
      else if (!s.needRelease) {
        s.stage = 'charging';
        s.charge = 0;
      }
      break;

    case 'charging':
      s.lure = tip;
      if (input.cancel) {
        s.stage = 'idle';
        break;
      }
      if (input.castHeld) {
        s.charge += dt;
        break;
      }
      s.power = chargePower(s.charge);
      s.flight = launchLure(tip, castAngle(ctx, input.aim), s.power);
      s.stage = 'flight';
      events.cast = s.power;
      break;

    case 'flight': {
      const f = s.flight!;
      const landed = stepFlight(f, dt);
      s.lure = { ...f.pos };
      if (landed) {
        s.flight = null;
        s.stage = 'water';
        s.onLand = !ctx.isWater(s.lure);
        s.depth = 0;
        if (!s.onLand) events.splash = { ...s.lure };
      }
      break;
    }

    case 'water': {
      const toTip = distance(s.lure, tip);
      const reeling = input.reel && !input.cancel;
      if (reeling && toTip > 0) {
        const step = Math.min(toTip, LURE.reelSpeed * dt);
        s.lure = {
          x: s.lure.x + ((tip.x - s.lure.x) / toTip) * step,
          y: s.lure.y + ((tip.y - s.lure.y) / toTip) * step,
        };
      }
      if (s.onLand && ctx.isWater(s.lure)) s.onLand = false;
      if (!s.onLand) {
        const bottom = ctx.depthAt(s.lure);
        const rate = LURE.sinkRate - (reeling ? LURE.lift * LURE.reelSpeed : 0);
        s.depth = Math.max(0, Math.min(bottom, s.depth + rate * dt));
      }
      if (distance(s.lure, tip) <= LURE.homeDistance) {
        s.stage = 'idle';
        s.needRelease = true;
        events.home = true;
      }
      break;
    }
  }
  return events;
}
