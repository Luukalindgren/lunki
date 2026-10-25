import { randomRoomCode } from '@lunki/shared';

/**
 * Yhtä aikaa auki olevien huoneiden yläraja. Huoneen luonti ei vaadi mitään,
 * joten ilman rajaa skripti voisi luoda huoneita, kunnes pelikone tukehtuu.
 */
export const MAX_ROOMS = Number(process.env.LUNKI_MAX_ROOMS) || 100;

/** Käytössä olevat huonekoodit tässä palvelinprosessissa. */
const active = new Set<string>();

export function reserveCode(random: () => number = Math.random): string {
  if (active.size >= MAX_ROOMS)
    throw new Error('Palvelin on täynnä, yritä hetken päästä uudelleen');
  for (let i = 0; i < 1000; i++) {
    const code = randomRoomCode(random);
    if (!active.has(code)) {
      active.add(code);
      return code;
    }
  }
  throw new Error('Huonekoodit loppuivat');
}

export const releaseCode = (code: string) => active.delete(code);
