import type { Server } from '@colyseus/core';
import { FEEDBACK_PATH, ROOM_NAME } from '@lunki/shared';
import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, limitRequestBodies } from './bodyLimit';
import { openDatabase } from './db/open';
import { FeedbackStore } from './feedback/store';
import { createServer } from './server';

const PORT = 35000 + Math.floor(Math.random() * 5000);
let server: Server;
let feedback: FeedbackStore;

/** POST, jonka otsakkeet ja runko annetaan sellaisenaan. */
const post = (path: string, body: string, headers: Record<string, string | number> = {}) =>
  new Promise<number>((done, fail) => {
    const req = request(
      { port: PORT, path, method: 'POST', headers: { 'content-type': 'text/plain', ...headers } },
      (res) => {
        res.resume();
        done(res.statusCode!);
      },
    ).on('error', fail);
    req.end(body);
  });

beforeAll(async () => {
  feedback = new FeedbackStore(openDatabase(':memory:'));
  server = createServer({ feedback });
  await server.listen(PORT);
  limitRequestBodies(server.transport.server!);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('pyynnön koko', () => {
  it('tavallinen palaute menee läpi', async () => {
    expect(await post(FEEDBACK_PATH, JSON.stringify({ text: 'Hei' }))).toBe(200);
    expect(feedback.feedback()[0]?.text).toBe('Hei');
  });

  it('liian iso runko hylätään lukematta', async () => {
    const big = JSON.stringify({ text: 'x'.repeat(MAX_BODY_BYTES) });
    expect(await post(FEEDBACK_PATH, big)).toBe(413);
    expect(await post(`/matchmake/create/${ROOM_NAME}`, big)).toBe(413);
  });

  it('runko ilman pituutta hylätään', async () => {
    expect(await post(FEEDBACK_PATH, '{"text":"x"}', { 'transfer-encoding': 'chunked' })).toBe(411);
  });
});
