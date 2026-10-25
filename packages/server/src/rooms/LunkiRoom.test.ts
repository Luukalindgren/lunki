import { Client, type Room } from '@colyseus/sdk';
import { matchMaker, type Server } from '@colyseus/core';
import {
  ClientMsg,
  DEFAULT_APPEARANCE,
  LUNKINJARVI,
  ROOM_NAME,
  ERRORS_PATH,
  FEEDBACK_PATH,
  RECORDS_PATH,
  ServerMsg,
  TubePredictor,
  WaterBody,
  createTube,
  findOpenWaterPoint,
  encodeInputs,
  formatRoomCode,
  BIG_WAVE,
  OUT_OF_RACE,
  bigWaveHeight,
  maxCastDistance,
  parseRoomCode,
  planWeather,
  rankPlayers,
  resolveStrike,
  weatherAt,
  CHAT_MAX_LENGTH,
  PROTOCOL_VERSION,
  CHAT_RATE,
  type ChatMessage,
  type CatchRecord,
  type BigWaveMessage,
  type RecordBoard,
  type RecordMessage,
  type UntangledMessage,
  type LightningMessage,
  type TubeState,
  type WeatherPlan,
  type Strike,
} from '@lunki/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/open';
import { FeedbackStore } from '../feedback/store';
import { RecordStore } from '../records/store';
import { createServer } from '../server';

const PORT = 25000 + Math.floor(Math.random() * 5000);
let server: Server;
let feedback: FeedbackStore;
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
  const db = openDatabase(':memory:');
  feedback = new FeedbackStore(db);
  server = createServer({ records: new RecordStore(db), feedback });
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
    // Sää lasketaan samasta siemenestä kuin asiakkailla.
    const plan = planWeather(seed, 'realistic', guest.state.settings.durationMinutes * 60);
    expect(guest.state.sky).toBe(weatherAt(plan, 0).sky);

    // Alkaneeseen kisaan ei pääse mukaan.
    await expect(sdk().joinById(host.roomId, { name: 'C', playerId: 'c' })).rejects.toThrow();

    await host.leave();
    await guest.leave();
  });

  it('isännän kartalta valitsema aloituspaikka', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    const water = new WaterBody(LUNKINJARVI);
    const spot = findOpenWaterPoint(water, LUNKINJARVI.bounds);

    // Maalla oleva piste hylätään, vedessä oleva näkyy kaikille.
    host.send(ClientMsg.settings, { start: { x: LUNKINJARVI.bounds.maxX + 100, y: 0 } });
    host.send(ClientMsg.settings, { start: spot });
    await until(() => guest.state.settings.customStart === true);
    expect(guest.state.settings.startX).toBeCloseTo(spot.x, 0);
    expect(guest.state.settings.startY).toBeCloseTo(spot.y, 0);

    guest.send(ClientMsg.ready, true);
    await until(() => players(host).every((p, i) => i === 0 || p.ready));
    host.send(ClientMsg.start);
    await until(() => guest.state.phase === 'countdown');
    const spawned = [...guest.state.players.values()] as { x: number; y: number }[];
    for (const p of spawned) {
      expect(Math.hypot(p.x - spot.x, p.y - spot.y)).toBeLessThanOrEqual(61);
      expect(water.isWater(p)).toBe(true);
    }

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

  it('varusteet näkyvät muille, ja kelvottomat hylätään', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    type Gear = { rod: string; lure: string; line: string; leader: boolean };
    const gear = () => (players(host) as unknown as Gear[])[1]!;
    expect(gear()).toMatchObject({ rod: 'medium', lure: 'spoon', line: 'medium', leader: false });
    guest.send(ClientMsg.tackle, { rod: 'heavy', lure: 'wobbler', line: 'thick', leader: true });
    await until(() => gear().rod === 'heavy');
    expect(gear()).toMatchObject({ lure: 'wobbler', line: 'thick', leader: true });
    guest.send(ClientMsg.tackle, { rod: 'huijaus', lure: 'jig', line: 'thin', leader: false });
    guest.send(ClientMsg.tackle, { lure: 'jig' });
    await until(() => gear().lure === 'jig');
    // Puuttuva vapa täydentyy oletukseksi, kelvoton viesti ei muuta mitään.
    expect(gear()).toMatchObject({ rod: 'medium', line: 'medium', leader: false });
    await host.leave();
    await guest.leave();
  });

  it('värit näkyvät muille, ja tuntemattomat korvautuvat oletuksilla', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    type Colors = { tubeColor: number; finColor: number; shirtColor: number; lineColor: number };
    const colors = () => (players(host) as unknown as Colors[])[1]!;
    expect(colors().tubeColor).toBe(DEFAULT_APPEARANCE.tube);
    guest.send(ClientMsg.appearance, {
      tube: 0xf6d04d,
      fins: 0xd23a2a,
      shirt: 0x1b5a84,
      line: 0x9ef0d6,
    });
    await until(() => colors().tubeColor === 0xf6d04d);
    expect(colors()).toMatchObject({
      finColor: 0xd23a2a,
      shirtColor: 0x1b5a84,
      lineColor: 0x9ef0d6,
    });
    guest.send(ClientMsg.appearance, {
      tube: 0x123456,
      fins: 0xd23a2a,
      shirt: 0x1b5a84,
      line: 0x9ef0d6,
    });
    await until(() => colors().tubeColor === DEFAULT_APPEARANCE.tube);
    expect(colors().finColor).toBe(0xd23a2a);
    await host.leave();
    await guest.leave();
  });

  it('saman kalan voi nostaa vain kerran', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 30 },
    });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    guest.send(ClientMsg.ready, true);
    await until(() => players(host).filter((p) => p.ready).length === 1);
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');
    let rejected = 0;
    guest.onMessage(ServerMsg.catchRejected, () => rejected++);
    const land = (room: Room, fish: { slot: number; gen: number }) => {
      const p = room.state.players.get(room.sessionId) as { x: number; y: number };
      room.send(ClientMsg.splash, { x: p.x + 10, y: p.y });
      room.send(ClientMsg.catch, { species: 'perch', name: 'Ahven', weight: 0.3, fish });
    };
    land(host, { slot: 7, gen: 0 });
    await until(() => host.state.catches.length === 1);
    expect(host.state.catches[0].fishSlot).toBe(7);
    land(guest, { slot: 7, gen: 0 });
    await until(() => rejected === 1);
    // Paikan seuraava sukupolvi on eri kala.
    land(guest, { slot: 7, gen: 1 });
    await until(() => host.state.catches.length === 2);
    await host.leave();
    await guest.leave();
  });

  it('palaute ja virheraportit tallentuvat palvelimelle', async () => {
    const post = (path: string, body: unknown) =>
      fetch(`http://localhost:${PORT}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(body),
      });
    const ok = await post(FEEDBACK_PATH, { name: 'Luuka', text: ' Hauki karkasi! ', context: 'x' });
    expect(ok.status).toBe(200);
    expect((await post(FEEDBACK_PATH, { name: 'tyhjä', text: '   ' })).status).toBe(400);
    expect(feedback.feedback()[0]).toMatchObject({ name: 'Luuka', text: 'Hauki karkasi!' });

    const err = { message: 'TypeError: x is undefined', source: 'main.js:1:2', stack: 's' };
    await post(ERRORS_PATH, err);
    await post(ERRORS_PATH, { ...err, stack: 's2' });
    expect(feedback.errors()).toMatchObject([{ message: err.message, count: 2, stack: 's2' }]);
  });

  it('chat-viestit kaikille, nopeusrajoitus ja historia uusille', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    const seen: ChatMessage[] = [];
    guest.onMessage(ServerMsg.chat, (m: ChatMessage) => seen.push(m));
    let rejected = 0;
    host.onMessage(ServerMsg.chatRejected, () => rejected++);
    host.onMessage(ServerMsg.chat, () => undefined);

    // Tyhjä ja väärän tyyppinen ohitetaan, pitkä katkaistaan.
    host.send(ClientMsg.chat, '   ');
    host.send(ClientMsg.chat, { text: 'x' });
    host.send(ClientMsg.chat, ' moi\n kaikki ');
    host.send(ClientMsg.chat, 'k'.repeat(CHAT_MAX_LENGTH + 50));
    await until(() => seen.length === 2);
    expect(seen[0]).toMatchObject({ from: host.sessionId, name: 'A', text: 'moi kaikki' });
    expect(seen[1]!.text).toHaveLength(CHAT_MAX_LENGTH);

    // Purske täyttyy: loput hylätään.
    for (let i = 0; i < CHAT_RATE.burst; i++) host.send(ClientMsg.chat, `viesti ${i}`);
    await until(() => rejected >= 2);
    expect(seen.length).toBe(CHAT_RATE.burst);

    // Myöhemmin liittyvä saa aiemmat viestit.
    let history: ChatMessage[] = [];
    const late = await sdk().joinById(host.roomId, { name: 'C', playerId: 'c' });
    late.onMessage(ServerMsg.chatHistory, (m: ChatMessage[]) => (history = m));
    late.onMessage(ServerMsg.chat, () => undefined);
    await until(() => history.length === CHAT_RATE.burst);
    expect(history.map((m) => m.text)).toEqual(seen.map((m) => m.text));

    await host.leave();
    await guest.leave();
    await late.leave();
  });

  it('tuntematon viestityyppi ei katkaise yhteyttä, ja protokollaversio näkyy', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    await until(() => players(host).length === 1);
    expect(host.state.protocol).toBe(PROTOCOL_VERSION);
    let left = false;
    host.onLeave(() => (left = true));
    // Uudempi asiakas voi lähettää viestin, jota tämä palvelin ei vielä tunne.
    host.send('tulevaisuuden-viesti', { x: 1 });
    host.send(ClientMsg.name, 'Uusi');
    await until(() => players(host)[0]?.name === 'Uusi');
    expect(left).toBe(false);
    await host.leave();
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
    // Tyynellä ei tuule: ennakointi osuu täsmälleen.
    host.send(ClientMsg.settings, { weather: 'calm' });
    await until(() => guest.state.settings.weather === 'calm');
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
      weather: 'chaos',
      species: ['perch', 'zander'],
    });
    await until(() => guest.state.settings.durationMinutes === 30);
    const s = guest.state.settings;
    expect([s.winRule, s.difficulty, s.maxPlayers, s.weather]).toEqual([
      'biggest',
      'easy',
      4,
      'chaos',
    ]);
    expect([...s.species]).toEqual(['perch', 'zander']);
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
    const records: RecordMessage[] = [];
    guests[2]!.onMessage(ServerMsg.record, (m: RecordMessage) => records.push(m));
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
    // Punnitut saaliit päätyvät järven ennätyslistalle.
    await until(() => records.length === 3);
    expect(records.map((r) => [r.angler, r.place])).toEqual([
      ['Luuka', 1],
      ['Bertta', 1],
      ['Cecilia', 3],
    ]);
    const board = (await (
      await fetch(`http://localhost:${PORT}${RECORDS_PATH}`)
    ).json()) as RecordBoard;
    expect(board.normal?.perch?.slice(0, 3).map((r) => [r.angler, r.weight])).toEqual([
      ['Bertta', 0.9],
      ['Luuka', 0.4],
      ['Cecilia', 0.35],
    ]);
    // Kisan jälkeen saaliita ei enää punnita.
    await land(host, 0.5);
    await until(() => rejected === 3);

    // Isäntä palauttaa aulaan.
    host.send(ClientMsg.restart);
    await until(() => guests[0]!.state.phase === 'lobby' && guests[0]!.state.catches.length === 0);

    for (const r of all) await r.leave();
  });

  it('salama osuu vain vapa ylhäällä, ja rangaistus seuraa', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 30 },
    });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    host.send(ClientMsg.settings, { weather: 'calm', lightningPenalty: 'out' });
    await until(() => guest.state.settings.lightningPenalty === 'out');
    guest.send(ClientMsg.ready, true);
    await until(() => players(host).every((p) => p.name === 'A' || p.ready));
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');

    type P = { x: number; y: number; lureStage: number; outUntil: number };
    const me = (room: Room) => room.state.players.get(room.sessionId) as P;
    for (const room of [host, guest]) {
      room.send(ClientMsg.splash, { x: me(room).x + 10, y: me(room).y });
      room.send(ClientMsg.catch, { species: 'perch', name: 'Ahven', weight: 0.3 });
    }
    await until(() => host.state.catches.length === 2);
    // Isännän viehe vedessä, vieraan vapa alhaalla.
    host.send(ClientMsg.input, { i: [], l: [me(host).x + 10, me(host).y, 2] });
    await until(() => me(host).lureStage === 2);

    // Salama, joka osuu kumpaan tahansa, jos vapa on ylhäällä.
    const water = new WaterBody(LUNKINJARVI);
    const hits = (seed: number) =>
      [host, guest].every(
        (r) =>
          resolveStrike(
            { t: 0, seed },
            [{ id: r.sessionId, pos: me(r), rodUp: true }],
            water,
            LUNKINJARVI.bounds,
          ).victims.length === 1,
      );
    let seed = 1;
    while (!hits(seed)) seed++;
    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as {
      strikes: Strike[];
      nextStrike: number;
      state: { clock: number };
    };
    const strikes: LightningMessage[] = [];
    guest.onMessage(ServerMsg.lightning, (m: LightningMessage) => strikes.push(m));
    room.strikes = [{ t: room.state.clock, seed }];
    room.nextStrike = 0;
    await until(() => strikes.length === 1);
    expect(strikes[0]!.victims).toEqual([host.sessionId]);
    expect(Math.hypot(strikes[0]!.x - me(host).x, strikes[0]!.y - me(host).y)).toBeLessThan(1);

    // Putoaminen: saalis menee, eikä uusi heitto kelpaa.
    await until(() => host.state.catches.length === 1);
    expect(host.state.catches[0].player).toBe(guest.sessionId);
    expect(me(host).outUntil).toBe(OUT_OF_RACE);
    let rejected = 0;
    host.onMessage(ServerMsg.castRejected, () => rejected++);
    host.send(ClientMsg.splash, { x: me(host).x + 10, y: me(host).y });
    await until(() => rejected === 1);

    await host.leave();
    await guest.leave();
  });

  it('iso aalto kaataa sivuttain olevan renkaan, aaltoa kohti katsova pysyy pystyssä', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 30 },
    });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    host.send(ClientMsg.settings, { capsizePenalty: 'time-out' });
    await until(() => guest.state.settings.capsizePenalty === 'time-out');
    guest.send(ClientMsg.ready, true);
    await until(() => players(host).every((p) => p.name === 'A' || p.ready));
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');

    // Myrsky itään, ja molemmat selälle, jossa aalto on iso.
    const rings = [LUNKINJARVI.shore, ...LUNKINJARVI.islands];
    const water = new WaterBody(LUNKINJARVI);
    let open = { x: 0, y: 0 };
    let best = 0;
    for (let x = LUNKINJARVI.bounds.minX; x < LUNKINJARVI.bounds.maxX; x += 40)
      for (let y = LUNKINJARVI.bounds.minY; y < LUNKINJARVI.bounds.maxY; y += 40) {
        const h = water.isWater({ x, y }) ? bigWaveHeight(rings, { x, y }, 16, 0) : 0;
        if (h > best) [best, open] = [h, { x, y }];
      }
    expect(best).toBeGreaterThan(BIG_WAVE.capsizeHeight);
    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as {
      weather: WeatherPlan;
      bigWaves: { t: number }[];
      nextWave: number;
      sims: Map<string, { tube: TubeState }>;
      state: { clock: number };
    };
    room.weather = {
      level: 'chaos',
      segments: [{ start: 0, sky: 'storm', windSpeed: 16, windDir: 0 }],
    };
    // Isäntä sivuttain aaltoon, vieras kohti aaltoa (aallot tulevat lännestä).
    room.sims.get(host.sessionId)!.tube = createTube(open, Math.PI / 2);
    room.sims.get(guest.sessionId)!.tube = createTube({ x: open.x, y: open.y + 3 }, Math.PI);
    const waves: BigWaveMessage[] = [];
    guest.onMessage(ServerMsg.bigWave, (m: BigWaveMessage) => waves.push(m));
    room.bigWaves = [{ t: room.state.clock }];
    room.nextWave = 0;
    await until(() => waves.length === 1);
    expect(waves[0]!.victims).toEqual([host.sessionId]);

    type P = { x: number; y: number; capsizedUntil: number; outUntil: number };
    const me = (r: Room) => r.state.players.get(r.sessionId) as P;
    await until(() => me(host).capsizedUntil > 0);
    expect(me(host).capsizedUntil).toBeCloseTo(room.state.clock + BIG_WAVE.recover, 0);
    expect(me(host).outUntil).toBeGreaterThan(room.state.clock + 50);
    expect(me(guest).capsizedUntil).toBe(0);

    // Kumossa heitto ei kelpaa.
    let rejected = 0;
    host.onMessage(ServerMsg.castRejected, () => rejected++);
    host.send(ClientMsg.splash, { x: me(host).x + 10, y: me(host).y });
    await until(() => rejected === 1);

    await host.leave();
    await guest.leave();
  });

  it('maalle juuttuneen vieheen katkaisu tuo valitun aikasakon', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 60 },
    });
    await until(() => host.state?.settings?.landPenalty === 30);
    host.send(ClientMsg.settings, { landPenalty: 15 });
    await until(() => host.state.settings.landPenalty === 15);
    type P = { x: number; y: number; outUntil: number };
    const me = () => host.state.players.get(host.sessionId) as P;

    // Aulassa katkaisu ei tee mitään.
    host.send(ClientMsg.landCut);
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');
    expect(me().outUntil).toBe(0);

    host.send(ClientMsg.landCut);
    await until(() => me().outUntil > 0);
    expect(me().outUntil).toBeGreaterThan(host.state.clock + 10);
    expect(me().outUntil).toBeLessThanOrEqual(host.state.clock + 15);
    // Sakon aikana heitto ei kelpaa.
    let rejected = 0;
    host.onMessage(ServerMsg.castRejected, () => rejected++);
    host.send(ClientMsg.splash, { x: me().x + 10, y: me().y });
    await until(() => rejected === 1);

    await host.leave();
  });

  it('trombi nappaa liian lähelle tulleen ja sinkoaa sen', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 30 },
    });
    await until(() => players(host).length === 1);
    host.send(ClientMsg.settings, { capsizePenalty: 'lose-catch' });
    await until(() => host.state.settings.capsizePenalty === 'lose-catch');
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');
    type P = { x: number; y: number; capsizedUntil: number; vx: number; vy: number };
    const me = () => host.state.players.get(host.sessionId) as P;
    host.send(ClientMsg.splash, { x: me().x + 10, y: me().y });
    host.send(ClientMsg.catch, { species: 'perch', name: 'Ahven', weight: 0.3 });
    await until(() => host.state.catches.length === 1);

    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as {
      spouts: { t0: number; t1: number; start: { x: number; y: number }; dir: number }[];
      state: { clock: number };
    };
    const spouts: BigWaveMessage[] = [];
    host.onMessage(ServerMsg.spout, (m: BigWaveMessage) => spouts.push(m));
    // Trombi syntyy 2 m renkaasta länteen.
    room.spouts = [
      {
        t0: room.state.clock,
        t1: room.state.clock + 60,
        start: { x: me().x - 2, y: me().y },
        dir: 0,
      },
    ];
    await until(() => spouts.length === 1);
    expect(spouts[0]!.victims).toEqual([host.sessionId]);
    await until(() => me().capsizedUntil > 0 && host.state.catches.length === 0);
    // Sinkoutuu poispäin (itään).
    await until(() => me().vx > 0);
    await new Promise((r) => setTimeout(r, 300));
    // Kumossa ja vielä hetken sen jälkeen trombi ei nappaa uudelleen.
    expect(spouts.length).toBe(1);
    await host.leave();
  });

  it('ristissä olevat siimat sotkeutuvat ja selviävät kelaamalla tai katkaisemalla', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 60 },
    });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    host.send(ClientMsg.settings, { weather: 'calm' });
    await until(() => guest.state.settings.weather === 'calm');
    guest.send(ClientMsg.ready, true);
    await until(() => players(host).every((p) => p.name === 'A' || p.ready));
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');

    type P = { x: number; y: number; tangledWith: string; untangle: number };
    const me = (r: Room) => r.state.players.get(r.sessionId) as P;
    const h = { x: me(host).x, y: me(host).y };
    const g = { x: me(guest).x, y: me(guest).y };
    // Siimat ristiin: kumpikin heittää toisen ohi samalle puolelle (X-kuvio).
    const len = Math.hypot(g.x - h.x, g.y - h.y);
    const n = { x: (-(g.y - h.y) / len) * 15, y: ((g.x - h.x) / len) * 15 };
    const cast = (r: Room, to: { x: number; y: number }, stage: number, reel: number) =>
      r.send(ClientMsg.input, { i: [], l: [to.x + n.x, to.y + n.y, stage, reel] });
    cast(host, g, 2, 0);
    cast(guest, h, 2, 0);
    await new Promise((r) => setTimeout(r, 150));
    // Ristissä, mutta kumpikaan ei kelaa: ei sotkua.
    expect(me(host).tangledWith).toBe('');
    cast(host, g, 2, 1);
    await until(() => me(host).tangledWith === guest.sessionId);
    await until(() => me(guest).tangledWith === host.sessionId);

    // Kelataan yhdessä: selviää noin 3 sekunnissa.
    const done: UntangledMessage[] = [];
    guest.onMessage(ServerMsg.untangled, (m: UntangledMessage) => done.push(m));
    cast(guest, h, 2, 1);
    await until(() => done.length === 1, 5000);
    expect(done[0]!.how).toBe('untangled');
    cast(host, g, 0, 0);
    cast(guest, h, 0, 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(me(host).tangledWith).toBe('');

    // Uusi sotku (selvityksen jälkeen 2 s suoja-aika), ja vieras katkaisee siimansa.
    cast(host, g, 2, 1);
    cast(guest, h, 2, 0);
    await until(() => me(guest).tangledWith === host.sessionId, 4000);
    guest.send(ClientMsg.cutLine);
    await until(() => done.length === 2);
    expect(done[1]).toMatchObject({ how: 'cut', by: guest.sessionId });

    await host.leave();
    await guest.leave();
  }, 15000);

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
