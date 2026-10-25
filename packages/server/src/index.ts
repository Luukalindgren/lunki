import { GAME_NAME } from '@lunki/shared';
import { startServer } from './start';

const { port, dbPath } = await startServer();
console.log(`${GAME_NAME}-palvelin kuuntelee porttia ${port} (tietokanta: ${dbPath})`);
