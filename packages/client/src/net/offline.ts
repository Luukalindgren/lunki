import { isStandalone } from '../ui/fullscreen';

/**
 * Pelin tiedostot laitteelle service workerilla (#328): toisella avauskerralla
 * peli aukeaa heti, ja yksinpeliä voi pelata ilman nettiä. Vain tuotantobuildissa
 * ja HTTPS:llä; kehitystila ja lähiverkon http-build ohitetaan.
 */

/** Uutta versiota tarkistetaan sovellukseen palatessa enintään näin usein (ms). */
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * Rekisteröi service workerin. `onUpdate` kutsutaan, kun uusi versio on
 * ladattu ja odottaa: sen saama funktio ottaa version käyttöön ja lataa sivun.
 */
export function registerServiceWorker(onUpdate: (apply: () => void) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  const sw = navigator.serviceWorker;
  let applying = false;
  sw.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });
  const waiting = (worker: ServiceWorker) => {
    // Ensimmäinen asennus ei ole päivitys.
    if (!sw.controller) return;
    onUpdate(() => {
      applying = true;
      worker.postMessage('skipWaiting');
    });
  };
  // Rekisteröinti sivun latauduttua, ettei asennus kilpaile pelin latauksen kanssa.
  const register = () => sw.register('./sw.js');
  const registered =
    document.readyState === 'complete'
      ? register()
      : new Promise<ServiceWorkerRegistration>((resolve, reject) =>
          window.addEventListener('load', () => register().then(resolve, reject), { once: true }),
        );
  registered
    .then((reg) => {
      if (reg.waiting) waiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') waiting(worker);
        });
      });
      // Kotivalikon sovellus voi olla auki päiviä: tarkistetaan palatessa.
      let checked = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - checked < UPDATE_CHECK_INTERVAL)
          return;
        checked = Date.now();
        reg.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);
  persistStorage();
}

/**
 * Pyytää, ettei selain siivoa tallennuksia (nimi, värit, varusteet,
 * asetukset). Kotivalikon sovelluksessa ja Chromium-selaimissa lupa tulee
 * ilman kysymystä; Firefox kysyisi välilehdessä erikseen, joten siellä ei pyydetä.
 */
function persistStorage(): void {
  const chromium = 'userAgentData' in navigator;
  if (!navigator.storage?.persist || !(isStandalone() || chromium)) return;
  navigator.storage
    .persisted()
    .then((done) => (done ? true : navigator.storage.persist()))
    .catch(() => undefined);
}
