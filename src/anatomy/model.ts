/**
 * Modelo anatómico: estructuras tubulares (vasos, nervios, tendones, huesos, hematomas) definidas por
 * puntos de control, resueltas a coordenadas absolutas del brazo, remuestreadas por longitud de arco y
 * empaquetadas en segmentos de "cono redondeado" que la GPU evalúa en cada muestra de la imagen.
 *
 * La misma representación se usa en la CPU para:
 *   - mallas 3D (tubos)
 *   - consultas puntuales (¿dónde está la punta de la aguja?)
 *   - Doppler pulsado (velocidades en el volumen de muestra)
 *   - etiquetas sobre la imagen
 */
import { CatmullRomCurve3, Vector3 } from 'three';
import { ArmShape } from './armShape';
import { WaveKind, waveFactor, pulse01, profilePeakFactor } from './hemo';

export type StructKind = 'artery' | 'vein' | 'avf' | 'graft' | 'nerve' | 'tendon' | 'bone' | 'hematoma';

export const KIND_CODE: Record<StructKind, number> = {
  artery: 1,
  vein: 2,
  avf: 3,
  graft: 4,
  nerve: 10,
  tendon: 11,
  bone: 12,
  hematoma: 13,
};

export interface CtrlPt {
  x: number;
  /** ángulo alrededor del brazo (grados): 0 volar, +90 radial, −90 cubital, 180 dorsal */
  th?: number;
  /** profundidad del centro (mm) bajo la referencia */
  d?: number;
  ref?: 'skin' | 'fascia';
  /** coordenadas absolutas alternativas */
  y?: number;
  z?: number;
  /** radio (luz para vasos, total para el resto) en mm */
  r: number;
  /** grosor de pared (mm) */
  w?: number;
}

export interface Lesion {
  type: 'stenosis' | 'aneurysm' | 'thrombus' | 'jet' | 'valve';
  /** posición a lo largo del vaso (mm de longitud de arco desde el primer punto) */
  at?: number;
  /** alternativa: posición longitudinal en el brazo (mm); se convierte a longitud de arco */
  atX?: number;
  /** longitud (mm) */
  len: number;
  /** severidad: estenosis = reducción de diámetro (0–1); aneurisma = factor de dilatación (p. ej. 2.2) */
  sev?: number;
  /** espesor (mm): trombo mural o engrosamiento intimal */
  thick?: number;
  /** lado del trombo mural (grados alrededor del vaso; 0 = pared superficial, 180 = pared profunda) */
  side?: number;
}

export interface FlowDef {
  /** caudal medio (mL/min), positivo en el sentido de los puntos de control */
  q: number;
  wave: WaveKind;
  /** exponente del perfil de velocidad (2 = parabólico) */
  profile?: number;
  /** turbulencia basal (0–1) */
  turb?: number;
}

export interface StructDef {
  id: string;
  name: string;
  /** etiqueta corta para la imagen */
  short?: string;
  kind: StructKind;
  pts: CtrlPt[];
  flow?: FlowDef;
  /** presión intraluminal media (mmHg) → compresibilidad */
  pressure?: number;
  /** grosor de pared por defecto */
  wall?: number;
  /** calcificación parietal 0–1 */
  calc?: number;
  /** ecogenicidad de la luz (humo / eco espontáneo) 0–1 */
  smoke?: number;
  lesions?: Lesion[];
  /** pulsatilidad de la pared (fracción del radio) */
  pulsatility?: number;
  /** ¿se distiende con el compresor? (venas) */
  tourniquet?: number;
  hideLabel?: boolean;
  /** para agrupar en la vista 3D */
  group?: string;
  /** si es la vena/prótesis principal del acceso */
  isAccess?: boolean;
}

export interface Sample {
  p: Vector3;
  t: Vector3;
  nref: Vector3;
  s: number;
  r: number;
  w: number;
  turb: number;
  swirl: number;
  thick: number;
  wallExtra: number;
  smoke: number;
}

export interface StructDynamic {
  qNow: number; // mL/s con signo
  radiusScale: number;
  pressure: number;
  profile: number;
}

export class Structure {
  readonly samples: Sample[] = [];
  length = 0;
  readonly code: number;
  readonly dyn: StructDynamic = { qNow: 0, radiusScale: 1, pressure: 0, profile: 2 };
  /** caja envolvente (para filtrado rápido) */
  readonly bbMin = new Vector3();
  readonly bbMax = new Vector3();
  maxR = 0;

  constructor(
    readonly def: StructDef,
    readonly index: number,
  ) {
    this.code = KIND_CODE[def.kind];
  }

  get isVessel() {
    return this.code <= 4;
  }
  get isBlood() {
    return this.code <= 4;
  }
}

export interface QueryResult {
  /** estructura más relevante en el punto (o null si tejido de base) */
  struct: Structure | null;
  /** distancia con signo a la superficie de la luz/estructura (mm; negativa dentro) */
  sd: number;
  /** índice de muestra más cercana dentro de la estructura */
  sampleIdx: number;
  /** radio local efectivo */
  r: number;
  /** ¿en la luz de un vaso? */
  inLumen: boolean;
  /** ¿en la pared de un vaso? */
  inWall: boolean;
  /** ¿dentro de trombo? */
  inThrombus: boolean;
  /** vector velocidad (cm/s) */
  vel: Vector3;
  /** tejido de base: 'gel' | 'skin' | 'fat' | 'muscle' */
  layer: 'outside' | 'skin' | 'fat' | 'fascia' | 'muscle';
  skinDepth: number;
}

const SEG_STRIDE = 5; // texels RGBA por segmento
export const MAX_SEGMENTS = 192;
export const MAX_STRUCTS = 48;

export interface Segment {
  st: Structure;
  a: Sample;
  b: Sample;
}

function bump(s: number, at: number, len: number): number {
  const h = len / 2;
  const x = (s - at) / h;
  if (x <= -1 || x >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * x));
}

export class AnatomyModel {
  readonly structures: Structure[] = [];
  readonly segments: Segment[] = [];
  /** datos GPU de segmentos filtrados para el fotograma actual */
  readonly segData = new Float32Array(MAX_SEGMENTS * SEG_STRIDE * 4);
  segCount = 0;
  /** uniformes por estructura */
  readonly strA = new Float32Array(MAX_STRUCTS * 4);
  readonly strB = new Float32Array(MAX_STRUCTS * 4);
  hr = 70;
  tourniquet = false;
  /** incrementa cada vez que cambia la geometría (para regenerar mallas) */
  version = 0;

  constructor(
    public arm: ArmShape,
    defs: StructDef[],
  ) {
    for (const d of defs) this.addStructure(d, false);
    this.rebuildSegments();
  }

  byId(id: string): Structure | undefined {
    return this.structures.find((s) => s.def.id === id);
  }

  addStructure(def: StructDef, rebuild = true): Structure {
    if (this.structures.length >= MAX_STRUCTS) throw new Error('Demasiadas estructuras');
    const st = new Structure(def, this.structures.length);
    this.resolve(st);
    this.structures.push(st);
    if (rebuild) this.rebuildSegments();
    this.version++;
    return st;
  }

  /** Convierte puntos de control en muestras absolutas cada 1.5 mm. */
  private resolve(st: Structure) {
    const def = st.def;
    const pts = def.pts.map((c) => {
      if (c.y !== undefined && c.z !== undefined) return new Vector3(c.x, c.y, c.z);
      return this.arm.surfacePoint(c.x, c.th ?? 0, c.ref ?? 'skin', c.d ?? 0);
    });
    const radii = def.pts.map((c) => c.r);
    const walls = def.pts.map((c) => c.w ?? def.wall ?? defaultWall(def.kind));
    const n = pts.length;
    st.samples.length = 0;
    if (n === 1) {
      // estructura puntual (hematoma esférico): duplicar
      pts.push(pts[0].clone().add(new Vector3(0.01, 0, 0)));
      radii.push(radii[0]);
      walls.push(walls[0]);
    }
    const curve = new CatmullRomCurve3(pts, false, 'centripetal');
    const m = pts.length;
    // muestreo denso en parámetro y acumulación de longitud de arco
    const dense = Math.max(8, (m - 1) * 24);
    const P: Vector3[] = [];
    const U: number[] = [];
    const S: number[] = [0];
    for (let i = 0; i <= dense; i++) {
      const u = i / dense;
      P.push(curve.getPoint(u));
      U.push(u);
      if (i > 0) S.push(S[i - 1] + P[i].distanceTo(P[i - 1]));
    }
    const total = S[dense];
    st.length = total;
    const interp = (arr: number[], u: number) => {
      const f = u * (m - 1);
      let i = Math.floor(f);
      if (i >= m - 1) i = m - 2;
      const t = f - i;
      const a0 = arr[Math.max(i - 1, 0)];
      const a1 = arr[i];
      const a2 = arr[i + 1];
      const a3 = arr[Math.min(i + 2, m - 1)];
      // Catmull-Rom con límite para no producir radios negativos
      const v = 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t * t + (-a0 + 3 * a1 - 3 * a2 + a3) * t * t * t);
      return Math.max(Math.min(a1, a2) * 0.85, Math.min(Math.max(a1, a2) * 1.15, v));
    };
    const step = st.code <= 4 ? 1.5 : 3;
    const count = Math.max(2, Math.round(total / step) + 1);
    let j = 0;
    // posiciones de lesiones indicadas por coordenada x → longitud de arco
    const sOfX = (x: number) => {
      let bestS = 0;
      let bd = Infinity;
      for (let i = 0; i <= dense; i++) {
        const d = Math.abs(P[i].x - x);
        if (d < bd) {
          bd = d;
          bestS = S[i];
        }
      }
      return bestS;
    };
    const lesions = (def.lesions ?? []).map((L) => ({ ...L, at: L.at ?? (L.atX !== undefined ? sOfX(L.atX) : 0) }));
    let maxR = 0;
    for (let k = 0; k < count; k++) {
      const s = (k / (count - 1)) * total;
      while (j < dense - 1 && S[j + 1] < s) j++;
      const f = S[j + 1] > S[j] ? (s - S[j]) / (S[j + 1] - S[j]) : 0;
      const p = P[j].clone().lerp(P[j + 1], f);
      const u = U[j] + (U[j + 1] - U[j]) * f;
      const t = curve.getTangent(Math.min(0.9999, Math.max(0.0001, u))).normalize();
      let r = interp(radii, u);
      let w = interp(walls, u);
      let turb = def.flow?.turb ?? 0;
      let swirl = 0;
      let thick = 0;
      let wallExtra = 0;
      let smoke = def.smoke ?? 0;
      let thrombSide = 180;
      for (const L of lesions) {
        const b = bump(s, L.at, L.len);
        if (L.type === 'stenosis') {
          const sev = L.sev ?? 0.5;
          r *= 1 - sev * b;
          wallExtra = Math.max(wallExtra, (L.thick ?? 0.6) * b);
          // turbulencia postestenótica (chorro) hasta ~2 cm distal
          const post = s > L.at ? Math.exp(-(s - L.at) / 18) * sev : sev * b;
          turb = Math.max(turb, Math.min(1, post * 1.3));
        } else if (L.type === 'aneurysm') {
          const dil = L.sev ?? 2;
          r *= 1 + (dil - 1) * b;
          swirl = Math.max(swirl, b);
          smoke = Math.max(smoke, 0.35 * b);
          turb = Math.max(turb, 0.35 * b);
          if (L.thick) {
            thick = Math.max(thick, L.thick * b);
            thrombSide = L.side ?? 180;
          }
        } else if (L.type === 'thrombus') {
          thick = Math.max(thick, (L.thick ?? 1) * b);
          thrombSide = L.side ?? 180;
        } else if (L.type === 'jet') {
          turb = Math.max(turb, (L.sev ?? 0.8) * b);
        } else if (L.type === 'valve') {
          wallExtra = Math.max(wallExtra, 0.25 * b);
        }
      }
      // referencia "hacia la piel" proyectada perpendicular al eje, rotada según el lado del trombo
      const up = new Vector3(0, p.y, p.z).normalize();
      up.addScaledVector(t, -up.dot(t)).normalize();
      if (up.lengthSq() < 0.5) up.set(0, 1, 0);
      const nref = up.clone().applyAxisAngle(t, (thrombSide * Math.PI) / 180);
      st.samples.push({ p, t, nref, s, r, w, turb, swirl, thick, wallExtra, smoke });
      maxR = Math.max(maxR, r + w + wallExtra);
    }
    st.maxR = maxR;
    st.bbMin.set(Infinity, Infinity, Infinity);
    st.bbMax.set(-Infinity, -Infinity, -Infinity);
    for (const smp of st.samples) {
      st.bbMin.min(smp.p);
      st.bbMax.max(smp.p);
    }
    st.bbMin.subScalar(maxR * 1.6 + 1);
    st.bbMax.addScalar(maxR * 1.6 + 1);
  }

  /** Reconstruye la lista de segmentos (tras añadir/quitar estructuras). */
  rebuildSegments() {
    this.segments.length = 0;
    for (const st of this.structures) {
      const sm = st.samples;
      const stride = st.code <= 4 ? 1 : 1;
      for (let i = 0; i + stride < sm.length; i += stride) {
        this.segments.push({ st, a: sm[i], b: sm[Math.min(i + stride, sm.length - 1)] });
      }
    }
  }

  removeStructure(id: string) {
    const i = this.structures.findIndex((s) => s.def.id === id);
    if (i < 0) return;
    this.structures.splice(i, 1);
    // reindexar
    const rebuilt = this.structures.map((s, k) => {
      const ns = new Structure(s.def, k);
      (ns as { samples: Sample[] }).samples.push(...s.samples);
      ns.length = s.length;
      ns.maxR = s.maxR;
      ns.bbMin.copy(s.bbMin);
      ns.bbMax.copy(s.bbMax);
      return ns;
    });
    this.structures.length = 0;
    this.structures.push(...rebuilt);
    this.rebuildSegments();
    this.version++;
  }

  /** Cambia el radio de una estructura (p. ej. hematoma que crece) sin recalcular la trayectoria. */
  setUniformRadius(st: Structure, r: number) {
    for (const s of st.samples) s.r = r;
    st.maxR = r;
  }

  /** Actualiza el estado hemodinámico dependiente del tiempo. */
  updateDynamics(t: number) {
    for (const st of this.structures) {
      const d = st.def;
      const f = d.flow;
      const dyn = st.dyn;
      dyn.qNow = f ? (f.q / 60) * waveFactor(f.wave, t, this.hr) : 0;
      dyn.profile = f?.profile ?? 2;
      const puls = d.pulsatility ?? (d.kind === 'artery' ? 0.04 : d.kind === 'avf' ? 0.015 : d.kind === 'graft' ? 0.006 : 0);
      const tq = this.tourniquet && (d.kind === 'vein' || d.kind === 'avf') ? (d.tourniquet ?? (d.kind === 'vein' ? 0.18 : 0.1)) : 0;
      dyn.radiusScale = 1 + puls * (f ? pulse01(f.wave, t, this.hr) : 0) + tq;
      const baseP = d.pressure ?? defaultPressure(d.kind);
      dyn.pressure = baseP + (tq > 0 ? 25 : 0) + (d.kind === 'artery' ? 30 * (f ? pulse01(f.wave, t, this.hr) - 0.5 : 0) : 0);
      const i = st.index;
      this.strA[i * 4 + 0] = dyn.qNow;
      this.strA[i * 4 + 1] = dyn.profile;
      this.strA[i * 4 + 2] = dyn.pressure;
      this.strA[i * 4 + 3] = dyn.radiusScale;
      this.strB[i * 4 + 0] = st.code;
      this.strB[i * 4 + 1] = d.kind === 'artery' ? 1.0 : d.kind === 'avf' ? 0.85 : d.kind === 'graft' ? 1.4 : 0.55;
      this.strB[i * 4 + 2] = d.calc ?? 0;
      this.strB[i * 4 + 3] = d.smoke ?? 0;
    }
  }

  /**
   * Filtra los segmentos que pueden contribuir a la imagen actual y los empaqueta para la GPU.
   * @param F centro de la cara del transductor (sin presión), L/B/E ejes, W ancho, D profundidad
   */
  cull(F: Vector3, L: Vector3, B: Vector3, E: Vector3, W: number, D: number, press: number, elevHalf = 4) {
    const out = this.segData;
    let n = 0;
    const c = tmpA;
    const cand: { seg: Segment; dist: number }[] = candBuf;
    cand.length = 0;
    for (const seg of this.segments) {
      const st = seg.st;
      const rs = st.dyn.radiusScale;
      c.addVectors(seg.a.p, seg.b.p).multiplyScalar(0.5).sub(F);
      const hl = seg.a.p.distanceTo(seg.b.p) * 0.5;
      const rad = (Math.max(seg.a.r, seg.b.r) * rs + Math.max(seg.a.w, seg.b.w) + Math.max(seg.a.wallExtra, seg.b.wallExtra)) * 1.6 + 0.6;
      const R = hl + rad;
      const cl = c.dot(L);
      if (Math.abs(cl) > W / 2 + R) continue;
      const cb = c.dot(B);
      if (cb < -press - 2 - R || cb > D + 1 + R) continue;
      const ce = c.dot(E);
      if (Math.abs(ce) > elevHalf + R) continue;
      cand.push({ seg, dist: Math.abs(ce) - R });
    }
    if (cand.length > MAX_SEGMENTS) cand.sort((a, b) => a.dist - b.dist);
    for (const { seg } of cand) {
      if (n >= MAX_SEGMENTS) break;
      const o = n * SEG_STRIDE * 4;
      const a = seg.a;
      const b = seg.b;
      out[o + 0] = a.p.x;
      out[o + 1] = a.p.y;
      out[o + 2] = a.p.z;
      out[o + 3] = a.r;
      out[o + 4] = b.p.x;
      out[o + 5] = b.p.y;
      out[o + 6] = b.p.z;
      out[o + 7] = b.r;
      out[o + 8] = a.w;
      out[o + 9] = b.w;
      out[o + 10] = seg.st.index;
      out[o + 11] = seg.st.code;
      const nr = tmpB.addVectors(a.nref, b.nref).normalize();
      out[o + 12] = nr.x;
      out[o + 13] = nr.y;
      out[o + 14] = nr.z;
      out[o + 15] = (a.thick + b.thick) * 0.5;
      out[o + 16] = Math.max(a.turb, b.turb);
      out[o + 17] = (a.swirl + b.swirl) * 0.5;
      out[o + 18] = (a.wallExtra + b.wallExtra) * 0.5;
      out[o + 19] = Math.max(a.smoke, b.smoke);
      n++;
    }
    this.segCount = n;
    return n;
  }

  /**
   * Consulta del tejido en un punto (coordenadas del brazo, sin deformación).
   * Replica la lógica de prioridades del shader (hueso > vaso > nervio > tendón > hematoma > capas).
   */
  query(p: Vector3, out?: QueryResult): QueryResult {
    const res: QueryResult = out ?? {
      struct: null,
      sd: Infinity,
      sampleIdx: -1,
      r: 0,
      inLumen: false,
      inWall: false,
      inThrombus: false,
      vel: new Vector3(),
      layer: 'muscle',
      skinDepth: 0,
    };
    res.struct = null;
    res.sd = Infinity;
    res.sampleIdx = -1;
    res.inLumen = false;
    res.inWall = false;
    res.inThrombus = false;
    res.vel.set(0, 0, 0);
    const dS = this.arm.skinDepth(p);
    res.skinDepth = dS;
    if (dS < 0) res.layer = 'outside';
    else if (dS < this.arm.skin) res.layer = 'skin';
    else {
      const dF = this.arm.fasciaDepth(p);
      res.layer = dF < -0.25 ? 'fat' : dF < 0.25 ? 'fascia' : 'muscle';
    }
    let best: { st: Structure; sd: number; idx: number; r: number; h: number; o: Vector3; w: number } | null = null;
    let bestPrio = -1;
    for (const st of this.structures) {
      if (p.x < st.bbMin.x || p.x > st.bbMax.x || p.y < st.bbMin.y || p.y > st.bbMax.y || p.z < st.bbMin.z || p.z > st.bbMax.z) continue;
      const sm = st.samples;
      const rs = st.dyn.radiusScale;
      let lsd = Infinity;
      let lidx = -1;
      let lr = 0;
      let lh = 0;
      let lw = 0;
      const lo = tmpO;
      for (let i = 0; i + 1 < sm.length; i++) {
        const a = sm[i];
        const b = sm[i + 1];
        const ba = tmpA.subVectors(b.p, a.p);
        const pa = tmpB.subVectors(p, a.p);
        const L2 = ba.lengthSq();
        const h = L2 > 0 ? Math.min(1, Math.max(0, pa.dot(ba) / L2)) : 0;
        const cx = a.p.x + ba.x * h;
        const cy = a.p.y + ba.y * h;
        const cz = a.p.z + ba.z * h;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dz = p.z - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const r = (a.r + (b.r - a.r) * h) * rs;
        const sd = d - r;
        if (sd < lsd) {
          lsd = sd;
          lidx = h < 0.5 ? i : i + 1;
          lr = r;
          lh = h;
          lw = a.w + (b.w - a.w) * h + a.wallExtra + (b.wallExtra - a.wallExtra) * h;
          lo.set(dx, dy, dz);
        }
      }
      if (lidx < 0) continue;
      const prio = st.code === 12 ? 5 : st.isVessel ? 4 : st.code === 10 ? 3 : st.code === 11 ? 2 : 1;
      const within = st.isVessel ? lsd < lw : lsd < 0;
      if (!within) continue;
      if (prio > bestPrio || (prio === bestPrio && best && lsd < best.sd)) {
        bestPrio = prio;
        best = { st, sd: lsd, idx: lidx, r: lr, h: lh, o: lo.clone(), w: lw };
      }
    }
    if (best) {
      const st = best.st;
      res.struct = st;
      res.sd = best.sd;
      res.sampleIdx = best.idx;
      res.r = best.r;
      if (st.isVessel) {
        if (best.sd < 0) {
          const smp = st.samples[best.idx];
          // trombo mural
          if (smp.thick > 0 && best.o.dot(smp.nref) > best.r - smp.thick) {
            res.inThrombus = true;
          } else {
            res.inLumen = true;
            const rho = Math.min(1, (best.sd + best.r) / Math.max(best.r, 1e-3));
            const n = st.dyn.profile;
            const area = Math.PI * (best.r / 10) ** 2; // cm²
            const vmean = st.dyn.qNow / Math.max(area, 1e-4); // cm/s
            const vmax = vmean * profilePeakFactor(n);
            const v = vmax * (1 - Math.pow(rho, n));
            res.vel.copy(smp.t).multiplyScalar(v);
            if (smp.swirl > 0) {
              const sw = tmpA.crossVectors(smp.t, best.o).normalize().multiplyScalar(Math.abs(vmean) * 0.8 * smp.swirl * rho);
              res.vel.add(sw);
            }
          }
        } else {
          res.inWall = true;
        }
      }
    }
    return res;
  }

  /** Estructuras (con índice de muestra) cuya línea central cruza un plano (para etiquetas). */
  planeCrossings(F: Vector3, L: Vector3, B: Vector3, E: Vector3, W: number, D: number) {
    const res: { st: Structure; u: number; w: number; along: boolean }[] = [];
    for (const st of this.structures) {
      if (st.def.hideLabel) continue;
      const sm = st.samples;
      let inRun: number[] = [];
      const flush = () => {
        if (inRun.length > 6) {
          const mid = sm[inRun[Math.floor(inRun.length / 2)]].p;
          const rel = tmpA.subVectors(mid, F);
          res.push({ st, u: rel.dot(L), w: rel.dot(B), along: true });
        }
        inRun = [];
      };
      for (let i = 0; i < sm.length; i++) {
        const rel = tmpA.subVectors(sm[i].p, F);
        const e = rel.dot(E);
        const u = rel.dot(L);
        const w = rel.dot(B);
        const inside = Math.abs(u) < W / 2 && w > 0 && w < D;
        if (inside && Math.abs(e) < Math.max(0.6, sm[i].r * 0.6)) inRun.push(i);
        else flush();
        if (i > 0 && inside) {
          const relp = tmpB.subVectors(sm[i - 1].p, F);
          const ep = relp.dot(E);
          if ((ep < 0 && e >= 0) || (ep > 0 && e <= 0)) {
            const f = ep / (ep - e);
            const up = relp.dot(L) * (1 - f) + u * f;
            const wp = relp.dot(B) * (1 - f) + w * f;
            // evitar duplicar si es un recorrido en plano
            if (!res.some((q) => q.st === st && Math.hypot(q.u - up, q.w - wp) < 4)) res.push({ st, u: up, w: wp, along: false });
          }
        }
      }
      flush();
    }
    return res;
  }

  /** Muestra más cercana a un punto dentro de una estructura dada. */
  nearestSample(st: Structure, p: Vector3): { idx: number; dist: number } {
    let bi = 0;
    let bd = Infinity;
    st.samples.forEach((s, i) => {
      const d = s.p.distanceToSquared(p);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return { idx: bi, dist: Math.sqrt(bd) };
  }
}

function defaultWall(kind: StructKind): number {
  switch (kind) {
    case 'artery':
      return 0.4;
    case 'vein':
      return 0.22;
    case 'avf':
      return 0.55;
    case 'graft':
      return 0.65;
    case 'bone':
      return 1.8; // cortical
    default:
      return 0.3;
  }
}

function defaultPressure(kind: StructKind): number {
  switch (kind) {
    case 'artery':
      return 90;
    case 'vein':
      return 8;
    case 'avf':
      return 22;
    case 'graft':
      return 60;
    default:
      return 1000;
  }
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpO = new Vector3();
const candBuf: { seg: Segment; dist: number }[] = [];
