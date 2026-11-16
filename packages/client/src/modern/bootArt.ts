/**
 * Kotiteatterin (Moderni) latausnäkymän kuva: sama kohtaus kuin muiden ilmeiden
 * pikselikuvassa (ui/loaderArt.ts, `pikeArt`), mutta sileänä vektorikuvana.
 * Lusikka roikkuu siimassa, hauki ui sen luo ja iskee, ja se nostetaan pinnan
 * yli ylös, minkä jälkeen uusi lusikka laskeutuu. Kuva on sivukuva veden alta:
 * kaikki osat ovat samassa tasossa, ja edessä oleva piirretään viimeisenä.
 *
 * Liike on tiedostossa `boot.css` (luokat `ps-`). Ei DOM-riippuvuuksia:
 * vite.config.ts upottaa kuvan index.html:ään (`bootLoaderHtml`), joten se ei
 * kasvata pelin koodia.
 */

/** Kohtauksen mitat (viewBox) ja siiman paikka; boot.css käyttää samoja lukuja. */
export const SCENE = { w: 320, h: 160, surface: 20, lineX: 220, lineEnd: 88 } as const;

const FIN = '#c4583a';

/** Hauki sivulta kuono origossa, pyrstö vasemmalla (-x). */
const PIKE =
  `<g class="ps-tail">` +
  `<path fill="${FIN}" d="M-104 -4C-112 -8 -118 -15 -125 -18C-122 -8 -120 -3 -116 0C-120 3 -122 8 -125 18C-118 15 -112 8 -104 4Z"/>` +
  `</g>` +
  `<path fill="${FIN}" d="M-84 -9C-90 -19 -100 -17 -104 -5Z"/>` +
  `<path fill="${FIN}" d="M-86 8C-92 17 -100 15 -103 4Z"/>` +
  `<path fill="${FIN}" d="M-56 10C-60 17 -67 16 -69 9Z"/>` +
  // Kita auki: punainen suu leuan alla.
  `<path class="ps-mouth" fill="#6e2620" d="M-15 3L3 1.5L-1 10Z"/>` +
  `<path fill="url(#ps-body)" d="M3 1C-3 -3 -14 -6 -26 -8C-46 -11 -76 -11 -98 -6L-106 -4L-106 4L-98 6C-76 11 -46 12 -26 9C-16 8 -6 5 3 1Z"/>` +
  `<g fill="#d7e08e" opacity="0.75">` +
  [
    [-34, -2, 2.4],
    [-42, 2, 2],
    [-50, -3, 2.6],
    [-58, 1, 2.2],
    [-66, -3, 2.4],
    [-74, 2, 2],
    [-82, -2, 2.2],
    [-90, 1, 1.8],
    [-46, -6, 1.6],
    [-62, -7, 1.6],
    [-78, -6, 1.5],
  ]
    .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r! * 1.6}" ry="${r}"/>`)
    .join('') +
  `</g>` +
  `<path fill="${FIN}" d="M-27 5C-33 11 -40 11 -42 6Z"/>` +
  `<path fill="none" stroke="#1f3320" stroke-opacity="0.5" stroke-width="1.2" d="M-22 -7C-18 -2 -18 4 -22 8"/>` +
  `<g class="ps-jaw"><path fill="#cfc391" d="M-15 3L3 1.4L3 2.6C-4 5 -11 6 -16 6Z"/></g>` +
  `<circle cx="-15" cy="-3.5" r="2.8" fill="#f2d35a"/><circle cx="-14.4" cy="-3.5" r="1.5" fill="#15150f"/>`;

/** Lusikka: lenkki ylhäällä origossa, kääntyy sivuttain (`ps-spin`). */
const SPOON =
  `<circle cx="0" cy="2" r="1.8" fill="none" stroke="#c9ced2" stroke-width="1"/>` +
  `<g class="ps-spin">` +
  `<ellipse cx="0" cy="12" rx="5.5" ry="9" fill="#d23a2a"/>` +
  `<path fill="#f3ede0" d="M-5 9.5Q0 7 5 9.5L5 13Q0 10.5 -5 13Z"/>` +
  `<ellipse cx="0" cy="12" rx="5.5" ry="9" fill="none" stroke="#5e1a14" stroke-width="0.8"/>` +
  `</g>` +
  `<path fill="none" stroke="#c9ced2" stroke-width="1" d="M0 21v4m0 0q-3 2 -3 -1m3 1q3 2 3 -1"/>`;

/** Kaksi jaksoa aaltoa vierekkäin, jotta pinta voi rullata saumattomasti. */
function surfacePath(): string {
  const { w, surface: s } = SCENE;
  let d = `M0 ${s}`;
  for (let x = 0; x < w * 2; x += 40) d += `q10 -3 20 0t20 0`;
  return `<path fill="url(#ps-water)" d="${d}V${SCENE.h}H0Z"/><path fill="none" stroke="#e6f2ec" stroke-opacity="0.7" stroke-width="1.5" d="${d}"/>`;
}

function weed(x: number, h: number, lean: number, delay: number): string {
  const top = 142 - h;
  return (
    `<path class="ps-weed" style="transform-origin:${x}px 142px;animation-delay:-${delay}s" ` +
    `fill="none" stroke="#4f9a52" stroke-width="2.6" stroke-linecap="round" ` +
    `d="M${x} 142C${x - 4} ${top + h * 0.6} ${x + 5 + lean} ${top + h * 0.3} ${x + lean} ${top}"/>`
  );
}

const { w: W, h: H, surface: S, lineX: LX, lineEnd: LE } = SCENE;

export const MODERN_BOOT_ART =
  `<div class="boot-scene" aria-hidden="true">` +
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">` +
  `<defs>` +
  `<linearGradient id="ps-water" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#3c8c8e"/><stop offset="0.55" stop-color="#1f5a60"/><stop offset="1" stop-color="#123c44"/></linearGradient>` +
  `<linearGradient id="ps-sky" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#e9d9b0"/><stop offset="1" stop-color="#cfe0d4"/></linearGradient>` +
  `<linearGradient id="ps-bed" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#b89a62"/><stop offset="1" stop-color="#6e5434"/></linearGradient>` +
  `<linearGradient id="ps-body" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#25402a"/><stop offset="0.36" stop-color="#4c7a38"/>` +
  `<stop offset="0.6" stop-color="#7e9c4c"/><stop offset="0.78" stop-color="#d9cf9b"/><stop offset="1" stop-color="#efe5bf"/></linearGradient>` +
  `</defs>` +
  `<rect width="${W}" height="${S + 4}" fill="url(#ps-sky)"/>` +
  `<g class="ps-surface">${surfacePath()}</g>` +
  // Valokiilat pinnasta.
  `<g fill="#e6f2ec" opacity="0.07"><path d="M40 ${S}L70 ${S}L40 140L0 140Z"/><path d="M150 ${S}L170 ${S}L190 140L140 140Z"/><path d="M260 ${S}L290 ${S}L320 140L280 140Z"/></g>` +
  `<path fill="url(#ps-bed)" d="M0 140C30 134 50 146 90 140S150 132 190 139S260 146 320 136V${H}H0Z"/>` +
  `<ellipse cx="128" cy="146" rx="11" ry="6" fill="#7f7a6c"/><ellipse cx="280" cy="146" rx="8" ry="4.5" fill="#8a8476"/>` +
  weed(24, 36, -4, 0) +
  weed(32, 26, 3, 0.8) +
  weed(292, 40, 4, 0.4) +
  weed(302, 28, -3, 1.4) +
  // Siima ja lusikka hauen takana: hauki ui niiden eteen.
  `<rect class="ps-line" x="${LX - 0.6}" y="0" width="1.2" height="${LE}" fill="#e6ebe8"/>` +
  `<g transform="translate(${LX} ${LE - 4})"><g class="ps-spoon">${SPOON}</g></g>` +
  `<g class="ps-pike">${PIKE}</g>` +
  // Kuplat iskun jälkeen ja roiske pinnalla, kun hauki nousee.
  `<g fill="none" stroke="#e6f2ec" stroke-width="1">` +
  `<circle class="ps-bubble" cx="${LX + 2}" cy="82" r="2"/>` +
  `<circle class="ps-bubble" style="animation-delay:0.15s" cx="${LX - 4}" cy="78" r="1.5"/>` +
  `<circle class="ps-bubble" style="animation-delay:0.3s" cx="${LX + 5}" cy="84" r="1.2"/>` +
  `</g>` +
  `<g class="ps-splash" fill="#f3f7f2">` +
  `<path d="M${LX - 26} ${S}q8 -14 14 -2q4 -10 10 0q6 -16 12 0q4 -9 10 1q6 -12 12 1Z"/>` +
  `<circle cx="${LX - 30}" cy="${S - 10}" r="2"/><circle cx="${LX + 30}" cy="${S - 12}" r="2.2"/>` +
  `<circle cx="${LX - 14}" cy="${S - 18}" r="1.6"/><circle cx="${LX + 16}" cy="${S - 20}" r="1.6"/>` +
  `</g>` +
  `</svg></div>`;

/**
 * Sivun alussa ajettava koodi: latausnäkymä on Kotiteatterin, kun se on
 * laitteelle tallennettu ilme.
 */
export const MODERN_BOOT_SCRIPT =
  `var k=null;try{k=localStorage.getItem('lunki.look')}catch(e){}` +
  `if(k==='modern')` +
  `document.getElementById('boot-loader').classList.add('boot-modern');`;
