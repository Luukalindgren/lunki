import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SIGHT_MARGIN,
  SIGHT_UNIFORMS,
  blocksSight,
  clearSightLine,
  setSightLine,
} from './sightLine';

describe('takaa-näkymän näköyhteys (#703)', () => {
  afterEach(() => setSightLine(null));

  const from = { x: 0, z: 0 };
  const to = { x: 0, z: -4 };

  it('janalle ulottuva puu peittää, sivummalla oleva ei', () => {
    // Kuusen kuva on 9 m leveä: runko 3 m sivussa ulottuu janalle.
    expect(blocksSight({ x: 3, z: -2 }, 9, 0.5, from, to)).toBe(true);
    expect(blocksSight({ x: 6, z: -2 }, 9, 0.5, from, to)).toBe(false);
    // Kapea kaislatupas peittää vain aivan janan vierestä.
    expect(blocksSight({ x: 0.5, z: -2 }, 1.2, 0.5, from, to)).toBe(true);
    expect(blocksSight({ x: 2, z: -2 }, 1.2, 0.5, from, to)).toBe(false);
  });

  it('etäisyys lasketaan janaan, ei sen jatkeeseen', () => {
    // Kalastajan takana kaukana oleva puu jää maisemaan, vaikka se on samalla linjalla.
    expect(blocksSight({ x: 0, z: -20 }, 9, 0.5, from, to)).toBe(false);
    // Kameran selän takana oleva puu peittää vain, jos sen kuva ulottuu kameraan.
    expect(blocksSight({ x: 0, z: 3 }, 9, 0.5, from, to)).toBe(true);
    expect(blocksSight({ x: 0, z: 4.5 + SIGHT_MARGIN + 0.1 }, 9, 0.5, from, to)).toBe(false);
  });

  it('kamera kalastajan kohdalla ei jaa nollalla', () => {
    expect(blocksSight({ x: 1, z: 0 }, 1, 0.5, from, from)).toBe(true);
    expect(blocksSight({ x: 5, z: 0 }, 1, 0.5, from, from)).toBe(false);
  });

  it('jana asetetaan vain takaa-näkymässä', () => {
    expect(SIGHT_UNIFORMS.uSightOn.value).toBe(0);
    setSightLine(new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 0, 5));
    expect(SIGHT_UNIFORMS.uSightOn.value).toBe(1);
    expect(SIGHT_UNIFORMS.uSightFrom.value.toArray()).toEqual([1, 3]);
    expect(SIGHT_UNIFORMS.uSightTo.value.toArray()).toEqual([4, 5]);
    setSightLine(null);
    expect(SIGHT_UNIFORMS.uSightOn.value).toBe(0);
  });

  it('pinnan varjostin saa väistön ja säilyttää aiemman muokkauksen', () => {
    const material = new THREE.MeshBasicMaterial();
    let earlier = 0;
    material.onBeforeCompile = (shader) => {
      earlier++;
      shader.fragmentShader += '// oma';
    };
    material.customProgramCacheKey = () => 'oma';
    clearSightLine(material, 0.5);
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
      fragmentShader: '',
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer,
    );
    expect(earlier).toBe(1);
    expect(shader.fragmentShader).toContain('// oma');
    expect(shader.uniforms.uSightFrom).toBe(SIGHT_UNIFORMS.uSightFrom);
    expect(shader.uniforms.uSightReach!.value).toBe(0.5);
    expect(shader.vertexShader).toContain('uniform vec2 uSightFrom;');
    // Väistö tulee projektion jälkeen, jotta se voi siirtää kärjen pois kuvasta.
    expect(shader.vertexShader.indexOf('sightGap')).toBeGreaterThan(
      shader.vertexShader.indexOf('#include <project_vertex>'),
    );
    expect(material.customProgramCacheKey()).toBe('oma|sight');
  });
});
