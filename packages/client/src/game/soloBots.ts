import {
  BotAngler,
  LureStage,
  NET_DT,
  RaceStatsCounter,
  Rng,
  botId,
  botName,
  botSkillFor,
  createTube,
  findLaunchPoint,
  findStartNear,
  randomAppearance,
  rankPlayers,
  removeCaughtFish,
  stepPlayerTube,
  type Appearance,
  type BotLevel,
  type CatchRecord,
  type CompetitionSettings,
  type CompetitionState,
  type FishConditions,
  type FishPopulation,
  type FishTag,
  type FishingState,
  type LakeBottom,
  type LakeMap,
  type PlayerResult,
  type RaceStats,
  type TubeInput,
  type TubeState,
  type Vec2,
  type WaterBody,
} from '@lunki/shared';
import type { Sounds } from '../audio/sounds';
import type { VoiceId } from '../audio/voice';
import type { RemotePlayer } from '../net/netWorld';
import type { Hud } from '../ui/hud';
import { t } from '../i18n';
import { SOLO_ID } from './fishingController';
import type { RaceLog } from './raceLog';
import { RemotePlayersView } from './remotePlayersView';

/** Yksinpelin bottimäärät (#624); 0 = ei botteja. */
export const SOLO_BOT_COUNTS = [0, 3, 7, 11] as const;
export const isSoloBotCount = (v: unknown): v is number =>
  (SOLO_BOT_COUNTS as readonly unknown[]).includes(v);

/** Joka toinen botti aloittaa pelaajan läheltä tältä säteeltä (m), muut muualta järveltä. */
const NEAR_START = 60;
const REST: TubeInput = { kick: 0, turn: 0, sprint: false };

/** Mitä yksinpelin botit tarvitsevat pelistä. */
export interface SoloBotsHost {
  readonly hud: Hud;
  readonly sounds: Sounds;
  readonly competition: CompetitionState;
  readonly settings: CompetitionSettings;
  readonly fishing: FishingState;
  readonly fish: FishPopulation;
  readonly rng: Rng;
  readonly water: WaterBody;
  readonly bottom: LakeBottom;
  readonly map: LakeMap;
  readonly raceLog: RaceLog;
  readonly tube: TubeState;
  readonly wind: Vec2;
  /** Ukkonen nyt: taitava botti kelaa sisään. */
  readonly thunder: boolean;
  readonly conditions: FishConditions;
  speakAt(id: VoiceId, speaker: string, at: Vec2): void;
}

interface SoloBot {
  id: string;
  name: string;
  angler: BotAngler;
  tube: TubeState;
  input: TubeInput;
  appearance: Appearance;
  catches: CatchRecord[];
  stats: RaceStatsCounter;
  /** Maalle heiton jälkeen uusi viehe solmitaan tähän kisa-aikaan asti (s). */
  outUntil: number;
}

/**
 * Yksinpelin botit (#624): samat `BotAngler`-kalastajat kuin moninpelissä,
 * mutta askel lasketaan selaimessa, koska yksinpeli toimii ilman palvelinta.
 * Botit piirretään kuten muut pelaajat (`RemotePlayersView`), ja niiden saaliit
 * menevät kisan tulostauluun ja tulossivulle. Siimasotkuja ja törmäyksiä ei
 * yksinpelissä ole.
 */
export class SoloBots {
  readonly remoteView: RemotePlayersView;
  private readonly bots: SoloBot[] = [];
  private acc = 0;
  private tick = 0;

  constructor(
    private readonly host: SoloBotsHost,
    count: number,
    level: BotLevel,
    seed: number,
    overlay: HTMLElement,
  ) {
    this.remoteView = new RemotePlayersView(overlay, host.hud.root);
    const rng = new Rng((seed ^ 0x624b07) >>> 0);
    const random = () => rng.next();
    const { water, bottom, map, settings } = host;
    for (let i = 0; i < count; i++) {
      const start =
        i % 2 === 0
          ? findStartNear(water, host.tube.pos, NEAR_START, random)
          : findLaunchPoint(water, map.bounds, random);
      const shore = water.closestShorePoint(start)?.point ?? start;
      const look = new Rng(0x62077 + i);
      this.bots.push({
        id: botId(i),
        name: botName(i),
        angler: new BotAngler({
          index: i,
          skill: botSkillFor(level, i),
          seed,
          difficulty: settings.difficulty,
          water,
          bottom,
          pop: structuredClone(host.fish),
        }),
        tube: createTube(start, Math.atan2(start.y - shore.y, start.x - shore.x)),
        input: REST,
        appearance: randomAppearance(() => look.next()),
        catches: [],
        stats: new RaceStatsCounter(),
        outUntil: 0,
      });
    }
  }

  /** Bottien askel kiinteällä 60 Hz:n askeleella; kalastus joka toisella, botit vuorotellen. */
  update(dt: number): void {
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= NET_DT) {
      this.acc -= NET_DT;
      this.step();
    }
  }

  private step(): void {
    const host = this.host;
    const now = host.competition.elapsed;
    this.tick++;
    for (const b of this.bots) {
      if ((this.tick + b.angler.index) % 2 === 0) {
        const others = [host.tube.pos];
        for (const o of this.bots) if (o !== b) others.push(o.tube.pos);
        const out = b.angler.step(
          {
            tube: b.tube,
            canFish: now >= b.outUntil,
            tangled: false,
            thunder: host.thunder,
            others,
            wind: host.wind,
            cond: host.conditions,
          },
          NET_DT * 2,
        );
        b.input = out.input;
        const a = b.angler;
        const ev = out.events;
        const f = a.fishing;
        const hooked = f.hookedId !== null ? a.pop.fish.find((x) => x.id === f.hookedId) : null;
        b.stats.fishing(ev, b.tube.pos, a.lure, hooked ?? null);
        b.stats.move(b.tube.pos, now);
        if (ev.splash) host.sounds.playAt('lureSplash', a.lure);
        if (ev.lineCut) {
          b.outUntil = now + (host.settings.landPenalty ?? 30);
          a.reset();
        }
        if (ev.caught) this.caught(b, ev.caught);
        if (out.emote) {
          this.remoteView.showEmote(b.id, out.emote);
          host.speakAt(out.emote, b.id, b.tube.pos);
        }
      }
      b.tube = stepPlayerTube(b.tube, b.input, host.water, NET_DT, host.wind);
    }
  }

  /** Botti nosti kalan: tulostauluun, kartalle ja sama kala pois muiden kalakannoista. */
  private caught(
    b: SoloBot,
    c: { species: CatchRecord['species']; name: string; weight: number; fish?: FishTag },
  ): void {
    const host = this.host;
    const record: CatchRecord = {
      species: c.species,
      name: c.name,
      weight: c.weight,
      time: host.competition.elapsed,
    };
    b.catches.push(record);
    host.raceLog.addCatch({ ...record, id: b.name, pos: b.tube.pos });
    host.sounds.playAt('caught', b.tube.pos);
    if (!c.fish) return;
    for (const o of this.bots) if (o !== b) o.angler.removeCaught(c.fish);
    const world = {
      isWater: (p: Vec2) => host.water.isWater(p),
      depthAt: (p: Vec2) => host.bottom.depthAt(p),
    };
    if (removeCaughtFish(host.fishing, host.fish, c.fish, world, host.rng))
      host.hud.showMessage(t('game.stolen', { name: b.name }), 3);
  }

  /** Pelaaja nosti kalan: botit eivät saa samaa kalaa. */
  ownCatch(tag: FishTag): void {
    for (const b of this.bots) b.angler.removeCaught(tag);
  }

  /** Botit piirrettäviksi kuten moninpelin muut pelaajat. */
  others(): RemotePlayer[] {
    return this.bots.map((b) => {
      const stage = b.angler.lureStage;
      return {
        id: b.id,
        name: b.name,
        pos: b.tube.pos,
        heading: b.tube.heading,
        kickPhase: b.tube.kickPhase,
        lure: stage === LureStage.none ? null : { ...b.angler.lure },
        lureStage: stage,
        appearance: b.appearance,
        boat: 0,
        seat: 0,
        look: 0,
        roll: 0,
      };
    });
  }

  /** Kisan tulostaulu: pelaaja ja botit. */
  standings(): PlayerResult[] {
    const c = this.host.competition;
    return rankPlayers(
      [
        { id: SOLO_ID, name: t('common.youCapital'), catches: c.catches },
        ...this.bots.map((b) => ({ id: b.id, name: this.label(b), catches: b.catches })),
      ],
      c.settings.winRule,
    );
  }

  /** Bottien saaliit ja tilastot tulossivun palkintoihin. */
  entrants(): { id: string; name: string; catches: CatchRecord[]; stats: RaceStats }[] {
    return this.bots.map((b) => ({
      id: b.id,
      name: this.label(b),
      catches: b.catches,
      stats: b.stats.stats,
    }));
  }

  /** Reitit tulossivun karttaan (tunnisteena nimi kuten saaliissa). */
  routes(): { id: string; name: string; pos: Vec2 }[] {
    return this.bots.map((b) => ({ id: b.name, name: b.name, pos: b.tube.pos }));
  }

  /** Voimaan jääneet saaliit kartalle. */
  catches(): (CatchRecord & { id: string })[] {
    return this.bots.flatMap((b) => b.catches.map((c) => ({ ...c, id: b.name })));
  }

  private label(b: SoloBot): string {
    return t('results.bot', { name: b.name });
  }

  dispose(): void {
    this.remoteView.dispose();
  }
}
