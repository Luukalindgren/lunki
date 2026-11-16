import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { playerColorMaterial } from '../game/playerColor';
import {
  SEE_THROUGH_DEPTH,
  SUBMERGED_ORDER,
  coverVisibility,
  solidUnderwater,
  submerge,
} from './submerged';

/** Kääntää materiaalin varjostinmuokkaukset three.js:n lohkoja muistuttavaan runkoon. */
function compile(material: THREE.Material) {
  const shader = {
    vertexShader: 'void main() {\n#include <project_vertex>\n}',
    fragmentShader: 'void main() {\n#include <opaque_fragment>\n}',
    uniforms: {} as Record<string, unknown>,
  };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe('veden alla näkyvät osat', () => {
  it('rakenne näkyy pintaan asti ja katoaa näkyvyyden rajalla', () => {
    expect(coverVisibility(0)).toBe(1);
    expect(coverVisibility(SEE_THROUGH_DEPTH / 2)).toBeCloseTo(0.5);
    expect(coverVisibility(SEE_THROUGH_DEPTH * 2)).toBe(0);
  });

  it('pinta on läpikuultava eikä kirjoita syvyyttä tai alfaa', () => {
    const material = submerge(new THREE.MeshLambertMaterial());
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.blendSrcAlpha).toBe(THREE.ZeroFactor);
  });

  it('säilyttää materiaalin oman varjostinmuokkauksen ja saa oman ohjelmansa', () => {
    const material = new THREE.MeshLambertMaterial();
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = '// oma\n' + shader.fragmentShader;
    };
    material.customProgramCacheKey = () => 'oma';
    submerge(material);
    const shader = compile(material);
    expect(shader.fragmentShader).toContain('// oma');
    expect(shader.fragmentShader).toContain('vSubmerged');
    expect(shader.vertexShader).toContain('gl_Position.z');
    expect(shader.uniforms).toHaveProperty('uSubmergedLift');
    expect(material.customProgramCacheKey()).toBe('oma|submerged');
  });

  it('Retrossa osa on peittävä ja pelaajan väri rampin astetta tummempi (#728)', () => {
    const shader = compile(submerge(playerColorMaterial(0xd23a2a)));
    // Paletti ei sekoita värejä: Retrossa ei läpikuultavuutta, vaan osa näkyy tai ei.
    expect(shader.uniforms).toHaveProperty('uLookSharp');
    expect(shader.fragmentShader).toMatch(/uLookSharp < 0\.5\) \{[^}]*discard;/);
    // Määrittely on ennen pelaajan värin koodia, joka lukee sen.
    const define = shader.fragmentShader.indexOf('#define SUBMERGED');
    const ramp = shader.fragmentShader.indexOf('#ifdef SUBMERGED');
    expect(define).toBe(0);
    expect(ramp).toBeGreaterThan(define);
    expect(shader.fragmentShader.indexOf('uRamp[0]')).toBeGreaterThan(ramp);
  });

  it('kiinteä kappale piirtää syvyytensä ennen väriä samasta muodosta', () => {
    const material = submerge(new THREE.MeshLambertMaterial());
    material.side = THREE.DoubleSide;
    const mesh = solidUnderwater(
      new THREE.Mesh<THREE.BufferGeometry>(new THREE.BoxGeometry(), material),
    );
    const depth = mesh.children[0] as THREE.Mesh;
    const depthMaterial = depth.material as THREE.Material;
    expect(depthMaterial.colorWrite).toBe(false);
    expect(depthMaterial.depthWrite).toBe(true);
    expect(depthMaterial.transparent).toBe(false);
    expect(depthMaterial.side).toBe(THREE.DoubleSide);
    expect(depth.renderOrder).toBe(SUBMERGED_ORDER);
    // Sama syvyys kuin värillä, ja näkymätön kohta ei peitä.
    const shader = compile(depthMaterial);
    expect(shader.vertexShader).toBe(compile(material).vertexShader);
    expect(shader.fragmentShader).toContain('discard');
    // Moderni vaihtaa kappaleen muodon: syvyys seuraa mukana.
    const soft = new THREE.SphereGeometry();
    mesh.geometry = soft;
    expect(depth.geometry).toBe(soft);
  });
});
