/**
 * Malla de la piel del miembro superior (antebrazo, brazo y mano) a partir de una SDF que usa
 * exactamente la misma forma de sección que el simulador ecográfico, más una mano modelada con
 * primitivas suavemente fusionadas.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { ArmShape, sdEllipse } from '../anatomy/armShape';
import { sdCapsule, sdEllipsoid, smin, surfaceNets } from './surfaceNets';

interface Seg {
  a: Vector3;
  b: Vector3;
  ra: number;
  rb: number;
}

const X_END = 592;
const X_START = -22;

function fingerChain(base: Vector3, lens: number[], radii: number[], spreadZ: number, flex: number[]): Seg[] {
  const segs: Seg[] = [];
  let p = base.clone();
  let ang = 0;
  for (let i = 0; i < lens.length; i++) {
    ang += (flex[i] * Math.PI) / 180;
    const d = new Vector3(-Math.cos(ang), Math.sin(ang), spreadZ).normalize();
    const q = p.clone().addScaledVector(d, lens[i]);
    segs.push({ a: p, b: q, ra: radii[i], rb: i + 1 < radii.length ? radii[i + 1] : radii[i] * 0.88 });
    p = q;
  }
  return segs;
}

export function handSegments(): Seg[] {
  const segs: Seg[] = [];
  // dedos: base (articulación MCF), longitudes (falanges), radios, separación, flexión (MCF, IFP, IFD)
  segs.push(...fingerChain(new Vector3(-101, 1, 25), [40, 24, 20], [8.8, 8.0, 7.2], 0.09, [16, 28, 16]));
  segs.push(...fingerChain(new Vector3(-104, 1, 8.5), [44, 27, 21], [9.2, 8.4, 7.4], 0.02, [15, 30, 16]));
  segs.push(...fingerChain(new Vector3(-101, 1, -8), [41, 26, 20], [8.7, 7.9, 7.0], -0.05, [16, 32, 18]));
  segs.push(...fingerChain(new Vector3(-95, 1, -23), [33, 20, 18], [7.7, 6.9, 6.3], -0.12, [18, 34, 18]));
  // pulgar
  const c = new Vector3(-28, 3, 29);
  const m1 = c.clone().addScaledVector(new Vector3(-0.55, 0.42, 0.72).normalize(), 40);
  const m2 = m1.clone().addScaledVector(new Vector3(-0.78, 0.38, 0.5).normalize(), 30);
  const m3 = m2.clone().addScaledVector(new Vector3(-0.9, 0.3, 0.28).normalize(), 25);
  segs.push({ a: c, b: m1, ra: 11, rb: 9.6 });
  segs.push({ a: m1, b: m2, ra: 9.6, rb: 8.6 });
  segs.push({ a: m2, b: m3, ra: 8.6, rb: 7.4 });
  return segs;
}

function sdRoundBox(px: number, py: number, pz: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r: number) {
  const qx = Math.abs(px - cx) - hx;
  const qy = Math.abs(py - cy) - hy;
  const qz = Math.abs(pz - cz) - hz;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/** SDF de la piel en coordenadas del brazo (mm). */
export function makeSkinSDF(arm: ArmShape) {
  const hand = handSegments();
  const sec = { a: 0, b: 0, fat: 0, skin: 0 };
  return (x: number, y: number, z: number): number => {
    let d = 1e9;
    if (x > X_START - 40) {
      const xc = Math.min(Math.max(x, X_START), X_END);
      arm.section(xc, sec);
      const ext = sec.fat + sec.skin;
      const d2 = sdEllipse(z, y, sec.a + ext, sec.b + ext);
      const dx = Math.max(X_START - x, x - X_END);
      const qx = Math.max(d2, 0);
      const qy = Math.max(dx, 0);
      d = Math.sqrt(qx * qx + qy * qy) + Math.min(Math.max(d2, dx), 0);
    }
    if (x < 12) {
      // palma (con eminencias tenar e hipotenar)
      let h = sdRoundBox(x, y, z, -60, -1, 1, 36, 6.5, 30, 8);
      h = smin(h, sdEllipsoid(x, y, z, -46, 5, 22, 28, 12, 17), 10);
      h = smin(h, sdEllipsoid(x, y, z, -58, 3, -26, 30, 10, 13), 10);
      for (const s of hand) {
        h = smin(h, sdCapsule(x, y, z, s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z, s.ra, s.rb), 5);
      }
      d = smin(d, h, 14);
    }
    return d;
  };
}

export function buildSkinGeometry(arm: ArmShape, step = 2.0): BufferGeometry {
  const sdf = makeSkinSDF(arm);
  let maxR = 0;
  for (let i = 0; i < 64; i++) maxR = Math.max(maxR, arm.knots[i * 4] + arm.knots[i * 4 + 2] + arm.knots[i * 4 + 3], arm.knots[i * 4 + 1] + arm.knots[i * 4 + 2] + arm.knots[i * 4 + 3]);
  const m = maxR + 6;
  return surfaceNets(sdf, { min: [-225, -Math.max(m, 45), -Math.max(m, 55)], max: [X_END + 6, Math.max(m, 50), Math.max(m, 72)], step });
}

/** Malla de la fascia profunda (límite del compartimento muscular) como tubo elíptico. */
export function fasciaTube(arm: ArmShape, x0 = -10, x1 = 580, nx = 160, nt = 48) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const sec = { a: 0, b: 0, fat: 0, skin: 0 };
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    arm.section(x, sec);
    for (let j = 0; j <= nt; j++) {
      const th = (j / nt) * Math.PI * 2;
      const zz = sec.a * Math.sin(th);
      const yy = sec.b * Math.cos(th);
      pos.push(x, yy, zz);
      const nz = zz / (sec.a * sec.a);
      const ny = yy / (sec.b * sec.b);
      const l = Math.hypot(nz, ny) || 1;
      nrm.push(0, ny / l, nz / l);
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nt; j++) {
      const a = i * (nt + 1) + j;
      const b = a + nt + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
