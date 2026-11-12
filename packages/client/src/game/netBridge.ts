import {
  LureStage,
  distance,
  removeCaughtFish,
  timeLeft,
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
import { lengthText, speciesName } from '../i18n/names';
import { KnotView } from './knotView';
import type { RaceCatchMark, RaceLog } from './raceLog';
import { RemotePlayersView } from './remotePlayersView';
import type { BubbleContent } from './speechBubble';
import type { TopDownCamera } from './topDownCamera';
import { Director, type DirectorEventKind, type Shot } from './director';

/** Salama näin lähellä kalastajaa (m) on ohjaajalle tapahtuma (#564). */
const DIRECTOR_LIGHTNING_RANGE = 40;
/** Punnituskortin aika katsojalle (s). */
const SPECTATOR_CARD_SECONDS = 4;
/** Saaliin kortti näytetään vielä, jos kuva tulee saajaan näin pian (s). */
const SPECTATOR_CARD_FRESH = 10;
/** Tämän painoinen saalis (kg) tai kisan siihen asti suurin saa kortin aina (#637). */
const SPECTATOR_BIG_KG = 1;

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
  readonly viewMode: 'top' | 'pov';
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
  /** Katsojan automaattinen ohjaaja (#564); pelaajalla null. */
  readonly director: Director | null;
  /** Ohjaaja valitsee kuvan; pois ollessa katsoja vaihtaa itse (←/→). */
  directing = true;
  /** Viimeisin tapahtuma lähetyksen alaotsikkoon. */
  news: string | null = null;
  /** Kalastajien vieheen vaihe edellisellä askeleella: kala kiinni -hetki. */
  private readonly stages = new Map<string, number>();
  private knownTangles = new Set<string>();
  private leader = '';
  private leaderTimer = 0;
  /** Tulostaulun järjestys (sessionId:t) kierron järjestykseksi. */
  private order: string[] = [];
  /** Tuoreen saaliin punnituskortti: näytetään, kun kuva tulee saajaan. */
  private shownCard: string | null = null;
  private readonly cards = new Map<string, { at: number; show: () => void }>();
  /** Kisan suurin katsojan näkemä saalis (kg). */
  private biggest = 0;

  constructor(
    private readonly host: NetHost,
    readonly link: NetLink,
  ) {
    const net = link;
    this.world = net.world;
    this.director = net.world.spectating ? new Director() : null;
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
    net.world.onLightning = (m) => {
      const near = net.world
        .others()
        .filter((o) => distance(o.pos, m) < DIRECTOR_LIGHTNING_RANGE)
        .map((o) => o.id);
      this.direct('lightning', [...new Set([...m.victims, ...near])]);
      host.onStrike({ x: m.x, y: m.y }, m.victims.includes(net.world.myId));
    };
    net.world.onBigWave = (m) => {
      this.direct('capsize', m.victims);
      for (const id of m.victims) this.logCapsize(net.world.playerPos(id));
      if (m.victims.includes(net.world.myId)) host.onCapsize('wave');
    };
    net.world.onCatchSeen = (mark, own, player) => {
      host.raceLog.addCatch(mark);
      if (!own) host.sounds.playAt('caught', mark.pos);
      if (this.director) this.spectatorCatch(mark, player);
    };
    net.world.onRemoteSplash = (pos) => host.sounds.playAt('lureSplash', pos);
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
      this.direct('capsize', m.victims);
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
    this.direct('record', [m.player]);
    const fish = `${speciesName(m.species)} ${formatWeight(m.weight)} (${m.player === me ? t('common.you') : m.angler})`;
    this.host.hud.showMessage(
      m.place === 1
        ? t('records.lakeFirst', { fish })
        : t('records.lakePlace', { fish, place: ordinal(m.place) }),
      3.5,
    );
  }

  /** Tapahtuma ohjaajalle (vain katsojalla). */
  private direct(kind: DirectorEventKind, ids: readonly string[], bonus = 0): void {
    this.director?.event(kind, ids, this.host.competition.elapsed, bonus);
  }

  /**
   * Katsojalle saalis (#564): ohjaajalle pisteet painon mukaan, alaotsikkoon
   * uutinen ja seurattavan saaliista punnituskortti kuten omasta.
   */
  private spectatorCatch(mark: RaceCatchMark, player: string): void {
    this.direct('catch', [player], Math.min(60, mark.weight * 25));
    const fish = `${speciesName(mark.species)} ${formatWeight(mark.weight)}`;
    this.news = t('broadcast.caught', { name: mark.id, fish });
    const length = lengthText(mark.species, mark.weight);
    const show = () =>
      this.host.hud.showWeighIn(
        t('broadcast.card', { name: mark.id, fish }),
        length,
        SPECTATOR_CARD_SECONDS,
        { species: mark.species, weight: mark.weight },
      );
    // Iso saalis näytetään heti, vaikka kuvassa olisi toinen kalastaja (#637).
    const big = mark.weight >= SPECTATOR_BIG_KG || mark.weight > this.biggest;
    this.biggest = Math.max(this.biggest, mark.weight);
    if (player === this.followed || big) show();
    else this.cards.set(player, { at: this.host.competition.elapsed, show });
  }

  /** Kuva tuli kalastajaan, jonka saalis on tuore: punnituskortti nyt. */
  private showCard(id: string): void {
    const card = this.cards.get(id);
    this.cards.delete(id);
    if (card && this.host.competition.elapsed - card.at < SPECTATOR_CARD_FRESH) card.show();
  }

  /**
   * Katsojan ohjaaja (#564): kala kiinni, sotkut ja johtoon nousu muiden
   * tilasta, sitten kuva. Null, kun ohjaaja on pois tai pelaaja ei katso.
   */
  stepDirector(dt: number): Shot | null {
    const d = this.director;
    if (!d) return null;
    const w = this.world;
    const others = w.others();
    for (const o of others) {
      if (o.lureStage === LureStage.hooked && this.stages.get(o.id) !== LureStage.hooked)
        this.direct('fishOn', [o.id]);
      this.stages.set(o.id, o.lureStage);
    }
    const tangles = new Set<string>();
    for (const spot of w.tangleSpots()) {
      tangles.add(spot.key);
      if (!this.knownTangles.has(spot.key)) this.direct('tangle', spot.key.split('|'));
    }
    this.knownTangles = tangles;
    this.leaderTimer -= dt;
    if (this.leaderTimer <= 0) {
      this.leaderTimer = 1;
      const standings = w.standings();
      this.order = standings.flatMap((r) => r.members?.map((m) => m.id) ?? [r.id]);
      const top = standings[0];
      const ids = top && top.summary.count > 0 ? (top.members?.map((m) => m.id) ?? [top.id]) : [];
      const key = ids.join('|');
      if (key && key !== this.leader) {
        this.direct('lead', ids);
        this.news = t('broadcast.leader', { name: top!.name });
      }
      this.leader = key;
    }
    if (!this.directing) return null;
    return d.step(
      this.host.competition.elapsed,
      others.map((o) => ({
        id: o.id,
        hooked: o.lureStage === LureStage.hooked,
        lureOut: o.lureStage === LureStage.flight || o.lureStage === LureStage.water,
      })),
      this.order,
      timeLeft(this.host.competition),
    );
  }

  /** Katsoja vaihtoi näkymän itse (V): ohjaaja pitää kuvan hetken (#564). */
  manualView(view: 'top' | 'pov'): void {
    if (this.directing) this.director?.manual(this.followed, view, this.host.competition.elapsed);
  }

  /** Ohjaaja päälle tai pois (O); palauttaa uuden tilan. */
  toggleDirector(): boolean {
    this.directing = !this.directing;
    return this.directing;
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
    // Ohjaaja valitsee seurattavan; yleiskuvassa edellinen pysyy.
    const shot = this.directing ? this.director?.shot : undefined;
    if (step === 0 && shot?.id && others.some((o) => o.id === shot.id)) this.followed = shot.id;
    let i = Math.max(
      0,
      others.findIndex((o) => o.id === this.followed),
    );
    if (step !== 0) {
      i = (i + step + others.length) % others.length;
      this.host.hud.showMessage(t('game.following', { name: others[i]!.name }), 1.5, 'info');
      // Katsoja valitsi itse: ohjaaja odottaa hetken (#564).
      const view = this.host.viewMode;
      if (this.directing) this.director?.manual(others[i]!.id, view, this.host.competition.elapsed);
    }
    const f = others[i]!;
    // Ensimmäinen seurattava: kamera hyppää heti paikalle.
    if (this.followed === null) this.host.view.snapTo(f.pos);
    if (this.director && f.id !== this.shownCard) this.showCard(f.id);
    this.shownCard = f.id;
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
