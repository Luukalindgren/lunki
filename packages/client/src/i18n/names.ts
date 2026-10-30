import {
  BoatSeat,
  LURES,
  lureVariant,
  type CrankDepthId,
  type JigWeightId,
  type Craft,
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
  type Season,
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
export const jigWeightName = (id: JigWeightId) => t(`jigWeight.${id}`);
export const jigWeightHint = (id: JigWeightId) => t(`jigWeight.${id}.hint`);
export const crankDepthName = (id: CrankDepthId) => t(`crankDepth.${id}`);
export const crankDepthHint = (id: CrankDepthId) => t(`crankDepth.${id}.hint`);
/** Vieheen säädön nimi: "20 g" tai "syvä". */
export const lureVariantName = (v: JigWeightId | CrankDepthId) =>
  v.startsWith('g') ? jigWeightName(v as JigWeightId) : crankDepthName(v as CrankDepthId);
/** Vieheen nimi säätöineen (#363): "Jigi 20 g", "Vaappu syvä". */
export function lureLabel(lure: LureId, variant?: JigWeightId | CrankDepthId | null): string {
  if (!variant) return lureName(lure);
  return t('lure.withVariant', { lure: lureName(lure), variant: lureVariantName(variant) });
}
/** Käytössä olevan vieheen nimi säätöineen. */
export const tackleLureName = (tk: Tackle) => lureLabel(tk.lure, lureVariant(tk));
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
export const seasonName = (v: Season) => t(`season.${v}`);
export const difficultyName = (d: Difficulty) => t(`difficulty.${d}`);
export const winRuleName = (w: WinRule) => t(`winRule.${w}`);
export const penaltyName = (p: Penalty) => t(`penalty.${p}`);
export const weatherLevelName = (w: WeatherLevel) => t(`weather.${w}`);
export const lateJoinName = (v: LateJoin) => t(`lateJoin.${v}`);
export const craftName = (c: Craft) => t(`craft.${c}`);
/** Paikka veneessä (BoatSeat): soutaja, perä tai keula. */
export const seatName = (seat: number) =>
  t(seat === BoatSeat.stern ? 'boat.stern' : seat === BoatSeat.bow ? 'boat.bow' : 'boat.rower');
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
    : `${tackleLureName(tk)} · ${lineName(tk.line)}${tk.leader ? ` · ${t('tackle.leaderShort')}` : ''}`;

/** Varusteet kokonaan, vapa mukaan lukien (aula ja tulostaulu). */
export const describeFullTackle = (tk: Tackle) =>
  `${tk.method === 'fly' ? flyRodName(tk.flyRod) : rodName(tk.rod)} · ${describeTackle(tk)}`;

/** Käytössä oleva viehe tai perho nimeltä. */
export const baitName = (tk: Tackle) =>
  tk.method === 'fly' ? flyName(tk.fly) : tackleLureName(tk);

/** Viehe tunnetaan, vaikka nimeä ei näytettäisi (tallennetut ennätykset). */
export const isLure = (v: string): v is LureId => Object.hasOwn(LURES, v);
