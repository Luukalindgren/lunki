/**
 * Latausanimaatio pelin sisällä. Kuvat otetaan sivun omasta latausnäkymästä
 * (vite.config.ts upottaa sen index.html:ään), joten kuvien koodi ei kasvata
 * pelin koodia: pikselikuva muille ilmeille ja Kotiteatterin sileä hauki
 * (`modern/bootArt.ts`). Tyyli (`modern/boot.css`) näyttää ilmeen mukaisen.
 */
const art = document.querySelector('#boot-loader .loader-art')?.cloneNode(true) ?? null;
const scene = document.querySelector('#boot-loader .boot-scene')?.outerHTML ?? null;

let scenes = 0;

/** Kotiteatterin kuva omilla tunnisteillaan, ettei liukuväri viittaa toisen kopion (piilotettuun) määrittelyyn. */
function modernScene(): DocumentFragment | null {
  if (!scene) return null;
  const n = ++scenes;
  const html = scene
    .replace(/id="ps-([\w-]+)"/g, `id="ps-$1-${n}"`)
    .replace(/url\(#ps-([\w-]+)\)/g, `url(#ps-$1-${n})`);
  return document.createRange().createContextualFragment(html);
}

/** Latausanimaatio valikkopaneeliin (liittyminen, paluu kisaan, ennätykset). */
export function createLoader(): HTMLElement {
  const box = document.createElement('div');
  box.className = 'loader';
  if (art) box.appendChild(art.cloneNode(true));
  const modern = modernScene();
  if (modern) box.appendChild(modern);
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
