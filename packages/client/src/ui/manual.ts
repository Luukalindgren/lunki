import {
  COLD_WATER,
  DIFFICULTIES,
  FLY_CAST,
  LINES,
  RODS,
  SEASONS,
  SHORE,
  INFLATE,
  SPECIES,
} from '@lunki/shared';
import { controlText, type ControlMode } from '../game/controls';
import { KEY_TARGET_LINE } from '../game/flyCastControl';
import { FRONT } from '../game/stormFront';
import { shortDecimal, t, type MsgKey } from '../i18n';

/**
 * Ohjeet-näkymän sisältö (#401): kalastuksen mekaniikat ja niiden ohjaus.
 * Ohjaus täytetään CONTROLS-kartasta (`controlText`), joten tekstit
 * näyttävät kosketuksella napit, koneella näppäimet ja peliohjaimella sen
 * napit, ja vaikeustasoa koskevat luvut luetaan `DIFFICULTIES`-taulukosta.
 */
export type ManualSection = 'start' | 'move' | 'spin' | 'fly' | 'weather' | 'multiplayer';

export const MANUAL_SECTIONS: readonly ManualSection[] = [
  'start',
  'move',
  'spin',
  'fly',
  'weather',
  'multiplayer',
];

interface Topic {
  readonly title: MsgKey;
  /** Rivit erotetaan rivinvaihdolla; rivi, jonka ohjausta ei ole tällä laitteella, jää pois. */
  readonly text: MsgKey;
  readonly vars?: () => Record<string, string | number>;
  /** Aiheen alle piirrettävä kuva (ohjainkuva, #594). */
  readonly diagram?: 'pad';
}

const pct = (v: number) => Math.round(v * 100);
const { normal, realistic } = DIFFICULTIES;
/** Raja (kg), josta alkaen kala tarttuu Normaalilla vain nykäisyyn (#402). */
const twitchKg = (id: 'pike' | 'perch') => shortDecimal(SPECIES[id].sizes[normal.reelHookSize]!);
/** Hauen tarttuminen Realistisella nykäisyyn: vavan jäykkyys toiseen potenssiin (#402). */
const pikeHook = (rod: keyof typeof RODS) =>
  pct(1 - (1 - realistic.hookChance) * RODS[rod].hookMiss ** 2);

const TOPICS: Record<ManualSection, readonly Topic[]> = {
  // Ensikertalaiselle: sama polku kuin opastuksessa (game/guide.ts), yhdellä napilla.
  start: [
    { title: 'manual.start.first', text: 'manual.start.firstText' },
    { title: 'manual.start.noBites', text: 'manual.start.noBitesText' },
    { title: 'manual.start.screen', text: 'manual.start.screenText' },
  ],
  move: [
    { title: 'manual.move.tube', text: 'manual.move.tubeText' },
    { title: 'manual.move.anchor', text: 'manual.move.anchorText' },
    {
      title: 'manual.move.shore',
      text: 'manual.move.shoreText',
      vars: () => ({
        land: shortDecimal(SHORE.landTime),
        band: shortDecimal(SHORE.band),
      }),
    },
    {
      title: 'manual.move.inflate',
      text: 'manual.move.inflateText',
      vars: () => ({
        side: INFLATE.strokes[0],
        floor: INFLATE.strokes[2],
        handle: shortDecimal(INFLATE.handleTime),
        leak: INFLATE.leakStrokes,
      }),
    },
    { title: 'manual.move.boat', text: 'manual.move.boatText' },
    { title: 'manual.move.wind', text: 'manual.move.windText' },
    { title: 'manual.move.pad', text: 'manual.move.padText', diagram: 'pad' },
  ],
  spin: [
    { title: 'manual.spin.cast', text: 'manual.spin.castText' },
    { title: 'manual.spin.reel', text: 'manual.spin.reelText' },
    { title: 'manual.spin.feeding', text: 'manual.spin.feedingText' },
    { title: 'manual.spin.birds', text: 'manual.spin.birdsText' },
    {
      title: 'manual.spin.strike',
      text: 'manual.spin.strikeText',
      vars: () => ({
        normalWindow: shortDecimal(normal.hookWindow),
        realisticWindow: shortDecimal(realistic.hookWindow),
        normalHook: pct(normal.hookChance),
        realisticHook: pct(realistic.hookChance),
        pikeKg: twitchKg('pike'),
        perchKg: twitchKg('perch'),
        pikeLight: pikeHook('light'),
        pikeHeavy: pikeHook('heavy'),
      }),
    },
    {
      title: 'manual.spin.fight',
      text: 'manual.spin.fightText',
      vars: () => ({
        thin: shortDecimal(LINES.thin.strength),
        medium: shortDecimal(LINES.medium.strength),
        thick: shortDecimal(LINES.thick.strength),
        normalSlack: shortDecimal(normal.slackEscape),
        realisticSlack: shortDecimal(realistic.slackEscape),
      }),
    },
    {
      title: 'manual.spin.land',
      text: 'manual.spin.landText',
      vars: () => ({
        normalLunge: pct(normal.landing.lungeEscape),
        realisticLunge: pct(realistic.landing.lungeEscape),
      }),
    },
    {
      title: 'manual.spin.snag',
      text: 'manual.spin.snagText',
      vars: () => ({
        normalSnag: pct(normal.snagFreeChance),
        realisticSnag: pct(realistic.snagFreeChance),
      }),
    },
    { title: 'manual.spin.tools', text: 'manual.spin.toolsText' },
  ],
  fly: [
    { title: 'manual.fly.cast', text: 'manual.fly.castText' },
    {
      title: 'manual.fly.hand',
      text: 'manual.fly.handText',
      vars: () => ({
        auto: KEY_TARGET_LINE,
        max: FLY_CAST.maxAerial,
        hauled: FLY_CAST.maxHauled,
      }),
    },
    {
      title: 'manual.fly.haul',
      text: 'manual.fly.haulText',
      vars: () => ({ max: FLY_CAST.maxAerial, hauled: FLY_CAST.maxHauled }),
    },
    { title: 'manual.fly.errors', text: 'manual.fly.errorsText' },
    {
      title: 'manual.fly.strip',
      text: 'manual.fly.stripText',
      vars: () => ({ pickup: FLY_CAST.pickupMax, roll: FLY_CAST.rollMax }),
    },
    { title: 'manual.fly.fight', text: 'manual.fly.fightText' },
  ],
  weather: [
    {
      title: 'manual.weather.sky',
      text: 'manual.weather.skyText',
      vars: () => ({ front: FRONT.time / 60 }),
    },
    {
      title: 'manual.weather.season',
      text: 'manual.weather.seasonText',
      vars: () => ({
        spring: SEASONS.spring.water,
        summer: SEASONS.summer.water,
        autumn: SEASONS.autumn.water,
        cold: COLD_WATER.below,
      }),
    },
    { title: 'manual.weather.lightning', text: 'manual.weather.lightningText' },
    { title: 'manual.weather.waves', text: 'manual.weather.wavesText' },
    { title: 'manual.weather.spout', text: 'manual.weather.spoutText' },
    { title: 'manual.weather.penalties', text: 'manual.weather.penaltiesText' },
  ],
  multiplayer: [
    { title: 'manual.mp.room', text: 'manual.mp.roomText' },
    { title: 'manual.mp.race', text: 'manual.mp.raceText' },
    { title: 'manual.mp.tangle', text: 'manual.mp.tangleText' },
    { title: 'manual.mp.bots', text: 'manual.mp.botsText' },
    { title: 'manual.mp.watch', text: 'manual.mp.watchText' },
    { title: 'manual.mp.talk', text: 'manual.mp.talkText' },
    { title: 'manual.mp.challenge', text: 'manual.mp.challengeText' },
  ],
};

export interface ManualTopic {
  title: string;
  lines: string[];
  diagram?: 'pad';
}

/** Osion aiheet pelaajan kielellä ja ohjaustavalla. */
export function manualTopics(
  section: ManualSection,
  opts: { mode?: ControlMode } = {},
): ManualTopic[] {
  return TOPICS[section].map((topic) => ({
    title: t(topic.title),
    lines: controlText(topic.text, topic.vars?.() ?? {}, opts).split('\n'),
    ...(topic.diagram && { diagram: topic.diagram }),
  }));
}
