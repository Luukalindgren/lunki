import * as THREE from 'three';
import {
  breakingStrength,
  FLY,
  FLY_CAST,
  REEL,
  holdForce,
  loopProgress,
  isFly,
  recordTackle,
  LUNKINJARVI,
  chargePower,
  WaterBody,
  collideTubeWithShore,
  createTube,
  findLaunchPoint,
  isValidStart,
  DIFFICULTIES,
  Rng,
  createCompetition,
  createFishPopulation,
  fishConditions,
  FISH_COUNT,
  formatTime,
  planWeather,
  planLightning,
  penaltyOutcome,
  resolveStrike,
  distance,
  BIG_WAVE,
  bigWaveDir,
  bigWaveHeight,
  capsizes,
  planBigWaves,
  planWaterspouts,
  activeSpouts,
  spoutAffects,
  spoutCapture,
  spoutLanding,
  spoutWind,
  LIGHTNING,
  SPOUT,
  OUT_OF_RACE,
  windVector,
  recordCatch,
  stepCompetition,
  timeLeft,
  createFishing,
  clockAt,
  daylight,
  lureInfo,
  stepFishPopulation,
  lerpAngle,
  LureStage,
  LUNKINJARVI_SURROUNDINGS,
  resetFishing,
  rodTip,
  sonarPing,
  stepFishing,
  stepTube,
  REEDS,
  STAMINA,
  ChatLimiter,
  EMOTE_DURATION,
  EMOTE_RATE,
  EMOTES,
  sizeClass,
  type EmoteId,
  type CompetitionSettings,
  type LakeBottom,
  type CompetitionState,
  type FishPopulation,
  type FishingContext,
  type FlyCastEvents,
  type FlyCastState,
  type FishingState,
  type Penalty,
  type Strike,
  type BigWave,
  type SpoutFlight,
  type Waterspout,
  type UntangledMessage,
  type RecordMessage,
  removeCaughtFish,
  type LakeMap,
  type RecordEntry,
  type Tackle,
  type Appearance,
  type Vec2,
  type TubeInput,
  type TubeState,
} from '@lunki/shared';
import type { Input } from '../engine/input';
import { createBottomMesh } from '../world/bottomMesh';
import { FishShadow } from '../world/fishShadow';
import { Ground } from '../world/ground';
import { createShoreScenery } from '../world/shoreScenery';
import { createMapOverlay, createTerrainMesh } from '../world/surroundingsMesh';
import type { RetroResolution } from '../engine/resolution';
import { PovCamera } from './povCamera';
import { LightningView } from './lightningView';
import { BigWaveView } from './bigWaveView';
import { SpoutView, flightPose } from './spoutView';
import { KnotView } from './knotView';
import { CastControl } from './castControl';
import { FlyCastControl, touchToRodPixels } from './flyCastControl';
import {
  createLakeMesh,
  createSwellPatch,
  createWaterWaves,
  placeSwellPatch,
  SHORE_FADE,
  shoreFade,
  toWorld,
  waterTime,
} from '../world/lakeMesh';
import { SWELL_GAIN, Swell } from '../world/swell';
import { WAVE_FACTOR_SCALE, WaveField } from '../world/waveField';
import { createBuildings, createPiers } from '../world/buildings';
import { createVegetation } from '../world/vegetation';
import { WeatherView, compassIn, windFrom, windName } from './weatherView';
import { SkyView } from './skyView';
import { MistView } from './mistView';
import type { NetWorld } from '../net/netWorld';
import { RemotePlayersView } from './remotePlayersView';
import type { Sfx } from '../audio/sfx';
import { voiceFalloff, type VoiceId } from '../audio/voice';
import type { Hud } from '../ui/hud';
import { fishLengthCm } from '../ui/fishArt';
import { FishingView } from './fishingView';
import { rodSideOffset } from './lineHang';
import { PovRod, flyRodTip } from './povRod';
import { PovTube } from './povTube';
import { loadTackle, nextLure, saveTackle } from './tackle';
import { TopDownCamera } from './topDownCamera';
import { QuietSpot } from './quietSpot';
import { animateEmote, animateFins, createTubeMesh } from './tubeMesh';
import { SpeechBubble, type BubbleContent } from './speechBubble';
import { screenAnchor } from './screenAnchor';
import { EmoteMenu } from '../ui/emoteMenu';
import { YouMarker } from './youMarker';
import { FlyStrip } from './flyStrip';
import { loadAppearance } from './appearance';
import { RaceLog, type RaceMapData } from './raceLog';
import { scoreboardLines } from './raceScoreboard';
import { bottomFor } from '../world/lakeData';
import { decimal, formatWeight, ordinal, t } from '../i18n';
import { baitName, describeTackle, skyName, speciesName } from '../i18n/names';

const LAND_COLOR = 0x24502c;
/** Yksinpelin pelaajan tunniste kisan kulussa. */
const SOLO_ID = 'me';
/** Lähiveden aallokon esiin- ja poishäivytyksen kesto (s). */
const SWELL_FADE_TIME = 2;

/**
 * Näppäinasettelu: WASD tai nuolet. W vie katseen suuntaan kohti räpylöitä
 * (hitaampi melonta), S selkä edellä (tavallinen, nopeampi potkiminen).
 */
export function readTubeInput(input: Input): TubeInput {
  const down = (...codes: string[]) => codes.some((c) => input.isDown(c));
  return {
    kick: (down('KeyS', 'ArrowDown') ? 1 : 0) - (down('KeyW', 'ArrowUp') ? 1 : 0),
    turn: (down('KeyA', 'ArrowLeft') ? 1 : 0) - (down('KeyD', 'ArrowRight') ? 1 : 0),
    sprint: down('ShiftLeft', 'ShiftRight'),
  };
}

/** Moninpelin kytkentä: palvelin ajaa renkaan, muut pelaajat piirretään. */
export interface NetLink {
  world: NetWorld;
  /** Nimilappujen kerros ja canvas, jonka päälle ne asemoidaan. */
  overlay: HTMLElement;
  canvas: HTMLCanvasElement;
}

/** Saaliin punnituskortti näkyy näin kauan, ellei pelaaja ala heittää uudelleen. */
const CATCH_CARD_SECONDS = 6;

/**
 * Pelikierros järvellä. Yksinpelissä rengas liikkuu paikallisesti;
 * moninpelissä (net) oma rengas ennakoidaan ja palvelin on totuus.
 */
export class SoloGame {
  readonly scene = new THREE.Scene();
  readonly view = new TopDownCamera();
  /** Kalastajan silmin -näkymä (V vaihtaa). */
  readonly pov = new PovCamera();
  viewMode: 'top' | 'pov' = 'top';
  /** Vain POV:ssa näkyvät (maasto, metsänreuna) ja vain ylhäältä näkyvät (karttapohja). */
  private readonly scenery = new THREE.Group();
  private readonly mapOverlay = new THREE.Group();
  private readonly povRod = new PovRod();
  private readonly povTube: PovTube;
  /** Pikapotku päällä (kalastajan silmin näkyvät räpylät, #230). */
  private sprinting = false;
  /** Pelaaja kelaa (kelan kampi pyörii kalastajan silmin). */
  private cranking = false;
  readonly water: WaterBody;
  readonly bottom: LakeBottom;
  tube: TubeState;
  private prevTube: TubeState;
  /**
   * Omat värit valitaan ennen kisaa (yksinpelin asetukset tai aula).
   * Moninpelissä ne luetaan palvelimen tilasta kuten muidenkin: selaimen
   * muisti on yhteinen saman selaimen ikkunoille.
   */
  readonly appearance: Appearance;
  private readonly tubeMesh: THREE.Group;
  /** Oma sijainti kauas loitonnettaessa. */
  private readonly youMarker = new YouMarker();
  readonly fishing: FishingState;
  /** Vaihdettavat varusteet: otetaan käyttöön, kun viehe on kelalla. */
  private pendingTackle: Tackle | null = null;
  private readonly fishingView = new FishingView();
  /** Vinkkaa paikan vaihdosta, kun heitot menevät tyhjiin. */
  private readonly quietSpot = new QuietSpot();
  /** Käsimerkit (#228): valikko, käynnissä oleva ele (alku ms) ja oma kupla. */
  private emoteMenu: EmoteMenu | null = null;
  private emoting: { id: EmoteId; start: number } | null = null;
  private readonly emoteLimiter = new ChatLimiter(EMOTE_RATE);
  private ownBubble: SpeechBubble | null = null;
  private gameCanvas: HTMLCanvasElement | null = null;
  /** Suurkalan varjo veden alla (#231). */
  private readonly fishShadow = new FishShadow();
  /** Hiiren osoittama piste maailmassa. */
  aim: Vec2 = { x: 0, y: 0 };
  /** Heitto hiirellä tai välilyönnillä katsesuuntaan (#227). */
  private readonly castControl = new CastControl();
  private readonly flyCastControl = new FlyCastControl();
  readonly rng: Rng;
  readonly fish: FishPopulation;
  readonly competition: CompetitionState;
  /** Kisan kulku tulossivun karttaan. */
  private readonly raceLog = new RaceLog();
  /** Moninpelin katsoja: ei omaa rengasta, kamera seuraa valittua kalastajaa. */
  readonly spectating: boolean;
  /** Seurattavan pelaajan sessionId. */
  private followed: string | null = null;
  private reelClickTimer = 0;
  /** Potkuvaiheen puolikas edellisellä päivityksellä (räpylöiden äänet). */
  private strokes = 0;
  /** Kutsutaan, kun kilpailuaika loppuu. */
  onFinished: (() => void) | null = null;
  /** Yksinpelin saalis yksinpelin ennätyslistalle (moninpelissä palvelin punnitsee itse). */
  onSoloCatch: ((entry: Omit<RecordEntry, 'date' | 'at' | 'angler'>) => void) | null = null;
  private readonly remoteView: RemotePlayersView | null = null;
  private readonly hemi = new THREE.HemisphereLight(0xeef2f3, 0x24502c, 1.5);
  private readonly sun = new THREE.DirectionalLight(0xfff3b0, 1.5);
  readonly weather: WeatherView;
  /** Vuorokaudenaika: taivas, usva, valo ja paletin sävytys. */
  readonly sky: SkyView;
  private readonly mist: MistView;
  readonly waves: WaveField;
  private readonly waterWaves = createWaterWaves();
  /**
   * Ylhäältä katsottavat järven osat: kaislikkokuviot ja saarten litteät
   * kannet. POV-näkymässä ne näkyivät isoina vaaleina laattoina; siellä
   * kaislat ovat spritejä ja saaret maastoa.
   */
  private readonly topViewOnly: THREE.Object3D[];
  private readonly lightning = new LightningView();
  /** Ruudun välähdyksen voimakkuus viimeisimmästä salamasta: lähellä kirkkaampi. */
  private flashStrength = 0;
  /** Ruudun tärinän voimakkuus viimeisimmästä salamasta (0–1). */
  private shakeStrength = 0;
  /** Salama iski aivan viereen: kuva kääntyy hetkeksi negatiiviksi. */
  private flashInvert = false;
  /** Sisäisen resoluution korkeus (px). */
  private heightPx = 1;
  /** Yksinpelin salamat (moninpelissä palvelin ilmoittaa iskut). */
  private readonly strikes: Strike[];
  private nextStrike = 0;
  /** Yksinpelin salaman jäähy (kisa-aika, s). */
  private outUntil = 0;
  /** Mistä jäähy tuli (tilarivin teksti). */
  private outLabel = t('game.timeOut');
  private readonly bigWaveView = new BigWaveView();
  /** Isot aallot: varoitukset ja näkymä molemmissa, osumat yksinpelissä. */
  private readonly bigWaves: BigWave[];
  private nextWave = 0;
  private warnedWave = -1;
  /** Yksinpelissä rengas kumossa tähän kisa-aikaan asti; kaatumishetki animaatioon. */
  private capsizedUntil = 0;
  private capsizedAt = -Infinity;
  private readonly rings: Vec2[][];
  private readonly spouts: Waterspout[];
  private readonly spoutView = new SpoutView();
  private spoutsSeen = 0;
  private spoutWarnTimer = 0;
  /** Oma lento trombin mukana (kisa-aika, s), ja yksinpelin laskeutumispaikkojen arpa. */
  private flight: (SpoutFlight & { t0: number }) | null = null;
  private readonly spoutRng: Rng;
  /** Lentävän renkaan varjo vedessä: kertoo ylhäältä katsottuna, kuinka korkealla ollaan. */
  private readonly flightShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0b0f14 }),
  );
  /** Aallokko: keinunta ja POV-näkymän aaltoileva lähivesi. */
  private readonly swell: Swell;
  private readonly swellPatch: THREE.Mesh;
  /** Lähiveden aallokko päällä (hystereesillä, jotteivät puuskat vilkuta sitä). */
  private swellOn = false;
  /** Renkaan keinunta (tasoitettu): nosto (m), kallistus ja nyökkäys (rad). */
  private readonly rock = { lift: 0, roll: 0, pitch: 0 };
  /** Ohi menevän ison aallon nosto (m) renkaan kohdalla. */
  private bigWaveLift = 0;

  constructor(
    private readonly input: Input,
    private readonly hud: Hud,
    private readonly sfx: Sfx,
    /** Muuntaa näytön CSS-pikselin sisäiseksi pikseliksi. */
    private readonly screenToInternal: (x: number, y: number) => { x: number; y: number },
    readonly settings: CompetitionSettings,
    seed = Date.now() >>> 0,
    readonly map: LakeMap = LUNKINJARVI,
    private readonly net?: NetLink,
  ) {
    this.appearance = net?.world.ownAppearance ?? loadAppearance();
    this.tubeMesh = createTubeMesh(this.appearance);
    this.fishing = createFishing(net?.world.ownTackle ?? loadTackle());
    this.competition = createCompetition(settings);
    this.spectating = net?.world.spectating ?? false;
    this.water = new WaterBody(map);
    this.bottom = bottomFor(map, this.water);
    this.rng = new Rng(seed);
    this.spoutRng = new Rng(seed ^ 0x51ed270b);
    this.fish = createFishPopulation(
      {
        isWater: (p) => this.water.isWater(p),
        depthAt: (p) => this.bottom.depthAt(p),
        structures: this.bottom.structures,
      },
      map.bounds,
      this.rng,
      FISH_COUNT,
      settings.species,
    );
    if (net) {
      // Palvelin arpoi aloituspaikan.
      this.tube = net.world.predictor.tube;
      // Kisaan palatessa aiemmat saaliit näkyvät heti omassa listassa.
      this.competition.catches.push(...net.world.ownCatches());
    } else {
      const chosen = settings.start;
      const start =
        chosen && isValidStart(this.water, chosen)
          ? { ...chosen }
          : findLaunchPoint(this.water, map.bounds, () => this.rng.next());
      // Selkä rantaan päin, katse järvelle.
      const shore = this.water.closestShorePoint(start)?.point ?? start;
      this.tube = createTube(start, Math.atan2(start.y - shore.y, start.x - shore.x));
    }
    this.prevTube = this.tube;

    this.scene.background = new THREE.Color(LAND_COLOR);
    this.scene.add(this.hemi);
    this.scene.add(this.sun);
    this.sky = new SkyView();
    this.mist = new MistView((p) => this.water.isWater(p), map.bounds);
    this.scene.add(this.sky.dome, this.mist.group);
    const plan = planWeather(seed, settings.weather ?? 'realistic', settings.durationMinutes * 60);
    this.weather = new WeatherView(plan);
    this.strikes = net ? [] : planLightning(plan, seed, settings.durationMinutes * 60);
    this.bigWaves = planBigWaves(plan, seed, settings.durationMinutes * 60);
    this.rings = [map.shore, ...map.islands];
    this.spouts = planWaterspouts(
      plan,
      seed,
      settings.durationMinutes * 60,
      this.water,
      map.bounds,
    );
    this.scene.add(
      this.weather.group,
      this.lightning.group,
      this.bigWaveView.group,
      this.spoutView.group,
      this.knots.group,
    );
    this.waves = new WaveField(map);
    this.waterWaves.uWaveTex.value = this.waves.texture;
    this.waterWaves.uWaveBounds.value.copy(this.waves.bounds);
    const lake = createLakeMesh(map, this.waterWaves);
    this.topViewOnly = lake.children.filter((c) => c.name === 'reeds' || c.name === 'island');
    this.scene.add(lake);
    const center = {
      x: (map.bounds.minX + map.bounds.maxX) / 2,
      y: (map.bounds.minY + map.bounds.maxY) / 2,
    };
    this.swell = new Swell(center);
    this.waterWaves.uSwellOrigin.value.set(center.x, center.y);
    this.swellPatch = createSwellPatch(map, this.waterWaves);
    this.scene.add(this.swellPatch);
    this.updateSky(0);
    this.applyWeatherLight();
    this.scene.add(createBottomMesh(this.bottom, this.waterWaves));
    this.scene.add(this.fishShadow.mesh);
    this.scene.add(this.tubeMesh);
    this.flightShadow.visible = false;
    this.scene.add(this.flightShadow);
    const surroundings = map === LUNKINJARVI ? LUNKINJARVI_SURROUNDINGS : undefined;
    const ground = new Ground(map, surroundings?.terrain ?? null);
    this.scenery.add(createShoreScenery(map, surroundings, ground));
    this.scenery.add(createVegetation(map, surroundings, ground));
    if (surroundings) {
      const terrain = createTerrainMesh(ground, surroundings, map.islands);
      if (terrain) this.scenery.add(terrain);
      const buildings = createBuildings(surroundings, ground);
      if (buildings) this.scenery.add(buildings);
      const piers = createPiers(map.piers ?? []);
      if (piers) this.scene.add(piers);
      this.mapOverlay.add(createMapOverlay(surroundings));
    }
    this.scenery.visible = false;
    this.scene.add(this.scenery, this.mapOverlay);
    this.povRod.group.visible = false;
    this.scene.add(this.povRod.group);
    this.povTube = new PovTube(this.appearance);
    this.povTube.group.visible = false;
    this.scene.add(this.povTube.group);
    this.fishingView.lineColor = this.appearance.line;
    this.scene.add(this.fishingView.group, this.youMarker.group);
    if (this.spectating) {
      this.tubeMesh.visible = false;
      this.fishingView.group.visible = false;
      this.youMarker.group.visible = false;
      this.tube = this.followTube(0) ?? this.tube;
      this.prevTube = this.tube;
    }
    this.view.snapTo(this.tube.pos);
    hud.setCountdown(null);
    if (net) {
      this.remoteView = new RemotePlayersView(net.overlay, this.hud.root);
      this.scene.add(this.remoteView.group);
      net.world.onEmote = (m) => {
        this.remoteView?.showEmote(m.from, m.emote);
        const who = net.world.others().find((o) => o.id === m.from);
        if (who) this.speakAt(m.emote, who.id, who.pos);
      };
      net.world.onChatBubble = (m) => {
        if (m.from === net.world.myId) this.showOwnBubble({ text: m.text });
        else this.remoteView?.showChat(m.from, m.text);
      };
      net.world.onPeerConnection = (name, connected) =>
        this.hud.showMessage(
          connected ? t('game.peerBack', { name }) : t('game.peerLost', { name }),
          3,
        );
      net.world.onPeerLeft = (name) => this.hud.showMessage(t('game.peerLeft', { name }), 3);
      net.world.onPeerJoined = (name) => this.hud.showMessage(t('game.peerJoined', { name }), 3);
      net.world.onCatchRejected = () => this.hud.showMessage(t('game.catchRejected'), 2.5);
      net.world.onLightning = (m) =>
        this.onStrike({ x: m.x, y: m.y }, m.victims.includes(net.world.myId));
      net.world.onBigWave = (m) => {
        for (const id of m.victims) this.logCapsize(net.world.playerPos(id));
        if (m.victims.includes(net.world.myId)) this.onCapsize('wave');
      };
      net.world.onCatchSeen = (mark) => this.raceLog.addCatch(mark);
      net.world.onUntangled = (m) => this.onUntangled(m, net.world.myId);
      net.world.onRecord = (m) => this.onRecord(m, net.world.myId);
      net.world.onRemoteCatch = (tag, angler) => {
        const world = {
          isWater: (p: Vec2) => this.water.isWater(p),
          depthAt: (p: Vec2) => this.bottom.depthAt(p),
        };
        if (removeCaughtFish(this.fishing, this.fish, tag, world, this.rng))
          this.hud.showMessage(t('game.stolen', { name: angler }), 3);
      };
      net.world.onSpout = (m) => {
        for (const id of m.victims) {
          const f = m.flights?.find((x) => x.id === id);
          this.logCapsize(f ? { x: f.fromX, y: f.fromY } : net.world.playerPos(id));
        }
        if (!m.victims.includes(net.world.myId)) return;
        const f = m.flights?.find((x) => x.id === net.world.myId);
        this.startFlight(
          f ? { from: { x: f.fromX, y: f.fromY }, to: { x: f.toX, y: f.toY } } : null,
        );
      };
      net.world.onCastRejected = () => {
        resetFishing(this.fishing, this.fishCtx);
        this.hud.showMessage(t('game.castRejected'), 2);
      };
    }
  }

  /** Kalakanta kalastuksen nollaukseen: kiinni ollut kala pääsee vapaaksi. */
  private get fishCtx() {
    return { pop: this.fish, rng: this.rng };
  }

  private fishingContext(strike?: number): FishingContext {
    return {
      tubePos: this.tube.pos,
      heading: this.tube.heading,
      isWater: (p) => this.water.isWater(p),
      depthAt: (p) => this.bottom.depthAt(p),
      structureAt: (p) => this.bottom.structureAt(p),
      bottomTypeAt: (p) => this.bottom.bottomTypeAt(p),
      reedsAt: (p) => this.water.reedsAt(p) !== null,
      wind: this.wind,
      fish: { pop: this.fish, diff: DIFFICULTIES[this.settings.difficulty], rng: this.rng, strike },
    };
  }

  /** Tuuli nyt (m/s); kisan päätyttyä tyyntä. */
  get wind(): Vec2 {
    return this.competition.finished ? { x: 0, y: 0 } : windVector(this.weather.now);
  }

  /** Renkaaseen vaikuttava tuuli: sään tuuli ja trombin imu (heittoon trombi ei vaikuta). */
  private get tubeWind(): Vec2 {
    const w = this.wind;
    const now = this.competition.elapsed;
    if (this.competition.finished) return w;
    if (!spoutAffects(this.capsizedUntilAbs, now)) return w;
    const s = spoutWind(this.spouts, now, this.tube.pos);
    return { x: w.x + s.x, y: w.y + s.y };
  }

  /** Oma rengas kumossa tähän kisa-aikaan asti. */
  private get capsizedUntilAbs(): number {
    return this.net ? this.net.world.capsizedUntil : this.capsizedUntil;
  }

  /** Aktiivinen kamera piirtoa varten. */
  get camera(): THREE.Camera {
    return this.viewMode === 'pov' ? this.pov.camera : this.view.camera;
  }

  setResolution(r: RetroResolution): void {
    this.heightPx = r.height;
    this.view.setResolution(r);
    this.pov.setResolution(r);
  }

  /** announce = false: ei ilmoitusta (kisan alussa näkymä vain asetetaan). */
  setViewMode(mode: 'top' | 'pov', announce = true): void {
    this.viewMode = mode;
    const pov = mode === 'pov';
    this.scenery.visible = pov;
    this.mapOverlay.visible = !pov;
    this.povRod.group.visible = pov && !this.spectating;
    this.povTube.group.visible = pov && !this.spectating;
    this.tubeMesh.visible = !pov && !this.spectating;
    for (const o of this.topViewOnly) o.visible = !pov;
    this.sky.dome.visible = pov;
    this.scene.background = new THREE.Color(LAND_COLOR);
    this.scene.fog = pov ? new THREE.Fog(this.sky.lighting.horizon, 500, 2600) : null;
    this.applyWeatherLight();
    this.fishingView.pov = pov;
    if (announce) this.hud.showMessage(pov ? t('game.viewPov') : t('game.viewTop'), 1.2);
  }

  /** Vaihtaa varusteet heti, tai kun viehe seuraavan kerran on kelalla. */
  setTackle(tk: Tackle): void {
    this.pendingTackle = { ...tk };
    const f = this.fishing.stage;
    if (f !== 'idle' && f !== 'charging')
      this.hud.showMessage(
        isFly(tk)
          ? t('game.flyLater', { fly: baitName(tk) })
          : t('game.lureLater', { lure: baitName(tk) }),
        1.5,
      );
  }

  /** Varusteet sellaisina kuin ne ovat seuraavassa heitossa. */
  get tackle(): Tackle {
    return this.pendingTackle ?? this.fishing.tackle;
  }

  get difficulty() {
    return this.settings.difficulty;
  }

  /** Moninpelissä oma nimi palvelimelta (se voi olla muutettu); yksinpelissä null. */
  get ownName(): string | null {
    return this.net?.world.ownName ?? null;
  }

  /** Rangaistus omasta osumasta. Moninpelissä palvelin pitää jäähyn ja saaliit. */
  private punish(penalty: Penalty, label: string): string {
    resetFishing(this.fishing, this.fishCtx);
    this.sfx.lost();
    const outcome = penaltyOutcome(penalty, this.competition.elapsed);
    if (outcome.outUntil > 0) this.outLabel = label;
    if (!this.net) this.outUntil = Math.max(this.outUntil, outcome.outUntil);
    if (outcome.loseCatch) this.competition.catches.length = 0;
    return {
      none: '',
      'time-out': t('game.penaltyTimeOut', { s: LIGHTNING.timeOut }),
      'lose-catch': t('game.penaltyLoseCatch'),
      out: t('game.penaltyOut'),
    }[penalty];
  }

  /** Kumossa jäljellä (s). */
  private get capsizeLeft(): number {
    return Math.max(0, this.capsizedUntilAbs - this.competition.elapsed);
  }

  /**
   * Trombit: näkymä, varoitukset ja yksinpelissä nappaus (moninpelissä
   * palvelin). Trombi näkyy kaukaa ja imee renkaan, joka tulee liian lähelle.
   */
  private updateSpouts(dt: number): void {
    const now = this.competition.elapsed;
    const spots = activeSpouts(this.spouts, now);
    this.spoutView.update(dt, spots);
    const born = this.spouts.filter((s) => s.t0 <= now).length;
    if (born > this.spoutsSeen) {
      this.spoutsSeen = born;
      if (spots.length > 0) {
        this.hud.showMessage(t('game.spoutSeen'), 3);
        this.sfx.rumble();
      }
    }
    if (!this.net && spoutAffects(this.capsizedUntil, now)) {
      const fling = spoutCapture(this.spouts, now, this.tube.pos);
      if (fling) {
        const from = { ...this.tube.pos };
        const to = spoutLanding(from, fling, this.water, () => this.spoutRng.next(), spots);
        // Rengas on heti perillä; lento piirretään kaarena lähtöpaikasta.
        this.tube = to
          ? { ...this.tube, pos: to, vel: { x: 0, y: 0 }, angVel: 0 }
          : { ...this.tube, vel: fling };
        this.prevTube = this.tube;
        this.capsizedUntil = now + (to ? SPOUT.flight : 0) + BIG_WAVE.recover;
        this.startFlight(to ? { from, to } : null);
      }
    }
    // Imualueella muistutetaan pakenemaan.
    this.spoutWarnTimer -= dt;
    const near = spots.some((p) => distance(p, this.tube.pos) < SPOUT.radius);
    if (near && this.capsizeLeft === 0 && this.spoutWarnTimer <= 0) {
      this.hud.showMessage(t('game.spoutPull'), 2);
      this.spoutWarnTimer = 4;
    }
  }

  /**
   * Isot aallot: varoitus ennen aaltoa, jos se on vaarallinen omalla
   * kohdalla, ja yksinpelissä osuman ratkaisu (moninpelissä palvelin).
   */
  private updateBigWaves(): void {
    const now = this.competition.elapsed;
    const w = this.weather.now;
    // Jokainen aalto tulee omasta suunnastaan tuulen ympäriltä.
    const height = (wave: BigWave) =>
      bigWaveHeight(this.rings, this.tube.pos, w.windSpeed, bigWaveDir(wave, w.windDir));
    // Pientä aaltoa (suojaisessa poukamassa tai heikossa tuulessa) ei huomaa.
    const felt = (h: number) => h >= BIG_WAVE.capsizeHeight / 2;
    while (this.nextWave < this.bigWaves.length && this.bigWaves[this.nextWave]!.t <= now) {
      const wave = this.bigWaves[this.nextWave++]!;
      const h = height(wave);
      // Kisaan palatessa ohi menneet aallot eivät kuulu kerralla.
      if (felt(h) && now - wave.t < 1) this.sfx.wave();
      const dir = bigWaveDir(wave, w.windDir);
      if (!this.net && this.capsizeLeft === 0 && capsizes(this.tube.heading, dir, h)) {
        this.capsizedUntil = now + BIG_WAVE.recover;
        this.onCapsize('wave');
      }
    }
    const next = this.bigWaves[this.nextWave];
    const prev = this.bigWaves[this.nextWave - 1];
    // Harja näkyy tulossa olevasta aallosta tai juuri ohi menneestä.
    const shown = next && next.t - now <= BIG_WAVE.warning ? next : prev;
    const h = shown ? height(shown) : 0;
    const until = shown && felt(h) ? shown.t - now : null;
    const dir = shown ? bigWaveDir(shown, w.windDir) : w.windDir;
    this.bigWaveView.update(until, dir, this.tube.pos);
    // Harjan kohdalla rengas nousee aallon päälle ja laskee takaisin.
    this.bigWaveLift = until !== null ? 0.5 * SWELL_GAIN * h * Math.exp(-((until / 0.8) ** 2)) : 0;
    if (!next || next.t - now > BIG_WAVE.warning || this.warnedWave === this.nextWave) return;
    this.warnedWave = this.nextWave;
    if (height(next) >= BIG_WAVE.capsizeHeight)
      this.hud.showMessage(t('game.bigWave', { from: windFrom(bigWaveDir(next, w.windDir)) }), 3);
  }

  /** Lähimmän trombin etäisyys ja suunta säärivillä, esim. " · trombi 320 m lounaassa". */
  private spoutText(): string {
    const p = this.tube.pos;
    let best: Vec2 | null = null;
    for (const c of activeSpouts(this.spouts, this.competition.elapsed))
      if (!best || distance(c, p) < distance(best, p)) best = c;
    if (!best) return '';
    const d = Math.round(distance(best, p) / 10) * 10;
    return t('game.spoutNear', { d, dir: compassIn(Math.atan2(best.y - p.y, best.x - p.x)) });
  }

  private wasTangled = false;
  private readonly knots = new KnotView();

  /**
   * Moninpelin siimasotku: ilmoitus sotkeutumisesta, sotkujen merkit
   * järvellä ja siiman katkaisu (C). Palauttaa oman sotkun tai null.
   */
  private updateTangle(cut: boolean): NetWorld['tangle'] {
    const w = this.net?.world;
    if (!w) return null;
    const tangle = w.tangle;
    if (tangle && !this.wasTangled) {
      this.sfx.strike();
      this.hud.showMessage(t('game.tangled', { name: tangle.with }), 3);
      this.sfx.eventVoice('tangled');
    }
    this.wasTangled = tangle !== null;
    this.knots.update(w.tangles());
    if (tangle && cut) w.cutLine();
    return tangle;
  }

  /** Sotku selvisi palvelimella. */
  private onUntangled(m: UntangledMessage, me: string): void {
    if (!m.players.includes(me)) return;
    const hooked = this.fishing.hookedId !== null;
    if (m.how === 'untangled') {
      resetFishing(this.fishing, this.fishCtx);
      this.hud.showMessage(hooked ? t('game.untangledLost') : t('game.untangled'), 2.5);
    } else if (m.by === me) {
      resetFishing(this.fishing, this.fishCtx);
      this.sfx.lost();
      this.hud.showMessage(t('game.youCut'), 2);
    } else {
      this.hud.showMessage(t('game.otherCut', { name: this.net!.world.playerName(m.by) }), 2.5);
    }
  }

  /** Saalis pääsi järven ennätyslistalle. */
  private onRecord(m: RecordMessage, me: string): void {
    const fish = `${speciesName(m.species)} ${formatWeight(m.weight)} (${m.player === me ? t('common.you') : m.angler})`;
    this.hud.showMessage(
      m.place === 1
        ? t('records.lakeFirst', { fish })
        : t('records.lakePlace', { fish, place: ordinal(m.place) }),
      3.5,
    );
  }

  /** Trombi nappasi: lento muualle järvelle (null = vain kaatuu paikalleen). */
  private startFlight(flight: SpoutFlight | null): void {
    const now = this.competition.elapsed;
    this.flight = flight ? { ...flight, t0: now } : null;
    this.onCapsize('spout');
    // Kumossa kellumisen animaatio alkaa vasta laskeutuessa.
    if (flight) this.capsizedAt = now + SPOUT.flight;
  }

  /** Lennon asento nyt, tai null jos ei lennetä. Laskeutuessa molskahtaa. */
  private flightNow(): ReturnType<typeof flightPose> | null {
    const f = this.flight;
    if (!f) return null;
    const k = (this.competition.elapsed - f.t0) / SPOUT.flight;
    if (k >= 1 || k < 0) {
      this.flight = null;
      if (k >= 1) {
        this.sfx.splash();
        this.fishingView.startSplash(this.tube.pos);
      }
      return null;
    }
    return flightPose(f, k, this.tube.pos);
  }

  /** Oma rengas kaatui ison aallon tai trombin takia. */
  private onCapsize(cause: 'wave' | 'spout'): void {
    this.capsizedAt = this.competition.elapsed;
    // Moninpelissä kaatumiset kirjataan palvelimen viesteistä kaikille.
    if (!this.net) this.logCapsize(this.flight?.from ?? this.tube.pos);
    if (cause === 'spout') this.sfx.wave();
    this.sfx.eventVoice('capsized');
    const penalty = this.punish(this.settings.capsizePenalty ?? 'none', t('game.capsizeTimeOut'));
    this.hud.showWeighIn(
      t(
        cause === 'wave' ? 'game.capsized' : this.flight ? 'game.spoutGrabbed' : 'game.spoutTipped',
      ),
      penalty ||
        t(
          cause === 'wave'
            ? 'game.capsizeHint'
            : this.flight
              ? 'game.flightHint'
              : 'game.spoutHint',
        ),
      4,
    );
  }

  /** Jäähyä jäljellä (s); pudonneella Infinity. */
  private get timeOutLeft(): number {
    // Maalle heiton sakko kirjataan heti myös omalle koneelle (palvelin vahvistaa).
    const until = Math.max(this.net?.world.outUntil ?? 0, this.outUntil);
    if (until >= OUT_OF_RACE) return Infinity;
    return Math.max(0, until - this.competition.elapsed);
  }

  /** Yksinpeli: salamat kisan kellon mukaan, kuten palvelimella. */
  private strikeLightning(): void {
    const f = this.fishing;
    while (
      this.nextStrike < this.strikes.length &&
      this.strikes[this.nextStrike]!.t <= this.competition.elapsed
    ) {
      const strike = this.strikes[this.nextStrike++]!;
      const rodUp =
        (f.hookedId !== null || f.stage === 'flight' || f.stage === 'water') &&
        this.timeOutLeft === 0;
      const result = resolveStrike(
        strike,
        [{ id: 'me', pos: this.tube.pos, rodUp }],
        this.water,
        this.map.bounds,
      );
      this.onStrike(result.pos, result.victims.length > 0);
    }
  }

  /** Salama iski kohtaan `pos`; `hitMe` = osui omaan vapaan. */
  private onStrike(pos: Vec2, hitMe: boolean): void {
    // Osuma iskee vavan kärkeen, joten salama näkyy myös kalastajan silmin.
    const at = hitMe ? rodTip(this.tube.pos, this.tube.heading) : pos;
    const d = hitMe ? 0 : distance(pos, this.tube.pos);
    this.lightning.strike(at);
    this.raceLog.addEvent('lightning', pos, this.competition.elapsed);
    this.flashStrength = d < 150 ? 1 : d < 400 ? 0.9 : d < 1000 ? 0.65 : 0.45;
    this.shakeStrength = Math.max(0, 1 - d / 500);
    this.flashInvert = d < 60;
    this.sfx.thunder(d, d / LIGHTNING.soundSpeed);
    if (d < 150) this.sfx.eventVoice('lightning');
    if (!hitMe) return;
    const penalty = this.punish(
      this.settings.lightningPenalty ?? 'none',
      t('game.lightningTimeOut'),
    );
    this.hud.showWeighIn(t('game.lightningHit'), penalty || t('game.lightningHint'), 4);
  }

  update(dt: number): void {
    const input = this.input;
    waterTime.value += dt;
    if (this.competition.finished) return;
    if (this.net ? this.syncCompetition() : stepCompetition(this.competition, dt)) {
      this.sfx.caught();
      this.onFinished?.();
      return;
    }
    // Lähtölaskennan aikana rengas ja vapa odottavat.
    const frozen = this.net?.world.phase === 'countdown';
    if (input.wheel !== 0) this.view.zoom(input.wheel);
    if (input.wasPressed('KeyH')) this.hud.toggleHelp();
    if (input.wasPressed('KeyK')) this.hud.sonar.toggle();
    // Heiton aikana L (kosketuksella SYV) ja P piilottavat perhoheiton sivukuvan (#236).
    const casting = this.fishing.stage === 'casting';
    if (input.wasPressed('KeyP') || (casting && input.wasPressed('KeyL')))
      this.hud.showMessage(
        this.hud.flyPanel.toggle() ? t('game.flyPanelOn') : t('game.flyPanelOff'),
        1.5,
      );
    else if (input.wasPressed('KeyL'))
      this.hud.showMessage(
        this.hud.lureSonar.toggle() ? t('game.lureSonarOn') : t('game.lureSonarOff'),
        1.5,
      );
    if (input.wasPressed('KeyV')) this.setViewMode(this.viewMode === 'top' ? 'pov' : 'top');
    if (input.wasPressed('KeyG') && !this.spectating) this.toggleEmoteMenu();
    if (input.wasPressed('KeyR') && !this.spectating)
      this.setTackle(nextLure(this.pendingTackle ?? this.fishing.tackle));
    if (!this.net) this.strikeLightning();
    this.lightning.update(dt);
    this.hud.flash(
      this.lightning.flash * this.flashStrength,
      this.flashInvert && this.lightning.sinceStrike < 0.08,
    );
    this.updateBigWaves();
    this.updateSpouts(dt);
    const timeOut = this.timeOutLeft;
    const capsized = this.capsizeLeft > 0;
    const still = { kick: 0, turn: 0, sprint: false };
    // `Reel` on kosketusnäytön KELAA-nappi: se kelaa, mutta ei heitä.
    const reelHeld = input.isDown('Mouse0') || input.isDown('Space') || input.isDown('Reel');
    const tangle = this.updateTangle(input.wasPressed('KeyC'));
    if (!frozen) this.logRace();

    this.prevTube = this.tube;
    if (this.spectating) {
      const step =
        input.wasPressed('ArrowRight') || input.wasPressed('KeyD') || input.wasPressed('Mouse0')
          ? 1
          : input.wasPressed('ArrowLeft') || input.wasPressed('KeyA')
            ? -1
            : 0;
      this.tube = this.followTube(step) ?? this.tube;
    } else if (this.net) {
      const f = this.fishing;
      const stage =
        f.hookedId !== null
          ? LureStage.hooked
          : f.stage === 'flight' || f.stage === 'casting'
            ? LureStage.flight
            : f.stage === 'water'
              ? LureStage.water
              : LureStage.none;
      const tubeInput = frozen || capsized ? still : readTubeInput(input);
      this.tube = this.net.world.stepOwn(
        tubeInput,
        // Perhoheitossa muille välitetään perhon paikka ilmassa (#236).
        (f.stage === 'casting' && this.fishingView.flyInAir) || f.lure,
        stage,
        frozen ? undefined : this.tubeWind,
        !frozen && reelHeld,
      );
    } else {
      const drag = this.water.reedsAt(this.tube.pos) ? REEDS.drag : 1;
      const next = stepTube(
        this.tube,
        capsized ? still : readTubeInput(input),
        dt,
        this.tubeWind,
        drag,
      );
      this.tube = collideTubeWithShore(this.tube, next, this.water);
    }
    this.sprinting = !capsized && readTubeInput(input).sprint;

    const f = this.fishing;
    // Perho heitetään hiirellä, rytmissä välilyönnillä (#235) tai sormen pyyhkäisyllä (#236).
    const flyCasting = isFly(f.tackle);
    const touch = this.hud.touchMode;
    this.collectSwipe(touch);
    const castHeld =
      this.castControl.castHeld(f.stage, {
        mouse: input.isDown('Mouse0'),
        key: input.isDown('Space'),
      }) &&
      (!flyCasting || f.stage === 'charging');
    const canCast = !frozen && !capsized && timeOut === 0 && !this.emoteActive && !tangle;
    let startFlyCast = false;
    if (flyCasting && canCast) {
      const mouse = input.wasPressed('Mouse0');
      if (f.stage === 'idle' && (mouse || input.wasPressed('Space'))) {
        startFlyCast = true;
        this.flyCastControl.start(mouse ? (touch ? 'touch' : 'mouse') : 'keyboard');
      } else if (f.stage === 'water' && input.wasPressed('Mouse2')) {
        // Siiman nosto vedestä uuteen heittoon (kosketuksella PERU).
        startFlyCast = true;
        this.flyCastControl.start(touch ? 'touch' : 'mouse');
      }
      if (startFlyCast && this.flyCastControl.mode === 'mouse') input.lockPointer();
    }
    const flyCast =
      f.stage === 'casting' && f.flyCast
        ? canCast
          ? this.flyCastControl.read(
              f.flyCast,
              touch
                ? {
                    grip: input.isDown('LineGrip'),
                    haul: input.wasPressed('Reel'),
                    key: false,
                    ...this.takeSwipe(),
                  }
                : {
                    grip: input.isDown('Mouse0'),
                    haul: input.wasPressed('Mouse2'),
                    key: input.wasPressed('Space'),
                    dx: input.mouseDX,
                    dy: input.mouseDY,
                  },
              dt,
            )
          : { rod: 0, grip: true }
        : undefined;
    // Käyttämätön liike unohtuu, paitsi heiton aloittaneella askeleella: se kuuluu heittoon.
    if (!startFlyCast) this.swipeX = this.swipeY = 0;
    const internal = this.screenToInternal(input.mouseX, input.mouseY);
    this.aim = this.castControl.aim(
      (this.viewMode === 'pov' ? this.pov : this.view).internalToWorld(internal.x, internal.y),
      this.tube.pos,
      this.tube.heading,
    );
    const lureOut = f.stage === 'flight' || f.stage === 'water';
    // Perho vedessä ja siima kädessä: hiiri tai välilyönti pitää siimaa ja vetää sitä.
    const flyHand = isFly(f.tackle) && !f.onReel && f.stage === 'water';
    const fly = flyHand ? this.readFlyHand(dt, frozen || !!tangle) : null;
    if (!flyHand) this.flyStrip.reset();
    // Sotkussa vapa on kiinni: kelaaminen selvittää sotkua palvelimella.
    const reeling = !flyHand && !frozen && !tangle && lureOut && reelHeld;
    this.cranking = !flyHand && !frozen && lureOut && reelHeld;
    const world = {
      isWater: (p: Vec2) => this.water.isWater(p),
      depthAt: (p: Vec2) => this.bottom.depthAt(p),
    };
    const fishEvents = stepFishPopulation(
      this.fish,
      lureInfo(f, this.fishingContext()),
      world,
      DIFFICULTIES[this.settings.difficulty],
      this.rng,
      dt,
      fishConditions(this.competition.finished ? null : this.weather.now, this.daylight),
    );
    const events: ReturnType<typeof stepFishing> =
      tangle || this.spectating
        ? {}
        : stepFishing(
            f,
            {
              aim: this.aim,
              // Eleen aikana käsi on varattu: heittää ei voi.
              castHeld: !frozen && !capsized && timeOut === 0 && castHeld && !this.emoteActive,
              reel: reeling,
              // Heiton aikana oikea nappi on siimakäden veto: keskeytys X:llä tai PERU-napilla.
              cancel:
                (f.stage !== 'casting' && input.isDown('Mouse2')) ||
                (f.stage === 'casting' && touch && input.wasPressed('Mouse2')) ||
                input.isDown('KeyX'),
              dragDelta: (input.wasPressed('KeyE') ? 1 : 0) - (input.wasPressed('KeyQ') ? 1 : 0),
              ...(input.wasPressed('Digit1') ? { gear: 0 } : {}),
              ...(input.wasPressed('Digit2') ? { gear: 1 } : {}),
              ...(input.wasPressed('Digit3') ? { gear: 2 } : {}),
              ...(input.wasPressed('Digit4') ? { gear: REEL.fastGear } : {}),
              ...(this.pendingTackle ? { tackle: this.pendingTackle } : {}),
              cut: input.wasPressed('KeyC'),
              ...fly,
              reelSlack: input.isDown('KeyF'),
              ...(startFlyCast ? { startFlyCast } : {}),
              ...(flyCast ? { flyCast } : {}),
            },
            this.fishingContext(fishEvents.strike),
            dt,
          );
    if (f.stage !== 'casting') input.unlockPointer();
    this.handleEvents(events, fishEvents.follow !== undefined, reeling, dt);
    this.fishShadow.update(this.fish.fish, this.tube.pos);
    if (fishEvents.shadow !== undefined) this.hud.showMessage(t('game.bigShadow'), 2.5);
    if (f.onLand && f.stage === 'water')
      this.hud.showMessage(
        t('game.stuckOnLand', { key: this.hud.touchMode ? t('touch.cut') : 'C' }),
        0.2,
      );

    // Kamera: kun viehe on ulkona, seurataan renkaan ja vieheen väliä ja loitonnetaan tarvittaessa.
    if (lureOut) {
      const mid = { x: (this.tube.pos.x + f.lure.x) / 2, y: (this.tube.pos.y + f.lure.y) / 2 };
      this.view.follow(mid, dt, 2);
      this.view.fitSpan(
        Math.abs(f.lure.x - this.tube.pos.x) * 1.3 + 10,
        Math.abs(f.lure.y - this.tube.pos.y) * 1.3 + 10,
      );
    } else {
      // Lennossa kamera seuraa rengasta ilmassa.
      this.view.follow(this.flightNow()?.pos ?? this.tube.pos, dt, this.flight ? 6 : 3);
      this.view.fitSpan(0, 0);
    }

    if (this.spectating) {
      this.updateSpectatorHud(dt);
      return;
    }
    this.hud.setStamina(this.tube.stamina, STAMINA.tired);
    if (this.tube.stamina <= 0 && this.prevTube.stamina > 0)
      this.hud.showMessage(t('game.tired'), 2.5);
    const cast = f.stage === 'casting' ? f.flyCast : null;
    const marker = DIFFICULTIES[this.settings.difficulty].flyCast.marker;
    this.hud.flyPanel.update(dt, cast, marker);
    if (cast) {
      // Ajoitusmittari: silmukka aukeaa, ja suorassa siimassa "nyt!" (helppo ja normaali).
      this.hud.setFlyLoop(
        loopProgress(cast),
        marker && cast.phase === 'loop' && cast.loopAge >= cast.loopTime,
      );
    } else this.hud.setPower(f.stage === 'charging' ? chargePower(f.charge) : null);
    const hold = holdForce(f, { lineHand: fly?.lineHand ?? false });
    this.hud.setTension(f.tension, Math.min(hold, f.drag), breakingStrength(f.tackle));
    this.hud.setStatus([
      ...(this.flight
        ? [t('game.flying')]
        : capsized
          ? [t('game.capsizedLeft', { s: Math.ceil(this.capsizeLeft) })]
          : []),
      ...(tangle
        ? [
            t('game.tangleStatus', {
              name: tangle.with,
              pct: Math.round(tangle.progress * 100),
            }),
            t('game.tangleHint'),
          ]
        : []),
      ...(timeOut === Infinity
        ? [t('game.penaltyOut')]
        : timeOut > 0
          ? [t('game.outLeft', { label: this.outLabel, s: Math.ceil(timeOut) })]
          : []),
      ...(cast
        ? [
            cast.busy > 0
              ? t('game.flyUntangle', { s: Math.ceil(cast.busy) })
              : this.flyCastControl.keyboard
                ? t('game.flyCastKeys')
                : touch
                  ? t('game.flyCastTouch')
                  : t('game.flyCastMouse'),
            ...(cast.busy > 0 || this.flyCastControl.keyboard
              ? []
              : [touch ? t('game.flyCastTouchButtons') : t('game.flyCastButtons')]),
          ]
        : []),
      describeTackle(f.tackle),
      t('game.line', { m: decimal(f.lineLength, 1) }),
      isFly(f.tackle) && !f.onReel
        ? t('game.flyHand', { m: decimal(f.slack, 1) })
        : t('game.drag', {
            kg: decimal(f.drag, 2),
            gear: f.gear === REEL.fastGear ? t('game.fastGear') : f.gear + 1,
          }),
      t('game.lureDepth', { m: decimal(f.stage === 'water' && !f.onLand ? f.depth : 0, 1) }),
      t('game.bottom', { m: decimal(this.bottom.depthAt(lureOut ? f.lure : this.tube.pos), 1) }),
    ]);
    this.hud.sonar.update(dt, () =>
      sonarPing(this.tube.pos, this.fish.fish, this.bottom.depthAt(this.tube.pos), {
        floor: this.bottom.bottomTypeAt(this.tube.pos),
        structure: this.bottom.structureAt(this.tube.pos),
      }),
    );
    this.hud.lureSonar.update(dt, f.stage === 'water' && !f.onLand, () => ({
      tip: rodTip(this.tube.pos, this.tube.heading),
      lure: f.lure,
      depth: f.depth,
      depthAt: (p) => this.bottom.depthAt(p),
      isWater: (p) => this.water.isWater(p),
      structureAt: (p) => this.bottom.structureAt(p),
      bottomTypeAt: (p) => this.bottom.bottomTypeAt(p),
      fish: this.fish.fish.filter(
        (x) => x.mode === 'follow' || x.mode === 'struck' || x.id === f.hookedId,
      ),
      bite: f.struckId !== null,
      hooked: f.hookedId !== null,
      snag: f.snag !== null,
      fouled: f.fouled,
    }));
    const left = timeLeft(this.competition);
    this.hud.setTimer(formatTime(left), left < 60);
    this.updateWeather(dt);
    this.sfx.updateAmbience(dt, { ...this.weather.now, ...this.daylight });
    // Potkuvaihe kiertää 0–1; kumpikin räpylä loiskahtaa kerran kierroksessa.
    const strokes = Math.floor(this.tube.kickPhase * 2);
    if (strokes !== this.strokes) {
      this.strokes = strokes;
      this.sfx.paddle();
    }
    if (this.net) {
      this.updateRaceHud();
      this.hud.update(dt);
      return;
    }
    const catches = this.competition.catches;
    const total = catches.reduce((a, c) => a + c.weight, 0);
    this.hud.setCatches(
      catches.length === 0
        ? []
        : [
            t('game.catches', { n: catches.length, total: formatWeight(total) }),
            ...catches
              .slice(-5)
              .reverse()
              .map(
                (c) => `${formatTime(c.time)} ${speciesName(c.species)} ${formatWeight(c.weight)}`,
              ),
          ],
    );
    this.hud.update(dt);
  }

  private updateWeather(dt: number): void {
    const w = this.weather.update(
      dt,
      this.competition.elapsed,
      this.tube.pos,
      this.viewMode === 'pov'
        ? null
        : { metersPerPixel: this.view.metersPerPixel, width: this.view.width },
      { message: (text) => this.hud.showMessage(text, 3), rumble: () => this.sfx.rumble() },
    );
    this.updateSky(dt);
    this.applyWeatherLight();
    this.updateWaves(dt, w.windSpeed, w.windDir);
    const hs = this.waves.heightAt(this.tube.pos, w.windSpeed);
    this.hud.setWeather(
      `${skyName(w.sky)} · ${windName(w.windDir)} ${Math.round(w.windSpeed)} m/s` +
        (hs >= 0.05 ? t('game.waves', { m: decimal(hs, 1) }) : '') +
        (w.sky === 'thunder' || w.sky === 'storm' ? t('game.lightningRisk') : '') +
        this.spoutText(),
    );
  }

  /** Aallot vesishaderille sekä renkaan keinunta pinnan korkeudesta ja kaltevuudesta. */
  private updateWaves(dt: number, windSpeed: number, windDir: number): void {
    this.waves.update(windDir);
    this.waterWaves.uWaveScale.value = WAVE_FACTOR_SCALE * windSpeed;
    this.waterWaves.uWaveDir.value.set(Math.cos(windDir), Math.sin(windDir));
    const p = this.tube.pos;
    this.swell.update(dt, windSpeed, windDir, p);
    const amp = this.waterWaves.uSwellAmp.value;
    this.swell.waves.forEach((w, i) => {
      this.waterWaves.uSwell.value[i]!.set(w.dir.x, w.dir.y, w.k, w.phase);
      amp.setComponent(i, w.amp);
    });
    // Lähivesi aaltoilee, kun aallokko on yli 3 cm, ja tasoittuu alle 2 cm:ssä.
    // Muutos häivytetään, jotteivät aallot ja viivat ilmesty tai katoa kerralla.
    const hs = this.waves.heightAt(p, windSpeed);
    this.swellOn = hs >= 0.03 || (this.swellOn && hs >= 0.02);
    const fade = this.waterWaves.uSwellFade;
    fade.value = Math.min(
      1,
      Math.max(0, fade.value + ((this.swellOn ? 1 : -1) * dt) / SWELL_FADE_TIME),
    );
    const shore = this.water.closestShorePoint(p, SHORE_FADE)?.distance ?? SHORE_FADE;
    const s = this.swell.sample(p, hs * shoreFade(shore) * fade.value);
    const h = this.tube.heading;
    const ahead = s.slope.x * Math.cos(h) + s.slope.y * Math.sin(h);
    const side = s.slope.x * Math.sin(h) - s.slope.y * Math.cos(h);
    // Rengas ei seuraa pintaa jäykästi: se kelluu hieman jäljessä ja loivemmin.
    const k = Math.min(1, dt / 0.2);
    this.rock.lift += (s.height + this.bigWaveLift - this.rock.lift) * k;
    this.rock.pitch += (Math.atan(ahead) * 0.7 - this.rock.pitch) * k;
    this.rock.roll += (Math.atan(side) * 0.7 - this.rock.roll) * k;
  }

  /** Pelikello (tuntia 0–24): alkaa vuorokaudenajan mukaan ja etenee kisakellon mukana. */
  get clock(): number {
    return clockAt(this.settings.timeOfDay ?? 'day', this.competition.elapsed);
  }

  /** Päivänvalo ja hämäryys nyt: kalojen syönti ja äänimaailma seuraavat tätä. */
  get daylight() {
    return daylight(this.clock);
  }

  /** Paletin sävytys jälkikäsittelyyn (vuorokaudenaika ja salama). */
  get grade() {
    return this.sky.grade;
  }

  /** Vuorokaudenaika pelikellon ja sään mukaan; kimallus vesishaderille. */
  private updateSky(dt: number): void {
    const now = this.weather.now;
    const wind = windVector(now);
    this.sky.update(this.clock, now.darkness, this.lightning.flash, wind, dt);
    this.mist.update(dt, this.sky.mist, wind, this.viewMode === 'pov');
    const g = this.sky.glitter;
    this.waterWaves.uGlitterDir.value.copy(g.dir);
    this.waterWaves.uGlitterColor.value.copy(g.color);
    this.waterWaves.uGlitter.value = this.viewMode === 'pov' ? g.amount : 0;
  }

  /** Pilvinen taivas himmentää valon ja tummentaa taivaan ja sumun. */
  private applyWeatherLight(): void {
    const dark = this.weather.now.darkness;
    // Valoa himmennetään vain vähän: paletissa tummat sinisävyt kääntyisivät vihreiksi.
    // Yö ja ilta tehdään paletin sävytyksellä (ks. SkyView).
    const light = 1 - 0.25 * dark;
    const sky = this.sky.lighting;
    // Salaman välähdys valaisee koko maiseman hetkeksi.
    this.hemi.intensity = 1.5 * light * sky.ambient * (1 + 1.5 * this.lightning.flash);
    this.sun.intensity = 1.5 * light * light * sky.direct;
    this.sun.position.copy(sky.lightDir).multiplyScalar(120);
    const bg = this.scene.background;
    if (!(bg instanceof THREE.Color)) return;
    if (this.viewMode === 'pov') {
      bg.copy(sky.horizon);
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.color.copy(sky.horizon);
        [this.scene.fog.near, this.scene.fog.far] = sky.fog;
      }
    } else {
      bg.set(LAND_COLOR).multiplyScalar(1 - 0.4 * dark);
    }
  }

  private lastHiss = 0;
  /** Perhovavan edellinen kulma ja taipuma (#236). */
  private bendRod: number | null = null;
  private bend = 0;
  private bendTime = performance.now();

  /**
   * Perhovapa taipuu liikkeen aikana: kahva johtaa ja kärki laahaa perässä.
   * Pysäytyksessä taipuma palautuu, ja vapa suoristuu.
   */
  private flyRodBend(cast: FlyCastState | null): number {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(1e-3, (now - this.bendTime) / 1000));
    this.bendTime = now;
    const vel = cast && this.bendRod !== null ? (cast.rod - this.bendRod) / dt : 0;
    this.bendRod = cast ? cast.rod : null;
    const target = Math.max(-0.6, Math.min(0.6, vel * 0.15));
    this.bend += (target - this.bend) * Math.min(1, dt * 18);
    return this.bend;
  }

  /** Siiman sihinä, enintään muutaman kerran sekunnissa. */
  private hiss(): void {
    const now = performance.now();
    if (now - this.lastHiss < 90) return;
    this.lastHiss = now;
    this.sfx.lineHiss();
  }

  /** Perhoheiton tapahtumat (#235): viuhahdukset, nykäys ja virheiden ilmoitukset. */
  private handleFlyCast(ev: FlyCastEvents): void {
    const { hud, sfx } = this;
    const cast = this.fishing.flyCast;
    // Siima suhisee silmukan aukeamisen ajan (#236).
    if (ev.stop)
      sfx.flySwish(
        ev.stop.speed / FLY_CAST.maxLineSpeed,
        cast?.phase === 'loop' ? cast.loopTime : 0.3,
      );
    // Siima suoristui: vaimea nykäys vavassa.
    if (ev.straight) sfx.flyTug();
    if (ev.slipped) this.hiss();
    if (ev.crack) sfx.flyCrack();
    if (ev.crack && !ev.flyLost) {
      hud.showMessage(t('game.flyCrack'), 2);
    }
    if (ev.knot) hud.showMessage(t('game.flyKnot'), 2.5);
    if (ev.collapsed) hud.showMessage(t('game.flyCollapsed'), 2);
    else if (ev.fell) hud.showMessage(t('game.flyFell'), 2);
    if (ev.snagBehind || ev.hat) {
      sfx.strike();
      hud.showMessage(ev.hat ? t('game.flyHat') : t('game.flySnagBehind'), 2.5);
    }
    if (ev.landed) {
      this.quietSpot.cast(this.tube.pos);
      hud.showMessage(
        t(ev.landed.roll ? 'game.flyRollCast' : 'game.flyCastLength', {
          m: Math.round(distance(this.tube.pos, this.fishing.lure)),
        }),
        1.5,
      );
    }
  }

  private handleEvents(
    events: ReturnType<typeof stepFishing>,
    follow: boolean,
    reeling: boolean,
    dt: number,
  ): void {
    const { hud, sfx } = this;
    if (events.cast !== undefined) {
      sfx.cast(events.cast);
      this.quietSpot.cast(this.tube.pos);
    }
    if (follow || events.strike) this.quietSpot.noticed();
    if (events.home && this.quietSpot.home()) hud.showMessage(t('game.quiet'), 4);
    if (events.splash) {
      // Perho laskeutuu pienellä roiskeella, popperi isommalla (#236).
      const tk = this.fishing.tackle;
      const big = !isFly(tk) || tk.fly === 'popper';
      this.fishingView.startSplash(events.splash, isFly(tk) ? (big ? 0.7 : 0.4) : 1);
      if (isFly(tk)) sfx.flyLand(big);
      else sfx.splash();
      this.net?.world.sendSplash(events.splash);
    }
    if (follow) sfx.tick();
    if (events.strike) {
      sfx.strike();
      hud.showMessage(t('game.strike'), 1.2);
    }
    if (events.hooked) {
      sfx.hooked();
      hud.showMessage(t('game.hooked'), 1.5);
    }
    const flyGear = isFly(this.fishing.tackle);
    if (events.missed) {
      hud.showMessage(flyGear ? t('game.missedFly') : t('game.missed'), 2);
      sfx.eventVoice('missed');
    }
    if (events.jumped) {
      sfx.splash();
      hud.showMessage(t('game.jumped'), 1.5);
    }
    if (events.escaped) {
      sfx.lost();
      sfx.eventVoice('escaped');
      hud.showMessage(t('game.escaped'), 2.5);
    }
    if (events.tackleChanged) {
      this.pendingTackle = null;
      saveTackle(this.fishing.tackle);
      this.net?.world.sendTackle(this.fishing.tackle);
      const tk = this.fishing.tackle;
      hud.showMessage(
        isFly(tk)
          ? t('game.flyChanged', { fly: baitName(tk) })
          : t('game.lureChanged', { lure: baitName(tk) }),
        1.5,
      );
    }
    if (events.onReel) hud.showMessage(t('game.onReel'), 2);
    if (events.flyCast) this.handleFlyCast(events.flyCast);
    if (events.pickupFar) hud.showMessage(t('game.flyPickupFar', { m: FLY_CAST.pickupMax }), 2);
    if (events.flyTangle) {
      sfx.lost();
      hud.showMessage(t('game.flyTangle'), 2.5);
    }
    if (events.pop) sfx.pop();
    // Kala vie siimaa sormien läpi.
    if (this.fishing.fingerSlip) this.hiss();
    if (events.snagged) {
      sfx.strike();
      sfx.eventVoice('snagged');
      hud.showMessage(flyGear ? t('game.snaggedFly') : t('game.snagged'), 2);
    }
    if (events.unsnagged) hud.showMessage(t('game.unsnagged'), 1.5);
    if (events.fouled) {
      hud.showMessage(t('game.fouled'), 2.5);
      sfx.eventVoice('fouled');
    }
    if (events.rattle) sfx.rattle();
    if (events.stuck) {
      sfx.strike();
      sfx.eventVoice('stuck');
    }
    if (events.lineCut) {
      sfx.lost();
      const wait = this.settings.landPenalty ?? 0;
      if (wait > 0) {
        this.outUntil = Math.max(this.outUntil, this.competition.elapsed + wait);
        this.outLabel = t('game.newLure');
      }
      this.net?.world.landCut();
      hud.showWeighIn(
        t('game.lineCut'),
        wait > 0 ? t('game.lureOnLandWait', { s: wait }) : t('game.lureOnLand'),
        3,
      );
    } else if (events.bitOff) {
      sfx.lost();
      sfx.eventVoice('bitOff');
      hud.showMessage(t('game.bitOff'), 3.5);
    } else if (events.lureLost) {
      sfx.lost();
      sfx.eventVoice('lureLost');
      hud.showMessage(events.flyCast?.flyLost ? t('game.flyLost') : t('game.lureLost'), 3);
    } else if (events.lineBroken) {
      sfx.lost();
      sfx.eventVoice('lineBroken');
      hud.showMessage(flyGear ? t('game.lineBrokenFly') : t('game.lineBroken'), 3);
    }
    if (events.caught) {
      sfx.caught();
      if (sizeClass(events.caught.species, events.caught.weight) >= 3) sfx.eventVoice('bigCatch');
      this.net?.world.sendCatch(events.caught);
      const record = recordCatch(this.competition, events.caught, this.tube.pos);
      // Moninpelissä saaliit tulevat kartalle palvelimen punnitsemina (onCatchSeen).
      if (record && !this.net) {
        this.raceLog.addCatch({ ...record, id: SOLO_ID, pos: this.tube.pos });
        const gear = this.fishing.tackle;
        const w = this.weather.now;
        this.onSoloCatch?.({
          species: record.species,
          weight: record.weight,
          difficulty: this.settings.difficulty,
          x: this.tube.pos.x,
          y: this.tube.pos.y,
          raceTime: record.time,
          timeOfDay: this.settings.timeOfDay ?? 'day',
          sky: w.sky,
          wind: w.windSpeed,
          ...recordTackle(gear),
        });
      }
      this.fishingView.startSplash(this.fishing.lure);
      const catches = this.competition.catches;
      const biggest = catches.every((c) => c === record || c.weight < events.caught!.weight);
      const length = `${Math.round(fishLengthCm(events.caught.species, events.caught.weight))} cm`;
      hud.showWeighIn(
        `${speciesName(events.caught.species)} ${formatWeight(events.caught.weight)}`,
        `${length} · ${catches.length > 1 && biggest ? t('game.biggestSoFar') : t('game.nthFish', { n: ordinal(catches.length) })}`,
        CATCH_CARD_SECONDS,
        events.caught,
      );
    }
    if (this.fishing.dragSlipping) sfx.dragSlip();
    this.reelClickTimer -= dt;
    if (reeling && this.reelClickTimer <= 0) {
      sfx.reelClick();
      this.reelClickTimer = 0.09 / (this.fishing.gear + 1);
    }
  }

  /** Kaatuminen kartalle; null = paikkaa ei tiedetä. */
  private logCapsize(pos: Vec2 | null): void {
    if (pos) this.raceLog.addEvent('capsize', pos, this.competition.elapsed);
  }

  /** Tulossivun kartta: reitit kerran sekunnissa ja moninpelin sotkut. */
  private logRace(): void {
    const now = this.competition.elapsed;
    const w = this.net?.world;
    if (!w) {
      this.raceLog.sample(now, [{ id: SOLO_ID, name: t('common.youCapital'), pos: this.tube.pos }]);
      return;
    }
    this.raceLog.sample(now, w.racePlayers());
    this.raceLog.tangles(w.tangleSpots(), now);
  }

  /**
   * Kisan kulku tulossivun karttaan. Saaliista näytetään vain ne, jotka
   * lopulta jäivät voimaan (jäähyssä menetetyt pois).
   */
  raceMap(): RaceMapData {
    const d = this.raceLog.data();
    const kept = this.net
      ? this.net.world.results().flatMap((r) => r.catches.map((c) => ({ ...c, id: r.name })))
      : this.competition.catches.map((c) => ({ ...c, id: SOLO_ID }));
    const counts = (m: { id: string; time: number; weight: number }) =>
      kept.some((c) => c.id === m.id && c.time === m.time && c.weight === m.weight);
    return { ...d, catches: d.catches.filter(counts) };
  }

  /** Moninpeli: kello ja loppu palvelimelta. Palauttaa true, kun kisa päättyy. */
  private syncCompetition(): boolean {
    const w = this.net!.world;
    this.competition.elapsed = w.raceClock;
    if (w.phase !== 'finished') return false;
    this.competition.finished = true;
    return true;
  }

  private raceHudTimer = 0;

  /** Lähtölaskenta ja tulostaulu (top 5 + oma sijoitus). */
  /**
   * Katsojan kamera: seurattavan kalastajan rengas. `step` vaihtaa seuraavaan
   * (+1) tai edelliseen (-1). Null, jos järvellä ei ole ketään.
   */
  private followTube(step: number): TubeState | null {
    const others = this.net!.world.others();
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
      this.hud.showMessage(t('game.following', { name: others[i]!.name }), 1.5);
    }
    const f = others[i]!;
    // Ensimmäinen seurattava: kamera hyppää heti paikalle.
    if (this.followed === null) this.view.snapTo(f.pos);
    this.followed = f.id;
    return {
      pos: { ...f.pos },
      vel: { x: 0, y: 0 },
      heading: f.heading,
      angVel: 0,
      kickPhase: f.kickPhase,
      stamina: 1,
    };
  }

  /** Katsojan HUD: kenen kisaa seurataan, tulostaulu ja kello. */
  private updateSpectatorHud(dt: number): void {
    const name = this.followed ? this.net!.world.playerName(this.followed) : null;
    this.hud.setPower(null);
    this.hud.setStatus([
      t('mp.spectating'),
      name ? t('game.following', { name }) : t('game.nobody'),
      this.hud.touchMode ? t('game.nextTouch') : t('game.nextKeys'),
      this.hud.touchMode ? t('game.viewToggleTouch') : t('game.viewToggle'),
    ]);
    const left = timeLeft(this.competition);
    this.hud.setTimer(formatTime(left), left < 60);
    this.updateWeather(dt);
    this.updateRaceHud();
    this.hud.update(dt);
  }

  private updateRaceHud(): void {
    const w = this.net!.world;
    const cd = w.phase === 'countdown' ? Math.ceil(w.countdown) : 0;
    this.hud.setCountdown(
      w.phase === 'countdown'
        ? String(Math.max(1, cd))
        : this.competition.elapsed < 1.2
          ? t('game.go')
          : null,
    );
    if ((this.raceHudTimer = (this.raceHudTimer + 1) % 15) !== 1) return;
    this.hud.setCatches([t('game.scoreboard'), ...scoreboardLines(w.results(), w.myId)]);
  }

  /**
   * Kaatumisen kallistus (rad): rengas pyörähtää nopeasti ympäri, kelluu
   * kumossa ja kääntyy lopuksi takaisin pystyyn.
   */
  private capsizeRoll(): number {
    const t = this.competition.elapsed - this.capsizedAt;
    if (t < 0 || t > BIG_WAVE.recover) return 0;
    const over = Math.min(1, t / 0.5);
    const back = Math.max(0, (t - (BIG_WAVE.recover - 1)) / 1);
    const k = Math.min(over, 1 - back);
    return Math.PI * k * k * (3 - 2 * k);
  }

  /**
   * Lähellä iskevä salama tärisyttää kuvaa: kamera hyppii kokonaisia
   * pikseleitä satunnaisesti, kuten vanhoissa peleissä.
   */
  private shakeCamera(): void {
    const k = this.lightning.shake * this.shakeStrength;
    if (k <= 0) return;
    const px = Math.round(k * 4);
    if (px === 0) return;
    const jx = Math.round((Math.random() * 2 - 1) * px);
    const jy = Math.round((Math.random() * 2 - 1) * px);
    if (this.viewMode === 'pov') {
      // Silmien kohdalla pikseli on noin pari senttiä: kallistetaan katsetta.
      const a = 1.5 / this.heightPx;
      this.pov.camera.rotation.x += jy * a;
      this.pov.camera.rotation.y += jx * a;
      this.pov.camera.updateMatrixWorld();
    } else {
      const m = this.view.metersPerPixel;
      this.view.camera.position.x += jx * m;
      this.view.camera.position.z += jy * m;
      this.view.camera.updateMatrixWorld();
    }
  }

  /**
   * Kalastajan silmin näkyvä rengas, sääret ja räpylät (#230): keinunta,
   * potkut, käännökset, kaatuminen ja ison kalan veto siiman suuntaan.
   */
  private updatePovTube(pos: Vec2, heading: number, capsize: number, flying: boolean): void {
    const tube = this.povTube;
    tube.group.visible = !this.spectating && !flying;
    if (!tube.group.visible) return;
    const f = this.fishing;
    let pull = 0;
    if (f.hookedId !== null) {
      const side = Math.sin(Math.atan2(f.lure.y - pos.y, f.lure.x - pos.x) - heading);
      pull = -side * Math.min(1, f.tension / breakingStrength(f.tackle));
    }
    tube.setFlyLine(isFly(f.tackle), f.slack, this.appearance.line);
    const now = performance.now();
    tube.update(
      toWorld(pos, 0),
      heading,
      {
        kickPhase: this.tube.kickPhase,
        sprint: this.sprinting,
        angVel: this.tube.angVel,
        roll: this.rock.roll,
        pitch: this.rock.pitch,
        lift: this.rock.lift,
        capsize,
        pull,
        clarity: this.daylight.light,
        emote: this.emoting?.id ?? null,
        emoteAge: this.emoting ? (now - this.emoting.start) / 1000 : 0,
      },
      Math.min(0.1, (now - this.povTubeTime) / 1000),
    );
    this.povTubeTime = now;
  }

  private povTubeTime = performance.now();
  /** Sormen liike pelikuvalla (CSS-pikseleinä), jota perhoheitto ei ole vielä käyttänyt. */
  private swipeX = 0;
  private swipeY = 0;

  /**
   * Kerää sormen liikkeen pelikuvalla (#236): pyyhkäisy ylös on eteenheitto,
   * alas takaheitto. Liike tulee tapahtumista, ei askelten välisistä
   * paikoista, joten hitaalla ruudunpäivityksellä pyyhkäisyn alku ei katoa.
   */
  private collectSwipe(touch: boolean): void {
    this.swipeX = touch ? this.swipeX + this.input.dragDX : 0;
    this.swipeY = touch ? this.swipeY + this.input.dragDY : 0;
  }

  /** Kerätty pyyhkäisy perhoheitolle hiiren pikseleinä. */
  private takeSwipe(): { dx: number; dy: number } {
    const h = window.innerHeight;
    const swipe = { dx: touchToRodPixels(this.swipeX, h), dy: touchToRodPixels(this.swipeY, h) };
    this.swipeX = 0;
    this.swipeY = 0;
    return swipe;
  }

  /** Perhon vedot hiirellä. */
  private readonly flyStrip = new FlyStrip();

  /**
   * Perhon siimakäsi (#234): hiiren vasen tai välilyönti pitää siimaa. Hiiren
   * veto alas vetää siimaa liikkeen verran, ylös nostaa vapaa (vastaisku).
   * Välilyönti ja kosketusnäytön KELAA vetävät tasaisesti.
   */
  private readFlyHand(
    dt: number,
    blocked: boolean,
  ): { lineHand: boolean; strip: number; rodLift: boolean } {
    const input = this.input;
    const mouse = input.isDown('Mouse0');
    const steady = input.isDown('Space') || input.isDown('Reel');
    const lineHand = !blocked && (mouse || steady);
    const pull = this.flyStrip.read(mouse && !blocked, input.mouseY, window.innerHeight, dt);
    const strip = (steady ? FLY.steadyStrip * dt : 0) + pull.strip;
    return { lineHand, strip: blocked ? 0 : strip, rodLift: pull.rodLift };
  }

  private toggleEmoteMenu(): void {
    if (!this.emoteMenu) {
      this.emoteMenu = new EmoteMenu(this.hud.root);
      this.emoteMenu.onPick = (id) => this.emote(id);
    }
    this.emoteMenu.toggle();
    this.sfx.preloadVoices(EMOTES);
  }

  /** Tekee käsimerkin: oma animaatio ja kupla, moninpelissä muille. */
  emote(id: EmoteId): void {
    if (!this.emoteLimiter.take(Date.now())) {
      this.hud.showMessage(t('emote.tooMany'), 2);
      return;
    }
    this.emoting = { id, start: performance.now() };
    this.showOwnBubble({ emote: id });
    this.sfx.voice(id, { speaker: 'me' });
    this.net?.world.sendEmote(id);
  }

  /**
   * Toisen pelaajan repliikki: hiljenee etäisyyden mukaan (80 m:n päähän ei
   * kuulu) ja tulee kameran suunnasta katsottuna vasemmalta tai oikealta.
   */
  private speakAt(id: VoiceId, speaker: string, at: Vec2): void {
    // Katsoja kuulee kameran kohdalta, pelaaja oman renkaansa kohdalta.
    const cam = this.camera.position;
    const ear = this.spectating ? { x: cam.x, y: -cam.z } : this.tube.pos;
    const gain = voiceFalloff(distance(at, ear));
    if (gain <= 0) return;
    const local = toWorld(at, 1).applyMatrix4(this.camera.matrixWorldInverse);
    const side = local.x / Math.max(4, Math.hypot(local.x, local.z));
    this.sfx.voice(id, { gain, pan: side * 0.8, speaker });
  }

  private get emoteActive(): boolean {
    return this.emoting !== null && performance.now() - this.emoting.start < EMOTE_DURATION * 1000;
  }

  private showOwnBubble(content: BubbleContent): void {
    this.ownBubble ??= new SpeechBubble(this.hud.root);
    this.ownBubble.show(content);
  }

  /** Oma kupla renkaan yllä vain ylhäältä katsottuna (kalastajan silmin ei omaa kuplaa). */
  private placeOwnBubble(): void {
    const bubble = this.ownBubble;
    if (!bubble) return;
    const canvas = (this.gameCanvas ??=
      document.querySelector<HTMLCanvasElement>('canvas.game-canvas'));
    if (this.viewMode !== 'top' || !canvas || this.spectating) {
      bubble.place(null, false);
      return;
    }
    const at = screenAnchor(
      this.tubeMesh.position.clone().setY(1.5),
      this.camera,
      canvas.getBoundingClientRect(),
    );
    bubble.place(at, false);
  }

  /** Vapauttaa GPU-resurssit, kun kierros päättyy. */
  dispose(): void {
    this.emoteMenu?.dispose();
    this.ownBubble?.remove();
    this.remoteView?.dispose();
    this.net?.world.dispose();
    this.waterWaves.uWaterMask.value?.dispose();
    this.waterWaves.uDepthTex.value?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    });
  }

  /** Piirtää interpoloiden edellisen ja nykyisen askeleen välillä. */
  render(alpha: number): void {
    const a = this.prevTube;
    const b = this.tube;
    const offset = this.net?.world.renderOffset ?? { x: 0, y: 0 };
    let pos = {
      x: a.pos.x + (b.pos.x - a.pos.x) * alpha + offset.x,
      y: a.pos.y + (b.pos.y - a.pos.y) * alpha + offset.y,
    };
    let heading = lerpAngle(a.heading, b.heading, alpha);
    // Trombin mukana rengas lentää kieppuen kaarena perille.
    const air = this.flight ? this.flightNow() : null;
    if (air) {
      pos = air.pos;
      heading += air.spin;
    }
    this.tubeMesh.position.copy(toWorld(pos, air?.height ?? 0));
    this.tubeMesh.rotation.y = heading;
    const roll = this.capsizeRoll();
    this.tubeMesh.rotation.x = air ? air.tumble : roll;
    // Ylhäältä katsottuna korkealla lentävä rengas näkyy isompana, ja sen
    // varjo vedessä pienenee korkeuden mukana.
    this.tubeMesh.scale.setScalar(1 + (air?.height ?? 0) / 14);
    this.flightShadow.visible = air !== null && this.viewMode === 'top';
    if (air) {
      this.flightShadow.position.copy(toWorld(air.pos, 0.05));
      this.flightShadow.scale.setScalar(Math.max(0.4, 1 - air.height / SPOUT.flightHeight));
    }
    animateFins(this.tubeMesh, b.kickPhase);
    const emoteAge = this.emoting ? (performance.now() - this.emoting.start) / 1000 : Infinity;
    if (emoteAge > EMOTE_DURATION) this.emoting = null;
    animateEmote(this.tubeMesh, this.emoting?.id ?? null, emoteAge);
    const hooked = this.fish.fish.find((x) => x.id === this.fishing.hookedId) ?? null;
    this.fishingView.update(this.fishing, this.fishingContext(), this.aim, 1 / 60, hooked);
    this.view.apply();
    // Tyynellä lähivesi on tasainen, joten pohjan kivet ja sävyt näkyvät kuten ennenkin.
    const rough = this.waterWaves.uSwellFade.value > 0;
    placeSwellPatch(
      this.swellPatch,
      this.waterWaves,
      this.viewMode === 'pov' && rough ? pos : null,
    );
    this.youMarker.update(pos, heading, this.view.metersPerPixel, this.viewMode === 'top');
    this.hud.compass.update(heading);
    if (this.viewMode === 'pov') {
      // Kumossa kamera kallistuu ja painuu veden rajaan.
      this.pov.apply(
        pos,
        heading,
        b.kickPhase,
        air
          ? // Ilmassa katse painuu alas järvelle.
            {
              lift: air.height,
              roll: air.tumble * 0.4,
              pitch: -0.6 * (air.height / SPOUT.flightHeight),
            }
          : {
              lift: this.rock.lift - 0.7 * (roll / Math.PI),
              roll: this.rock.roll + roll * 0.3,
              pitch: this.rock.pitch,
            },
      );
      this.updatePovTube(pos, heading, roll, air !== null);
      // Vapa oikeasta kädestä kärkeen; kärki on siiman alkupiste.
      const side = rodSideOffset(heading);
      // Perhoheitossa vapa heiluu taakse ja eteen (#235).
      const cast = this.fishing.stage === 'casting' ? this.fishing.flyCast : null;
      const swing = cast ? flyRodTip(cast.rod) : null;
      const tip = swing
        ? {
            x: pos.x + Math.cos(heading) * swing.forward,
            y: pos.y + Math.sin(heading) * swing.forward,
          }
        : rodTip(pos, heading);
      tip.x += side.x;
      tip.y += side.y;
      this.povRod.update(
        this.pov.camera,
        this.pov.pixelSize,
        pos,
        heading,
        tip,
        this.fishing,
        this.cranking,
        this.fishingView.shownLineColor,
        { tipY: swing?.height, fly: isFly(this.fishing.tackle), bend: this.flyRodBend(cast) },
      );
      this.sky.follow(this.pov.camera.position);
      this.mist.follow(this.pov.camera.position);
    }
    this.shakeCamera();
    this.lightning.orient(this.camera, this.heightPx);
    if (this.net && this.remoteView) {
      const others = this.net.world.others();
      // Katsojan silmin seurattavan oma rengas ei peitä näkymää.
      const shown =
        this.spectating && this.viewMode === 'pov'
          ? others.filter((o) => o.id !== this.followed)
          : others;
      this.remoteView.update(shown, this.camera, this.net.canvas);
    }
    this.placeOwnBubble();
  }
}
