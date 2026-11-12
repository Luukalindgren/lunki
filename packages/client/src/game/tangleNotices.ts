import type { FishingState, RaceStatsCounter } from '@lunki/shared';
import type { Sounds } from '../audio/sounds';
import { t } from '../i18n';
import type { Hud } from '../ui/hud';

/** Mitä oman siimasotkun ilmoitukset tarvitsevat pelistä. */
export interface TangleNoticeHost {
  readonly hud: Hud;
  readonly sounds: Sounds;
  readonly fishing: FishingState;
  readonly raceStatsCounter: RaceStatsCounter;
  resetFishing(): void;
}

/** Oma siima sotkeutui: ääni, ilmoitus ja tilasto. Sama moninpelissä ja bottien kanssa. */
export function tangleStarted(host: TangleNoticeHost, name: string): void {
  host.raceStatsCounter.tangle();
  host.sounds.play('tangled');
  host.hud.showMessage(t('game.tangled', { name }), 3, 'alert');
}

/**
 * Oma sotku päättyi: kelaamalla selvinnyt (`untangled`) tai katkaistu (`cut`).
 * `by` = katkaisijan nimi, tai null, kun katkaisin itse.
 */
export function tangleEnded(
  host: TangleNoticeHost,
  how: 'untangled' | 'cut',
  by: string | null,
): void {
  const hud = host.hud;
  const hooked = host.fishing.hookedId !== null;
  if (how === 'untangled') {
    host.resetFishing();
    hud.showMessage(hooked ? t('game.untangledLost') : t('game.untangled'), 2.5);
  } else if (by === null) {
    host.resetFishing();
    host.sounds.play('lineCutFree');
    hud.showMessage(t('game.youCut'), 2);
  } else {
    hud.showMessage(t('game.otherCut', { name: by }), 2.5);
  }
}
