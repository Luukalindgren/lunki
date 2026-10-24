import { GAME_NAME } from '@lunki/shared';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app puuttuu');

app.textContent = `${GAME_NAME} – tulossa pian`;
