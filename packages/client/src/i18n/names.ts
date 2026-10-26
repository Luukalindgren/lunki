import {
  LURES,
  type Difficulty,
  type FlyId,
  type FlyLeaderId,
  type FlyLineId,
  type FlyRodId,
  type Method,
  type LateJoin,
  type LineId,
  type LureId,
  type Penalty,
  type RodId,
  type Sky,
  type SpeciesId,
  type Tackle,
  type TimeOfDay,
  type WeatherLevel,
  type WeatherWarning,
  type WinRule,
} from '@lunki/shared';
import { hasKey, t } from './index';

/**
 * Jaetun koodin tunnisteiden (laji, viehe, sää…) nimet pelaajan kielellä.
 * Jaetussa paketissa nimet ovat suomeksi palvelimen lokeja varten; asiakas
 * näyttää aina nämä käännökset.
 */
export const speciesName = (id: SpeciesId) => t(`species.${id}`);
export const lureName = (id: LureId) => t(`lure.${id}`);
export const lureHint = (id: LureId) => t(`lure.${id}.hint`);
export const rodName = (id: RodId) => t(`rod.${id}`);
export const rodHint = (id: RodId) => t(`rod.${id}.hint`);
/** Siiman paksuus, esim. "0,25 mm". */
export const lineName = (id: LineId) => t(`line.${id}`);
export const methodName = (id: Method) => t(`method.${id}`);
export const flyName = (id: FlyId) => t(`fly.${id}`);
export const flyHint = (id: FlyId) => t(`fly.${id}.hint`);
export const flyRodName = (id: FlyRodId) => t(`flyRod.${id}`);
export const flyRodHint = (id: FlyRodId) => t(`flyRod.${id}.hint`);
export const flyLineName = (id: FlyLineId) => t(`flyLine.${id}`);
export const flyLineHint = (id: FlyLineId) => t(`flyLine.${id}.hint`);
export const flyLeaderName = (id: FlyLeaderId) => t(`flyLeader.${id}`);
export const skyName = (sky: Sky) => t(`sky.${sky}`);
export const timeOfDayName = (v: TimeOfDay) => t(`timeOfDay.${v}`);
export const difficultyName = (d: Difficulty) => t(`difficulty.${d}`);
export const winRuleName = (w: WinRule) => t(`winRule.${w}`);
export const penaltyName = (p: Penalty) => t(`penalty.${p}`);
export const weatherLevelName = (w: WeatherLevel) => t(`weather.${w}`);
export const lateJoinName = (v: LateJoin) => t(`lateJoin.${v}`);
export const warningText = (w: WeatherWarning) => t(`warning.${w}`);
export const landPenaltyName = (seconds: number) =>
  seconds === 0 ? t('landPenalty.none') : t('landPenalty.seconds', { s: seconds });

/** Värin nimi paletin sävyn mukaan; tuntematon väri saa jaetun nimen. */
export function colorName(hex: number, fallback: string): string {
  const key = `color.${hex.toString(16).padStart(6, '0')}`;
  return hasKey(key) ? t(key) : fallback;
}

/** Varusteet lyhyesti HUD:iin. */
export const describeTackle = (tk: Tackle) =>
  tk.method === 'fly'
    ? `${flyName(tk.fly)} · ${flyLineName(tk.flyLine)} · ${flyLeaderName(tk.flyLeader)}`
    : `${lureName(tk.lure)} · ${lineName(tk.line)}${tk.leader ? ` · ${t('tackle.leaderShort')}` : ''}`;

/** Varusteet kokonaan, vapa mukaan lukien (aula ja tulostaulu). */
export const describeFullTackle = (tk: Tackle) =>
  `${tk.method === 'fly' ? flyRodName(tk.flyRod) : rodName(tk.rod)} · ${describeTackle(tk)}`;

/** Käytössä oleva viehe tai perho nimeltä. */
export const baitName = (tk: Tackle) => (tk.method === 'fly' ? flyName(tk.fly) : lureName(tk.lure));

/** Viehe tunnetaan, vaikka nimeä ei näytettäisi (tallennetut ennätykset). */
export const isLure = (v: string): v is LureId => Object.hasOwn(LURES, v);
