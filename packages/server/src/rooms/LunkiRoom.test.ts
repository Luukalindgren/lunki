import { Client, type Room } from '@colyseus/sdk';
import type { Server } from '@colyseus/core';
import { ClientMsg, ROOM_NAME, ServerMsg, formatRoomCode, parseRoomCode } from '@lunki/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../server';

const PORT = 25000 + Math.floor(Math.random() * 5000);
let server: Server;
const sdk = () => new Client(`ws://localhost:${PORT}`);

/** Odottaa, kunnes ehto täyttyy (tilan päivitykset tulevat asynkronisesti). */
async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('aikakatkaisu');
    await new Promise((r) => setTimeout(r, 10));
  }
}

type PlayerView = { name: string; ready: boolean };
// Tila saapuu asynkronisesti liittymisen jälkeen.
const players = (room: Room): PlayerView[] => [
  ...((room.state as { players?: Map<string, PlayerView> } | undefined)?.players?.values() ?? []),
];

beforeAll(async () => {
  server = createServer();
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('LunkiRoom', () => {
  it('kaksi pelaajaa samaan huoneeseen koodilla', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'Luuka', playerId: 'a' });
    const code = host.roomId;
    expect(parseRoomCode(formatRoomCode(code))).toBe(code);

    const guest = await sdk().joinById(parseRoomCode(`lunki-${code.toLowerCase()}`)!, {
      name: 'Luuka',
      playerId: 'b',
    });
    await until(() => players(host).length === 2 && players(guest).length === 2);
    // Sama nimi saa numeron perään.
    expect(players(guest).map((p) => p.name)).toEqual(['Luuka', 'Luuka 2']);
    expect(guest.state.hostId).toBe(host.sessionId);
    expect(guest.state.code).toBe(code);

    await host.leave();
    await guest.leave();
  });

  it('kisa alkaa vasta kun muut ovat valmiina', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);

    const errors: string[] = [];
    host.onMessage(ServerMsg.error, (m: string) => errors.push(m));
    let seed = -1;
    guest.onMessage(ServerMsg.started, (m: { seed: number }) => (seed = m.seed));

    host.send(ClientMsg.start);
    await until(() => errors.length === 1);
    expect(errors[0]).toContain('B');

    // Vieras ei voi aloittaa.
    const guestErrors: string[] = [];
    guest.onMessage(ServerMsg.error, (m: string) => guestErrors.push(m));
    guest.send(ClientMsg.start);
    await until(() => guestErrors.length === 1);

    guest.send(ClientMsg.ready, true);
    await until(() => players(host).every((p, i) => i === 0 || p.ready));
    host.send(ClientMsg.start);
    await until(() => seed >= 0 && guest.state.phase === 'playing');
    expect(guest.state.seed).toBe(seed);

    // Alkaneeseen kisaan ei pääse mukaan.
    await expect(sdk().joinById(host.roomId, { name: 'C', playerId: 'c' })).rejects.toThrow();

    await host.leave();
    await guest.leave();
  });

  it('isännyys siirtyy, kun luoja lähtee', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(guest).length === 2);
    await host.leave();
    await until(() => guest.state.hostId === guest.sessionId);
    await guest.leave();
  });

  it('tuntematon koodi ei kelpaa', async () => {
    await expect(sdk().joinById('ZZZZ', { name: 'A', playerId: 'a' })).rejects.toThrow();
  });
});
