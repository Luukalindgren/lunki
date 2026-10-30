import * as THREE from 'three';
import { LUNKINJARVI, LUNKINJARVI_SURROUNDINGS, type LakeMap, type Season } from '@lunki/shared';
import { createBuildings, createPiers } from './buildings';
import { Ground } from './ground';
import { createShoreScenery } from './shoreScenery';
import { createMapOverlay, createTerrainMesh } from './surroundingsMesh';
import { createVegetation } from './vegetation';

/**
 * Kartan muuttumattomat osat: maasto, metsänreuna, puut, rakennukset,
 * laiturit ja ylhäältä näkyvä karttapohja. Kisan asetuksista niihin vaikuttaa
 * vain vuodenaika (#427), joten ne rakennetaan kerran kautta kohden ja jaetaan
 * valikon taustan ja kisojen kesken (#327).
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

const worlds = new WeakMap<LakeMap, Map<Season, StaticWorld>>();

export function staticWorldFor(map: LakeMap, season: Season = 'summer'): StaticWorld {
  let bySeason = worlds.get(map);
  if (!bySeason) worlds.set(map, (bySeason = new Map()));
  let world = bySeason.get(season);
  if (!world) {
    // Muiden kausien maailmat vapautetaan, kun mikään kohtaus ei käytä niitä:
    // kausi vaihtuu harvoin, eikä kolmea maisemaa kannata pitää muistissa.
    for (const [other, w] of bySeason) {
      if (w.pov.parent || w.top.parent || w.always.parent) continue;
      disposeWorld(w);
      bySeason.delete(other);
    }
    world = buildStaticWorld(map, season);
    bySeason.set(season, world);
  }
  return world;
}

function disposeWorld(world: StaticWorld): void {
  for (const g of [world.pov, world.top, world.always])
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    });
}

function buildStaticWorld(map: LakeMap, season: Season): StaticWorld {
  const pov = new THREE.Group();
  const top = new THREE.Group();
  const always = new THREE.Group();
  pov.name = 'static-pov';
  top.name = 'static-top';
  always.name = 'static-always';
  const surroundings = map === LUNKINJARVI ? LUNKINJARVI_SURROUNDINGS : undefined;
  const ground = new Ground(map, surroundings?.terrain ?? null);
  pov.add(createShoreScenery(map, surroundings, ground, season));
  pov.add(createVegetation(map, surroundings, ground, season));
  if (surroundings) {
    const terrain = createTerrainMesh(ground, surroundings, map.islands, season);
    if (terrain) pov.add(terrain);
    const buildings = createBuildings(surroundings, ground);
    if (buildings) pov.add(buildings);
    const piers = createPiers(map.piers ?? []);
    if (piers) always.add(piers);
    top.add(createMapOverlay(surroundings, season));
  }
  return { pov, top, always };
}
