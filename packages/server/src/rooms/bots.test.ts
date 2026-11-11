import { Client, type Room } from '@colyseus/sdk';
import type { Server } from '@colyseus/core';
import {
  BOT_NAMES,
  ClientMsg,
  PROTOCOL_VERSION,
  ROOM_NAME,
  ServerMsg,
  isBotId,
  type EmoteMessage,
} from '@lunki/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/open';
import { FeedbackStore } from '../feedback/store';
import { RecordStore } from '../records/store';
import { createServer } from '../server';

const PORT = 31000 + Math.floor(Math.random() * 2000);
let server: Server;

const sdk = () => new Client(`ws://localhost:${PORT}`);
const opts = (name: string) => ({ name, playerId: name, protocol: PROTOCOL_VERSION });

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('aikakatkaisu');
    await new Promise((r) => setTimeout(r, 10));
  }
}

interface P {
  name: string;
  ready: boolean;
  x: number;
  y: number;
  lureStage: number;
  spectator: boolean;
}
const entries = (room: Room): [string, P][] => [
  ...((room.state as { players?: Map<string, P> } | undefined)?.players?.entries() ?? []),
];
const bots = (room: Room) => entries(room).filter(([id]) => isBotId(id));
const humans = (room: Room) => entries(room).filter(([id]) => !isBotId(id));

beforeAll(async () => {
  const db = openDatabase(':memory:');
  server = createServer({ records: new RecordStore(db), feedback: new FeedbackStore(db) });
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('botit huoneessa (#624)', () => {
  it('botit täyttävät aulan tyhjät paikat ja väistyvät pelaajan tieltä', async () => {
    const host = await sdk().create(ROOM_NAME, { ...opts('A'), maxPlayers: 4 });
    await until(() => entries(host).length === 1);
    host.send(ClientMsg.settings, { bots: 'fill', botLevel: 'veteran' });
    await until(() => bots(host).length === 3);
    expect(host.state.settings.botLevel).toBe('veteran');
    expect(bots(host).map(([, p]) => p.name)).toEqual(BOT_NAMES.slice(0, 3));
    expect(bots(host).every(([, p]) => p.ready && !p.spectator)).toBe(true);

    // Pelaaja vie botin paikan, eikä huone ole hänelle täynnä.
    const guest = await sdk().joinById(host.roomId, opts('B'));
    await until(() => humans(host).length === 2 && bots(host).length === 2);
    // Isompi huone: botteja tulee lisää; pienempi: ne vähenevät.
    host.send(ClientMsg.settings, { maxPlayers: 8 });
    await until(() => bots(host).length === 6);
    host.send(ClientMsg.settings, { maxPlayers: 2 });
    await until(() => bots(host).length === 0);
    host.send(ClientMsg.settings, { maxPlayers: 4 });
    await until(() => bots(host).length === 2);
    // Sääntöjen muutos vie pelaajien valmiuden, mutta botit pysyvät valmiina.
    guest.send(ClientMsg.ready, true);
    await until(() => humans(host).some(([, p]) => p.ready));
    host.send(ClientMsg.settings, { durationMinutes: 30 });
    await until(() => humans(host).every(([, p]) => !p.ready));
    expect(bots(host).every(([, p]) => p.ready)).toBe(true);
    // Lähteneen tilalle tulee botti; botti ei peri isännyyttä.
    await guest.leave();
    await until(() => bots(host).length === 3);
    expect(host.state.hostId).toBe(host.sessionId);
    host.send(ClientMsg.settings, { bots: 'none' });
    await until(() => bots(host).length === 0);
    await host.leave();
  });

  it('botit kalastavat kisassa, ja kesken kisan tullut saa botin paikan', async () => {
    const host = await sdk().create(ROOM_NAME, {
      ...opts('A'),
      maxPlayers: 4,
      testTiming: { countdown: 0.1, duration: 12 },
    });
    await until(() => entries(host).length === 1);
    host.send(ClientMsg.settings, { bots: 'fill', difficulty: 'easy' });
    await until(() => bots(host).length === 3);
    const emotes: EmoteMessage[] = [];
    host.onMessage(ServerMsg.emote, (m: EmoteMessage) => emotes.push(m));
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');
    const start = new Map(bots(host).map(([id, p]) => [id, { x: p.x, y: p.y }]));
    // Botit aloittavat vesiltä ja heittävät: viehe näkyy muille.
    await until(() => bots(host).some(([, p]) => p.lureStage > 0), 8000);
    // Kesken kisan tullut pelaaja: viimeisin botti väistyy ja jää tuloksiin lähteneenä.
    const late = await sdk().joinById(host.roomId, opts('B'));
    await until(() => humans(host).length === 2 && bots(host).length === 2);
    expect(bots(host).map(([id]) => id)).toEqual(['bot:0', 'bot:1']);
    expect([...host.state.departed.keys()]).toEqual(['bot:2']);
    await until(() => host.state.phase === 'finished', 15000);
    // Botit liikkuivat tai ainakin kääntyivät: tila elää ilman asiakasta.
    const moved = bots(host).filter(([id, p]) => {
      const s = start.get(id)!;
      return Math.hypot(p.x - s.x, p.y - s.y) > 0.01;
    });
    expect(moved.length).toBeGreaterThan(0);
    // Uusi kisa: botit täyttävät taas vapaat paikat.
    host.send(ClientMsg.restart);
    await until(() => host.state.phase === 'lobby' && bots(host).length === 2);
    expect(bots(host).every(([, p]) => p.ready)).toBe(true);
    await late.leave();
    await host.leave();
  }, 40_000);
});
