import type {
  IncomingMessage,
  RequestListener,
  Server as HttpServer,
  ServerResponse,
} from 'node:http';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Pyytäjän IP-osoite, tai null, jos sitä ei tiedetä. Tunnelin (Tailscale
 * Funnel, cloudflared) takana yhteys tulee pelikoneelta itseltään, ja tunneli
 * lisää asiakkaan osoitteen X-Forwarded-For-otsakkeen loppuun. Otsakkeeseen
 * luotetaan vain silloin: suoraan yhdistävä voisi kirjoittaa siihen mitä
 * tahansa. Otsakkeen alkupään merkinnät ovat asiakkaan omia, joten käytetään
 * viimeistä.
 */
export function clientIp(req: IncomingMessage): string | null {
  const remote = req.socket.remoteAddress ?? '';
  if (!LOOPBACK.has(remote)) return remote || null;
  const forwarded = req.headers['x-forwarded-for'];
  const list = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? '')).split(',');
  return list.at(-1)?.trim() || null;
}

export interface IpRule {
  /** Mihin pyyntöihin sääntö koskee (POST-pyynnön polku). */
  path: RegExp;
  /** Enintään näin monta pyyntöä minuutissa samasta osoitteesta. */
  perMinute: number;
}

/**
 * Pyyntöjä minuutissa IP-osoitetta kohden. Samassa kotiverkossa pelaavilla on
 * sama julkinen osoite, joten rajat ovat väljiä: ne estävät vain skriptin,
 * joka luo huoneita tai lähettää palautetta putkeen.
 */
export const IP_RULES: IpRule[] = [
  { path: /^\/matchmake\/(create|joinOrCreate)\//, perMinute: 20 },
  { path: /^\/matchmake\//, perMinute: 120 },
  { path: /^\/feedback$/, perMinute: 5 },
  { path: /^\/feedback\/exported$/, perMinute: 60 },
  { path: /^\/errors$/, perMinute: 20 },
];

/** Hylkää (429) liian tiheät POST-pyynnöt samasta osoitteesta ennen muita käsittelijöitä. */
export function limitPerIp(server: HttpServer, rules = IP_RULES, now = () => Date.now()): void {
  const counts = rules.map(() => new Map<string, { start: number; n: number }>());
  const listeners = server.listeners('request') as RequestListener[];
  server.removeAllListeners('request');
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const ip = req.method === 'POST' ? clientIp(req) : null;
    const path = (req.url ?? '/').split('?')[0]!;
    if (ip) {
      const t = now();
      for (const [i, rule] of rules.entries()) {
        if (!rule.path.test(path)) continue;
        const seen = counts[i]!;
        // Vanhat merkinnät pois, ettei muisti kasva.
        if (seen.size > 10_000) for (const [k, v] of seen) if (t - v.start > 60_000) seen.delete(k);
        let c = seen.get(ip);
        if (!c || t - c.start > 60_000) seen.set(ip, (c = { start: t, n: 0 }));
        if (++c.n > rule.perMinute) {
          res.writeHead(429, {
            connection: 'close',
            'content-type': 'text/plain',
            'retry-after': '60',
          });
          res.end();
          return;
        }
      }
    }
    listeners.forEach((l) => l.call(server, req, res));
  });
}
