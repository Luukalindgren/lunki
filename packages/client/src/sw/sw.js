// Lunkinjärven service worker (#328): pelin tiedostot laitteelle, jotta peli
// aukeaa heti ja yksinpeliä voi pelata ilman nettiä. Build (vite.config.ts,
// src/sw/precache.ts) korvaa versiotunnisteen ja tiedostolistan.

const VERSION = '__LUNKI_VERSION__';
/** Asennuksessa tallennettavat tiedostot suhteessa tämän tiedoston kansioon. */
const PRECACHE = ['__LUNKI_PRECACHE__'];
const CACHE = `lunki-${VERSION}`;
/** Näin kauan (ms) odotetaan verkkoa ennen kuin sivu otetaan välimuistista. */
const NETWORK_TIMEOUT = 4000;

const scope = new URL(self.registration.scope);
const indexUrl = new URL('index.html', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('lunki-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
});

// Valikon "Uusi versio saatavilla" -nappi: odottava versio käyttöön heti.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Pelipalvelin ja muut osoitteet menevät suoraan verkkoon.
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode !== 'navigate') event.respondWith(file(request));
  else if (url.pathname === scope.pathname || url.href.split('?')[0] === indexUrl)
    event.respondWith(page(request));
});

/** Sivu verkosta, jotta uusi versio tulee heti; katkon aikana välimuistista. */
async function page(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok) void cache.put(indexUrl, response.clone());
    return response;
  });
  // Hidas vastaus voi epäonnistua vasta, kun sivu on jo annettu välimuistista.
  network.catch(() => undefined);
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT));
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
    return (await cache.match(indexUrl)) ?? (await network);
  } catch (err) {
    const cached = await cache.match(indexUrl);
    if (cached) return cached;
    throw err;
  }
}

/**
 * Tiedostot välimuistista. assets/-tiedostojen nimessä on sisällön tiiviste,
 * joten tallennettu kopio on aina oikea. Muut (puheäänet, kuvakkeet)
 * tallennetaan ensimmäisellä haulla.
 */
async function file(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') void cache.put(request, response.clone());
  return response;
}
