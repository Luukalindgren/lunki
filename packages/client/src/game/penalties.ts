import {
  LIGHTNING,
  OUT_OF_RACE,
  isUntimed,
  penaltyOutcome,
  type CompetitionSettings,
  type CompetitionState,
  type Penalty,
} from '@lunki/shared';
import type { NetWorld } from '../net/netWorld';
import type { Hud } from '../ui/hud';
import { t } from '../i18n';

/** Aikarajattomasta sessiosta pudonneen tulossivu aukeaa näin monen sekunnin päästä (#360). */
const OUT_END_DELAY = 5;

/**
 * Omat rangaistukset: jäähy, kisasta putoaminen, kumossaolo ja niiden selitys
 * ajastimen alle (`Hud.setPenalties`). Yksinpelissä ajat pidetään täällä,
 * moninpelissä palvelin ilmoittaa ne (`NetWorld.outUntil`, `capsizedUntil`).
 */
export class Penalties {
  /** Yksinpelin jäähy (kisa-aika, s); maalle heiton odotus myös moninpelissä. */
  outUntil = 0;
  /** Kisa-aika, jolloin pelaaja putosi kisasta (rangaistus `out`). */
  private outAt = 0;
  /** Mistä jäähy tuli (tilarivin teksti). */
  outLabel = t('game.timeOut');
  /** Yksinpelissä rengas kumossa tähän kisa-aikaan asti; kaatumishetki animaatioon. */
  capsizedUntil = 0;
  capsizedAt = -Infinity;
  /** Rangaistuksen syy ja ohje (Kaaduit! Käänny aaltoa kohti…) ajastimen alle. */
  private note: string | null = null;
  private noteAt = 0;

  constructor(
    private readonly competition: CompetitionState,
    private readonly settings: CompetitionSettings,
    private readonly net: NetWorld | undefined,
  ) {}

  /**
   * Rangaistus omasta osumasta: jäähy ja saaliin menetys. Moninpelissä
   * palvelin pitää jäähyn ja saaliit. Palauttaa seurauksen tekstinä.
   */
  punish(penalty: Penalty, label: string, timeOut: number = LIGHTNING.timeOut): string {
    const outcome = penaltyOutcome(penalty, this.competition.elapsed, timeOut);
    if (outcome.outUntil > 0) this.outLabel = label;
    if (!this.net) this.outUntil = Math.max(this.outUntil, outcome.outUntil);
    if (outcome.outUntil >= OUT_OF_RACE) this.outAt = this.competition.elapsed;
    if (outcome.loseCatch) this.competition.catches.length = 0;
    return {
      none: '',
      'time-out': t('game.penaltyTimeOut', { s: timeOut }),
      'lose-catch': t('game.penaltyLoseCatch'),
      out: t('game.penaltyOut'),
    }[penalty];
  }

  /** Odotus, esim. uusi viehe maalle heiton jälkeen (s). */
  wait(seconds: number, label: string): void {
    this.outUntil = Math.max(this.outUntil, this.competition.elapsed + seconds);
    this.outLabel = label;
  }

  /** Oma rengas kumossa tähän kisa-aikaan asti. */
  get capsizedUntilAbs(): number {
    return this.net ? this.net.capsizedUntil : this.capsizedUntil;
  }

  /** Kumossa jäljellä (s). */
  get capsizeLeft(): number {
    return Math.max(0, this.capsizedUntilAbs - this.competition.elapsed);
  }

  /** Jäähyä jäljellä (s); pudonneella Infinity. */
  get timeOutLeft(): number {
    // Maalle heiton sakko kirjataan heti myös omalle koneelle (palvelin vahvistaa).
    const until = Math.max(this.net?.outUntil ?? 0, this.outUntil);
    if (until >= OUT_OF_RACE) return Infinity;
    return Math.max(0, until - this.competition.elapsed);
  }

  /** Rangaistuskortin selitys; `extra` = seuraus, jota ajastinrivi ei kerro (saalis meni). */
  setNote(note: string, extra = ''): void {
    this.note = extra ? `${note}\n${extra}` : note;
    this.noteAt = this.competition.elapsed;
  }

  /**
   * Rangaistusrivit ajastimineen ja selitys. Selitys poistuu, kun
   * rangaistus on ohi; moninpelissä kumossaolo tulee palvelimelta hetken
   * viiveellä, joten selitys säilyy sen ajan.
   */
  show(hud: Hud, flying: boolean): void {
    const capsized = this.capsizeLeft > 0;
    const timeOut = this.timeOutLeft;
    hud.setPenalties(
      [
        ...(flying
          ? [{ label: t('game.flying') }]
          : capsized
            ? [{ label: t('game.capsizedUpright'), seconds: this.capsizeLeft }]
            : []),
        ...(timeOut === Infinity
          ? [{ label: t('game.penaltyOut') }]
          : timeOut > 0
            ? [{ label: this.outLabel, seconds: timeOut }]
            : []),
      ],
      this.note ?? undefined,
    );
    if (!flying && !capsized && timeOut === 0 && this.competition.elapsed - this.noteAt > 1)
      this.note = null;
  }

  /**
   * Aikarajattomasta sessiosta pudonnut (#360): sessio päättyy tulossivulle,
   * kun rangaistuksen ilmoitus on ehditty lukea. Ajastetussa kisassa odotetaan
   * ajan loppumista.
   */
  outOfSession(): boolean {
    if (!isUntimed(this.settings) || this.outUntil < OUT_OF_RACE) return false;
    if (this.competition.elapsed - this.outAt < OUT_END_DELAY) return false;
    this.competition.finished = true;
    return true;
  }
}
