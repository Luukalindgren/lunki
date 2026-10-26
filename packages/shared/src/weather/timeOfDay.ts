/**
 * Vuorokaudenaika ja pelikello. Kisa käydään aamulla, päivällä, illalla tai
 * yöllä: valinta kertoo, mihin kellonaikaan kisa alkaa, ja taustalla käy
 * 24 tunnin pelikello, joka etenee kisakelloa nopeammin. Aurinko ja kuu
 * lasketaan pelikellosta Lunkinjärven sijainnin mukaan elokuun lopulla.
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

/**
 * Kisan alkamisaika (tuntia, Suomen kesäaika). Aamukisa alkaa sarastuksesta,
 * päiväkisa iltapäivästä (pitkä kisa jatkuu kultaiseen tuntiin), iltakisa
 * kultaisesta tunnista ja yökisa kuutamosta.
 */
export const START_HOUR: Record<TimeOfDay, number> = {
  morning: 4.75,
  day: 14.5,
  evening: 19,
  night: 23,
};

/** Pelikellon minuutteja yhtä kisaminuuttia kohden (15 min kisa = 3 h). */
export const GAME_MINUTES_PER_MINUTE = 12;

/** Pelikello (tuntia 0–24), kun kisaa on kulunut `elapsed` sekuntia. */
export function clockAt(time: TimeOfDay, elapsed: number): number {
  const hours = START_HOUR[time] + (Math.max(0, elapsed) * GAME_MINUTES_PER_MINUTE) / 3600;
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

/** Lunkinjärvi, Tammela. */
const LATITUDE = deg(60.81);
const LONGITUDE = 23.76;
/** Kisapäivä: 20. elokuuta (vuoden 232. päivä), kesäaika UTC+3. */
const DAY_OF_YEAR = 232;
const UTC_OFFSET = 3;

export interface CelestialPosition {
  /** Korkeus horisontista (rad); negatiivinen = horisontin alla. */
  elevation: number;
  /** Suunta (rad, x itään, y pohjoiseen, vastapäivään idästä). */
  azimuth: number;
}

/** Auringon deklinaatio ja tuntikulma (rad) NOAA:n likikaavoilla. */
function solar(hours: number): { declination: number; hourAngle: number } {
  const g = ((2 * Math.PI) / 365) * (DAY_OF_YEAR - 1 + (hours - 12) / 24);
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

/** Auringon paikka pelikellon aikaan `hours`. */
export function sunAt(hours: number): CelestialPosition {
  const { declination, hourAngle } = solar(hours);
  return horizontal(declination, hourAngle);
}

/**
 * Kuun paikka: kisailtana on täysikuu, joka on taivaalla vastapäätä
 * aurinkoa (nousee auringon laskiessa ja on keskiyöllä etelässä).
 */
export function moonAt(hours: number): CelestialPosition {
  const { declination, hourAngle } = solar(hours);
  return horizontal(-declination, hourAngle + Math.PI);
}

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
export function daylight(hours: number): Daylight {
  const el = (sunAt(hours).elevation * 180) / Math.PI;
  return {
    light: 0.12 + 0.88 * smoothstep(-8, 25, el),
    twilight: 1 - smoothstep(0, 1, Math.abs(el - 1) / 12),
  };
}
