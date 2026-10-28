import { Client, type Room } from '@colyseus/sdk';
import { matchMaker, type Server } from '@colyseus/core';
import {
  catchRadius,
  DIFFICULTIES,
  ClientMsg,
  DEFAULT_APPEARANCE,
  LUNKINJARVI,
  ROOM_NAME,
  ERRORS_PATH,
  FEEDBACK_PATH,
  RECORDS_PATH,
  SOLO_RECORDS_PATH,
  ServerMsg,
  TubePredictor,
  WaterBody,
  createTube,
  findOpenWaterPoint,
  encodeInputs,
  formatRoomCode,
  BIG_WAVE,
  SPOUT,
  OUT_OF_RACE,
  bigWaveHeight,
  maxCastDistance,
  parseRoomCode,
  planWeather,
  rankPlayers,
  resolveStrike,
  weatherAt,
  CHAT_MAX_LENGTH,
  DEFAULT_TACKLE,
  PROTOCOL_VERSION,
  BoatSeat,
  seatPos,
  CHAT_RATE,
  EMOTE_RATE,
  type EmoteMessage,
  JoinRefusal,
  type ChatMessage,
  type RoomError,
  type CatchRecord,
  type BigWaveMessage,
  type SpoutMessage,
  type RecordBoard,
  type SoloRecordReply,
  type RecordMessage,
  type UntangledMessage,
  type LightningMessage,
  type TubeState,
  type WeatherPlan,
  type Strike,
  FISH_COUNT,
  LUNKINJARVI_BOTTOM,
  LakeBottom,
  Rng,
  createFishPopulation,
  distance,
  fishHome,
  stockWeight,
  type FishPopulation,
  type SpeciesId,
  type Vec2,
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

type Pos = { x: number; y: number };
const mine = (room: Room) => room.state.players.get(room.sessionId) as Pos;

let lake: Parameters<typeof createFishPopulation>[0] | null = null;
/** Kisan kalakanta samoin kuin pelaajan koneella. */
function stockOf(room: Room): FishPopulation {
  if (!lake) {
    const water = new WaterBody(LUNKINJARVI);
    const bottom = new LakeBottom(
      water,
      LUNKINJARVI.bounds,
      LUNKINJARVI_BOTTOM,
      LUNKINJARVI.reeds,
      LUNKINJARVI.piers,
    );
    lake = {
      isWater: (p) => water.isWater(p),
      depthAt: (p) => bottom.depthAt(p),
      structures: bottom.structures,
    };
  }
  return createFishPopulation(
    lake,
    LUNKINJARVI.bounds,
    new Rng(room.state.seed as number),
    FISH_COUNT,
    [...room.state.settings.species] as SpeciesId[],
  );
}

/** Kala, jonka kotipaikka (kaikissa annetuissa sukupolvissa) on lähimpänä renkaasta. */
function nearSlot(stock: FishPopulation, at: Vec2[], gens = [0], taken: number[] = []): number {
  let best = -1;
  let bestD = Infinity;
  stock.fish.forEach((_, i) => {
    if (taken.includes(i)) return;
    const d = Math.max(...gens.flatMap((g) => at.map((p) => distance(fishHome(stock, i, g)!, p))));
    if (d < bestD) [best, bestD] = [i, d];
  });
  // Palvelin hyväksyy vieheen 200 m:n päähän renkaasta; pieni vara ajelehtimiselle.
  // (150 m:n raja kaatoi testin satunnaisesti, kun kalakanta arvotaan joka kisaan.)
  if (bestD > 190) throw new Error('kalaa ei ole heittomatkan päässä');
  return best;
}

/**
 * Nostaa kalan kuten asiakas: heitto, kala tarttuu kotipaikallaan (tai
 * kohdassa `at`) ja punnitus. Asiakkaan ilmoittamalla painolla ei ole väliä.
 * Palauttaa painon, jonka palvelin laskee.
 */
function land(
  room: Room,
  stock: FishPopulation,
  slot: number,
  gen = 0,
  at?: Vec2,
  /** Renkaan paikka, jos se on siirretty palvelimella (tila ei ole vielä päivittynyt). */
  from: Pos = mine(room),
): number {
  const hook = at ?? fishHome(stock, slot, gen)!;
  room.send(ClientMsg.splash, { x: from.x + 10, y: from.y });
  room.send(ClientMsg.input, { i: [], l: [hook.x, hook.y, 2] });
  room.send(ClientMsg.input, { i: [], l: [hook.x, hook.y, 3] });
  room.send(ClientMsg.catch, { species: 'perch', name: 'Ahven', weight: 0.3, fish: { slot, gen } });
  // Nostettu kala: viehe takaisin kelalla.
  room.send(ClientMsg.input, { i: [], l: [hook.x, hook.y, 0] });
  return stockWeight(stock, slot, gen);
}

/**
 * Mikä tahansa kelpaava saalis renkaan läheltä. Samassa kisassa nostetut
 * paikat annetaan `taken`-listassa: lähin kala voi olla kahdelle sama, ja
 * jälkimmäinen saalis hylättäisiin.
 */
const landNear = (room: Room, taken: number[] = []) => {
  const stock = stockOf(room);
  const slot = nearSlot(stock, [mine(room)], [0], taken);
  taken.push(slot);
  return land(room, stock, slot);
};

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

    const errors: RoomError[] = [];
    host.onMessage(ServerMsg.error, (m: RoomError) => errors.push(m));
    let seed = -1;
    guest.onMessage(ServerMsg.started, (m: { seed: number }) => (seed = m.seed));

    host.send(ClientMsg.start);
    await until(() => errors.length === 1);
    expect(errors[0]).toEqual({ code: 'not-ready', names: ['B'] });

    // Vieras ei voi aloittaa.
    const guestErrors: RoomError[] = [];
    guest.onMessage(ServerMsg.error, (m: RoomError) => guestErrors.push(m));
    guest.send(ClientMsg.start);
    await until(() => guestErrors.length === 1);
    expect(guestErrors[0]).toEqual({ code: 'host-only' });

    guest.send(ClientMsg.ready, true);
    await until(() => players(host).every((p, i) => i === 0 || p.ready));
    host.send(ClientMsg.start);
    await until(() => seed >= 0 && guest.state.phase === 'countdown');
    expect(guest.state.seed).toBe(seed);
    // Sää lasketaan samasta siemenestä kuin asiakkailla.
    const plan = planWeather(seed, 'realistic', guest.state.settings.durationMinutes * 60);
    expect(guest.state.sky).toBe(weatherAt(plan, 0).sky);

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

  it('isännän yhteys katkeaa aulassa: isännyys siirtyy heti yhteydessä olevalle (#275)', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    const off = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    const guest = await sdk().joinById(host.roomId, { name: 'C', playerId: 'c' });
    await until(() => players(guest).length === 3);
    type P = { connected: boolean };
    const conn = (r: Room) => (guest.state.players.get(r.sessionId) as P | undefined)?.connected;
    // B katkeaa ensin eikä ole valmis: se ei saa isännyyttä eikä estä aloitusta.
    off.reconnection.enabled = false;
    off.connection.close(4010);
    await until(() => conn(off) === false);
    const token = host.reconnectionToken;
    host.reconnection.enabled = false;
    host.connection.close(4010);
    await until(() => guest.state.hostId === guest.sessionId);
    expect(players(guest)).toHaveLength(3);

    // Palaava entinen isäntä on tavallinen pelaaja.
    const back = await sdk().reconnect(token);
    await until(() => conn(back) === true);
    expect(back.state.hostId).toBe(guest.sessionId);
    back.send(ClientMsg.ready, true);
    await until(() => (guest.state.players.get(back.sessionId) as { ready: boolean }).ready);
    guest.send(ClientMsg.start);
    await until(() => guest.state.phase === 'countdown');

    await back.leave();
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

  it('kisan aikana vapa pysyy samana, viehe ja siima vaihtuvat', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    await until(() => players(host).length === 1);
    type Gear = { rod: string; lure: string; line: string; leader: boolean };
    const gear = () => (players(host) as unknown as Gear[])[0]!;
    host.send(ClientMsg.tackle, { rod: 'heavy', lure: 'spoon', line: 'medium', leader: false });
    await until(() => gear().rod === 'heavy');
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'countdown');
    host.send(ClientMsg.tackle, { rod: 'light', lure: 'jig', line: 'thin', leader: true });
    await until(() => gear().lure === 'jig');
    expect(gear()).toMatchObject({ rod: 'heavy', line: 'thin', leader: true });
    await host.leave();
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
    const stock = stockOf(host);
    const slot = nearSlot(stock, [mine(host), mine(guest)]);
    const weight = land(host, stock, slot);
    await until(() => host.state.catches.length === 1);
    expect(host.state.catches[0]).toMatchObject({
      fishSlot: slot,
      species: stock.fish[slot]!.species,
      weight: Math.fround(weight),
    });
    land(guest, stock, slot, 0);
    await until(() => rejected === 1);
    // Sukupolvea ei voi hypätä yli (paino arvottaisiin uudelleen).
    land(guest, stock, slot, 2);
    await until(() => rejected === 2);
    // Paikan seuraava sukupolvi on eri kala toisen parven luona: vieras soutaa sinne.
    const next = fishHome(stock, slot, 1)!;
    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as {
      sims: Map<string, { tube: { pos: Vec2; vel: Vec2 } }>;
    };
    const sim = room.sims.get(guest.sessionId)!;
    sim.tube = { ...sim.tube, pos: { ...next }, vel: { x: 0, y: 0 } };
    land(guest, stock, slot, 1, next, next);
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

  it('yksinpelin saaliit omalle listalleen, vain listalle mahtuvat tallennetaan', async () => {
    const url = `http://localhost:${PORT}${SOLO_RECORDS_PATH}`;
    const post = (body: unknown) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(body),
      });
    const fish = (weight: number) => ({
      species: 'zander',
      weight,
      angler: 'Yksin',
      difficulty: 'easy',
    });
    const places: (number | null)[] = [];
    for (const w of [1, 2, 3, 4, 5, 6, 0.5])
      places.push(((await (await post(fish(w))).json()) as SoloRecordReply).place);
    expect(places).toEqual([1, 1, 1, 1, 1, 1, null]);
    expect((await post({ ...fish(1), weight: 999 })).status).toBe(400);
    const solo = (await (await fetch(url)).json()) as RecordBoard;
    expect(solo.easy?.zander?.map((r) => r.weight)).toEqual([6, 5, 4, 3, 2]);
    // Moninpelin lista ei sekoitu.
    const race = (await (
      await fetch(`http://localhost:${PORT}${RECORDS_PATH}`)
    ).json()) as RecordBoard;
    expect(race.easy?.zander ?? []).not.toContainEqual(
      expect.objectContaining({ angler: 'Yksin' }),
    );
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

  it('käsimerkit muille, tuntemattomat hylätään ja tiheys rajataan (#228)', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    const seen: EmoteMessage[] = [];
    guest.onMessage(ServerMsg.emote, (m: EmoteMessage) => seen.push(m));
    let own = 0;
    host.onMessage(ServerMsg.emote, () => own++);

    host.send(ClientMsg.emote, 'moonwalk');
    host.send(ClientMsg.emote, { emote: 'wave' });
    host.send(ClientMsg.emote, 'wave');
    await until(() => seen.length === 1);
    expect(seen[0]).toEqual({ from: host.sessionId, emote: 'wave' });

    // Purske täyttyy: ylimääräiset ohitetaan hiljaa.
    for (let i = 0; i < EMOTE_RATE.burst + 2; i++) host.send(ClientMsg.emote, 'thumbsUp');
    // Vieras voi silti tehdä omansa (raja on pelaajakohtainen); sen jälkeen jono on käsitelty.
    let back = 0;
    host.onMessage(ServerMsg.emote, () => back++);
    guest.send(ClientMsg.emote, 'fist');
    await until(() => back === 1);
    expect(seen.length).toBe(EMOTE_RATE.burst);
    // Tekijä ei saa omaa elettään takaisin.
    expect(own).toBe(1);

    await host.leave();
    await guest.leave();
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

  it('lyhyen verkkojumin viestiryöppy ei katkaise yhteyttä (#273)', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a' });
    await until(() => players(host).length === 1);
    host.send(ClientMsg.start);
    await until(() => host.state.phase !== 'lobby');
    let left = false;
    host.onLeave(() => (left = true));
    // 8 s jumi: 160 syöteviestiä saapuu kerralla.
    let seq = 0;
    for (let k = 0; k < 160; k++) {
      const batch = [1, 2, 3].map(() => ({ seq: ++seq, kick: 1, turn: 0, sprint: false }));
      host.send(ClientMsg.input, { i: encodeInputs(batch) });
    }
    await until(() => (host.state.players.get(host.sessionId)?.ack ?? 0) > 400);
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
      testTiming: { countdown: 0.2, duration: 3 },
    });
    await until(() => players(host).length === 1);
    host.send(ClientMsg.settings, { difficulty: 'easy' });
    await until(() => host.state.settings.difficulty === 'easy');
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

    const stock = stockOf(host);
    const taken: number[] = [];
    const catchFor = (room: Room) => {
      const slot = nearSlot(stock, [mine(room)], [0], taken);
      taken.push(slot);
      return land(room, stock, slot);
    };
    const records: RecordMessage[] = [];
    guests[2]!.onMessage(ServerMsg.record, (m: RecordMessage) => records.push(m));
    // Ilman heittoa saalis hylätään.
    host.send(ClientMsg.catch, {
      species: 'perch',
      name: 'Ahven',
      weight: 0.4,
      fish: { slot: 0, gen: 0 },
    });
    await until(() => rejected === 2);
    const weights = [catchFor(host), catchFor(guests[0]!), catchFor(guests[1]!)];
    // Viehe ei ollut kalan luona: saalis hylätään.
    const far = nearSlot(stock, [mine(guests[2]!)], [0], taken);
    const home = fishHome(stock, far, 0)!;
    // Helpolla kalat tulevat vieheelle kauempaa, joten raja on väljempi.
    const beyond = catchRadius(stock.fish[far]!.species, DIFFICULTIES.easy) + 20;
    land(guests[2]!, stock, far, 0, {
      x: home.x + Math.sign(mine(guests[2]!).x - home.x) * beyond,
      y: home.y,
    });
    await until(() => host.state.catches.length === 3);

    await until(() => all.every((r) => r.state.phase === 'finished'), 4000);
    type C = { player: string; angler: string } & CatchRecord;
    const catches = [...(host.state.catches as Iterable<C>)].map((c) => ({ ...c }));
    // Paino tulee palvelimen kalakannasta, ei asiakkaan ilmoituksesta.
    expect(catches.map((c) => c.weight)).toEqual(weights.map(Math.fround));
    const ids = [...new Set(catches.map((c) => c.player))];
    const results = rankPlayers(
      ids.map((id) => ({
        id,
        name: catches.find((c) => c.player === id)!.angler,
        catches: catches.filter((c) => c.player === id),
      })),
      'total',
    );
    const names = ['Luuka', 'Bertta', 'Cecilia'];
    const order = [0, 1, 2].sort((a, b) => weights[b]! - weights[a]! || a - b);
    expect(results.map((r) => r.name)).toEqual(order.map((i) => names[i]));
    expect(rejected).toBe(2);
    // Punnitut saaliit päätyvät järven ennätyslistalle (oma vaikeustaso: muut testit eivät sotke).
    await until(() => records.length === 3);
    const board = (await (
      await fetch(`http://localhost:${PORT}${RECORDS_PATH}`)
    ).json()) as RecordBoard;
    const listed = Object.values(board.easy ?? {}).flat();
    expect(listed.map((r) => [r.angler, r.weight]).sort()).toEqual(
      names.map((n, i) => [n, weights[i]]).sort(),
    );
    // Ennätykseen tallentuvat saantipaikka, varusteet ja olosuhteet.
    for (const r of listed) {
      expect(r).toMatchObject({ lure: DEFAULT_TACKLE.lure, timeOfDay: expect.any(String) });
      expect([r.x, r.y, r.raceTime]).toEqual([
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
      ]);
      expect(r.at?.slice(0, 10)).toBe(r.date);
    }
    // Kisan jälkeen saaliita ei enää punnita.
    landNear(host);
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
    const taken: number[] = [];
    for (const room of [host, guest]) landNear(room, taken);
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
      bigWaves: { t: number; offset: number }[];
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
    room.bigWaves = [{ t: room.state.clock, offset: 0 }];
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

  it('trombi nappaa liian lähelle tulleen ja lennättää sen muualle järvelle', async () => {
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
    landNear(host);
    await until(() => host.state.catches.length === 1);

    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as {
      spouts: { t0: number; t1: number; start: { x: number; y: number }; dir: number }[];
      state: { clock: number };
    };
    const spouts: SpoutMessage[] = [];
    host.onMessage(ServerMsg.spout, (m: SpoutMessage) => spouts.push(m));
    const start = { x: me().x, y: me().y };
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
    // Lentää 120–320 m päähän vedelle; palvelin siirtää renkaan heti perille.
    const flight = spouts[0]!.flights[0]!;
    expect(flight.id).toBe(host.sessionId);
    expect(Math.hypot(flight.fromX - start.x, flight.fromY - start.y)).toBeLessThan(1);
    const far = Math.hypot(flight.toX - flight.fromX, flight.toY - flight.fromY);
    expect(far).toBeGreaterThanOrEqual(SPOUT.minFlight * 0.2);
    expect(far).toBeLessThanOrEqual(SPOUT.maxFlight);
    expect(new WaterBody(LUNKINJARVI).isWater({ x: flight.toX, y: flight.toY })).toBe(true);
    await until(() => Math.hypot(me().x - flight.toX, me().y - flight.toY) < 2);
    // Lennon ja kumossa olon ajan ei kalasteta.
    expect(me().capsizedUntil).toBeGreaterThanOrEqual(SPOUT.flight + BIG_WAVE.recover);
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
    landNear(guest);
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

  it('kesken kisan lähtenyt ei jää näkymättömäksi esteeksi eikä sotkuun', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 60 },
    });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    guest.send(ClientMsg.ready, true);
    await until(() => players(host).some((p) => p.ready));
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');

    type P = { tangledWith: string };
    const room = matchMaker.getLocalRoomById(host.roomId) as unknown as {
      sims: Map<string, unknown>;
      state: { players: Map<string, P> };
    };
    // Sotku lähtevän pelaajan kanssa (kumpi tahansa järjestys sessionId:issä).
    room.state.players.get(host.sessionId)!.tangledWith = guest.sessionId;
    room.state.players.get(guest.sessionId)!.tangledWith = host.sessionId;
    await until(() => (host.state.players.get(host.sessionId) as P).tangledWith !== '');

    await guest.leave();
    await until(() => players(host).length === 1);
    expect([...room.sims.keys()]).toEqual([host.sessionId]);
    await until(() => (host.state.players.get(host.sessionId) as P).tangledWith === '');

    await host.leave();
  });
});

describe('liittyminen kesken kisan', () => {
  type P = { name: string; x: number; y: number; connected: boolean; spectator: boolean };
  const water = new WaterBody(LUNKINJARVI);
  const me = (room: Room) => room.state.players.get(room.sessionId) as P;

  /** Isäntä ja vieras kisassa; vieras on saanut yhden kalan. */
  async function race(settings: Record<string, unknown> = {}) {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 60 },
    });
    if (Object.keys(settings).length > 0) {
      host.send(ClientMsg.settings, settings);
      await until(() =>
        Object.entries(settings).every(
          ([k, v]) => (host.state?.settings as Record<string, unknown> | undefined)?.[k] === v,
        ),
      );
    }
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    guest.send(ClientMsg.ready, true);
    await until(() => players(host).some((p) => p.ready));
    host.send(ClientMsg.start);
    await until(() => guest.state.phase === 'playing');
    const pos = { x: me(guest).x, y: me(guest).y };
    landNear(guest);
    await until(() => host.state.catches.length === 1);
    return { host, guest, pos };
  }

  const refusal = (p: Promise<unknown>) =>
    p.then(
      () => 'liittyi',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );

  it('uusi pelaaja pääsee käynnissä olevaan kisaan rannan tuntumaan', async () => {
    const { host, guest } = await race();
    const late = await sdk().joinById(host.roomId, { name: 'C', playerId: 'c' });
    await until(() => players(host).length === 3 && late.state.phase === 'playing');
    const c = me(late);
    expect(c.name).toBe('C');
    expect(water.isWater({ x: c.x, y: c.y })).toBe(true);
    // Rengas on palvelimen simuloinnissa: potku liikuttaa sitä.
    const predictor = new TubePredictor(createTube({ x: c.x, y: c.y }, 0), water);
    for (let k = 0; k < 10; k++) {
      for (let j = 0; j < 3; j++) predictor.step({ kick: 1, turn: 0, sprint: false });
      late.send(ClientMsg.input, { i: encodeInputs(predictor.takeOutgoing()!), l: [0, 0, 0] });
    }
    await until(() => (me(late) as P & { ack: number }).ack === 30, 4000);

    for (const r of [host, guest, late]) await r.leave();
  });

  it('lähtenyt palaa koodilla samaan paikkaan ja saaliisiin', async () => {
    const { host, guest, pos } = await race();
    const oldId = guest.sessionId;
    await guest.leave();
    await until(() => players(host).length === 1);
    // Saalis jää tulostauluun lähteneellekin.
    expect(host.state.catches[0].player).toBe(oldId);

    const back = await sdk().joinById(host.roomId, { name: 'Uusi nimi', playerId: 'b' });
    await until(() => players(host).length === 2 && back.state.catches?.length === 1);
    const b = me(back);
    expect(b.name).toBe('B');
    expect(Math.hypot(b.x - pos.x, b.y - pos.y)).toBeLessThan(1);
    await until(() => host.state.catches[0].player === back.sessionId);

    await host.leave();
    await back.leave();
  });

  it('uusi välilehti ottaa katkenneen yhteyden paikan heti', async () => {
    const { host, guest } = await race();
    const token = guest.reconnectionToken;
    guest.reconnection.enabled = false;
    guest.connection.close(4010);
    await until(
      () => (host.state.players.get(guest.sessionId) as P | undefined)?.connected === false,
    );

    const tab = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2 && host.state.players.has(tab.sessionId));
    expect(host.state.players.has(guest.sessionId)).toBe(false);
    await until(() => host.state.catches[0].player === tab.sessionId);
    // Vanha yhteys ei enää pääse samaan paikkaan.
    await expect(sdk().reconnect(token)).rejects.toThrow();

    await host.leave();
    await tab.leave();
  });

  it('aulassa katkennut palaa koodilla ilman kaksoispaikkaa, myös täyteen aulaan (#309)', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a', maxPlayers: 2 });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    guest.reconnection.enabled = false;
    guest.connection.close(4010);
    await until(
      () => (host.state.players.get(guest.sessionId) as P | undefined)?.connected === false,
    );

    // Aula on täynnä haamun kanssa, mutta oma katkennut paikka vapautuu paluulle.
    const back = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => host.state.players.has(back.sessionId));
    expect(host.state.players.has(guest.sessionId)).toBe(false);
    expect(players(host)).toHaveLength(2);
    expect((host.state.players.get(back.sessionId) as P).name).toBe('B');
    expect((host.state.players.get(back.sessionId) as P).spectator).toBe(false);
    // Muu selain ei silti mahdu täyteen aulaan.
    expect(await refusal(sdk().joinById(host.roomId, { name: 'C', playerId: 'c' }))).toBe(
      JoinRefusal.full,
    );

    await host.leave();
    await back.leave();
  });

  it('"Vain paluu" päästää vain lähteneen takaisin', async () => {
    const { host, guest } = await race({ lateJoin: 'return' });
    expect(await refusal(sdk().joinById(host.roomId, { name: 'C', playerId: 'c' }))).toBe(
      JoinRefusal.returnOnly,
    );
    await guest.leave();
    await until(() => players(host).length === 1);
    const back = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);

    await host.leave();
    await back.leave();
  });

  it('täyteen kisaan tullut katsoja ei vie lähteneen paikkaa (#274)', async () => {
    const { host, guest } = await race({ maxPlayers: 2 });
    await guest.leave();
    await until(() => players(host).length === 1);
    const watcher = await sdk().joinById(host.roomId, { name: 'W', playerId: 'w', spectate: true });
    await until(() => players(host).length === 2);
    expect(watcher.state.players.get(watcher.sessionId)?.spectator).toBe(true);
    // Lähtenyt pääsee silti takaisin omalle paikalleen.
    const back = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b', spectate: true });
    await until(() => players(host).length === 3);
    expect(back.state.players.get(back.sessionId)?.spectator).toBe(false);

    await host.leave();
    await watcher.leave();
    await back.leave();
  });

  it('täyteen aulaan pääsee katsojaksi, mutta ei kalastajaksi (#274)', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a', maxPlayers: 2 });
    const b = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    expect(await refusal(sdk().joinById(host.roomId, { name: 'C', playerId: 'c' }))).toBe(
      JoinRefusal.full,
    );
    const c = await sdk().joinById(host.roomId, { name: 'C', playerId: 'c', spectate: true });
    await until(() => players(host).length === 3);
    expect(c.state.players.get(c.sessionId)?.spectator).toBe(true);
    // Kalastajaksi ei voi vaihtaa, ennen kuin paikka vapautuu.
    c.send(ClientMsg.spectate, false);
    await new Promise((r) => setTimeout(r, 200));
    expect(c.state.players.get(c.sessionId)?.spectator).toBe(true);
    await b.leave();
    await until(() => players(host).length === 2);
    c.send(ClientMsg.spectate, false);
    await until(() => c.state.players.get(c.sessionId)?.spectator === false);

    await host.leave();
    await c.leave();
  });

  it('"Ei" estää liittymisen kesken kisan', async () => {
    const { host, guest } = await race({ lateJoin: 'closed' });
    expect(await refusal(sdk().joinById(host.roomId, { name: 'C', playerId: 'c' }))).toBe(
      JoinRefusal.closed,
    );
    await guest.leave();
    await until(() => players(host).length === 1);
    expect(await refusal(sdk().joinById(host.roomId, { name: 'B', playerId: 'b' }))).toBe(
      JoinRefusal.closed,
    );

    await host.leave();
  });

  type Spectating = P & { spectator: boolean; ack: number };

  it('suljettuun kisaan pääsee katsojaksi, ja uudessa kisassa katsoja kalastaa', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 1.5 },
    });
    host.send(ClientMsg.settings, { lateJoin: 'closed' });
    await until(() => host.state?.settings?.lateJoin === 'closed');
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');
    const late = { name: 'C', playerId: 'c' };
    expect(await refusal(sdk().joinById(host.roomId, late))).toBe(JoinRefusal.closed);
    const spec = await sdk().joinById(host.roomId, { ...late, spectate: true });
    await until(() => players(host).length === 2);
    const c = host.state.players.get(spec.sessionId) as Spectating;
    expect(c.spectator).toBe(true);
    // Ei rengasta palvelimen simuloinnissa: syötteet eivät liikuta mitään.
    const predictor = new TubePredictor(createTube({ x: 0, y: 0 }, 0), water);
    for (let j = 0; j < 3; j++) predictor.step({ kick: 1, turn: 0, sprint: false });
    spec.send(ClientMsg.input, { i: encodeInputs(predictor.takeOutgoing()!), l: [0, 0, 0] });
    await until(() => host.state.phase === 'finished', 4000);
    expect(c.x).toBe(0);
    expect(c.ack).toBe(0);
    host.send(ClientMsg.restart);
    await until(() => host.state.phase === 'lobby');
    expect((host.state.players.get(spec.sessionId) as Spectating).spectator).toBe(false);

    await host.leave();
    await spec.leave();
  });

  it('päättyneeseen kisaan tullut katsoo tuloksia ja kalastaa uudessa kisassa (#279)', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 0.5 },
    });
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'finished', 4000);
    const late = await sdk().joinById(host.roomId, { name: 'C', playerId: 'c' });
    await until(() => players(host).length === 2);
    expect((host.state.players.get(late.sessionId) as Spectating).spectator).toBe(true);
    host.send(ClientMsg.restart);
    await until(() => host.state.phase === 'lobby');
    expect((host.state.players.get(late.sessionId) as Spectating).spectator).toBe(false);

    await host.leave();
    await late.leave();
  });

  it('aulassa katsojaksi valinnut ei saa rengasta, ja kisaan tarvitaan kalastaja', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'a',
      testTiming: { countdown: 0.1, duration: 60 },
    });
    const guest = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    const errors: RoomError[] = [];
    host.onMessage(ServerMsg.error, (m: RoomError) => errors.push(m));
    host.send(ClientMsg.spectate, true);
    guest.send(ClientMsg.spectate, true);
    await until(() => players(host).every((p) => (p as unknown as Spectating).spectator));
    host.send(ClientMsg.start);
    await until(() => errors.length === 1);
    expect(errors[0]).toEqual({ code: 'need-angler' });
    // Katsoja ei tarvitse valmis-merkintää.
    host.send(ClientMsg.spectate, false);
    await until(() => !(me(host) as Spectating).spectator);
    host.send(ClientMsg.start);
    await until(() => guest.state.phase === 'playing');
    expect(water.isWater({ x: me(host).x, y: me(host).y })).toBe(true);
    expect(me(guest).x).toBe(0);
    expect(me(guest).y).toBe(0);

    await host.leave();
    await guest.leave();
  });

  it('lähteneen paikka pysyy vapaana täydessä huoneessa', async () => {
    const { host, guest } = await race({ maxPlayers: 2 });
    await guest.leave();
    await until(() => players(host).length === 1);
    expect(await refusal(sdk().joinById(host.roomId, { name: 'C', playerId: 'c' }))).toBe(
      JoinRefusal.full,
    );
    const back = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);

    await host.leave();
    await back.leave();
  });

  it('täyteen kisaan tullut katsoja ei vie lähteneen paikkaa (#274)', async () => {
    const { host, guest } = await race({ maxPlayers: 2 });
    await guest.leave();
    await until(() => players(host).length === 1);
    const watcher = await sdk().joinById(host.roomId, { name: 'W', playerId: 'w', spectate: true });
    await until(() => players(host).length === 2);
    expect(watcher.state.players.get(watcher.sessionId)?.spectator).toBe(true);
    // Lähtenyt pääsee silti takaisin omalle paikalleen.
    const back = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b', spectate: true });
    await until(() => players(host).length === 3);
    expect(back.state.players.get(back.sessionId)?.spectator).toBe(false);

    await host.leave();
    await watcher.leave();
    await back.leave();
  });

  it('täyteen aulaan pääsee katsojaksi, mutta ei kalastajaksi (#274)', async () => {
    const host = await sdk().create(ROOM_NAME, { name: 'A', playerId: 'a', maxPlayers: 2 });
    const b = await sdk().joinById(host.roomId, { name: 'B', playerId: 'b' });
    await until(() => players(host).length === 2);
    expect(await refusal(sdk().joinById(host.roomId, { name: 'C', playerId: 'c' }))).toBe(
      JoinRefusal.full,
    );
    const c = await sdk().joinById(host.roomId, { name: 'C', playerId: 'c', spectate: true });
    await until(() => players(host).length === 3);
    expect(c.state.players.get(c.sessionId)?.spectator).toBe(true);
    // Kalastajaksi ei voi vaihtaa, ennen kuin paikka vapautuu.
    c.send(ClientMsg.spectate, false);
    await new Promise((r) => setTimeout(r, 200));
    expect(c.state.players.get(c.sessionId)?.spectator).toBe(true);
    await b.leave();
    await until(() => players(host).length === 2);
    c.send(ClientMsg.spectate, false);
    await until(() => c.state.players.get(c.sessionId)?.spectator === false);

    await host.leave();
    await c.leave();
  });
});

describe('venekisa (#263)', () => {
  const refusal = (p: Promise<unknown>) =>
    p.then(
      () => 'liittyi',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );
  type Crew = { boat: number; seat: number; x: number; y: number; heading: number };
  const crew = (room: Room, id = room.sessionId) => room.state.players.get(id) as Crew;
  const join = (room: Room, name: string) =>
    sdk().joinById(room.roomId, { name, playerId: name, protocol: PROTOCOL_VERSION });
  /** Soutaa n askelta 30 syötteen erissä (palvelimen jono) ja odottaa kuittauksen. */
  const row = async (room: Room, from: number, n: number, l: number[]) => {
    const ack = () => (room.state.players.get(room.sessionId) as { ack: number }).ack;
    for (let k = 0; k < n; k += 30) {
      const i = Array.from({ length: 30 }, (_, j) => ({
        seq: from + k + j,
        kick: 1,
        turn: 0,
        sprint: false,
      }));
      room.send(ClientMsg.input, { i: encodeInputs(i), l });
      await until(() => ack() === from + k + 29);
    }
  };

  it('veneet aulassa, vanha asiakas ei pääse, kyytiläinen istuu soutajan veneessä', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'A',
      protocol: PROTOCOL_VERSION,
      testTiming: { countdown: 0.1, duration: 30 },
    });
    const b = await join(host, 'B');
    const c = await join(host, 'C');
    await until(() => players(host).length === 3);
    host.send(ClientMsg.settings, { craft: 'boat' });
    await until(() => host.state.settings.craft === 'boat' && crew(host, c.sessionId).boat === 3);
    expect([host, b, c].map((r) => crew(host, r.sessionId).boat)).toEqual([1, 2, 3]);
    // Vanha asiakas ei osaa venettä.
    expect(await refusal(sdk().joinById(host.roomId, { name: 'D', playerId: 'D' }))).toBe(
      JoinRefusal.outdated,
    );
    // C siirtyy A:n veneeseen perään; B:n vene on nyt 2.
    c.send(ClientMsg.boat, 1);
    await until(() => crew(host, c.sessionId).boat === 1);
    expect(crew(host, c.sessionId).seat).toBe(BoatSeat.stern);
    expect(crew(host, b.sessionId).boat).toBe(2);

    b.send(ClientMsg.ready, true);
    c.send(ClientMsg.ready, true);
    await until(() => players(host).filter((p) => p.ready).length === 2);
    host.send(ClientMsg.start);
    await until(() => host.state.phase === 'playing');
    const boat = crew(host);
    const seat = seatPos({ pos: boat, heading: boat.heading }, BoatSeat.stern);
    expect(crew(host, c.sessionId).x).toBeCloseTo(seat.x, 3);
    expect(crew(host, c.sessionId).y).toBeCloseTo(seat.y, 3);

    // Viehe vedessä: soutaja ei liikuta venettä.
    const start = { x: boat.x, y: boat.y };
    await row(host, 1, 60, [start.x + 10, start.y, 2]);
    expect(distance(crew(host), start)).toBeLessThan(0.05);
    // Viehe sisään: vene lähtee, ja kyytiläinen kulkee mukana.
    await row(host, 61, 60, [0, 0, 0]);
    await until(() => distance(crew(host), start) > 0.3);
    const moved = crew(host);
    const followed = seatPos({ pos: moved, heading: moved.heading }, BoatSeat.stern);
    await until(() => distance(crew(host, c.sessionId), followed) < 0.01);

    // C:n saalis kuuluu veneelle 1.
    landNear(c);
    await until(() => host.state.catches.length === 1);
    expect(host.state.catches[0]!.boat).toBe(1);

    // Soutaja lähtee: kyytiläinen tarttuu airoihin samasta kohdasta.
    const at = { ...crew(host) };
    await host.leave();
    await until(() => crew(c).seat === BoatSeat.rower);
    expect(distance(crew(c), at)).toBeLessThan(0.5);
    await b.leave();
    await c.leave();
  });

  it('vanhan asiakkaan aulassa venekisaa ei voi valita', async () => {
    const host = await sdk().create(ROOM_NAME, {
      name: 'A',
      playerId: 'A',
      protocol: PROTOCOL_VERSION,
    });
    const old = await sdk().joinById(host.roomId, { name: 'O', playerId: 'O' });
    await until(() => players(host).length === 2);
    host.send(ClientMsg.settings, { craft: 'boat', durationMinutes: 15 });
    await until(() => host.state.settings.durationMinutes === 15);
    expect(host.state.settings.craft).toBe('tube');
    await old.leave();
    await host.leave();
  });
});
