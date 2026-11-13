import * as THREE from 'three';
import { LUNKINJARVI, LUNKINJARVI_SURROUNDINGS, type Season } from '@lunki/shared';
import { Ground } from '../world/ground';
import type { StaticWorld } from '../world/staticWorld';

/**
 * Jaettu maailma testeihin ilman Retron verkkoja: modernin maiseman osat
 * tarvitsevat vain kartan, ympäristön ja maanpinnan.
 */
export function testWorld(season: Season = 'summer'): StaticWorld {
  return {
    pov: new THREE.Group(),
    top: new THREE.Group(),
    always: new THREE.Group(),
    ground: new Ground(LUNKINJARVI, LUNKINJARVI_SURROUNDINGS.terrain),
    map: LUNKINJARVI,
    season,
    surroundings: LUNKINJARVI_SURROUNDINGS,
  };
}
