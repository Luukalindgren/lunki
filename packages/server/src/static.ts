import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type {
  IncomingMessage,
  RequestListener,
  Server as HttpServer,
  ServerResponse,
} from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

/** Tiedosto kansion sisältä; null, jos polku karkaa kansiosta tai tiedostoa ei ole. */
export async function resolveStatic(root: string, urlPath: string): Promise<string | null> {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0]!);
  } catch {
    return null;
  }
  const base = resolve(root);
  const file = resolve(join(base, rel.endsWith('/') ? `${rel}index.html` : rel));
  if (file !== base && !file.startsWith(base + sep)) return null;
  try {
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}

/**
 * Pelisivun jako samasta palvelimesta (LAN-tila). Kutsutaan käynnistyksen
 * jälkeen: GET-pyyntö, joka osuu kansion tiedostoon, palvelee sen, ja muut
 * (Colyseus, /records, …) jatkavat palvelimen omille käsittelijöille.
 * Colyseuksen reitittimen kautta ei voi, koska se ei saa isoja vastauksia
 * loppuun (better-call 1.3: res.end() jää kutsumatta, kun puskuri täyttyy).
 */
export function serveStatic(server: HttpServer, root: string): void {
  const listeners = server.listeners('request') as RequestListener[];
  server.removeAllListeners('request');
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const rest = () => listeners.forEach((l) => l.call(server, req, res));
    if (req.method !== 'GET' && req.method !== 'HEAD') return rest();
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    void resolveStatic(root, path).then(async (file) => {
      if (!file) return rest();
      const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
      // Vite nimeää assets-tiedostot sisällön tiivisteellä: ne voi pitää välimuistissa.
      const cache = file.includes(`${sep}assets${sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';
      res.writeHead(200, {
        'content-type': type,
        'content-length': (await stat(file)).size,
        'cache-control': cache,
      });
      if (req.method === 'HEAD') res.end();
      else
        createReadStream(file)
          .on('error', () => res.destroy())
          .pipe(res);
    });
  });
}
