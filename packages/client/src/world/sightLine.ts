import * as THREE from 'three';

/**
 * Takaa-näkymän (#691) näköyhteys kamerasta kalastajaan. Rannan lähellä kamera
 * on puiden ja kaislojen seassa, ja kuvan täyttäisi runko tai lehvästö. Kasvi,
 * joka ulottuu kameran ja kalastajan väliselle janalle, jätetään siksi
 * piirtämättä. Arvot ovat yhteiset kaikille maiseman pinnoille kuten
 * `LOOK_UNIFORMS`, ja peli asettaa janan joka ruudulla (`setSightLine`).
 */
export const SIGHT_UNIFORMS = {
  /** Kameran ja kalastajan paikka maailmassa (x, z). */
  uSightFrom: { value: new THREE.Vector2() },
  uSightTo: { value: new THREE.Vector2() },
  /** 1 = takaa-näkymä päällä. */
  uSightOn: { value: 0 },
};

/** Kasvin ja janan väliin jäävä vapaa tila (m) kasvin oman leveyden lisäksi. */
export const SIGHT_MARGIN = 0.6;

/** Näköyhteys kamerasta kohteeseen, tai null kun näkymä ei ole takaa. */
export function setSightLine(camera: THREE.Vector3 | null, target?: THREE.Vector3): void {
  SIGHT_UNIFORMS.uSightOn.value = camera && target ? 1 : 0;
  if (!camera || !target) return;
  SIGHT_UNIFORMS.uSightFrom.value.set(camera.x, camera.z);
  SIGHT_UNIFORMS.uSightTo.value.set(target.x, target.z);
}

/**
 * Peittääkö kasvi näköyhteyden: juuri paikassa `root`, leveys `width` (m).
 * Sama laskenta kuin varjostimessa, testejä varten.
 */
export function blocksSight(
  root: { x: number; z: number },
  width: number,
  reach: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
): boolean {
  const abx = to.x - from.x;
  const abz = to.z - from.z;
  const t = Math.min(
    1,
    Math.max(
      0,
      ((root.x - from.x) * abx + (root.z - from.z) * abz) / Math.max(abx * abx + abz * abz, 1e-4),
    ),
  );
  const d = Math.hypot(root.x - from.x - abx * t, root.z - from.z - abz * t);
  return d < width * reach + SIGHT_MARGIN;
}

const DECLARE = /* glsl */ `
uniform vec2 uSightFrom;
uniform vec2 uSightTo;
uniform float uSightOn;
uniform float uSightReach;
`;

/** Kappaleen juuri ja leveys tulevat sen omasta paikkamatriisista (InstancedMesh). */
const HIDE = /* glsl */ `
#ifdef USE_INSTANCING
  if (uSightOn > 0.5) {
    vec2 sightRoot = (modelMatrix * instanceMatrix[3]).xz;
    vec2 sightLine = uSightTo - uSightFrom;
    float sightT = clamp(
      dot(sightRoot - uSightFrom, sightLine) / max(dot(sightLine, sightLine), 1e-4), 0.0, 1.0);
    float sightGap = distance(sightRoot, uSightFrom + sightLine * sightT);
    // Rajauksen ulkopuolelle siirretty kärki: koko kappale jää piirtämättä.
    if (sightGap < length(instanceMatrix[0].xyz) * uSightReach + ${SIGHT_MARGIN.toFixed(2)})
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
#endif
`;

/**
 * Lisää pinnan varjostimeen näköyhteyden: `InstancedMesh`in kappale, jonka
 * juuri on janasta lähempänä kuin `reach` × kappaleen leveys (paikkamatriisin
 * x-mitta) + `SIGHT_MARGIN`, katoaa takaa-näkymässä. Varjo jää (varjokartalla
 * on oma pintansa), joten Modernissa metsän varjot eivät vilku.
 */
export function clearSightLine(material: THREE.Material, reach: number): void {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  const uniforms = { ...SIGHT_UNIFORMS, uSightReach: { value: reach } };
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECLARE}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${HIDE}`);
  };
  // Three.js tunnistaa ohjelman funktion lähdekoodista: oma avain erottaa
  // tämän pinnan niistä, joilla näköyhteyttä ei ole.
  material.customProgramCacheKey = () => `${key.call(material)}|sight`;
}
