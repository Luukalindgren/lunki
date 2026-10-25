import { GAME_NAME } from '@lunki/shared';
import { RecordStore } from './records/store';
import { createServer } from './server';

const port = Number(process.env.PORT ?? 2567);
/** Ennätystiedosto: oletuksena palvelimen hakemistossa data/lunki.sqlite. */
const dbPath = process.env.LUNKI_DB ?? 'data/lunki.sqlite';
const server = createServer(new RecordStore(dbPath));
await server.listen(port);
console.log(`${GAME_NAME}-palvelin kuuntelee porttia ${port} (ennätykset: ${dbPath})`);
