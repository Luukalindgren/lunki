import * as THREE from 'three';
import {
  breakingStrength,
  isFly,
  LUNKINJARVI,
  WaterBody,
  BoatSeat,
  createTube,
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
  lerpAngle,
  rodTip,
  ChatLimiter,
  EMOTE_DURATION,
  EMOTE_RATE,
  EMOTES,
  distance,
  type EmoteId,
  type CompetitionSettings,
  type LakeBottom,
  type CompetitionState,
  type Fish,
  type FishPopulation,
  type FishingState,
  type Penalty,
  type SpoutFlight,
  type LakeMap,
  type RecordEntry,
  type Tackle,
  type Appearance,
  type Vec2,
  type TubeState,
  RaceStatsCounter,
  type RaceStats,
} from '@lunki/shared';
import type { Input } from '../engine/input';
import { Controls, controlText } from './controls';
import { createBottomMesh } from '../world/bottomMesh';
import { FishShadow } from '../world/fishShadow';
import { FishSignsView } from './fishSignsView';
import { staticWorldFor, type StaticWorld } from '../world/staticWorld';
import type { RetroResolution } from '../engine/resolution';
import type { RetroRenderer } from '../engine/retroRenderer';
import { PovCamera } from './povCamera';
import { createLakeMesh, createWaterWaves, toWorld, waterTime } from '../world/lakeMesh';
import { capsizeRoll, type NetWorld } from '../net/netWorld';
import type { Sfx } from '../audio/sfx';
import { Sounds } from '../audio/sounds';
import type { VoiceId } from '../audio/voice';
import type { Hud } from '../ui/hud';
import { FishingView } from './fishingView';
import { rodSideOffset, type LinePoint } from './lineHang';
import { PovRod, flyRodAngle, flyRodTip } from './povRod';
import { REST_POSE, lakePoint } from './rodMotion';
import { PovTube } from './povTube';
import { loadAppearance } from './appearance';
import { loadTackle } from './tackle';
import { TopDownCamera } from './topDownCamera';
import {
  SEATED_LIFT,
  aimRod,
  animateEmote,
  animateFins,
  createTubeMesh,
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
  viewMode: 'top' | 'pov' = 'top';
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
  readonly fishSigns = new FishSignsView((event, at) =>
    this.sounds.playAt(event, at, this.tube.pos),
  );
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
  private povTubeTime = performance.now();

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
    }
    this.prevTube = this.tube;

    this.scene.background = new THREE.Color(LAND_COLOR);
    this.weather = new WeatherController(this, this.scene, this.waterWaves, seed);
    this.scene.add(...this.weather.groups);
    const lake = createLakeMesh(map, this.waterWaves);
    this.topViewOnly = lake.children.filter((c) => c.name === 'reeds' || c.name === 'island');
    this.scene.add(lake);
    const { swellPatch, flightShadow } = this.weather.waterParts;
    this.scene.add(swellPatch);
    this.weather.updateSky(0);
    this.weather.applyLight();
    this.scene.add(createBottomMesh(this.bottom, this.waterWaves));
    this.scene.add(this.fishShadow.mesh, this.fishSigns.group);
    this.scene.add(this.tubeMesh, this.boatsView.group, this.anchorView.group);
    this.scene.add(flightShadow);
    this.world = staticWorldFor(map);
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

  /** Moninpelin maailma; yksinpelissä undefined. */
  readonly netWorld: NetWorld | undefined;

  /** Tuuli nyt (m/s); kisan päätyttyä tyyntä. */
  get wind(): Vec2 {
    return this.weather.wind;
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
    return this.viewMode === 'pov' ? this.pov.camera : this.view.camera;
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
  setViewMode(mode: 'top' | 'pov', announce = true): void {
    this.viewMode = mode;
    const pov = mode === 'pov';
    this.scenery.visible = pov;
    this.mapOverlay.visible = !pov;
    this.povRod.group.visible = pov && !this.spectating;
    this.povTube.group.visible = pov && !this.spectating;
    this.tubeMesh.visible = !pov && !this.spectating;
    for (const o of this.topViewOnly) o.visible = !pov;
    this.weather.setPov(pov);
    this.fishingView.pov = pov;
    this.waterWaves.uPov.value = pov ? 1 : 0;
    if (announce)
      this.hud.showMessage(controlText(pov ? 'game.viewPov' : 'game.viewTop'), 1.2, 'info');
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
  punish(penalty: Penalty, label: string): string {
    this.resetFishing();
    this.sounds.play('penalty');
    return this.penalties.punish(penalty, label);
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

  get inBoat(): boolean {
    return this.craft.inBoat;
  }

  get rower(): boolean {
    return this.craft.rower;
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
    return this.net?.tangled ?? false;
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
    if (input.wheel !== 0) this.view.zoom(input.wheel);
    if (c.wasPressed('help')) this.hud.toggleHelp();
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
    if (c.wasPressed('view')) this.setViewMode(this.viewMode === 'top' ? 'pov' : 'top');
    if (c.wasPressed('emote') && !this.spectating) this.toggleEmoteMenu();
    this.emoteHold.step(c);
    this.lurePicker.step(dt);
    this.weather.step(dt);
    const timeOut = this.penalties.timeOutLeft;
    const capsized = this.penalties.capsizeLeft > 0;
    const reelHeld = c.isDown('pointer') || c.isDown('reel');
    const tangle = net ? net.updateTangle(c.wasPressed('cut')) : null;
    if (!frozen) this.logRace();

    this.craft.step(dt, { frozen, capsized, reelHeld });
    const f = this.fishing;
    const { lineHand } = this.angler.step(dt, {
      frozen,
      capsized,
      timeOut,
      tangled: !!tangle,
      reelHeld,
    });
    const lureOut = f.stage === 'flight' || f.stage === 'water';

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
      presenter.showSpectator(net!.followed);
      presenter.updateTimer();
      this.weather.update(dt);
      presenter.updateRaceHud();
      this.hud.update(dt);
      return;
    }
    presenter.show(dt, { tangle, lineHand, lureOut });
    presenter.updateTimer();
    this.weather.update(dt);
    this.sounds.ambience(dt, {
      ...this.weather.now,
      ...this.daylight,
      spout: this.weather.spoutNear,
    });
    this.craft.paddleSounds();
    if (net) presenter.updateRaceHud();
    else presenter.showSoloCatches();
    this.hud.update(dt);
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
    return this.weather.sky.grade;
  }

  /** Tulossivun kartta: reitit kerran sekunnissa ja moninpelin sotkut. */
  private logRace(): void {
    this.raceStatsCounter.move(this.tube.pos, this.competition.elapsed);
    if (this.net) return this.net.logRace();
    this.raceLog.sample(this.competition.elapsed, [
      { id: SOLO_ID, name: t('common.youCapital'), pos: this.tube.pos },
    ]);
  }

  /** Kisan omat tilastot tulossivulle (#367). */
  raceStats(): RaceStats {
    return this.raceStatsCounter.stats;
  }

  /**
   * Kisan kulku tulossivun karttaan. Saaliista näytetään vain ne, jotka
   * lopulta jäivät voimaan (jäähyssä menetetyt pois).
   */
  raceMap(): RaceMapData {
    const d = this.raceLog.data();
    const kept = this.netWorld
      ? this.netWorld.results().flatMap((r) => r.catches.map((c) => ({ ...c, id: r.name })))
      : this.competition.catches.map((c) => ({ ...c, id: SOLO_ID }));
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
    const ear = this.ear;
    const local = toWorld(at, 1).applyMatrix4(this.camera.matrixWorldInverse);
    const side = local.x / Math.max(4, Math.hypot(local.x, local.z));
    this.sounds.voiceAt(id, speaker, distance(at, ear), side * 0.8);
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
   * Varjostimet valmiiksi molempiin näkymiin: kalastajan silmin -näkymän sumu
   * vaihtaa varjostimet, joten kohtaus käännetään sumulla ja ilman (#327).
   */
  precompile(retro: RetroRenderer): Promise<unknown> {
    this.attachWorld();
    const fog = this.scene.fog;
    const done = retro.precompile([this.scene], this.camera);
    this.scene.fog = fog ? null : new THREE.Fog(this.weather.sky.lighting.horizon, 500, 2600);
    const other = retro.precompile([this.scene], this.camera);
    this.scene.fog = fog;
    return Promise.all([done, other]);
  }

  /** Vapauttaa GPU-resurssit, kun kierros päättyy. */
  dispose(): void {
    this.emoteMenu?.dispose();
    this.lurePicker.dispose();
    this.ownBubble?.remove();
    this.boatsView.dispose();
    this.net?.dispose();
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
    if (this.viewMode !== 'pov')
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
    this.youMarker.update(pos, heading, this.view.metersPerPixel, this.viewMode === 'top');
    this.hud.compass.update(heading);
    if (this.viewMode === 'pov') {
      const sway = this.weather.rock;
      // Kumossa kamera kallistuu ja painuu veden rajaan.
      this.pov.apply(
        body,
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
              lift: sway.lift - 0.7 * (roll / Math.PI) + seated,
              roll: sway.roll + roll * 0.3 + rock,
              pitch: sway.pitch,
            },
      );
      this.updatePovTube(body, heading, roll, air !== null);
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
      this.weather.follow(this.pov.camera.position);
    }
    const hooked = this.fish.fish.find((x) => x.id === this.fishing.hookedId) ?? null;
    this.fishingView.metersPerPixel = this.view.metersPerPixel;
    this.fishingView.povPixel = this.pov.pixelSize;
    this.fishingView.difficulty = this.difficulty;
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
      // Katsojan silmin seurattavan oma rengas ei peitä näkymää.
      const shown = (
        this.spectating && this.viewMode === 'pov'
          ? others.filter((o) => o.id !== this.net!.followed)
          : others
      ).map((o) => ({
        ...o,
        pos: this.seatSlides.place(o.id, o.boat, o.seat, o.pos, now),
        roll: o.roll + this.seatSlides.rock(o.boat, now),
      }));
      const remote = this.net.remoteView;
      remote.pov = this.viewMode === 'pov';
      remote.pixel = remote.pov ? this.pov.pixelSize : this.view.metersPerPixel;
      remote.difficulty = this.difficulty;
      remote.update(shown, this.camera, this.net.link.canvas, this.tube.pos);
    }
    this.anchorView.update(anchored);
    this.placeOwnBubble();
  }
}
