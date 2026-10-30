import { DEFAULT_SEASON, SEASONS, type Season } from './season';

/**
 * Vuorokaudenaika ja pelikello. Kisa käydään aamulla, päivällä, illalla tai
 * yöllä: valinta kertoo, mihin kellonaikaan kisa alkaa, ja taustalla käy
 * 24 tunnin pelikello, joka etenee kisakelloa nopeammin. Aurinko ja kuu
 * lasketaan pelikellosta Lunkinjärven sijainnin mukaan vuodenajan
 * kisapäivälle (ks. SEASONS).
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

/** Kisan alkamisaika kesällä (tuntia, Suomen kesäaika); muut kaudet: SEASONS. */
export const START_HOUR: Record<TimeOfDay, number> = SEASONS[DEFAULT_SEASON].startHour;

/** Pelikellon minuutteja yhtä kisaminuuttia kohden (15 min kisa = 3 h). */
export const GAME_MINUTES_PER_MINUTE = 12;

/** Pelikello (tuntia 0–24), kun kisaa on kulunut `elapsed` sekuntia. */
export function clockAt(time: TimeOfDay, elapsed: number, season: Season = DEFAULT_SEASON): number {
  const hours =
    SEASONS[season].startHour[time] + (Math.max(0, elapsed) * GAME_MINUTES_PER_MINUTE) / 3600;
  return ((hours % 24) + 24) % 24;
}

/** Kellonaika muodossa 05:07. */
export function formatClock(hours: number): string {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const deg = (d: number) => (d * Math.PI) / 180;

/** Lunkinjärvi, Tammela; leveysaste on myös taivaannavan korkeus (rad). */
export const LATITUDE = deg(60.81);
const LONGITUDE = 23.76;
/** Kesäaika UTC+3 (myös lokakuun alussa). */
const UTC_OFFSET = 3;

export interface CelestialPosition {
  /** Korkeus horisontista (rad); negatiivinen = horisontin alla. */
  elevation: number;
  /** Suunta (rad, x itään, y pohjoiseen, vastapäivään idästä). */
  azimuth: number;
}

/** Auringon deklinaatio ja tuntikulma (rad) NOAA:n likikaavoilla. */
function solar(hours: number, season: Season): { declination: number; hourAngle: number } {
  const g = ((2 * Math.PI) / 365) * (SEASONS[season].dayOfYear - 1 + (hours - 12) / 24);
  const declination =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const solarMinutes = hours * 60 - UTC_OFFSET * 60 + 4 * LONGITUDE + equationOfTime;
  return { declination, hourAngle: deg(solarMinutes / 4 - 180) };
}

/** Taivaan koordinaateista korkeus ja pelin suunta. */
function horizontal(declination: number, hourAngle: number): CelestialPosition {
  const sinEl =
    Math.sin(LATITUDE) * Math.sin(declination) +
    Math.cos(LATITUDE) * Math.cos(declination) * Math.cos(hourAngle);
  // Atsimuutti etelästä länteen; kompassisuunta pohjoisesta myötäpäivään = tämä + 180°.
  const fromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(LATITUDE) - Math.tan(declination) * Math.cos(LATITUDE),
  );
  const compass = fromSouth + Math.PI;
  return { elevation: Math.asin(sinEl), azimuth: Math.PI / 2 - compass };
}

/** Auringon paikka pelikellon aikaan `hours` kauden kisapäivänä. */
export function sunAt(hours: number, season: Season = DEFAULT_SEASON): CelestialPosition {
  const { declination, hourAngle } = solar(hours, season);
  return horizontal(declination, hourAngle);
}

/** Maan akselin kaltevuus (ekliptikan vinous). */
const OBLIQUITY = deg(23.44);

/** Ekliptikan pituudesta (rad) tasaajan koordinaatit: rektaskensio ja deklinaatio. */
function equatorial(longitude: number): { ra: number; declination: number } {
  return {
    ra: Math.atan2(Math.cos(OBLIQUITY) * Math.sin(longitude), Math.cos(longitude)),
    declination: Math.asin(Math.sin(OBLIQUITY) * Math.sin(longitude)),
  };
}

/**
 * Kuun paikka, kun kuun vaihe on `phase` (0 = uusikuu, 0,25 = kasvava
 * puolikuu, 0,5 = täysikuu, 0,75 = vähenevä puolikuu). Kuu on ekliptikalla
 * vaiheen verran auringosta itään: täysikuu on vastapäätä aurinkoa (nousee
 * auringon laskiessa), kasvava kuu näkyy illalla ja vähenevä aamulla.
 * Kuun oma liike (12° vuorokaudessa) jätetään kisan ajaksi huomiotta.
 */
export function moonAt(
  hours: number,
  season: Season = DEFAULT_SEASON,
  phase = 0.5,
): CelestialPosition {
  const { hourAngle } = solar(hours, season);
  // Auringon ekliptinen pituus (kevätpäiväntasaus 20.3. = 0) keskiarvona.
  const day = SEASONS[season].dayOfYear - 80 + (hours - 12) / 24;
  const sunLongitude = (2 * Math.PI * day) / 365.2422;
  const sun = equatorial(sunLongitude);
  const moon = equatorial(sunLongitude + 2 * Math.PI * phase);
  return horizontal(moon.declination, hourAngle + sun.ra - moon.ra);
}

/** Kuun valaistu osuus 0 (uusikuu) – 1 (täysikuu). */
export const moonIllumination = (phase: number) => (1 - Math.cos(2 * Math.PI * phase)) / 2;

export interface Daylight {
  /** Päivänvalo 0 (yö, kuutamo) – 1 (kirkas päivä). */
  light: number;
  /** Hämäryys 0–1: suurin auringon ollessa horisontissa (petokalojen syöntiaika). */
  twilight: number;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Valon määrä auringon korkeudesta: kalojen käytös ja valaistus seuraavat tätä. */
export function daylight(hours: number, season: Season = DEFAULT_SEASON): Daylight {
  const el = (sunAt(hours, season).elevation * 180) / Math.PI;
  return {
    light: 0.12 + 0.88 * smoothstep(-8, 25, el),
    twilight: 1 - smoothstep(0, 1, Math.abs(el - 1) / 12),
  };
}
