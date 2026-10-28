import {
  DIFFICULTIES,
  REEL,
  STAMINA,
  breakingStrength,
  chargePower,
  formatTime,
  holdForce,
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
} from '@lunki/shared';
import type { NetWorld } from '../net/netWorld';
import type { Hud } from '../ui/hud';
import { decimal, formatWeight, t } from '../i18n';
import { describeTackle, speciesName } from '../i18n/names';
import { controlText } from './controls';
import type { Guide } from './guide';
import type { Penalties } from './penalties';
import { scoreboardLines } from './raceScoreboard';

/** Mitä HUD tarvitsee pelistä. */
export interface HudHost {
  readonly hud: Hud;
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
    hud.setHelpContext({
      fly: isFly(f.tackle),
      pov: host.viewMode === 'pov',
      seat: !host.inBoat ? 'tube' : host.rower ? 'rower' : 'passenger',
      crew: host.crewSeats,
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
    hud.setSituation(
      tangle
        ? `${t('game.tangleStatus', { name: tangle.with, pct: Math.round(tangle.progress * 100) })}\n${controlText('help.tangle')}`
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
              : (host.craftHint ?? (guide && controlText(guide))),
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
      hooked: f.hookedId !== null,
      snag: f.snag !== null,
      fouled: f.fouled,
    }));
  }

  /** Katsojan HUD: kenen kisaa seurataan. */
  showSpectator(followed: string | null): void {
    const hud = this.host.hud;
    const name = followed ? this.host.netWorld!.playerName(followed) : null;
    hud.setPower(null);
    hud.setHelpContext({ fly: false, pov: this.host.viewMode === 'pov', seat: 'tube' });
    hud.setSituation(null);
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
  }

  /** Moninpelin lähtölaskenta ja tulostaulu (top 5 + oma sijoitus). */
  updateRaceHud(): void {
    const w = this.host.netWorld!;
    const cd = w.phase === 'countdown' ? Math.ceil(w.countdown) : 0;
    this.host.hud.setCountdown(
      w.phase === 'countdown'
        ? String(Math.max(1, cd))
        : this.host.competition.elapsed < 1.2
          ? t('game.go')
          : null,
    );
    if ((this.raceHudTimer = (this.raceHudTimer + 1) % 15) !== 1) return;
    this.host.hud.setCatches([t('game.scoreboard'), ...scoreboardLines(w.standings(), w.myId)]);
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
