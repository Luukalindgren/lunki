/**
 * Vuorokaudenaika: kisa käydään aamulla, päivällä, illalla tai yöllä.
 * Aurinko liikkuu kisan aikana, jotta muutos näkyy lyhyessäkin kisassa:
 * aamukisassa aurinko nousee, iltakisassa se laskee.
 */
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';

export const TIME_OF_DAY_IDS: readonly TimeOfDay[] = ['morning', 'day', 'evening', 'night'];

export const TIME_OF_DAY_NAMES: Record<TimeOfDay, string> = {
  morning: 'Aamu',
  day: 'Päivä',
  evening: 'Ilta',
  night: 'Yö',
};

export const isTimeOfDay = (v: unknown): v is TimeOfDay =>
  typeof v === 'string' && Object.hasOwn(TIME_OF_DAY_NAMES, v);

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * Auringon korkeus (°) ja suunta (°, x itään, y pohjoiseen, vastapäivään
 * idästä) kisan alussa ja lopussa. Kesällä Tammelassa aurinko nousee
 * koillisesta ja laskee luoteeseen.
 */
const SUN_PATH: Record<TimeOfDay, { elevation: [number, number]; azimuth: [number, number] }> = {
  morning: { elevation: [-3, 9], azimuth: [55, 45] },
  day: { elevation: [48, 47], azimuth: [-80, -95] },
  evening: { elevation: [8, -4], azimuth: [128, 136] },
  night: { elevation: [-14, -14], azimuth: [160, 175] },
};

/** Kuu yöllä kaakossa; muulloin sitä ei piirretä. */
const MOON_PATH = { elevation: [16, 21], azimuth: [-45, -62] } as const;

export interface CelestialPosition {
  /** Korkeus horisontista (rad); negatiivinen = horisontin alla. */
  elevation: number;
  /** Suunta (rad, x itään, y pohjoiseen). */
  azimuth: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Auringon paikka, kun kisasta on kulunut osuus `progress` (0–1). */
export function sunAt(time: TimeOfDay, progress: number): CelestialPosition {
  const p = clamp01(progress);
  const path = SUN_PATH[time];
  return {
    elevation: deg(lerp(path.elevation[0], path.elevation[1], p)),
    azimuth: deg(lerp(path.azimuth[0], path.azimuth[1], p)),
  };
}

/** Kuun paikka yöllä; muina aikoina null. */
export function moonAt(time: TimeOfDay, progress: number): CelestialPosition | null {
  if (time !== 'night') return null;
  const p = clamp01(progress);
  return {
    elevation: deg(lerp(MOON_PATH.elevation[0], MOON_PATH.elevation[1], p)),
    azimuth: deg(lerp(MOON_PATH.azimuth[0], MOON_PATH.azimuth[1], p)),
  };
}

export interface Daylight {
  /** Päivänvalo 0 (yö, kuutamo) – 1 (kirkas päivä). */
  light: number;
  /** Hämäryys 0–1: suurin auringon ollessa horisontissa (petokalojen syöntiaika). */
  twilight: number;
}

/** Valon määrä auringon korkeudesta: kalojen käytös ja valaistus seuraavat tätä. */
export function daylight(time: TimeOfDay, progress: number): Daylight {
  const el = (sunAt(time, progress).elevation * 180) / Math.PI;
  return {
    light: 0.12 + 0.88 * smoothstep(-8, 25, el),
    twilight: 1 - smoothstep(0, 1, Math.abs(el - 1) / 12),
  };
}
