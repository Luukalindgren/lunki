import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEE_THROUGH_DEPTH, coverVisibility, submerge } from './submerged';

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
    const shader = {
      vertexShader: 'void main() {\n#include <project_vertex>\n}',
      fragmentShader: 'void main() {\n#include <opaque_fragment>\n}',
      uniforms: {},
    };
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain('// oma');
    expect(shader.fragmentShader).toContain('vSubmerged');
    expect(shader.vertexShader).toContain('gl_Position.z');
    expect(shader.uniforms).toHaveProperty('uSubmergedLift');
    expect(material.customProgramCacheKey()).toBe('oma|submerged');
  });
});
