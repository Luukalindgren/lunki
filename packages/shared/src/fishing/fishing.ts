import type { Structure } from '../map/bottom';
import type { BottomType } from '../map/scatter';
import { distance, type Vec2 } from '../vec2';
import type { Rng } from '../rng';
import { DIFFICULTIES, type DifficultyParams } from './difficulty';
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
  FLY_CAST_FACTOR,
  baitOf,
  biteOffRate,
  breakingStrength,
  isFly,
  rodPower,
  tackleCastFactor,
  type Tackle,
} from './gear';
import {
  FLY_CAST,
  createFlyCast,
  stepFlyCast,
  type FlyCastEvents,
  type FlyCastInput,
  type FlyCastState,
} from './flyCast';
import { createLine, stepLine, straightenLine, type VerletLine } from './line';
import {
  chargePower,
  clampCastAngle,
  launchLure,
  rodTip,
  stepFlight,
  type LureFlight,
} from './cast';

/**
 * Kalastuksen vaiheet: vapa valmiina, heiton lataus, viehe ilmassa, viehe
 * vedessä. Perhoheitossa (#235) vapaa heilutetaan vaiheessa `casting`.
 */
export type FishingStage = 'idle' | 'charging' | 'casting' | 'flight' | 'water';

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
  /** Perho: siimakäsi puristaa siimaa (hiiren vasen, välilyönti tai VEDÄ). */
  lineHand?: boolean;
  /** Perho: siimakäden veto tällä askeleella (m). */
  strip?: number;
  /** Perho: vastaisku vapaa nostamalla (hiiri ylös). */
  rodLift?: boolean;
  /** Perho: löysä siima kelataan kelalle (F). */
  reelSlack?: boolean;
  /**
   * Perho: aloittaa heiton heiluttamalla (#235), kelalta tai nostamalla
   * enintään `FLY_CAST.pickupMax` metrin siiman vedestä.
   */
  startFlyCast?: boolean;
  /** Perho: vavan liike ja siimakäsi heiton aikana. */
  flyCast?: FlyCastInput;
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
  /** Kuinka kauan viehe on ollut paikallaan vedessä (s). */
  stillTime: number;
  /** Perho: renkaan eteen vedetty löysä siima (m). */
  slack: number;
  /** Perho: löysä on kelattu, ja väsytys käyttää kelan jarrua. */
  onReel: boolean;
  /** Perho: siima luistaa sormien läpi tällä askeleella. */
  fingerSlip: boolean;
  /** Perhoheiton tila vaiheessa `casting`. */
  flyCast: FlyCastState | null;
  /** Perho: tuulisolmu heikentää siimaa, kunnes siima kelataan kotiin. */
  knot: boolean;
}

export interface FishingContext {
  tubePos: Vec2;
  heading: number;
  isWater(p: Vec2): boolean;
  depthAt(p: Vec2): number;
  /** Tuulen nopeusvektori (m/s): kaartaa heittoa. */
  wind?: Vec2;
  /** Kaislikko: perhon takaheitto tarttuu kaisloihin. */
  reedsAt?(p: Vec2): boolean;
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
  stillTime: 0,
  slack: 0,
  onReel: false,
  fingerSlip: false,
  flyCast: null,
  knot: false,
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
  /** Perho: löysä siima on kelalla. */
  onReel?: boolean;
  /** Perho: liian iso löysä sotkeutui heitossa, ja heitto jäi lyhyeksi. */
  flyTangle?: boolean;
  /** Perho: popperi pulpahti vedettäessä. */
  pop?: boolean;
  /** Perhoheiton tapahtumat (#235). */
  flyCast?: FlyCastEvents;
  /** Perho: vedessä on liikaa siimaa heiton nostoon. */
  pickupFar?: boolean;
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

/** Perhokalastus (#234): uitto siimakädellä vedoin, väsytys sormin tai kelalta. */
export const FLY = {
  /** Nopein veto (m/s): hiiren nopeampi liike ei vedä enempää. */
  maxStripSpeed: 2,
  /** Tasainen veto välilyönnillä tai VEDÄ-napilla (m/s). */
  steadyStrip: 0.6,
  /** Avoimen siimakäden kitka (kg): kala vie siimaa sormien läpi. */
  fingerDrag: 0.5,
  /** Löysän siiman kelausnopeus kelalle (m/s). */
  reelSlackSpeed: 2.5,
  /**
   * Heitossa ammutaan löysä siima. Heiton yli jäävä löysä (m) sotkeutuu
   * herkemmin: tämän ylittävästä osasta riski kasvaa.
   */
  safeSlack: 5,
  slackPerTangle: 30,
  /** Sotkeutunut heitto jää tähän osaan. */
  tangledCast: 0.4,
  /** Vapaa nostamalla hauen kova suu ei aina pistä (realistinen). */
  liftHookChance: 0.6,
  /** Popperi pulpahtaa, kun veto alkaa. */
  popSpeed: 0.3,
} as const;

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
    pause: s.stillTime,
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
    // Virveliin vaihdettaessa perhon löysä siima kelataan pois.
    if (input.tackle.method !== s.tackle.method) s.slack = 0;
    s.tackle = { ...input.tackle };
    events.tackleChanged = true;
  }
  s.dragSlipping = false;
  s.fingerSlip = false;

  switch (s.stage) {
    case 'idle':
      s.lure = tip;
      s.depth = 0;
      s.lineLength = 0;
      s.tension = 0;
      s.lureSpeed = 0;
      if (input.startFlyCast && isFly(s.tackle)) beginFlyCast(s, FLY_CAST.startAerial, false);
      else if (!input.castHeld) s.needRelease = false;
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
      s.flight = launchLure(
        tip,
        castAngle(ctx, input.aim),
        s.power,
        tackleCastFactor(s.tackle) * shootSlack(s, ctx, tip, input.aim, events),
      );
      s.stage = 'flight';
      s.onReel = false;
      events.cast = s.power;
      break;

    case 'casting':
      stepCasting(s, input, ctx, tip, events, dt);
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
      const fish = ctx.fish;
      const hooked =
        s.hookedId !== null && fish ? fish.pop.fish.find((f) => f.id === s.hookedId) : undefined;
      const minLine = hooked ? FIGHT.minLine : 0;
      // Perhoa ei kelata: siimakäsi vetää siimaa renkaan eteen, kunnes löysät kelataan.
      const hand = handLine(s);
      const free = !hooked && s.struckId === null && s.snag === null && !s.onLand;
      if (input.startFlyCast && hand && free) {
        if (s.lineLength > FLY_CAST.pickupMax) events.pickupFar = true;
        else {
          beginFlyCast(s, s.lineLength, true);
          break;
        }
      }
      let reeling: boolean;
      if (hand) {
        const strip = Math.max(0, Math.min(input.strip ?? 0, FLY.maxStripSpeed * dt));
        const before = s.lineLength;
        s.lineLength = Math.max(minLine, s.lineLength - strip);
        s.slack += before - s.lineLength;
        reeling = strip > 0 && !input.cancel;
        if (
          reeling &&
          baitOf(s.tackle).surface &&
          s.lureSpeed < FLY.popSpeed &&
          strip / dt >= FLY.popSpeed
        )
          events.pop = true;
        if (input.reelSlack) {
          s.slack = Math.max(0, s.slack - FLY.reelSlackSpeed * dt);
          if (s.slack === 0) {
            s.onReel = true;
            events.onReel = true;
          }
        }
      } else {
        reeling = input.reel && !input.cancel;
        if (reeling) s.lineLength = Math.max(minLine, s.lineLength - REEL.gears[s.gear]! * dt);
      }
      // Vastaisku: kelaus tai perhossa siimakäden veto; vavan nosto pistää huonommin.
      const set = reeling || (hand && input.rodLift === true);
      const setChance = hand && !reeling ? FLY.liftHookChance : 1;

      if (fish && s.struckId === null && !hooked && fish.strike !== undefined) {
        s.struckId = fish.strike;
        s.strikeAge = 0;
        events.strike = true;
      }
      if (fish && s.struckId !== null) resolveStrike(s, set, setChance, fish, events, dt);

      if (s.onLand) {
        holdStuck(s, tip, reeling, input.cut === true, events, holdForce(s, input));
        if (s.stage !== 'water') break;
      } else if (hooked && fish) {
        fight(s, hooked, tip, ctx, fish, events, dt, holdForce(s, input));
      } else if (s.snag !== null) {
        pullSnag(s, tip, reeling, fish, events, dt, holdForce(s, input));
        if (s.stage !== 'water') break;
      } else {
        pullLure(s, tip, dt, holdForce(s, input));
        const lure = baitOf(s.tackle);
        const rate = lure.sinkRate - lure.lift * s.lureSpeed;
        // Vaappu sukeltaa vain lippansa syvyyteen; syvemmältä se ei kelatessa painu.
        const bottom = ctx.depthAt(s.lure);
        const limit = Math.min(bottom, Math.max(lure.maxDepth, s.depth));
        s.depth = Math.max(0, Math.min(limit, s.depth + rate * dt));
        if (s.lureSpeed > 0.05 && s.struckId === null && fish)
          touchBottom(s, ctx, bottom, fish.rng, events, dt);
      }
      s.stillTime = s.lureSpeed < 0.05 ? s.stillTime + dt : 0;
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

/** Siiman kestävyys (kg): tuulisolmu heikentää perhon siimaa. */
export const lineStrength = (s: FishingState) =>
  breakingStrength(s.tackle) * (s.knot ? FLY_CAST.knotStrength : 1);

/** Perhoheitto alkaa: siima nousee ilmaan, ja perho on vavan kärjen luona. */
function beginFlyCast(s: FishingState, aerial: number, inWater: boolean): void {
  s.stage = 'casting';
  s.flyCast = createFlyCast(aerial, inWater);
  s.onReel = false;
  s.stillTime = 0;
}

/**
 * Perhoheiton askel: vapa heiluu, ja kun siima laskeutuu eteen, perho on
 * vedessä heiton suunnassa. Tuuli siirtää perhoa, leveää silmukkaa enemmän.
 */
function stepCasting(
  s: FishingState,
  input: FishingInput,
  ctx: FishingContext,
  tip: Vec2,
  events: FishingEvents,
  dt: number,
): void {
  const c = s.flyCast!;
  s.lure = tip;
  s.depth = 0;
  s.tension = 0;
  s.lureSpeed = 0;
  if (input.cancel && c.phase !== 'stroke') {
    // Heitto keskeytetään: siima vedetään renkaan eteen löysäksi.
    s.slack += c.aerial;
    resetFishing(s);
    return;
  }
  const fish = ctx.fish;
  const heading = ctx.heading + c.aim;
  const behind = (d: number) => ({
    x: tip.x - Math.cos(heading) * d,
    y: tip.y - Math.sin(heading) * d,
  });
  const wind = ctx.wind ?? { x: 0, y: 0 };
  const ev = stepFlyCast(
    c,
    input.flyCast ?? { rod: 0, grip: true },
    {
      assist: (fish?.diff ?? DIFFICULTIES.normal).flyCast,
      power: tackleCastFactor(s.tackle) / FLY_CAST_FACTOR,
      blockedBehind: (d) => {
        const p = behind(d);
        return !ctx.isWater(p) || ctx.reedsAt?.(p) === true;
      },
      // Oikea käsi: tuuli oikealta puhaltaa vasemmalle (x itään, y pohjoiseen).
      sideWind: -wind.x * Math.sin(ctx.heading) + wind.y * Math.cos(ctx.heading),
      random: () => fish?.rng.next() ?? 1,
    },
    dt,
  );
  s.lineLength = c.aerial;
  // Siimakädestä luistava siima tulee ensin löysästä, sitten kelalta.
  if (ev.slipped) s.slack = Math.max(0, s.slack - ev.slipped);
  if (ev.knot) s.knot = true;
  if (Object.keys(ev).length > 0) events.flyCast = ev;
  if (ev.flyLost) {
    events.lureLost = true;
    resetFishing(s);
    return;
  }
  const landed = ev.landed;
  if (!landed) return;
  const angle = clampCastAngle(ctx.heading + landed.aim, ctx.heading);
  const drift = (landed.wide ? 0.5 : 0.25) / rodPower(s.tackle);
  s.lure = {
    x: tip.x + Math.cos(angle) * landed.distance + wind.x * drift,
    y: tip.y + Math.sin(angle) * landed.distance + wind.y * drift,
  };
  s.flyCast = null;
  s.stage = 'water';
  s.onLand = !ctx.isWater(s.lure);
  s.lineLength = Math.min(REEL.spool, distance(tip, s.lure) * (1 + REEL.landingSlack));
  straightenLine(s.line, tip, s.lure);
  if (s.onLand) events.stuck = true;
  else events.splash = { ...s.lure };
}

/** Perhon siima on siimakädessä (ei vielä kelalla). */
const handLine = (s: FishingState) => isFly(s.tackle) && !s.onReel;

/**
 * Voima (kg), jolla siima pidetään: kelan jarru, tai perhossa siimakäsi.
 * Puristettu siima ei anna periksi ja voi katketa; avoimesta kädestä siima
 * luistaa sormien läpi.
 */
export function holdForce(s: FishingState, input: Pick<FishingInput, 'lineHand'>): number {
  if (!handLine(s)) return s.drag;
  return input.lineHand ? Infinity : FLY.fingerDrag;
}

/**
 * Perhoheitto ampuu renkaan eteen kertyneen löysän siiman. Heiton yli jäävä
 * löysä jää renkaan eteen ja voi sotkeutua (ei helpolla): sotkeutunut heitto
 * jää lyhyeksi. Palauttaa heiton kertoimen.
 */
function shootSlack(
  s: FishingState,
  ctx: FishingContext,
  tip: Vec2,
  aim: Vec2,
  events: FishingEvents,
): number {
  if (!isFly(s.tackle)) return 1;
  const reach = distance(tip, aim);
  const excess = Math.max(0, s.slack - Math.max(reach, 10));
  s.slack = excess;
  const fish = ctx.fish;
  if (!fish || fish.diff.autoHook) return 1;
  const risk = Math.min(0.6, Math.max(0, excess - FLY.safeSlack) / FLY.slackPerTangle);
  if (risk <= 0 || fish.rng.next() >= risk) return 1;
  events.flyTangle = true;
  return FLY.tangledCast;
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
  const lure = baitOf(s.tackle);
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
  if (s.depth < bottom - 0.05 || !ctx.bottomTypeAt || isFly(s.tackle) || s.tackle.lure !== 'jig')
    return;
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
function pullLure(s: FishingState, tip: Vec2, dt: number, hold: number): void {
  const d = distance(s.lure, tip);
  const over = d - s.lineLength;
  if (over <= 0 || d === 0) {
    s.tension = 0;
    s.lureSpeed = 0;
    return;
  }
  let speed = over / dt;
  let tension = LURE.dragBase + LURE.dragCoeff * speed * speed;
  if (tension > hold) {
    // Nopeus, jolla vastus on täsmälleen jarrun suuruinen.
    speed = Math.sqrt(Math.max(0, hold - LURE.dragBase) / LURE.dragCoeff);
    tension = hold;
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
  hold: number,
): void {
  s.lureSpeed = 0;
  s.lineLength = Math.max(s.lineLength, distance(s.lure, tip));
  s.tension = reeling ? pullTension(s, hold) : 0;
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
  hold: number,
): void {
  s.lureSpeed = 0;
  // Viehe ei liiku: kelattu siima vain kiristyy (rengas voi silti ajautua kauemmas).
  s.lineLength = Math.max(s.lineLength, distance(s.lure, tip));
  if (!reeling) {
    s.tension = 0;
    return;
  }
  s.tension = pullTension(s, hold);
  s.snag = (s.snag ?? 0) + dt;
  // Liian kireä jarru katkaisee siiman heti; siimakädellä vedetään tunnustellen.
  const snap = fish?.diff.lineCanBreak === true && s.tension > lineStrength(s);
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
 * Jumissa olevan vieheen veto: jarrun voima, tai siimakädellä vedettäessä
 * reilusti alle siiman kestävyyden.
 */
const pullTension = (s: FishingState, hold: number) =>
  Number.isFinite(hold) ? hold : lineStrength(s) * 0.7;

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
  s.stillTime = 0;
  s.onReel = false;
  s.flyCast = null;
  s.knot = false;
}

/** Iskun jälkeen: tarttuuko kala (vastaisku = kelaus ajoissa) vai sylkeekö se vieheen. */
function resolveStrike(
  s: FishingState,
  reeling: boolean,
  setChance: number,
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
    // Vavan nosto ei pistä hauen kovaan suuhun yhtä varmasti kuin siimakäden veto.
    const chance =
      diff.hookChance * (f.species === 'pike' && diff.hookChance < 0.8 ? setChance : 1);
    if (diff.autoHook || rng.next() < chance) {
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
  hold: number,
): void {
  const { diff, rng, pop } = fish;
  const world = { isWater: ctx.isWater, depthAt: ctx.depthAt };
  const res = stepHookedFish(f, tip, s.tension, world, diff, rng, dt, rodPower(s.tackle));

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
    if (raw > hold) {
      // Jarru luistaa (perhossa siima sormien läpi): kala vie siimaa, ensin löysästä.
      if (handLine(s)) {
        s.slack = Math.max(0, s.slack - (d - s.lineLength));
        s.fingerSlip = true;
      }
      s.lineLength = Math.min(REEL.spool, d);
      tension = hold;
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

  if (diff.lineCanBreak && tension > lineStrength(s)) {
    events.lineBroken = true;
    release(f, rng);
    resetFishing(s);
    return;
  }
  const biteOff = biteOffRate(s.tackle);
  if (diff.lineCanBreak && f.species === 'pike' && biteOff > 0 && rng.chance(biteOff, dt)) {
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
