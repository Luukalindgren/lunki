import * as THREE from 'three';
import {
  breakingStrength,
  LUNKINJARVI,
  LURES,
  SPECIES,
  chargePower,
  describeTackle,
  WaterBody,
  collideTubeWithShore,
  createTube,
  findLaunchPoint,
  isValidStart,
  DIFFICULTIES,
  Rng,
  createCompetition,
  createFishPopulation,
  formatTime,
  planWeather,
  planLightning,
  penaltyOutcome,
  resolveStrike,
  distance,
  BIG_WAVE,
  bigWaveHeight,
  capsizes,
  planBigWaves,
  planWaterspouts,
  activeSpouts,
  spoutAffects,
  spoutCapture,
  spoutWind,
  LIGHTNING,
  SPOUT,
  OUT_OF_RACE,
  windVector,
  waveLength,
  wavePeriod,
  SKY_NAMES,
  recordCatch,
  stepCompetition,
  timeLeft,
  createFishing,
  formatWeight,
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
  type CompetitionSettings,
  type LakeBottom,
  type CompetitionState,
  type FishPopulation,
  type FishingContext,
  type FishingState,
  type PlayerResult,
  type Penalty,
  type Strike,
  type BigWave,
  type Waterspout,
  type UntangledMessage,
  type RecordMessage,
  removeCaughtFish,
  type LakeMap,
  type Tackle,
  type Vec2,
  type TubeInput,
  type TubeState,
} from '@lunki/shared';
import type { Input } from '../engine/input';
import { createBottomMesh } from '../world/bottomMesh';
import { createShoreScenery } from '../world/shoreScenery';
import { createMapOverlay, createTerrainMesh } from '../world/surroundingsMesh';
import type { RetroResolution } from '../engine/resolution';
import { PovCamera } from './povCamera';
import { LightningView } from './lightningView';
import { BigWaveView } from './bigWaveView';
import { SpoutView } from './spoutView';
import { KnotView } from './knotView';
import { createLakeMesh, createWaterWaves, toWorld, waterTime } from '../world/lakeMesh';
import { WAVE_FACTOR_SCALE, WaveField } from '../world/waveField';
import { createBuildings, createPiers } from '../world/buildings';
import { createVegetation } from '../world/vegetation';
import { WeatherView, compassIn, windFrom, windName } from './weatherView';
import type { NetWorld } from '../net/netWorld';
import { RemotePlayersView } from './remotePlayersView';
import type { Sfx } from '../audio/sfx';
import type { Hud } from '../ui/hud';
import { FishingView } from './fishingView';
import { ROD_TIP_Y, rodSideOffset } from './lineHang';
import { loadTackle, nextLure, saveTackle } from './tackle';
import { TopDownCamera } from './topDownCamera';
import { QuietSpot } from './quietSpot';
import { animateFins, createTubeMesh } from './tubeMesh';
import { YouMarker } from './youMarker';
import { loadAppearance } from './appearance';
import { bottomFor } from '../world/lakeData';

/** Kalojen määrä järvessä. Saatujen tilalle syntyy uusia. */
const FISH_COUNT = 1800;
const LAND_COLOR = 0x24502c;
/** Tyypillinen pyyhkäisymatka aallon jaksoon (m). */
const TYPICAL_FETCH = 800;
const SKY_COLOR = 0x83c2db;
/** Taivas pilvistyy palettisävyinä portaittain: [tummuus vähintään, väri]. */
const CLOUDY_SKIES: [number, number][] = [
  [0.65, 0x39424d],
  [0.45, 0x5f6b78],
  [0.2, 0x8e99a4],
  [0, SKY_COLOR],
];

/** Näppäinasettelu: WASD tai nuolet. */
export function readTubeInput(input: Input): TubeInput {
  const down = (...codes: string[]) => codes.some((c) => input.isDown(c));
  return {
    kick: (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0),
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
  private readonly povRod: THREE.Line;
  readonly water: WaterBody;
  readonly bottom: LakeBottom;
  tube: TubeState;
  private prevTube: TubeState;
  /** Omat värit valitaan ennen kisaa (yksinpelin asetukset tai aula). */
  private readonly appearance = loadAppearance();
  private readonly tubeMesh = createTubeMesh(this.appearance);
  /** Oma sijainti kauas loitonnettaessa. */
  private readonly youMarker = new YouMarker();
  readonly fishing: FishingState = createFishing(loadTackle());
  /** Vaihdettavat varusteet: otetaan käyttöön, kun viehe on kelalla. */
  private pendingTackle: Tackle | null = null;
  private readonly fishingView = new FishingView();
  /** Vinkkaa paikan vaihdosta, kun heitot menevät tyhjiin. */
  private readonly quietSpot = new QuietSpot();
  /** Hiiren osoittama piste maailmassa. */
  aim: Vec2 = { x: 0, y: 0 };
  readonly rng: Rng;
  readonly fish: FishPopulation;
  readonly competition: CompetitionState;
  private reelClickTimer = 0;
  /** Potkuvaiheen puolikas edellisellä päivityksellä (räpylöiden äänet). */
  private strokes = 0;
  /** Kutsutaan, kun kilpailuaika loppuu. */
  onFinished: (() => void) | null = null;
  private readonly remoteView: RemotePlayersView | null = null;
  private readonly hemi = new THREE.HemisphereLight(0xeef2f3, 0x24502c, 1.5);
  private readonly sun = new THREE.DirectionalLight(0xfff3b0, 1.5);
  readonly weather: WeatherView;
  readonly waves: WaveField;
  private readonly waterWaves = createWaterWaves();
  private readonly lightning = new LightningView();
  /** Yksinpelin salamat (moninpelissä palvelin ilmoittaa iskut). */
  private readonly strikes: Strike[];
  private nextStrike = 0;
  /** Yksinpelin salaman jäähy (kisa-aika, s). */
  private outUntil = 0;
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
  /** Aaltojen näkyvä aaltoluku (rad/m) ja kulmataajuus (rad/s). */
  private waveK = 1;
  private waveOmega = 1;

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
    this.competition = createCompetition(settings);
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
    if (net) {
      // Palvelin arpoi aloituspaikan.
      this.tube = net.world.predictor.tube;
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
    this.sun.position.set(-50, 100, -30);
    this.scene.add(this.sun);
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
    this.scene.add(createLakeMesh(map, this.waterWaves));
    this.scene.add(createBottomMesh(this.bottom));
    this.scene.add(this.tubeMesh);
    const surroundings = map === LUNKINJARVI ? LUNKINJARVI_SURROUNDINGS : undefined;
    this.scenery.add(createShoreScenery(map, surroundings));
    this.scenery.add(createVegetation(map, surroundings));
    if (surroundings) {
      const terrain = createTerrainMesh(map, surroundings);
      if (terrain) this.scenery.add(terrain);
      const buildings = createBuildings(surroundings);
      if (buildings) this.scenery.add(buildings);
      const piers = createPiers(map.piers ?? []);
      if (piers) this.scene.add(piers);
      this.mapOverlay.add(createMapOverlay(surroundings));
    }
    this.scenery.visible = false;
    this.scene.add(this.scenery, this.mapOverlay);
    this.povRod = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xf6d04d }),
    );
    this.povRod.visible = false;
    this.povRod.frustumCulled = false;
    this.scene.add(this.povRod);
    this.fishingView.lineColor = this.appearance.line;
    this.scene.add(this.fishingView.group, this.youMarker.group);
    this.view.snapTo(this.tube.pos);
    hud.setCountdown(null);
    if (net) {
      this.remoteView = new RemotePlayersView(net.overlay);
      this.scene.add(this.remoteView.group);
      net.world.onPeerConnection = (name, connected) =>
        this.hud.showMessage(
          connected ? `${name} palasi kisaan` : `${name}: yhteys katkesi, odotetaan…`,
          3,
        );
      net.world.onPeerLeft = (name) => this.hud.showMessage(`${name} poistui kisasta`, 3);
      net.world.onCatchRejected = () =>
        this.hud.showMessage('Palvelin ei hyväksynyt saalista punnitukseen', 2.5);
      net.world.onLightning = (m) =>
        this.onStrike({ x: m.x, y: m.y }, m.victims.includes(net.world.myId));
      net.world.onBigWave = (m) => {
        if (m.victims.includes(net.world.myId)) this.onCapsize('wave');
      };
      net.world.onUntangled = (m) => this.onUntangled(m, net.world.myId);
      net.world.onRecord = (m) => this.onRecord(m, net.world.myId);
      net.world.onRemoteCatch = (tag, angler) => {
        const world = {
          isWater: (p: Vec2) => this.water.isWater(p),
          depthAt: (p: Vec2) => this.bottom.depthAt(p),
        };
        if (removeCaughtFish(this.fishing, this.fish, tag, world, this.rng))
          this.hud.showMessage(`${angler} ehti nostaa saman kalan – se karkasi sinulta`, 3);
      };
      net.world.onSpout = (m) => {
        if (m.victims.includes(net.world.myId)) this.onCapsize('spout');
      };
      net.world.onCastRejected = () => {
        resetFishing(this.fishing);
        this.hud.showMessage('Palvelin hylkäsi heiton', 2);
      };
    }
  }

  private fishingContext(strike?: number): FishingContext {
    return {
      tubePos: this.tube.pos,
      heading: this.tube.heading,
      isWater: (p) => this.water.isWater(p),
      depthAt: (p) => this.bottom.depthAt(p),
      structureAt: (p) => this.bottom.structureAt(p),
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
    this.view.setResolution(r);
    this.pov.setResolution(r);
  }

  setViewMode(mode: 'top' | 'pov'): void {
    this.viewMode = mode;
    const pov = mode === 'pov';
    this.scenery.visible = pov;
    this.mapOverlay.visible = !pov;
    this.povRod.visible = pov;
    this.tubeMesh.visible = !pov;
    this.scene.background = new THREE.Color(pov ? SKY_COLOR : LAND_COLOR);
    this.scene.fog = pov ? new THREE.Fog(SKY_COLOR, 500, 2600) : null;
    this.applyWeatherLight();
    this.fishingView.pov = pov;
    this.hud.showMessage(pov ? 'Kalastajan silmin (V)' : 'Ylhäältä (V)', 1.2);
  }

  /** Vaihtaa varusteet heti, tai kun viehe seuraavan kerran on kelalla. */
  setTackle(t: Tackle): void {
    this.pendingTackle = { ...t };
    const f = this.fishing.stage;
    if (f !== 'idle' && f !== 'charging')
      this.hud.showMessage(`${LURES[t.lure].name} vaihtuu, kun viehe on kelalla`, 1.5);
  }

  /** Varusteet sellaisina kuin ne ovat seuraavassa heitossa. */
  get tackle(): Tackle {
    return this.pendingTackle ?? this.fishing.tackle;
  }

  get difficulty() {
    return this.settings.difficulty;
  }

  /** Rangaistus omasta osumasta. Moninpelissä palvelin pitää jäähyn ja saaliit. */
  private punish(penalty: Penalty): string {
    resetFishing(this.fishing);
    this.sfx.lost();
    const outcome = penaltyOutcome(penalty, this.competition.elapsed);
    if (!this.net) this.outUntil = Math.max(this.outUntil, outcome.outUntil);
    if (outcome.loseCatch) this.competition.catches.length = 0;
    return {
      none: '',
      'time-out': `Jäähy ${LIGHTNING.timeOut} s`,
      'lose-catch': 'Menetit saaliisi',
      out: 'Putosit kisasta',
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
        this.hud.showMessage('Trombi järvellä! Pysy kaukana siitä', 3);
        this.sfx.rumble();
      }
    }
    if (!this.net && spoutAffects(this.capsizedUntil, now)) {
      const fling = spoutCapture(this.spouts, now, this.tube.pos);
      if (fling) {
        this.tube = { ...this.tube, vel: fling };
        this.capsizedUntil = now + BIG_WAVE.recover;
        this.onCapsize('spout');
      }
    }
    // Imualueella muistutetaan pakenemaan.
    this.spoutWarnTimer -= dt;
    const near = spots.some((p) => distance(p, this.tube.pos) < SPOUT.radius);
    if (near && this.capsizeLeft === 0 && this.spoutWarnTimer <= 0) {
      this.hud.showMessage('Trombi imee! Potki karkuun (Shift)', 2);
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
    const h = bigWaveHeight(this.rings, this.tube.pos, w.windSpeed, w.windDir);
    // Pientä aaltoa (suojaisessa poukamassa tai heikossa tuulessa) ei huomaa.
    const felt = h >= BIG_WAVE.capsizeHeight / 2;
    while (this.nextWave < this.bigWaves.length && this.bigWaves[this.nextWave]!.t <= now) {
      this.nextWave++;
      if (felt) this.sfx.wave();
      if (!this.net && this.capsizeLeft === 0 && capsizes(this.tube.heading, w.windDir, h)) {
        this.capsizedUntil = now + BIG_WAVE.recover;
        this.onCapsize('wave');
      }
    }
    const next = this.bigWaves[this.nextWave];
    const prev = this.bigWaves[this.nextWave - 1];
    // Harja näkyy tulossa olevasta aallosta tai juuri ohi menneestä.
    const until =
      next && next.t - now <= BIG_WAVE.warning ? next.t - now : prev ? prev.t - now : null;
    this.bigWaveView.update(felt ? until : null, w.windDir, this.tube.pos);
    if (!next || next.t - now > BIG_WAVE.warning || this.warnedWave === this.nextWave) return;
    this.warnedWave = this.nextWave;
    if (h >= BIG_WAVE.capsizeHeight)
      this.hud.showMessage(`Iso aalto ${windFrom(w.windDir)}! Käänny aaltoa kohti`, 3);
  }

  /** Lähimmän trombin etäisyys ja suunta säärivillä, esim. " · trombi 320 m lounaassa". */
  private spoutText(): string {
    const p = this.tube.pos;
    let best: Vec2 | null = null;
    for (const c of activeSpouts(this.spouts, this.competition.elapsed))
      if (!best || distance(c, p) < distance(best, p)) best = c;
    if (!best) return '';
    const d = Math.round(distance(best, p) / 10) * 10;
    return ` · trombi ${d} m ${compassIn(Math.atan2(best.y - p.y, best.x - p.x))}`;
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
      this.hud.showMessage(`Siimasi sotkeutui: ${tangle.with}! Kelaa selvittääksesi`, 3);
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
      resetFishing(this.fishing);
      this.hud.showMessage(
        hooked ? 'Sotku selvisi, mutta kala karkasi' : 'Sotku selvisi – siimat kelattu sisään',
        2.5,
      );
    } else if (m.by === me) {
      resetFishing(this.fishing);
      this.sfx.lost();
      this.hud.showMessage('Katkaisit siimasi', 2);
    } else {
      this.hud.showMessage(`${this.net!.world.playerName(m.by)} katkaisi siimansa – jatka`, 2.5);
    }
  }

  /** Saalis pääsi järven ennätyslistalle. */
  private onRecord(m: RecordMessage, me: string): void {
    const fish = `${SPECIES[m.species].name} ${formatWeight(m.weight)} (${m.player === me ? 'sinä' : m.angler})`;
    this.hud.showMessage(
      m.place === 1 ? `Järven ennätys! ${fish}` : `${fish} on järven ${m.place}. suurin`,
      3.5,
    );
  }

  /** Oma rengas kaatui ison aallon tai trombin takia. */
  private onCapsize(cause: 'wave' | 'spout'): void {
    this.capsizedAt = this.competition.elapsed;
    if (cause === 'spout') this.sfx.wave();
    const penalty = this.punish(this.settings.capsizePenalty ?? 'none');
    this.hud.showWeighIn(
      cause === 'wave' ? 'Kaaduit!' : 'Trombi kaatoi sinut!',
      penalty ||
        (cause === 'wave' ? 'Käänny aaltoa kohti, niin pysyt pystyssä' : 'Pysy kaukana trombista'),
      4,
    );
  }

  /** Jäähyä jäljellä (s); pudonneella Infinity. */
  private get timeOutLeft(): number {
    const until = this.net ? this.net.world.outUntil : this.outUntil;
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
    const d = distance(pos, this.tube.pos);
    this.lightning.strike(pos);
    this.hud.flash(d < 300 ? 0.8 : d < 1000 ? 0.5 : 0.3);
    this.sfx.thunder(d, d / LIGHTNING.soundSpeed);
    if (!hitMe) return;
    const penalty = this.punish(this.settings.lightningPenalty ?? 'none');
    this.hud.showWeighIn('Salama iski!', penalty || 'Siima paloi poikki – laske vapa ukkosella', 4);
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
    if (input.wasPressed('KeyV')) this.setViewMode(this.viewMode === 'top' ? 'pov' : 'top');
    if (input.wasPressed('KeyR'))
      this.setTackle(nextLure(this.pendingTackle ?? this.fishing.tackle));
    if (!this.net) this.strikeLightning();
    this.lightning.update(dt);
    this.updateBigWaves();
    this.updateSpouts(dt);
    const timeOut = this.timeOutLeft;
    const capsized = this.capsizeLeft > 0;
    const still = { kick: 0, turn: 0, sprint: false };
    const reelHeld = input.isDown('Mouse0') || input.isDown('Space');
    const tangle = this.updateTangle(input.wasPressed('KeyC'));

    this.prevTube = this.tube;
    if (this.net) {
      const f = this.fishing;
      const stage =
        f.hookedId !== null
          ? LureStage.hooked
          : f.stage === 'flight'
            ? LureStage.flight
            : f.stage === 'water'
              ? LureStage.water
              : LureStage.none;
      const tubeInput = frozen || capsized ? still : readTubeInput(input);
      this.tube = this.net.world.stepOwn(
        tubeInput,
        f.lure,
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

    const internal = this.screenToInternal(input.mouseX, input.mouseY);
    this.aim = (this.viewMode === 'pov' ? this.pov : this.view).internalToWorld(
      internal.x,
      internal.y,
    );
    const f = this.fishing;
    const lureOut = f.stage === 'flight' || f.stage === 'water';
    // Sotkussa vapa on kiinni: kelaaminen selvittää sotkua palvelimella.
    const reeling = !frozen && !tangle && lureOut && reelHeld;
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
    );
    const events: ReturnType<typeof stepFishing> = tangle
      ? {}
      : stepFishing(
          f,
          {
            aim: this.aim,
            castHeld: !frozen && !capsized && timeOut === 0 && input.isDown('Mouse0'),
            reel: reeling,
            cancel: input.isDown('Mouse2'),
            dragDelta: (input.wasPressed('KeyE') ? 1 : 0) - (input.wasPressed('KeyQ') ? 1 : 0),
            ...(input.wasPressed('Digit1') ? { gear: 0 } : {}),
            ...(input.wasPressed('Digit2') ? { gear: 1 } : {}),
            ...(input.wasPressed('Digit3') ? { gear: 2 } : {}),
            ...(this.pendingTackle ? { tackle: this.pendingTackle } : {}),
          },
          this.fishingContext(fishEvents.strike),
          dt,
        );
    this.handleEvents(events, fishEvents.follow !== undefined, reeling, dt);
    if (f.onLand && f.stage === 'water')
      this.hud.showMessage('Viehe rannalla – kelaa takaisin', 0.2);

    // Kamera: kun viehe on ulkona, seurataan renkaan ja vieheen väliä ja loitonnetaan tarvittaessa.
    if (lureOut) {
      const mid = { x: (this.tube.pos.x + f.lure.x) / 2, y: (this.tube.pos.y + f.lure.y) / 2 };
      this.view.follow(mid, dt, 2);
      this.view.fitSpan(
        Math.abs(f.lure.x - this.tube.pos.x) * 1.3 + 10,
        Math.abs(f.lure.y - this.tube.pos.y) * 1.3 + 10,
      );
    } else {
      this.view.follow(this.tube.pos, dt, 3);
      this.view.fitSpan(0, 0);
    }

    this.hud.setStamina(this.tube.stamina, STAMINA.tired);
    if (this.tube.stamina <= 0 && this.prevTube.stamina > 0)
      this.hud.showMessage('Puuskutat! Lepää hetki, niin jaksat taas', 2.5);
    this.hud.setPower(f.stage === 'charging' ? chargePower(f.charge) : null);
    this.hud.setTension(f.tension, f.drag, breakingStrength(f.tackle));
    this.hud.setStatus([
      ...(capsized ? [`Kumossa! Pystyyn ${Math.ceil(this.capsizeLeft)} s`] : []),
      ...(tangle
        ? [
            `Sotkussa: ${tangle.with} · ${Math.round(tangle.progress * 100)} %`,
            'Kelatkaa yhdessä · C katkaisee',
          ]
        : []),
      ...(timeOut === Infinity
        ? ['Salama pudotti sinut kisasta']
        : timeOut > 0
          ? [`Salaman jäähy ${Math.ceil(timeOut)} s`]
          : []),
      describeTackle(f.tackle),
      `Siimaa ${fi(f.lineLength, 1)} m`,
      `Jarru ${fi(f.drag, 2)} kg · kela ${f.gear + 1}`,
      `Viehe ${fi(f.stage === 'water' && !f.onLand ? f.depth : 0, 1)} m`,
      `Pohja ${fi(this.bottom.depthAt(lureOut ? f.lure : this.tube.pos), 1)} m`,
    ]);
    this.hud.sonar.update(dt, () =>
      sonarPing(this.tube.pos, this.fish.fish, this.bottom.depthAt(this.tube.pos)),
    );
    const left = timeLeft(this.competition);
    this.hud.setTimer(formatTime(left), left < 60);
    this.updateWeather(dt);
    this.sfx.updateAmbience(dt, this.weather.now);
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
            `Saalis ${catches.length} kpl  ${formatWeight(total)}`,
            ...catches
              .slice(-5)
              .reverse()
              .map((c) => `${formatTime(c.time)} ${c.name} ${formatWeight(c.weight)}`),
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
    this.applyWeatherLight();
    this.updateWaves(w.windSpeed, w.windDir);
    const hs = this.waves.heightAt(this.tube.pos, w.windSpeed);
    this.hud.setWeather(
      `${SKY_NAMES[w.sky]} · ${windName(w.windDir)} ${Math.round(w.windSpeed)} m/s` +
        (hs >= 0.05 ? ` · aallot ${fi(hs, 1)} m` : '') +
        (w.sky === 'thunder' || w.sky === 'storm' ? ' · salamavaara!' : '') +
        this.spoutText(),
    );
  }

  /**
   * Aallot vesishaderille. Aallonpituutta liioitellaan näkyvyyden vuoksi:
   * oikeat 2–4 m aallot hukkuisivat pikseleihin.
   */
  private updateWaves(windSpeed: number, windDir: number): void {
    this.waves.update(windDir);
    const period = wavePeriod(windSpeed, TYPICAL_FETCH);
    this.waveK = (2 * Math.PI) / Math.max(6, waveLength(period) * 3);
    this.waveOmega = (2 * Math.PI) / period;
    this.waterWaves.uWaveScale.value = WAVE_FACTOR_SCALE * windSpeed;
    this.waterWaves.uWaveDir.value.set(Math.cos(windDir), Math.sin(windDir));
    this.waterWaves.uWaveK.value = this.waveK;
    this.waterWaves.uWaveOmega.value = this.waveOmega;
  }

  /** Aallon pystysiirtymä (m) pisteessä: sama vaihe kuin vesishaderissa. */
  private swellAt(p: Vec2): { lift: number; roll: number } {
    const w = this.weather.now;
    const hs = this.waves.heightAt(p, w.windSpeed);
    const along = p.x * Math.cos(w.windDir) + p.y * Math.sin(w.windDir);
    const across = -p.x * Math.sin(w.windDir) + p.y * Math.cos(w.windDir);
    const phase =
      along * this.waveK - waterTime.value * this.waveOmega + Math.sin(across * 0.05) * 2;
    return { lift: (hs / 2) * Math.sin(phase), roll: hs * 0.12 * Math.cos(phase) };
  }

  /** Pilvinen taivas himmentää valon ja tummentaa taivaan ja sumun. */
  private applyWeatherLight(): void {
    const dark = this.weather.now.darkness;
    // Valoa himmennetään vain vähän: paletissa tummat sinisävyt kääntyisivät vihreiksi.
    const light = 1 - 0.25 * dark;
    // Salaman välähdys valaisee koko maiseman hetkeksi.
    this.hemi.intensity = 1.5 * light * (1 + 1.5 * this.lightning.flash);
    this.sun.intensity = 1.5 * light * light;
    const bg = this.scene.background;
    if (!(bg instanceof THREE.Color)) return;
    if (this.viewMode === 'pov') {
      bg.set(CLOUDY_SKIES.find(([min]) => dark >= min)![1]);
      if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(bg);
    } else {
      bg.set(LAND_COLOR).multiplyScalar(1 - 0.4 * dark);
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
    if (events.home && this.quietSpot.home())
      hud.showMessage('Hiljaista – potki muualle, K näyttää kalat', 4);
    if (events.splash) {
      this.fishingView.startSplash(events.splash);
      sfx.splash();
      this.net?.world.sendSplash(events.splash);
    }
    if (follow) sfx.tick();
    if (events.strike) {
      sfx.strike();
      hud.showMessage('Tärppi!', 1.2);
    }
    if (events.hooked) {
      sfx.hooked();
      hud.showMessage('Kala kiinni!', 1.5);
    }
    if (events.missed) hud.showMessage('Ohi meni – kelaa heti tärpin jälkeen', 2);
    if (events.escaped) {
      sfx.lost();
      hud.showMessage('Kala irtosi – pidä siima kireällä', 2.5);
    }
    if (events.tackleChanged) {
      this.pendingTackle = null;
      saveTackle(this.fishing.tackle);
      this.net?.world.sendTackle(this.fishing.tackle);
      hud.showMessage(`Viehe: ${LURES[this.fishing.tackle.lure].name}`, 1.5);
    }
    if (events.snagged) {
      sfx.strike();
      hud.showMessage('Pohjatartunta! Kelaa irrottaaksesi', 2);
    }
    if (events.unsnagged) hud.showMessage('Viehe irtosi pohjasta', 1.5);
    if (events.bitOff) {
      sfx.lost();
      hud.showMessage('Hauki katkaisi siiman hampaillaan – kokeile teräsperuketta', 3.5);
    } else if (events.lureLost) {
      sfx.lost();
      hud.showMessage('Siima katkesi – viehe jäi pohjaan', 3);
    } else if (events.lineBroken) {
      sfx.lost();
      hud.showMessage('Siima katkesi! Löysää jarrua (Q) tai vaihda paksumpaan siimaan', 3);
    }
    if (events.caught) {
      sfx.caught();
      this.net?.world.sendCatch(events.caught);
      const record = recordCatch(this.competition, events.caught);
      this.fishingView.startSplash(this.fishing.lure);
      const catches = this.competition.catches;
      const biggest = catches.every((c) => c === record || c.weight < events.caught!.weight);
      hud.showWeighIn(
        `${events.caught.name} ${formatWeight(events.caught.weight)}`,
        catches.length > 1 && biggest ? 'Kisan suurin tähän asti!' : `${catches.length}. kala`,
      );
    }
    if (this.fishing.dragSlipping) sfx.dragSlip();
    this.reelClickTimer -= dt;
    if (reeling && this.reelClickTimer <= 0) {
      sfx.reelClick();
      this.reelClickTimer = 0.09 / (this.fishing.gear + 1);
    }
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
  private updateRaceHud(): void {
    const w = this.net!.world;
    const cd = w.phase === 'countdown' ? Math.ceil(w.countdown) : 0;
    this.hud.setCountdown(
      w.phase === 'countdown'
        ? String(Math.max(1, cd))
        : this.competition.elapsed < 1.2
          ? 'Kalastamaan!'
          : null,
    );
    if ((this.raceHudTimer = (this.raceHudTimer + 1) % 15) !== 1) return;
    const results = w.results();
    const lines = results.slice(0, 5).map((r) => scoreLine(r, r.id === w.myId));
    const me = results.find((r) => r.id === w.myId);
    if (me && me.rank > 5 && !results.slice(0, 5).includes(me))
      lines.push('…', scoreLine(me, true));
    this.hud.setCatches(['Tulostaulu', ...lines]);
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

  /** Vapauttaa GPU-resurssit, kun kierros päättyy. */
  dispose(): void {
    this.remoteView?.dispose();
    this.net?.world.dispose();
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
    const pos = {
      x: a.pos.x + (b.pos.x - a.pos.x) * alpha + offset.x,
      y: a.pos.y + (b.pos.y - a.pos.y) * alpha + offset.y,
    };
    const heading = lerpAngle(a.heading, b.heading, alpha);
    this.tubeMesh.position.copy(toWorld(pos));
    this.tubeMesh.rotation.y = heading;
    const roll = this.capsizeRoll();
    this.tubeMesh.rotation.x = roll;
    animateFins(this.tubeMesh, b.kickPhase);
    const hooked = this.fish.fish.find((x) => x.id === this.fishing.hookedId) ?? null;
    this.fishingView.update(this.fishing, this.fishingContext(), this.aim, 1 / 60, hooked);
    this.view.apply();
    this.youMarker.update(pos, this.view.metersPerPixel, this.viewMode === 'top');
    if (this.viewMode === 'pov') {
      const swell = this.swellAt(pos);
      // Kumossa kamera kallistuu ja painuu veden rajaan.
      this.pov.apply(pos, heading, b.kickPhase, {
        lift: swell.lift - 0.7 * (roll / Math.PI),
        roll: swell.roll + roll * 0.3,
      });
      // Vapa oikeasta kädestä kärkeen; kärki on siiman alkupiste.
      const side = rodSideOffset(heading);
      const tip = rodTip(pos, heading);
      tip.x += side.x;
      tip.y += side.y;
      const hand = {
        x: pos.x + Math.cos(heading - 1.1) * 0.45,
        y: pos.y + Math.sin(heading - 1.1) * 0.45,
      };
      const attr = this.povRod.geometry.getAttribute('position') as THREE.BufferAttribute;
      const h0 = toWorld(hand, 0.3);
      const h1 = toWorld(tip, ROD_TIP_Y);
      attr.setXYZ(0, h0.x, h0.y, h0.z);
      attr.setXYZ(1, h1.x, h1.y, h1.z);
      attr.needsUpdate = true;
    }
    if (this.net && this.remoteView)
      this.remoteView.update(this.net.world.others(), this.camera, this.net.canvas);
  }
}

function scoreLine(r: PlayerResult, me: boolean): string {
  const name = r.name.length > 10 ? `${r.name.slice(0, 9)}…` : r.name;
  return `${me ? '>' : ' '}${r.rank}. ${name.padEnd(10)} ${formatWeight(r.summary.score).padStart(7)}`;
}

/** Desimaaliluku suomalaisittain pilkulla. */
const fi = (v: number, digits: number) => v.toFixed(digits).replace('.', ',');
