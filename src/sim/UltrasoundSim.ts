/**
 * Motor de simulación ecográfica en GPU (WebGL2 mediante three.js).
 * Ver shaders.ts para la descripción física de cada pase.
 */
import {
  DataTexture,
  FloatType,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RawShaderMaterial,
  RGBAFormat,
  RedFormat,
  Scene,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
  type IUniform,
  type Texture,
  SRGBColorSpace,
} from 'three';
import { AnatomyModel, MAX_SEGMENTS, MAX_STRUCTS } from '../anatomy/model';
import { KNOT_DX, KNOT_X0 } from '../anatomy/armShape';
import {
  ANATOMY_FRAG,
  COPY_FRAG,
  AXIAL_FRAG,
  BMODE_FRAG,
  COMPOSE_FRAG,
  FS_VERT,
  INIT_SCAN_FRAG,
  INTERFACE_FRAG,
  LATERAL_FRAG,
  SCAN_FRAG,
  TISSUE_FRAG,
  TILES_X,
  TILES_Z,
  TILE_MAX,
} from './shaders';

export type ImagingMode = 'B' | 'color' | 'power';

export interface MachineSettings {
  preset: string;
  freq: number; // MHz
  depth: number; // mm
  gain: number; // dB (relativo)
  dr: number; // dB
  focus: number; // mm
  focusZones: 1 | 2;
  tgc: number[]; // 8 bandas, dB
  persistence: number; // 0..0.9
  sri: number; // 0..1
  grayMap: 0 | 1 | 2;
  mode: ImagingMode;
  pw: boolean;
  colorBox: { u0: number; w0: number; u1: number; w1: number };
  steer: number; // grados (−20, 0, 20)
  scale: number; // Nyquist (cm/s)
  baseline: number; // −0.8..0.8 (fracción)
  wallFilter: number; // cm/s
  colorGain: number; // 0..1
  priority: number; // 0..1
  invert: boolean;
  dopplerFreq: number; // MHz
  pwGate: { u: number; w: number; size: number };
  pwAngle: number; // corrección de ángulo (grados, respecto al haz)
  flipLR: boolean;
  fusion: number;
  frozen: boolean;
  elevFWHM: number; // mm grosor de corte en el foco
  needleEnhance: boolean;
}

export function defaultSettings(): MachineSettings {
  return {
    preset: 'FAV',
    freq: 12,
    depth: 30,
    gain: 0,
    dr: 60,
    focus: 10,
    focusZones: 1,
    tgc: [0, 0, 0, 0, 0, 0, 0, 0],
    persistence: 0.25,
    sri: 0.45,
    grayMap: 0,
    mode: 'B',
    pw: false,
    colorBox: { u0: -9, w0: 2, u1: 9, w1: 16 },
    steer: 0,
    scale: 60,
    baseline: 0,
    wallFilter: 4,
    colorGain: 0.6,
    priority: 0.62,
    invert: false,
    dopplerFreq: 6,
    pwGate: { u: 0, w: 8, size: 2 },
    pwAngle: 60,
    flipLR: false,
    fusion: 0,
    frozen: false,
    elevFWHM: 1.1,
    needleEnhance: false,
  };
}

export interface ProbePose {
  /** punto de contacto con la piel (sin presión), coordenadas del brazo */
  F: Vector3;
  /** eje lateral (del marcador al extremo opuesto) */
  L: Vector3;
  /** eje del haz (hacia dentro del tejido) */
  B: Vector3;
  /** eje de elevación */
  E: Vector3;
  /** indentación (mm) */
  press: number;
  /** ancho útil de la sonda (mm) */
  width: number;
}

export interface NeedleRender {
  back: Vector3;
  tip: Vector3;
  radius: number;
  active: boolean;
}

export interface TentState {
  tip: Vector3;
  dir: Vector3;
  amount: number;
  structIndex: number;
}

export const QUALITY = {
  alta: { nl: 400, na: 768 },
  media: { nl: 320, na: 600 },
  baja: { nl: 200, na: 420 },
} as const;
export type Quality = keyof typeof QUALITY;

class FSPass {
  readonly scene = new Scene();
  readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly mesh: Mesh;
  constructor() {
    this.mesh = new Mesh(new PlaneGeometry(2, 2));
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  run(r: WebGLRenderer, mat: RawShaderMaterial, target: WebGLRenderTarget | null) {
    this.mesh.material = mat;
    r.setRenderTarget(target);
    r.render(this.scene, this.cam);
  }
}

function mat(frag: string, uniforms: Record<string, IUniform>) {
  return new RawShaderMaterial({
    vertexShader: FS_VERT,
    fragmentShader: frag,
    uniforms,
    glslVersion: GLSL3,
    depthTest: false,
    depthWrite: false,
  });
}

export class UltrasoundSim {
  nl = 256;
  na = 576;
  readonly settings: MachineSettings = defaultSettings();
  readonly pose: ProbePose = {
    F: new Vector3(100, 20, 20),
    L: new Vector3(0, 0, 1),
    B: new Vector3(0, -1, 0),
    E: new Vector3(1, 0, 0),
    press: 0.5,
    width: 38,
  };
  needles: NeedleRender[] = [];
  tent: TentState | null = null;
  time = 0;
  /** rendimiento: ms del último fotograma de simulación (CPU) */
  lastCull = 0;

  private fs = new FSPass();
  private floatType: typeof FloatType | typeof HalfFloatType = FloatType;
  private rtTissue!: WebGLRenderTarget;
  private rtIface!: WebGLRenderTarget;
  private rtScan: WebGLRenderTarget[] = [];
  private rtAxial!: WebGLRenderTarget;
  private rtLat!: WebGLRenderTarget;
  private rtB: WebGLRenderTarget[] = [];
  private bIdx = 0;
  rtDisplay!: WebGLRenderTarget;
  rtAnatomy!: WebGLRenderTarget;

  private segTex: DataTexture;
  private tileData = new Float32Array((TILE_MAX + 1) * TILES_X * TILES_Z);
  private tileTex: DataTexture;
  private mTissue: RawShaderMaterial;
  private mIface: RawShaderMaterial;
  private mInitScan: RawShaderMaterial;
  private mScan: RawShaderMaterial;
  private mAxial: RawShaderMaterial;
  private mLat: RawShaderMaterial;
  private mB: RawShaderMaterial;
  private mCompose: RawShaderMaterial;
  private mAnat: RawShaderMaterial;
  highlight = -1;
  /** depuración: desactiva la optimización por teselas */
  noTiles = false;
  // bucle cine: anillo de fotogramas de la imagen final
  private cine: WebGLRenderTarget[] = [];
  private cineTimes: number[] = [];
  private cineHead = 0;
  private cineCount = 0;
  private lastCine = -1;
  readonly cineSize = 64;
  cineRate = 16; // Hz
  private mCopy = mat(COPY_FRAG, { uTex: { value: null } });

  constructor(
    private renderer: WebGLRenderer,
    public model: AnatomyModel,
    quality: Quality = 'media',
  ) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    this.floatType = hasFloat ? FloatType : HalfFloatType;

    this.segTex = new DataTexture(model.segData, 5, MAX_SEGMENTS, RGBAFormat, FloatType);
    this.segTex.magFilter = NearestFilter;
    this.segTex.minFilter = NearestFilter;
    this.segTex.needsUpdate = true;

    this.tileTex = new DataTexture(this.tileData, TILE_MAX + 1, TILES_X * TILES_Z, RedFormat, FloatType);
    this.tileTex.magFilter = NearestFilter;
    this.tileTex.minFilter = NearestFilter;
    this.tileTex.needsUpdate = true;

    const knots: Vector4[] = [];
    for (let i = 0; i < 64; i++) knots.push(new Vector4());
    const strA: Vector4[] = [];
    const strB: Vector4[] = [];
    for (let i = 0; i < MAX_STRUCTS; i++) {
      strA.push(new Vector4());
      strB.push(new Vector4());
    }

    this.mTissue = mat(TISSUE_FRAG, {
      uRes: { value: new Vector2() },
      uF: { value: new Vector3() },
      uL: { value: new Vector3() },
      uB: { value: new Vector3() },
      uE: { value: new Vector3() },
      uW: { value: 38 },
      uD: { value: 30 },
      uPress: { value: 0 },
      uKnots: { value: knots },
      uKnotX0: { value: KNOT_X0 },
      uKnotDX: { value: KNOT_DX },
      uSeg: { value: this.segTex },
      uSegCount: { value: 0 },
      uTiles: { value: this.tileTex },
      uStrA: { value: strA },
      uStrB: { value: strB },
      uTime: { value: 0 },
      uLambda: { value: 0.128 },
      uElevFocus: { value: 20 },
      uElevFWHM: { value: 1.1 },
      uDopDir: { value: new Vector3(0, -1, 0) },
      uNdA: { value: [new Vector4(), new Vector4()] },
      uNdB: { value: [new Vector4(), new Vector4()] },
      uTent: { value: new Vector4() },
      uTentDir: { value: new Vector4(0, 0, 0, -1) },
      uGelMax: { value: 2.0 },
      uCompLambda: { value: 14 },
      uPressK: { value: 7 },
      uSoftLift: { value: SOFT_LIFT },
      uNeedleEcho: { value: 4.5 },
    });
    this.mIface = mat(INTERFACE_FRAG, {
      uT0: { value: null },
      uT1: { value: null },
      uRes: { value: new Vector2() },
      uDz: { value: 0.05 },
      uDx: { value: 0.15 },
      uFreq: { value: 12 },
      uLambda: { value: 0.128 },
      uSpecK: { value: 11 },
    });
    this.mInitScan = mat(INIT_SCAN_FRAG, { uIn: { value: null } });
    this.mScan = mat(SCAN_FRAG, { uIn: { value: null }, uStep: { value: 1 } });
    this.mAxial = mat(AXIAL_FRAG, { uScan: { value: null }, uT1: { value: null }, uRes: { value: new Vector2() }, uSigma: { value: 1.5 } });
    this.mLat = mat(LATERAL_FRAG, {
      uIn: { value: null },
      uRes: { value: new Vector2() },
      uDx: { value: 0.15 },
      uDz: { value: 0.05 },
      uSigFocus: { value: 0.2 },
      uFocus: { value: 10 },
      uFocusB: { value: -1 },
      uZR: { value: 9 },
    });
    this.mB = mat(BMODE_FRAG, {
      uIn: { value: null },
      uPrev: { value: null },
      uRes: { value: new Vector2() },
      uDz: { value: 0.05 },
      uGain: { value: -24 },
      uDR: { value: 60 },
      uComp: { value: 0.72 },
      uFreq: { value: 12 },
      uTgc: { value: [0, 0, 0, 0, 0, 0, 0, 0] },
      uNoise: { value: 4e-6 },
      uTime: { value: 0 },
      uPersist: { value: 0.2 },
      uSRI: { value: 0.25 },
    });
    this.mCompose = mat(COMPOSE_FRAG, {
      uB: { value: null },
      uT1: { value: null },
      uRes: { value: new Vector2() },
      uMode: { value: 0 },
      uBox: { value: new Vector4() },
      uSteer: { value: 0 },
      uW: { value: 38 },
      uD: { value: 30 },
      uVn: { value: 60 },
      uBaseline: { value: 0 },
      uWallF: { value: 4 },
      uCGain: { value: 0.6 },
      uPriority: { value: 0.6 },
      uTime: { value: 0 },
      uFusion: { value: 0 },
      uInvert: { value: 0 },
      uHighlight: { value: -1 },
      uMapB: { value: 0 },
    });
    this.mAnat = mat(ANATOMY_FRAG, { uT1: { value: null }, uRes: { value: new Vector2() }, uHighlight: { value: -1 } });

    this.setQuality(quality);
    this.setModel(model);
  }

  setModel(model: AnatomyModel) {
    this.model = model;
    (this.segTex.image as { data: Float32Array }).data = model.segData;
    this.segTex.needsUpdate = true;
    const knots = this.mTissue.uniforms.uKnots.value as Vector4[];
    for (let i = 0; i < 64; i++) knots[i].fromArray(model.arm.knots, i * 4);
    for (const rt of this.rtB) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
    }
    this.renderer.setRenderTarget(null);
  }

  setQuality(q: Quality) {
    const { nl, na } = QUALITY[q];
    this.nl = nl;
    this.na = na;
    if (this.rtTissue) {
      // redimensionar conservando los objetos textura (referenciados por la escena)
      for (const rt of [this.rtTissue, this.rtIface, ...this.rtScan, this.rtAxial, this.rtLat, ...this.rtB, this.rtDisplay, this.rtAnatomy]) rt.setSize(nl, na);
    } else {
      const fopts = { type: this.floatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false };
      this.rtTissue = new WebGLRenderTarget(nl, na, { ...fopts, count: 2 });
      this.rtIface = new WebGLRenderTarget(nl, na, fopts);
      this.rtScan = [new WebGLRenderTarget(nl, na, fopts), new WebGLRenderTarget(nl, na, fopts)];
      this.rtAxial = new WebGLRenderTarget(nl, na, fopts);
      this.rtLat = new WebGLRenderTarget(nl, na, fopts);
      this.rtB = [new WebGLRenderTarget(nl, na, { ...fopts, type: HalfFloatType }), new WebGLRenderTarget(nl, na, { ...fopts, type: HalfFloatType })];
      const dopts = { type: UnsignedByteType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false };
      this.rtDisplay = new WebGLRenderTarget(nl, na, dopts);
      this.rtAnatomy = new WebGLRenderTarget(nl, na, dopts);
      this.rtDisplay.texture.colorSpace = SRGBColorSpace;
      this.rtAnatomy.texture.colorSpace = SRGBColorSpace;
    }
    const res = new Vector2(nl, na);
    for (const m of [this.mTissue, this.mIface, this.mAxial, this.mLat, this.mB, this.mCompose, this.mAnat]) {
      (m.uniforms.uRes.value as Vector2).copy(res);
    }
  }

  get displayTexture(): Texture {
    return this.rtDisplay.texture;
  }
  get anatomyTexture(): Texture {
    return this.rtAnatomy.texture;
  }

  /** Dirección del haz Doppler (orientado según la angulación del color). */
  dopplerDir(out = new Vector3()): Vector3 {
    const s = this.settings;
    const a = (s.steer * Math.PI) / 180;
    return out.copy(this.pose.B).multiplyScalar(Math.cos(a)).addScaledVector(this.pose.L, Math.sin(a)).normalize();
  }

  /** Separación sonda–piel en una posición lateral (mm, ≥0) */
  gapAt(u: number): number {
    const p = tmp1.copy(this.pose.F).addScaledVector(this.pose.L, u);
    return Math.max(0, -this.model.arm.skinDepth(p));
  }

  /** Transforma un punto del tejido (sin deformar) al espacio de la imagen (deformado por la presión). */
  tissueToImage(X: Vector3, out = new Vector3()): { u: number; w: number; e: number; p: Vector3 } {
    const { F, L, B, E, press } = this.pose;
    const rel = tmp2.subVectors(X, F);
    const u = rel.dot(L);
    const e = rel.dot(E);
    const b = rel.dot(B);
    const dloc = press - this.gapAt(u);
    const lift = SOFT_LIFT + 0.5 * press;
    const lam = (this.mTissue.uniforms.uCompLambda.value as number) || 14;
    let w = b - press;
    if (dloc < -lift) {
      // hueco con gel/aire: inversa exacta de imageToTissue, w + lift·exp(−max(w−gap,0)/λ) = b − press
      const gap = -dloc - lift;
      const rhs = b - press;
      w = rhs - lift;
      if (w > gap) {
        let x = w;
        for (let i = 0; i < 6; i++) {
          const ex = Math.exp(-(x - gap) / lam);
          const f = x + lift * ex - rhs;
          const df = 1 - (lift / lam) * ex;
          x -= f / df;
        }
        w = Math.max(gap, x);
      }
    } else if (dloc !== 0) {
      // resolver w − dloc·exp(−w/λ) = b − press (Newton)
      let x = Math.max(0, w + dloc);
      for (let i = 0; i < 6; i++) {
        const ex = Math.exp(-x / lam);
        const f = x - dloc * ex - (b - press);
        const df = 1 + (dloc / lam) * ex;
        x -= f / df;
      }
      w = x;
    }
    out.copy(F).addScaledVector(L, u).addScaledVector(E, e).addScaledVector(B, press + w);
    return { u, w, e, p: out };
  }

  /** Punto del plano en coordenadas de tejido (u lateral, b a lo largo del haz desde la cara de la sonda) → imagen. */
  planeToImage(u: number, b: number): { u: number; w: number } {
    const { F, L, B } = this.pose;
    const r = this.tissueToImage(tmp3b.copy(F).addScaledVector(L, u).addScaledVector(B, b), tmp3c);
    return { u: r.u, w: r.w };
  }

  /** Inversa: punto de la imagen (u, w) → punto del tejido sin deformar. */
  imageToTissue(u: number, w: number, e = 0, out = new Vector3()): Vector3 {
    const { F, L, B, E, press } = this.pose;
    const dloc = press - this.gapAt(u);
    const lam = (this.mTissue.uniforms.uCompLambda.value as number) || 14;
    const lift = SOFT_LIFT + 0.5 * press;
    out.copy(F).addScaledVector(L, u).addScaledVector(E, e).addScaledVector(B, press + w);
    if (dloc >= -lift) out.addScaledVector(B, -dloc * Math.exp(-w / lam));
    else {
      const gap = -dloc - lift;
      out.addScaledVector(B, lift * Math.exp(-Math.max(w - gap, 0) / lam));
    }
    return out;
  }

  /** Grosor de corte (FWHM, mm) a una profundidad. */
  sliceThickness(w: number): number {
    const s = this.settings;
    // mismo modelo que el shader de tejido (uElevFWHM incluye el factor de frecuencia)
    return s.elevFWHM * (12 / Math.max(6, s.freq)) ** 0.5 * Math.sqrt(1 + ((w - elevFocus(s)) / 8.7) ** 2);
  }

  /** Ejecuta la tubería completa. */
  render(time: number) {
    const s = this.settings;
    if (s.frozen) return;
    this.time = time;
    const r = this.renderer;
    const model = this.model;
    const pose = this.pose;
    const W = pose.width;
    const D = s.depth;
    const t0 = performance.now();
    model.updateDynamics(time);
    const n = model.cull(pose.F, pose.L, pose.B, pose.E, W, D, pose.press, Math.max(4, this.sliceThickness(0) * 1.6));
    this.segTex.needsUpdate = true;
    this.buildTiles(n, W, D, pose.press);
    this.lastCull = performance.now() - t0;

    const lambda = 1.54 / s.freq; // mm
    const dz = D / this.na;
    const dx = W / this.nl;

    // --- A. tejido ---
    const u = this.mTissue.uniforms;
    (u.uF.value as Vector3).copy(pose.F);
    (u.uL.value as Vector3).copy(pose.L);
    (u.uB.value as Vector3).copy(pose.B);
    (u.uE.value as Vector3).copy(pose.E);
    u.uW.value = W;
    u.uD.value = D;
    u.uPress.value = pose.press;
    u.uSegCount.value = n;
    u.uTime.value = time;
    u.uLambda.value = lambda;
    u.uElevFocus.value = elevFocus(s);
    u.uElevFWHM.value = s.elevFWHM * (12 / Math.max(6, s.freq)) ** 0.5;
    this.dopplerDir(u.uDopDir.value as Vector3);
    const sa = u.uStrA.value as Vector4[];
    const sb = u.uStrB.value as Vector4[];
    for (let i = 0; i < MAX_STRUCTS; i++) {
      sa[i].fromArray(model.strA, i * 4);
      sb[i].fromArray(model.strB, i * 4);
    }
    const nA = u.uNdA.value as Vector4[];
    const nB = u.uNdB.value as Vector4[];
    for (let i = 0; i < 2; i++) {
      const nd = this.needles[i];
      if (nd && nd.active) {
        const a = this.tissueToImage(nd.back, tmp3).p;
        nA[i].set(a.x, a.y, a.z, nd.radius);
        const b = this.tissueToImage(nd.tip, tmp3).p;
        nB[i].set(b.x, b.y, b.z, 1);
      } else {
        nB[i].w = 0;
      }
    }
    const tent = this.tent;
    if (tent && tent.amount > 0) {
      (u.uTent.value as Vector4).set(tent.tip.x, tent.tip.y, tent.tip.z, tent.amount);
      (u.uTentDir.value as Vector4).set(tent.dir.x, tent.dir.y, tent.dir.z, tent.structIndex);
    } else {
      (u.uTent.value as Vector4).w = 0;
      (u.uTentDir.value as Vector4).w = -1;
    }
    u.uNeedleEcho.value = s.needleEnhance ? 14 : 8;
    this.fs.run(r, this.mTissue, this.rtTissue);

    // --- B. interfaces ---
    const ui = this.mIface.uniforms;
    ui.uT0.value = this.rtTissue.textures[0];
    ui.uT1.value = this.rtTissue.textures[1];
    ui.uDz.value = dz;
    ui.uDx.value = dx;
    ui.uFreq.value = s.freq;
    ui.uLambda.value = lambda;
    this.fs.run(r, this.mIface, this.rtIface);

    // --- C. suma prefija ---
    this.mInitScan.uniforms.uIn.value = this.rtIface.texture;
    this.fs.run(r, this.mInitScan, this.rtScan[0]);
    let src = 0;
    for (let step = 1; step < this.na; step *= 2) {
      this.mScan.uniforms.uIn.value = this.rtScan[src].texture;
      this.mScan.uniforms.uStep.value = step;
      this.fs.run(r, this.mScan, this.rtScan[1 - src]);
      src = 1 - src;
    }

    // --- D. axial ---
    const ua = this.mAxial.uniforms;
    ua.uScan.value = this.rtScan[src].texture;
    ua.uT1.value = this.rtTissue.textures[1];
    const sigAx = 0.5 * lambda * (1 + 0.35 * (12 / s.freq - 1));
    ua.uSigma.value = Math.max(0.6, sigAx / dz);
    this.fs.run(r, this.mAxial, this.rtAxial);

    // --- E. lateral ---
    const ul = this.mLat.uniforms;
    ul.uIn.value = this.rtAxial.texture;
    ul.uDx.value = dx;
    ul.uDz.value = dz;
    ul.uSigFocus.value = Math.max((lambda * 2.3) / 2.355, 0.85 * dx);
    ul.uFocus.value = s.focus;
    ul.uFocusB.value = s.focusZones === 2 ? Math.min(D - 2, s.focus + 10) : -1;
    ul.uZR.value = 7 + 0.1 * D;
    this.fs.run(r, this.mLat, this.rtLat);

    // --- F. modo B ---
    const ub = this.mB.uniforms;
    const prev = this.rtB[this.bIdx];
    const next = this.rtB[1 - this.bIdx];
    ub.uIn.value = this.rtLat.texture;
    ub.uPrev.value = prev.texture;
    ub.uDz.value = dz;
    ub.uGain.value = -21 + s.gain;
    ub.uDR.value = s.dr;
    ub.uFreq.value = s.freq;
    ub.uTgc.value = s.tgc;
    ub.uTime.value = time;
    ub.uPersist.value = s.persistence;
    ub.uSRI.value = s.sri;
    this.fs.run(r, this.mB, next);
    this.bIdx = 1 - this.bIdx;

    // --- G. composición ---
    const uc = this.mCompose.uniforms;
    uc.uB.value = next.texture;
    uc.uT1.value = this.rtTissue.textures[1];
    uc.uMode.value = s.mode === 'B' ? 0 : s.mode === 'color' ? 1 : 2;
    const box = s.colorBox;
    (uc.uBox.value as Vector4).set(box.u0, box.w0, box.u1, box.w1);
    uc.uSteer.value = Math.tan((s.steer * Math.PI) / 180);
    uc.uW.value = W;
    uc.uD.value = D;
    uc.uVn.value = s.scale;
    uc.uBaseline.value = s.baseline;
    uc.uWallF.value = s.wallFilter;
    uc.uCGain.value = s.colorGain;
    uc.uPriority.value = s.priority;
    uc.uTime.value = time;
    uc.uFusion.value = s.fusion;
    uc.uInvert.value = s.invert ? 1 : 0;
    uc.uHighlight.value = this.highlight;
    uc.uMapB.value = s.grayMap;
    this.fs.run(r, this.mCompose, this.rtDisplay);

    // --- bucle cine ---
    if (time - this.lastCine >= 1 / this.cineRate) {
      this.lastCine = time;
      this.pushCine(time);
    }

    // --- H. anatomía ---
    this.mAnat.uniforms.uT1.value = this.rtTissue.textures[1];
    this.mAnat.uniforms.uHighlight.value = this.highlight;
    this.fs.run(r, this.mAnat, this.rtAnatomy);

    r.setRenderTarget(null);
  }

  private pushCine(t: number) {
    if (this.cine.length < this.cineSize) {
      const rt = new WebGLRenderTarget(this.nl, this.na, { type: UnsignedByteType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false });
      rt.texture.colorSpace = SRGBColorSpace;
      this.cine.push(rt);
      this.cineTimes.push(0);
    }
    const rt = this.cine[this.cineHead];
    if (rt.width !== this.nl || rt.height !== this.na) rt.setSize(this.nl, this.na);
    this.mCopy.uniforms.uTex.value = this.rtDisplay.texture;
    this.fs.run(this.renderer, this.mCopy, rt);
    this.cineTimes[this.cineHead] = t;
    this.cineHead = (this.cineHead + 1) % this.cineSize;
    this.cineCount = Math.min(this.cineCount + 1, this.cineSize);
  }

  /** Asigna a cada tesela de la imagen los segmentos cuya esfera envolvente puede alcanzarla. */
  private buildTiles(n: number, W: number, D: number, press: number) {
    const td = this.tileData;
    const stride = TILE_MAX + 1;
    const nt = TILES_X * TILES_Z;
    for (let t = 0; t < nt; t++) td[t * stride] = this.noTiles ? -1 : 0;
    if (this.noTiles) {
      this.tileTex.needsUpdate = true;
      return;
    }
    const m = this.model;
    const tw = W / TILES_X;
    const th = D / TILES_Z;
    const lift = SOFT_LIFT + 0.5 * press;
    for (let i = 0; i < n; i++) {
      const u = m.segU[i] + W / 2;
      const w = m.segW[i];
      const r = m.segR[i];
      const x0 = Math.max(0, Math.floor((u - r) / tw));
      const x1 = Math.min(TILES_X - 1, Math.floor((u + r) / tw));
      const z0 = Math.max(0, Math.floor((w - r - lift) / th));
      const z1 = Math.min(TILES_Z - 1, Math.floor((w + r + press) / th));
      for (let tz = z0; tz <= z1; tz++) {
        for (let tx = x0; tx <= x1; tx++) {
          const t = tz * TILES_X + tx;
          const c = td[t * stride];
          if (c < 0) continue;
          if (c >= TILE_MAX) {
            td[t * stride] = -1; // desbordamiento: la tesela recorrerá todos los segmentos
            continue;
          }
          td[t * stride + 1 + c] = i;
          td[t * stride] = c + 1;
        }
      }
    }
    this.tileTex.needsUpdate = true;
  }

  /** Número de fotogramas disponibles en el cine. */
  get cineFrames(): number {
    return this.cineCount;
  }

  /** Muestra el fotograma k del cine (0 = más antiguo, n−1 = más reciente) en la imagen congelada. */
  showCine(k: number) {
    if (!this.cineCount) return;
    const n = this.cineCount;
    const idx = (this.cineHead - n + Math.max(0, Math.min(n - 1, Math.round(k))) + this.cineSize) % this.cineSize;
    this.mCopy.uniforms.uTex.value = this.cine[idx].texture;
    this.fs.run(this.renderer, this.mCopy, this.rtDisplay);
    this.renderer.setRenderTarget(null);
  }

  /** Tiempo relativo (s) del fotograma k respecto al más reciente. */
  cineTime(k: number): number {
    const n = this.cineCount;
    if (!n) return 0;
    const i = (this.cineHead - n + Math.max(0, Math.min(n - 1, Math.round(k))) + this.cineSize) % this.cineSize;
    const last = (this.cineHead - 1 + this.cineSize) % this.cineSize;
    return this.cineTimes[i] - this.cineTimes[last];
  }

  resetCine() {
    this.cineCount = 0;
  }

  /** Lectura de la etiqueta de tejido en un píxel de la imagen (para depuración/pruebas). */
  readLabels(): Float32Array {
    const buf = new Float32Array(this.nl * this.na * 4);
    this.renderer.readRenderTargetPixels(this.rtTissue, 0, 0, this.nl, this.na, buf, undefined, 1);
    return buf;
  }

  /** Lectura del modo B (gris 0..1) para pruebas/medidas automáticas. */
  readDisplay(): Uint8Array {
    const buf = new Uint8Array(this.nl * this.na * 4);
    this.renderer.readRenderTargetPixels(this.rtDisplay, 0, 0, this.nl, this.na, buf);
    return buf;
  }
}

export function elevFocus(s: MachineSettings): number {
  return 18 + 0 * s.depth;
}

/** mm que el tejido blando se adapta a la cara plana de la sonda */
export const SOFT_LIFT = 1.8;

const tmp1 = new Vector3();
const tmp2 = new Vector3();
const tmp3 = new Vector3();
const tmp3b = new Vector3();
const tmp3c = new Vector3();
