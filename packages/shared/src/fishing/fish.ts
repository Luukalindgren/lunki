import { wrapAngle } from '../physics/tube';
import type { Rng } from '../rng';
import { distance, type Vec2 } from '../vec2';
import type { DifficultyParams } from './difficulty';
import { LURES, tackleAppeal, type Tackle } from './gear';

export type SpeciesId = 'perch' | 'pike' | 'roach' | 'zander' | 'trout';

/** Lajin ominaisuudet: koko, voima, elinalue ja käytös. */
export interface Species {
  id: SpeciesId;
  name: string;
  /** Elääkö laji oikeasti Lunkinjärvessä (muut ovat valinnaisia lisälajeja). */
  native: boolean;
  /** Suhteellinen runsaus: osuus järven kaloista, kun laji on mukana. */
  abundance: number;
  /** Parven koko ja levinneisyys parven keskipisteestä (m). */
  schoolSize: number;
  schoolSpread: number;
  /** Mieluisa pohjan syvyys parven paikalle (m). */
  habitat: { minDepth: number; maxDepth: number };
  /** Osuus parvista, jotka partioivat missä syvyydessä tahansa. */
  wanderShare: number;
  /** Painon mediaani (kg) ja lognormaalin hajonta. */
  medianWeight: number;
  weightSpread: number;
  minWeight: number;
  maxWeight: number;
  /** Harvinainen iso yksilö: todennäköisyys ja painon mediaani (kg). */
  trophyChance: number;
  trophyWeight: number;
  /** Vetovoima (kg) = weight · pullPerKg + pullBase. */
  pullPerKg: number;
  pullBase: number;
  /** Kestävyys: kuinka monta kg·s vetoa kala jaksaa painokiloa kohden. */
  endurancePerKg: number;
  /** Vieheen havaitsemisetäisyys (m). */
  senseRadius: number;
  /** Kuinka herkästi laji kiinnostuu vieheestä (kerroin). */
  lureInterest: number;
  /** Mieluisin vieheen nopeus (m/s) ja sallittu poikkeama. */
  preferredSpeed: number;
  speedTolerance: number;
  /** Vaellusnopeus (m/s) ja kuinka kauas kotipaikasta kala vaeltaa (m). */
  roamSpeed: number;
  homeRange: number;
  /** Uintinopeus seuratessa ja paetessa (m/s). */
  chaseSpeed: number;
  runSpeed: number;
  /** Kuinka lähellä pohjaa laji viihtyy (m pohjasta). */
  bottomOffset: number;
}

export const SPECIES: Record<SpeciesId, Species> = {
  perch: {
    id: 'perch',
    name: 'Ahven',
    native: true,
    abundance: 6,
    schoolSize: 12,
    schoolSpread: 9,
    // Rantojen tuntuma ja syvänteiden reunat.
    habitat: { minDepth: 1, maxDepth: 4.5 },
    wanderShare: 0.25,
    medianWeight: 0.14,
    weightSpread: 0.65,
    minWeight: 0.03,
    maxWeight: 1.6,
    trophyChance: 0.01,
    trophyWeight: 0.7,
    pullPerKg: 2.6,
    pullBase: 0.25,
    endurancePerKg: 14,
    senseRadius: 9,
    lureInterest: 1,
    preferredSpeed: 0.6,
    speedTolerance: 0.5,
    roamSpeed: 0.25,
    homeRange: 25,
    chaseSpeed: 1.3,
    runSpeed: 1.8,
    bottomOffset: 0.8,
  },
  pike: {
    id: 'pike',
    name: 'Hauki',
    native: true,
    abundance: 0.6,
    // Yksin vaaniva: kaislikon ja matalan rantaveden reunat.
    schoolSize: 1,
    schoolSpread: 0,
    habitat: { minDepth: 0.6, maxDepth: 2.2 },
    wanderShare: 0.1,
    medianWeight: 1.3,
    weightSpread: 0.6,
    minWeight: 0.35,
    maxWeight: 12,
    trophyChance: 0.03,
    trophyWeight: 5,
    pullPerKg: 1.2,
    pullBase: 0.8,
    endurancePerKg: 7,
    senseRadius: 12,
    lureInterest: 0.9,
    preferredSpeed: 1,
    speedTolerance: 0.7,
    roamSpeed: 0.06,
    homeRange: 8,
    chaseSpeed: 2.4,
    runSpeed: 2.6,
    bottomOffset: 0.4,
  },
  roach: {
    id: 'roach',
    name: 'Särki',
    native: true,
    abundance: 4,
    // Isot parvet matalassa ja välivedessä, liikkuvat paljon.
    schoolSize: 24,
    schoolSpread: 12,
    habitat: { minDepth: 0.5, maxDepth: 3 },
    wanderShare: 0.3,
    medianWeight: 0.11,
    weightSpread: 0.5,
    minWeight: 0.02,
    maxWeight: 1,
    trophyChance: 0.01,
    trophyWeight: 0.45,
    pullPerKg: 2.2,
    pullBase: 0.15,
    endurancePerKg: 12,
    senseRadius: 5,
    // Ei petokala: tarttuu uistimeen harvoin ja vain hitaaseen.
    lureInterest: 0.35,
    preferredSpeed: 0.25,
    speedTolerance: 0.3,
    roamSpeed: 0.35,
    homeRange: 40,
    chaseSpeed: 0.9,
    runSpeed: 1.4,
    bottomOffset: 1.2,
  },
  zander: {
    id: 'zander',
    name: 'Kuha',
    native: false,
    abundance: 0.8,
    // Pienet parvet syvänteissä.
    schoolSize: 5,
    schoolSpread: 6,
    habitat: { minDepth: 4, maxDepth: 99 },
    wanderShare: 0.15,
    medianWeight: 1,
    weightSpread: 0.55,
    minWeight: 0.3,
    maxWeight: 9,
    trophyChance: 0.03,
    trophyWeight: 4,
    pullPerKg: 1.6,
    pullBase: 0.6,
    endurancePerKg: 9,
    senseRadius: 8,
    lureInterest: 0.8,
    preferredSpeed: 0.45,
    speedTolerance: 0.35,
    roamSpeed: 0.18,
    homeRange: 30,
    chaseSpeed: 1.6,
    runSpeed: 2,
    bottomOffset: 0.3,
  },
  trout: {
    id: 'trout',
    name: 'Taimen',
    native: false,
    abundance: 0.5,
    // Istutettu taimen partioi avovedessä pintakerroksessa.
    schoolSize: 3,
    schoolSpread: 15,
    habitat: { minDepth: 2, maxDepth: 99 },
    wanderShare: 0.5,
    medianWeight: 0.9,
    weightSpread: 0.5,
    minWeight: 0.3,
    maxWeight: 6,
    trophyChance: 0.03,
    trophyWeight: 3,
    pullPerKg: 3,
    pullBase: 0.5,
    endurancePerKg: 16,
    senseRadius: 11,
    lureInterest: 1,
    preferredSpeed: 1.2,
    speedTolerance: 0.6,
    roamSpeed: 0.5,
    homeRange: 60,
    chaseSpeed: 2.8,
    runSpeed: 3.2,
    bottomOffset: 2,
  },
};

export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

/** Lunkinjärven oikeat lajit: oletuslajisto. */
export const NATIVE_SPECIES: SpeciesId[] = SPECIES_IDS.filter((id) => SPECIES[id].native);

export function isSpeciesId(v: unknown): v is SpeciesId {
  return typeof v === 'string' && Object.hasOwn(SPECIES, v);
}

export type FishMode = 'roam' | 'follow' | 'struck' | 'hooked' | 'gone';

export interface Fish {
  id: number;
  species: SpeciesId;
  weight: number;
  pos: Vec2;
  /** Parven kotipaikka: kala palaa sen lähelle vaeltaessaan. */
  home: Vec2;
  depth: number;
  heading: number;
  mode: FishMode;
  /** Seuraamisen tai iskun ajastin (s). */
  timer: number;
  /** Jäljellä oleva voima 0–1 väsytyksessä. */
  stamina: number;
  /** Väsytyksessä: pakeneeko kala (true) vai lepääkö. */
  running: boolean;
  /** Kuinka kauan siima on ollut löysällä (s). */
  slack: number;
  /** Kiinnostumisen viive: kala ei kiinnostu samasta vieheestä heti uudelleen. */
  cooldown: number;
}

export interface FishPopulation {
  fish: Fish[];
  nextId: number;
  /** Askellaskuri kaukaisten kalojen harvennettua päivitystä varten. */
  tick: number;
}

/** Kauempana kuin tämä vieheestä olevat kalat päivitetään harvemmin. */
const FAR_DISTANCE = 60;
/** Kaukaiset kalat päivitetään joka N:nnellä askeleella (N-kertaisella dt:llä). */
const FAR_STRIDE = 20;

export interface FishWorld {
  isWater(p: Vec2): boolean;
  depthAt(p: Vec2): number;
}

/** Vieheen tiedot kaloille. */
export interface LureInfo {
  pos: Vec2;
  depth: number;
  speed: number;
  /** Onko viehe vedessä ja vapaana (ei kalaa kiinni). */
  fishable: boolean;
  /** Vavan kärki: kala kääntyy pois, jos viehe tulee liian lähelle kalastajaa. */
  tip: Vec2;
  /** Kalastajan varusteet (viehe, siima, perukka). */
  tackle?: Tackle;
}

export interface FishEvents {
  /** Kala seuraa viehettä (tuntuma). */
  follow?: number;
  /** Kala iski vieheeseen. */
  strike?: number;
}

export function randomWeight(sp: Species, rng: Rng): number {
  const median = rng.next() < sp.trophyChance ? sp.trophyWeight : sp.medianWeight;
  const w = median * Math.exp(rng.normal(0, sp.weightSpread));
  return Math.round(Math.max(sp.minWeight, Math.min(sp.maxWeight, w)) * 1000) / 1000;
}

/**
 * Sijoittaa kalat parviin järven vesialueelle. Kalamäärä jaetaan valittujen
 * lajien kesken runsauden mukaan, ja parvien keskipisteet painottuvat lajin
 * mieluisaan syvyyteen.
 */
export function createFishPopulation(
  world: FishWorld,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  rng: Rng,
  count: number,
  species: readonly SpeciesId[] = NATIVE_SPECIES,
): FishPopulation {
  const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
  const list = species.filter(isSpeciesId);
  const ids = list.length > 0 ? [...new Set(list)] : NATIVE_SPECIES;
  const total = ids.reduce((sum, id) => sum + SPECIES[id].abundance, 0);
  for (const id of ids) {
    const sp = SPECIES[id];
    const target = pop.fish.length + Math.round((count * sp.abundance) / total);
    while (pop.fish.length < target) {
      const center = randomWaterPoint(world, bounds, sp, rng);
      let placed = 0;
      for (let i = 0; i < sp.schoolSize * 3 && placed < sp.schoolSize; i++) {
        if (pop.fish.length >= target) break;
        const p = {
          x: center.x + rng.normal(0, sp.schoolSpread),
          y: center.y + rng.normal(0, sp.schoolSpread),
        };
        if (!world.isWater(p)) continue;
        pop.fish.push(spawnFish(pop, id, p, world, rng));
        placed++;
      }
    }
  }
  return pop;
}

export function spawnFish(
  pop: FishPopulation,
  species: SpeciesId,
  pos: Vec2,
  world: FishWorld,
  rng: Rng,
): Fish {
  const sp = SPECIES[species];
  return {
    id: pop.nextId++,
    species,
    weight: randomWeight(sp, rng),
    pos,
    home: { ...pos },
    depth: Math.max(0.3, world.depthAt(pos) - sp.bottomOffset),
    heading: rng.range(-Math.PI, Math.PI),
    mode: 'roam',
    timer: 0,
    stamina: 1,
    running: false,
    slack: 0,
    cooldown: 0,
  };
}

function randomWaterPoint(
  world: FishWorld,
  b: { minX: number; minY: number; maxX: number; maxY: number },
  sp: Species,
  rng: Rng,
): Vec2 {
  let fallback: Vec2 | null = null;
  // Osa parvista partioi missä syvyydessä tahansa.
  const anyDepth = rng.next() < sp.wanderShare;
  for (let i = 0; i < 1000; i++) {
    const p = { x: rng.range(b.minX, b.maxX), y: rng.range(b.minY, b.maxY) };
    if (!world.isWater(p)) continue;
    const depth = world.depthAt(p);
    if (anyDepth || (depth >= sp.habitat.minDepth && depth <= sp.habitat.maxDepth)) return p;
    fallback ??= p;
  }
  if (fallback) return fallback;
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/**
 * Kuinka houkutteleva viehe on kalalle: nopeus lähellä mieluisaa, syvyys
 * lähellä kalan syvyyttä, kertoimena vieheen ja siiman sopivuus lajille.
 */
export function lureAppeal(fish: Fish, lure: LureInfo): number {
  const sp = SPECIES[fish.species];
  const dv = Math.abs(lure.speed - sp.preferredSpeed) / sp.speedTolerance;
  // Pysähtynytkin viehe kiinnostaa vähän (vajoava viehe; jigi eniten).
  const still = lure.tackle ? LURES[lure.tackle.lure].stillAppeal : 0.25;
  const speedScore = Math.max(lure.speed < 0.05 ? still : 0, 1 - dv * dv * 0.5);
  const dd = Math.abs(lure.depth - fish.depth);
  const depthScore = Math.max(0, 1 - dd / 2.5);
  const gear = lure.tackle ? tackleAppeal(lure.tackle, fish.species) : 1;
  return speedScore * depthScore * gear;
}

/** Vapaana olevien kalojen tekoäly yhdelle askeleelle. */
export function stepFishPopulation(
  pop: FishPopulation,
  lure: LureInfo | null,
  world: FishWorld,
  diff: DifficultyParams,
  rng: Rng,
  dt: number,
): FishEvents {
  const events: FishEvents = {};
  pop.tick++;
  for (const f of pop.fish) {
    if (f.mode === 'hooked' || f.mode === 'gone') continue;
    const sp = SPECIES[f.species];
    const near = lure?.fishable ? distance(f.pos, lure.pos) : Infinity;

    if (f.mode === 'roam' && near > FAR_DISTANCE) {
      // Kaukana vieheestä riittää harva päivitys.
      if ((f.id + pop.tick) % FAR_STRIDE !== 0) continue;
      f.cooldown = Math.max(0, f.cooldown - dt * FAR_STRIDE);
      roam(f, world, rng, dt * FAR_STRIDE);
      continue;
    }
    f.cooldown = Math.max(0, f.cooldown - dt);

    if (f.mode === 'roam') {
      roam(f, world, rng, dt);
      if (lure && near < sp.senseRadius && f.cooldown === 0) {
        const appeal = lureAppeal(f, lure);
        if (rng.chance(0.6 * appeal * sp.lureInterest * diff.biteRate, dt)) {
          f.mode = 'follow';
          f.timer = 0;
          events.follow = f.id;
        }
      }
      continue;
    }

    if (!lure || !lure.fishable || near > sp.senseRadius * 1.5) {
      loseInterest(f, rng);
      continue;
    }

    if (f.mode === 'follow') {
      f.timer += dt;
      // Uidaan vieheen perään ja syvyyteen.
      swimToward(f, lure.pos, sp.chaseSpeed, 0.6, dt);
      f.depth += (lure.depth - f.depth) * Math.min(1, dt * 1.5);
      const appeal = lureAppeal(f, lure);
      // Viehe liian lähellä kalastajaa: kala kääntyy pois.
      if (distance(lure.pos, lure.tip) < 3.5 || f.timer > 8) {
        loseInterest(f, rng);
        continue;
      }
      if (near < 1.2 && rng.chance((0.35 + appeal * 0.9) * sp.lureInterest * diff.biteRate, dt)) {
        f.mode = 'struck';
        f.timer = 0;
        events.strike = f.id;
      }
    } else if (f.mode === 'struck') {
      // Isku: kala pitää viehettä suussaan hetken. Kalastajan tilakone päättää tarttumisen.
      f.timer += dt;
      f.pos = { ...lure.pos };
      f.depth = lure.depth;
    }
  }
  return events;
}

function loseInterest(f: Fish, rng: Rng) {
  f.mode = 'roam';
  f.timer = 0;
  f.cooldown = rng.range(6, 15);
}

function roam(f: Fish, world: FishWorld, rng: Rng, dt: number) {
  const sp = SPECIES[f.species];
  f.heading += rng.normal(0, 0.6) * Math.sqrt(dt);
  if (distance(f.pos, f.home) > sp.homeRange) {
    const back = Math.atan2(f.home.y - f.pos.y, f.home.x - f.pos.x);
    f.heading += wrapAngle(back - f.heading) * Math.min(1, dt);
  }
  const speed = sp.roamSpeed;
  const next = {
    x: f.pos.x + Math.cos(f.heading) * speed * dt,
    y: f.pos.y + Math.sin(f.heading) * speed * dt,
  };
  if (world.isWater(next)) f.pos = next;
  else f.heading += Math.PI * (0.5 + rng.next());
  // Syvyys hakeutuu kohti mieluisaa pohjan läheisyyttä harvakseltaan (kallis kysely).
  if (rng.next() < dt * 0.5) {
    const target = Math.max(0.3, world.depthAt(f.pos) - sp.bottomOffset);
    f.depth += (target - f.depth) * 0.5;
  }
}

function swimToward(f: Fish, target: Vec2, maxSpeed: number, keep: number, dt: number) {
  const dx = target.x - f.pos.x;
  const dy = target.y - f.pos.y;
  const d = Math.hypot(dx, dy);
  if (d <= keep) return;
  const step = Math.min(d - keep, maxSpeed * dt);
  f.pos = { x: f.pos.x + (dx / d) * step, y: f.pos.y + (dy / d) * step };
  f.heading = Math.atan2(dy, dx);
}

/** Kalan vetovoima väsytyksessä (kg) ennen siiman rajoitusta. */
export function fishPull(f: Fish, diff: DifficultyParams): number {
  const sp = SPECIES[f.species];
  const max = (f.weight * sp.pullPerKg + sp.pullBase) * diff.fishStrength;
  const stamina = 0.15 + 0.85 * f.stamina;
  return max * stamina * (f.running ? 1 : 0.35);
}

export interface FightResult {
  /** Jännitys (kg) ennen jarrun rajoitusta. */
  pull: number;
  /** Kalan uintinopeus poispäin vavan kärjestä (m/s). */
  outSpeed: number;
}

/**
 * Väsytyksen kalan puoli: kala vuorottelee pakoja ja lepoa, väsyy vedon
 * mukaan ja hakeutuu pohjaan niin kauan kuin jaksaa. Palauttaa vedon.
 */
export function stepHookedFish(
  f: Fish,
  tip: Vec2,
  tension: number,
  world: FishWorld,
  diff: DifficultyParams,
  rng: Rng,
  dt: number,
): FightResult {
  const sp = SPECIES[f.species];
  // Vuorottelu: väsynyt kala pakenee harvemmin ja lyhyemmin.
  f.timer -= dt;
  if (f.timer <= 0) {
    f.running = !f.running && rng.next() < 0.3 + 0.7 * f.stamina;
    f.timer = f.running ? rng.range(0.8, 2.5) * (0.4 + f.stamina) : rng.range(0.6, 1.8);
    if (f.running) {
      // Pakosuunta: pääosin poispäin kalastajasta, välillä sivulle.
      const away = Math.atan2(f.pos.y - tip.y, f.pos.x - tip.x);
      f.heading = away + rng.normal(0, 0.9);
    }
  }
  const pull = fishPull(f, diff);
  // Väsyminen: vetäminen kireää siimaa vastaan kuluttaa voimia.
  const effort = Math.min(pull, Math.max(tension, pull * 0.2));
  f.stamina = Math.max(
    0,
    f.stamina - (effort * dt * diff.staminaDrain) / (sp.endurancePerKg * f.weight + 1),
  );
  if (!f.running) f.stamina = Math.min(1, f.stamina + dt * 0.01);

  // Syvyys: jaksava kala sukeltaa pohjaan, väsynyt nousee.
  const bottom = world.depthAt(f.pos);
  const targetDepth = f.stamina > 0.25 ? bottom - 0.3 : bottom * f.stamina;
  f.depth += (Math.max(0, targetDepth) - f.depth) * Math.min(1, dt * 0.8);

  const speed = f.running ? sp.runSpeed * (0.3 + 0.7 * f.stamina) : 0.2;
  const away = Math.atan2(f.pos.y - tip.y, f.pos.x - tip.x);
  return { pull, outSpeed: speed * Math.cos(f.heading - away) };
}

/** Paino suomalaisittain: alle kilon grammoina, muuten kiloina. */
export function formatWeight(kg: number): string {
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(2).replace('.', ',')} kg`;
}
