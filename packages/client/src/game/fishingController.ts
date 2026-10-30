import {
  DIFFICULTIES,
  FLY,
  FLY_CAST,
  REEL,
  distance,
  fishConditions,
  isFly,
  lureInfo,
  recordCatch,
  recordTackle,
  resetFishing,
  seasonOf,
  sizeClass,
  stepFishPopulation,
  stepFishing,
  type CompetitionSettings,
  type CompetitionState,
  type Daylight,
  type FishPopulation,
  type FishingContext,
  type FishingState,
  type FlyCastEvents,
  type FlyCastState,
  type LakeBottom,
  type RecordEntry,
  type Rng,
  type Tackle,
  type TubeState,
  type Vec2,
  type WaterBody,
  type WeatherNow,
  type RaceStatsCounter,
} from '@lunki/shared';
import type { Sounds } from '../audio/sounds';
import type { Input } from '../engine/input';
import type { NetWorld } from '../net/netWorld';
import { fishLengthCm } from '../ui/fishArt';
import { lureImage } from '../ui/lureArt';
import type { Hud } from '../ui/hud';
import { formatWeight, ordinal, t } from '../i18n';
import { baitName, speciesName } from '../i18n/names';
import { CastControl } from './castControl';
import { controlMode, controlText, type Controls } from './controls';
import { FlyCastControl, touchToRodPixels } from './flyCastControl';
import type { FishingView } from './fishingView';
import { FlyStrip } from './flyStrip';
import type { Guide } from './guide';
import type { Penalties } from './penalties';
import type { PovCamera } from './povCamera';
import { QuietSpot } from './quietSpot';
import type { RaceLog } from './raceLog';
import { addJournalEntry } from './journal';
import { saveTackle } from './tackle';
import { slotOf } from './tackleBox';
import type { TopDownCamera } from './topDownCamera';
import type { FishShadow } from '../world/fishShadow';
import type { FishSignsView } from './fishSignsView';
import { liftTime } from './landingView';
import { OwnRodMotion, type RodPose } from './rodMotion';

/** Saaliin punnituskortti näkyy näin kauan, ellei pelaaja ala heittää uudelleen. */
const CATCH_CARD_SECONDS = 6;
/** Yksinpelin pelaajan tunniste kisan kulussa. */
export const SOLO_ID = 'me';

/** Mitä kalastus tarvitsee pelistä. */
export interface FishingHost {
  readonly hud: Hud;
  readonly sounds: Sounds;
  readonly netWorld: NetWorld | undefined;
  readonly input: Input;
  readonly controls: Controls;
  readonly screenToInternal: (x: number, y: number) => { x: number; y: number };
  readonly competition: CompetitionState;
  readonly settings: CompetitionSettings;
  readonly penalties: Penalties;
  readonly water: WaterBody;
  readonly bottom: LakeBottom;
  readonly fishing: FishingState;
  readonly fish: FishPopulation;
  readonly rng: Rng;
  readonly tube: TubeState;
  readonly facing: number;
  readonly inBoat: boolean;
  readonly spectating: boolean;
  readonly viewMode: 'top' | 'pov';
  readonly view: TopDownCamera;
  readonly pov: PovCamera;
  readonly fishingView: FishingView;
  readonly fishShadow: FishShadow;
  readonly fishSigns: FishSignsView;
  readonly raceLog: RaceLog;
  readonly raceStatsCounter: RaceStatsCounter;
  readonly guide: Guide;
  readonly daylight: Daylight;
  /** Sää nyt (kalojen syönti ja ennätysten säätiedot). */
  readonly weatherNow: WeatherNow;
  /** Tuuli nyt (heitto ja siima). */
  readonly wind: Vec2;
  /** Käsimerkki käynnissä: käsi on varattu. */
  readonly emoteActive: boolean;
  /** Kisan viehepakki: realistisella menetetty viehe poistuu siitä (#365). */
  readonly lurePicker: { lost(tk: Tackle): string | null };
  readonly onSoloCatch: ((entry: Omit<RecordEntry, 'date' | 'at' | 'angler'>) => void) | null;
}

/** Askeleen tilanne kalastukselle. */
export interface FishingStep {
  /** Lähtölaskenta: vapa odottaa. */
  frozen: boolean;
  capsized: boolean;
  /** Jäähyä jäljellä (s). */
  timeOut: number;
  /** Moninpelin siimasotku: vapa on kiinni. */
  tangled: boolean;
  reelHeld: boolean;
}

/**
 * Kalastus: heitto (myös perhoheitto hiirellä, näppäimillä ja sormella),
 * kelaus ja siimakäsi, kalakannan askel, kalastuksen tapahtumat ilmoituksiksi
 * ja äänikartan ääniksi sekä saaliin kirjaus ja punnitus.
 */
export class FishingController {
  /** Vaihdettavat varusteet: otetaan käyttöön, kun viehe on kelalla. */
  pendingTackle: Tackle | null = null;
  /** Vinkkaa paikan vaihdosta, kun heitot menevät tyhjiin. */
  private readonly quietSpot = new QuietSpot();
  /** Hiiren osoittama piste maailmassa. */
  aim: Vec2 = { x: 0, y: 0 };
  /** Heitto hiirellä tai välilyönnillä katsesuuntaan (#227). */
  private readonly castControl = new CastControl();
  readonly flyCastControl = new FlyCastControl();
  /** Perhon vedot hiirellä. */
  private readonly flyStrip = new FlyStrip();
  private reelClickTimer = 0;
  /** Punnituskortti odottaa, kunnes kala on nostettu kyytiin (#366). */
  private weighIn: { left: number; show: () => void } | null = null;
  /** Vieheen syvyys tärpissä saalispäiväkirjaan (#415). */
  private strikeDepth: number | null = null;
  /** Pelaaja kelaa (kelan kampi pyörii kalastajan silmin). */
  cranking = false;
  /** Sormen liike pelikuvalla (CSS-pikseleinä), jota perhoheitto ei ole vielä käyttänyt. */
  private swipeX = 0;
  private swipeY = 0;
  private lastHiss = 0;
  /** Perhovavan edellinen kulma ja taipuma (#236). */
  private bendRod: number | null = null;
  private bend = 0;
  private bendTime = performance.now();
  /** Vavan nosto ja taipuma piirtoa varten. */
  private readonly rod = new OwnRodMotion();
  private rodTime = performance.now();

  constructor(private readonly host: FishingHost) {}

  /** Kalakanta kalastuksen nollaukseen: kiinni ollut kala pääsee vapaaksi. */
  get fishCtx() {
    return { pop: this.host.fish, rng: this.host.rng };
  }

  context(strike?: number): FishingContext {
    const host = this.host;
    return {
      tubePos: host.tube.pos,
      heading: host.facing,
      isWater: (p) => host.water.isWater(p),
      depthAt: (p) => host.bottom.depthAt(p),
      structureAt: (p) => host.bottom.structureAt(p),
      bottomTypeAt: (p) => host.bottom.bottomTypeAt(p),
      reedsAt: (p) => host.water.reedsAt(p) !== null,
      wind: host.wind,
      fish: {
        pop: host.fish,
        diff: DIFFICULTIES[host.settings.difficulty],
        rng: host.rng,
        strike,
      },
    };
  }

  /** Nollaa kalastuksen (siima kelalle, kiinni ollut kala vapaaksi). */
  reset(): void {
    resetFishing(this.host.fishing, this.fishCtx);
  }

  /** Vaihtaa varusteet heti, tai kun viehe seuraavan kerran on kelalla. */
  setTackle(tk: Tackle): void {
    this.pendingTackle = { ...tk };
    const f = this.host.fishing.stage;
    if (f !== 'idle' && f !== 'charging')
      this.host.hud.showMessage(
        isFly(tk)
          ? t('game.flyLater', { fly: baitName(tk) })
          : t('game.lureLater', { lure: baitName(tk) }),
        1.5,
        'info',
      );
  }

  /** Varusteet sellaisina kuin ne ovat seuraavassa heitossa. */
  get tackle(): Tackle {
    return this.pendingTackle ?? this.host.fishing.tackle;
  }

  /** Perhoa heitetään rytmissä (välilyönti tai HEITÄ): kosketuksen iso nappi on yhä HEITÄ. */
  get flyRhythm(): boolean {
    return this.host.fishing.stage === 'casting' && this.flyCastControl.keyboard;
  }

  /**
   * Kalastuksen askel: heitto, siimakäsi, kalakanta ja tapahtumat.
   * Palauttaa siimakäden tilan (jarrun pito kireysmittariin).
   */
  step(dt: number, s: FishingStep): { lineHand: boolean } {
    const host = this.host;
    const { input, controls: c } = host;
    const f = host.fishing;
    const { frozen, capsized, timeOut, tangled, reelHeld } = s;
    // Perho heitetään hiirellä, rytmissä välilyönnillä tai HEITÄ-napilla (#235), tai
    // sormen pyyhkäisyllä (#236).
    const flyCasting = isFly(f.tackle);
    const touch = host.hud.touchMode;
    this.collectSwipe(touch);
    const castHeld =
      this.castControl.castHeld(f.stage, {
        mouse: c.isDown('pointer'),
        key: c.isDown('castForward'),
      }) &&
      (!flyCasting || f.stage === 'charging');
    const canCast = !frozen && !capsized && timeOut === 0 && !host.emoteActive && !tangled;
    let startFlyCast = false;
    if (flyCasting && canCast) {
      const mouse = c.wasPressed('pointer');
      if (f.stage === 'idle' && (mouse || c.wasPressed('castForward'))) {
        startFlyCast = true;
        this.flyCastControl.start(mouse ? (touch ? 'touch' : 'mouse') : 'keyboard');
      } else if (
        f.stage === 'water' &&
        f.struckId === null &&
        f.hookedId === null &&
        c.wasPressed('lift')
      ) {
        // Siiman nosto vedestä uuteen heittoon (kosketuksella NOSTA). Tärpissä
        // sama nosto on vastaisku (#399), ks. readFlyHand.
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
                    grip: c.isDown('lineGrip'),
                    gripPressed: c.wasPressed('lineGrip'),
                    haul: c.wasPressed('haul'),
                    key: c.wasPressed('castForward'),
                    ...this.takeSwipe(),
                  }
                : {
                    // Siimakäsi hiiren vasemmalla tai välilyönnillä (#400).
                    grip: c.isDown('pointer') || c.isDown('lineGrip'),
                    gripPressed: c.wasPressed('pointer') || c.wasPressed('lineGrip'),
                    haul: c.wasPressed('haul'),
                    key: c.wasPressed('castForward'),
                    dx: input.mouseDX,
                    dy: input.mouseDY,
                  },
              dt,
            )
          : { rod: 0, grip: true }
        : undefined;
    // Käyttämätön liike unohtuu, paitsi heiton aloittaneella askeleella: se kuuluu heittoon.
    if (!startFlyCast) this.swipeX = this.swipeY = 0;
    const internal = host.screenToInternal(input.mouseX, input.mouseY);
    this.aim = this.castControl.aim(
      (host.viewMode === 'pov' ? host.pov : host.view).internalToWorld(internal.x, internal.y),
      host.tube.pos,
      host.facing,
      controlMode() === 'pad' ? { stick: input.padAim, pov: host.viewMode === 'pov' } : undefined,
    );
    const lureOut = f.stage === 'flight' || f.stage === 'water';
    // Perho vedessä ja siima kädessä: hiiri tai välilyönti pitää siimaa ja vetää sitä.
    const flyHand = isFly(f.tackle) && !f.onReel && f.stage === 'water';
    const fly = flyHand ? this.readFlyHand(dt, frozen || tangled) : null;
    if (!flyHand) this.flyStrip.reset();
    // Sotkussa vapa on kiinni: kelaaminen selvittää sotkua palvelimella.
    const reeling = !flyHand && !frozen && !tangled && lureOut && reelHeld;
    this.cranking = !flyHand && !frozen && lureOut && reelHeld;
    const world = {
      isWater: (p: Vec2) => host.water.isWater(p),
      depthAt: (p: Vec2) => host.bottom.depthAt(p),
    };
    const conditions = fishConditions(
      host.competition.finished ? null : host.weatherNow,
      host.daylight,
      seasonOf(host.settings),
    );
    const fishEvents = stepFishPopulation(
      host.fish,
      lureInfo(f, this.context()),
      world,
      DIFFICULTIES[host.settings.difficulty],
      host.rng,
      dt,
      conditions,
    );
    const events: ReturnType<typeof stepFishing> =
      tangled || host.spectating
        ? {}
        : stepFishing(
            f,
            {
              aim: this.aim,
              // Eleen aikana käsi on varattu: heittää ei voi.
              castHeld: !frozen && !capsized && timeOut === 0 && castHeld && !host.emoteActive,
              reel: reeling,
              // Oikea nappi peruu vain latauksen: heitossa se on veto, vedessä nosto.
              cancel: c.isDown('cancel') || (f.stage === 'charging' && c.isDown('cancelCharge')),
              dragDelta: (c.wasPressed('dragMore') ? 1 : 0) - (c.wasPressed('dragLess') ? 1 : 0),
              ...this.readGear(),
              ...(this.pendingTackle ? { tackle: this.pendingTackle } : {}),
              cut: c.wasPressed('cut'),
              twitch: !isFly(f.tackle) && c.wasPressed('twitch'),
              land: f.landing !== null && (c.wasPressed('land') || c.wasPressed('landNet')),
              ...fly,
              reelSlack: c.isDown('reelSlack'),
              ...(startFlyCast ? { startFlyCast } : {}),
              ...(flyCast ? { flyCast } : {}),
            },
            this.context(fishEvents.strike),
            dt,
          );
    if (f.stage !== 'casting') input.unlockPointer();
    this.rod.onEvents(events, f, fly?.rodLift === true);
    this.handleEvents(events, fishEvents.follow !== undefined, reeling, dt);
    host.fishShadow.update(host.fish.fish, host.tube.pos);
    host.fishSigns.update(host.fish, conditions, host.tube.pos, host.settings.difficulty, dt);
    if (fishEvents.shadow !== undefined) host.hud.showMessage(t('game.bigShadow'), 2.5);
    if (fishEvents.spooked !== undefined) host.hud.showMessage(t('game.spooked'), 2.5);
    return { lineHand: fly?.lineHand ?? false };
  }

  /** Vavan asento tällä ruudulla: nosto, taipuma ja vedon suunta. */
  rodPose(): RodPose {
    const now = performance.now();
    const dt = (now - this.rodTime) / 1000;
    this.rodTime = now;
    return this.rod.pose(this.host.fishing, dt);
  }

  /**
   * Perhovapa taipuu liikkeen aikana: kahva johtaa ja kärki laahaa perässä.
   * Pysäytyksessä taipuma palautuu, ja vapa suoristuu.
   */
  flyRodBend(cast: FlyCastState | null): number {
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
    this.host.sounds.play('lineHiss');
  }

  /** Perhoheiton tapahtumat (#235): viuhahdukset, nykäys ja virheiden ilmoitukset. */
  private handleFlyCast(ev: FlyCastEvents): void {
    const { hud, sounds } = this.host;
    const cast = this.host.fishing.flyCast;
    // Siima suhisee silmukan aukeamisen ajan (#236).
    if (ev.stop)
      sounds.play(
        'flySwish',
        ev.stop.speed / FLY_CAST.maxLineSpeed,
        cast?.phase === 'loop' ? cast.loopTime : 0.3,
      );
    // Siima suoristui: vaimea nykäys vavassa.
    if (ev.straight) sounds.play('flyTug');
    // Siimakäden veto osui liikkeeseen (#398).
    if (ev.haul) sounds.play('flyHaul');
    if (ev.slipped) this.hiss();
    if (ev.crack) sounds.play('flyCrack');
    if (ev.crack && !ev.flyLost) {
      hud.showMessage(t('game.flyCrack'), 2);
    }
    if (ev.knot) hud.showMessage(t('game.flyKnot'), 2.5);
    if (ev.collapsed) hud.showMessage(t('game.flyCollapsed'), 2);
    else if (ev.fell) hud.showMessage(t('game.flyFell'), 2);
    if (ev.snagBehind || ev.hat) {
      sounds.play('flySnag');
      hud.showMessage(ev.hat ? t('game.flyHat') : t('game.flySnagBehind'), 2.5);
    }
    if (ev.landed) {
      this.quietSpot.cast(this.host.tube.pos);
      hud.showMessage(
        t(ev.landed.roll ? 'game.flyRollCast' : 'game.flyCastLength', {
          m: Math.round(distance(this.host.tube.pos, this.host.fishing.lure)),
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
    const host = this.host;
    const { hud, sounds } = host;
    const net = host.netWorld;
    const hookedId = host.fishing.hookedId;
    host.raceStatsCounter.fishing(
      events,
      host.tube.pos,
      host.fishing.lure,
      hookedId === null ? null : (host.fish.fish.find((x) => x.id === hookedId) ?? null),
    );
    host.guide.onEvents(events, isFly(host.fishing.tackle));
    if (events.cast !== undefined) {
      this.strikeDepth = null;
      sounds.play('cast', events.cast);
      this.quietSpot.cast(host.tube.pos);
    }
    if (follow || events.strike) this.quietSpot.noticed();
    if (events.home && this.quietSpot.home())
      hud.showMessage(controlText(host.inBoat ? 'game.quietBoat' : 'game.quiet'), 4, 'info');
    if (events.splash) {
      // Perho laskeutuu pienellä roiskeella, popperi isommalla (#236).
      const tk = host.fishing.tackle;
      const big = !isFly(tk) || tk.fly === 'popper';
      host.fishingView.startSplash(events.splash, isFly(tk) ? (big ? 0.7 : 0.4) : 1);
      if (isFly(tk)) sounds.play('flyLand', big ? 1 : 0);
      else sounds.play('lureSplash');
      net?.sendSplash(events.splash);
    }
    if (follow) sounds.play('follow');
    if (events.strike || (events.hooked && this.strikeDepth === null))
      this.strikeDepth = host.fishing.depth;
    if (events.strike) {
      host.fishingView.strikeSwirl(host.fishing.lure, host.fishing.strikeBig);
      sounds.play('strike');
      // Iso kala tarttuu vain nykäisyyn (#402): raskas tärppi kertoo sen.
      hud.showMessage(
        host.fishing.strikeBig ? controlText('game.strikeBig') : t('game.strike'),
        1.2,
      );
    }
    if (events.hooked) {
      sounds.play('hooked');
      hud.showMessage(t('game.hooked'), 1.5);
    }
    const flyGear = isFly(host.fishing.tackle);
    if (events.missed) {
      hud.showMessage(
        flyGear
          ? t('game.missedFly')
          : events.missedTwitch
            ? controlText('game.missedTwitch')
            : t('game.missed'),
        2.5,
      );
      sounds.play('missed');
    }
    if (events.jumped) {
      sounds.play('jumped');
      hud.showMessage(t('game.jumped'), 1.5);
    }
    if (events.surfaced) {
      sounds.play('surfaced');
      host.fishingView.startSplash(host.fishing.lure, 0.6);
    }
    if (events.lunged) {
      sounds.play('lunged');
      host.fishingView.startSplash(host.fishing.lure, 1.2);
    }
    if (events.escaped) {
      sounds.play('escaped');
      hud.showMessage(t('game.escaped'), 2.5);
    }
    if (events.tackleChanged) {
      this.pendingTackle = null;
      saveTackle(host.fishing.tackle);
      net?.sendTackle(host.fishing.tackle);
      const tk = host.fishing.tackle;
      hud.showMessage(
        isFly(tk)
          ? t('game.flyChanged', { fly: baitName(tk) })
          : t('game.lureChanged', { lure: baitName(tk) }),
        1.5,
        'info',
        { icon: lureImage(isFly(tk) ? tk.fly : tk.lure, 'calc(var(--u) * 1.5)') },
      );
    }
    if (events.onReel) hud.showMessage(t('game.onReel'), 2, 'info');
    if (events.flyCast) this.handleFlyCast(events.flyCast);
    if (events.pickupFar) hud.showMessage(t('game.flyPickupFar', { m: FLY_CAST.pickupMax }), 2);
    if (events.flyTangle) {
      sounds.play('flyTangle');
      hud.showMessage(t('game.flyTangle'), 2.5);
    }
    if (events.pop) sounds.play('pop');
    // Kala vie siimaa sormien läpi.
    if (host.fishing.fingerSlip) this.hiss();
    if (events.snagged) {
      sounds.play('snagged');
      hud.showMessage(flyGear ? t('game.snaggedFly') : t('game.snagged'), 2);
    }
    if (events.unsnagged) hud.showMessage(t('game.unsnagged'), 1.5, 'info');
    if (events.fouled) {
      hud.showMessage(t('game.fouled'), 2.5);
      sounds.play('fouled');
    }
    if (events.rattle) sounds.play('rattle');
    if (events.stuck) sounds.play('stuck');
    // Realistisella menetetty viehe poistuu kisan pakista (#365): rivi ilmoituksen alle.
    const lost =
      events.lureLost || events.lineBroken ? host.lurePicker.lost(host.fishing.tackle) : null;
    const withLost = (text: string) => (lost ? `${text}\n${lost}` : text);
    if (events.lineCut) {
      sounds.play('lineCut');
      const wait = host.settings.landPenalty ?? 0;
      if (wait > 0) host.penalties.wait(wait, t('game.newLure'));
      net?.landCut();
      // Odotus näkyy ajastimena, syy sen alla.
      if (wait > 0) {
        host.penalties.setNote(`${t('game.lineCut')} · ${t('game.lureOnLand')}`);
        if (lost) hud.showMessage(lost, 3);
      } else hud.showMessage(withLost(`${t('game.lineCut')}\n${t('game.lureOnLand')}`), 3);
    } else if (events.bitOff) {
      sounds.play('bitOff');
      hud.showMessage(withLost(t('game.bitOff')), 3.5);
    } else if (events.lureLost) {
      sounds.play('lureLost');
      hud.showMessage(
        withLost(events.flyCast?.flyLost ? t('game.flyLost') : t('game.lureLost')),
        3,
      );
    } else if (events.lineBroken) {
      sounds.play('lineBroken');
      hud.showMessage(
        withLost(flyGear ? controlText('game.lineBrokenFly') : t('game.lineBroken')),
        3,
      );
    }
    if (this.weighIn && (this.weighIn.left -= dt) <= 0) this.flushWeighIn();
    if (events.caught) {
      if (events.landed)
        host.fishingView.startLanding(events.landed, events.caught.species, events.caught.weight);
      this.onCaught(events.caught, events.landed ? liftTime(events.landed.by) : 0);
    }
    if (host.fishing.dragSlipping) sounds.play('dragSlip');
    this.reelClickTimer -= dt;
    if (reeling && this.reelClickTimer <= 0) {
      sounds.play('reelClick');
      this.reelClickTimer = 0.09 / (host.fishing.gear + 1);
    }
  }

  private flushWeighIn(): void {
    const w = this.weighIn;
    this.weighIn = null;
    w?.show();
  }

  /**
   * Kala nousi: ääni, kirjaus kisaan ja ennätyksiin sekä punnituskortti, joka
   * tulee näkyviin `delay` sekunnin päästä, kun nosto on ehtinyt kalastajan eteen.
   */
  private onCaught(
    caught: NonNullable<ReturnType<typeof stepFishing>['caught']>,
    delay: number,
  ): void {
    const host = this.host;
    const { hud, sounds } = host;
    const net = host.netWorld;
    sounds.play(sizeClass(caught.species, caught.weight) >= 3 ? 'bigCatch' : 'caught');
    net?.sendCatch(caught);
    const record = recordCatch(host.competition, caught, host.tube.pos);
    // Moninpelissä saaliit tulevat kartalle palvelimen punnitsemina (onCatchSeen).
    if (record && !net) {
      host.raceLog.addCatch({ ...record, id: SOLO_ID, pos: host.tube.pos });
      const gear = host.fishing.tackle;
      const w = host.weatherNow;
      host.onSoloCatch?.({
        species: record.species,
        weight: record.weight,
        difficulty: host.settings.difficulty,
        x: host.tube.pos.x,
        y: host.tube.pos.y,
        raceTime: record.time,
        timeOfDay: host.settings.timeOfDay ?? 'day',
        season: seasonOf(host.settings),
        sky: w.sky,
        wind: w.windSpeed,
        ...recordTackle(gear),
      });
    }
    if (record) {
      const gear = host.fishing.tackle;
      addJournalEntry({
        species: record.species,
        weight: record.weight,
        bait: isFly(gear) ? gear.fly : slotOf(gear),
        sky: host.weatherNow.sky,
        timeOfDay: host.settings.timeOfDay ?? 'day',
        season: seasonOf(host.settings),
        depth: this.strikeDepth ?? 0,
        x: host.tube.pos.x,
        y: host.tube.pos.y,
        at: Date.now(),
      });
    }
    this.strikeDepth = null;
    host.fishingView.startSplash(host.fishing.lure);
    const catches = host.competition.catches;
    const biggest = catches.every((c) => c === record || c.weight < caught.weight);
    const length = `${Math.round(fishLengthCm(caught.species, caught.weight))} cm`;
    const nth = `${length} · ${catches.length > 1 && biggest ? t('game.biggestSoFar') : t('game.nthFish', { n: ordinal(catches.length) })}`;
    this.flushWeighIn();
    this.weighIn = {
      left: delay,
      show: () =>
        hud.showWeighIn(
          `${speciesName(caught.species)} ${formatWeight(caught.weight)}`,
          nth,
          CATCH_CARD_SECONDS,
          caught,
        ),
    };
    if (delay <= 0) this.flushWeighIn();
  }

  /**
   * Kerää sormen liikkeen pelikuvalla (#236): pyyhkäisy ylös on eteenheitto,
   * alas takaheitto. Liike tulee tapahtumista, ei askelten välisistä
   * paikoista, joten hitaalla ruudunpäivityksellä pyyhkäisyn alku ei katoa.
   */
  private collectSwipe(touch: boolean): void {
    this.swipeX = touch ? this.swipeX + this.host.input.dragDX : 0;
    this.swipeY = touch ? this.swipeY + this.host.input.dragDY : 0;
  }

  /** Kerätty pyyhkäisy perhoheitolle hiiren pikseleinä. */
  private takeSwipe(): { dx: number; dy: number } {
    const h = window.innerHeight;
    const swipe = { dx: touchToRodPixels(this.swipeX, h), dy: touchToRodPixels(this.swipeY, h) };
    this.swipeX = 0;
    this.swipeY = 0;
    return swipe;
  }

  /** Kelan vaihde näppäimistä (1–4) tai kosketuksen NOP-napista (seuraava). */
  private readGear(): { gear?: number } {
    const c = this.host.controls;
    if (c.wasPressed('gear1')) return { gear: 0 };
    if (c.wasPressed('gear2')) return { gear: 1 };
    if (c.wasPressed('gear3')) return { gear: 2 };
    if (c.wasPressed('gearFast')) return { gear: REEL.fastGear };
    if (c.wasPressed('gearNext')) return { gear: (this.host.fishing.gear + 1) % REEL.gears.length };
    return {};
  }

  /**
   * Perhon siimakäsi (#234): hiiren vasen tai välilyönti pitää siimaa. Hiiren
   * veto alas vetää siimaa liikkeen verran, ylös nostaa vapaa (vastaisku).
   * Välilyönti ja kosketusnäytön VETO vetävät tasaisesti. Tärpissä myös
   * noston toiminto (hiiren oikea, NOSTA) nostaa vapaa (#399).
   */
  private readFlyHand(
    dt: number,
    blocked: boolean,
  ): { lineHand: boolean; strip: number; rodLift: boolean } {
    const { input, controls } = this.host;
    const mouse = controls.isDown('pointer');
    const steady = controls.isDown('strip');
    const lineHand = !blocked && (mouse || steady);
    const pull = this.flyStrip.read(mouse && !blocked, input.mouseY, window.innerHeight, dt);
    const strip = (steady ? FLY.steadyStrip * dt : 0) + pull.strip;
    const liftSet = !blocked && this.host.fishing.struckId !== null && controls.wasPressed('lift');
    return { lineHand, strip: blocked ? 0 : strip, rodLift: pull.rodLift || liftSet };
  }
}
