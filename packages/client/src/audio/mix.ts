import type { Vec2 } from '@lunki/shared';

/**
 * Miksaus (#411): väylien voimakkuudet, väistö ja äänten suunta yhdessä
 * paikassa, samaan tapaan kuin äänikartta `SOUNDS` ja ohjauksen `CONTROLS`.
 */

/** Väylien voimakkuudet ennen pelaajan omia säätöjä (Asetukset → Äänet). */
export const MIX = {
  effects: 0.25,
  /** Ukkonen on kovempi kuin muut tehosteet; rajoitin estää säröytymisen. */
  thunder: 0.9,
  ambience: 0.5,
  music: 0.5,
  voice: 1,
} as const;

/** Väylät, joita tärkeä ääni hiljentää hetkeksi. */
export type DuckedBus = 'ambience' | 'music';

export interface Duck {
  /** Hiljennys desibeleinä väylittäin. */
  ambience: number;
  music: number;
  /** Kesto (s), jos ääni ei kerro omaansa. */
  hold: number;
}

/**
 * Väistö: tärkeä ääni laskee ympäristöä ja musiikkia, jotta repliikki,
 * isku ja lähisalama kuuluvat rankkasateen ja musiikin läpi. Musiikki
 * hiljenee ukkosella reilusti mutta ei kokonaan.
 */
export const DUCKS = {
  /** Kalastajan repliikki: kesto on repliikin pituus. */
  voice: { ambience: -6, music: -9, hold: 1.5 },
  /** Tärppi ja isku. */
  hit: { ambience: -4, music: -6, hold: 0.6 },
  /** Iloinen sävelmä: ennätys tai kala pitkän odotuksen jälkeen. */
  joy: { ambience: -4, music: -12, hold: 1.6 },
  /** Lähisalaman jyrähdys. */
  thunder: { ambience: -6, music: -18, hold: 3.5 },
} satisfies Record<string, Duck>;

export type DuckId = keyof typeof DUCKS;

/** Väistö alas 0,1 s:ssa ja takaisin 1,5 s:ssa (aikavakiot, ~3 τ). */
export const DUCK_TIME = { attack: 0.1 / 3, release: 1.5 / 3 } as const;

/** Käynnissä oleva väistö: hiljennys (dB) aikavälillä from–until (AudioContextin aika). */
export interface ActiveDuck {
  from: number;
  until: number;
  db: number;
}

export const dbGain = (db: number) => 10 ** (db / 20);

/** Väylän voimakkuuskerroin hetkellä `t`: voimakkain voimassa oleva väistö ratkaisee. */
export function duckLevel(active: readonly ActiveDuck[], t: number): number {
  let db = 0;
  for (const d of active) if (d.from <= t && t < d.until) db = Math.min(db, d.db);
  return dbGain(db);
}

/**
 * Väylän voimakkuuden muutokset hetkestä `now` eteenpäin: jokaisen väistön
 * alussa ja lopussa uusi taso. Peräkkäiset samat tasot jätetään pois.
 */
export function duckSchedule(
  active: readonly ActiveDuck[],
  now: number,
): { at: number; gain: number }[] {
  const times = [now, ...active.flatMap((d) => [d.from, d.until])]
    .filter((t) => t >= now)
    .sort((a, b) => a - b);
  const steps: { at: number; gain: number }[] = [];
  for (const at of times) {
    const gain = duckLevel(active, at);
    if (steps.length === 0 || steps[steps.length - 1]!.gain !== gain) steps.push({ at, gain });
  }
  return steps;
}

/**
 * Kuulija: kalastajan (tai katsojan) paikka ja ruudun oikea suunta järvellä
 * (yksikkövektori). Ylhäältä katsottuna oikea on ruudun oikea laita, POV:ssa
 * kalastajan oikea käsi.
 */
export interface Listener {
  ear: Vec2;
  right: Vec2;
}

/** Valikossa ja ennen kisaa: kuulija keskellä, oikea itään. */
export const CENTER_LISTENER: Listener = { ear: { x: 0, y: 0 }, right: { x: 1, y: 0 } };

/** Suurin sivusuunta; täysin toisesta kanavasta tuleva ääni kuulostaa luonnottomalta. */
export const PAN_MAX = 0.8;

/**
 * Äänen suunta kuulijasta -1 (vasen) … 1 (oikea). Aivan vierestä (alle 4 m)
 * kuuluva ääni tulee keskeltä. Takaa ja edestä kuuluvat samoin, koska
 * stereossa ei ole edessä ja takana.
 */
export function effectPan(at: Vec2, l: Listener): number {
  const dx = at.x - l.ear.x;
  const dy = at.y - l.ear.y;
  const side = (dx * l.right.x + dy * l.right.y) / Math.max(4, Math.hypot(dx, dy));
  return Math.max(-1, Math.min(1, side)) * PAN_MAX;
}

/** Kaukainen ääni tummuu: alipäästön raja (Hz) etäisyyden mukaan, lähellä ei suodatusta. */
export const MUFFLE = { near: 15, far: 150, open: 18000, dull: 1200 } as const;

export function effectMuffle(d: number): number {
  const { near, far, open, dull } = MUFFLE;
  const k = Math.max(0, Math.min(1, (d - near) / (far - near)));
  return open * (dull / open) ** k;
}
