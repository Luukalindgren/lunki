import { t } from '../i18n';
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
  // Botit (#624) tulevat ja menevät paikkojen mukana: niistä ei ilmoiteta.
  const others = v.players.filter((p) => !p.me && !p.bot);
  return {
    joined: others.filter((p) => !seen.has(p.sessionId)),
    ready: others.filter(
      (p) => p.ready && !p.spectator && seen.has(p.sessionId) && !seen.get(p.sessionId),
    ),
  };
}

/**
 * Ilmoituksen teksti otsikon riville: yksi pelaaja nimellä, useampi määränä,
 * ettei teksti rivity ja siirrä listaa, kun moni on valmis kerralla (#526).
 */
export function lobbyEventText(
  joined: readonly LobbyPlayer[],
  ready: readonly LobbyPlayer[],
): string {
  const part = (
    list: readonly LobbyPlayer[],
    one: 'lobby.joined' | 'lobby.becameReady',
    many: 'lobby.joinedMany' | 'lobby.readyMany',
  ) =>
    list.length === 0
      ? []
      : [list.length === 1 ? t(one, { name: list[0]!.name }) : t(many, { n: list.length })];
  return [
    ...part(joined, 'lobby.joined', 'lobby.joinedMany'),
    ...part(ready, 'lobby.becameReady', 'lobby.readyMany'),
  ].join(' · ');
}
