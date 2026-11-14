import * as THREE from 'three';
import {
  breakingStrength,
  isFly,
  LUNKINJARVI,
  WaterBody,
  BoatSeat,
  PIER_DECK,
  createTube,
  inflateRow,
  beachedBoat,
  findLaunchPoint,
  isValidStart,
  Rng,
  createCompetition,
  createFishPopulation,
  FISH_COUNT,
  SPOUT,
  stepCompetition,
  createFishing,
  clockAt,
  daylight,
  seasonOf,
  fishConditions,
  lerpAngle,
  rodTip,
  ChatLimiter,
  EMOTE_DURATION,
  EMOTE_RATE,
  EMOTES,
  distance,
  LureStage,
  type EmoteId,
  type CompetitionSettings,
  type LakeBottom,
  type CompetitionState,
  type Fish,
  type FishPopulation,
  type FishingState,
  type Penalty,
  type Season,
  type SpoutFlight,
  type LakeMap,
  type RecordEntry,
  type Tackle,
  type Appearance,
  type Vec2,
  type TubeState,
  RaceStatsCounter,
  type RaceStats,
  isBotLevel,
  type FishConditions,
  type FishTag,
} from '@lunki/shared';
import type { Input } from '../engine/input';
import { padSettings, ReelLatch } from '../engine/padSettings';
import {
  contextActions,
  controlMode,
  Controls,
  controlText,
  setOrbitCamera,
  type ShoreMain,
} from './controls';
import { createBottomMesh } from '../world/bottomMesh';
import { FishShadow } from '../world/fishShadow';
import { FishSignsView } from './fishSignsView';
import { BirdsView } from './birdsView';
import { staticWorldFor, type StaticWorld } from '../world/staticWorld';
import type { RetroResolution } from '../engine/resolution';
import type { RetroRenderer } from '../engine/retroRenderer';
import { CHASE, ChaseOrbit, chaseArc, lakeLevel, nextView, type ViewMode } from './chaseCamera';
import { EYE_HEIGHT, PovCamera } from './povCamera';
import { createLakeMesh, createWaterWaves, toWorld, waterTime } from '../world/lakeMesh';
import { setSightLine } from '../world/sightLine';
import { bailPose, capsizeRoll, type BailPose, type NetWorld } from '../net/netWorld';
import type { Sfx } from '../audio/sfx';
import { Sounds } from '../audio/sounds';
import type { Listener } from '../audio/mix';
import type { VoiceId } from '../audio/voice';
import type { Hud, SituationBar } from '../ui/hud';
import { FishingView } from './fishingView';
import { rodSideOffset, type LinePoint } from './lineHang';
import { PovRod, flyRodAngle, flyRodTip } from './povRod';
import type { Shot } from './director';
import type { RemotePlayer } from '../net/netWorld';
import { REST_POSE, lakePoint } from './rodMotion';
import { PovTube } from './povTube';
import { AshoreFigure, STANDING_EYE, wadeGround } from './shoreView';
import { loadAppearance } from './appearance';
import { loadTackle } from './tackle';
import { TopDownCamera } from './topDownCamera';
import {
  SEATED_LIFT,
  aimRod,
  animateEmote,
  animateFins,
  createTubeMesh,
  setFlyRod,
  setSeated,
} from './tubeMesh';
import { AnchorView, type AnchoredCraft } from './anchorView';
import { SeatSlides } from './seatSlide';
import { BoatsView } from './boatView';
import { SpeechBubble, type BubbleContent } from './speechBubble';
import { screenAnchor } from './screenAnchor';
import { EmoteMenu } from '../ui/emoteMenu';
import { HeldMenu } from './heldMenu';
import { LURE_HOLD, LurePicker } from './lurePicker';
import { YouMarker } from './youMarker';
import { RaceLog, type RaceMapData } from './raceLog';
import { bottomFor } from '../world/lakeData';
import { t } from '../i18n';
import { CraftController, type CraftHost } from './craftController';
import { FishingController, SOLO_ID, type FishingHost } from './fishingController';
import { scoreboardLines } from './raceScoreboard';
import { SoloBots, isSoloBotCount } from './soloBots';
import { raceStatus, type RaceStatus } from './raceStatus';
import { HudPresenter, type HudHost } from './hudPresenter';
import { NetBridge, type NetHost, type NetLink } from './netBridge';
import { Penalties } from './penalties';
import { Guide, loadGuide } from './guide';
import { WeatherController, type WeatherHost } from './weatherController';

export type { NetLink } from './netBridge';

const LAND_COLOR = 0x24502c;
/** Viehettä seuraava kala näkyy pyörteinä tätä lähempänä viehettä (m). */
const FOLLOW_SIGN_RANGE = 4;

/**
 * Pelikierros järvellä, yksin- tai moninpeli. Kokoaa osat ja kutsuu niitä
 * järjestyksessä: sää ja valo (`WeatherController`), kulkupeli
 * (`CraftController`), kalastus (`FishingController`), HUD (`HudPresenter`),
 * moninpelin erot (`NetBridge`), rangaistukset (`Penalties`) ja äänet
 * (`Sounds`). Yksinpelissä rengas liikkuu paikallisesti; moninpelissä oma
 * rengas ennakoidaan ja palvelin on totuus.
 */
export class Game implements WeatherHost, FishingHost, CraftHost, NetHost, HudHost {
  readonly scene = new THREE.Scene();
  /** Pelin äänet äänikartan kautta (audio/sounds.ts). */
  readonly sounds: Sounds;
  readonly view = new TopDownCamera();
  /** Näppäimet ja kosketusnapit toimintoina (game/controls.ts). */
  readonly controls: Controls;
  /** Kalastajan silmin -näkymä (V vaihtaa). */
  readonly pov = new PovCamera();
  viewMode: ViewMode = 'top';
  /** Takaa-näkymän kameran asento kalastajan suhteen (#691). */
  readonly chase = new ChaseOrbit();
  /** Vain POV:ssa näkyvät (maasto, metsänreuna) ja vain ylhäältä näkyvät (karttapohja). */
  private readonly scenery = new THREE.Group();
  private readonly mapOverlay = new THREE.Group();
  /** Kartan muuttumattomat osat, yhteiset kaikille peleille (#327). */
  private readonly world: StaticWorld;
  private readonly povRod = new PovRod();
  /** Oman vavan kärki ylhäältä-näkymässä (hahmon vapa). */
  private readonly rodEnd = new THREE.Vector3();
  private readonly povTube: PovTube;
  readonly water: WaterBody;
  readonly bottom: LakeBottom;
  tube: TubeState;
  prevTube: TubeState;
  /**
   * Omat värit valitaan ennen kisaa (yksinpelin asetukset tai aula).
   * Moninpelissä ne luetaan palvelimen tilasta kuten muidenkin: selaimen
   * muisti on yhteinen saman selaimen ikkunoille.
   */
  readonly appearance: Appearance;
  private readonly tubeMesh: THREE.Group;
  /** Oma kalastaja maalla ja rengas maassa tai kannettuna (#457). */
  private readonly ashoreFigure: AshoreFigure;
  /** Oma sijainti kauas loitonnettaessa. */
  private readonly youMarker = new YouMarker();
  readonly fishing: FishingState;
  readonly fishingView = new FishingView();
  /** Käsimerkit (#228): valikko, käynnissä oleva ele (alku ms) ja oma kupla. */
  private emoteMenu: EmoteMenu | null = null;
  /** Pohjassa pidetty G valitsee irrotettaessa osoitetun eleen (#387). */
  private readonly emoteHold = new HeldMenu(() => this.emoteMenu, 'emote', LURE_HOLD);
  private emoting: { id: EmoteId; start: number } | null = null;
  private readonly emoteLimiter = new ChatLimiter(EMOTE_RATE);
  private ownBubble: SpeechBubble | null = null;
  private gameCanvas: HTMLCanvasElement | null = null;
  /** Suurkalan varjo veden alla (#231). */
  readonly fishShadow = new FishShadow();
  /** Kalojen merkit pinnalla (#369), kuultuina omalta paikalta. */
  readonly fishSigns = new FishSignsView((event, at) => this.sounds.playAt(event, at));
  /** Linnut (#571, #572): vesilinnut ja syönnin näyttävät lokit ja sääksi. */
  private readonly birds: BirdsView;
  readonly rng: Rng;
  readonly fish: FishPopulation;
  readonly competition: CompetitionState;
  /** Kisan kulku tulossivun karttaan. */
  readonly raceLog = new RaceLog();
  /** Tulossivun tilastot ja palkinnot (#367). */
  readonly raceStatsCounter = new RaceStatsCounter();
  /** Opastus ensimmäiseen kalaan (#370). */
  readonly guide = new Guide(loadGuide());
  /** Moninpelin katsoja: ei omaa rengasta, kamera seuraa valittua kalastajaa. */
  readonly spectating: boolean;
  /** Kutsutaan, kun kilpailuaika loppuu. */
  onFinished: (() => void) | null = null;
  /** Yksinpelin saalis yksinpelin ennätyslistalle (moninpelissä palvelin punnitsee itse). */
  onSoloCatch: ((entry: Omit<RecordEntry, 'date' | 'at' | 'angler'>) => void) | null = null;
  /** Veneet (#263), myös oma. */
  private readonly boatsView = new BoatsView();
  /** Ankkuriköydet (#355), myös oma. */
  private readonly anchorView = new AnchorView();
  /** Paikanvaihdon siirtymä ja keinahdus piirrossa (#357). */
  private readonly seatSlides = new SeatSlides();
  private readonly reelLatch = new ReelLatch();
  private readonly waterWaves = createWaterWaves();
  /**
   * Ylhäältä katsottavat järven osat: kaislikkokuviot ja saarten litteät
   * kannet. POV-näkymässä ne näkyivät isoina vaaleina laattoina; siellä
   * kaislat ovat spritejä ja saaret maastoa.
   */
  private readonly topViewOnly: THREE.Object3D[];
  readonly penalties: Penalties;
  /** Sää, valo, vesi, salamat, isot aallot ja trombit. */
  readonly weather: WeatherController;
  readonly craft: CraftController;
  readonly angler: FishingController;
  /** Kisan viehepakki ja pikavalikko (#365). */
  readonly lurePicker: LurePicker;
  private readonly presenter: HudPresenter;
  /** Moninpelin kytkentä; yksinpelissä null. */
  private readonly net: NetBridge | null = null;
  /** Yksinpelin botit (#624); moninpelissä botit ovat palvelimella. */
  readonly soloBots: SoloBots | null = null;
  private povTubeTime = performance.now();
  /** Ohjaajan kuva nyt (#564); pelaajalla ja käsiohjauksessa null. */
  private shot: Shot | null = null;
  /** Seurattavan siiman pituus edellisessä ruudussa (kelaus näkyy kelassa). */
  private followedLine = 0;
  /** Kenen värit katsojan silmin -renkaassa ovat. */
  private followedLook: string | null = null;

  constructor(
    readonly input: Input,
    readonly hud: Hud,
    sfx: Sfx,
    /** Muuntaa näytön CSS-pikselin sisäiseksi pikseliksi. */
    readonly screenToInternal: (x: number, y: number) => { x: number; y: number },
    readonly settings: CompetitionSettings,
    seed = Date.now() >>> 0,
    readonly map: LakeMap = LUNKINJARVI,
    link?: NetLink,
    /** Nimilappujen kerros ja canvas yksinpelin boteille; valikon taustalla ei ole. */
    private readonly stage?: Pick<NetLink, 'overlay' | 'canvas'>,
  ) {
    this.netWorld = link?.world;
    this.controls = new Controls(input);
    this.sounds = new Sounds(sfx);
    this.appearance = link?.world.ownAppearance ?? loadAppearance();
    this.tubeMesh = createTubeMesh(this.appearance);
    this.fishing = createFishing(link?.world.ownTackle ?? loadTackle());
    this.competition = createCompetition(settings);
    this.spectating = link?.world.spectating ?? false;
    this.water = new WaterBody(map);
    this.bottom = bottomFor(map, this.water);
    this.rng = new Rng(seed);
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
      seasonOf(settings),
    );
    this.birds = new BirdsView(seed, seasonOf(settings), { water: this.water, map }, (e, at) =>
      this.sounds.playAt(e, at),
    );
    this.penalties = new Penalties(this.competition, settings, link?.world);
    this.craft = new CraftController(this);
    this.angler = new FishingController(this);
    this.lurePicker = new LurePicker(this);
    this.presenter = new HudPresenter(this);
    if (link) {
      // Palvelin arpoi aloituspaikan.
      this.tube = link.world.predictor.tube;
      // Kisaan palatessa aiemmat saaliit näkyvät heti omassa listassa.
      this.competition.catches.push(...link.world.ownCatches());
    } else {
      const chosen = settings.start;
      const start =
        chosen && isValidStart(this.water, chosen)
          ? { ...chosen }
          : findLaunchPoint(this.water, map.bounds, () => this.rng.next());
      // Selkä rantaan päin, katse järvelle. Veneellä keula järvelle: soutaja katsoo rantaan.
      const shore = this.water.closestShorePoint(start)?.point ?? start;
      const out = Math.atan2(start.y - shore.y, start.x - shore.x);
      this.tube = createTube(start, this.craft.soloCraft === 'boat' ? out + Math.PI : out);
      // Täyttökisa (#458): rannalla tyhjän renkaan ja pumpun ääressä, tai vene
      // rannalla vettä täynnä.
      const slot = settings.inflate ? inflateRow(this.water, start, 1, seed)[0] : undefined;
      if (slot)
        this.tube =
          this.craft.soloCraft === 'boat'
            ? (beachedBoat(this.water, slot.pos, seed, 1) ?? this.tube)
            : slot;
    }
    this.prevTube = this.tube;

    this.scene.background = new THREE.Color(LAND_COLOR);
    this.weather = new WeatherController(this, this.scene, this.waterWaves, seed);
    this.scene.add(...this.weather.groups);
    const lake = createLakeMesh(map, this.waterWaves, seasonOf(settings));
    this.topViewOnly = lake.children.filter((c) => c.name === 'reeds' || c.name === 'island');
    this.scene.add(lake);
    const { swellPatch, flightShadow } = this.weather.waterParts;
    this.scene.add(swellPatch);
    this.weather.updateSky(0);
    this.weather.applyLight();
    this.scene.add(createBottomMesh(this.bottom, this.waterWaves));
    this.scene.add(this.fishShadow.mesh, this.fishSigns.group, this.birds.group);
    this.ashoreFigure = new AshoreFigure(this.appearance);
    this.scene.add(
      this.tubeMesh,
      this.ashoreFigure.group,
      this.boatsView.group,
      this.anchorView.group,
    );
    this.scene.add(flightShadow);
    this.world = staticWorldFor(map, seasonOf(settings));
    this.scenery.visible = false;
    this.scene.add(this.scenery, this.mapOverlay);
    this.attachWorld();
    this.povRod.group.visible = false;
    this.scene.add(this.povRod.group);
    this.povTube = new PovTube(this.appearance);
    this.povTube.group.visible = false;
    this.scene.add(this.povTube.group);
    this.fishingView.lineColor = this.appearance.line;
    this.scene.add(this.fishingView.group, this.youMarker.group);
    if (link) {
      this.net = new NetBridge(this, link);
      this.scene.add(this.net.knots.group, this.net.remoteView.group);
      link.world.enableAnchor((p) => this.bottom.depthAt(p));
    }
    const bots = settings.soloBots ?? 0;
    if (!link && stage && isSoloBotCount(bots) && bots > 0) {
      this.soloBots = new SoloBots(
        this,
        bots,
        isBotLevel(settings.botLevel) ? settings.botLevel : 'mixed',
        seed,
        stage.overlay,
      );
      this.scene.add(this.soloBots.knots.group, this.soloBots.remoteView.group);
    }
    if (this.spectating) {
      this.tubeMesh.visible = false;
      this.fishingView.group.visible = false;
      this.youMarker.group.visible = false;
      this.tube = this.followTube(0) ?? this.tube;
      this.prevTube = this.tube;
    }
    this.view.snapTo(this.tube.pos);
    hud.setCountdown(null);
    // Kello näkyy heti HUDin tullessa esiin, ennen ensimmäistä päivitystä.
    this.presenter.updateTimer();
  }

  /**
   * Oma äyskäröijän asento (#458): soutajalla oman veneen mukaan, kyydissä
   * soutajan veneen mukaan; null, kun ei äyskäröi.
   */
  private ownBailPose(pos: Vec2, hull: number): BailPose | null {
    const b = this.tube.bailer;
    if (!b) return null;
    const w = this.netWorld;
    if (!w?.passenger)
      return bailPose(
        { pos, heading: hull, launch: this.tube.launch },
        b,
        BoatSeat.rower,
        this.water,
      );
    const boat = w.boats().find((x) => x.boat === w.boat);
    return boat ? bailPose(boat, b, w.seat, this.water) : null;
  }

  /** Luotaimet ja perhoheiton sivukuva päälle tai pois (K, L, P). */
  private togglePanels(): void {
    const c = this.controls;
    if (c.wasPressed('sonar')) this.hud.sonar.toggle();
    // Heiton aikana L (kosketuksella SYV) ja P piilottavat perhoheiton sivukuvan (#236).
    const casting = this.fishing.stage === 'casting';
    if (c.wasPressed('flyPanel') || (casting && c.wasPressed('lureSonar')))
      this.hud.showMessage(
        this.hud.flyPanel.toggle() ? t('game.flyPanelOn') : t('game.flyPanelOff'),
        1.5,
        'info',
      );
    else if (c.wasPressed('lureSonar'))
      this.hud.showMessage(
        this.hud.lureSonar.toggle() ? t('game.lureSonarOn') : t('game.lureSonarOff'),
        1.5,
        'info',
      );
  }

  /** Kalastaja on maissa (#457): kalastusnapit, -mittarit ja viehepakki ovat poissa käytöstä. */
  get ashore(): boolean {
    return this.craft.ashore;
  }

  /** Ison kosketusnapin toiminto maalla (#457); undefined = vedessä. */
  get shoreMain(): ShoreMain | null | undefined {
    if (!this.craft.ashore || this.spectating) return undefined;
    return this.craft.shoreAction;
  }

  /** Moninpelin maailma; yksinpelissä undefined. */
  readonly netWorld: NetWorld | undefined;

  /** Tuuli nyt (m/s); kisan päätyttyä tyyntä. */
  get wind(): Vec2 {
    return this.weather.wind;
  }

  /** Ukkonen nyt (yksinpelin botit kelaavat sisään). */
  get thunder(): boolean {
    return this.weather.now.sky === 'thunder';
  }

  /** Kalojen olot nyt: sää, valo ja kausi. */
  get conditions(): FishConditions {
    return fishConditions(
      this.competition.finished ? null : this.weatherNow,
      this.daylight,
      this.season,
    );
  }

  /** Pelaaja nosti kalan: yksinpelin botit eivät saa samaa. */
  fishTaken(tag: FishTag): void {
    this.soloBots?.ownCatch(tag);
  }

  get weatherNow() {
    return this.weather.now;
  }

  /** Renkaaseen vaikuttava tuuli: sään tuuli ja trombin imu (heittoon trombi ei vaikuta). */
  get tubeWind(): Vec2 {
    return this.weather.tubeWind;
  }

  /** Aktiivinen kamera piirtoa varten. */
  get camera(): THREE.Camera {
    return lakeLevel(this.viewMode) ? this.pov.camera : this.view.camera;
  }

  setResolution(r: RetroResolution): void {
    this.weather.heightPx = r.height;
    this.view.setResolution(r);
    this.pov.setResolution(r);
  }

  /** Kalastajan silmin -näkymän näkökenttä (pysty-FOV asteina, #330). */
  setPovFov(fov: number): void {
    this.pov.setFov(fov);
  }

  /** Toteutunut pysty-FOV tällä ruudulla. */
  get povFov(): number {
    return this.pov.camera.fov;
  }

  /** announce = false: ei ilmoitusta (kisan alussa näkymä vain asetetaan). */
  setViewMode(mode: ViewMode, announce = true): void {
    this.viewMode = mode;
    // Silmin ja takaa (#691) ovat järven tasolla: maisema, usva ja perspektiivi.
    const lake = lakeLevel(mode);
    const pov = mode === 'pov';
    this.scenery.visible = lake;
    this.mapOverlay.visible = !lake;
    this.povRod.group.visible = pov && !this.spectating;
    this.povTube.group.visible = pov && !this.spectating;
    this.tubeMesh.visible = !pov && !this.spectating;
    for (const o of this.topViewOnly) o.visible = !lake;
    this.weather.setPov(lake);
    this.fishingView.pov = lake;
    this.waterWaves.uPov.value = lake ? 1 : 0;
    // Takaa-näkymässä nuolet, LT + oikea tatti ja sormen veto ohjaavat kameraa.
    setOrbitCamera(mode === 'chase');
    this.chase.center();
    this.hud.refreshHelp();
    // Takaa-näkymän ilmoitus kertoo myös, millä kamera kääntyy (#708), joten se
    // näkyy pidempään.
    if (announce)
      this.hud.showMessage(
        controlText(pov ? 'game.viewPov' : lake ? 'game.viewChase' : 'game.viewTop'),
        mode === 'chase' ? 3 : 1.2,
        'info',
      );
  }

  /** Vaihtaa varusteet heti, tai kun viehe seuraavan kerran on kelalla. */
  setTackle(tk: Tackle): void {
    this.angler.setTackle(tk);
  }

  /** Varusteet sellaisina kuin ne ovat seuraavassa heitossa. */
  get tackle(): Tackle {
    return this.angler.tackle;
  }

  get difficulty() {
    return this.settings.difficulty;
  }

  /** Moninpelissä oma nimi palvelimelta (se voi olla muutettu); yksinpelissä null. */
  get ownName(): string | null {
    return this.netWorld?.ownName ?? null;
  }

  /** Rangaistus omasta osumasta. Moninpelissä palvelin pitää jäähyn ja saaliit. */
  punish(penalty: Penalty, label: string, timeOut?: number): string {
    this.resetFishing();
    this.sounds.play('penalty');
    return this.penalties.punish(penalty, label, timeOut);
  }

  resetFishing(): void {
    this.angler.reset();
  }

  /** Jäähyä jäljellä (s); pudonneella Infinity. */
  get timeOutLeft(): number {
    return this.penalties.timeOutLeft;
  }

  logEvent(kind: 'capsize' | 'lightning', pos: Vec2): void {
    this.raceLog.addEvent(kind, pos, this.competition.elapsed);
  }

  splashAt(pos: Vec2): void {
    this.fishingView.startSplash(pos);
  }

  onStrike(pos: Vec2, hitMe: boolean): void {
    this.weather.onStrike(pos, hitMe);
  }

  onCapsize(cause: 'wave' | 'spout'): void {
    this.weather.onCapsize(cause);
  }

  startFlight(flight: SpoutFlight | null): void {
    this.weather.startFlight(flight);
  }

  followTube(step: number): TubeState | null {
    return this.net?.followTube(step) ?? null;
  }

  get flying(): boolean {
    return this.weather.flight !== null;
  }

  get thunderNow(): boolean {
    return this.weather.thunderNow;
  }

  get flyKeyboard(): boolean {
    return this.angler.flyCastControl.keyboard;
  }

  get craftHint(): string | null {
    return this.craft.hint;
  }

  get craftHintBars(): SituationBar[] | null {
    return this.craft.hintBars;
  }

  get inBoat(): boolean {
    return this.craft.inBoat;
  }

  get rower(): boolean {
    return this.craft.rower;
  }

  get rowing(): boolean {
    return this.craft.seat.rowing;
  }

  /** Kalastajan katsesuunta: soutaja voi kääntyä tuhdolla veneen suunnasta. */
  get facing(): number {
    return this.craft.facing;
  }

  /** Moninpelin veneessä paikkaa voi vaihtaa venekunnan kesken (#357). */
  get crewSeats(): boolean {
    return this.craft.crewSeats;
  }

  /** Siima on sotkussa toisen kalastajan siiman kanssa (KATKO-nappi). */
  get tangled(): boolean {
    return this.net?.tangled ?? this.soloBots?.tangled ?? false;
  }

  /** Perhoa heitetään rytmissä (välilyönti tai HEITÄ): kosketuksen iso nappi on yhä HEITÄ. */
  get flyRhythm(): boolean {
    return this.angler.flyRhythm;
  }

  update(dt: number): void {
    const input = this.input;
    const c = this.controls;
    const net = this.net;
    waterTime.value += dt;
    this.sounds.listener = this.listener;
    if (this.competition.finished) return;
    if (
      net
        ? net.syncCompetition()
        : stepCompetition(this.competition, dt) || this.penalties.outOfSession()
    ) {
      this.sounds.play('finished');
      this.onFinished?.();
      return;
    }
    // Lähtölaskennan aikana rengas ja vapa odottavat.
    const frozen = this.netWorld?.phase === 'countdown';
    const zoom = input.wheel + (c.wasPressed('zoomOut') ? 1 : 0) - (c.wasPressed('zoomIn') ? 1 : 0);
    if (zoom !== 0) this.view.zoom(zoom);
    if (c.wasPressed('help')) this.hud.toggleHelp();
    // Maalla (#457) luotaimet ja perhoheiton sivukuva ovat piilossa: niiden
    // näppäimet eivät tee mitään, kuten kosketuksen piilotetut napit.
    if (!this.craft.ashore) this.togglePanels();
    if (c.wasPressed('view')) {
      this.setViewMode(nextView(this.viewMode, this.spectating));
      // Katsoja vaihtoi näkymän itse: ohjaaja odottaa hetken (#564).
      if (this.spectating) net?.manualView(this.viewMode === 'top' ? 'top' : 'pov');
    }
    // Täyttökisan nuolisarjan ajan nuolet kuuluvat sarjalle, eivät kameralle.
    c.setArrowSequence(this.craft.arrowSequence);
    if (this.viewMode === 'chase')
      this.chase.step(
        dt,
        c.cameraInput(),
        c.isDown('forward') || c.isDown('back') || c.isDown('left') || c.isDown('right'),
        window.innerHeight,
        this.fishing.landing !== null,
      );
    if (this.spectating && c.wasPressed('director'))
      this.hud.showMessage(
        controlText(net?.toggleDirector() ? 'broadcast.directorOn' : 'broadcast.directorOff'),
        2,
        'info',
      );
    if (c.wasPressed('emote') && !this.spectating) this.toggleEmoteMenu();
    this.emoteHold.step(c);
    this.lurePicker.step(dt);
    this.weather.step(dt);
    const timeOut = this.penalties.timeOutLeft;
    const capsized = this.penalties.capsizeLeft > 0;
    // Peliohjaimella kelaus voi olla kytkin (#594): painallus aloittaa, toinen lopettaa.
    const fishingNow = this.fishing;
    const reelHeld =
      c.isDown('pointer') ||
      this.reelLatch.step(
        c.isDown('reel'),
        c.wasPressed('reel'),
        controlMode() === 'pad' &&
          padSettings().reelToggle &&
          fishingNow.stage === 'water' &&
          !fishingNow.landing &&
          contextActions(fishingNow, false).main === 'reel',
      );
    const tangle = net
      ? net.updateTangle(c.wasPressed('cut'))
      : (this.soloBots?.updateTangle(dt, c.wasPressed('cut'), reelHeld) ?? null);
    if (!frozen) this.logRace();

    // Maalla välilyönnin toiminto katsotaan ennen askelta: kyytiin hypyn aikana
    // toimintoa ei enää ole, eikä sama painallus ole heittoyritys (#464).
    const shoreAction = this.craft.shoreAction;
    this.craft.step(dt, { frozen, capsized, reelHeld });
    const f = this.fishing;
    // Maalta ei kalasteta (#457): heitto ei lähde, ja yritys kertoo miksi.
    const ashore = this.craft.ashore;
    if (
      ashore &&
      !this.spectating &&
      // Täyttökisan letkun siirrossa (#458) välilyönti ei tee mitään: ohje kertoo nuolet.
      !this.tube.shore?.inflate &&
      !this.tube.bailer &&
      this.tube.shore?.board === undefined &&
      (c.wasPressed('pointer') || (c.wasPressed('castForward') && !shoreAction))
    )
      this.hud.showMessage(t('game.noFishingAshore'), 2, 'info');
    const { lineHand } = this.angler.step(dt, {
      frozen: frozen || ashore,
      capsized,
      timeOut,
      tangled: !!tangle,
      reelHeld,
    });
    const lureOut = f.stage === 'flight' || f.stage === 'water';
    this.updateBirds(dt);
    const shot = (this.shot = this.spectating ? (net?.stepDirector(dt) ?? null) : null);

    // Kamera: kun viehe on ulkona, seurataan renkaan ja vieheen väliä ja loitonnetaan tarvittaessa.
    if (shot) this.directCamera(shot, dt);
    else if (lureOut) {
      const mid = { x: (this.tube.pos.x + f.lure.x) / 2, y: (this.tube.pos.y + f.lure.y) / 2 };
      this.view.follow(mid, dt, 2);
      this.view.fitSpan(
        Math.abs(f.lure.x - this.tube.pos.x) * 1.3 + 10,
        Math.abs(f.lure.y - this.tube.pos.y) * 1.3 + 10,
      );
    } else {
      // Lennossa kamera seuraa rengasta ilmassa.
      this.view.follow(
        this.weather.flightNow()?.pos ?? this.tube.pos,
        dt,
        this.weather.flight ? 6 : 3,
      );
      this.view.fitSpan(0, 0);
    }

    const presenter = this.presenter;
    if (this.spectating) {
      // Katsojan HUD: kenen kisaa seurataan, tulostaulu ja kello.
      presenter.showSpectator(net!.followed, shot, net!.news);
      presenter.updateTimer();
      this.weather.update(dt);
      presenter.updateRaceHud(net!.followed);
      this.hud.update(dt);
      return;
    }
    presenter.show(dt, { tangle, lineHand, lureOut });
    presenter.updateTimer();
    this.weather.update(dt);
    this.sounds.ambience(
      dt,
      {
        ...this.weather.now,
        // Sade kuuluu, kun lähestyvän rintaman reuna on kohdalla (#414).
        rain: this.weather.view.rain,
        ...this.daylight,
        spout: this.weather.spoutNear,
        season: this.season,
      },
      this.weather.spoutAt,
      this.birds.nearestLoon(this.ear),
    );
    this.craft.paddleSounds();
    this.soloBots?.update(dt);
    if (net) presenter.updateRaceHud();
    else if (this.soloBots) presenter.showScoreboard(this.soloBots.standings(), SOLO_ID);
    else presenter.showSoloCatches();
    this.hud.update(dt);
  }

  /**
   * Ohjaajan kuva (#564): näkymä ja rajaus. Uuteen kuvaan kamera liukuu
   * samalla seurannalla kuin katsojan itse vaihtaessa kalastajaa; kauempaa
   * liuku on nopeampi. Kamera hyppää vain, kun näkymä vaihtuu (ylhäältä ↔ omin silmin).
   * Väsytyksessä ja heitossa rengas ja viehe ovat samassa kuvassa, ja
   * yleiskuvassa näkyvät kaikki kalastajat.
   */
  private directCamera(shot: Shot, dt: number): void {
    const want = shot.view === 'pov' ? 'pov' : 'top';
    const cut = this.viewMode !== want;
    if (cut) this.setViewMode(want, false);
    const others = this.net!.world.others();
    const b = this.map.bounds;
    let target: Vec2 = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    let span = { w: 0, h: 0 };
    let stiffness = 3;
    if (shot.view === 'overview') {
      if (others.length > 0) {
        const xs = others.map((o) => o.pos.x);
        const ys = others.map((o) => o.pos.y);
        const [x0, x1, y0, y1] = [
          Math.min(...xs),
          Math.max(...xs),
          Math.min(...ys),
          Math.max(...ys),
        ];
        target = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
        span = { w: (x1 - x0) * 1.2 + 80, h: (y1 - y0) * 1.2 + 80 };
      } else span = { w: b.maxX - b.minX, h: b.maxY - b.minY };
    } else {
      const o = others.find((x) => x.id === shot.id);
      target = o?.pos ?? this.tube.pos;
      if (o?.lure) {
        target = { x: (o.pos.x + o.lure.x) / 2, y: (o.pos.y + o.lure.y) / 2 };
        span = {
          w: Math.abs(o.lure.x - o.pos.x) * 1.3 + 10,
          h: Math.abs(o.lure.y - o.pos.y) * 1.3 + 10,
        };
        stiffness = 2;
      }
    }
    if (cut) this.view.snapTo(target);
    else this.view.follow(target, dt, stiffness);
    this.view.fitSpan(span.w, span.h);
  }

  /** Pelikello (tuntia 0–24): alkaa vuorokaudenajan mukaan ja etenee kisakellon mukana. */
  get clock(): number {
    return clockAt(this.settings.timeOfDay ?? 'day', this.competition.elapsed, this.season);
  }

  /** Kisan vuodenaika (#427): auringon rata, maisema ja kalojen kausi. */
  get season(): Season {
    return seasonOf(this.settings);
  }

  /** Päivänvalo ja hämäryys nyt: kalojen syönti ja äänimaailma seuraavat tätä. */
  get daylight() {
    return daylight(this.clock, this.season);
  }

  /** Paletin sävytys jälkikäsittelyyn (vuorokaudenaika ja salama). */
  get grade() {
    return this.weather.sky.grade;
  }

  /** Tulossivun kartta: reitit kerran sekunnissa ja moninpelin sotkut. */
  private logRace(): void {
    this.raceStatsCounter.move(this.tube.pos, this.competition.elapsed);
    if (this.net) return this.net.logRace();
    this.raceLog.sample(this.competition.elapsed, [
      { id: SOLO_ID, name: t('common.youCapital'), pos: this.tube.pos },
      ...(this.soloBots?.routes() ?? []),
    ]);
    if (this.soloBots) this.raceLog.tangles(this.soloBots.tangleSpots(), this.competition.elapsed);
  }

  /**
   * Linnut (#571, #572): vesilinnut väistävät kaikkia kulkupelejä ja oman
   * vieheen molskahdusta, lokit ja sääksi lukevat kalakannan syönnin.
   */
  private updateBirds(dt: number): void {
    const crafts = (this.netWorld?.others() ?? this.soloBots?.others() ?? []).map((o) => o.pos);
    if (!this.spectating) crafts.push(this.tube.pos);
    const f = this.fishing;
    this.birds.update(dt, {
      fish: this.fish,
      conditions: fishConditions(
        this.competition.finished ? null : this.weatherNow,
        this.daylight,
        this.season,
      ),
      near: this.tube.pos,
      crafts,
      lure: !this.spectating && f.stage === 'water' ? f.lure : null,
      difficulty: this.settings.difficulty,
    });
  }

  /** Kisan omat tilastot tulossivulle (#367). */
  raceStats(): RaceStats {
    return this.raceStatsCounter.stats;
  }

  /** Kisan tilanne taukovalikkoon (#469); katsojalla ei omaa tilannetta. */
  raceStatus(): RaceStatus | null {
    if (this.spectating) return null;
    const w = this.netWorld;
    return raceStatus(
      this.competition,
      w ? w.standings() : (this.soloBots?.standings() ?? null),
      w ? w.myId : SOLO_ID,
      this.angler.baits,
    );
  }

  /**
   * Koko tulostaulu taukovalikkoon: kosketuksella sitä ei ole HUDissa. Null,
   * kun kilpailijoita ei ole (yksinpeli ilman botteja) tai pelaaja on katsoja.
   */
  scoreboard(): string[] | null {
    if (this.spectating) return null;
    const w = this.netWorld;
    const standings = w ? w.standings() : (this.soloBots?.standings() ?? null);
    if (!standings) return null;
    return scoreboardLines(standings, w ? w.myId : SOLO_ID, standings.length);
  }

  /**
   * Kisan kulku tulossivun karttaan. Saaliista näytetään vain ne, jotka
   * lopulta jäivät voimaan (jäähyssä menetetyt pois).
   */
  raceMap(): RaceMapData {
    const d = this.raceLog.data();
    const kept = this.netWorld
      ? this.netWorld.results().flatMap((r) => r.catches.map((c) => ({ ...c, id: r.name })))
      : [
          ...this.competition.catches.map((c) => ({ ...c, id: SOLO_ID })),
          ...(this.soloBots?.catches() ?? []),
        ];
    const counts = (m: { id: string; time: number; weight: number }) =>
      kept.some((c) => c.id === m.id && c.time === m.time && c.weight === m.weight);
    return { ...d, catches: d.catches.filter(counts) };
  }

  /**
   * Kaatumisen kallistus (rad): rengas pyörähtää nopeasti ympäri, kelluu
   * kumossa ja kääntyy lopuksi takaisin pystyyn.
   */
  private capsizeRoll(): number {
    return capsizeRoll(this.competition.elapsed - this.penalties.capsizedAt);
  }

  /**
   * Kalastajan silmin näkyvä rengas, sääret ja räpylät (#230): keinunta,
   * potkut, käännökset, kaatuminen ja ison kalan veto siiman suuntaan.
   */
  private updatePovTube(pos: Vec2, heading: number, capsize: number, flying: boolean): void {
    const tube = this.povTube;
    // Veneessä renkaan sijaan näkyy vene (BoatsView).
    tube.group.visible = !this.spectating && !flying && !this.inBoat;
    if (!tube.group.visible) return;
    const f = this.fishing;
    let pull = 0;
    if (f.hookedId !== null) {
      const side = Math.sin(Math.atan2(f.lure.y - pos.y, f.lure.x - pos.x) - heading);
      pull = -side * Math.min(1, f.tension / breakingStrength(f.tackle));
    }
    tube.setFlyLine(isFly(f.tackle), f.slack, this.appearance.line);
    const now = performance.now();
    const rock = this.weather.rock;
    tube.update(
      toWorld(pos, 0),
      heading,
      {
        kickPhase: this.tube.kickPhase,
        sprint: this.craft.sprinting,
        angVel: this.tube.angVel,
        roll: rock.roll,
        pitch: rock.pitch,
        lift: rock.lift,
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

  /** Seurattava kalastaja vedessä (ei maalla eikä lennossa); muuten null. */
  private followedOnLake(): RemotePlayer | null {
    const net = this.net;
    if (!net?.followed || this.shot?.view === 'overview') return null;
    const o = net.world.others().find((x) => x.id === net.followed);
    return o && !o.shore && !o.bailing && o.lift === undefined ? o : null;
  }

  /**
   * Katsojan silmin -kuva (#564): seurattavan rengas, sääret ja vapa kuten
   * omassa POV:ssa. Vavan asento (heitto, vastaisku, väsytyksen taipuma)
   * tulee muiden piirrosta, ja siima lähtee tämän vavan kärjestä.
   */
  private followedPov(o: RemotePlayer, pos: Vec2, heading: number): void {
    const remote = this.net!.remoteView;
    const pose = remote.poseOf(o.id);
    const tube = this.povTube;
    if (this.followedLook !== o.id) {
      tube.setAppearance(o.appearance);
      this.followedLook = o.id;
    }
    tube.group.visible = o.boat === 0;
    const now = performance.now();
    const rock = this.weather.rock;
    if (tube.group.visible) {
      tube.setFlyLine(o.fly === true, 0, o.appearance.line);
      tube.update(
        toWorld(pos, 0),
        heading,
        {
          kickPhase: o.kickPhase,
          sprint: false,
          angVel: 0,
          roll: rock.roll,
          pitch: rock.pitch,
          lift: rock.lift,
          capsize: o.roll,
          pull: 0,
          clarity: this.daylight.light,
          emote: null,
          emoteAge: 0,
        },
        Math.min(0.1, (now - this.povTubeTime) / 1000),
      );
    }
    this.povTubeTime = now;
    const side = rodSideOffset(heading);
    const tip = rodTip(pos, heading);
    tip.x += side.x;
    tip.y += side.y;
    const length = o.lure ? distance(pos, o.lure) : 0;
    const cranking = o.lureStage === LureStage.water && length < this.followedLine - 0.005;
    this.followedLine = length;
    // Vapa tarvitsee vain vieheen vaiheen ja siiman pituuden (kelan pyöritys ja kaari).
    const stage =
      o.lureStage === LureStage.none
        ? 'idle'
        : o.lureStage === LureStage.flight
          ? 'flight'
          : 'water';
    const state = { stage, lineLength: length, gear: 1 } as unknown as FishingState;
    const end = this.povRod.update(
      this.pov.camera,
      this.pov.pixelSize,
      pos,
      heading,
      tip,
      state,
      cranking,
      o.appearance.line,
      { fly: o.fly === true, pose },
    );
    remote.firstPerson = { id: o.id, tip: toWorld(end, end.h) };
  }

  private toggleEmoteMenu(): void {
    if (!this.emoteMenu) {
      this.emoteMenu = new EmoteMenu(this.hud.root);
      this.emoteMenu.onPick = (id) => this.emote(id);
    }
    this.emoteMenu.toggle();
    if (this.emoteMenu.open) this.emoteHold.opened(this.controls);
    this.sounds.preloadVoices(EMOTES);
  }

  /** Tekee käsimerkin: oma animaatio ja kupla, moninpelissä muille. */
  emote(id: EmoteId): void {
    if (!this.emoteLimiter.take(Date.now())) {
      this.hud.showMessage(t('emote.tooMany'), 2, 'info');
      return;
    }
    this.emoting = { id, start: performance.now() };
    this.showOwnBubble({ emote: id });
    this.sounds.voice(id);
    this.netWorld?.sendEmote(id);
  }

  /**
   * Toisen pelaajan repliikki: hiljenee etäisyyden mukaan (80 m:n päähän ei
   * kuulu) ja tulee kameran suunnasta katsottuna vasemmalta tai oikealta.
   */
  speakAt(id: VoiceId, speaker: string, at: Vec2): void {
    this.sounds.voiceAt(id, speaker, at);
  }

  /**
   * Kuulija äänten suuntaa varten (#411): kuuntelupaikka ja kameran oikea
   * suunta järvellä. Ylhäältä katsottuna oikea on ruudun oikea laita, POV:ssa
   * kalastajan oikea käsi.
   */
  get listener(): Listener {
    const e = this.camera.matrixWorld.elements;
    const len = Math.hypot(e[0]!, e[2]!);
    const right = len > 1e-6 ? { x: e[0]! / len, y: -e[2]! / len } : { x: 1, y: 0 };
    return { ear: this.ear, right };
  }

  /** Kuuntelupaikka: katsoja kuulee kameran kohdalta, pelaaja oman renkaansa kohdalta. */
  get ear(): Vec2 {
    const cam = this.camera.position;
    return this.spectating ? { x: cam.x, y: -cam.z } : this.tube.pos;
  }

  get emoteActive(): boolean {
    return this.emoting !== null && performance.now() - this.emoting.start < EMOTE_DURATION * 1000;
  }

  showOwnBubble(content: BubbleContent): void {
    this.ownBubble ??= new SpeechBubble(this.hud.root);
    this.ownBubble.show(content);
  }

  /** Oma kupla renkaan yllä ylhäältä ja takaa katsottuna (kalastajan silmin ei omaa kuplaa). */
  private placeOwnBubble(): void {
    const bubble = this.ownBubble;
    if (!bubble) return;
    const canvas = (this.gameCanvas ??=
      document.querySelector<HTMLCanvasElement>('canvas.game-canvas'));
    if (this.viewMode === 'pov' || !canvas || this.spectating) {
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

  /**
   * Ottaa jaetun maailman tähän kohtaukseen. Valikon tausta ja kisa käyttävät
   * samoja verkkoja, joten ne siirretään sille, joka piirtää.
   */
  private attachWorld(): void {
    if (this.world.pov.parent === this.scenery) return;
    this.scenery.add(this.world.pov);
    this.mapOverlay.add(this.world.top);
    this.scene.add(this.world.always);
  }

  /**
   * Varjostimet valmiiksi (#327). Kaukosumu on jälkikäsittelyssä, joten
   * molemmat näkymät käyttävät samoja varjostimia.
   */
  precompile(retro: RetroRenderer): Promise<unknown> {
    this.attachWorld();
    return retro.precompile([this.scene], this.camera);
  }

  /** Vapauttaa GPU-resurssit, kun kierros päättyy. */
  dispose(): void {
    // Jaettu maisema jää valikon taustaksi: näköyhteys ei saa jäädä päälle.
    setSightLine(null);
    this.emoteMenu?.dispose();
    this.lurePicker.dispose();
    this.ownBubble?.remove();
    this.boatsView.dispose();
    this.net?.dispose();
    this.soloBots?.dispose();
    // Jaettu maailma, vesimaski ja syvyystekstuuri jäävät seuraavalle pelille.
    if (this.world.pov.parent === this.scenery)
      for (const g of [this.world.pov, this.world.top, this.world.always]) g.removeFromParent();
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
    this.attachWorld();
    const a = this.prevTube;
    const b = this.tube;
    const w = this.netWorld;
    const craft = this.craft;
    const offset = w?.renderOffset ?? { x: 0, y: 0 };
    let pos = {
      x: a.pos.x + (b.pos.x - a.pos.x) * alpha + offset.x,
      y: a.pos.y + (b.pos.y - a.pos.y) * alpha + offset.y,
    };
    // Veneen suunta; soutajan katse voi olla käännetty tuhdolla (`look`).
    const hull = lerpAngle(a.heading, b.heading, alpha);
    const look = this.rower ? lerpAngle(craft.prevLook, craft.seat.look, alpha) : 0;
    let heading = hull + look;
    // Trombin mukana rengas lentää kieppuen kaarena perille.
    const air = this.weather.flight ? this.weather.flightNow() : null;
    if (air) {
      pos = air.pos;
      heading += air.spin;
    }
    const seated = this.inBoat ? SEATED_LIFT : 0;
    setSeated(this.tubeMesh, this.inBoat);
    // Maalla (#457) kalastaja seisoo ja rengas on maassa tai vyötäröllä.
    const shore = this.spectating ? undefined : b.shore;
    const pov = this.viewMode === 'pov';
    // Järven tasolla (silmin tai takaa, #691) maasto ja perspektiivi ovat käytössä.
    const lake = lakeLevel(this.viewMode);
    // Seisojan jalkojen korkeus: maasto, laiturin kannella kansi (#457).
    // Ylhäältä Retron maa on litteä karttapohja; ilmeen oma maasto (#650)
    // näkyy ylhäältäkin, joten seisoja on silloin sen pinnalla.
    const ground = this.world.ground;
    const groundAt = (p: Vec2) =>
      !lake && !ground.overlay
        ? 0
        : this.water.onPier(p)
          ? Math.max(PIER_DECK, ground.surfaceAt(p))
          : ground.surfaceAt(p);
    // Täyttökisan vene rannalla (#458): oma kalastaja äyskäröi laidan vieressä.
    const bailing = this.spectating ? null : this.ownBailPose(pos, hull);
    if (bailing) {
      this.ashoreFigure.updateBailer(bailing, groundAt);
      this.ashoreFigure.showAngler(!pov);
    } else if (shore) {
      this.ashoreFigure.update({ pos, heading, step: b.kickPhase, shore }, groundAt);
      // Omin silmin oma vartalo ei näy, rengas maassa ja kädessä näkyy.
      this.ashoreFigure.showAngler(!pov || shore.board !== undefined);
    } else this.ashoreFigure.hide();
    const standing = !!shore || !!bailing;
    // Katsoja seuraa kalastajaa tämän silmin (#564): tämän vapa ja rengas.
    const eyes = pov && this.spectating ? this.followedOnLake() : null;
    this.tubeMesh.visible = !pov && !this.spectating && !standing;
    this.povRod.group.visible = (pov && !this.spectating && !standing) || eyes !== null;
    // Paikanvaihdossa (#357) hahmo liukuu uudelle paikalle ja vene keinahtaa.
    const now = performance.now() / 1000;
    const boatNo = w && !this.spectating ? w.boat : 0;
    const body = w ? this.seatSlides.place('', boatNo, w.seat, pos, now) : pos;
    const rock = this.seatSlides.rock(boatNo, now);
    this.tubeMesh.position.copy(toWorld(body, (air?.height ?? 0) + seated));
    this.tubeMesh.rotation.y = heading;
    const roll = this.capsizeRoll();
    this.tubeMesh.rotation.x = air ? air.tumble : roll + rock;
    // Ylhäältä katsottuna korkealla lentävä rengas näkyy isompana, ja sen
    // varjo vedessä pienenee korkeuden mukana.
    this.tubeMesh.scale.setScalar(1 + (air?.height ?? 0) / 14);
    animateFins(this.tubeMesh, b.kickPhase);
    const emoteAge = this.emoting ? (performance.now() - this.emoting.start) / 1000 : Infinity;
    if (emoteAge > EMOTE_DURATION) this.emoting = null;
    animateEmote(this.tubeMesh, this.emoting?.id ?? null, emoteAge);
    // Vavan liike (nosto, taipuma); siima lähtee piirretyn vavan kärjestä.
    const rodPose = this.angler.rodPose();
    const flyCast = this.fishing.stage === 'casting' ? this.fishing.flyCast : null;
    let rodEnd: LinePoint | null = null;
    setFlyRod(this.tubeMesh, isFly(this.fishing.tackle));
    if (this.viewMode !== 'pov' && !standing)
      rodEnd = lakePoint(
        aimRod(
          this.tubeMesh,
          // Ylhäältä perhovapa heiluu heitossa kuten kalastajan silmin.
          flyCast ? { ...REST_POSE, lift: flyRodAngle(flyCast.rod) - flyRodAngle(1) } : rodPose,
          this.rodEnd,
        ),
      );
    this.view.apply();
    this.weather.render(pos, air);
    // Ohjaajan yleiskuvassa (#564) ei ole seurattavaa, joten merkkiä ei näytetä.
    const marked = this.viewMode === 'top' && this.shot?.view !== 'overview';
    this.youMarker.update(pos, heading, this.view.metersPerPixel, marked);
    this.hud.compass.update(heading);
    if (this.viewMode === 'pov') {
      const sway = this.weather.rock;
      // Kumossa kamera kallistuu ja painuu veden rajaan.
      this.pov.apply(
        bailing?.pos ?? body,
        bailing?.heading ?? heading,
        b.kickPhase,
        air
          ? // Ilmassa katse painuu alas järvelle.
            {
              lift: air.height,
              roll: air.tumble * 0.4,
              pitch: -0.6 * (air.height / SPOUT.flightHeight),
            }
          : bailing
            ? // Äyskäröidessä (#458) katse alas veneeseen.
              {
                lift: wadeGround(groundAt(bailing.pos)) + STANDING_EYE - EYE_HEIGHT,
                roll: 0,
                pitch: -0.45,
              }
            : shore
              ? // Maalla silmä on seisovan korkeudella maaston päällä; hypätessä painuu istumaan.
                {
                  lift:
                    (Math.max(0, groundAt(pos)) + STANDING_EYE - EYE_HEIGHT) *
                    (1 - (shore.board ?? 0)),
                  roll: 0,
                  // Pumpatessa (#458) katse alas renkaaseen ja pumppuun.
                  pitch: shore.inflate ? -0.7 : -0.15,
                }
              : {
                  lift: sway.lift - 0.7 * (roll / Math.PI) + seated,
                  roll: sway.roll + roll * 0.3 + rock,
                  pitch: sway.pitch,
                },
      );
      if (eyes) this.followedPov(eyes, pos, heading);
      else this.updatePovTube(body, heading, roll, air !== null || standing);
      // Vapa oikeasta kädestä kärkeen; kärki on siiman alkupiste.
      const side = rodSideOffset(heading);
      // Perhoheitossa vapa heiluu taakse ja eteen (#235).
      const swing = flyCast ? flyRodTip(flyCast.rod) : null;
      const tip = swing
        ? {
            x: pos.x + Math.cos(heading) * swing.forward,
            y: pos.y + Math.sin(heading) * swing.forward,
          }
        : rodTip(pos, heading);
      tip.x += side.x;
      tip.y += side.y;
      if (!standing && !this.spectating)
        rodEnd = this.povRod.update(
          this.pov.camera,
          this.pov.pixelSize,
          pos,
          heading,
          tip,
          this.fishing,
          this.angler.cranking,
          this.fishingView.shownLineColor,
          {
            tipY: swing?.height,
            fly: isFly(this.fishing.tackle),
            bend: this.angler.flyRodBend(flyCast),
            pose: rodPose,
          },
        );
      // Perhon löysä siima riippuu kelalta ja siimakädeltä renkaan tasolle.
      if (!eyes) this.povTube.hangSlack(standing || this.spectating ? null : this.povRod.slackEnds);
      this.weather.follow(this.pov.camera.position);
    } else if (this.viewMode === 'chase') {
      // Takaa (#691): kamera kiertää kalastajaa, joka piirretään samoilla
      // malleilla kuin ylhäältä. Aalto nostaa kohdetta, ei kallista kuvaa.
      const at = bailing?.pos ?? body;
      const orbit = this.chase.view;
      const height = air
        ? air.height
        : standing
          ? Math.max(0, groundAt(at))
          : this.weather.rock.lift + seated;
      this.pov.applyOrbit(
        at,
        height + CHASE.lookHeight,
        (bailing?.heading ?? heading) + orbit.yaw,
        { ...chaseArc(orbit.tilt), lookAhead: CHASE.lookAhead, clearance: CHASE.clearance },
        groundAt,
      );
      this.weather.follow(this.pov.camera.position);
      // Kameran ja kalastajan väliin jäävät puut ja kaislat jätetään piirtämättä.
      setSightLine(this.pov.camera.position, toWorld(at, 0));
    }
    if (this.viewMode !== 'chase') setSightLine(null);
    const hooked = this.fish.fish.find((x) => x.id === this.fishing.hookedId) ?? null;
    this.fishingView.metersPerPixel = this.view.metersPerPixel;
    this.fishingView.povPixel = this.pov.pixelSize;
    this.fishingView.difficulty = this.difficulty;
    this.fishingView.ashore = this.craft.ashore;
    // Lähin viehettä seuraava kala näkyy pyörteinä vieheen takana.
    const lure = this.fishing.lure;
    let follower: Fish | null = null;
    for (const f of this.fish.fish)
      if (
        f.mode === 'follow' &&
        distance(f.pos, lure) < FOLLOW_SIGN_RANGE &&
        (!follower || distance(f.pos, lure) < distance(follower.pos, lure))
      )
        follower = f;
    this.fishingView.follower = follower?.pos ?? null;
    this.fishingView.update(
      this.fishing,
      this.angler.context(),
      this.angler.aim,
      1 / 60,
      hooked,
      rodEnd,
    );
    this.weather.shakeCamera(this.camera);
    this.birds.render(this.camera, lake, lake ? this.pov.pixelSize : this.view.metersPerPixel);
    // Täyttökisan vene rannalla (#458) lepää maan pinnalla.
    this.boatsView.heightAt = groundAt;
    this.boatsView.water = this.water;
    // Oma vene sellaisena kuin se nyt piirretään: kyytiläiset istuvat siinä.
    const own = this.spectating
      ? undefined
      : { pos, heading: hull + (air?.spin ?? 0), kickPhase: b.kickPhase, roll };
    if (!this.net)
      this.boatsView.update(
        this.inBoat
          ? [
              {
                boat: 1,
                ...own!,
                color: this.appearance.tube,
                lift: air?.height,
                tumble: air?.tumble,
                anchor: this.tube.anchor,
                ...(this.tube.launch && { launch: this.tube.launch }),
              },
            ]
          : [],
      );
    // Ankkuriköydet: oma alus (kyydissä vene on soutajan) ja muut.
    const anchored: AnchoredCraft[] = [];
    if (own && b.anchor && !air && !w?.passenger)
      anchored.push({ pos, heading: hull, boat: this.inBoat, anchor: b.anchor });
    if (this.net) {
      this.boatsView.update(
        this.net.world.boats(own).map((b) => ({
          ...b,
          roll: (b.roll ?? 0) + this.seatSlides.rock(b.boat, now),
        })),
      );
      const others = this.net.world.others(own);
      for (const o of others)
        if (o.anchor && o.seat === BoatSeat.rower)
          anchored.push({ pos: o.pos, heading: o.heading, boat: o.boat > 0, anchor: o.anchor });
      // Katsojan silmin seurattavan oma rengas ei peitä näkymää: se piirretään
      // silmin (followedPov), ja siima lähtee sen vavasta (#564).
      if (!eyes) this.net.remoteView.firstPerson = null;
      // Maalla seisova tai lentävä seurattava piilotetaan silmin-kuvasta kuten ennen.
      const hidden = this.spectating && pov && !eyes ? this.net.followed : null;
      const shown = others
        .filter((o) => o.id !== hidden)
        .map((o) => ({
          ...o,
          pos: this.seatSlides.place(o.id, o.boat, o.seat, o.pos, now),
          roll: o.roll + this.seatSlides.rock(o.boat, now),
        }));
      const remote = this.net.remoteView;
      remote.pov = lake;
      remote.heightAt = groundAt;
      remote.pixel = remote.pov ? this.pov.pixelSize : this.view.metersPerPixel;
      remote.update(shown, this.camera, this.net.link.canvas, this.tube.pos);
    }
    const bots = this.soloBots;
    if (bots) {
      const remote = bots.remoteView;
      remote.pov = lake;
      remote.heightAt = groundAt;
      remote.pixel = remote.pov ? this.pov.pixelSize : this.view.metersPerPixel;
      remote.update(bots.others(), this.camera, this.stage!.canvas, this.tube.pos);
    }
    this.anchorView.update(anchored);
    this.placeOwnBubble();
  }
}
