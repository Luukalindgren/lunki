import { Server, createEndpoint, createRouter } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { RECORDS_PATH, ROOM_NAME } from '@lunki/shared';
import { setRecordStore } from './records';
import type { RecordStore } from './records/store';
import { LunkiRoom } from './rooms/LunkiRoom';

/** Luo pelipalvelimen. Erillään käynnistyksestä, jotta testit voivat ajaa sen. */
export function createServer(records?: RecordStore): Server {
  const server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define(ROOM_NAME, LunkiRoom);
  setRecordStore(records ?? null);
  server.router = createRouter({
    records: createEndpoint(RECORDS_PATH, { method: 'GET' }, async () => records?.board() ?? {}),
  });
  return server;
}
