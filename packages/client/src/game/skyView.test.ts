import { describe, expect, it } from 'vitest';
import type { Season } from '@lunki/shared';
import { SEASON_LOOKS, SkyView, flashStrength, lookAt } from './skyView';

const calm = { x: 0, y: 0 };

describe('vuorokaudenajan ilme', () => {
  const seasons = Object.keys(SEASON_LOOKS) as Season[];

  it('taivas tummuu zeniittiä kohti ja pilvisyys on 0–1 joka kaudella', () => {
    const luma = (hex: number) => ((hex >> 16) & 0xff) * 0.3 + ((hex >> 8) & 0xff) * 0.59;
    for (const season of seasons)
      for (const [, look] of SEASON_LOOKS[season]) {
        expect(luma(look.zenith)).toBeLessThan(luma(look.horizon));
        expect(look.clouds).toBeGreaterThanOrEqual(0);
        expect(look.clouds).toBeLessThanOrEqual(1);
      }
  });

  it('hetket ovat kellonajan mukaan järjestyksessä ja vuorokausi sulkeutuu', () => {
    for (const season of seasons) {
      const looks = SEASON_LOOKS[season];
      for (let i = 1; i < looks.length; i++) expect(looks[i]![0]).toBeGreaterThan(looks[i - 1]![0]);
      expect(looks[0]![0]).toBe(0);
      expect(looks[looks.length - 1]![0]).toBe(24);
      expect(lookAt(24.5, season)).toEqual(lookAt(0.5, season));
    }
  });

  it('ilme liukuu kultaisesta tunnista auringonlaskuun', () => {
    const golden = lookAt(17, 'autumn');
    const sunset = lookAt(18.9, 'autumn');
    const between = lookAt(18, 'autumn');
    expect(between.mul[1]).toBeLessThan(golden.mul[1]);
    expect(between.mul[1]).toBeGreaterThan(sunset.mul[1]);
  });

  it('kultainen tunti on kellertävän ruskea: punaista lisää, sinistä vähemmän', () => {
    const golden = lookAt(21);
    expect(golden.mul[0]).toBeGreaterThan(1.1);
    expect(golden.mul[2]).toBeLessThan(golden.mul[1]);
    expect(golden.add[0]).toBeGreaterThan(golden.add[2]);
  });

  it('kausien päivät eroavat: kevät raikas, kesä lämmin, syksy kultainen ja haalea (#427)', () => {
    const [spring, summer, autumn] = (['spring', 'summer', 'autumn'] as const).map((s) =>
      lookAt(13, s),
    );
    expect(spring!.mul[2]).toBeGreaterThan(spring!.mul[0]);
    expect(summer!.mul[0]).toBeGreaterThan(summer!.mul[2]);
    expect(summer!.sat).toBeGreaterThan(1);
    expect(autumn!.mul[0]).toBeGreaterThan(summer!.mul[0]);
    expect(autumn!.sat).toBeLessThan(spring!.sat);
    // Keväällä taivas on selkein, kesällä ja syksyllä poutapilviä.
    expect(spring!.clouds).toBeLessThan(summer!.clouds);
  });

  it('kesäyö on valoisa, syysyö pimeä ja tähtikirkas (#427)', () => {
    const summer = new SkyView('summer');
    summer.update(1, 0, 0, calm);
    const autumn = new SkyView('autumn');
    autumn.update(1, 0, 0, calm);
    expect(summer.grade.mul.y).toBeGreaterThan(0.8);
    expect(autumn.grade.mul.y).toBeLessThan(0.65);
    expect(lookAt(1, 'autumn').stars).toBeGreaterThan(lookAt(1, 'summer').stars * 10);
    // Kesäyönä aurinko on pohjoisessa vain vähän horisontin alla.
    const springNight = lookAt(1, 'spring');
    expect(springNight.mul[1]).toBeLessThan(lookAt(1, 'summer').mul[1]);
    expect(springNight.mul[1]).toBeGreaterThan(lookAt(1, 'autumn').mul[1]);
  });

  it('syysyönä paletti tummuu, mutta salama valaisee hetkeksi', () => {
    const sky = new SkyView('autumn');
    sky.update(1, 0, 0, calm);
    expect(sky.grade.mul.y).toBeLessThan(0.7);
    sky.update(1, 0, 1, calm);
    expect(sky.grade.mul.y).toBeGreaterThan(1);
    // Kaukainen salama (heikompi välähdys) ei muuta yötä päiväksi.
    sky.update(1, 0, 0.3, calm);
    expect(sky.grade.mul.y).toBeLessThan(1);
  });

  it('pilvisyys himmentää kuvan ja pilvinen yötaivas on tumma', () => {
    const sky = new SkyView('autumn');
    sky.update(12, 0, 0, calm);
    const clear = sky.grade.mul.y;
    sky.update(12, 0.75, 0, calm);
    expect(sky.grade.mul.y).toBeLessThan(clear * 0.75);
    expect(sky.grade.sat).toBeLessThan(clear);
    const day = sky.lighting.horizon.r;
    sky.update(1, 0.35, 0, calm);
    expect(sky.lighting.horizon.r).toBeLessThan(day * 0.3);
  });

  it('aamulla on usvaa, joka hälvenee tuulessa; syysaamu on usvaisin', () => {
    const sky = new SkyView();
    sky.update(2.9, 0, 0, calm);
    expect(sky.mist).toBeGreaterThan(0.9);
    sky.update(2.9, 0, 0, { x: 9, y: 0 });
    expect(sky.mist).toBe(0);
    const autumn = new SkyView('autumn');
    autumn.update(8.7, 0, 0, calm);
    const spring = new SkyView('spring');
    spring.update(6.4, 0, 0, calm);
    expect(autumn.mist).toBeGreaterThan(spring.mist + 0.5);
  });

  it('matala aurinko kimaltaa vedessä, paksu pilvi peittää sen', () => {
    const sky = new SkyView();
    sky.update(22, 0, 0, calm);
    expect(sky.glitter.amount).toBeGreaterThan(0);
    sky.update(22, 0.75, 0, calm);
    expect(sky.glitter.amount).toBe(0);
  });

  it('syysyönä kimaltaa kuu, kesän keskipäivällä ei mikään', () => {
    const sky = new SkyView('autumn');
    sky.update(1.5, 0, 0, calm);
    expect(sky.glitter.amount).toBeGreaterThan(0);
    expect(sky.glitter.dir.y).toBeGreaterThan(0);
    // Syksyllä aurinko on keskipäivälläkin matalalla ja kimaltaa.
    sky.update(12.5, 0, 0, calm);
    expect(sky.glitter.amount).toBeGreaterThan(0);
    const summer = new SkyView('summer');
    summer.update(13.5, 0, 0, calm);
    expect(summer.glitter.amount).toBe(0);
  });
});

describe('salaman välähdys', () => {
  it('heikkenee etäisyyden mukaan tasaisesti, ei portaittain', () => {
    expect(flashStrength(0)).toBe(1);
    // Kierros 2 (#409): 220 m:n salama noin 0,7 kertaa entinen (0,9).
    expect(flashStrength(220)).toBeCloseTo(0.63, 2);
    expect(flashStrength(375)).toBeCloseTo(0.5, 5);
    expect(flashStrength(2000)).toBeLessThan(0.2);
    for (let d = 0; d < 3000; d += 50) expect(flashStrength(d + 50)).toBeLessThan(flashStrength(d));
  });

  it('kaukainen salama kirkastaa vain vähän: järvi ei vaalene', () => {
    const sky = new SkyView();
    sky.update(13, 0, 0, calm);
    const day = sky.grade.mul.y;
    sky.update(13, 0, flashStrength(2000), calm);
    expect(sky.grade.mul.y - day).toBeLessThan(0.1);
  });
});
