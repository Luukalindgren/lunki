import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@lunki/shared';
import { LunkiRoom } from './rooms/LunkiRoom';

/** Luo pelipalvelimen. Erillään käynnistyksestä, jotta testit voivat ajaa sen. */
export function createServer(): Server {
  const server = new Server({ transport: new WebSocketTransport(), greet: false });
  server.define(ROOM_NAME, LunkiRoom);
  return server;
}
