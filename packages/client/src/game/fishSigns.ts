import {
  SPECIES,
  type Difficulty,
  type FishConditions,
  type FishPopulation,
  type School,
  type SpeciesId,
  type Vec2,
} from '@lunki/shared';

/**
 * Kalojen merkit pinnalla (#369): pintaan nousevan kalan rengas,
 * hauen ajaman särkiparven pakoväreet, ahvenparven syönti ja harvinainen
 * hauen pintaisku. Merkit näkyvät kaikilla vaikeustasoilla; helpolla niitä
 * on enemmän ja realistisella vähemmän.
 */
export type FishSignKind = 'rise' | 'flee' | 'feed' | 'pikeStrike';

export interface FishSign {
  kind: FishSignKind;
  pos: Vec2;
  /** Renkaan koko (1 = vieheen molskahdus). */
  size: number;
}

export const FISH_SIGNS = {
  /** Merkit lasketaan vain tätä lähempää (m): kauempaa niitä ei erota. */
  range: 120,
  /** Pinnan lähellä (m) uiva kala voi nousta pintaan. */
  riseDepth: 1,
  /** Lajit, jotka käyvät pinnassa (säyne, särki, taimen, kirjolohi). */
  riseSpecies: ['ide', 'roach', 'trout', 'rainbow'] as readonly SpeciesId[],
  /** Yhden pinnan lähellä uivan kalan nousuväli hämärässä keskimäärin (s). */
  riseEvery: 60,
  /** Päivällä pintakäyntiä on tämän osuuden verran hämärästä. */
  dayRise: 0.15,
  /** Pakenevan parven pulahdusten väli (s). */
  fleeEvery: 0.5,
  /** Innostuneen ahvenparven pulahdusten väli täydellä innolla (s). */
  feedEvery: 1.5,
  /** Matalassa (alle `pikeDepth` m) väijyvän hauen pintaiskujen väli (s). */
  pikeEvery: 300,
  pikeDepth: 1.5,
  /** Parven pako alkaa: näin usein hauki iskee pintaan samalla. */
  fleeStrike: 0.4,
  /** Ennen ukkosta syönti kiihtyy: merkkejä on näin monta kertaa enemmän. */
  preStorm: 1.8,
  /** Ukkosella kalat painuvat pohjaan: merkkejä on vain tämän verran. */
  storm: 0.2,
  /** Merkkien määrän kerroin vaikeustason mukaan. */
  difficulty: { easy: 1.4, normal: 1, realistic: 0.7 } satisfies Record<Difficulty, number>,
  /** Enintään näin monta uutta merkkiä sekunnissa: pinta ei levottomoidu. */
  maxPerSecond: 4,
} as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Valitsee kalakannasta ja olosuhteista ruudun uudet merkit. Satunnaisuus
 * on vain näkymän omaa (`random`), ei kalakannan arvontaa, joten saman
 * siemenen kalat pysyvät samoina (fish.test.ts:n sormenjälki).
 */
export class FishSigns {
  /** Parvien edellinen pakoaika: pakoon lähtö huomataan. */
  private readonly fleeing = new WeakMap<School, number>();
  /** Merkkikiintiö (`maxPerSecond`). */
  private budget: number = FISH_SIGNS.maxPerSecond;

  constructor(private readonly random: () => number = Math.random) {}

  update(
    pop: FishPopulation,
    cond: FishConditions,
    near: Vec2,
    difficulty: Difficulty,
    dt: number,
  ): FishSign[] {
    const out: FishSign[] = [];
    const max = FISH_SIGNS.maxPerSecond;
    this.budget = Math.min(max, this.budget + max * dt);
    const rate =
      FISH_SIGNS.difficulty[difficulty] *
      (cond.storm ? FISH_SIGNS.storm : cond.preStorm ? FISH_SIGNS.preStorm : 1);
    const range = FISH_SIGNS.range;
    const inRange = (p: Vec2) =>
      Math.abs(p.x - near.x) < range &&
      Math.abs(p.y - near.y) < range &&
      (p.x - near.x) ** 2 + (p.y - near.y) ** 2 < range * range;
    const chance = (every: number) => this.random() < (rate * dt) / every;
    const add = (kind: FishSignKind, pos: Vec2, size: number) => {
      if (this.budget < 1) return;
      this.budget -= 1;
      out.push({ kind, pos: { x: pos.x, y: pos.y }, size });
    };
    const offset = (p: Vec2, r: number): Vec2 => {
      const a = this.random() * Math.PI * 2;
      const d = Math.sqrt(this.random()) * r;
      return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
    };

    for (const s of pop.schools ?? []) {
      const before = this.fleeing.get(s) ?? 0;
      this.fleeing.set(s, s.flee);
      if (!inRange(s.center)) continue;
      const spread = SPECIES[s.species].schoolSpread * s.spread;
      if (s.flee > 0) {
        // Hauki lähti ajamaan: iso molskahdus parven reunalle.
        if (before <= 0 && this.random() < FISH_SIGNS.fleeStrike)
          add('pikeStrike', offset(s.center, spread), 1.8);
        if (chance(FISH_SIGNS.fleeEvery)) add('flee', offset(s.center, spread), 0.35);
      } else if (s.excitement > 0.2 && chance(FISH_SIGNS.feedEvery / s.excitement)) {
        add('feed', offset(s.center, spread), 0.5);
      }
    }

    const dusk = clamp01(Math.max(cond.twilight, 1 - cond.light));
    const rise = FISH_SIGNS.dayRise + (1 - FISH_SIGNS.dayRise) * dusk;
    for (const f of pop.fish) {
      if (f.mode !== 'roam' || !inRange(f.pos)) continue;
      if (f.species === 'pike') {
        if (f.depth < FISH_SIGNS.pikeDepth && chance(FISH_SIGNS.pikeEvery / (1 + dusk)))
          add('pikeStrike', f.pos, 1.8);
      } else if (
        f.depth < FISH_SIGNS.riseDepth &&
        FISH_SIGNS.riseSpecies.includes(f.species) &&
        chance(FISH_SIGNS.riseEvery / rise)
      ) {
        add('rise', f.pos, 0.6);
      }
    }
    return out;
  }
}
