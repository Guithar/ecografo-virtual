/**
 * Forma externa del miembro superior (brazo izquierdo canónico, supinado, codo extendido).
 *
 * Sistema de coordenadas local del brazo (milímetros):
 *   +X  eje longitudinal, de distal (muñeca, x = 0 en el pliegue de la muñeca) a proximal (hombro)
 *   +Y  cara volar/anterior (hacia arriba con el antebrazo supinado sobre el apoyabrazos)
 *   +Z  borde radial (lateral, lado del pulgar) del brazo izquierdo
 *
 * La sección transversal se modela como una elipse "magra" (compartimento muscular, limitada por la
 * fascia profunda) rodeada por una capa de grasa subcutánea y la piel. Para que la CPU (consultas,
 * mallas 3D) y la GPU (simulación ecográfica) usen exactamente la misma geometría, las secciones se
 * remuestrean en nodos equiespaciados que se interpolan con Catmull-Rom en ambos lados.
 */
import { Vector3 } from 'three';

export interface ArmSection {
  /** posición longitudinal (mm) */
  x: number;
  /** semieje radio-cubital (Z) de la elipse muscular/fascial (mm) */
  a: number;
  /** semieje volar-dorsal (Y) de la elipse muscular/fascial (mm) */
  b: number;
  /** espesor de grasa subcutánea (mm) */
  fat: number;
}

export const KNOT_COUNT = 64;
export const KNOT_X0 = -40;
export const KNOT_DX = 10;
/** Límites de la región del brazo donde el modelo es válido para escanear */
export const ARM_X_MIN = -15;
export const ARM_X_MAX = 575;

/** Dimensiones de referencia de un adulto (perímetros ~16 cm en muñeca, ~25 cm antebrazo, ~29 cm brazo) */
export const DEFAULT_SECTIONS: ArmSection[] = [
  { x: -40, a: 23.5, b: 13.5, fat: 2.5 },
  { x: 0, a: 24.5, b: 14.0, fat: 2.8 },
  { x: 30, a: 26.5, b: 16.0, fat: 3.0 },
  { x: 60, a: 29.0, b: 19.0, fat: 3.2 },
  { x: 100, a: 31.5, b: 22.5, fat: 3.5 },
  { x: 150, a: 34.0, b: 26.0, fat: 3.8 },
  { x: 200, a: 36.0, b: 28.5, fat: 4.0 },
  { x: 240, a: 36.5, b: 29.5, fat: 4.2 },
  { x: 265, a: 37.0, b: 30.5, fat: 4.5 },
  { x: 300, a: 36.0, b: 31.5, fat: 5.0 },
  { x: 360, a: 36.5, b: 34.5, fat: 5.5 },
  { x: 430, a: 38.0, b: 37.0, fat: 6.0 },
  { x: 500, a: 42.0, b: 40.0, fat: 6.5 },
  { x: 560, a: 47.0, b: 44.0, fat: 7.0 },
  { x: 640, a: 50.0, b: 47.0, fat: 7.0 },
];

export function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Interpolación cúbica monótona (Fritsch-Carlson) para remuestrear las secciones sin sobreoscilaciones. */
function monotoneInterp(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i];
  const d = (k: number) => (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]);
  const m = (k: number) => {
    if (k === 0) return d(0);
    if (k === n - 1) return d(n - 2);
    const d0 = d(k - 1);
    const d1 = d(k);
    if (d0 * d1 <= 0) return 0;
    return (3 * (d0 + d1)) / (2 / d0 + 1 / d1 + (1 / d0 + 2 / d1));
  };
  const t = (x - xs[i]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * ys[i] + h10 * h * m(i) + h01 * ys[i + 1] + h11 * h * m(i + 1);
}

/** Distancia con signo aproximada a una elipse (negativa dentro). Idéntica a la versión GLSL. */
export function sdEllipse(pz: number, py: number, a: number, b: number): number {
  const qz = pz / a;
  const qy = py / b;
  const k0 = Math.sqrt(qz * qz + qy * qy);
  const rz = pz / (a * a);
  const ry = py / (b * b);
  const k1 = Math.sqrt(rz * rz + ry * ry);
  if (k1 < 1e-6) return -Math.min(a, b);
  return (k0 * (k0 - 1)) / k1;
}

export interface SectionSample {
  a: number;
  b: number;
  fat: number;
  skin: number;
}

export class ArmShape {
  readonly knots: Float32Array; // KNOT_COUNT * 4 : a, b, fat, skin
  readonly skin: number;

  constructor(sections: ArmSection[] = DEFAULT_SECTIONS, opts: { fatScale?: number; fatAdd?: number; sizeScale?: number; skin?: number } = {}) {
    const fatScale = opts.fatScale ?? 1;
    const fatAdd = opts.fatAdd ?? 0;
    const size = opts.sizeScale ?? 1;
    this.skin = opts.skin ?? 1.3;
    const xs = sections.map((s) => s.x);
    const as = sections.map((s) => s.a * size);
    const bs = sections.map((s) => s.b * size);
    const fs = sections.map((s) => s.fat * fatScale + fatAdd);
    this.knots = new Float32Array(KNOT_COUNT * 4);
    for (let i = 0; i < KNOT_COUNT; i++) {
      const x = KNOT_X0 + i * KNOT_DX;
      this.knots[i * 4 + 0] = monotoneInterp(xs, as, x);
      this.knots[i * 4 + 1] = monotoneInterp(xs, bs, x);
      this.knots[i * 4 + 2] = Math.max(0.5, monotoneInterp(xs, fs, x));
      this.knots[i * 4 + 3] = this.skin;
    }
  }

  /** Sección interpolada (Catmull-Rom sobre nodos uniformes, igual que en GLSL). */
  section(x: number, out: SectionSample = { a: 0, b: 0, fat: 0, skin: 0 }): SectionSample {
    const fx = (x - KNOT_X0) / KNOT_DX;
    let i = Math.floor(fx);
    let t = fx - i;
    if (i < 0) {
      i = 0;
      t = 0;
    }
    if (i > KNOT_COUNT - 2) {
      i = KNOT_COUNT - 2;
      t = 1;
    }
    const k = this.knots;
    const i0 = Math.max(i - 1, 0);
    const i2 = Math.min(i + 1, KNOT_COUNT - 1);
    const i3 = Math.min(i + 2, KNOT_COUNT - 1);
    out.a = catmull(k[i0 * 4], k[i * 4], k[i2 * 4], k[i3 * 4], t);
    out.b = catmull(k[i0 * 4 + 1], k[i * 4 + 1], k[i2 * 4 + 1], k[i3 * 4 + 1], t);
    out.fat = catmull(k[i0 * 4 + 2], k[i * 4 + 2], k[i2 * 4 + 2], k[i3 * 4 + 2], t);
    out.skin = catmull(k[i0 * 4 + 3], k[i * 4 + 3], k[i2 * 4 + 3], k[i3 * 4 + 3], t);
    return out;
  }

  /** Profundidad bajo la piel (positiva dentro del brazo, negativa fuera). */
  skinDepth(p: Vector3): number {
    const s = this.section(p.x, tmpSec);
    const ext = s.fat + s.skin;
    return -sdEllipse(p.z, p.y, s.a + ext, s.b + ext);
  }

  /** Profundidad bajo la fascia profunda (positiva dentro del compartimento muscular). */
  fasciaDepth(p: Vector3): number {
    const s = this.section(p.x, tmpSec);
    return -sdEllipse(p.z, p.y, s.a, s.b);
  }

  /**
   * Punto de la superficie (piel o fascia) en la sección x y ángulo theta (grados, 0 = volar,
   * +90 = radial, -90 = cubital, 180 = dorsal), desplazado `depth` mm hacia dentro según la normal.
   */
  surfacePoint(x: number, thetaDeg: number, ref: 'skin' | 'fascia' = 'skin', depth = 0, out = new Vector3()): Vector3 {
    const s = this.section(x, tmpSec);
    const ext = ref === 'skin' ? s.fat + s.skin : 0;
    const a = s.a + ext;
    const b = s.b + ext;
    const th = (thetaDeg * Math.PI) / 180;
    const sz = Math.sin(th);
    const cy = Math.cos(th);
    const r = 1 / Math.sqrt((sz / a) ** 2 + (cy / b) ** 2);
    const pz = r * sz;
    const py = r * cy;
    let nz = pz / (a * a);
    let ny = py / (b * b);
    const nl = Math.hypot(nz, ny) || 1;
    nz /= nl;
    ny /= nl;
    return out.set(x, py - ny * depth, pz - nz * depth);
  }

  /** Ángulo (grados) de un punto alrededor del eje del brazo. */
  static thetaOf(p: Vector3): number {
    return (Math.atan2(p.z, p.y) * 180) / Math.PI;
  }

  /**
   * Marco local sobre la piel en (x, theta): punto S, normal exterior N, tangente longitudinal Tx
   * (hacia proximal) y tangente circunferencial Tt (hacia +theta, radial en la cara volar).
   */
  skinFrame(x: number, thetaDeg: number): { S: Vector3; N: Vector3; Tx: Vector3; Tt: Vector3 } {
    const S = this.surfacePoint(x, thetaDeg, 'skin');
    const Sx1 = this.surfacePoint(x + 1, thetaDeg, 'skin');
    const Sx0 = this.surfacePoint(x - 1, thetaDeg, 'skin');
    const St1 = this.surfacePoint(x, thetaDeg + 0.5, 'skin');
    const St0 = this.surfacePoint(x, thetaDeg - 0.5, 'skin');
    const Tx = Sx1.sub(Sx0).normalize();
    const Tt = St1.sub(St0).normalize();
    const N = new Vector3().crossVectors(Tt, Tx).normalize();
    // La normal debe apuntar hacia fuera (alejándose del eje)
    const radial = new Vector3(0, S.y, S.z);
    if (N.dot(radial) < 0) N.negate();
    // Re-ortogonalizar Tt
    Tt.crossVectors(Tx, N).normalize();
    if (Tt.dot(this.surfacePoint(x, thetaDeg + 1, 'skin').sub(S)) < 0) Tt.negate();
    return { S, N, Tx, Tt };
  }

  /** Proyección de un punto cualquiera sobre la piel: devuelve (x, theta). */
  static paramOf(p: Vector3): { x: number; theta: number } {
    return { x: p.x, theta: ArmShape.thetaOf(p) };
  }
}

const tmpSec: SectionSample = { a: 0, b: 0, fat: 0, skin: 0 };
