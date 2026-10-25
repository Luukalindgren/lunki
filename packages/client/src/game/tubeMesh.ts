import * as THREE from 'three';
import { TUBE_RADIUS } from '@lunki/shared';

/** Räpylöiden lepokohta renkaan etureunan edessä (paikallinen x). */
const FIN_X = TUBE_RADIUS + 0.15;

/**
 * Kelluntarengas ja kalastaja ylhäältä katsottuna. Paikallisessa
 * koordinaatistossa katse osoittaa +x-suuntaan; ryhmää käännetään y-akselin
 * ympäri headingin mukaan. Kuten oikeassa renkaassa, jalat ja räpylät ovat
 * kalastajan edessä samalla puolella kuin vapa ja heittosuunta: potkut
 * työntävät vettä eteen, joten rengas kulkee selkä edellä.
 */
export function createTubeMesh(color = 0xd23a2a): THREE.Group {
  const group = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(TUBE_RADIUS * 0.72, TUBE_RADIUS * 0.28, 6, 14),
    new THREE.MeshLambertMaterial({ color }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);

  // Hartiat poikittain katsesuuntaan nähden
  const shoulders = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.75),
    new THREE.MeshLambertMaterial({ color: 0x24502c }),
  );
  shoulders.position.y = 0.6;
  group.add(shoulders);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xe0cf9c }),
  );
  head.position.set(0.04, 0.9, 0);
  group.add(head);

  // Lippalakin lippa näyttää katsesuunnan
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.04, 0.2),
    new THREE.MeshLambertMaterial({ color: 0xf6d04d }),
  );
  cap.position.set(0.2, 1.0, 0);
  group.add(cap);

  // Sääret istuimelta eteen renkaan yli ja räpylät niiden päässä
  const legMat = new THREE.MeshLambertMaterial({ color: 0x3b4630 });
  const finMat = new THREE.MeshLambertMaterial({ color: 0x1c232b });
  for (const z of [-0.2, 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(TUBE_RADIUS - 0.1, 0.14, 0.14), legMat);
    leg.position.set((TUBE_RADIUS + 0.2) / 2, 0.12, z);
    group.add(leg);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.22), finMat);
    fin.position.set(FIN_X, 0.05, z);
    fin.name = 'fin';
    group.add(fin);
  }

  // Virveli osoittaa eteen
  const rod = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.08, 0.08),
    new THREE.MeshLambertMaterial({ color: 0xf6d04d }),
  );
  rod.rotation.z = 0.25;
  rod.position.set(1.1, 1.1, 0.38);
  rod.name = 'rod';
  group.add(rod);

  return group;
}

/** Heiluttaa räpylöitä potkurytmin mukaan. */
export function animateFins(group: THREE.Group, kickPhase: number): void {
  let i = 0;
  for (const child of group.children) {
    if (child.name !== 'fin') continue;
    const swing = Math.sin((kickPhase + i * 0.5) * Math.PI * 2) * 0.25;
    child.position.x = FIN_X + swing;
    i++;
  }
}
