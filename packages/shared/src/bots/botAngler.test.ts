import { describe, expect, it } from 'vitest';
import type { Difficulty } from '../fishing/difficulty';
import { DAYTIME, FISH_COUNT, NATIVE_SPECIES, createFishPopulation } from '../fishing/fish';
import { LakeBottom } from '../map/bottom';
import { findLaunchPoint } from '../map/geometry';
import { LUNKINJARVI, LUNKINJARVI_BOTTOM } from '../map/lunkinjarvi';
import { WaterBody } from '../map/waterBody';
import { NET_DT, stepPlayerTube } from '../net/tubeSync';
import { createTube } from '../physics/tube';
import { Rng } from '../rng';
import { distance, type Vec2 } from '../vec2';
import {
  BOT_NAMES,
  BOT_SKILLS,
  BotAngler,
  botId,
  botName,
  botSkillFor,
  isBotId,
  type BotSkill,
} from './botAngler';

const water = new WaterBody(LUNKINJARVI);
const bottom = new LakeBottom(
  water,
  LUNKINJARVI.bounds,
  LUNKINJARVI_BOTTOM,
  LUNKINJARVI.reeds,
  LUNKINJARVI.piers,
);
const world = {
  isWater: (p: Vec2) => water.isWater(p),
  depthAt: (p: Vec2) => bottom.depthAt(p),
  structures: bottom.structures,
};

/** Yksi botti järvellä `minutes` minuuttia: rengas ja kalastus kuten palvelimella. */
function simulate(
  skill: BotSkill,
  seed: number,
  minutes: number,
  difficulty: Difficulty = 'normal',
) {
  const pop = createFishPopulation(world, LUNKINJARVI.bounds, new Rng(seed), FISH_COUNT, [
    ...NATIVE_SPECIES,
  ]);
  const bot = new BotAngler({ index: seed % 7, skill, seed, difficulty, water, bottom, pop });
  const startRng = new Rng(seed ^ 0x5bd1e995);
  const start = findLaunchPoint(water, LUNKINJARVI.bounds, () => startRng.next());
  let tube = createTube(start);
  const others = [{ x: start.x + 30, y: start.y }];
  const r = { casts: 0, caught: 0, weight: 0, hooked: 0, lost: 0, emotes: 0, moved: 0, dry: 0 };
  /** Pinnassa oloaika saaliin tullessa (s) ja tieto, nostettiinko haavilla. */
  const surfaced: { age: number; net: boolean }[] = [];
  let landing: { age: number; net: boolean } | null = null;
  /** Pinnasta karanneet: riuhtaisu nostettaessa. */
  let landEsc = 0;
  let input = { kick: 0, turn: 0, sprint: false };
  const steps = Math.round((minutes * 60) / NET_DT);
  for (let i = 0; i < steps; i++) {
    const before = tube.pos;
    tube = stepPlayerTube(tube, input, water, NET_DT);
    r.moved += distance(before, tube.pos);
    if (!water.isWater(tube.pos)) r.dry++;
    if (i % 2 === 1) continue;
    const out = bot.step(
      { tube, canFish: true, tangled: false, thunder: false, others, cond: DAYTIME },
      NET_DT * 2,
    );
    input = out.input;
    const ev = out.events;
    const l = bot.fishing.landing;
    if (l) landing = { age: l.age, net: l.net };
    if (ev.caught && landing) surfaced.push(landing);
    if (!l) landing = null;
    if (ev.cast !== undefined) r.casts++;
    if (ev.hooked) r.hooked++;
    if (ev.caught) {
      r.caught++;
      r.weight += ev.caught.weight;
    }
    if (ev.escaped || ev.lineBroken || ev.bitOff) r.lost++;
    if (out.emote) r.emotes++;
    if (ev.escaped && landing) landEsc++;
  }
  return { ...r, surfaced, landEsc };
}

describe('bottipelaaja (#624)', () => {
  it('nimet, tunnisteet ja taidot', () => {
    expect(isBotId(botId(3))).toBe(true);
    expect(isBotId('abc')).toBe(false);
    expect(new Set(BOT_NAMES).size).toBe(BOT_NAMES.length);
    for (const n of BOT_NAMES) expect(n.length).toBeLessThanOrEqual(16);
    expect(botName(BOT_NAMES.length)).toBe(`${BOT_NAMES[0]} 2`);
    expect(BOT_SKILLS.map((_, i) => botSkillFor('mixed', i)).sort()).toEqual(
      [...BOT_SKILLS].sort(),
    );
    expect(botSkillFor('veteran', 5)).toBe('veteran');
  });

  it('botit liikkuvat, heittävät ja saavat kalaa; konkari ei menetä kalaa pinnasta', () => {
    const total = (skill: BotSkill) => {
      let caught = 0;
      let moved = 0;
      for (const seed of [100, 102]) {
        const r = simulate(skill, seed, 6);
        // Konkari odottaa riuhtaisun loppuun eikä nosta kesken sen (#823).
        if (skill === 'veteran') expect(r.landEsc).toBe(0);
        expect(r.casts).toBeGreaterThan(2);
        moved += r.moved;
        expect(r.dry).toBe(0);
        caught += r.caught;
      }
      expect(moved).toBeGreaterThan(10);
      return caught;
    };
    const novice = total('novice');
    const regular = total('regular');
    const veteran = total('veteran');
    // Saaliit vaihtelevat siemenittäin enemmän kuin taidoittain: 6 siementä × 10 min
    // (normaali, #823) aloittelija 3–4,5, tavallinen 4 ja konkari 4 kalaa.
    // Pinnassa odottaminen ei muuttanut tahtia: kiinni saaduista nostetaan yhtä moni.
    expect(novice).toBeGreaterThan(0);
    expect(regular).toBeGreaterThan(0);
    expect(veteran).toBeGreaterThan(0);
  }, 120_000);

  it('konkarinkin kala on pinnassa ennen nostoa, haavikala pidempään (#823)', () => {
    const all = [100, 101, 102].flatMap((seed) => simulate('veteran', seed, 6).surfaced);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) expect(s.age).toBeGreaterThan(s.net ? 1.6 : 0.85);
  }, 120_000);
});
