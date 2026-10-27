/**
 * Latausanimaatio pelin sisällä. Kuva otetaan sivun omasta latausnäkymästä
 * (vite.config.ts upottaa sen index.html:ään), joten pikselikuvien koodi ei
 * kasvata pelin koodia.
 */
const art = document.querySelector('#boot-loader .loader-art')?.cloneNode(true) ?? null;

/** Latausanimaatio valikkopaneeliin (liittyminen, paluu kisaan, ennätykset). */
export function createLoader(): HTMLElement {
  const box = document.createElement('div');
  box.className = 'loader';
  if (art) box.appendChild(art.cloneNode(true));
  return box;
}

let dismissed = false;

/** Häivyttää sivun ensimmäisen latausnäkymän, kun peli on piirtänyt ensimmäisen kuvansa. */
export function dismissBootLoader(): void {
  if (dismissed) return;
  dismissed = true;
  const el = document.getElementById('boot-loader');
  if (!el) return;
  el.classList.add('boot-loader-done');
  // Häivytyksen jälkeen pois (varmuuden vuoksi myös ajastimella).
  const remove = () => el.remove();
  el.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 400);
}
