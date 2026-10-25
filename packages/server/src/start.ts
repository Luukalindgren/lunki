import { limitRequestBodies } from './bodyLimit';
import { openDatabase } from './db/open';
import { limitPerIp } from './ipLimit';
import { FeedbackStore } from './feedback/store';
import { loadFeedbackToken } from './feedback/token';
import { RecordStore } from './records/store';
import { createServer } from './server';
import { serveStatic } from './static';

/**
 * Käynnistää pelipalvelimen ympäristömuuttujien mukaan (PORT, LUNKI_DB,
 * LUNKI_HOST). LUNKI_HOST=127.0.0.1 kuuntelee vain tätä konetta (tunnelin
 * takana, ks. scripts/windows/lunki.ps1); oletuksena kaikki verkot.
 */
export async function startServer(opts: { staticDir?: string } = {}) {
  const port = Number(process.env.PORT ?? 2567);
  /** Tietokanta (ennätykset, palaute, virheet): oletuksena palvelimen hakemistossa data/lunki.sqlite. */
  const dbPath = process.env.LUNKI_DB ?? 'data/lunki.sqlite';
  const db = openDatabase(dbPath);
  const server = createServer({
    records: new RecordStore(db),
    feedback: new FeedbackStore(db),
    feedbackToken: loadFeedbackToken(dbPath),
  });
  await server.listen(port, process.env.LUNKI_HOST || undefined);
  const http = server.transport.server!;
  if (opts.staticDir) serveStatic(http, opts.staticDir);
  limitPerIp(http);
  limitRequestBodies(http);
  return { server, port, dbPath };
}
