import * as THREE from 'three';
import { shadeRamp } from '../engine/palette';

/**
 * Pinnalle tulevan valon voimakkuus (lineaarinen, väristä riippumaton), jonka
 * yläpuolella pinta on valaistu ja jonka alapuolella se on syvässä varjossa:
 * aurinkoon päin ja ylöspäin osoittavat pinnat ovat valaistuja, varjon puoleiset
 * sivut varjopuolta ja alapinnat syvää varjoa.
 */
export const SHADE_STEPS = new THREE.Vector2(0.55, 0.2);

type Ramp = [THREE.Color, THREE.Color, THREE.Color];

/**
 * Pelaajan väri (rengas, räpylät, paita ja hattu) kolmena paletin sävynä
 * (`SHADE_RAMPS`): Lambert-valaistus lasketaan tavalliseen tapaan, mutta
 * tulos vaihdetaan valon voimakkuuden mukaan rampin sävyksi. Näin varjopuoli
 * pysyy samaa väriä eikä pyöristy paletissa ruskeaksi. Kirkkaus tulee silti
 * yhdestä sävytyksestä (SkyView.grade) paletin jälkeen.
 */
export function playerColorMaterial(hex: number): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color: hex });
  const ramp: Ramp = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  material.userData.ramp = ramp;
  setRamp(ramp, hex);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRamp = { value: ramp };
    shader.uniforms.uShadeSteps = { value: SHADE_STEPS };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uRamp[3];\nuniform vec2 uShadeSteps;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        // Valo pinnan väristä riippumatta: vihreä maavalo ei saa tummentaa punaista.
        vec3 rampIrradiance = outgoingLight / max(diffuseColor.rgb, vec3(1e-3));
        float rampLight = dot(rampIrradiance, vec3(0.299, 0.587, 0.114));
        outgoingLight = rampLight > uShadeSteps.x ? uRamp[0]
          : rampLight > uShadeSteps.y ? uRamp[1] : uRamp[2];
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'playerColor';
  return material;
}

/** Vaihtaa pelaajan värin materiaaliin (väri ja varjosävyt). */
export function setPlayerColor(material: THREE.MeshLambertMaterial, hex: number): void {
  material.color.setHex(hex);
  const ramp = material.userData.ramp as Ramp | undefined;
  if (ramp) setRamp(ramp, hex);
}

function setRamp(ramp: Ramp, hex: number): void {
  shadeRamp(hex).forEach((c, i) => ramp[i]!.setHex(c));
}
