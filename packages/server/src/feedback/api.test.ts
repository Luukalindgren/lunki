import type { Server } from '@colyseus/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/open';
import { createServer } from '../server';
import { FEEDBACK_EXPORTED_PATH, FEEDBACK_PENDING_PATH } from './issues';
import { FeedbackStore } from './store';

const PORT = 40000 + Math.floor(Math.random() * 5000);
const TOKEN = 'salainen-avain';
let server: Server;
let feedback: FeedbackStore;

const call = (path: string, token: string | null, body?: unknown) =>
  fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'text/plain',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  feedback = new FeedbackStore(openDatabase(':memory:'));
  server = createServer({ feedback, feedbackToken: TOKEN });
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('palautteiden haku issueiksi', () => {
  it('ilman avainta tai väärällä avaimella 401', async () => {
    feedback.addFeedback({ name: 'L', text: 'Sade suhisee', context: '' });
    expect((await call(FEEDBACK_PENDING_PATH, null)).status).toBe(401);
    expect((await call(FEEDBACK_PENDING_PATH, 'väärä')).status).toBe(401);
    expect((await call(FEEDBACK_EXPORTED_PATH, 'väärä', { id: 1, issue: 2 })).status).toBe(401);
  });

  it('haku ja kuittaus oikealla avaimella', async () => {
    const res = await call(FEEDBACK_PENDING_PATH, TOKEN);
    expect(res.status).toBe(200);
    const { feedback: pending } = (await res.json()) as {
      feedback: { id: number; text: string }[];
    };
    expect(pending.map((f) => f.text)).toEqual(['Sade suhisee']);
    expect((await call(FEEDBACK_EXPORTED_PATH, TOKEN, { id: 'x', issue: 2 })).status).toBe(400);
    expect((await call(FEEDBACK_EXPORTED_PATH, TOKEN, { id: 999, issue: 2 })).status).toBe(404);
    expect(
      (await call(FEEDBACK_EXPORTED_PATH, TOKEN, { id: pending[0]!.id, issue: 2 })).status,
    ).toBe(200);
    expect(feedback.pending()).toEqual([]);
  });
});
