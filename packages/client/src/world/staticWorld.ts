import * as THREE from 'three';
import { LUNKINJARVI, LUNKINJARVI_SURROUNDINGS, type LakeMap } from '@lunki/shared';
import { createBuildings, createPiers } from './buildings';
import { Ground } from './ground';
import { createShoreScenery } from './shoreScenery';
import { createMapOverlay, createTerrainMesh } from './surroundingsMesh';
import { createVegetation } from './vegetation';

/**
 * Kartan muuttumattomat osat: maasto, metsänreuna, puut, rakennukset,
 * laiturit ja ylhäältä näkyvä karttapohja. Ne eivät riipu kisan asetuksista,
 * joten ne rakennetaan kerran ja jaetaan valikon taustan ja kisojen kesken (#327).
 *
 * Three.js-olio voi olla vain yhdessä kohtauksessa kerrallaan: peli ottaa
 * ryhmät omikseen attach()-kutsulla ennen piirtoa ja irrottaa ne ennen
 * omien resurssiensa vapauttamista, joten jaettuja verkkoja ei vapauteta.
 */
export interface StaticWorld {
  /** Vain kalastajan silmin näkyvät (maasto, metsänreuna, puut, rakennukset). */
  readonly pov: THREE.Group;
  /** Vain ylhäältä näkyvä karttapohja. */
  readonly top: THREE.Group;
  /** Molemmissa näkymissä (laiturit). */
  readonly always: THREE.Group;
}

const worlds = new WeakMap<LakeMap, StaticWorld>();

export function staticWorldFor(map: LakeMap): StaticWorld {
  let world = worlds.get(map);
  if (!world) {
    world = buildStaticWorld(map);
    worlds.set(map, world);
  }
  return world;
}

function buildStaticWorld(map: LakeMap): StaticWorld {
  const pov = new THREE.Group();
  const top = new THREE.Group();
  const always = new THREE.Group();
  pov.name = 'static-pov';
  top.name = 'static-top';
  always.name = 'static-always';
  const surroundings = map === LUNKINJARVI ? LUNKINJARVI_SURROUNDINGS : undefined;
  const ground = new Ground(map, surroundings?.terrain ?? null);
  pov.add(createShoreScenery(map, surroundings, ground));
  pov.add(createVegetation(map, surroundings, ground));
  if (surroundings) {
    const terrain = createTerrainMesh(ground, surroundings, map.islands);
    if (terrain) pov.add(terrain);
    const buildings = createBuildings(surroundings, ground);
    if (buildings) pov.add(buildings);
    const piers = createPiers(map.piers ?? []);
    if (piers) always.add(piers);
    top.add(createMapOverlay(surroundings));
  }
  return { pov, top, always };
}
