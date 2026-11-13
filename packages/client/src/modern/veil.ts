import * as THREE from 'three';

/**
 * Läpikuultavien pintojen sekoitukset Modernissa ilmeessä (#650). Kohtauksen
 * alfakanava ei ole peitto vaan viesti jälkikäsittelylle (`RetroRenderer`):
 * 0 = valonlähde (taivas, salama: ohi sävytyksen ja sumun), muuten usvan
 * tiheys. Läpikuultava pinta ei siksi saa kirjoittaa alfaan omaa peittoaan.
 */

/** Tavallinen läpikuultava pinta: väri sekoittuu peiton mukaan, alfa jää ennalleen. */
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

/** Hehku: väri lisätään peiton mukaan alla olevaan, alfa jää ennalleen. */
export const GLOW = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

/** Valonlähde kuten pelin salama ja taivas: oma väri sellaisenaan, alfaksi 0. */
export const LIGHT = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.ZeroFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.ZeroFactor,
} as const;

/**
 * Leima: ei muuta väriä, mutta nostaa alfan täyteen ja kirjoittaa syvyyden.
 * Taivaan päälle piirretty läpikuultava pinta jäisi muuten valonlähteeksi
 * eikä sävyttyisi muun kuvan mukana, ja kaukosumu laskettaisiin taivaan
 * etäisyydestä. Leima piirretään saman muodon tiheään osaan värin jälkeen.
 */
export const STAMP = {
  transparent: true,
  depthWrite: true,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.ZeroFactor,
  blendDst: THREE.OneFactor,
  blendEquationAlpha: THREE.MaxEquation,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

const SOLID = {
  transparent: false,
  depthWrite: true,
  opacity: 1,
  blending: THREE.NormalBlending,
} as const;

/** Vaihtaa pelin oman pinnan läpikuultavaksi; `unveil` palauttaa sen. */
export function veil(material: THREE.Material): void {
  Object.assign(material, VEIL);
  material.needsUpdate = true;
}

export function unveil(material: THREE.Material): void {
  Object.assign(material, SOLID);
  material.needsUpdate = true;
}

/** Yhden ruudun kuvapisteen koko (m) pisteessä `p`: ohuet osat pysyvät näkyvinä kaukaakin. */
export function pixelAt(camera: THREE.Camera, heightPx: number): (p: THREE.Vector3) => number {
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const c = camera as THREE.OrthographicCamera;
    const size = (c.top - c.bottom) / c.zoom / heightPx;
    return () => size;
  }
  const c = camera as THREE.PerspectiveCamera;
  const k = (2 * Math.tan(THREE.MathUtils.degToRad(c.fov / 2))) / c.zoom / heightPx;
  const eye = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
  return (p) => p.distanceTo(eye) * k;
}

/** Onko kamera näkymä ylhäältä (suora projektio). */
export const fromAbove = (camera: THREE.Camera): boolean =>
  (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
