import * as THREE from 'three';
import type { LakeMap, Vec2 } from '@lunki/shared';

/** Pelikoordinaatti (x itään, y pohjoiseen) → Three.js-maailma (x, 0, -y). */
export const toWorld = (p: Vec2, height = 0): THREE.Vector3 => new THREE.Vector3(p.x, height, -p.y);

const toShapePoints = (ring: readonly Vec2[]) => ring.map((p) => new THREE.Vector2(p.x, p.y));

/**
 * Prototyypin järvi: tasainen maa, vesialue saarineen ja rantaviiva.
 * Muodot piirretään XY-tasoon ja käännetään vaakatasoon (y → -z).
 */
export function createLakeMesh(map: LakeMap): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lake';

  const { minX, minY, maxX, maxY } = map.bounds;
  const margin = 4000;
  // Jaettu pienempiin kolmioihin: kilometrien kokoisten kolmioiden syvyysarvot
  // heittelevät lähellä kameraa niin, että maa voi peittää veden POV-näkymässä.
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX + margin * 2, maxY - minY + margin * 2, 48, 48),
    new THREE.MeshLambertMaterial({ color: 0x3b7337 }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.set((minX + maxX) / 2, -0.3, -(minY + maxY) / 2);
  group.add(land);

  const shape = new THREE.Shape(toShapePoints(map.shore));
  for (const island of map.islands) shape.holes.push(new THREE.Path(toShapePoints(island)));
  const water = new THREE.Mesh(new THREE.ShapeGeometry(shape), createWaterMaterial());
  water.rotation.x = -Math.PI / 2;
  water.name = 'water';
  group.add(water);

  const shoreMaterial = new THREE.LineBasicMaterial({ color: 0xb99a68 });
  for (const ring of [map.shore, ...map.islands]) {
    const points = ring.map((p) => toWorld(p, 0.02));
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      shoreMaterial,
    );
    group.add(line);
  }
  return group;
}

/** Veden aaltoilun kello (s); päivitetään pelisilmukasta. */
export const waterTime = { value: 0 };

/**
 * Vesi aaltoilee: kuviota luetaan hitaasti vaeltavilla siniaalloilla
 * vääristettynä, jolloin aallonharjat kiemurtelevat ja välkehtivät.
 */
function createWaterMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, map: createWaterTexture() });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime;
    shader.fragmentShader = ('uniform float uWaterTime;\n' + shader.fragmentShader).replace(
      'vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
      /* glsl */ `vec2 waveUv = vMapUv + vec2(uWaterTime * 0.004, uWaterTime * 0.0015);
      waveUv.x += sin(vMapUv.y * 40.0 + uWaterTime * 1.3) * 0.01;
      waveUv.y += sin(vMapUv.x * 33.0 - uWaterTime * 1.1) * 0.008;
      vec4 sampledDiffuseColor = texture2D( map, waveUv );`,
    );
  };
  return material;
}

/**
 * Vedenpinnan pikselikuvio: harvoja välkehtiviä aallonharjoja tummalla pohjalla.
 * ShapeGeometryn UV:t ovat metrejä, joten toisto määrää tekselin koon (0,25 m).
 */
function createWaterTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1b5a84';
  ctx.fillRect(0, 0, size, size);
  // Kiinteä siemen, jotta kuvio on aina sama.
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 220; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const len = 2 + Math.floor(rand() * 4);
    ctx.fillStyle = rand() < 0.6 ? '#2b7aa6' : '#123a5c';
    ctx.fillRect(x, y, len, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / 32, 1 / 32);
  texture.magFilter = THREE.NearestFilter;
  // Kaukaa katsottuna kuvio sulautuu pohjaväriin eikä välky.
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
