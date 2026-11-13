import * as THREE from 'three';
import { SPOUT_FUNNEL } from '../game/spoutView';
import { fromAbove, STAMP, unveil, VEIL, veil } from './veil';

/** Lisättyjen osien nimi: pyöristys ja varjot ohittavat ne (`modern-`). */
const ADDED = 'modern-spout';
/** Suppilon verkko: kehän ja korkeuden jako. */
const AROUND = 56;
const ALONG = 48;
/** Suppilo levenee pilveä kohti tällä potenssilla ja juuressa roiskeen verran (m). */
const FLARE = 2.4;
const SKIRT = { reach: 2.2, height: 3 } as const;
/** Sävyt (pelin suppilon raidat) ja juuren roiske. */
const TONES = { dark: 0x3d4651, light: 0xa3adb7, spray: 0xd9e1e7 } as const;
/**
 * Suppilo haalistuu pilveen korkeuden mukaan [alku, loppu, peitto lopussa]:
 * silmin vain aivan ylhäällä, ylhäältä jo matalalla, jotta pilven alla oleva
 * leveä osa ei peitä järveä vaan näkyy himmeänä pyörteenä.
 */
const FADE_EYES: [number, number, number] = [SPOUT_FUNNEL.height * 0.6, SPOUT_FUNNEL.height, 0.5];
const FADE_ABOVE: [number, number, number] = [4, 60, 0.14];
/** Roiskekumpu juurella: säde ja korkeus (m). */
const MOUND = { radius: 15, height: 3 } as const;
/** Suppilon suurin peitto silmin ja ylhäältä. */
const PEAK = { eyes: 0.97, above: 0.5 } as const;
/** Pelin vaahtojuovien peitto. */
const STREAK_ALPHA = 0.4;
/** Leima piirretään suppilon tähän peittoon asti. */
const STAMP_FROM = 0.4;

const VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalMatrix * normal;
    // Suorassa projektiossa (ylhäältä) katse on sama joka pisteessä.
    vViewV = projectionMatrix[3][3] > 0.5 ? vec3(0.0, 0.0, 1.0) : -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * Pyörre: kierteiset vaaleat ja tummat juovat liukuvat toisiinsa, reuna
 * ohenee näkymättömiin (pilvipatsas, ei putki) ja yläpää haalistuu pilveen.
 */
const FUNNEL_FRAG = /* glsl */ `
  uniform vec3 uDark;
  uniform vec3 uLight;
  uniform vec3 uSpray;
  uniform vec3 uFade;
  uniform float uRim;
  uniform float uPeak;
  uniform float uStamp;
  varying vec3 vLocal;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    float angle = atan(vLocal.z, vLocal.x);
    float y = vLocal.y;
    // Ylhäältä suppilon nielussa näkyy kaksi leveää kierrettä.
    float arms = 0.5 + 0.5 * sin(angle * 2.0 + y * 0.3);
    // Sivusta juovat kiertävät patsasta samaan suuntaan eri levyisinä ja
    // mutkitellen: vastakkain kiertyvät juovat näyttäisivät ruudukolta.
    float wisps = 0.5 + 0.5 * sin(angle * 3.0 + y * 0.42 + 1.3 * sin(y * 0.11 + angle));
    float thin = 0.5 + 0.5 * sin(angle * 7.0 + y * 0.9 + 2.1);
    float side = 0.2 + 0.6 * smoothstep(0.1, 0.9, mix(wisps, thin, 0.25));
    float band = mix(smoothstep(0.2, 0.8, arms), side, uRim);
    vec3 c = mix(uDark, uLight, band);
    c *= mix(1.0, 0.7, smoothstep(0.3, 1.0, y / ${SPOUT_FUNNEL.height.toFixed(1)}));
    c = mix(c, uSpray, 0.55 * exp(-y / 7.0));
    float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
    c *= 0.74 + 0.26 * facing;
    float edge = mix(1.0, smoothstep(0.02, 0.6, facing), uRim);
    float fade = mix(1.0, uFade.z, smoothstep(uFade.x, uFade.y, y));
    // Yläreuna häipyy aina kokonaan: suppilo ei pääty viivaan.
    fade *= 1.0 - smoothstep(${(SPOUT_FUNNEL.height * 0.82).toFixed(1)}, ${SPOUT_FUNNEL.height.toFixed(1)}, y);
    // Juuri sulautuu roiskeeseen eikä pääty veteen viivana.
    float alpha = edge * fade * uPeak * (0.35 + 0.65 * smoothstep(0.0, 5.0, y));
    if (uStamp > 0.5) {
      if (alpha < ${STAMP_FROM.toFixed(2)} * uPeak) discard;
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      gl_FragColor = vec4(c, alpha);
    }
  }
`;

/** Roiske: pehmeä vaalea kumpu, tihein keskeltä ja läheltä pintaa. */
const MOUND_FRAG = /* glsl */ `
  uniform vec3 uSpray;
  varying vec3 vLocal;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
    float angle = atan(vLocal.z, vLocal.x);
    float reach = length(vLocal.xz);
    // Roiske kiertyy pyörteen mukana: juovat ovat kierteitä, eivät säteitä.
    float tuft = 0.78 + 0.22 * sin(angle * 5.0 + reach * 16.0);
    // Tihein keskeltä, reunalla häipyy veteen; sivusta ääriviiva ohenee.
    float spread = 1.0 - smoothstep(0.2, 1.0, reach);
    float alpha = spread * smoothstep(0.0, 0.45, facing) * tuft * 0.6;
    gl_FragColor = vec4(uSpray, alpha);
  }
`;

/** Suppilon säde korkeudella `y` (m): kapea vedessä, levenee pilveen, juuressa roiskehelma. */
export function funnelRadius(y: number): number {
  const { height, top, foot } = SPOUT_FUNNEL;
  const t = Math.min(1, Math.max(0, y / height));
  return foot + (top - foot) * Math.pow(t, FLARE) + SKIRT.reach * Math.exp(-y / SKIRT.height);
}

/** Suppilo pyörähdyskappaleena: sileä kehä ja tiheä jako, jotta kaari ei näy kulmina. */
export function funnelShape(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= ALONG; i++) {
    // Tiheämmin alhaalla, missä muoto kaartuu.
    const y = SPOUT_FUNNEL.height * Math.pow(i / ALONG, 1.6);
    points.push(new THREE.Vector2(funnelRadius(y), y));
  }
  return new THREE.LatheGeometry(points, AROUND);
}

interface Fitted {
  spout: THREE.Object3D;
  funnel: THREE.Object3D;
  holder: THREE.Group;
  body: THREE.Mesh;
  stamp: THREE.Mesh;
  mound: THREE.Mesh;
}

/**
 * Trombi Modernissa ilmeessä (#650): pelin kulmikkaan, raidallisen suppilon
 * (`spouts`: `spout-funnel`, `spout-spray`, `spout-streaks`) tilalla on sileä
 * pilvipatsas, jonka juovat liukuvat toisiinsa ja reuna ohenee, juurella
 * roiskekumpu renkaan tilalla, ja imuvirran vaahtojuovat ovat läpikuultavia.
 * Ylhäältä suppilon leveä yläosa näkyy himmeänä pyörteenä eikä peitä järveä.
 * Paikka, pyöriminen ja imu ovat pelin (`SpoutView`).
 */
export class Spouts {
  private group: THREE.Object3D | null = null;
  private readonly fitted: Fitted[] = [];
  /** Pelin pinnat, jotka piilotetaan tai vaihdetaan läpikuultaviksi. */
  private readonly hidden = new Set<THREE.Material>();
  private readonly veiled = new Set<THREE.Material>();
  private readonly shape = funnelShape();
  private readonly moundShape = new THREE.SphereGeometry(1, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  private readonly uniforms = {
    uDark: { value: new THREE.Color(TONES.dark) },
    uLight: { value: new THREE.Color(TONES.light) },
    uSpray: { value: new THREE.Color(TONES.spray) },
    uFade: { value: new THREE.Vector3(...FADE_EYES) },
    uRim: { value: 1 },
    uPeak: { value: PEAK.eyes as number },
  };
  private readonly body = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FUNNEL_FRAG,
    uniforms: { ...this.uniforms, uStamp: { value: 0 } },
    ...VEIL,
  });
  private readonly stamp = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FUNNEL_FRAG,
    uniforms: { ...this.uniforms, uStamp: { value: 1 } },
    ...STAMP,
  });
  private readonly mound = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: MOUND_FRAG,
    uniforms: { uSpray: this.uniforms.uSpray },
    side: THREE.DoubleSide,
    ...VEIL,
  });

  /** Pelin trombiryhmä; `null` irrottaa (kohtaus vaihtui). */
  bind(group: THREE.Object3D | null): void {
    if (group === this.group) return;
    this.release();
    this.group = group;
    if (!group) return;
    for (const spout of group.children) {
      const find = (name: string) =>
        spout.children.find((c): c is THREE.Mesh => c.name === name && (c as THREE.Mesh).isMesh);
      const funnel = find('spout-funnel');
      const spray = find('spout-spray');
      const streaks = find('spout-streaks');
      if (!funnel || !spray) continue;
      for (const part of [funnel, spray]) {
        const material = part.material as THREE.Material;
        material.visible = false;
        this.hidden.add(material);
      }
      if (streaks && !this.veiled.has(streaks.material as THREE.Material)) {
        const material = streaks.material as THREE.MeshBasicMaterial;
        veil(material);
        material.opacity = STREAK_ALPHA;
        this.veiled.add(material);
      }
      const holder = new THREE.Group();
      holder.name = ADDED;
      const body = new THREE.Mesh(this.shape, this.body);
      const stamp = new THREE.Mesh(this.shape, this.stamp);
      const mound = new THREE.Mesh(this.moundShape, this.mound);
      mound.scale.set(MOUND.radius, MOUND.height, MOUND.radius);
      for (const mesh of [body, stamp, mound]) {
        mesh.name = ADDED;
        mesh.frustumCulled = false;
      }
      holder.add(mound, body, stamp);
      spout.add(holder);
      this.fitted.push({ spout, funnel, holder, body, stamp, mound });
    }
  }

  update(camera: THREE.Camera): void {
    if (this.fitted.length === 0) return;
    const above = fromAbove(camera);
    this.uniforms.uFade.value.set(...(above ? FADE_ABOVE : FADE_EYES));
    this.uniforms.uRim.value = above ? 0 : 1;
    this.uniforms.uPeak.value = above ? PEAK.above : PEAK.eyes;
    // Silmin näkyy suppilon ulkopinta, ylhäältä sen sisäpinta: toinen puoli
    // sekoittaisi päälle vastakkaiseen suuntaan kiertyvät juovat.
    const side = above ? THREE.BackSide : THREE.FrontSide;
    for (const material of [this.body, this.stamp]) {
      if (material.side === side) continue;
      material.side = side;
      material.needsUpdate = true;
    }
    for (const f of this.fitted) {
      // Pyörre pyörii pelin suppilon mukana.
      f.body.rotation.y = f.stamp.rotation.y = f.mound.rotation.y = f.funnel.rotation.y;
      // Ylhäältä roiske peittää suppilon nielun, silmin se jää suppilon taakse.
      f.mound.renderOrder = above ? 0.5 : -0.5;
      // Ylhäältä kaikki on veden päällä, jolloin kuva sävyttyy ilman leimaakin.
      f.stamp.visible = !above;
    }
  }

  private release(): void {
    for (const material of this.hidden) material.visible = true;
    for (const material of this.veiled) unveil(material);
    this.hidden.clear();
    this.veiled.clear();
    for (const f of this.fitted) f.holder.removeFromParent();
    this.fitted.length = 0;
    this.group = null;
  }

  dispose(): void {
    this.release();
    this.shape.dispose();
    this.moundShape.dispose();
    this.body.dispose();
    this.stamp.dispose();
    this.mound.dispose();
  }
}
