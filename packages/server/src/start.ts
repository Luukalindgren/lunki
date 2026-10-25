import { limitRequestBodies } from './bodyLimit';
import { openDatabase } from './db/open';
import { FeedbackStore } from './feedback/store';
import { RecordStore } from './records/store';
import { createServer } from './server';
import { serveStatic } from './static';

/** Käynnistää pelipalvelimen ympäristömuuttujien mukaan (PORT, LUNKI_DB). */
export async function startServer(opts: { staticDir?: string } = {}) {
  const port = Number(process.env.PORT ?? 2567);
  /** Tietokanta (ennätykset, palaute, virheet): oletuksena palvelimen hakemistossa data/lunki.sqlite. */
  const dbPath = process.env.LUNKI_DB ?? 'data/lunki.sqlite';
  const db = openDatabase(dbPath);
  const server = createServer({
    records: new RecordStore(db),
    feedback: new FeedbackStore(db),
  });
  await server.listen(port);
  const http = server.transport.server!;
  if (opts.staticDir) serveStatic(http, opts.staticDir);
  limitRequestBodies(http);
  return { server, port, dbPath };
}
