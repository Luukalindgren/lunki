import { createServer, request, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientIp, limitPerIp } from './ipLimit';

const fake = (remoteAddress: string, xff?: string) =>
  ({
    socket: { remoteAddress },
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
  }) as unknown as IncomingMessage;

describe('clientIp', () => {
  it('suora yhteys: socketin osoite, otsakkeesta välittämättä', () => {
    expect(clientIp(fake('192.168.1.20', '1.2.3.4'))).toBe('192.168.1.20');
  });

  it('tunnelin takana: tunnelin lisäämä viimeinen osoite', () => {
    expect(clientIp(fake('127.0.0.1', '6.6.6.6, 84.20.1.7'))).toBe('84.20.1.7');
    expect(clientIp(fake('::ffff:127.0.0.1', '84.20.1.7'))).toBe('84.20.1.7');
  });

  it('paikallinen pyyntö ilman otsaketta: osoitetta ei tiedetä', () => {
    expect(clientIp(fake('127.0.0.1'))).toBeNull();
  });
});

describe('limitPerIp', () => {
  const http = createServer((_req, res) => res.end('ok'));
  let port = 0;
  let clock = 0;

  beforeAll(async () => {
    limitPerIp(http, [{ path: /^\/feedback$/, perMinute: 2 }], () => clock);
    await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
    port = (http.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((done) => http.close(() => done())));

  const post = (path: string, ip?: string) =>
    new Promise<number>((done, fail) => {
      const headers = ip ? { 'x-forwarded-for': ip } : {};
      request({ port, path, method: 'POST', headers }, (res) => {
        res.resume();
        done(res.statusCode!);
      })
        .on('error', fail)
        .end();
    });

  it('rajoittaa osoitekohtaisesti ja nollautuu minuutissa', async () => {
    expect(await post('/feedback', '1.1.1.1')).toBe(200);
    expect(await post('/feedback', '1.1.1.1')).toBe(200);
    expect(await post('/feedback', '1.1.1.1')).toBe(429);
    // Toinen osoite ja muut polut eivät kärsi.
    expect(await post('/feedback', '2.2.2.2')).toBe(200);
    expect(await post('/records', '1.1.1.1')).toBe(200);
    // Tuntematon osoite (paikallinen pyyntö) ei joudu yhteiseen kiintiöön.
    for (let i = 0; i < 4; i++) expect(await post('/feedback')).toBe(200);
    clock += 61_000;
    expect(await post('/feedback', '1.1.1.1')).toBe(200);
  });
});
