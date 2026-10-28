import { describe, expect, it } from 'vitest';
import { DAYTIME, type FishConditions, type FishPopulation, type SpeciesId } from '@lunki/shared';
import { FISH_SIGNS, FishSigns, type FishSign } from './fishSigns';

/** Toistettava satunnaisluku testiin (piirron oma arvonta). */
const lcg =
  (seed = 1) =>
  () =>
    (seed = (seed * 16807) % 2147483647) / 2147483647;

const fish = (species: SpeciesId, x: number, depth: number) => ({
  species,
  pos: { x, y: 0 },
  depth,
  mode: 'roam',
});
const school = (species: SpeciesId, x: number, flee = 0, excitement = 0) => ({
  species,
  home: { x, y: 0 },
  center: { x, y: 0 },
  heading: 0,
  spread: 1,
  excitement,
  flee,
});
const pop = (p: Partial<FishPopulation>) =>
  ({ fish: [], nextId: 0, tick: 0, ...p }) as FishPopulation;
const DUSK: FishConditions = { ...DAYTIME, light: 0.3, twilight: 1 };

/** Merkit `seconds` sekunnin ajalta. */
function run(
  p: FishPopulation,
  cond: FishConditions,
  seconds = 600,
  difficulty: 'easy' | 'normal' | 'realistic' = 'normal',
): FishSign[] {
  const signs = new FishSigns(lcg());
  const out: FishSign[] = [];
  for (let t = 0; t < seconds * 10; t++)
    out.push(...signs.update(p, cond, { x: 0, y: 0 }, difficulty, 0.1));
  return out;
}

describe('kalojen merkit pinnalla (#369)', () => {
  const risers = pop({ fish: Array.from({ length: 40 }, (_, i) => fish('ide', i, 0.5)) as never });

  it('pinnan lähellä uiva säyne käy pinnassa, syvällä ja kaukana ei', () => {
    expect(run(risers, DUSK).filter((s) => s.kind === 'rise').length).toBeGreaterThan(100);
    const deep = pop({ fish: [fish('ide', 5, 3)] as never });
    expect(run(deep, DUSK)).toEqual([]);
    const far = pop({ fish: [fish('ide', FISH_SIGNS.range + 10, 0.5)] as never });
    expect(run(far, DUSK)).toEqual([]);
    // Ahven ei nouse pintaan, vaikka uisi matalalla.
    expect(run(pop({ fish: [fish('perch', 5, 0.5)] as never }), DUSK)).toEqual([]);
  });

  it('illalla pintakäyntiä on enemmän kuin päivällä, ennen ukkosta eniten', () => {
    const day = run(risers, DAYTIME).length;
    const dusk = run(risers, DUSK).length;
    const pre = run(risers, { ...DUSK, preStorm: true }).length;
    const storm = run(risers, { ...DUSK, storm: true }).length;
    expect(dusk).toBeGreaterThan(day * 3);
    expect(pre).toBeGreaterThan(dusk * 1.4);
    expect(storm).toBeLessThan(dusk * 0.4);
  });

  it('merkit näkyvät kaikilla vaikeustasoilla, helpolla eniten', () => {
    const easy = run(risers, DUSK, 600, 'easy').length;
    const normal = run(risers, DUSK, 600, 'normal').length;
    const real = run(risers, DUSK, 600, 'realistic').length;
    expect(real).toBeGreaterThan(0);
    expect(easy).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(real);
  });

  it('pakeneva särkiparvi väreilee ja hauki iskee joskus pintaan', () => {
    const fleeing = pop({ schools: [school('roach', 10, 5)] as never });
    const signs = run(fleeing, DAYTIME, 5);
    expect(signs.filter((s) => s.kind === 'flee').length).toBeGreaterThan(4);
    let strikes = 0;
    const random = lcg(7);
    for (let i = 0; i < 400; i++) {
      const s = new FishSigns(random);
      const fresh = pop({ schools: [school('roach', 10, 5)] as never });
      if (
        s.update(fresh, DAYTIME, { x: 0, y: 0 }, 'normal', 0.1).some((x) => x.kind === 'pikeStrike')
      )
        strikes++;
    }
    expect(Math.abs(strikes / 400 - FISH_SIGNS.fleeStrike)).toBeLessThan(0.1);
  });

  it('innostunut ahvenparvi pulahtelee, rauhallinen ei', () => {
    const excited = run(pop({ schools: [school('perch', 10, 0, 1)] as never }), DAYTIME, 60);
    expect(excited.filter((s) => s.kind === 'feed').length).toBeGreaterThan(20);
    expect(run(pop({ schools: [school('perch', 10, 0, 0)] as never }), DAYTIME, 60)).toEqual([]);
  });

  it('matalassa väijyvä hauki iskee pintaan harvoin', () => {
    const pikes = pop({ fish: Array.from({ length: 10 }, (_, i) => fish('pike', i, 1)) as never });
    const n = run(pikes, DAYTIME, 600).filter((s) => s.kind === 'pikeStrike').length;
    // Odotusarvo 10 haukea × 600 s / 300 s = 20.
    expect(n).toBeGreaterThan(8);
    expect(n).toBeLessThan(40);
  });

  it('merkkejä tulee rajattu määrä sekunnissa', () => {
    const crowd = pop({
      fish: Array.from({ length: 2000 }, (_, i) => fish('ide', i % 50, 0.2)) as never,
    });
    const n = run(crowd, { ...DUSK, preStorm: true }, 60, 'easy').length;
    expect(n).toBeLessThanOrEqual(FISH_SIGNS.maxPerSecond * 60 + FISH_SIGNS.maxPerSecond);
  });

  it('kalakantaa ei muuteta', () => {
    const p = pop({
      fish: [fish('ide', 1, 0.5), fish('pike', 2, 1)] as never,
      schools: [school('roach', 3, 2)] as never,
    });
    const before = JSON.stringify(p);
    run(p, DUSK, 10);
    expect(JSON.stringify(p)).toBe(before);
  });
});
