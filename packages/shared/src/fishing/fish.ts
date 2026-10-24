import { wrapAngle } from '../physics/tube';
import type { Rng } from '../rng';
import { distance, type Vec2 } from '../vec2';
import type { DifficultyParams } from './difficulty';

export type SpeciesId = 'perch';

/** Lajin ominaisuudet. Uudet lajit (hauki, särki…) lisätään tänne (#23). */
export interface Species {
  id: SpeciesId;
  name: string;
  /** Painon mediaani (kg) ja lognormaalin hajonta. */
  medianWeight: number;
  weightSpread: number;
  minWeight: number;
  maxWeight: number;
  /** Vetovoima (kg) = weight · pullPerKg + pullBase. */
  pullPerKg: number;
  pullBase: number;
  /** Kestävyys: kuinka monta kg·s vetoa kala jaksaa painokiloa kohden. */
  endurancePerKg: number;
  /** Vieheen havaitsemisetäisyys (m). */
  senseRadius: number;
  /** Mieluisin vieheen nopeus (m/s) ja sallittu poikkeama. */
  preferredSpeed: number;
  speedTolerance: number;
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
    medianWeight: 0.14,
    weightSpread: 0.65,
    minWeight: 0.03,
    maxWeight: 1.6,
    pullPerKg: 2.6,
    pullBase: 0.25,
    endurancePerKg: 14,
    senseRadius: 9,
    preferredSpeed: 0.6,
    speedTolerance: 0.5,
    chaseSpeed: 1.3,
    runSpeed: 1.8,
    bottomOffset: 0.8,
  },
};

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
}

export interface FishEvents {
  /** Kala seuraa viehettä (tuntuma). */
  follow?: number;
  /** Kala iski vieheeseen. */
  strike?: number;
}

export function randomWeight(sp: Species, rng: Rng): number {
  const w = sp.medianWeight * Math.exp(rng.normal(0, sp.weightSpread));
  return Math.round(Math.max(sp.minWeight, Math.min(sp.maxWeight, w)) * 1000) / 1000;
}

/**
 * Sijoittaa kalat parviin järven vesialueelle. Ahvenparvet viihtyvät
 * rantojen tuntumassa ja syvänteiden reunoilla (1–4,5 m), joten parvien
 * keskipisteet painottuvat sinne.
 */
export function createFishPopulation(
  world: FishWorld,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  rng: Rng,
  count: number,
): FishPopulation {
  const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
  const schoolSize = 12;
  while (pop.fish.length < count) {
    const center = randomWaterPoint(world, bounds, rng);
    for (let i = 0; i < schoolSize && pop.fish.length < count; i++) {
      const p = { x: center.x + rng.normal(0, 9), y: center.y + rng.normal(0, 9) };
      if (!world.isWater(p)) continue;
      pop.fish.push(spawnFish(pop, 'perch', p, world, rng));
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
  rng: Rng,
): Vec2 {
  let fallback: Vec2 | null = null;
  // Osa parvista partioi avovedellä.
  const anyDepth = rng.next() < 0.25;
  for (let i = 0; i < 1000; i++) {
    const p = { x: rng.range(b.minX, b.maxX), y: rng.range(b.minY, b.maxY) };
    if (!world.isWater(p)) continue;
    const depth = world.depthAt(p);
    if (anyDepth || (depth >= 1 && depth <= 4.5)) return p;
    fallback ??= p;
  }
  if (fallback) return fallback;
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/**
 * Kuinka houkutteleva viehe on kalalle (0–1): nopeus lähellä mieluisaa,
 * syvyys lähellä kalan syvyyttä.
 */
export function lureAppeal(fish: Fish, lure: LureInfo): number {
  const sp = SPECIES[fish.species];
  const dv = Math.abs(lure.speed - sp.preferredSpeed) / sp.speedTolerance;
  // Pysähtynytkin viehe kiinnostaa vähän (uppoava viehe).
  const speedScore = Math.max(lure.speed < 0.05 ? 0.25 : 0, 1 - dv * dv * 0.5);
  const dd = Math.abs(lure.depth - fish.depth);
  const depthScore = Math.max(0, 1 - dd / 2.5);
  return speedScore * depthScore;
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
        if (rng.chance(0.6 * appeal * diff.biteRate, dt)) {
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
      if (near < 1.2 && rng.chance((0.35 + appeal * 0.9) * diff.biteRate, dt)) {
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

/** Kuinka kauas kotipaikastaan kala vaeltaa ennen kääntymistä takaisin. */
const HOME_RANGE = 25;

function roam(f: Fish, world: FishWorld, rng: Rng, dt: number) {
  f.heading += rng.normal(0, 0.6) * Math.sqrt(dt);
  if (distance(f.pos, f.home) > HOME_RANGE) {
    const back = Math.atan2(f.home.y - f.pos.y, f.home.x - f.pos.x);
    f.heading += wrapAngle(back - f.heading) * Math.min(1, dt);
  }
  const speed = 0.25;
  const next = {
    x: f.pos.x + Math.cos(f.heading) * speed * dt,
    y: f.pos.y + Math.sin(f.heading) * speed * dt,
  };
  if (world.isWater(next)) f.pos = next;
  else f.heading += Math.PI * (0.5 + rng.next());
  // Syvyys hakeutuu kohti mieluisaa pohjan läheisyyttä harvakseltaan (kallis kysely).
  if (rng.next() < dt * 0.5) {
    const target = Math.max(0.3, world.depthAt(f.pos) - SPECIES[f.species].bottomOffset);
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
