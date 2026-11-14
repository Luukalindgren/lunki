import type * as THREE from 'three';
import { VEIL } from '../engine/veil';

/** Näin matalalla (m pinnasta) olevat osat kuultavat veden läpi. */
export const SEE_THROUGH_DEPTH = 1.5;

/** Veden alla näkyvien osien säädöt (ks. `submerge`). */
export const SUBMERGED = {
  /**
   * Korkeus pinnasta (m), jolta vedenalaisen osan syvyys kirjoitetaan: juuri
   * pinnan yläpuolelta, jotta vesi ei peitä osaa mutta pinnan päällä olevat
   * kappaleet peittävät.
   */
  surface: 0.05,
  /** Veden peitto heti pinnan alla, 0–1. */
  veil: 0.45,
  /** Pinnan alla osa on näin paljon tummempi: vesi vie valoa. */
  dim: 0.3,
  /** Järven tasolta katsottuna osat hiipuvat pois tällä matkalla (m), kuten pohjan sävy. */
  far: [18, 32],
} as const;

/**
 * Kuinka selvästi veden alla oleva kohta näkyy pinnalle: 1 pintaan asti
 * ulottuvalla, hiipuu nollaan SEE_THROUGH_DEPTH-syvyydessä.
 */
export function coverVisibility(depth: number): number {
  return Math.max(0, Math.min(1, 1 - depth / SEE_THROUGH_DEPTH));
}

/**
 * Vedenpinnan korkeus (m) kalastajan kohdalla: järven tasolla lähivesi
 * aaltoilee (ks. Swell), ja peli asettaa tähän aallon korkeuden joka ruudulla,
 * jotta omat räpylät eivät jää aallonharjan taakse. Ylhäältä pinta on tasainen (0).
 */
export const SUBMERGED_LIFT = { value: 0 };

const f = (n: number) => n.toFixed(3);

/**
 * Tekee pinnasta veden läpi näkyvän: vesi on läpinäkymätön, joten pinnan
 * (y = 0, aallokossa `SUBMERGED_LIFT`) alla oleva osa piirretään veden jälkeen sen päälle sitä
 * läpikuultavampana, mitä syvemmällä se on. Syvyystesti tehdään kohdasta,
 * jossa katseen säde leikkaa vedenpinnan, joten pinnan yläpuoliset kappaleet
 * (rengas, vene, kalastaja) peittävät osan oikein. Pinnan yläpuolelle jäävä
 * osa samasta kappaleesta piirtyy tavallisesti.
 *
 * Säilyttää materiaalin oman varjostinmuokkauksen (esim. pelaajan värit).
 */
export function submerge<T extends THREE.Material>(material: T): T {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.uSubmergedLift = SUBMERGED_LIFT;
    shader.vertexShader = (
      'uniform float uSubmergedLift;\nvarying float vSubmerged;\nvarying float vSubmergedFar;\n' +
      shader.vertexShader
    ).replace(
      '#include <project_vertex>',
      /* glsl */ `#include <project_vertex>
      vec4 subWorld = modelMatrix * vec4(transformed, 1.0);
      vSubmerged = uSubmergedLift - subWorld.y;
      float subSurface = uSubmergedLift + ${f(SUBMERGED.surface)};
      vSubmergedFar = isOrthographic ? 0.0 : length(subWorld.xz - cameraPosition.xz);
      if (subWorld.y < subSurface) {
        // Katseen säde: perspektiivissä kamerasta, kartalla kameran suuntaan.
        vec3 subRay = isOrthographic
          ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])
          : subWorld.xyz - cameraPosition;
        if (subRay.y < -1e-4) {
          vec3 subAt = subWorld.xyz + subRay * ((subSurface - subWorld.y) / subRay.y);
          vec4 subClip = projectionMatrix * viewMatrix * vec4(subAt, 1.0);
          gl_Position.z = subClip.z / subClip.w * gl_Position.w;
        }
      }`,
    );
    shader.fragmentShader = (
      'varying float vSubmerged;\nvarying float vSubmergedFar;\n' + shader.fragmentShader
    ).replace(
      '#include <opaque_fragment>',
      /* glsl */ `if (vSubmerged > 0.0) {
        float subSeen = ${f(1 - SUBMERGED.veil)} * clamp(1.0 - vSubmerged / ${f(SEE_THROUGH_DEPTH)}, 0.0, 1.0);
        subSeen *= 1.0 - smoothstep(${f(SUBMERGED.far[0])}, ${f(SUBMERGED.far[1])}, vSubmergedFar);
        // Vesirajassa peitto alkaa liukuen, ettei pintaan jää terävää rajaa.
        float subWet = smoothstep(0.0, 0.04, vSubmerged);
        diffuseColor.a *= mix(1.0, subSeen, subWet);
        outgoingLight *= 1.0 - ${f(SUBMERGED.dim)} * subWet;
      }
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `${key}|submerged`;
  Object.assign(material, VEIL);
  return material;
}
