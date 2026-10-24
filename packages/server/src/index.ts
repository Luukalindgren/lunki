import { GAME_NAME } from '@lunki/shared';
import { createServer } from './server';

const port = Number(process.env.PORT ?? 2567);
const server = createServer();
await server.listen(port);
console.log(`${GAME_NAME}-palvelin kuuntelee porttia ${port}`);
