import { SKY_EFFECTS, type Vec2, type WeatherNow, type WeatherPlan } from '@lunki/shared';

/**
 * Ukkosrintama (#414): taivasta tummentava säämuutos ei tule tasaisesti
 * joka suunnasta vaan rintamana tuulen yläpuolelta. Rintama nousee
 * taivaanrantaan `time` s ennen muutosta, lähestyy `speed` m/s ja ohittaa
 * kalastajan `pass` s ennen muutosta; sade ja synkkyys alkavat silloin.
 * Rintama on pelkkää näkymää: sää itse (`weatherAt`, kalat, palvelin) ei
 * muutu, joten moninpelissä palvelinta ei tarvitse päivittää.
 */
export const FRONT = {
  time: 120,
  speed: 10,
  pass: 15,
  /** Rintaman alkama pilvisyyden kasvu (taivaan tummuus 0–1). */
  minStep: 0.15,
  /** Rintaman alla valo hämärtyy jo vähän ennen reunaa: osuus ja etäisyys (m). */
  dusk: 0.3,
  duskRange: 800,
  /** Reunan pehmeys kalastajan kohdalla (m). */
  soft: 40,
} as const;

export interface StormFront {
  /** Suunta, josta rintama tulee (x itään, y pohjoiseen, yksikkövektori). */
  dir: Vec2;
  /** Reunan etäisyys kalastajasta (m); negatiivinen = jo ohi. */
  distance: number;
  /** Rintaman alla olevan sään taivaan tummuus ja sade. */
  darkness: number;
  rain: number;
  /** Kaukaisia salamoita rintaman alla (seuraava sää on ukkonen tai myrsky). */
  thunder: boolean;
}

/** Lähestyvä rintama kisa-ajan hetkellä t; null, jos sellaista ei ole. */
export function stormFront(plan: WeatherPlan, t: number, now: WeatherNow): StormFront | null {
  if (!now.next || now.untilChange > FRONT.time) return null;
  const next = plan.segments.find((s) => s.start > t);
  if (!next) return null;
  const a = SKY_EFFECTS[now.sky];
  const b = SKY_EFFECTS[now.next];
  if (b.darkness < a.darkness + FRONT.minStep) return null;
  return {
    // Tuuli puhaltaa suuntaan windDir, joten rintama tulee vastakkaisesta.
    dir: { x: -Math.cos(next.windDir), y: -Math.sin(next.windDir) },
    distance: FRONT.speed * (now.untilChange - FRONT.pass),
    darkness: b.darkness,
    rain: b.rain,
    thunder: b.severity >= 3 && a.severity < 3,
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * Taivaan tummuus ja sade kalastajan kohdalla rintaman mukaan: nykyisen
 * tilan arvot, kunnes reuna on kohdalla, ja sen jälkeen seuraavan.
 */
export function frontWeather(
  now: WeatherNow,
  front: StormFront | null,
): { darkness: number; rain: number } {
  if (!front) return { darkness: now.darkness, rain: now.rain };
  const a = SKY_EFFECTS[now.sky];
  const over = smoothstep(FRONT.soft, -FRONT.soft, front.distance);
  const dusk = FRONT.dusk * smoothstep(FRONT.duskRange, 0, front.distance);
  return {
    darkness: a.darkness + (front.darkness - a.darkness) * Math.max(over, dusk),
    rain: a.rain + (front.rain - a.rain) * over,
  };
}
