import type {
  IncomingMessage,
  RequestListener,
  Server as HttpServer,
  ServerResponse,
} from 'node:http';

/**
 * Pyynnön rungon enimmäiskoko (tavua). Palaute, virheraportti ja liittymisen
 * valinnat ovat muutamia kilotavuja.
 */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Hylkää liian isot pyynnöt ennen Colyseuksen käsittelijöitä. Colyseuksen
 * reititin lukee rungon muistiin rajatta, joten yksikin satojen megatavujen
 * pyyntö riittäisi kaatamaan palvelimen. Rungollisessa pyynnössä on oltava
 * content-length (selain ja Colyseuksen asiakas lähettävät sen aina), jotta
 * koon voi tarkistaa lukematta runkoa.
 */
export function limitRequestBodies(server: HttpServer, max = MAX_BODY_BYTES): void {
  const listeners = server.listeners('request') as RequestListener[];
  server.removeAllListeners('request');
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const length = req.headers['content-length'];
    const chunked = req.headers['transfer-encoding'] !== undefined;
    const reject = (status: number) => {
      res.writeHead(status, { connection: 'close', 'content-type': 'text/plain' });
      res.end();
    };
    if (chunked && length === undefined) return reject(411);
    if (length !== undefined && !(Number(length) <= max)) return reject(413);
    listeners.forEach((l) => l.call(server, req, res));
  });
}
