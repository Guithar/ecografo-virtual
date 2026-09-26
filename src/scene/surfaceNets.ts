/**
 * Poligonización de superficies implícitas (SDF) mediante "Surface Nets" (Gibson 1998; variante de
 * M. Lysenko). Produce mallas suaves con normales exactas derivadas del gradiente de la SDF.
 */
import { BufferAttribute, BufferGeometry } from 'three';

export type SDF = (x: number, y: number, z: number) => number;

export interface NetsOptions {
  min: [number, number, number];
  max: [number, number, number];
  step: number;
  /** atributo de color por vértice opcional */
  color?: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => [number, number, number];
}

const CUBE_EDGES = [0, 1, 0, 2, 0, 4, 1, 3, 1, 5, 2, 3, 2, 6, 3, 7, 4, 5, 4, 6, 5, 7, 6, 7];

export function surfaceNets(sdf: SDF, o: NetsOptions): BufferGeometry {
  const [x0, y0, z0] = o.min;
  const s = o.step;
  const nx = Math.ceil((o.max[0] - x0) / s) + 1;
  const ny = Math.ceil((o.max[1] - y0) / s) + 1;
  const nz = Math.ceil((o.max[2] - z0) / s) + 1;
  const field = new Float32Array(nx * ny * nz);
  let idx = 0;
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * s;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * s;
      for (let i = 0; i < nx; i++) {
        field[idx++] = sdf(x0 + i * s, y, z);
      }
    }
  }
  const at = (i: number, j: number, k: number) => field[i + nx * (j + ny * k)];
  // índice de vértice por celda
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos: number[] = [];
  const cidx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const corner = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let vx = 0;
        let vy = 0;
        let vz = 0;
        let cnt = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = CUBE_EDGES[e];
          const b = CUBE_EDGES[e + 1];
          const va = corner[a];
          const vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const ax = a & 1;
          const ay = (a >> 1) & 1;
          const az = (a >> 2) & 1;
          const bx = b & 1;
          const by = (b >> 1) & 1;
          const bz = (b >> 2) & 1;
          vx += ax + (bx - ax) * t;
          vy += ay + (by - ay) * t;
          vz += az + (bz - az) * t;
          cnt++;
        }
        cellVert[cidx(i, j, k)] = pos.length / 3;
        pos.push(x0 + (i + vx / cnt) * s, y0 + (j + vy / cnt) * s, z0 + (k + vz / cnt) * s);
      }
    }
  }
  const indices: number[] = [];
  // caras: para cada arista del retículo que cruza la superficie, un quad con las 4 celdas vecinas
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = at(i, j, k) < 0;
        // arista en x
        if (i < nx - 1) {
          const v1 = at(i + 1, j, k) < 0;
          if (v0 !== v1) {
            const a = cellVert[cidx(i, j - 1, k - 1)];
            const b = cellVert[cidx(i, j, k - 1)];
            const c = cellVert[cidx(i, j, k)];
            const d = cellVert[cidx(i, j - 1, k)];
            if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quad(indices, a, b, c, d, v0);
          }
        }
        if (j < ny - 1) {
          const v1 = at(i, j + 1, k) < 0;
          if (v0 !== v1) {
            const a = cellVert[cidx(i - 1, j, k - 1)];
            const b = cellVert[cidx(i - 1, j, k)];
            const c = cellVert[cidx(i, j, k)];
            const d = cellVert[cidx(i, j, k - 1)];
            if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quad(indices, a, b, c, d, v0);
          }
        }
        if (k < nz - 1) {
          const v1 = at(i, j, k + 1) < 0;
          if (v0 !== v1) {
            const a = cellVert[cidx(i - 1, j - 1, k)];
            const b = cellVert[cidx(i, j - 1, k)];
            const c = cellVert[cidx(i, j, k)];
            const d = cellVert[cidx(i - 1, j, k)];
            if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quad(indices, a, b, c, d, v0);
          }
        }
      }
    }
  }
  const n = pos.length / 3;
  const positions = new Float32Array(pos);
  const normals = new Float32Array(n * 3);
  const h = s * 0.5;
  for (let v = 0; v < n; v++) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    let gx = sdf(x + h, y, z) - sdf(x - h, y, z);
    let gy = sdf(x, y + h, z) - sdf(x, y - h, z);
    let gz = sdf(x, y, z + h) - sdf(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx /= l;
    gy /= l;
    gz /= l;
    normals[v * 3] = gx;
    normals[v * 3 + 1] = gy;
    normals[v * 3 + 2] = gz;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  if (o.color) {
    const col = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      const c = o.color(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2], normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]);
      col[v * 3] = c[0];
      col[v * 3 + 1] = c[1];
      col[v * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
  }
  geo.setIndex(n > 65535 ? new BufferAttribute(new Uint32Array(indices), 1) : new BufferAttribute(new Uint16Array(indices), 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function quad(out: number[], a: number, b: number, c: number, d: number, flip: boolean) {
  if (flip) out.push(a, b, c, a, c, d);
  else out.push(a, c, b, a, d, c);
}

// ------------------------------------------------------------------------------------------
// Primitivas SDF
// ------------------------------------------------------------------------------------------
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function sdCapsule(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number): number {
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}

export function sdEllipsoid(px: number, py: number, pz: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): number {
  const x = (px - cx) / rx;
  const y = (py - cy) / ry;
  const z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x2 = (px - cx) / (rx * rx);
  const y2 = (py - cy) / (ry * ry);
  const z2 = (pz - cz) / (rz * rz);
  const k1 = Math.sqrt(x2 * x2 + y2 * y2 + z2 * z2);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}
