import {
  removeCaughtFish,
  type CompetitionState,
  type FishPopulation,
  type FishingState,
  type LakeBottom,
  type RaceStatsCounter,
  type RecordMessage,
  type Rng,
  type SpoutFlight,
  type TubeState,
  type UntangledMessage,
  type Vec2,
  type WaterBody,
} from '@lunki/shared';
import type { Sounds } from '../audio/sounds';
import type { VoiceId } from '../audio/voice';
import type { NetWorld } from '../net/netWorld';
import type { Hud } from '../ui/hud';
import { formatWeight, ordinal, t } from '../i18n';
import { speciesName } from '../i18n/names';
import { KnotView } from './knotView';
import type { RaceLog } from './raceLog';
import { RemotePlayersView } from './remotePlayersView';
import type { BubbleContent } from './speechBubble';
import type { TopDownCamera } from './topDownCamera';

/** Moninpelin kytkentä: palvelin ajaa renkaan, muut pelaajat piirretään. */
export interface NetLink {
  world: NetWorld;
  /** Nimilappujen kerros ja canvas, jonka päälle ne asemoidaan. */
  overlay: HTMLElement;
  canvas: HTMLCanvasElement;
}

/** Mitä moninpelin kytkentä tarvitsee pelistä. */
export interface NetHost {
  readonly hud: Hud;
  readonly sounds: Sounds;
  readonly competition: CompetitionState;
  readonly fishing: FishingState;
  readonly fish: FishPopulation;
  readonly rng: Rng;
  readonly water: WaterBody;
  readonly bottom: LakeBottom;
  readonly raceLog: RaceLog;
  readonly raceStatsCounter: RaceStatsCounter;
  readonly view: TopDownCamera;
  /** Kuuntelupaikka muiden äänille. */
  readonly ear: Vec2;
  /** Nollaa oman kalastuksen (siima poikki, sotku selvisi). */
  resetFishing(): void;
  onStrike(pos: Vec2, hitMe: boolean): void;
  onCapsize(cause: 'wave'): void;
  startFlight(flight: SpoutFlight | null): void;
  showOwnBubble(content: BubbleContent): void;
  speakAt(id: VoiceId, speaker: string, at: Vec2): void;
}

/**
 * Moninpelin erot yhdessä paikassa: palvelimen viestit (salamat, aallot,
 * trombit, saaliit, sotkut, ennätykset), muiden pelaajien piirto, kisan kello
 * palvelimelta ja katsojan kamera. Yksinpelissä tätä ei ole.
 */
export class NetBridge {
  readonly world: NetWorld;
  readonly remoteView: RemotePlayersView;
  readonly knots = new KnotView();
  /** Seurattavan pelaajan sessionId (katsoja). */
  followed: string | null = null;
  private wasTangled = false;

  constructor(
    private readonly host: NetHost,
    readonly link: NetLink,
  ) {
    const net = link;
    this.world = net.world;
    this.remoteView = new RemotePlayersView(net.overlay, host.hud.root);
    const hud = host.hud;
    net.world.onEmote = (m) => {
      this.remoteView.showEmote(m.from, m.emote);
      const who = net.world.others().find((o) => o.id === m.from);
      if (who) host.speakAt(m.emote, who.id, who.pos);
    };
    net.world.onChatBubble = (m) => {
      if (m.from === net.world.myId) host.showOwnBubble({ text: m.text });
      else this.remoteView.showChat(m.from, m.text);
    };
    net.world.onPeerConnection = (name, connected) =>
      hud.showMessage(
        connected ? t('game.peerBack', { name }) : t('game.peerLost', { name }),
        3,
        'info',
      );
    net.world.onPeerLeft = (name) => hud.showMessage(t('game.peerLeft', { name }), 3, 'info');
    net.world.onPeerJoined = (name) => hud.showMessage(t('game.peerJoined', { name }), 3, 'info');
    net.world.onCatchRejected = () => hud.showMessage(t('game.catchRejected'), 2.5);
    net.world.onLightning = (m) =>
      host.onStrike({ x: m.x, y: m.y }, m.victims.includes(net.world.myId));
    net.world.onBigWave = (m) => {
      for (const id of m.victims) this.logCapsize(net.world.playerPos(id));
      if (m.victims.includes(net.world.myId)) host.onCapsize('wave');
    };
    net.world.onCatchSeen = (mark, own) => {
      host.raceLog.addCatch(mark);
      if (!own) host.sounds.playAt('caught', mark.pos, host.ear);
    };
    net.world.onRemoteSplash = (pos) => host.sounds.playAt('lureSplash', pos, host.ear);
    net.world.onUntangled = (m) => this.onUntangled(m, net.world.myId);
    net.world.onRecord = (m) => this.onRecord(m, net.world.myId);
    net.world.onRemoteCatch = (tag, angler) => {
      const world = {
        isWater: (p: Vec2) => host.water.isWater(p),
        depthAt: (p: Vec2) => host.bottom.depthAt(p),
      };
      if (removeCaughtFish(host.fishing, host.fish, tag, world, host.rng))
        hud.showMessage(t('game.stolen', { name: angler }), 3);
    };
    net.world.onSpout = (m) => {
      for (const id of m.victims) {
        const f = m.flights?.find((x) => x.id === id);
        this.logCapsize(f ? { x: f.fromX, y: f.fromY } : net.world.playerPos(id));
      }
      if (!m.victims.includes(net.world.myId)) return;
      const f = m.flights?.find((x) => x.id === net.world.myId);
      host.startFlight(f ? { from: { x: f.fromX, y: f.fromY }, to: { x: f.toX, y: f.toY } } : null);
    };
    net.world.onCastRejected = () => {
      host.resetFishing();
      hud.showMessage(t('game.castRejected'), 2);
    };
  }

  /** Kaatuminen kartalle; null = paikkaa ei tiedetä. */
  private logCapsize(pos: Vec2 | null): void {
    if (pos) this.host.raceLog.addEvent('capsize', pos, this.host.competition.elapsed);
  }

  /** Kello ja loppu palvelimelta. Palauttaa true, kun kisa päättyy. */
  syncCompetition(): boolean {
    const w = this.world;
    this.host.competition.elapsed = w.raceClock;
    if (w.phase !== 'finished') return false;
    this.host.competition.finished = true;
    return true;
  }

  /** Tulossivun kartta: reitit kerran sekunnissa ja sotkut. */
  logRace(): void {
    const now = this.host.competition.elapsed;
    this.host.raceLog.sample(now, this.world.racePlayers());
    this.host.raceLog.tangles(this.world.tangleSpots(), now);
  }

  /** Oma siima on sotkussa (kosketuksen KATKO-nappi). */
  get tangled(): boolean {
    return this.wasTangled;
  }

  /**
   * Siimasotku: ilmoitus sotkeutumisesta, sotkujen merkit järvellä ja siiman
   * katkaisu (C). Palauttaa oman sotkun tai null.
   */
  updateTangle(cut: boolean): NetWorld['tangle'] {
    const w = this.world;
    const tangle = w.tangle;
    if (tangle && !this.wasTangled) {
      this.host.raceStatsCounter.tangle();
      this.host.sounds.play('tangled');
      this.host.hud.showMessage(t('game.tangled', { name: tangle.with }), 3, 'alert');
    }
    this.wasTangled = tangle !== null;
    this.knots.update(w.tangles());
    if (tangle && cut) w.cutLine();
    return tangle;
  }

  /** Sotku selvisi palvelimella. */
  private onUntangled(m: UntangledMessage, me: string): void {
    if (!m.players.includes(me)) return;
    const hud = this.host.hud;
    const hooked = this.host.fishing.hookedId !== null;
    if (m.how === 'untangled') {
      this.host.resetFishing();
      hud.showMessage(hooked ? t('game.untangledLost') : t('game.untangled'), 2.5);
    } else if (m.by === me) {
      this.host.resetFishing();
      this.host.sounds.play('lineCutFree');
      hud.showMessage(t('game.youCut'), 2);
    } else {
      hud.showMessage(t('game.otherCut', { name: this.world.playerName(m.by) }), 2.5);
    }
  }

  /** Saalis pääsi järven ennätyslistalle. */
  private onRecord(m: RecordMessage, me: string): void {
    const fish = `${speciesName(m.species)} ${formatWeight(m.weight)} (${m.player === me ? t('common.you') : m.angler})`;
    this.host.hud.showMessage(
      m.place === 1
        ? t('records.lakeFirst', { fish })
        : t('records.lakePlace', { fish, place: ordinal(m.place) }),
      3.5,
    );
  }

  /**
   * Katsojan kamera: seurattavan kalastajan rengas. `step` vaihtaa seuraavaan
   * (+1) tai edelliseen (-1). Null, jos järvellä ei ole ketään.
   */
  followTube(step: number): TubeState | null {
    const others = this.world.others();
    if (others.length === 0) {
      // Seurattu lähti eikä muita ole: tilapaneeliin "Järvellä ei ole ketään" (#288).
      this.followed = null;
      return null;
    }
    let i = Math.max(
      0,
      others.findIndex((o) => o.id === this.followed),
    );
    if (step !== 0) {
      i = (i + step + others.length) % others.length;
      this.host.hud.showMessage(t('game.following', { name: others[i]!.name }), 1.5, 'info');
    }
    const f = others[i]!;
    // Ensimmäinen seurattava: kamera hyppää heti paikalle.
    if (this.followed === null) this.host.view.snapTo(f.pos);
    this.followed = f.id;
    return {
      pos: { ...f.pos },
      vel: { x: 0, y: 0 },
      heading: f.heading + f.look,
      angVel: 0,
      kickPhase: f.kickPhase,
      stamina: 1,
    };
  }

  dispose(): void {
    this.remoteView.dispose();
    this.world.dispose();
  }
}
