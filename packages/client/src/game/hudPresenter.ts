import {
  DIFFICULTIES,
  REEL,
  STAMINA,
  breakingStrength,
  chargePower,
  formatTime,
  holdForce,
  isAshore,
  isFly,
  isUntimed,
  loopProgress,
  rodTip,
  sonarPing,
  timeLeft,
  type CompetitionSettings,
  type CompetitionState,
  type FishPopulation,
  type FishingState,
  type LakeBottom,
  type TubeState,
  type WaterBody,
  type PlayerResult,
} from '@lunki/shared';
import type { Sounds } from '../audio/sounds';
import type { NetWorld } from '../net/netWorld';
import type { Hud, SituationBar } from '../ui/hud';
import { decimal, formatWeight, t } from '../i18n';
import { describeTackle, speciesName } from '../i18n/names';
import { controlText } from './controls';
import type { Guide } from './guide';
import type { Penalties } from './penalties';
import type { Shot } from './director';
import { raceEndCue } from './raceEnd';
import { scoreboardLines } from './raceScoreboard';

/** Katsojan tulostaulussa rivejä: LAN-kisan kaikki kalastajat (#564). */
const SPECTATOR_ROWS = 12;

/** Mitä HUD tarvitsee pelistä. */
export interface HudHost {
  readonly hud: Hud;
  readonly sounds: Sounds;
  readonly netWorld: NetWorld | undefined;
  readonly competition: CompetitionState;
  readonly settings: CompetitionSettings;
  readonly penalties: Penalties;
  readonly fishing: FishingState;
  readonly fish: FishPopulation;
  readonly water: WaterBody;
  readonly bottom: LakeBottom;
  readonly tube: TubeState;
  readonly prevTube: TubeState;
  readonly facing: number;
  readonly viewMode: 'top' | 'pov';
  readonly inBoat: boolean;
  readonly rower: boolean;
  readonly crewSeats: boolean;
  /** Lennetään trombin mukana. */
  readonly flying: boolean;
  /** Ukkonen tai myrsky päällä. */
  readonly thunderNow: boolean;
  /** Perhoa heitetään näppäimillä (rytmissä), ei hiirellä tai sormella. */
  readonly flyKeyboard: boolean;
  /** Kulkupelin tilanneohje (paikanvaihto, ankkuri, soutu). */
  readonly craftHint: string | null;
  /** Täyttökisan palkit kulkupelin ohjeen alle (#482). */
  readonly craftHintBars: SituationBar[] | null;
  readonly guide: Guide;
}

/** Kalastajan askeleen tilanne HUD:lle. */
export interface HudStep {
  tangle: NetWorld['tangle'];
  /** Perhon siima kädessä (jarrun pito). */
  lineHand: boolean;
  lureOut: boolean;
}

/**
 * HUD yhdestä paikasta: mittarit, rangaistukset, ohjeet, tilanneohje ja
 * tilarivi, luotaimet, kello ja saalis- tai tulostaulu. Tilanneohje valitaan
 * tärkeysjärjestyksessä, jotta sama tieto ei toistu ilmoituksena, ohjeessa ja
 * tilarivillä (docs/kehitys.md).
 */
export class HudPresenter {
  private raceHudTimer = 0;
  /** Edellisen askeleen jäljellä oleva aika kisan lopun merkkeihin (#566). */
  private prevLeft: number | null = null;
  /** Loppulaskennan numero lähtölaskennan paikalle, tai null. */
  private endCount: string | null = null;

  constructor(private readonly host: HudHost) {}

  /** Kalastajan HUD yhdeltä askeleelta. */
  show(dt: number, s: HudStep): void {
    const host = this.host;
    const { hud, fishing: f, tube } = host;
    const touch = hud.touchMode;
    hud.setStamina(tube.stamina, STAMINA.tired);
    if (tube.stamina <= 0 && host.prevTube.stamina > 0)
      hud.showMessage(t('game.tired'), 2.5, 'info');
    const cast = f.stage === 'casting' ? f.flyCast : null;
    const marker = DIFFICULTIES[host.settings.difficulty].flyCast.marker;
    hud.flyPanel.update(dt, cast, marker);
    if (cast) {
      // Ajoitusmittari: silmukka aukeaa, ja suorassa siimassa "nyt!" (helppo ja normaali).
      hud.setFlyLoop(
        loopProgress(cast),
        marker && cast.phase === 'loop' && cast.loopAge >= cast.loopTime,
      );
    } else hud.setPower(f.stage === 'charging' ? chargePower(f.charge) : null);
    const hold = holdForce(f, { lineHand: s.lineHand });
    hud.setTension(f.tension, Math.min(hold, f.drag), breakingStrength(f.tackle));
    // Rangaistukset ajastimineen isona ilmoitusalueelle, ei tilapaneelin sekaan.
    host.penalties.show(hud, host.flying);
    const ashore =
      host.tube.bailer || host.tube.shore?.inflate ? 'race' : host.tube.shore ? 'walk' : undefined;
    hud.setAshore(isAshore(tube));
    hud.setHelpContext({
      fly: isFly(f.tackle),
      pov: host.viewMode === 'pov',
      seat: !host.inBoat ? 'tube' : host.rower ? 'rower' : 'passenger',
      crew: host.crewSeats,
      ashore,
    });
    const tangle = s.tangle;
    // Opastus seuraa pelaajaa joka askeleella, vaikka tärkeämpi ohje on näkyvissä.
    const guide = host.guide.update(dt, {
      fishing: f,
      fly: isFly(f.tackle),
      pos: tube.pos,
      seat: !host.inBoat ? 'tube' : host.rower ? 'rower' : 'passenger',
    });
    // Tilanneohje: mitä nyt pitää tehdä. Yksi kerrallaan, tärkein ensin.
    const situation = tangle
      ? `${t('game.tangleStatus', { name: tangle.with, pct: Math.round(tangle.progress * 100) })}\n${controlText('help.tangle')}`
      : f.landing
        ? f.landing.lunge > 0
          ? t('game.lunge')
          : controlText(f.landing.net ? 'game.landNet' : 'game.landHand')
        : f.onLand && f.stage === 'water'
          ? controlText('game.stuckOnLand')
          : cast
            ? cast.busy > 0
              ? t('game.flyUntangle', { s: Math.ceil(cast.busy) })
              : host.flyKeyboard
                ? controlText('game.flyCastKeys')
                : `${controlText('game.flyCastSwing')}\n${controlText(
                    'game.flyCastButtons',
                    {},
                    // Kosketuksella PERU-nappi kertoo itse itsestään: rivi mahtuu pystyruudulle.
                    { skip: touch ? ['cancel'] : [] },
                  )}`
            : host.thunderNow && (s.lureOut || f.hookedId !== null)
              ? t('help.thunder')
              : (host.craftHint ?? (guide && controlText(guide)));
    hud.setSituation(
      situation,
      situation !== null && situation === host.craftHint ? host.craftHintBars : null,
    );
    const lureOut = s.lureOut;
    hud.setStatus([
      describeTackle(f.tackle),
      t('game.line', { m: decimal(f.lineLength, 1) }),
      isFly(f.tackle) && !f.onReel
        ? t('game.flyHand', { m: decimal(f.slack, 1) })
        : t('game.drag', {
            kg: decimal(f.drag, 2),
            gear: f.gear === REEL.fastGear ? t('game.fastGear') : f.gear + 1,
          }),
      t('game.lureDepth', { m: decimal(f.stage === 'water' && !f.onLand ? f.depth : 0, 1) }),
      t('game.bottom', { m: decimal(host.bottom.depthAt(lureOut ? f.lure : tube.pos), 1) }),
    ]);
    hud.sonar.update(dt, () =>
      sonarPing(tube.pos, host.fish.fish, host.bottom.depthAt(tube.pos), {
        floor: host.bottom.bottomTypeAt(tube.pos),
        structure: host.bottom.structureAt(tube.pos),
      }),
    );
    hud.lureSonar.update(dt, f.stage === 'water' && !f.onLand, () => ({
      tip: rodTip(tube.pos, host.facing),
      lure: f.lure,
      depth: f.depth,
      depthAt: (p) => host.bottom.depthAt(p),
      isWater: (p) => host.water.isWater(p),
      structureAt: (p) => host.bottom.structureAt(p),
      bottomTypeAt: (p) => host.bottom.bottomTypeAt(p),
      fish: host.fish.fish.filter(
        (x) => x.mode === 'follow' || x.mode === 'struck' || x.id === f.hookedId,
      ),
      bite: f.struckId !== null,
      biteBig: f.struckId !== null && f.strikeBig,
      hooked: f.hookedId !== null,
      snag: f.snag !== null,
      fouled: f.fouled,
    }));
  }

  /**
   * Katsojan HUD: kenen kisaa seurataan. Ohjaajan ollessa päällä (#564)
   * tilarivi on lähetyksen alaotsikko: SUORA, kuvattava ja mitä tapahtuu,
   * ja viimeisin tapahtuma. Näppäimet ovat ohjeessa (H piilottaa sen).
   */
  showSpectator(
    followed: string | null,
    shot: Shot | null = null,
    news: string | null = null,
  ): void {
    const hud = this.host.hud;
    const name = followed ? this.host.netWorld!.playerName(followed) : null;
    hud.setPower(null);
    hud.setAshore(false);
    hud.setHelpContext({ fly: false, pov: this.host.viewMode === 'pov', seat: 'tube' });
    hud.setSituation(null);
    if (shot) {
      const who = shot.view === 'overview' || !name ? t('broadcast.lake') : name;
      hud.setStatus(
        [
          t('broadcast.live', { who, what: t(`broadcast.${shot.reason}`) }),
          ...(news ? [news] : []),
        ],
        true,
      );
      return;
    }
    hud.setStatus([
      t('mp.spectating'),
      name ? t('game.following', { name }) : t('game.nobody'),
      controlText('game.next'),
      controlText('game.viewToggle'),
    ]);
  }

  /** Kisan kello: jäljellä oleva aika, aikarajattomassa sessiossa kulunut aika (#360). */
  updateTimer(): void {
    const { hud, settings, competition } = this.host;
    if (isUntimed(settings)) {
      hud.setTimer(formatTime(Math.floor(competition.elapsed)), false);
      return;
    }
    const left = timeLeft(competition);
    hud.setTimer(formatTime(left), left < 60);
    this.raceEnd(left);
  }

  /**
   * Kisan loppu (#566): ilmoitus ja äänimerkki minuuttia ennen, viimeiset
   * kymmenen sekuntia isoina numeroina ja piippauksin. Moninpelissä numero
   * menee lähtölaskennan kanssa samaan paikkaan (`updateRaceHud`).
   */
  private raceEnd(left: number): void {
    const { hud, sounds } = this.host;
    const cue = raceEndCue(this.prevLeft, left);
    this.prevLeft = left;
    if (cue.minute) {
      hud.showMessage(t('game.lastMinute'), 4, 'event');
      sounds.play('raceMinute');
    }
    if (cue.tick !== null) sounds.play('raceTick');
    this.endCount = cue.count === null ? null : String(cue.count);
    if (!this.host.netWorld) hud.setCountdown(this.endCount);
  }

  /**
   * Moninpelin lähtölaskenta ja tulostaulu (top 5 + oma sijoitus). Katsojalle
   * koko taulu ja seurattavan rivi merkittynä (`followed`, #564).
   */
  updateRaceHud(followed?: string | null): void {
    const w = this.host.netWorld!;
    const cd = w.phase === 'countdown' ? Math.ceil(w.countdown) : 0;
    this.host.hud.setCountdown(
      w.phase === 'countdown'
        ? String(Math.max(1, cd))
        : this.host.competition.elapsed < 1.2
          ? t('game.go')
          : this.endCount,
    );
    if ((this.raceHudTimer = (this.raceHudTimer + 1) % 15) !== 1) return;
    const lines =
      followed === undefined
        ? scoreboardLines(w.standings(), w.myId)
        : scoreboardLines(w.standings(), followed ?? '', SPECTATOR_ROWS);
    this.host.hud.setCatches([t('game.scoreboard'), ...lines]);
  }

  /** Yksinpelin tulostaulu, kun järvellä on botteja (#624). */
  showScoreboard(standings: readonly PlayerResult[], myId: string): void {
    if ((this.raceHudTimer = (this.raceHudTimer + 1) % 15) !== 1) return;
    this.host.hud.setCatches([t('game.scoreboard'), ...scoreboardLines(standings, myId)]);
  }

  /** Yksinpelin saalislista: määrä ja paino sekä viisi viimeisintä. */
  showSoloCatches(): void {
    const catches = this.host.competition.catches;
    const total = catches.reduce((a, c) => a + c.weight, 0);
    this.host.hud.setCatches(
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
  }
}
