import type { Structure } from '../map/bottom';
import type { BottomType } from '../map/scatter';
import { distance, type Vec2 } from '../vec2';
import type { Rng } from '../rng';
import type { DifficultyParams } from './difficulty';
import {
  SPECIES,
  fishHome,
  spawnFish,
  stepHookedFish,
  type FishPopulation,
  type LureInfo,
  type SpeciesId,
} from './fish';
import {
  DEFAULT_TACKLE,
  RODS,
  breakingStrength,
  LURES,
  PIKE_BITE_OFF_RATE,
  tackleCastFactor,
  type Tackle,
} from './gear';
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
  /** Uudet varusteet; vaihtuvat vain vieheen ollessa kelalla. */
  tackle?: Tackle;
  /** Katkaisee siiman, kun viehe on juuttunut maalle (C). */
  cut?: boolean;
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
  /**
   * Viehe on heitetty maalle tai laiturille ja juuttunut kiinni: sitä ei saa
   * kelattua takaisin, vaan siima on katkaistava.
   */
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
  /** Viehe, siima ja peruke. */
  tackle: Tackle;
  /** Pohjaan tarttunut viehe: kuinka kauan sitä on yritetty irrottaa (s), null = vapaa. */
  snag: number | null;
  /** Kevyt tartunta (jigi liejussa): irtoaa aina ensimmäisellä vedolla. */
  softSnag: boolean;
  /** Viehe on kerännyt uposkasvustosta rikkaa: kalat eivät juuri kiinnostu ennen puhdistusta. */
  fouled: boolean;
}

export interface FishingContext {
  tubePos: Vec2;
  heading: number;
  isWater(p: Vec2): boolean;
  depthAt(p: Vec2): number;
  /** Tuulen nopeusvektori (m/s): kaartaa heittoa. */
  wind?: Vec2;
  /** Rakenne (kivikko, puu) vieheen kohdalla: viehe voi tarttua pohjaan. */
  structureAt?(p: Vec2): Structure | null;
  /** Pohjan laatu: liejussa jigi tarttuu kevyesti, kivikossa se kolisee. */
  bottomTypeAt?(p: Vec2): BottomType;
  /** Kalat: ilman tätä kalastetaan tyhjää järveä (testit, harjoittelu). */
  fish?: {
    pop: FishPopulation;
    diff: DifficultyParams;
    rng: Rng;
    /** Kala, joka iski tällä askeleella (stepFishPopulation). */
    strike?: number | undefined;
  };
}

/** Kaikille vieheille yhteiset vakiot; uppoaminen ja uinti ovat vieheen ominaisuuksia (LURES). */
export const LURE = {
  /** Vieheen vastus vedessä: jännitys = base + coeff · v² (kg). */
  dragBase: 0.05,
  dragCoeff: 0.35,
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
  /** Kelan kapasiteetti (m). */
  spool: 150,
  /** Löysää siimaa veteen osuessa (osuus heiton pituudesta). */
  landingSlack: 0.04,
} as const;

export const createFishing = (tackle: Tackle = DEFAULT_TACKLE): FishingState => ({
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
  tackle: { ...tackle },
  snag: null,
  softSnag: false,
  fouled: false,
});

/** Kalan tunniste kalakannassa: paikka (indeksi) ja sukupolvi. */
export interface FishTag {
  slot: number;
  gen: number;
}

/** Verkosta tulleen kalatunnisteen tarkistus. */
export function isFishTag(v: unknown): v is FishTag {
  const t = v as Partial<FishTag> | null;
  return (
    !!t &&
    Number.isInteger(t.slot) &&
    Number.isInteger(t.gen) &&
    t.slot! >= 0 &&
    t.slot! < 10000 &&
    t.gen! >= 0 &&
    t.gen! < 65536
  );
}

export interface Catch {
  species: SpeciesId;
  name: string;
  weight: number;
  /** Mikä kala saatiin (moninpelissä sama kala voidaan nostaa vain kerran). */
  fish?: FishTag;
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
  /** Hauki katkaisi siiman hampaillaan (ei peruketta). */
  bitOff?: boolean;
  /** Varusteet vaihdettiin. */
  tackleChanged?: boolean;
  /** Viehe tarttui pohjaan / irtosi / jäi pohjaan (siima katkesi). */
  snagged?: boolean;
  unsnagged?: boolean;
  /** Viehe keräsi rikkaa uposkasvustosta. */
  fouled?: boolean;
  /** Jigi kolahti kivikkopohjaan (ääni). */
  rattle?: boolean;
  lureLost?: boolean;
  /** Viehe juuttui maalle tai laiturille. */
  stuck?: boolean;
  /** Pelaaja katkaisi siiman maalle juuttuneen vieheen takia. */
  lineCut?: boolean;
  caught?: Catch;
}

/** Pohjaan tarttuminen kivikossa ja kaatuneen puun oksissa. */
export const SNAG = {
  /** Todennäköisyys sekunnissa, kun liikkuva viehe hipoo pohjaa rakenteen kohdalla. */
  rate: 0.9,
  /** Kuinka lähellä pohjaa (m) viehe voi tarttua. */
  nearBottom: 0.35,
  /** Irrotusyrityksen kesto (s) ja onnistumisen todennäköisyys. */
  pullTime: 1.2,
  freeChance: 0.6,
  /** Tartuntariskin kerroin rakenteittain; kasvusto vie viehettä vain harvoin. */
  kindRisk: {
    rocks: 1,
    tree: 1.2,
    reeds: 1,
    dropoff: 0,
    boulder: 1.5,
    brush: 1.6,
    weed: 0.12,
  } satisfies Record<Structure['kind'], number>,
  /** Liejupohjaa laahaavan jigin kevyt tartunta (todennäköisyys sekunnissa). */
  mudRate: 0.15,
} as const;

/** Uposkasvustot (#226). */
export const WEED = {
  /** Todennäköisyys sekunnissa täysin tiheässä kasvustossa, että viehe kerää rikkaa. */
  foulRate: 1.5,
} as const;

/** Kivikkopohjassa jigi kolisee (kertaa sekunnissa pohjaa laahatessa). */
const RATTLE_RATE = 2.5;

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
    tackle: s.tackle,
    fouled: s.fouled,
    snagged: s.snag !== null,
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
  if (input.tackle && (s.stage === 'idle' || s.stage === 'charging')) {
    s.tackle = { ...input.tackle };
    events.tackleChanged = true;
  }
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
      s.flight = launchLure(tip, castAngle(ctx, input.aim), s.power, tackleCastFactor(s.tackle));
      s.stage = 'flight';
      events.cast = s.power;
      break;

    case 'flight': {
      const f = s.flight!;
      const landed = stepFlight(f, dt, ctx.wind);
      s.lure = { ...f.pos };
      s.lineLength = Math.min(REEL.spool, f.travelled);
      straightenLine(s.line, tip, s.lure);
      if (landed) {
        s.flight = null;
        s.stage = 'water';
        // Laiturit ovat vesialueessa saarina, joten nekin ovat "maata".
        s.onLand = !ctx.isWater(s.lure);
        s.depth = 0;
        s.lineLength = Math.min(REEL.spool, distance(tip, s.lure) * (1 + REEL.landingSlack));
        if (s.onLand) events.stuck = true;
        else events.splash = { ...s.lure };
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

      if (s.onLand) {
        holdStuck(s, tip, reeling, input.cut === true, events);
        if (s.stage !== 'water') break;
      } else if (hooked && fish) {
        fight(s, hooked, tip, ctx, fish, events, dt);
      } else if (s.snag !== null) {
        pullSnag(s, tip, reeling, fish, events, dt);
        if (s.stage !== 'water') break;
      } else {
        pullLure(s, tip, dt);
        const lure = LURES[s.tackle.lure];
        const rate = lure.sinkRate - lure.lift * s.lureSpeed;
        // Vaappu sukeltaa vain lippansa syvyyteen; syvemmältä se ei kelatessa painu.
        const bottom = ctx.depthAt(s.lure);
        const limit = Math.min(bottom, Math.max(lure.maxDepth, s.depth));
        s.depth = Math.max(0, Math.min(limit, s.depth + rate * dt));
        if (s.lureSpeed > 0.05 && s.struckId === null && fish)
          touchBottom(s, ctx, bottom, fish.rng, events, dt);
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
 * Liikkuva viehe rakenteen kohdalla tai pohjassa: tarttuu kiveen, oksiin tai
 * risukkoon, kerää rikkaa kasvustosta, tarttuu kevyesti liejuun tai kolisee
 * kivikossa. Kivet, kasvustot ja risukot kohoavat pohjasta korkeutensa verran;
 * kaislikon varret ulottuvat pintaan asti.
 */
function touchBottom(
  s: FishingState,
  ctx: FishingContext,
  bottom: number,
  rng: Rng,
  events: FishingEvents,
  dt: number,
): void {
  const lure = LURES[s.tackle.lure];
  const structure = ctx.structureAt?.(s.lure);
  if (structure) {
    const top = bottom - (structure.height ?? 0) - SNAG.nearBottom;
    if (structure.kind === 'reeds' || s.depth >= top) {
      const density = structure.density ?? 1;
      if (structure.kind === 'weed' && !s.fouled && rng.chance(WEED.foulRate * density, dt)) {
        s.fouled = true;
        events.fouled = true;
      }
      // Kasvusto tarttuu vain tiheänä; vieheen muoto ei siinä auta.
      const risk =
        SNAG.kindRisk[structure.kind] *
        (structure.kind === 'weed' ? density * density : lure.snagRisk);
      if (risk > 0 && rng.chance(SNAG.rate * risk, dt)) {
        snagLure(s, false, events);
        return;
      }
    }
  }
  if (s.depth < bottom - 0.05 || !ctx.bottomTypeAt || s.tackle.lure !== 'jig') return;
  const floor = ctx.bottomTypeAt(s.lure);
  if (floor === 'mud' && rng.chance(SNAG.mudRate, dt)) snagLure(s, true, events);
  else if (floor === 'rock' && rng.chance(RATTLE_RATE, dt)) events.rattle = true;
}

function snagLure(s: FishingState, soft: boolean, events: FishingEvents): void {
  s.snag = 0;
  s.softSnag = soft;
  s.lureSpeed = 0;
  events.snagged = true;
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
  let tension = LURE.dragBase + LURE.dragCoeff * speed * speed;
  if (tension > s.drag) {
    // Nopeus, jolla vastus on täsmälleen jarrun suuruinen.
    speed = Math.sqrt(Math.max(0, s.drag - LURE.dragBase) / LURE.dragCoeff);
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

/**
 * Maalle tai laiturille juuttunut viehe ei irtoa: kelaaminen vain kiristää
 * siiman, ja ainoa keino on katkaista siima (viehe jää maalle).
 */
function holdStuck(
  s: FishingState,
  tip: Vec2,
  reeling: boolean,
  cut: boolean,
  events: FishingEvents,
): void {
  s.lureSpeed = 0;
  s.lineLength = Math.max(s.lineLength, distance(s.lure, tip));
  s.tension = reeling ? s.drag : 0;
  if (!cut) return;
  events.lineCut = true;
  events.lureLost = true;
  resetFishing(s);
}

/**
 * Pohjaan tarttunut viehe: kelaaminen kiristää siiman jarrun voimalla ja
 * hetken vedon jälkeen viehe joko irtoaa tai siima katkeaa ja viehe jää pohjaan.
 */
function pullSnag(
  s: FishingState,
  tip: Vec2,
  reeling: boolean,
  fish: FishingContext['fish'],
  events: FishingEvents,
  dt: number,
): void {
  s.lureSpeed = 0;
  // Viehe ei liiku: kelattu siima vain kiristyy (rengas voi silti ajautua kauemmas).
  s.lineLength = Math.max(s.lineLength, distance(s.lure, tip));
  if (!reeling) {
    s.tension = 0;
    return;
  }
  s.tension = s.drag;
  s.snag = (s.snag ?? 0) + dt;
  // Liian kireä jarru katkaisee siiman heti.
  const snap = fish?.diff.lineCanBreak === true && s.drag > breakingStrength(s.tackle);
  if (!snap && s.snag < SNAG.pullTime) return;
  if (!snap && (s.softSnag || (fish?.rng.next() ?? 0) < SNAG.freeChance)) {
    s.snag = null;
    s.softSnag = false;
    events.unsnagged = true;
  } else {
    events.lineBroken = true;
    events.lureLost = true;
    resetFishing(s);
  }
}

/**
 * Viehe takaisin kelalle (esim. kun palvelin hylkää heiton). Jos kala oli
 * kiinni, `fish` vapauttaa sen: muuten se jäisi jumiin väsytystilaan.
 */
export function resetFishing(s: FishingState, fish?: { pop: FishPopulation; rng: Rng }): void {
  const hooked =
    fish && s.hookedId !== null ? fish.pop.fish.find((f) => f.id === s.hookedId) : null;
  if (hooked?.mode === 'hooked') release(hooked, fish!.rng);
  s.snag = null;
  s.softSnag = false;
  // Kotiin kelattu viehe puhdistetaan rikasta.
  s.fouled = false;
  s.onLand = false;
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
  const res = stepHookedFish(f, tip, s.tension, world, diff, rng, dt, RODS[s.tackle.rod].power);

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

  if (diff.lineCanBreak && tension > breakingStrength(s.tackle)) {
    events.lineBroken = true;
    release(f, rng);
    resetFishing(s);
    return;
  }
  if (
    diff.lineCanBreak &&
    f.species === 'pike' &&
    !s.tackle.leader &&
    rng.chance(PIKE_BITE_OFF_RATE, dt)
  ) {
    events.lineBroken = true;
    events.bitOff = true;
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
    const slot = pop.fish.indexOf(f);
    events.caught = {
      species: f.species,
      name: sp.name,
      weight: f.weight,
      fish: { slot, gen: f.gen },
    };
    replaceFish(pop, slot, world, rng);
    resetFishing(s);
  }
}

/**
 * Saatu kala poistuu ja järveen ilmestyy uusi saman lajin parven luo (seuraava
 * sukupolvi). Paikka ja paino tulevat kannan siemenestä, joten ne ovat samat
 * kaikilla pelaajilla ja palvelimella.
 */
export function replaceFish(
  pop: FishPopulation,
  slot: number,
  world: Parameters<typeof spawnFish>[3],
  rng: Rng,
): void {
  const f = pop.fish[slot];
  if (!f) return;
  const gen = f.gen + 1;
  const home = fishHome(pop, slot, gen);
  const pos = home ? { ...home } : respawnPoint(pop, f, rng);
  pop.fish[slot] = spawnFish(pop, f.species, pos, world, rng, slot, gen);
}

/**
 * Moninpeli: toinen pelaaja nosti kalan. Jos sama kala on vielä omassa
 * kopiossa, se korvautuu. Palauttaa true, jos kala oli juuri omassa
 * väsytyksessä (silloin oma kalastus nollataan).
 */
export function removeCaughtFish(
  s: FishingState,
  pop: FishPopulation,
  tag: FishTag,
  world: Parameters<typeof spawnFish>[3],
  rng: Rng,
): boolean {
  const f = pop.fish[tag.slot];
  if (!f || f.gen !== tag.gen) return false;
  const mine = s.hookedId === f.id;
  replaceFish(pop, tag.slot, world, rng);
  if (mine) resetFishing(s);
  return mine;
}

function release(f: FishPopulation['fish'][number], rng: Rng) {
  f.mode = 'roam';
  f.cooldown = rng.range(20, 40);
  f.stamina = 1;
}

/** Uusi kala syntyy saman lajin toisen kalan lähelle (parvet ja elinalueet säilyvät). */
function respawnPoint(
  pop: FishPopulation,
  caught: { id: number; species: SpeciesId },
  rng: Rng,
): Vec2 {
  const roaming = pop.fish.filter((x) => x.id !== caught.id && x.mode === 'roam');
  const same = roaming.filter((x) => x.species === caught.species);
  const others = same.length > 0 ? same : roaming;
  const host = others[Math.floor(rng.next() * others.length)];
  return host ? { ...host.pos } : { x: 0, y: 0 };
}
