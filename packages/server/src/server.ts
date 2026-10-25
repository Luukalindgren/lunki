import { Server, createEndpoint, createRouter } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  ERRORS_PATH,
  FEEDBACK_PATH,
  RECORDS_PATH,
  RECORDS_PER_SPECIES,
  ROOM_NAME,
  SOLO_RECORDS_PATH,
  cleanMultiline,
  parseErrorReport,
  parseFeedback,
  parseSoloRecord,
  type SoloRecordReply,
} from '@lunki/shared';
import { FEEDBACK_EXPORTED_PATH, FEEDBACK_PENDING_PATH } from './feedback/issues';
import type { FeedbackStore } from './feedback/store';
import { authorized } from './feedback/token';
import { setRecordStore } from './records';
import type { RecordStore } from './records/store';
import { LunkiRoom } from './rooms/LunkiRoom';

export interface ServerStores {
  records?: RecordStore;
  feedback?: FeedbackStore;
  /** Avain palautteiden hakuun issueiksi (feedback/token.ts); ilman sitä rajapinta on kiinni. */
  feedbackToken?: string | null;
}

/** Yksinkertainen tulvasuoja: enintään `max` kirjausta minuutissa. */
function rateLimit(max: number): () => boolean {
  let windowStart = 0;
  let count = 0;
  return () => {
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      count = 0;
    }
    return ++count <= max;
  };
}

/** Selain lähettää rungon tekstinä (ei CORS-esikyselyä); jäsennetään itse. */
const json = (body: unknown): unknown => {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

/** Luo pelipalvelimen. Erillään käynnistyksestä, jotta testit voivat ajaa sen. */
export function createServer({ records, feedback, feedbackToken }: ServerStores = {}): Server {
  const server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define(ROOM_NAME, LunkiRoom);
  setRecordStore(records ?? null);
  const feedbackLimit = rateLimit(10);
  const errorLimit = rateLimit(30);
  const soloLimit = rateLimit(120);
  server.router = createRouter({
    records: createEndpoint(RECORDS_PATH, { method: 'GET' }, async () => records?.board() ?? {}),
    soloRecords: createEndpoint(
      SOLO_RECORDS_PATH,
      { method: 'GET' },
      async () => records?.board(RECORDS_PER_SPECIES, 'solo') ?? {},
    ),
    // Yksinpelin saaliista tallennetaan vain listalle mahtuvat, ettei tiedosto paisu.
    soloRecord: createEndpoint(SOLO_RECORDS_PATH, { method: 'POST' }, async (ctx) => {
      const e = parseSoloRecord(json(ctx.body));
      if (!e) throw ctx.error(400);
      if (!soloLimit()) throw ctx.error(429);
      let place: number | null = null;
      if (records && records.place(e, 'solo') <= RECORDS_PER_SPECIES)
        place = records.add(e, 'solo');
      return { place } satisfies SoloRecordReply;
    }),
    feedback: createEndpoint(FEEDBACK_PATH, { method: 'POST' }, async (ctx) => {
      const f = parseFeedback(json(ctx.body));
      if (!f) throw ctx.error(400);
      if (!feedbackLimit()) throw ctx.error(429);
      feedback?.addFeedback(f);
      return { ok: true };
    }),
    pendingFeedback: createEndpoint(FEEDBACK_PENDING_PATH, { method: 'GET' }, async (ctx) => {
      if (!feedback || !authorized(ctx.getHeader('authorization'), feedbackToken ?? null))
        throw ctx.error(401);
      // Vanhoissa riveissä voi olla merkkejä, joita nykyinen jäsennys ei päästä läpi.
      const pending = feedback.pending().map((f) => ({
        ...f,
        name: cleanMultiline(f.name),
        text: cleanMultiline(f.text),
        context: cleanMultiline(f.context),
      }));
      return { feedback: pending };
    }),
    exportedFeedback: createEndpoint(FEEDBACK_EXPORTED_PATH, { method: 'POST' }, async (ctx) => {
      if (!feedback || !authorized(ctx.getHeader('authorization'), feedbackToken ?? null))
        throw ctx.error(401);
      const { id, issue } = (json(ctx.body) ?? {}) as Record<string, unknown>;
      if (!Number.isInteger(id) || !Number.isInteger(issue)) throw ctx.error(400);
      if (!feedback.markExported(id as number, issue as number)) throw ctx.error(404);
      return { ok: true };
    }),
    errors: createEndpoint(ERRORS_PATH, { method: 'POST' }, async (ctx) => {
      const e = parseErrorReport(json(ctx.body));
      if (!e) throw ctx.error(400);
      if (!errorLimit()) throw ctx.error(429);
      feedback?.addError(e);
      return { ok: true };
    }),
  });
  return server;
}
