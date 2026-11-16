/**
 * Kotiteatterin (Moderni) latausnäkymän kuva: koho siiman päässä ja renkaat
 * veden pinnalla. Tyylit ja liike ovat tiedostossa `boot.css`. Ei
 * DOM-riippuvuuksia: vite.config.ts upottaa kuvan index.html:ään
 * (`bootLoaderHtml`, ui/loaderArt.ts), joten se ei kasvata pelin koodia.
 */
const FLOAT =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 108" width="24" height="108">` +
  // Siima ja kohon tikku.
  `<path d="M12 0v78" stroke="#f3ead2" stroke-width="1.2"/>` +
  `<path d="M12 72v8" stroke="#1c120a" stroke-width="2.6"/>` +
  // Punainen yläosa, vaalea alaosa ja tumma ääriviiva.
  `<path d="M4 92a8 12 0 0 1 16 0z" fill="#b5382c"/>` +
  `<path d="M4 92a8 12 0 0 0 16 0z" fill="#fbf6e6"/>` +
  `<ellipse cx="12" cy="92" rx="8" ry="12" fill="none" stroke="#1c120a" stroke-width="1.2"/>` +
  `</svg>`;

export const MODERN_BOOT_ART =
  `<div class="boot-bobber" aria-hidden="true">` +
  `<div class="bobber-air"><div class="bobber-float">${FLOAT}</div></div>` +
  `<div class="bobber-water"></div>` +
  `<div class="bobber-ring"></div><div class="bobber-ring"></div>` +
  `</div>`;

/**
 * Sivun alussa ajettava koodi: latausnäkymä on Kotiteatterin, kun se on
 * laitteelle tallennettu ilme.
 */
export const MODERN_BOOT_SCRIPT =
  `var k=null;try{k=localStorage.getItem('lunki.look')}catch(e){}` +
  `if(k==='modern')` +
  `document.getElementById('boot-loader').classList.add('boot-modern');`;
