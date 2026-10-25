import { Server, createEndpoint, createRouter } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  ERRORS_PATH,
  FEEDBACK_PATH,
  RECORDS_PATH,
  ROOM_NAME,
  parseErrorReport,
  parseFeedback,
} from '@lunki/shared';
import type { FeedbackStore } from './feedback/store';
import { setRecordStore } from './records';
import type { RecordStore } from './records/store';
import { LunkiRoom } from './rooms/LunkiRoom';

export interface ServerStores {
  records?: RecordStore;
  feedback?: FeedbackStore;
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
export function createServer({ records, feedback }: ServerStores = {}): Server {
  const server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define(ROOM_NAME, LunkiRoom);
  setRecordStore(records ?? null);
  const feedbackLimit = rateLimit(10);
  const errorLimit = rateLimit(30);
  server.router = createRouter({
    records: createEndpoint(RECORDS_PATH, { method: 'GET' }, async () => records?.board() ?? {}),
    feedback: createEndpoint(FEEDBACK_PATH, { method: 'POST' }, async (ctx) => {
      const f = parseFeedback(json(ctx.body));
      if (!f) throw ctx.error(400);
      if (!feedbackLimit()) throw ctx.error(429);
      feedback?.addFeedback(f);
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
