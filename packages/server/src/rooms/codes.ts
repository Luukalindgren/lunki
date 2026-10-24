import { randomRoomCode } from '@lunki/shared';

/** Käytössä olevat huonekoodit tässä palvelinprosessissa. */
const active = new Set<string>();

export function reserveCode(random: () => number = Math.random): string {
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
