/**
 * Mallas 3D de las estructuras internas (vasos, nervios, tendones, huesos, hematomas) y partículas
 * de flujo sanguíneo animadas.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import type { AnatomyModel, Structure } from '../anatomy/model';

export const KIND_COLORS: Record<string, string> = {
  artery: '#c9302c',
  vein: '#2f5fc9',
  avf: '#6c43b8',
  graft: '#e3e8ec',
  nerve: '#f1c232',
  tendon: '#eae4d8',
  bone: '#eee2c6',
  hematoma: '#5a1428',
  infiltrado: '#86cfe6',
};

export function tubeGeometry(st: Structure, radial = 16, extra = 0, caps = true): BufferGeometry {
  const sm = st.samples;
  const n = sm.length;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  // marcos por transporte paralelo
  let normal = new Vector3();
  const t0 = sm[0].t;
  normal.set(0, 1, 0);
  if (Math.abs(normal.dot(t0)) > 0.9) normal.set(1, 0, 0);
  normal.addScaledVector(t0, -normal.dot(t0)).normalize();
  const frames: { N: Vector3; B: Vector3 }[] = [];
  for (let i = 0; i < n; i++) {
    const t = sm[i].t;
    if (i > 0) {
      normal = normal.clone().addScaledVector(t, -normal.dot(t)).normalize();
    }
    const B = new Vector3().crossVectors(t, normal).normalize();
    frames.push({ N: normal.clone(), B });
  }
  const isVessel = st.code <= 4;
  for (let i = 0; i < n; i++) {
    const s = sm[i];
    const R = s.r + (isVessel ? s.w + s.wallExtra * 0.3 : 0) + extra;
    const { N, B } = frames[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const nx = N.x * c + B.x * sn;
      const ny = N.y * c + B.y * sn;
      const nz = N.z * c + B.z * sn;
      pos.push(s.p.x + nx * R, s.p.y + ny * R, s.p.z + nz * R);
      nrm.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  if (caps) {
    // tapas hemisféricas
    for (const end of [0, n - 1]) {
      const s = sm[end];
      const R = s.r + (isVessel ? s.w : 0) + extra;
      const dir = end === 0 ? s.t.clone().negate() : s.t.clone();
      const { N, B } = frames[end];
      const rings = 5;
      const base = pos.length / 3;
      for (let k = 1; k <= rings; k++) {
        const phi = (k / rings) * (Math.PI / 2);
        const rr = Math.cos(phi) * R;
        const off = Math.sin(phi) * R;
        for (let j = 0; j <= radial; j++) {
          const a = (j / radial) * Math.PI * 2;
          const c = Math.cos(a);
          const sn = Math.sin(a);
          const nx = N.x * c + B.x * sn;
          const ny = N.y * c + B.y * sn;
          const nz = N.z * c + B.z * sn;
          pos.push(s.p.x + nx * rr + dir.x * off, s.p.y + ny * rr + dir.y * off, s.p.z + nz * rr + dir.z * off);
          const nn = new Vector3(nx * Math.cos(phi) + dir.x * Math.sin(phi), ny * Math.cos(phi) + dir.y * Math.sin(phi), nz * Math.cos(phi) + dir.z * Math.sin(phi));
          nrm.push(nn.x, nn.y, nn.z);
        }
      }
      const ring0 = end * (radial + 1);
      for (let k = 0; k < rings; k++) {
        const r0 = k === 0 ? ring0 : base + (k - 1) * (radial + 1);
        const r1 = base + k * (radial + 1);
        for (let j = 0; j < radial; j++) {
          if (end === 0) idx.push(r0 + j, r1 + j, r0 + j + 1, r0 + j + 1, r1 + j, r1 + j + 1);
          else idx.push(r0 + j, r0 + j + 1, r1 + j, r1 + j, r0 + j + 1, r1 + j + 1);
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function fibrousTexture(base: string, stripe: string, vertical = false): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.globalAlpha = 0.35;
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = stripe;
    g.lineWidth = 0.5 + Math.random() * 1.2;
    g.beginPath();
    const p = Math.random() * 128;
    if (vertical) {
      g.moveTo(p, 0);
      g.lineTo(p + (Math.random() - 0.5) * 6, 128);
    } else {
      g.moveTo(0, p);
      g.lineTo(128, p + (Math.random() - 0.5) * 6);
    }
    g.stroke();
  }
  const t = new CanvasTexture(c);
  return t;
}

export interface AnatomyMeshes {
  group: Group;
  byGroup: Record<string, Mesh[]>;
  meshes: Map<Structure, Mesh>;
  vesselMaterials: MeshPhysicalMaterial[];
}

export function buildAnatomyMeshes(model: AnatomyModel): AnatomyMeshes {
  const group = new Group();
  group.name = 'anatomia';
  const byGroup: Record<string, Mesh[]> = {};
  const meshes = new Map<Structure, Mesh>();
  const vesselMaterials: MeshPhysicalMaterial[] = [];
  const mats = new Map<string, MeshPhysicalMaterial | MeshStandardMaterial>();
  const matFor = (kind: string) => {
    if (mats.has(kind)) return mats.get(kind)!;
    let m: MeshPhysicalMaterial | MeshStandardMaterial;
    const col = new Color(KIND_COLORS[kind] ?? '#999');
    if (kind === 'artery' || kind === 'vein' || kind === 'avf') {
      m = new MeshPhysicalMaterial({ color: col, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: col.clone().offsetHSL(0, 0, 0.2), transparent: true, opacity: 1 });
      vesselMaterials.push(m as MeshPhysicalMaterial);
    } else if (kind === 'graft') {
      m = new MeshPhysicalMaterial({ color: col, roughness: 0.5, clearcoat: 0.3, transparent: true, opacity: 1 });
      vesselMaterials.push(m as MeshPhysicalMaterial);
    } else if (kind === 'nerve') {
      m = new MeshStandardMaterial({ color: col, roughness: 0.55, map: fibrousTexture('#f1c232', '#fff4b0') });
    } else if (kind === 'tendon') {
      m = new MeshPhysicalMaterial({ color: col, roughness: 0.3, sheen: 0.6, sheenColor: new Color('#ffffff'), map: fibrousTexture('#ece6da', '#ffffff') });
    } else if (kind === 'bone') {
      m = new MeshStandardMaterial({ color: col, roughness: 0.62 });
    } else {
      m = new MeshPhysicalMaterial({ color: col, roughness: 0.6, transparent: true, opacity: 0.75, side: DoubleSide });
    }
    mats.set(kind, m);
    return m;
  };
  for (const st of model.structures) {
    const kind = st.def.kind;
    const radial = kind === 'bone' ? 24 : kind === 'nerve' || kind === 'tendon' ? 12 : 18;
    const geo = tubeGeometry(st, radial);
    const mesh = new Mesh(geo, matFor(kind));
    mesh.name = st.def.id;
    mesh.userData.structure = st;
    // radio con el que se construyó la malla (el hematoma que crece se escala respecto a él)
    mesh.userData.baseR = st.samples[0]?.r ?? 1;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const g = st.def.group ?? kind;
    (byGroup[g] ??= []).push(mesh);
    meshes.set(st, mesh);
    group.add(mesh);
  }
  return { group, byGroup, meshes, vesselMaterials };
}

/** Partículas que muestran el sentido y la velocidad del flujo dentro de los vasos. */
export class FlowParticles {
  readonly points: Points;
  private items: { st: Structure; s: number; off: [number, number]; }[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  speed = 0.12; // factor de cámara lenta

  constructor(private model: AnatomyModel) {
    for (const st of model.structures) {
      if (!st.isVessel || !st.def.flow || st.def.flow.q < 5) continue;
      const count = Math.max(4, Math.round((st.length / 6) * Math.min(3, st.maxR / 1.5)));
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * 0.8;
        this.items.push({ st, s: Math.random() * st.length, off: [Math.cos(a) * rr, Math.sin(a) * rr] });
      }
    }
    this.pos = new Float32Array(this.items.length * 3);
    this.col = new Float32Array(this.items.length * 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new BufferAttribute(this.col, 3));
    const mat = new PointsMaterial({ size: 1.3, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  update(dt: number) {
    const tmpN = new Vector3();
    const tmpB = new Vector3();
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const st = it.st;
      const sm = st.samples;
      const step = st.length / (sm.length - 1);
      let k = Math.min(sm.length - 1, Math.max(0, Math.round(it.s / step)));
      const smp = sm[k];
      const area = Math.PI * (smp.r / 10) ** 2;
      const vmean = st.dyn.qNow / Math.max(area, 1e-4); // cm/s
      const rr = Math.hypot(it.off[0], it.off[1]);
      const n = st.dyn.profile;
      const v = vmean * ((n + 2) / n) * (1 - Math.pow(rr, n));
      it.s += v * 10 * dt * this.speed;
      if (it.s > st.length) it.s -= st.length;
      if (it.s < 0) it.s += st.length;
      k = Math.min(sm.length - 1, Math.max(0, Math.round(it.s / step)));
      const q = sm[k];
      tmpN.set(0, 1, 0);
      if (Math.abs(tmpN.dot(q.t)) > 0.9) tmpN.set(1, 0, 0);
      tmpN.addScaledVector(q.t, -tmpN.dot(q.t)).normalize();
      tmpB.crossVectors(q.t, tmpN);
      const R = q.r * st.dyn.radiusScale;
      this.pos[i * 3] = q.p.x + (tmpN.x * it.off[0] + tmpB.x * it.off[1]) * R;
      this.pos[i * 3 + 1] = q.p.y + (tmpN.y * it.off[0] + tmpB.y * it.off[1]) * R;
      this.pos[i * 3 + 2] = q.p.z + (tmpN.z * it.off[0] + tmpB.z * it.off[1]) * R;
      const sp = Math.min(1, Math.abs(v) / 120);
      const art = st.def.kind === 'artery';
      this.col[i * 3] = art ? 1 : 0.55 + 0.45 * sp;
      this.col[i * 3 + 1] = art ? 0.35 + 0.5 * sp : 0.55 + 0.4 * sp;
      this.col[i * 3 + 2] = art ? 0.3 : 1;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
    void this.model;
  }
}
