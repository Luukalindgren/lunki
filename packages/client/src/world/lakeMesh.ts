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

  // Kaislikot: harvoja kaislatupsuja, joiden välistä vesi näkyy (kaislaspritet ks. vegetation.ts).
  const reedMaterial = new THREE.MeshBasicMaterial({
    map: createReedTexture(),
    alphaTest: 0.5,
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

/** Kaislikkokuvion yhden toiston koko (m) ja tupsujen määrä toistossa. */
const REED_TEXTURE_METERS = 8;
const REED_TUFTS = 56;

/**
 * Kaislikko ylhäältä: läpinäkyvä kuvio, jossa on pieniä kaislatupsuja
 * (muutama pikselin mittainen korsi). Suurin osa kuvasta on tyhjää, jotta
 * vesi näkyy alta ja kaislikko erottuu saaresta.
 */
function createReedTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const colors = ['#a3c45a', '#6a9a3e', '#3b7337', '#e0cf9c'];
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dot = (x: number, y: number) =>
    ctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, 1, 1);
  for (let i = 0; i < REED_TUFTS; i++) {
    const cx = Math.floor(rand() * size);
    const cy = Math.floor(rand() * size);
    // Tupsu: korsia eri suuntiin keskeltä, latvat vaaleampia.
    const stems = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < stems; k++) {
      const dx = Math.round((rand() - 0.5) * 2.4);
      const len = 2 + Math.floor(rand() * 3);
      ctx.fillStyle = colors[rand() < 0.15 ? 3 : 1 + Math.floor(rand() * 2)]!;
      for (let j = 0; j < len; j++) dot(cx + Math.round((dx * j) / 2), cy - j);
      ctx.fillStyle = colors[0]!;
      dot(cx + Math.round((dx * len) / 2), cy - len);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / REED_TEXTURE_METERS, 1 / REED_TEXTURE_METERS);
  texture.magFilter = THREE.NearestFilter;
  // Ilman mipmappeja: läpinäkyvyysraja pysyy terävänä myös kaukaa.
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Vesikuvion yhden toiston koko (m). */
const WATER_TEXTURE_METERS = 32;

/** Veden aaltoilun kello (s); päivitetään pelisilmukasta. */
export const waterTime = { value: 0 };

/**
 * Tuulen aallot vesishaderille: aallonkorkeuskerroin tekstuurina (ks.
 * WaveField) sekä tuulen nopeus ja suunta.
 * Jokaisella pelillä omansa: valikon taustapeli ei saa sotkea kisan vettä.
 */
export function createWaterWaves() {
  return {
    uWaveTex: { value: null as THREE.Texture | null },
    uWaveBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    uWaveScale: { value: 0 },
    uWaveDir: { value: new THREE.Vector2(1, 0) },
    /** Auringon tai kuun suunta, väri (lineaarinen) ja kimalluksen voimakkuus. */
    uGlitterDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlitterColor: { value: new THREE.Color(0xfff3b0) },
    uGlitter: { value: 0 },
  };
}
export type WaterWaves = ReturnType<typeof createWaterWaves>;

/**
 * Vesi aaltoilee: kuviota luetaan hitaasti vaeltavilla siniaalloilla
 * vääristettynä, jolloin aallonharjat kiemurtelevat ja välkehtivät.
 * Tuulella pintaan nousee vaahtopäitä.
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
uniform vec3 uGlitterDir;
uniform vec3 uGlitterColor;
uniform float uGlitter;
varying vec3 vGlitterPos;
float waterHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`;
    shader.vertexShader = ('varying vec3 vGlitterPos;\n' + shader.vertexShader).replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vGlitterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    // onBeforeCompile näkee vielä include-rivit, joten korvataan koko map_fragment.
    shader.fragmentShader = (header + shader.fragmentShader).replace(
      '#include <map_fragment>',
      /* glsl */ `vec2 waveUv = vMapUv + vec2(uWaterTime * 0.004, uWaterTime * 0.0015);
      waveUv.x += sin(vMapUv.y * 40.0 + uWaterTime * 1.3) * 0.01;
      waveUv.y += sin(vMapUv.x * 33.0 - uWaterTime * 1.1) * 0.008;
      vec4 sampledDiffuseColor = texture2D( map, waveUv );
      // Tuulen aallot: lyhyitä vaahtopäitä, jotka syntyvät, ajelehtivat
      // myötätuuleen ja sammuvat. Kaari kaartuu tuulen suuntaan, ja sen
      // takana on tumma aallonpohja. Vaahtopäitä on sitä enemmän, mitä
      // korkeampi aalto (pyyhkäisymatka × tuuli).
      float waterFoam = 0.0;
      if (uWaveScale > 0.0) {
        vec2 wp = vMapUv * ${WATER_TEXTURE_METERS.toFixed(1)};
        float hs = texture2D(uWaveTex, (wp - uWaveBounds.xy) / uWaveBounds.zw).r * uWaveScale;
        vec2 q = vec2(dot(wp, uWaveDir) - uWaterTime * 0.8, dot(wp, vec2(-uWaveDir.y, uWaveDir.x)));
        // Pikselin koko (m) kumpaankin suuntaan: viiva on aina vähintään
        // pikselin paksuinen, ja kaukana vaahtopäät jätetään pois, jotteivät
        // alle pikselin kokoiset kuviot välky.
        vec2 px = max(fwidth(q), vec2(1e-4));
        float far = 1.0 - smoothstep(0.4, 0.9, min(px.x, px.y));
        float density = smoothstep(0.015, 0.12, hs) * 0.8 * far;
        vec2 cellSize = vec2(4.0, 3.0);
        vec2 cell = floor(q / cellSize);
        float cycle = uWaterTime / 2.6 + waterHash(cell);
        float n = floor(cycle);
        float life = fract(cycle);
        float h1 = waterHash(cell + n * vec2(17.0, 31.0));
        float h2 = waterHash(cell.yx + n * vec2(5.0, 13.0) + 0.37);
        vec2 local = q - cell * cellSize - cellSize * vec2(0.3 + 0.4 * h2, 0.25 + 0.5 * fract(h1 * 7.0));
        float len = (0.4 + 0.8 * fract(h2 * 13.0) + 2.0 * hs) * sin(3.1416 * life);
        float du = local.x + 0.15 * local.y * local.y;
        float t = clamp(px.x * 0.6, 0.12, 0.6);
        float cap = step(h1, density) * step(abs(local.y), len);
        float foam = cap * step(abs(du), t);
        float trough = cap * step(abs(du + 2.5 * t), t) * step(abs(local.y), len * 0.8);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.006, 0.042, 0.107), trough);
        waterFoam = foam;
      }
      diffuseColor *= sampledDiffuseColor;`,
    );
    // Vaahto on valkoista myös varjossa ja pilvisellä säällä.
    // Matala aurinko tai kuu piirtää veteen kimaltelevan sillan: heijastus
    // osuu valoon vain kapealla kaistalla, ja kimallus vaihtuu pikseleittäin.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `outgoingLight = mix(outgoingLight, vec3(0.9, 0.95, 1.0), waterFoam);
      if (uGlitter > 0.0) {
        vec3 toEye = normalize(cameraPosition - vGlitterPos);
        vec3 refl = vec3(-toEye.x, toEye.y, -toEye.z);
        float across = dot(normalize(refl.xz), normalize(uGlitterDir.xz));
        float path = smoothstep(0.985, 0.998, across) * (1.0 - smoothstep(0.04, 0.3, abs(refl.y - uGlitterDir.y)));
        float sparkle = waterHash(floor(gl_FragCoord.xy) + floor(uWaterTime * 5.0) * vec2(7.0, 3.0));
        float glint = step(1.0 - path * 0.75, sparkle) * uGlitter;
        outgoingLight = mix(outgoingLight, uGlitterColor, glint);
      }
      #include <opaque_fragment>`,
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
