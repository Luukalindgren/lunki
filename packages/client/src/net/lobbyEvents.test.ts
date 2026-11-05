import { describe, expect, it } from 'vitest';
import { lobbyChanges, lobbySeen } from './lobbyEvents';
import type { LobbyPlayer, LobbyView } from './session';

const player = (id: string, over: Partial<LobbyPlayer> = {}) =>
  ({ sessionId: id, name: id, ready: false, me: false, spectator: false, ...over }) as LobbyPlayer;
const view = (players: LobbyPlayer[]) => ({ players }) as LobbyView;

describe('aulan ilmoitukset isännälle (#516)', () => {
  it('ensimmäisellä kerralla ei ilmoiteta', () => {
    const v = view([player('host', { me: true }), player('a')]);
    expect(lobbyChanges(null, v)).toEqual({ joined: [], ready: [] });
  });

  it('uusi pelaaja ja valmiiksi merkinnyt', () => {
    const before = lobbySeen(view([player('host', { me: true }), player('a')]));
    const v = view([player('host', { me: true }), player('a', { ready: true }), player('b')]);
    const c = lobbyChanges(before, v);
    expect(c.joined.map((p) => p.sessionId)).toEqual(['b']);
    expect(c.ready.map((p) => p.sessionId)).toEqual(['a']);
  });

  it('jo valmiina ollut, oma muutos ja katsoja eivät ilmoita valmiudesta', () => {
    const before = lobbySeen(
      view([player('host', { me: true }), player('a', { ready: true }), player('s')]),
    );
    const v = view([
      player('host', { me: true, ready: true }),
      player('a', { ready: true }),
      player('s', { ready: true, spectator: true }),
    ]);
    expect(lobbyChanges(before, v)).toEqual({ joined: [], ready: [] });
  });
});
