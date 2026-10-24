import { distance, type Vec2 } from '../vec2';
import type { Rng } from '../rng';
import type { DifficultyParams } from './difficulty';
import {
  SPECIES,
  spawnFish,
  stepHookedFish,
  type FishPopulation,
  type LureInfo,
  type SpeciesId,
} from './fish';
import { createLine, stepLine, straightenLine, type VerletLine } from './line';
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
  /** Jarrun säätö tällä askeleella: -1 löysää, +1 kiristää. */
  dragDelta?: number;
  /** Kelan vaihde 0–2, jos vaihdettiin tällä askeleella. */
  gear?: number;
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
  /** Ulkona olevan siiman pituus (m). */
  lineLength: number;
  line: VerletLine;
  /** Siiman jännitys (kg). */
  tension: number;
  /** Jarrun asetus (kg): tätä suurempi veto vie siimaa kelalta. */
  drag: number;
  /** Kelan vaihde: indeksi REEL.gears-taulukkoon. */
  gear: number;
  /** Vieheen nopeus vedessä (m/s), syvyyttä ja kalojen kiinnostusta varten. */
  lureSpeed: number;
  /** Onko jarru luistanut tällä askeleella (äänimerkkiä varten). */
  dragSlipping: boolean;
  /** Vieheeseen iskenyt kala, joka ei vielä ole tarttunut, ja iskusta kulunut aika. */
  struckId: number | null;
  strikeAge: number;
  /** Väsytettävä kala. */
  hookedId: number | null;
}

export interface FishingContext {
  tubePos: Vec2;
  heading: number;
  isWater(p: Vec2): boolean;
  depthAt(p: Vec2): number;
  /** Kalat: ilman tätä kalastetaan tyhjää järveä (testit, harjoittelu). */
  fish?: {
    pop: FishPopulation;
    diff: DifficultyParams;
    rng: Rng;
    /** Kala, joka iski tällä askeleella (stepFishPopulation). */
    strike?: number | undefined;
  };
}

export const LURE = {
  /** Uppoamisnopeus löysällä siimalla (m/s). */
  sinkRate: 0.35,
  /** Liikkuva viehe nousee: nousu (m/s) per vieheen nopeus (m/s). */
  lift: 0.5,
  /** Vieheen vastus vedessä: jännitys = base + coeff · v² (kg). */
  dragBase: 0.05,
  dragCoeff: 0.35,
  /** Rannalla raahattavan vieheen kitka (kg). */
  landFriction: 0.6,
  /** Viehe on kotona, kun se on näin lähellä vavan kärkeä. */
  homeDistance: 1.5,
} as const;

export const REEL = {
  /** Kelausnopeudet (m/s) vaihteittain: hidas, normaali, nopea. */
  gears: [0.45, 0.9, 1.5],
  /** Jarrun säätöväli ja askel (kg). */
  minDrag: 0.25,
  maxDrag: 8,
  dragStep: 0.25,
  defaultDrag: 2,
  /** Siiman kestävyys (kg), 0,25 mm monofiili. */
  lineStrength: 5,
  /** Kelan kapasiteetti (m). */
  spool: 150,
  /** Löysää siimaa veteen osuessa (osuus heiton pituudesta). */
  landingSlack: 0.04,
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
  lineLength: 0,
  line: createLine({ x: 0, y: 0 }, { x: 0, y: 0 }),
  tension: 0,
  drag: REEL.defaultDrag,
  gear: 1,
  lureSpeed: 0,
  dragSlipping: false,
  struckId: null,
  strikeAge: 0,
  hookedId: null,
});

export interface Catch {
  species: SpeciesId;
  name: string;
  weight: number;
}

export interface FishingEvents {
  cast?: number;
  splash?: Vec2;
  home?: boolean;
  /** Kala iski (tärppi). */
  strike?: boolean;
  /** Kala tarttui. */
  hooked?: boolean;
  /** Isku meni ohi (ei vastaiskua ajoissa). */
  missed?: boolean;
  /** Kala irtosi väsytyksessä. */
  escaped?: boolean;
  /** Siima katkesi. */
  lineBroken?: boolean;
  caught?: Catch;
}

export const FIGHT = {
  /** Kala nostetaan, kun se on näin lähellä vavan kärkeä ja pinnassa. */
  landDistance: 2.2,
  landDepth: 1,
  /** Kalan vastus vedettäessä: kg per kg kalaa ja per (m/s)². */
  bodyDrag: 0.3,
  /** Siimaa ei voi kelata tätä lyhyemmäksi kalan ollessa kiinni. */
  minLine: 1.2,
} as const;

/** Vieheen tiedot kalojen tekoälylle. */
export function lureInfo(s: FishingState, ctx: FishingContext): LureInfo | null {
  if (s.stage !== 'water' || s.onLand) return null;
  return {
    pos: s.lure,
    depth: s.depth,
    speed: s.lureSpeed,
    fishable: s.hookedId === null,
    tip: rodTip(ctx.tubePos, ctx.heading),
  };
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
  if (input.dragDelta) {
    s.drag = Math.max(
      REEL.minDrag,
      Math.min(REEL.maxDrag, s.drag + Math.sign(input.dragDelta) * REEL.dragStep),
    );
  }
  if (input.gear !== undefined) s.gear = Math.max(0, Math.min(REEL.gears.length - 1, input.gear));
  s.dragSlipping = false;

  switch (s.stage) {
    case 'idle':
      s.lure = tip;
      s.depth = 0;
      s.lineLength = 0;
      s.tension = 0;
      s.lureSpeed = 0;
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
      s.lineLength = Math.min(REEL.spool, f.travelled);
      straightenLine(s.line, tip, s.lure);
      if (landed) {
        s.flight = null;
        s.stage = 'water';
        s.onLand = !ctx.isWater(s.lure);
        s.depth = 0;
        s.lineLength = Math.min(REEL.spool, distance(tip, s.lure) * (1 + REEL.landingSlack));
        if (!s.onLand) events.splash = { ...s.lure };
      }
      break;
    }

    case 'water': {
      const reeling = input.reel && !input.cancel;
      const fish = ctx.fish;
      const hooked =
        s.hookedId !== null && fish ? fish.pop.fish.find((f) => f.id === s.hookedId) : undefined;
      const minLine = hooked ? FIGHT.minLine : 0;
      if (reeling) s.lineLength = Math.max(minLine, s.lineLength - REEL.gears[s.gear]! * dt);

      if (fish && s.struckId === null && !hooked && fish.strike !== undefined) {
        s.struckId = fish.strike;
        s.strikeAge = 0;
        events.strike = true;
      }
      if (fish && s.struckId !== null) resolveStrike(s, reeling, fish, events, dt);

      if (hooked && fish) {
        fight(s, hooked, tip, ctx, fish, events, dt);
      } else {
        pullLure(s, tip, dt);
        if (s.onLand && ctx.isWater(s.lure)) s.onLand = false;
        if (!s.onLand) {
          const bottom = ctx.depthAt(s.lure);
          const rate = LURE.sinkRate - LURE.lift * s.lureSpeed;
          s.depth = Math.max(0, Math.min(bottom, s.depth + rate * dt));
        }
      }
      stepLine(s.line, tip, s.lure, s.lineLength, dt, { x: 0.15, y: 0.1 });

      if (s.hookedId === null && distance(s.lure, tip) <= LURE.homeDistance) {
        resetFishing(s);
        events.home = true;
      }
      break;
    }
  }
  return events;
}

/**
 * Siima vetää viehettä kohti vavan kärkeä, jos se on kireällä. Jos vieheen
 * vastus ylittäisi jarrun, jarru luistaa ja kela antaa siimaa.
 */
function pullLure(s: FishingState, tip: Vec2, dt: number): void {
  const d = distance(s.lure, tip);
  const over = d - s.lineLength;
  if (over <= 0 || d === 0) {
    s.tension = 0;
    s.lureSpeed = 0;
    return;
  }
  let speed = over / dt;
  let tension = (s.onLand ? LURE.landFriction : LURE.dragBase) + LURE.dragCoeff * speed * speed;
  if (tension > s.drag) {
    // Nopeus, jolla vastus on täsmälleen jarrun suuruinen.
    const base = s.onLand ? LURE.landFriction : LURE.dragBase;
    speed = Math.sqrt(Math.max(0, s.drag - base) / LURE.dragCoeff);
    tension = s.drag;
    s.dragSlipping = true;
  }
  const move = Math.min(over, speed * dt);
  s.lure = {
    x: s.lure.x + ((tip.x - s.lure.x) / d) * move,
    y: s.lure.y + ((tip.y - s.lure.y) / d) * move,
  };
  s.lineLength = Math.min(REEL.spool, distance(s.lure, tip));
  s.tension = tension;
  s.lureSpeed = move / dt;
}

/** Viehe takaisin kelalle (esim. kun palvelin hylkää heiton). */
export function resetFishing(s: FishingState): void {
  s.stage = 'idle';
  s.needRelease = true;
  s.lineLength = 0;
  s.tension = 0;
  s.struckId = null;
  s.hookedId = null;
}

/** Iskun jälkeen: tarttuuko kala (vastaisku = kelaus ajoissa) vai sylkeekö se vieheen. */
function resolveStrike(
  s: FishingState,
  reeling: boolean,
  fish: NonNullable<FishingContext['fish']>,
  events: FishingEvents,
  dt: number,
): void {
  const f = fish.pop.fish.find((x) => x.id === s.struckId);
  if (!f || f.mode !== 'struck') {
    s.struckId = null;
    return;
  }
  s.strikeAge += dt;
  const { diff, rng } = fish;
  if (diff.autoHook || (reeling && s.strikeAge <= diff.hookWindow)) {
    s.struckId = null;
    if (diff.autoHook || rng.next() < diff.hookChance) {
      f.mode = 'hooked';
      f.stamina = 1;
      f.running = true;
      f.timer = rng.range(1, 2.5);
      f.slack = 0;
      s.hookedId = f.id;
      events.hooked = true;
    } else {
      f.mode = 'roam';
      f.cooldown = rng.range(10, 20);
      events.missed = true;
    }
  } else if (s.strikeAge > diff.hookWindow) {
    s.struckId = null;
    f.mode = 'roam';
    f.cooldown = rng.range(10, 20);
    events.missed = true;
  }
}

/** Väsytys: kala ui ja vetää, siima ja jarru rajoittavat, kelaus tuo lähemmäs. */
function fight(
  s: FishingState,
  f: FishPopulation['fish'][number],
  tip: Vec2,
  ctx: FishingContext,
  fish: NonNullable<FishingContext['fish']>,
  events: FishingEvents,
  dt: number,
): void {
  const { diff, rng, pop } = fish;
  const world = { isWater: ctx.isWater, depthAt: ctx.depthAt };
  const res = stepHookedFish(f, tip, s.tension, world, diff, rng, dt);

  const speed = res.outSpeed;
  let next = {
    x: f.pos.x + Math.cos(f.heading) * Math.abs(speed) * dt,
    y: f.pos.y + Math.sin(f.heading) * Math.abs(speed) * dt,
  };
  if (!ctx.isWater(next)) {
    f.heading += Math.PI / 2;
    next = { ...f.pos };
  }

  // Kalan veto siiman suuntaan: pakeneva kala vetää täysillä, sivulle uiva vähemmän.
  const away = Math.atan2(f.pos.y - tip.y, f.pos.x - tip.x);
  const outward = Math.max(0.25, Math.cos(f.heading - away));
  let raw = res.pull * outward;

  const d = distance(next, tip);
  let tension = 0;
  if (d > s.lineLength) {
    const pulledSpeed = (d - s.lineLength) / dt;
    raw += f.weight * FIGHT.bodyDrag * (1 + pulledSpeed * pulledSpeed);
    if (raw > s.drag) {
      // Jarru luistaa: kala vie siimaa.
      s.lineLength = Math.min(REEL.spool, d);
      tension = s.drag;
      s.dragSlipping = true;
    } else {
      next = {
        x: tip.x + ((next.x - tip.x) / d) * s.lineLength,
        y: tip.y + ((next.y - tip.y) / d) * s.lineLength,
      };
      tension = raw;
    }
  }
  s.tension = tension;
  f.pos = next;
  // Siiman pituus rajaa syvyyttä: lähelle kelattu kala nousee.
  f.depth = Math.min(f.depth, s.lineLength * 0.7);
  s.lure = { ...f.pos };
  s.depth = f.depth;
  s.lureSpeed = 0;

  if (diff.lineCanBreak && tension > REEL.lineStrength) {
    events.lineBroken = true;
    release(f, rng);
    resetFishing(s);
    return;
  }

  f.slack = tension > 0.01 ? 0 : f.slack + dt;
  if (f.slack > diff.slackEscape) {
    events.escaped = true;
    release(f, rng);
    s.hookedId = null;
    return;
  }

  if (distance(f.pos, tip) <= FIGHT.landDistance && f.depth <= FIGHT.landDepth) {
    const sp = SPECIES[f.species];
    events.caught = { species: f.species, name: sp.name, weight: f.weight };
    // Saatu kala poistuu ja järveen ilmestyy uusi jonnekin muualle.
    const idx = pop.fish.indexOf(f);
    pop.fish[idx] = spawnFish(pop, f.species, respawnPoint(pop, f, rng), world, rng);
    resetFishing(s);
  }
}

function release(f: FishPopulation['fish'][number], rng: Rng) {
  f.mode = 'roam';
  f.cooldown = rng.range(20, 40);
  f.stamina = 1;
}

/** Uusi kala syntyy jonkin toisen kalan lähelle (parvet säilyvät). */
function respawnPoint(pop: FishPopulation, caught: { id: number }, rng: Rng): Vec2 {
  const others = pop.fish.filter((x) => x.id !== caught.id && x.mode === 'roam');
  const host = others[Math.floor(rng.next() * others.length)];
  return host ? { ...host.pos } : { x: 0, y: 0 };
}
