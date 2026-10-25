import * as THREE from 'three';
import type { LakeMap, Vec2 } from '@lunki/shared';

/** Pelikoordinaatti (x itään, y pohjoiseen) → Three.js-maailma (x, 0, -y). */
export const toWorld = (p: Vec2, height = 0): THREE.Vector3 => new THREE.Vector3(p.x, height, -p.y);

const toShapePoints = (ring: readonly Vec2[]) => ring.map((p) => new THREE.Vector2(p.x, p.y));

/**
 * Prototyypin järvi: tasainen maa, vesialue saarineen ja rantaviiva.
 * Muodot piirretään XY-tasoon ja käännetään vaakatasoon (y → -z).
 */
export function createLakeMesh(map: LakeMap, waves = createWaterWaves()): THREE.Group {
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
  const water = new THREE.Mesh(new THREE.ShapeGeometry(shape), createWaterMaterial(waves));
  water.rotation.x = -Math.PI / 2;
  water.name = 'water';
  group.add(water);

  // Saaret: matala maakansi, jotta POV-näkymän karkea maasto ei näy veden alta.
  const islandMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5a30 });
  for (const island of map.islands) {
    const cap = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(toShapePoints(island))),
      islandMaterial,
    );
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = 0.25;
    cap.name = 'island';
    group.add(cap);
  }

  // Kaislikot: vihertävä läikkä veden pinnassa (kaislaspritet ks. vegetation.ts).
  const reedMaterial = new THREE.MeshBasicMaterial({
    color: 0x4f6b2a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  for (const bed of map.reeds ?? []) {
    const patch = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(toShapePoints(bed.ring))),
      reedMaterial,
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 0.015;
    patch.name = 'reeds';
    group.add(patch);
  }

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

/** Vesikuvion yhden toiston koko (m). */
const WATER_TEXTURE_METERS = 32;

/** Veden aaltoilun kello (s); päivitetään pelisilmukasta. */
export const waterTime = { value: 0 };

/**
 * Tuulen aallot vesishaderille: aallonkorkeuskerroin tekstuurina (ks.
 * WaveField), tuulen nopeus ja suunta sekä aallon aaltoluku ja kulmataajuus.
 * Jokaisella pelillä omansa: valikon taustapeli ei saa sotkea kisan vettä.
 */
export function createWaterWaves() {
  return {
    uWaveTex: { value: null as THREE.Texture | null },
    uWaveBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    uWaveScale: { value: 0 },
    uWaveDir: { value: new THREE.Vector2(1, 0) },
    uWaveK: { value: 1 },
    uWaveOmega: { value: 1 },
  };
}
export type WaterWaves = ReturnType<typeof createWaterWaves>;

/**
 * Vesi aaltoilee: kuviota luetaan hitaasti vaeltavilla siniaalloilla
 * vääristettynä, jolloin aallonharjat kiemurtelevat ja välkehtivät.
 */
function createWaterMaterial(waves: WaterWaves): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, map: createWaterTexture() });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime;
    Object.assign(shader.uniforms, waves);
    const header = /* glsl */ `uniform float uWaterTime;
uniform sampler2D uWaveTex;
uniform vec4 uWaveBounds;
uniform float uWaveScale;
uniform vec2 uWaveDir;
uniform float uWaveK;
uniform float uWaveOmega;
`;
    // onBeforeCompile näkee vielä include-rivit, joten korvataan koko map_fragment.
    shader.fragmentShader = (header + shader.fragmentShader).replace(
      '#include <map_fragment>',
      /* glsl */ `vec2 waveUv = vMapUv + vec2(uWaterTime * 0.004, uWaterTime * 0.0015);
      waveUv.x += sin(vMapUv.y * 40.0 + uWaterTime * 1.3) * 0.01;
      waveUv.y += sin(vMapUv.x * 33.0 - uWaterTime * 1.1) * 0.008;
      vec4 sampledDiffuseColor = texture2D( map, waveUv );
      // Tuulen aallot: vaaleat harjat kulkevat myötätuuleen (värit lineaarisina);
      // korkeus tulee pyyhkäisymatkasta, ja isoissa aalloissa harjat vaahtoavat.
      if (uWaveScale > 0.0) {
        vec2 wp = vMapUv * ${WATER_TEXTURE_METERS.toFixed(1)};
        float hs = texture2D(uWaveTex, (wp - uWaveBounds.xy) / uWaveBounds.zw).r * uWaveScale;
        float across = dot(wp, vec2(-uWaveDir.y, uWaveDir.x));
        float phase = dot(wp, uWaveDir) * uWaveK - uWaterTime * uWaveOmega + sin(across * 0.05) * 2.0;
        float crest = sin(phase);
        // Harjat katkoviivoina: pätkät porrastuvat aallosta toiseen. Isompi aalto = leveämpi harja.
        float dash = step(0.3, fract(across / 7.0 + floor(phase / 6.2832) * 0.37));
        float band = step(1.0 - clamp(hs, 0.0, 0.3), crest) * dash * step(0.04, hs);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.024, 0.195, 0.381), band);
        float speck = fract(sin(dot(floor(wp * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
        float foam = step(0.9, crest) * step(0.15, hs) * step(speck, hs * 2.5);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.23, 0.54, 0.71), foam);
      }
      diffuseColor *= sampledDiffuseColor;`,
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
  texture.repeat.set(1 / WATER_TEXTURE_METERS, 1 / WATER_TEXTURE_METERS);
  texture.magFilter = THREE.NearestFilter;
  // Kaukaa katsottuna kuvio sulautuu pohjaväriin eikä välky.
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
