import * as THREE from 'three';
import { LOOK_UNIFORMS } from '../engine/look';
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
  /**
   * Retron paletti ei sekoita värejä: osa piirretään peittävänä, kun siitä
   * näkyisi veden läpi vähintään näin paljon (0–1), ja muuten ei lainkaan.
   */
  solid: 0.15,
  /**
   * Vedenalaisten osien keskinäinen järjestys mahtuu näin korkeaan kaistaan
   * (m) `surface`-korkeuden alle: syvin kirjoitetaan kaistan alareunaan.
   * Kaista ei saa ulottua lähelle pintaa, ettei aallonharja leikkaa osia.
   */
  order: 0.03,
  /**
   * Syvyyskierros kirjoitetaan näin paljon (m kaistalla) värin taakse, jotta
   * osan oma väri läpäisee testin varmasti. Pienempi kuin osien välinen ero
   * kaistalla (sentti on kaistalla 0,2 mm).
   */
  depthGap: 5e-5,
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
 * Vedenalaisten osien syvyys piirretään tässä järjestyksessä: veden ja
 * aaltoilevan lähiveden jälkeen, ennen läpikuultavia pintoja.
 */
export const SUBMERGED_ORDER = 1;

const VERTEX_HEAD =
  'uniform float uSubmergedLift;\nvarying float vSubmerged;\nvarying float vSubmergedFar;\n';
const FRAGMENT_HEAD =
  'uniform float uLookSharp;\nvarying float vSubmerged;\nvarying float vSubmergedFar;\n';

/**
 * Syvyys kohdasta, jossa katseen säde leikkaa vedenpinnan. Syvemmällä oleva
 * kohta kirjoitetaan hieman alemmas pinnan ja `surface`-korkeuden väliin,
 * joten vedenalaiset osat pysyvät keskenään oikeassa järjestyksessä.
 */
const VERTEX = /* glsl */ `#include <project_vertex>
      vec4 subWorld = modelMatrix * vec4(transformed, 1.0);
      vSubmerged = uSubmergedLift - subWorld.y;
      float subSurface = uSubmergedLift + ${f(SUBMERGED.surface)};
      vSubmergedFar = isOrthographic ? 0.0 : length(subWorld.xz - cameraPosition.xz);
      if (subWorld.y < subSurface) {
        float subDeep = max(vSubmerged, 0.0);
        float subLevel = subSurface - ${f(SUBMERGED.order)} * min(subDeep / ${f(SEE_THROUGH_DEPTH)}, 1.0);
        #ifdef SUBMERGED_DEPTH_PASS
        subLevel -= ${SUBMERGED.depthGap.toExponential(1)};
        #endif
        // Katseen säde kameran koordinaateissa: luvut ovat pieniä, joten väri ja
        // syvyyskierros osuvat samaan syvyyteen järven kaukaisessakin kolkassa.
        // Perspektiivissä säde lähtee kamerasta, kartalla se kulkee kameran suuntaan.
        float subDown = isOrthographic ? -viewMatrix[1][2] : subWorld.y - cameraPosition.y;
        if (subDown < -1e-4) {
          vec3 subAt = isOrthographic
            ? mvPosition.xyz - vec3(0.0, 0.0, (subLevel - subWorld.y) / subDown)
            : mvPosition.xyz * ((subLevel - cameraPosition.y) / subDown);
          vec4 subClip = projectionMatrix * vec4(subAt, 1.0);
          gl_Position.z = subClip.z / subClip.w * gl_Position.w;
        }
      }`;

/** Kuinka paljon osasta näkyy veden läpi (`subSeen`, 0–1). */
const SEEN = /* glsl */ `float subSeen = ${f(1 - SUBMERGED.veil)} * clamp(1.0 - vSubmerged / ${f(SEE_THROUGH_DEPTH)}, 0.0, 1.0);
        subSeen *= 1.0 - smoothstep(${f(SUBMERGED.far[0])}, ${f(SUBMERGED.far[1])}, vSubmergedFar);`;

/**
 * Tekee pinnasta veden läpi näkyvän: vesi on läpinäkymätön, joten pinnan
 * (y = 0, aallokossa `SUBMERGED_LIFT`) alla oleva osa piirretään veden jälkeen sen päälle sitä
 * läpikuultavampana, mitä syvemmällä se on. Syvyystesti tehdään kohdasta,
 * jossa katseen säde leikkaa vedenpinnan, joten pinnan yläpuoliset kappaleet
 * (rengas, vene, kalastaja) peittävät osan oikein. Pinnan yläpuolelle jäävä
 * osa samasta kappaleesta piirtyy tavallisesti.
 *
 * Osa kuultaa vain veteen: toista vedenalaista osaa tai omaa takapuoltaan se
 * ei päästä läpi, kun kappale saa syvyytensä `solidUnderwater`-kutsulla.
 *
 * Retrossa paletti pyöristäisi osan ja veden sekoituksen vieraaseen sävyyn
 * (punainen räpylä violetiksi, musta veden väriin, #728), joten osa piirretään
 * peittävänä omassa värissään. Pelaajan värit ovat silloin veden alla rampin
 * astetta tummempia (`playerColorMaterial` lukee `SUBMERGED`-määrittelyn).
 *
 * Säilyttää materiaalin oman varjostinmuokkauksen (esim. pelaajan värit).
 */
export function submerge<T extends THREE.Material>(material: T): T {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.uSubmergedLift = SUBMERGED_LIFT;
    shader.uniforms.uLookSharp = LOOK_UNIFORMS.uLookSharp;
    shader.vertexShader = (VERTEX_HEAD + shader.vertexShader).replace(
      '#include <project_vertex>',
      VERTEX,
    );
    shader.fragmentShader = ('#define SUBMERGED\n' + FRAGMENT_HEAD + shader.fragmentShader).replace(
      '#include <opaque_fragment>',
      /* glsl */ `if (vSubmerged > 0.0) {
        ${SEEN}
        // Vesirajassa peitto alkaa liukuen, ettei pintaan jää terävää rajaa.
        float subWet = smoothstep(0.0, 0.04, vSubmerged);
        if (uLookSharp < 0.5) {
          // Paletti: osa näkyy omassa värissään tai ei lainkaan.
          if (subSeen < ${f((1 - SUBMERGED.veil) * SUBMERGED.solid)}) discard;
        } else {
          diffuseColor.a *= mix(1.0, subSeen, subWet);
          outgoingLight *= 1.0 - ${f(SUBMERGED.dim)} * subWet;
        }
      }
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `${key}|submerged`;
  Object.assign(material, VEIL);
  return material;
}

const depthMaterials = new Map<THREE.Side, THREE.Material>();

/** Pelkän syvyyden kirjoittava pinta samalla syvyydellä kuin `submerge`. */
function depthMaterial(side: THREE.Side): THREE.Material {
  let material = depthMaterials.get(side);
  if (material) return material;
  material = new THREE.MeshBasicMaterial({
    colorWrite: false,
    side,
    // Ei polygonOffsetia: se oli suurempi kuin osien välinen ero, ja räpylän
    // kantapää ja reunalistat vilkkuivat aallokossa. Väli tehdään kaistalla
    // (`SUBMERGED.depthGap`).
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSubmergedLift = SUBMERGED_LIFT;
    shader.uniforms.uLookSharp = LOOK_UNIFORMS.uLookSharp;
    shader.vertexShader = (
      '#define SUBMERGED_DEPTH_PASS\n' +
      VERTEX_HEAD +
      shader.vertexShader
    ).replace('#include <project_vertex>', VERTEX);
    // Kohta, josta ei näy mitään, ei saa peittää muutakaan.
    shader.fragmentShader = (FRAGMENT_HEAD + shader.fragmentShader).replace(
      '#include <opaque_fragment>',
      /* glsl */ `if (vSubmerged > 0.0) {
        ${SEEN}
        if (subSeen < (uLookSharp < 0.5 ? ${f((1 - SUBMERGED.veil) * SUBMERGED.solid)} : 0.004)) discard;
      }
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => 'submerged-depth';
  depthMaterials.set(side, material);
  return material;
}

/**
 * Tekee veden alla näkyvästä kappaleesta (`submerge`-pinta) kiinteän: sen
 * syvyys piirretään ennen väriä, joten päällekkäisistä vedenalaisista
 * pinnoista näkyy vain lähin, eikä räpylän kantapää kuulla jalkaterän läpi.
 * Syvyyden piirtää kappaleen lapsi, joka käyttää aina kappaleen nykyistä
 * muotoa (Moderni vaihtaa muodon pehmeään, `Softener`).
 */
export function solidUnderwater<T extends THREE.Mesh>(mesh: T): T {
  const material = mesh.material as THREE.Material;
  const depth = new THREE.Mesh(mesh.geometry, depthMaterial(material.side));
  Object.defineProperty(depth, 'geometry', {
    get: () => mesh.geometry,
    set: () => {},
  });
  depth.name = 'submerged-depth';
  depth.renderOrder = SUBMERGED_ORDER;
  depth.frustumCulled = mesh.frustumCulled;
  depth.raycast = () => {};
  mesh.add(depth);
  return mesh;
}
