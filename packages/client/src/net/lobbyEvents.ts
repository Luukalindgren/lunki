import type { LobbyPlayer, LobbyView } from './session';

/** Aulan pelaajat edellisellä kerralla: sessionId → valmis. */
export type LobbySeen = ReadonlyMap<string, boolean>;

/** Kuinka kauan liittymis- tai valmisilmoitus näkyy aulassa (ms). */
export const LOBBY_EVENT_MS = 6000;

export function lobbySeen(v: LobbyView): LobbySeen {
  return new Map(v.players.map((p) => [p.sessionId, p.ready]));
}

/**
 * Isännälle kerrottavat muutokset aulassa (#516): uudet pelaajat ja ne, jotka
 * merkitsivät itsensä valmiiksi. Ensimmäisellä kerralla (ei edellistä tilaa)
 * ei kerrota mitään, ettei paluu aulaan ilmoita kaikista.
 */
export function lobbyChanges(
  seen: LobbySeen | null,
  v: LobbyView,
): { joined: LobbyPlayer[]; ready: LobbyPlayer[] } {
  if (!seen) return { joined: [], ready: [] };
  const others = v.players.filter((p) => !p.me);
  return {
    joined: others.filter((p) => !seen.has(p.sessionId)),
    ready: others.filter(
      (p) => p.ready && !p.spectator && seen.has(p.sessionId) && !seen.get(p.sessionId),
    ),
  };
}
