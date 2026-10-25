import { Rng } from '../rng';

/** Säätila: tyynestä myrskyyn. Trombi on erillinen tapahtuma (vaihe 4). */
export type Sky = 'calm' | 'windy' | 'rain' | 'thunder' | 'storm';
export const SKIES: readonly Sky[] = ['calm', 'windy', 'rain', 'thunder', 'storm'];

export const SKY_NAMES: Record<Sky, string> = {
  calm: 'Tyyni',
  windy: 'Tuulinen',
  rain: 'Sade',
  thunder: 'Ukkonen',
  storm: 'Myrsky',
};

/** Säätaso: kuinka usein ja kuinka rajuja sääilmiöitä kisan aikana on. */
export type WeatherLevel = 'calm' | 'realistic' | 'some' | 'lots' | 'chaos';

interface LevelSpec {
  label: string;
  /** Alkutilan todennäköisyydet. */
  initial: Partial<Record<Sky, number>>;
  /** Tilan keskimääräinen kesto (min). */
  meanMinutes: Record<Sky, number>;
  /** Seuraavan tilan painot. */
  next: Record<Sky, Partial<Record<Sky, number>>>;
}

const ALL_EXCEPT = (sky: Sky, weights: Partial<Record<Sky, number>>) =>
  Object.fromEntries(Object.entries(weights).filter(([k]) => k !== sky)) as Partial<
    Record<Sky, number>
  >;

const CHAOS_WEIGHTS = { calm: 0.3, windy: 0.7, rain: 0.7, thunder: 1.6, storm: 2 };

export const WEATHER_LEVELS: Record<WeatherLevel, LevelSpec> = {
  calm: {
    label: 'Aina tyyni',
    initial: { calm: 1 },
    meanMinutes: { calm: Infinity, windy: 1, rain: 1, thunder: 1, storm: 1 },
    next: {
      calm: { calm: 1 },
      windy: { calm: 1 },
      rain: { calm: 1 },
      thunder: { calm: 1 },
      storm: { calm: 1 },
    },
  },
  // Suomen kesäpäivä: enimmäkseen tyyntä tai tuulista, joskus sadekuuro, ukkonen harvoin.
  realistic: {
    label: 'Realistinen',
    initial: { calm: 0.5, windy: 0.4, rain: 0.1 },
    meanMinutes: { calm: 8, windy: 6, rain: 5, thunder: 4, storm: 2 },
    next: {
      calm: { windy: 0.85, rain: 0.15 },
      windy: { calm: 0.6, rain: 0.3, thunder: 0.1 },
      rain: { windy: 0.5, calm: 0.35, thunder: 0.15 },
      thunder: { rain: 0.8, storm: 0.2 },
      storm: { rain: 0.6, thunder: 0.4 },
    },
  },
  some: {
    label: 'Vähän sääilmiöitä',
    initial: { calm: 0.4, windy: 0.4, rain: 0.2 },
    meanMinutes: { calm: 5, windy: 4, rain: 4, thunder: 3, storm: 2 },
    next: {
      calm: { windy: 0.6, rain: 0.4 },
      windy: { calm: 0.35, rain: 0.4, thunder: 0.25 },
      rain: { windy: 0.35, calm: 0.2, thunder: 0.45 },
      thunder: { rain: 0.6, storm: 0.4 },
      storm: { rain: 0.5, thunder: 0.3, windy: 0.2 },
    },
  },
  lots: {
    label: 'Paljon sääilmiöitä',
    initial: { windy: 0.5, rain: 0.3, thunder: 0.2 },
    meanMinutes: { calm: 2, windy: 2.5, rain: 2.5, thunder: 2, storm: 1.5 },
    next: {
      calm: { windy: 0.5, rain: 0.3, thunder: 0.2 },
      windy: { rain: 0.4, thunder: 0.4, storm: 0.2 },
      rain: { thunder: 0.5, storm: 0.2, windy: 0.3 },
      thunder: { rain: 0.5, storm: 0.3, windy: 0.2 },
      storm: { rain: 0.4, thunder: 0.3, windy: 0.3 },
    },
  },
  chaos: {
    label: 'Täysi kaaos',
    initial: ALL_EXCEPT('calm', CHAOS_WEIGHTS),
    meanMinutes: { calm: 1, windy: 1.2, rain: 1.2, thunder: 1.5, storm: 1.5 },
    next: {
      calm: ALL_EXCEPT('calm', CHAOS_WEIGHTS),
      windy: ALL_EXCEPT('windy', CHAOS_WEIGHTS),
      rain: ALL_EXCEPT('rain', CHAOS_WEIGHTS),
      thunder: ALL_EXCEPT('thunder', CHAOS_WEIGHTS),
      storm: ALL_EXCEPT('storm', CHAOS_WEIGHTS),
    },
  },
};

export const WEATHER_LEVEL_IDS = Object.keys(WEATHER_LEVELS) as WeatherLevel[];
export const isWeatherLevel = (v: unknown): v is WeatherLevel =>
  typeof v === 'string' && Object.hasOwn(WEATHER_LEVELS, v);

/** Kunkin tilan tuuli (m/s), sade (0–1) ja taivaan tummuus (0–1). */
export const SKY_EFFECTS: Record<
  Sky,
  { wind: [number, number]; rain: number; darkness: number; severity: number }
> = {
  calm: { wind: [0, 2], rain: 0, darkness: 0, severity: 0 },
  windy: { wind: [4, 8], rain: 0, darkness: 0.1, severity: 1 },
  rain: { wind: [3, 7], rain: 0.6, darkness: 0.35, severity: 2 },
  thunder: { wind: [5, 10], rain: 0.8, darkness: 0.6, severity: 3 },
  storm: { wind: [10, 16], rain: 1, darkness: 0.75, severity: 4 },
};

export const WEATHER = {
  /** Lyhin tila (s): ennakkovaroitukselle jää aikaa. */
  minSegment: 40,
  /** Ennakkovaroitus ja siirtymä alkavat näin paljon ennen muutosta (s). */
  warning: 45,
  /** Tuulen suunnan muutoksen keskihajonta tilan vaihtuessa (rad). */
  veer: 0.45,
  /** Puuskien vaihtelu tuulen nopeudesta (osuus). */
  gust: 0.15,
} as const;

export interface WeatherSegment {
  /** Alkuhetki kisan alusta (s). */
  start: number;
  sky: Sky;
  /** Tuulen nopeus (m/s) ja suunta, johon tuuli puhaltaa (rad, x itään, y pohjoiseen). */
  windSpeed: number;
  windDir: number;
}

export interface WeatherPlan {
  level: WeatherLevel;
  segments: WeatherSegment[];
}

/**
 * Sää koko kisan ajaksi etukäteen siemenestä: palvelin ja asiakkaat laskevat
 * saman suunnitelman, joten sään ei tarvitse kulkea verkossa.
 */
export function planWeather(seed: number, level: WeatherLevel, durationS: number): WeatherPlan {
  const spec = WEATHER_LEVELS[level];
  const rng = new Rng(seed ^ 0x3c6ef372);
  const segments: WeatherSegment[] = [];
  let sky = pick(spec.initial, rng);
  let dir = rng.range(-Math.PI, Math.PI);
  let t = 0;
  // Varaa hieman yli kisan keston, jotta viimeinen siirtymä on määritelty.
  while (t < durationS + WEATHER.warning) {
    const [lo, hi] = SKY_EFFECTS[sky].wind;
    segments.push({ start: t, sky, windSpeed: round2(rng.range(lo, hi)), windDir: round2(dir) });
    const mean = spec.meanMinutes[sky] * 60;
    if (!Number.isFinite(mean)) break;
    // Eksponenttijakauma: muutos voi tulla milloin vain, keskimäärin `mean` välein.
    t += Math.max(WEATHER.minSegment, -Math.log(1 - rng.next()) * mean);
    sky = pick(spec.next[sky], rng);
    dir = wrap(dir + rng.normal(0, WEATHER.veer));
  }
  return { level, segments };
}

export type WeatherWarning = 'darkening' | 'rumble' | 'wind';

export const WARNING_TEXTS: Record<WeatherWarning, string> = {
  darkening: 'Taivas tummuu…',
  rumble: 'Kaukaa kuuluu ukkosen jyrinää',
  wind: 'Tuuli yltyy',
};

export interface WeatherNow {
  sky: Sky;
  /** Seuraava tila ja aika siihen (s); null, jos säätä ei enää muutu. */
  next: Sky | null;
  untilChange: number;
  /** Ennakkovaroitukset tulevasta muutoksesta. */
  warnings: WeatherWarning[];
  windSpeed: number;
  windDir: number;
  /** Sateen voimakkuus ja taivaan tummuus 0–1, liukuvat muutoksen lähestyessä. */
  rain: number;
  darkness: number;
}

/** Sää kisa-ajan hetkellä t. */
export function weatherAt(plan: WeatherPlan, t: number): WeatherNow {
  const segs = plan.segments;
  let i = 0;
  while (i + 1 < segs.length && segs[i + 1]!.start <= t) i++;
  const cur = segs[i]!;
  const nxt = segs[i + 1] ?? null;
  const untilChange = nxt ? nxt.start - t : Infinity;
  // Siirtymä alkaa varoitusajan alussa ja päättyy muutokseen.
  const k = nxt ? smooth(1 - Math.min(1, untilChange / WEATHER.warning)) : 0;
  const a = SKY_EFFECTS[cur.sky];
  const b = nxt ? SKY_EFFECTS[nxt.sky] : a;
  const warnings: WeatherWarning[] = [];
  if (nxt && untilChange <= WEATHER.warning) {
    if (b.darkness > a.darkness + 0.15) warnings.push('darkening');
    if (b.severity >= 3 && a.severity < 3) warnings.push('rumble');
    if (nxt.windSpeed > cur.windSpeed + 3) warnings.push('wind');
  }
  const base = lerp(cur.windSpeed, nxt?.windSpeed ?? cur.windSpeed, k);
  // Puuskat: kahden eri jakson siniaallon summa, sama kaikilla.
  const gust = 1 + WEATHER.gust * (0.6 * Math.sin(t * 0.9 + 1.3) + 0.4 * Math.sin(t * 2.3));
  return {
    sky: cur.sky,
    next: nxt?.sky ?? null,
    untilChange,
    warnings,
    windSpeed: Math.max(0, base * gust),
    windDir: lerpAngle(cur.windDir, nxt?.windDir ?? cur.windDir, k),
    rain: lerp(a.rain, b.rain, k),
    darkness: lerp(a.darkness, b.darkness, k),
  };
}

function pick(weights: Partial<Record<Sky, number>>, rng: Rng): Sky {
  const entries = SKIES.filter((s) => (weights[s] ?? 0) > 0).map((s) => [s, weights[s]!] as const);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng.next() * total;
  for (const [s, w] of entries) {
    r -= w;
    if (r < 0) return s;
  }
  return entries[entries.length - 1]![0];
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (k: number) => k * k * (3 - 2 * k);
const round2 = (v: number) => Math.round(v * 100) / 100;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a: number, b: number, k: number) => wrap(a + wrap(b - a) * k);
