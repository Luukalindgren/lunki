import {
  BoatSeat,
  CRAFTS,
  LureStage,
  SEAT_SWAP,
  nextSeatTarget,
  stepPlayerTube,
  type FishingState,
  type LakeBottom,
  type TubeInput,
  type TubeState,
  type Vec2,
  type WaterBody,
} from '@lunki/shared';
import type { Sounds } from '../audio/sounds';
import type { NetWorld } from '../net/netWorld';
import type { Hud } from '../ui/hud';
import { decimal, t, type MsgKey } from '../i18n';
import { seatName } from '../i18n/names';
import { controlText, type Controls } from './controls';
import type { FishingView } from './fishingView';
import { RowerSeat } from './rowing';
import { loadCraft } from './tackle';

/**
 * Näppäinasettelu: WASD tai nuolet. W vie katseen suuntaan kohti räpylöitä
 * (hitaampi melonta), S selkä edellä (tavallinen, nopeampi potkiminen).
 */
export function readTubeInput(c: Controls): TubeInput {
  return {
    kick: (c.isDown('back') ? 1 : 0) - (c.isDown('forward') ? 1 : 0),
    turn: (c.isDown('left') ? 1 : 0) - (c.isDown('right') ? 1 : 0),
    sprint: c.isDown('sprint'),
  };
}

/** Mitä kulkupeli tarvitsee pelistä. */
export interface CraftHost {
  readonly hud: Hud;
  readonly sounds: Sounds;
  readonly controls: Controls;
  readonly netWorld: NetWorld | undefined;
  readonly water: WaterBody;
  readonly bottom: LakeBottom;
  readonly fishing: FishingState;
  readonly fishingView: FishingView;
  readonly spectating: boolean;
  tube: TubeState;
  prevTube: TubeState;
  /** Renkaaseen vaikuttava tuuli (sää ja trombin imu). */
  readonly tubeWind: Vec2;
  /** Jäähyä jäljellä (s). */
  readonly timeOutLeft: number;
  /** Katsojan kamera: seurattava kalastaja (`step` vaihtaa). */
  followTube(step: number): TubeState | null;
}

/** Askeleen tilanne kulkupelille. */
export interface CraftStep {
  frozen: boolean;
  capsized: boolean;
  reelHeld: boolean;
}

/**
 * Oma kulkupeli: kelluntarengas tai vene (#263), soutu ja airot, kääntyminen
 * tuhdolla, ankkuri (#355) ja paikanvaihto veneessä (#357). Yksinpelissä
 * rengas liikkuu täällä, moninpelissä ennakoidaan ja palvelin on totuus.
 */
export class CraftController {
  /** Yksinpelin kulkupeli; moninpelissä se tulee palvelimelta (aulan valinta). */
  readonly soloCraft = loadCraft();
  /** Veneen soutaja: airot tai vapa ja kääntyminen tuhdolla (#263). */
  readonly seat = new RowerSeat();
  /** Tuhdolla kääntyminen edellisellä askeleella (piirron interpolointiin). */
  prevLook = 0;
  /** Pikapotku päällä (kalastajan silmin näkyvät räpylät, #230). */
  sprinting = false;
  /** Potkuvaiheen puolikas edellisellä päivityksellä (räpylöiden äänet). */
  private strokes = 0;
  /** Yritys soutaa, kun soutaminen ei käy (kyydissä tai viehe ulkona): tilanneohje. */
  private rowHint: string | null = null;
  /** Ankkurin tilanneohje: vajoaa, nousee tai pitää paikallaan. */
  private anchorHint: string | null = null;
  /** Myrskyn laahaus on jo ilmoitettu tälle laskulle. */
  private anchorDragWarned = false;
  /** Paikanvaihdon tilanneohje (#357): toinen pyytää vaihtamaan kanssasi. */
  private seatHint: string | null = null;
  /** Oma paikka veneessä edellisellä askeleella: vaihtuessa ilmoitus. */
  private seenSeat: { boat: number; seat: number } | null = null;

  constructor(private readonly host: CraftHost) {}

  /** Oma kalastaja istuu veneessä (#263): moninpelissä aulan valinta, yksinpelissä oma. */
  get inBoat(): boolean {
    const w = this.host.netWorld;
    return w ? w.boat > 0 : this.soloCraft === 'boat';
  }

  /** Oma kalastaja soutaa venettä (yksinpelissä aina, moninpelissä soutajan paikalla). */
  get rower(): boolean {
    return this.inBoat && !this.host.spectating && !this.host.netWorld?.passenger;
  }

  /** Kalastajan katsesuunta: soutaja voi kääntyä tuhdolla veneen suunnasta. */
  get facing(): number {
    return this.host.tube.heading + (this.rower ? this.seat.look : 0);
  }

  /** Moninpelin veneessä paikkaa voi vaihtaa venekunnan kesken (#357). */
  get crewSeats(): boolean {
    const w = this.host.netWorld;
    return !!w && w.boat > 0 && !this.host.spectating && w.canSwapSeats;
  }

  /** Kulkupelin tilanneohje: paikanvaihto, ankkuri tai soutuyritys. */
  get hint(): string | null {
    return this.seatHint ?? this.anchorHint ?? this.rowHint;
  }

  /** Vieheen vaihe palvelimelle ja veneen säännöille. */
  private lureStage(f: FishingState): LureStage {
    return f.hookedId !== null
      ? LureStage.hooked
      : f.stage === 'flight' || f.stage === 'casting'
        ? LureStage.flight
        : f.stage === 'water'
          ? LureStage.water
          : LureStage.none;
  }

  /** Liikkeen askel: potkut tai soutu, ankkuri, paikanvaihto ja katsojan kamera. */
  step(dt: number, s: CraftStep): void {
    const host = this.host;
    const c = host.controls;
    const { frozen, capsized, reelHeld } = s;
    const still = { kick: 0, turn: 0, sprint: false };
    host.prevTube = host.tube;
    this.prevLook = this.seat.look;
    // Veneen soutaja airoissa soutaa ja kääntää venettä, myös viehe vedessä
    // (soutu-uistelu). Heittäessä ja kelatessa kädet ovat vavassa: vene liukuu
    // ja soutaja kääntyy tuhdolla (#263).
    const raw = frozen || capsized ? still : readTubeInput(c);
    const rodStage = host.fishing.stage;
    const rodInHand =
      rodStage === 'charging' ||
      rodStage === 'casting' ||
      rodStage === 'flight' ||
      (rodStage === 'water' && reelHeld && !frozen);
    const oars = this.rower && c.wasPressed('oars') && !rodInHand && !frozen;
    const move = this.rower ? this.seat.step(raw, rodInHand, oars, dt) : raw;
    // Ankkuri (#355): renkaalla ja veneen soutajalla, ei kyydissä eikä vanhalla palvelimella.
    let anchor = c.wasPressed('anchor') && !frozen && !capsized && !host.spectating;
    const net = host.netWorld;
    const refused =
      !anchor || !net
        ? null
        : net.passenger
          ? 'game.anchorPassenger'
          : net.canAnchor
            ? null
            : 'game.anchorOld';
    if (refused) {
      host.hud.showMessage(t(refused), 2, 'info');
      anchor = false;
    }
    const step: TubeInput = anchor ? { ...move, anchor } : move;
    const f = host.fishing;
    const lureStage = this.lureStage(f);
    this.updateSeat(c.wasPressed('seat') && !frozen && !capsized, lureStage);
    if (oars)
      host.hud.showMessage(
        controlText(this.seat.rowing ? 'game.oarsOut' : 'game.oarsIn'),
        2,
        'info',
      );
    if (host.spectating) {
      const step = c.wasPressed('next') ? 1 : c.wasPressed('prev') ? -1 : 0;
      host.tube = host.followTube(step) ?? host.tube;
    } else if (net) {
      // Veneessä kyytiläinen ei soua, eikä soutaja soua heittäessään tai kelatessaan (#263).
      this.rowHint =
        this.inBoat && raw.kick !== 0 && net.effectiveInput(move, lureStage, rodInHand).kick === 0
          ? t(net.passenger ? 'game.passengerRow' : 'game.rowFishing')
          : null;
      host.tube = net.stepOwn(
        step,
        // Perhoheitossa muille välitetään perhon paikka ilmassa (#236).
        (f.stage === 'casting' && host.fishingView.flyInAir) || f.lure,
        lureStage,
        frozen ? undefined : host.tubeWind,
        !frozen && reelHeld,
        this.rower ? this.seat.look : 0,
      );
    } else {
      const craft = this.inBoat ? CRAFTS.boat : CRAFTS.tube;
      host.tube = stepPlayerTube(host.tube, step, host.water, dt, host.tubeWind, craft, (p) =>
        host.bottom.depthAt(p),
      );
      this.rowHint = this.inBoat && raw.kick !== 0 && move.kick === 0 ? t('game.rowFishing') : null;
    }
    this.updateAnchor(!host.spectating && raw.kick !== 0);
    this.sprinting = !capsized && readTubeInput(c).sprint;
  }

  /** Potkuvaihe kiertää 0–1; kumpikin räpylä loiskahtaa kerran kierroksessa. */
  paddleSounds(): void {
    const strokes = Math.floor(this.host.tube.kickPhase * 2);
    if (strokes !== this.strokes) {
      this.strokes = strokes;
      this.host.sounds.play('paddle');
    }
  }

  /**
   * Ankkurin ilmoitukset ja tilanneohje (#355): pohjaan ja ylös ilmoituksena,
   * vajoaminen, nosto ja potkuyritys ankkurissa tilanneohjeena.
   */
  private updateAnchor(kicking: boolean): void {
    const hud = this.host.hud;
    const was = this.host.prevTube.anchor;
    const a = this.host.tube.anchor;
    const m = (v: number) => decimal(v, 1);
    const bottom = (x: typeof a) => !!x && !x.raising && x.drop >= x.depth;
    if (was?.raising && !a) hud.showMessage(t('game.anchorUp'), 2, 'info');
    if (bottom(a) && was && !bottom(was))
      hud.showMessage(t('game.anchorDown', { m: m(a!.depth) }), 3, 'info');
    if (!bottom(a)) this.anchorDragWarned = false;
    else if (bottom(was) && !this.anchorDragWarned) {
      const moved = Math.hypot(a!.pos.x - was!.pos.x, a!.pos.y - was!.pos.y);
      if (moved > 0) {
        this.anchorDragWarned = true;
        hud.showMessage(t('game.anchorDrag'), 3, 'alert');
      }
    }
    this.anchorHint = !a
      ? null
      : a.raising
        ? controlText('game.anchorRaising', { m: m(a.drop) })
        : a.drop < a.depth
          ? t('game.anchorSinking', { m: m(a.drop), depth: m(a.depth) })
          : kicking
            ? controlText('game.anchorHold')
            : null;
  }

  /**
   * Paikanvaihto veneessä (#357). {seat} hyväksyy toisen pyynnön tai valitsee
   * seuraavan paikan: vapaalle siirrytään, varatusta pyydetään vaihtoa.
   * Tilanneohje kertoo, kun joku pyytää vaihtamaan kanssasi.
   */
  private updateSeat(pressed: boolean, lureStage: LureStage): void {
    const hud = this.host.hud;
    const w = this.host.netWorld;
    if (!w || !w.boat || this.host.spectating) {
      this.seatHint = null;
      this.seenSeat = null;
      return;
    }
    const was = this.seenSeat;
    if (was && was.boat === w.boat && was.seat !== w.seat) {
      this.seat.reset();
      const key =
        w.seat === BoatSeat.rower
          ? 'game.seatRower'
          : w.seat === BoatSeat.stern
            ? 'game.seatStern'
            : 'game.seatBow';
      hud.showMessage(t(key), 3, 'info');
    }
    this.seenSeat = { boat: w.boat, seat: w.seat };
    const crew = w.crewmates();
    const offer = crew.find((m) => m.seatAsk === w.seat);
    this.seatHint =
      offer && w.canSwapSeats ? controlText('game.seatOffer', { name: offer.name }) : null;
    if (!pressed) return;
    const refuse = (key: MsgKey) => hud.showMessage(t(key), 3, 'info');
    if (!w.canSwapSeats) return refuse('game.seatOld');
    if (crew.length === 0) return refuse('game.seatNone');
    if (
      lureStage !== LureStage.none ||
      this.host.timeOutLeft > 0 ||
      w.boatSpeed > SEAT_SWAP.maxSpeed
    )
      return refuse('game.seatBusy');
    const target = offer
      ? offer.seat
      : nextSeatTarget(w.seat, new Set(crew.map((m) => m.seat)), w.seatAsk);
    if (target === null) return refuse('game.seatNone');
    w.sendSeat(target);
    const holder = crew.find((m) => m.seat === target);
    if (holder && !offer)
      hud.showMessage(
        t('game.seatAsked', { name: holder.name, place: seatName(target) }),
        3,
        'info',
      );
  }
}
