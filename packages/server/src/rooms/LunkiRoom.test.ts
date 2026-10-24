import { Client, type Room } from '@colyseus/sdk';
import type { Server } from '@colyseus/core';
import {
  ClientMsg,
  LUNKINJARVI,
  ROOM_NAME,
  ServerMsg,
  TubePredictor,
  WaterBody,
  createTube,
  encodeInputs,
  formatRoomCode,
  maxCastDistance,
  parseRoomCode,
  rankPlayers,
  type CatchRecord,
} from '@lunki/shared';
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
    await until(() => seed >= 0 && guest.state.phase === 'countdown');
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

  it('palvelin ajaa renkaan syötteillä ja ennakointi osuu', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 60 },
    });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    guest.send(ClientMsg.ready, true);
    await until(() => players(host).every((p) => p.name === 'A' || p.ready));
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');

    type P = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      heading: number;
      angVel: number;
      kickPhase: number;
      ack: number;
    };
    const me = () => host.state.players.get(host.sessionId) as P;
    const other = () => host.state.players.get(guest.sessionId) as P;
    const start = { x: me().x, y: me().y };
    // Samalta rannalta, mutta ei päällekkäin.
    const gap = Math.hypot(start.x - other().x, start.y - other().y);
    expect(gap).toBeGreaterThan(10);
    expect(gap).toBeLessThan(250);

    // Potkitaan 30 askelta (jonon maksimi kerralla) ja verrataan omaan ennakointiin.
    const water = new WaterBody(LUNKINJARVI);
    const predictor = new TubePredictor(
      { ...createTube({ x: me().x, y: me().y }, me().heading) },
      water,
    );
    for (let k = 0; k < 10; k++) {
      for (let j = 0; j < 3; j++) predictor.step({ kick: 1, turn: 0, sprint: false });
      host.send(ClientMsg.input, { i: encodeInputs(predictor.takeOutgoing()!), l: [0, 0, 0] });
    }
    await until(() => me().ack === 30, 4000);
    const p = me();
    expect(Math.hypot(p.x - start.x, p.y - start.y)).toBeGreaterThan(0.05);
    expect(p.x).toBe(predictor.tube.pos.x);
    expect(p.y).toBe(predictor.tube.pos.y);
    expect(p.heading).toBe(predictor.tube.heading);

    // Liian pitkä heitto hylätään, järkevä ei.
    let rejected = 0;
    host.onMessage(ServerMsg.castRejected, () => rejected++);
    host.send(ClientMsg.splash, { x: p.x + 5, y: p.y });
    host.send(ClientMsg.splash, { x: p.x + maxCastDistance() + 30, y: p.y });
    await until(() => rejected > 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(rejected).toBe(1);

    await host.leave();
    await guest.leave();
  });

  it('isäntä muuttaa asetuksia ja kaikki näkevät ne', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(guest).length === 2);
    guest.send(ClientMsg.ready, true);
    await until(() => players(host).some((p) => p.ready));

    // Vieras ei voi muuttaa asetuksia.
    guest.send(ClientMsg.settings, { durationMinutes: 10 });
    host.send(ClientMsg.settings, {
      durationMinutes: 30,
      winRule: 'biggest',
      difficulty: 'easy',
      maxPlayers: 4,
      weather: 'stormy',
    });
    await until(() => guest.state.settings.durationMinutes === 30);
    const s = guest.state.settings;
    expect([s.winRule, s.difficulty, s.maxPlayers, s.weather]).toEqual([
      'biggest',
      'easy',
      4,
      'calm',
    ]);
    expect([...s.species]).toEqual(['perch']);
    // Muutos nollaa valmiuden.
    await until(() => players(host).every((p) => !p.ready));

    // Täysi huone ei ota lisää pelaajia.
    host.send(ClientMsg.settings, { maxPlayers: 2 });
    await until(() => guest.state.settings.maxPlayers === 2);
    await expect(sdk().joinById(host.roomId, { name: 'C', playerId: 'c' })).rejects.toThrow();

    await host.leave();
    await guest.leave();
  });

  it('neljän pelaajan kisa: punnitus palvelimella ja oikea voittaja', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'Luuka',
      playerId: 'a',
      testTiming: { countdown: 0.2, duration: 1.5 },
    });
    const guests = await Promise.all(
      ['Bertta', 'Cecilia', 'Daniel'].map((name, i) =>
        sdk().joinById(host.roomId, { name, playerId: `g${i}` }),
      ),
    );
    const all = [host, ...guests];
    await until(() => players(host).length === 4);
    for (const g of guests) g.send(ClientMsg.ready, true);
    await until(() => players(host).filter((p) => p.ready).length === 3);
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'countdown');
    expect(host.state.countdown).toBeGreaterThan(0);

    // Lähtölaskennan aikana saalis ei kelpaa.
    let rejected = 0;
    host.onMessage(ServerMsg.catchRejected, () => rejected++);
    host.send(ClientMsg.catch, { species: 'perch', name: 'Ahven', weight: 0.3 });
    await until(() => rejected === 1);
    await until(() => host.state.phase === 'playing');

    const me = (room: Room) => room.state.players.get(room.sessionId) as { x: number; y: number };
    const land = async (room: Room, weight: number) => {
      const p = me(room);
      room.send(ClientMsg.splash, { x: p.x + 10, y: p.y });
      room.send(ClientMsg.catch, { species: 'perch', name: 'Ahven', weight });
    };
    // Ilman heittoa saalis hylätään.
    host.send(ClientMsg.catch, { species: 'perch', name: 'Ahven', weight: 0.4 });
    await until(() => rejected === 2);
    await land(host, 0.4);
    await land(guests[0]!, 0.9);
    await land(guests[1]!, 0.35);
    // Liian painava ahven hylätään.
    await land(guests[2]!, 3);
    await until(() => host.state.catches.length === 3);

    await until(() => all.every((r) => r.state.phase === 'finished'), 4000);
    type C = { player: string; angler: string } & CatchRecord;
    const catches = [...(host.state.catches as Iterable<C>)].map((c) => ({ ...c }));
    const ids = [...new Set(catches.map((c) => c.player))];
    const results = rankPlayers(
      ids.map((id) => ({
        id,
        name: catches.find((c) => c.player === id)!.angler,
        catches: catches.filter((c) => c.player === id),
      })),
      'total',
    );
    expect(results.map((r) => r.name)).toEqual(['Bertta', 'Luuka', 'Cecilia']);
    // Kisan jälkeen saaliita ei enää punnita.
    await land(host, 0.5);
    await until(() => rejected === 3);

    // Isäntä palauttaa aulaan.
    host.send(ClientMsg.restart);
    await until(() => guests[0]!.state.phase === 'lobby' && guests[0]!.state.catches.length === 0);

    for (const r of all) await r.leave();
  });

  it('katkennut pelaaja palaa samaan renkaaseen ja saaliisiin', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 30 },
    });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    guest.send(ClientMsg.ready, true);
    await until(() => players(host).some((p) => p.ready));
    host.send(ClientMsg.start);
    await until(() => guest.state.phase === 'playing');

    type P = { x: number; y: number; ack: number; connected: boolean };
    const gp = () => host.state.players.get(guest.sessionId) as P;
    const pos = { x: gp().x, y: gp().y };
    guest.send(ClientMsg.splash, { x: pos.x + 5, y: pos.y });
    guest.send(ClientMsg.catch, { species: 'perch', name: 'Ahven', weight: 0.5 });
    await until(() => host.state.catches.length === 1);

    // Yhteys katkeaa (esim. sivun uudelleenlataus).
    const token = guest.reconnectionToken;
    const sessionId = guest.sessionId;
    guest.reconnection.enabled = false;
    guest.connection.close(4010);
    await until(() => gp()?.connected === false);
    expect(players(host)).toHaveLength(2);

    const back = await sdk().reconnect(token);
    expect(back.sessionId).toBe(sessionId);
    await until(() => gp().connected === true);
    await until(() => back.state.catches?.length === 1);
    const me = back.state.players.get(back.sessionId) as P;
    expect([me.x, me.y]).toEqual([pos.x, pos.y]);

    await host.leave();
    await back.leave();
  });
});
