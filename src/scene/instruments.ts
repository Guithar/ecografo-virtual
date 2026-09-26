/**
 * Instrumental 3D: transductor lineal y aguja de fístula (unidades: mm).
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  BoxGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Superficie "loft" de secciones superelípticas a lo largo de Y. */
function loftSuperellipse(sections: { y: number; a: number; b: number; n?: number }[], seg = 40): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const rows = sections.length;
  for (let i = 0; i < rows; i++) {
    const s = sections[i];
    const n = s.n ?? 3.2;
    for (let j = 0; j <= seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * s.a;
      const z = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * s.b;
      pos.push(x, s.y, z);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // tapa superior
  const top = rows - 1;
  const ci = pos.length / 3;
  pos.push(0, sections[top].y, 0);
  for (let j = 0; j < seg; j++) idx.push(top * (seg + 1) + j, ci, top * (seg + 1) + j + 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface ProbeMesh {
  group: Group;
  led: Mesh;
  setHighlight(on: boolean): void;
}

/**
 * Sonda lineal (huella 38–40 mm). Origen: centro de la cara (lente). +X = eje lateral (del marcador
 * hacia el extremo opuesto), +Y = mango (hacia arriba), Z = elevación.
 */
export function buildProbe(width = 38): ProbeMesh {
  const g = new Group();
  g.name = 'sonda';
  const shell = new MeshPhysicalMaterial({ color: new Color('#e9edf1'), roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2, metalness: 0 });
  const grip = new MeshPhysicalMaterial({ color: new Color('#3a4149'), roughness: 0.62, clearcoat: 0.1 });
  const lensMat = new MeshStandardMaterial({ color: new Color('#2a2d31'), roughness: 0.85 });
  const W = width + 6;
  const head = new Mesh(new RoundedBoxGeometry(W, 17, 13, 5, 3.2), shell);
  head.position.y = 8.9;
  g.add(head);
  const lens = new Mesh(new RoundedBoxGeometry(width + 1, 2.2, 9.5, 3, 1.0), lensMat);
  lens.position.y = 0.9;
  g.add(lens);
  const handle = new Mesh(
    loftSuperellipse([
      { y: 15, a: W / 2 - 1.5, b: 6.2, n: 4 },
      { y: 24, a: 17, b: 8.5, n: 3.4 },
      { y: 40, a: 13, b: 10.2, n: 2.8 },
      { y: 70, a: 11.6, b: 10.4, n: 2.6 },
      { y: 100, a: 11.4, b: 10.2, n: 2.6 },
      { y: 112, a: 9.6, b: 9.2, n: 2.4 },
      { y: 118, a: 6.5, b: 6.5, n: 2.2 },
    ]),
    shell,
  );
  g.add(handle);
  const gripBand = new Mesh(
    loftSuperellipse([
      { y: 48, a: 12.4, b: 10.9, n: 2.7 },
      { y: 92, a: 12.2, b: 10.8, n: 2.6 },
    ]),
    grip,
  );
  g.add(gripBand);
  // marcador de orientación: resalte y LED en el lado −X
  const notch = new Mesh(new RoundedBoxGeometry(2.4, 9, 5.5, 2, 0.8), grip);
  notch.position.set(-W / 2 - 0.6, 9, 0);
  g.add(notch);
  const led = new Mesh(new SphereGeometry(1.2, 16, 12), new MeshStandardMaterial({ color: '#39ff88', emissive: new Color('#1bff6b'), emissiveIntensity: 2.2 }));
  led.position.set(-W / 2 + 3.5, 17.6, 0);
  g.add(led);
  // cable
  const curve = new CatmullRomCurve3([new Vector3(0, 116, 0), new Vector3(0, 150, -4), new Vector3(0, 185, -24), new Vector3(0, 205, -70), new Vector3(0, 200, -140), new Vector3(0, 170, -230)]);
  const strain = new Mesh(new CylinderGeometry(5.2, 6.5, 22, 20), grip);
  strain.position.y = 128;
  g.add(strain);
  const cable = new Mesh(new TubeGeometry(curve, 60, 3.2, 10, false), new MeshStandardMaterial({ color: '#1c1f23', roughness: 0.5 }));
  g.add(cable);
  g.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
  });
  return {
    group: g,
    led,
    setHighlight(on: boolean) {
      shell.emissive = new Color(on ? '#113355' : '#000000');
    },
  };
}

export const GAUGES: Record<number, { od: number; label: string; color: string }> = {
  14: { od: 2.108, label: '14G', color: '#7b3f99' },
  15: { od: 1.829, label: '15G', color: '#4f8a3a' },
  16: { od: 1.651, label: '16G', color: '#2e7bbd' },
  17: { od: 1.473, label: '17G', color: '#d9a21a' },
};

export interface NeedleMesh {
  group: Group;
  setFlash(level: number, arterial: boolean): void;
  setLength(len: number): void;
}

/**
 * Aguja de fístula con aletas. Origen en la punta; +Z hacia el cono (hacia atrás a lo largo del eje).
 * @param role 'arterial' (aletas rojas) o 'venosa' (azules)
 */
export function buildNeedle(gauge = 15, length = 25, role: 'arterial' | 'venosa' = 'arterial'): NeedleMesh {
  const g = new Group();
  g.name = 'aguja-' + role;
  const od = GAUGES[gauge]?.od ?? 1.8;
  const r = od / 2;
  const steel = new MeshPhysicalMaterial({ color: '#dfe3e8', metalness: 1, roughness: 0.18, clearcoat: 0.2 });
  // cánula con bisel (18° aprox)
  const shaftGeo = new CylinderGeometry(r, r, length, 24, 8, false);
  shaftGeo.rotateX(Math.PI / 2);
  shaftGeo.translate(0, 0, length / 2);
  const p = shaftGeo.getAttribute('position') as BufferAttribute;
  const bevelLen = od / Math.tan((18 * Math.PI) / 180) * 0.5;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z < 1e-3) {
      // bisel hacia arriba (+Y): el filo queda abajo, la abertura mira hacia arriba
      const y = p.getY(i);
      p.setZ(i, ((y + r) / (2 * r)) * bevelLen);
    }
  }
  shaftGeo.computeVertexNormals();
  const shaft = new Mesh(shaftGeo, steel);
  g.add(shaft);
  const wingCol = role === 'arterial' ? '#d23b3b' : '#2f6fd6';
  const plastic = new MeshPhysicalMaterial({ color: wingCol, roughness: 0.4, clearcoat: 0.5, transparent: true, opacity: 0.95 });
  const hub = new Mesh(new CylinderGeometry(2.6, 2.2, 10, 20), plastic);
  hub.rotation.x = Math.PI / 2;
  const hubGroup = new Group();
  hubGroup.add(hub);
  hub.position.z = 5;
  // aletas
  const wingGeo = new RoundedBoxGeometry(34, 0.9, 11, 2, 0.4);
  const wings = new Mesh(wingGeo, plastic);
  wings.position.set(0, -1.2, 5);
  hubGroup.add(wings);
  hubGroup.position.z = length;
  g.add(hubGroup);
  // tubo
  const tubeMat = new MeshPhysicalMaterial({ color: '#f0f4f6', roughness: 0.15, transmission: 0.0, transparent: true, opacity: 0.55, clearcoat: 1 });
  const curve = new CatmullRomCurve3([new Vector3(0, 0, 10), new Vector3(0, 2, 30), new Vector3(0, 6, 60), new Vector3(6, 14, 100), new Vector3(20, 18, 150)]);
  const tube = new Mesh(new TubeGeometry(curve, 40, 1.9, 10, false), tubeMat);
  hubGroup.add(tube);
  const clamp = new Mesh(new BoxGeometry(8, 5, 12), new MeshStandardMaterial({ color: wingCol, roughness: 0.5 }));
  clamp.position.set(0, 4.5, 50);
  hubGroup.add(clamp);
  g.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
  });
  return {
    group: g,
    setFlash(level: number, arterial: boolean) {
      const c = new Color('#f0f4f6').lerp(new Color(arterial ? '#c4161c' : '#6d0f16'), Math.min(1, level));
      tubeMat.color.copy(c);
      tubeMat.opacity = 0.55 + 0.4 * Math.min(1, level);
    },
    setLength(len: number) {
      hubGroup.position.z = len;
      shaft.scale.z = len / length;
    },
  };
}
