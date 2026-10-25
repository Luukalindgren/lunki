import { GAME_NAME } from '@lunki/shared';
import { openDatabase } from './db/open';
import { FeedbackStore } from './feedback/store';
import { RecordStore } from './records/store';
import { createServer } from './server';

const port = Number(process.env.PORT ?? 2567);
/** Tietokanta (ennätykset, palaute, virheet): oletuksena palvelimen hakemistossa data/lunki.sqlite. */
const dbPath = process.env.LUNKI_DB ?? 'data/lunki.sqlite';
const db = openDatabase(dbPath);
const server = createServer({ records: new RecordStore(db), feedback: new FeedbackStore(db) });
await server.listen(port);
console.log(`${GAME_NAME}-palvelin kuuntelee porttia ${port} (tietokanta: ${dbPath})`);
