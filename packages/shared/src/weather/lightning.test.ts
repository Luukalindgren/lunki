import { describe, expect, it } from 'vitest';
import { LUNKINJARVI } from '../map/lunkinjarvi';
import { WaterBody } from '../map/waterBody';
import {
  LIGHTNING,
  OUT_OF_RACE,
  exposure,
  penaltyOutcome,
  capsizeTimeOut,
  planLightning,
  resolveStrike,
} from './lightning';
import { planWeather, weatherAt } from './weather';

const water = new WaterBody(LUNKINJARVI);
const { bounds } = LUNKINJARVI;

/** Järven avoimin kohta ja vesipiste aivan rannan tuntumassa. */
function findPoints() {
  let open = null;
  let shore = null;
  for (let x = bounds.minX; x < bounds.maxX; x += 25)
    for (let y = bounds.minY; y < bounds.maxY; y += 25) {
      const p = { x, y };
      if (!water.isWater(p)) continue;
      const e = exposure(water, p);
      if (!open && e === 1) open = p;
      if (!shore && e === LIGHTNING.minExposure) shore = p;
    }
  return { open: open!, shore: shore! };
}

describe('salamat', () => {
  it('iskevät vain ukkosella ja myrskyllä, aina samalla tavalla', () => {
    const plan = planWeather(5, 'chaos', 900);
    const strikes = planLightning(plan, 5, 900);
    expect(strikes.length).toBeGreaterThan(10);
    expect(planLightning(plan, 5, 900)).toEqual(strikes);
    for (const s of strikes) expect(['thunder', 'storm']).toContain(weatherAt(plan, s.t).sky);
    expect(planLightning(planWeather(5, 'calm', 900), 5, 900)).toEqual([]);
  });

  it('osuvat vain, kun vapa on ylhäällä, ja selällä useammin kuin rannassa', () => {
    const { open, shore } = findPoints();
    const rate = (pos: { x: number; y: number }, rodUp: boolean) => {
      let hits = 0;
      for (let seed = 1; seed <= 4000; seed++)
        hits += resolveStrike({ t: 0, seed }, [{ id: 'a', pos, rodUp }], water, bounds).victims
          .length;
      return hits / 4000;
    };
    expect(rate(open, false)).toBe(0);
    const openRate = rate(open, true);
    expect(openRate).toBeGreaterThan(LIGHTNING.hitChance * 0.8);
    expect(openRate).toBeLessThan(LIGHTNING.hitChance * 1.2);
    expect(rate(shore, true)).toBeLessThan(openRate * 0.4);
  });

  it('iskukohta on osuman saaneen kohdalla tai muuten vedessä', () => {
    const { open } = findPoints();
    for (let seed = 1; seed <= 200; seed++) {
      const r = resolveStrike({ t: 0, seed }, [{ id: 'a', pos: open, rodUp: true }], water, bounds);
      if (r.victims.length > 0) expect(r.pos).toEqual(open);
      else expect(water.isWater(r.pos)).toBe(true);
    }
  });

  it('rangaistukset', () => {
    expect(penaltyOutcome('none', 100)).toEqual({ outUntil: 0, loseCatch: false });
    expect(penaltyOutcome('time-out', 100)).toEqual({
      outUntil: 100 + LIGHTNING.timeOut,
      loseCatch: false,
    });
    expect(penaltyOutcome('lose-catch', 100)).toEqual({ outUntil: 0, loseCatch: true });
    expect(penaltyOutcome('out', 100)).toEqual({ outUntil: OUT_OF_RACE, loseCatch: true });
  });

  it('kylmässä vedessä kaatumisen jäähy on pidempi (#427)', () => {
    expect(capsizeTimeOut('summer')).toBe(LIGHTNING.timeOut);
    expect(capsizeTimeOut('spring')).toBe(LIGHTNING.timeOut * 1.5);
    expect(capsizeTimeOut('autumn')).toBe(LIGHTNING.timeOut * 1.5);
    expect(penaltyOutcome('time-out', 100, capsizeTimeOut('autumn')).outUntil).toBe(190);
  });
});
