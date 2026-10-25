import type { Server } from '@colyseus/core';
import { RECORDS_PATH } from '@lunki/shared';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from './server';
import { serveStatic } from './static';

const PORT = 30000 + Math.floor(Math.random() * 5000);
const root = mkdtempSync(join(tmpdir(), 'lunki-static-'));
mkdirSync(join(root, 'assets'));
writeFileSync(join(root, 'index.html'), '<h1>Lunki</h1>');
// Iso tiedosto: Colyseuksen reitittimen kautta tällainen vastaus jäisi kesken.
const big = 'x'.repeat(1_000_000);
writeFileSync(join(root, 'assets', 'peli.js'), big);
writeFileSync(join(tmpdir(), 'lunki-salainen.txt'), 'salainen');
let server: Server;

/** Raaka pyyntö, jotta polkua ei normalisoida ennen palvelinta. */
const get = (path: string) =>
  new Promise<{ status: number; type?: string; body: string }>((done, fail) => {
    request({ port: PORT, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () =>
        done({ status: res.statusCode!, type: res.headers['content-type'], body }),
      );
    })
      .on('error', fail)
      .end();
  });

beforeAll(async () => {
  server = createServer();
  await server.listen(PORT);
  serveStatic(server.transport.server!, root);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe('serveStatic', () => {
  it('jakaa pelisivun juuresta ja kutsulinkistä', async () => {
    for (const path of ['/', '/index.html', '/?huone=LUNKI-ABCD']) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.type).toContain('text/html');
      expect(res.body).toBe('<h1>Lunki</h1>');
    }
  });

  it('iso tiedosto tulee kokonaan', async () => {
    const res = await get('/assets/peli.js');
    expect(res.type).toContain('text/javascript');
    expect(res.body.length).toBe(big.length);
  });

  it('palvelimen omat polut toimivat edelleen', async () => {
    expect((await get('/__healthcheck')).body).toBe('OK');
    expect((await get(RECORDS_PATH)).status).toBe(200);
    expect((await get('/puuttuu.js')).status).toBe(404);
  });

  it('ei päästä kansion ulkopuolelle', async () => {
    for (const path of [
      '/../lunki-salainen.txt',
      '/%2e%2e/lunki-salainen.txt',
      '/..%2flunki-salainen.txt',
    ]) {
      expect((await get(path)).body).not.toContain('salainen');
    }
  });
});
