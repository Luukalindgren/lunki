import { LureStage, distance, type Vec2 } from '@lunki/shared';
import { decimal, t } from '../i18n';

/** Seurattavan kalastajan tiedot verkon yli tulevasta tilasta (#814). */
export interface FollowedAngler {
  pos: Vec2;
  lure: Vec2 | null;
  lureStage: number;
  fly?: boolean;
  pole?: boolean;
}

/**
 * Katsojan tilarivi seurattavasta (#814): kalastustapa, vaihe ja siiman
 * pituus, esim. "Onki · kala kiinni · 9,1 m". `surfaced` = kala pinnassa
 * nostettavana (#813). Siiman pituus on suora matka vieheeseen.
 */
export function anglerState(p: FollowedAngler, surfaced = false): string {
  const method = t(p.fly ? 'method.fly' : p.pole ? 'method.pole' : 'method.spin');
  const out = p.lure !== null && p.lureStage !== LureStage.none;
  const hooked = out && p.lureStage === LureStage.hooked;
  const stage = !out
    ? t('spectate.stageIn')
    : p.lureStage === LureStage.flight
      ? t('spectate.stageCast')
      : hooked
        ? t(surfaced ? 'spectate.stageSurfaced' : 'spectate.stageHooked')
        : t('spectate.stageWater');
  const parts = [method, stage];
  if (out && p.lureStage !== LureStage.flight)
    parts.push(`${decimal(distance(p.pos, p.lure!), 1)} m`);
  return parts.join(' · ');
}
