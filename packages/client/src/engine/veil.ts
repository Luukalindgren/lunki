import * as THREE from 'three';

/**
 * Läpikuultavan pinnan sekoitus: väri sekoittuu peiton mukaan, alfa jää
 * ennalleen. Kohtauksen alfakanava ei ole peitto vaan viesti jälkikäsittelylle
 * (`RetroRenderer`: 0 = valonlähde, muuten usvan tiheys), joten läpikuultava
 * pinta ei saa kirjoittaa siihen omaa peittoaan.
 */
export const VEIL = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;
