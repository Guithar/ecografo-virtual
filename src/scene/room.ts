/**
 * Sala de hemodiálisis: suelo, paredes, sillón de diálisis, paciente, ecógrafo sobre carro con el
 * monitor en vivo, monitor de hemodiálisis y operador (enfermera/o) con brazos por cinemática inversa.
 * Unidades: metros. Paciente mirando hacia +Z; +X = lado izquierdo del paciente; Y arriba.
 */
import {
  type Material,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  Vector3,
  BoxGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { sdCapsule, sdEllipsoid, smin, surfaceNets } from './surfaceNets';

export const SKIN_TONES: Record<string, string> = {
  I: '#f3d6c4',
  II: '#e9bf9f',
  III: '#d6a27c',
  IV: '#b97f57',
  V: '#8d5a3a',
  VI: '#5e3a26',
};

/** Uniformes de la indentación de la piel por la sonda (coordenadas del brazo, mm). */
export interface IndentUniforms {
  uIndF: { value: Vector3 };
  uIndL: { value: Vector3 };
  uIndE: { value: Vector3 };
  uIndB: { value: Vector3 };
  uIndPress: { value: number };
  uIndHalf: { value: Vector3 };
}

/**
 * Deforma una malla del brazo según la presión de la sonda, con el mismo modelo que el simulador
 * ecográfico: desplazamiento a lo largo del haz = presión·exp(−profundidad/14 mm) bajo la huella.
 */
export function patchIndent(m: Material, indent: IndentUniforms) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, indent);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uIndF; uniform vec3 uIndL; uniform vec3 uIndE; uniform vec3 uIndB; uniform float uIndPress; uniform vec3 uIndHalf;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec3 rel = transformed - uIndF;
  float lu = dot(rel, uIndL);
  float le = dot(rel, uIndE);
  float lb = dot(rel, uIndB);
  float fu = 1.0 - smoothstep(uIndHalf.x, uIndHalf.x + 10.0, abs(lu));
  float fe = 1.0 - smoothstep(uIndHalf.y, uIndHalf.y + 10.0, abs(le));
  float d = uIndPress * exp(-max(lb, 0.0) / 14.0) * fu * fe;
  if (lb > -uIndHalf.z) transformed += uIndB * d;
}`,
      );
  };
  m.customProgramCacheKey = () => 'indent';
}

export function skinMaterial(tone = 'III'): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: new Color(SKIN_TONES[tone] ?? SKIN_TONES.III),
    roughness: 0.52,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new Color('#ffb59a'),
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
  });
  // micro-relieve procedural (poros/arrugas finas) y dispersión subsuperficial aproximada (wrap lighting)
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBumpScale = { value: 0.35 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObjPos;
uniform float uBumpScale;
float h31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
 return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float skinH(vec3 p){ return vn3(p*0.9)*0.6 + vn3(p*2.3)*0.3 + vn3(p*5.1)*0.1; }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 dpx = dFdx(vObjPos); vec3 dpy = dFdy(vObjPos);
  float h = skinH(vObjPos);
  float hx = dFdx(h); float hy = dFdy(h);
  vec3 r1 = cross(dpy, normal); vec3 r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - uBumpScale * 0.02 * grad);
}`,
      );
  };
  return m;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function floorTexture(): Texture {
  const t = canvasTex(512, 512, (g) => {
    g.fillStyle = '#c9ccc6';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${90 + Math.random() * 60},${90 + Math.random() * 60},${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    g.strokeStyle = 'rgba(80,85,80,0.25)';
    g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 128) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

// ---------------------------------------------------------------------------------------------
// Paciente
// ---------------------------------------------------------------------------------------------
export interface ArmPlacement {
  shoulder: Vector3;
  dir: Vector3; // dirección distal (hombro → mano)
}

export function armPlacement(side: 'left' | 'right', yawDeg = 35, pitchDeg = 20): ArmPlacement {
  const sx = side === 'left' ? 1 : -1;
  const shoulder = new Vector3(0.185 * sx, 1.05, -0.13);
  const ps = (pitchDeg * Math.PI) / 180;
  const ys = (yawDeg * Math.PI) / 180;
  const dir = new Vector3(Math.cos(ps) * Math.cos(ys) * sx, -Math.sin(ps), Math.cos(ps) * Math.sin(ys)).normalize();
  return { shoulder, dir };
}

/** Matriz de las coordenadas del brazo (mm) → mundo (m). */
export function armMatrix(side: 'left' | 'right', place: ArmPlacement, rollDeg = 0): Matrix4 {
  const X = place.dir.clone().negate();
  const up = new Vector3(0, 1, 0);
  const Y = up.clone().addScaledVector(X, -up.dot(X)).normalize();
  let Z = new Vector3().crossVectors(X, Y).normalize();
  if (side === 'right') Z = Z.negate();
  // pronosupinación (rotación alrededor del eje del brazo)
  if (rollDeg) {
    const q = new Quaternion().setFromAxisAngle(X, (rollDeg * Math.PI) / 180 * (side === 'left' ? 1 : -1));
    Y.applyQuaternion(q);
    Z.applyQuaternion(q);
  }
  const origin = place.shoulder.clone().addScaledVector(place.dir, 0.578);
  const m = new Matrix4().makeBasis(X, Y, Z);
  m.scale(new Vector3(0.001, 0.001, 0.001));
  m.setPosition(origin);
  return m;
}

function patientBody(side: 'left' | 'right', place: ArmPlacement, tone: string) {
  const other = side === 'left' ? -1 : 1; // brazo que descansa
  const sh = place.shoulder;
  const sleeveEnd = sh.clone().addScaledVector(place.dir, 0.12);
  const pelvis = new Vector3(0, 0.62, 0.02);
  const spine = new Vector3(0, Math.cos(0.35), -Math.sin(0.35));
  const at = (k: number) => pelvis.clone().addScaledVector(spine, k);
  const chest = at(0.34);
  const neckA = at(0.49);
  const neckB = at(0.58);
  const head = at(0.7);
  const oSh = new Vector3(0.185 * other, 1.05, -0.13);
  const oEl = new Vector3(0.27 * other, 0.8, -0.04);
  const oWr = new Vector3(0.28 * other, 0.765, 0.22);
  type Prim = { d: (x: number, y: number, z: number) => number; cloth: boolean; hair?: boolean };
  const prims: Prim[] = [
    { d: (x, y, z) => sdEllipsoid(x, y, z, pelvis.x, pelvis.y, pelvis.z, 0.185, 0.12, 0.15), cloth: true },
    { d: (x, y, z) => sdEllipsoid(x, y, z, at(0.17).x, at(0.17).y, at(0.17).z, 0.165, 0.17, 0.125), cloth: true },
    { d: (x, y, z) => sdEllipsoid(x, y, z, chest.x, chest.y, chest.z, 0.18, 0.17, 0.12), cloth: true },
    { d: (x, y, z) => sdCapsule(x, y, z, -0.17, 1.045, -0.13, 0.17, 1.045, -0.13, 0.062, 0.062), cloth: true },
    { d: (x, y, z) => sdCapsule(x, y, z, sh.x, sh.y, sh.z, sleeveEnd.x, sleeveEnd.y, sleeveEnd.z, 0.064, 0.06), cloth: true },
    { d: (x, y, z) => sdCapsule(x, y, z, neckA.x, neckA.y, neckA.z, neckB.x, neckB.y, neckB.z, 0.052, 0.048), cloth: false },
    { d: (x, y, z) => sdEllipsoid(x, y, z, head.x, head.y, head.z, 0.077, 0.108, 0.095), cloth: false },
    { d: (x, y, z) => sdEllipsoid(x, y, z, head.x, head.y - 0.045, head.z + 0.045, 0.06, 0.06, 0.06), cloth: false },
    { d: (x, y, z) => sdEllipsoid(x, y, z, head.x, head.y + 0.03, head.z - 0.012, 0.082, 0.085, 0.092), cloth: false, hair: true },
    // brazo en reposo
    { d: (x, y, z) => sdCapsule(x, y, z, oSh.x, oSh.y, oSh.z, oEl.x, oEl.y, oEl.z, 0.05, 0.042), cloth: true },
    { d: (x, y, z) => sdCapsule(x, y, z, oEl.x, oEl.y, oEl.z, oWr.x, oWr.y, oWr.z, 0.04, 0.03), cloth: false },
    { d: (x, y, z) => sdEllipsoid(x, y, z, oWr.x, oWr.y - 0.005, oWr.z + 0.07, 0.042, 0.018, 0.07), cloth: false },
  ];
  for (const s of [-1, 1]) {
    prims.push({ d: (x, y, z) => sdCapsule(x, y, z, 0.095 * s, 0.6, 0.06, 0.105 * s, 0.62, 0.47, 0.085, 0.062), cloth: true });
    prims.push({ d: (x, y, z) => sdCapsule(x, y, z, 0.105 * s, 0.62, 0.47, 0.11 * s, 0.53, 0.9, 0.055, 0.038), cloth: true });
    prims.push({ d: (x, y, z) => sdCapsule(x, y, z, 0.11 * s, 0.53, 0.92, 0.12 * s, 0.6, 1.01, 0.04, 0.035), cloth: false });
  }
  const sdf = (x: number, y: number, z: number) => {
    let d = 1e9;
    for (const p of prims) d = smin(d, p.d(x, y, z), 0.035);
    return d;
  };
  const skin = new Color(SKIN_TONES[tone] ?? SKIN_TONES.III);
  const gown = new Color('#8fb8d4');
  const hair = new Color('#6b5a4a');
  const geo = surfaceNets(sdf, {
    min: [-0.4, 0.38, -0.4],
    max: [0.4, 1.48, 1.12],
    step: 0.011,
    color: (x, y, z) => {
      let best = 1e9;
      let c = gown;
      for (const p of prims) {
        const d = p.d(x, y, z);
        if (d < best) {
          best = d;
          c = p.hair ? hair : p.cloth ? gown : skin;
        }
      }
      // estampado sutil de la bata
      if (c === gown) {
        const k = 0.94 + 0.06 * Math.sin(x * 140) * Math.sin(z * 140 + y * 60);
        return [c.r * k, c.g * k, c.b * k];
      }
      return [c.r, c.g, c.b];
    },
  });
  const mat = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, sheen: 0.3, sheenColor: new Color('#ffffff') });
  const mesh = new Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'paciente';
  return mesh;
}

function dialysisChair(side: 'left' | 'right') {
  const g = new Group();
  g.name = 'sillon';
  const vinyl = new MeshPhysicalMaterial({ color: '#35506b', roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.2 });
  const frame = new MeshStandardMaterial({ color: '#b9c0c7', roughness: 0.35, metalness: 0.7 });
  const seat = new Mesh(new RoundedBoxGeometry(0.58, 0.11, 0.54, 4, 0.04), vinyl);
  seat.position.set(0, 0.46, 0.06);
  g.add(seat);
  const back = new Mesh(new RoundedBoxGeometry(0.58, 0.82, 0.11, 4, 0.045), vinyl);
  back.position.set(0, 0.88, -0.255);
  back.rotation.x = -0.35;
  g.add(back);
  const headrest = new Mesh(new RoundedBoxGeometry(0.34, 0.2, 0.1, 4, 0.04), vinyl);
  headrest.position.set(0, 1.34, -0.43);
  headrest.rotation.x = -0.35;
  g.add(headrest);
  const leg = new Mesh(new RoundedBoxGeometry(0.54, 0.09, 0.62, 4, 0.04), vinyl);
  leg.position.set(0, 0.45, 0.66);
  leg.rotation.x = 0.1;
  g.add(leg);
  for (const s of [-1, 1]) {
    const arm = new Mesh(new RoundedBoxGeometry(0.1, 0.06, 0.46, 3, 0.025), vinyl);
    arm.position.set(0.34 * s, 0.7, 0.02);
    g.add(arm);
    const post = new Mesh(new CylinderGeometry(0.018, 0.018, 0.22, 12), frame);
    post.position.set(0.34 * s, 0.58, 0.02);
    g.add(post);
  }
  const base = new Mesh(new RoundedBoxGeometry(0.5, 0.26, 0.64, 3, 0.03), new MeshStandardMaterial({ color: '#d6dbe0', roughness: 0.5 }));
  base.position.set(0, 0.2, 0.08);
  g.add(base);
  const plate = new Mesh(new RoundedBoxGeometry(0.66, 0.05, 0.9, 3, 0.02), frame);
  plate.position.set(0, 0.03, 0.14);
  g.add(plate);
  void side;
  g.traverse((o) => {
    if ((o as Mesh).isMesh) {
      (o as Mesh).castShadow = true;
      (o as Mesh).receiveShadow = true;
    }
  });
  return g;
}

/** Soporte acolchado para el brazo (en coordenadas del brazo, mm). */
export function armBoard(): Group {
  const g = new Group();
  const pad = new Mesh(new RoundedBoxGeometry(560, 24, 150, 4, 10), new MeshPhysicalMaterial({ color: '#35506b', roughness: 0.45, clearcoat: 0.3 }));
  pad.position.set(120, -52, 0);
  pad.receiveShadow = true;
  pad.castShadow = true;
  g.add(pad);
  const drape = new Mesh(new RoundedBoxGeometry(420, 3, 170, 2, 1.2), new MeshStandardMaterial({ color: '#7fb3a0', roughness: 0.9 }));
  drape.position.set(90, -38.5, 0);
  drape.receiveShadow = true;
  g.add(drape);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Ecógrafo
// ---------------------------------------------------------------------------------------------
export interface UltrasoundCart {
  group: Group;
  screenMat: MeshBasicMaterial;
  screen: Mesh;
  monitor: Group;
  /** centro de la pantalla en coordenadas del mundo */
  screenCenter(out?: Vector3): Vector3;
  setImageAspect(aspect: number): void;
}

export function buildUltrasoundCart(displayTex: Texture): UltrasoundCart {
  const g = new Group();
  g.name = 'ecografo';
  const white = new MeshPhysicalMaterial({ color: '#eef1f4', roughness: 0.35, clearcoat: 0.5 });
  const dark = new MeshStandardMaterial({ color: '#2b3138', roughness: 0.6 });
  const metal = new MeshStandardMaterial({ color: '#aab2ba', roughness: 0.3, metalness: 0.8 });
  // base con ruedas
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new Mesh(new RoundedBoxGeometry(0.3, 0.04, 0.06, 2, 0.015), dark);
    leg.position.set(Math.cos(a) * 0.15, 0.09, Math.sin(a) * 0.15);
    leg.rotation.y = -a;
    g.add(leg);
    const wheel = new Mesh(new TorusGeometry(0.03, 0.013, 8, 16), dark);
    wheel.position.set(Math.cos(a) * 0.29, 0.043, Math.sin(a) * 0.29);
    wheel.rotation.y = -a + Math.PI / 2;
    g.add(wheel);
  }
  const col = new Mesh(new CylinderGeometry(0.045, 0.055, 0.72, 20), metal);
  col.position.y = 0.46;
  g.add(col);
  const body = new Mesh(new RoundedBoxGeometry(0.46, 0.14, 0.38, 4, 0.04), white);
  body.position.set(0, 0.86, 0);
  g.add(body);
  // consola (teclado inclinado)
  const panel = new Mesh(new RoundedBoxGeometry(0.44, 0.03, 0.26, 3, 0.012), new MeshStandardMaterial({ color: '#dfe4e8', roughness: 0.4 }));
  panel.position.set(0, 0.945, 0.05);
  panel.rotation.x = 0.18;
  g.add(panel);
  const touch = new Mesh(new PlaneGeometry(0.2, 0.12), new MeshBasicMaterial({ color: '#0e2233' }));
  touch.position.set(0, 0.962, 0.05);
  touch.rotation.x = -Math.PI / 2 + 0.18;
  g.add(touch);
  const tb = new Mesh(new SphereGeometry(0.018, 16, 12), new MeshStandardMaterial({ color: '#445566', roughness: 0.2 }));
  tb.position.set(0, 0.96, 0.13);
  g.add(tb);
  for (let i = 0; i < 6; i++) {
    const k = new Mesh(new CylinderGeometry(0.012, 0.012, 0.012, 16), dark);
    k.position.set(-0.17 + i * 0.068, 0.968, 0.15 - 0.001 * i);
    k.rotation.x = 0.18;
    g.add(k);
  }
  // soporte de sondas
  const holder = new Mesh(new RoundedBoxGeometry(0.08, 0.1, 0.05, 2, 0.01), white);
  holder.position.set(0.25, 0.86, 0.1);
  g.add(holder);
  // brazo articulado del monitor
  const monitor = new Group();
  monitor.position.set(0, 1.02, -0.08);
  const post = new Mesh(new CylinderGeometry(0.02, 0.02, 0.26, 12), metal);
  post.position.y = 0.13;
  monitor.add(post);
  const head = new Group();
  head.position.y = 0.36;
  monitor.add(head);
  const frameM = new Mesh(new RoundedBoxGeometry(0.56, 0.38, 0.035, 4, 0.012), new MeshStandardMaterial({ color: '#1d2126', roughness: 0.5 }));
  head.add(frameM);
  const black = new Mesh(new PlaneGeometry(0.53, 0.35), new MeshBasicMaterial({ color: '#000000' }));
  black.position.z = 0.0181;
  head.add(black);
  const screenMat = new MeshBasicMaterial({ map: displayTex, toneMapped: false });
  const screen = new Mesh(new PlaneGeometry(1, 1), screenMat);
  screen.position.set(-0.02, -0.005, 0.0185);
  screen.scale.set(0.3, -0.31, 1);
  head.add(screen);
  // barra de información falsa
  const info = new Mesh(
    new PlaneGeometry(0.53, 0.03),
    new MeshBasicMaterial({
      map: canvasTex(512, 32, (c) => {
        c.fillStyle = '#05080b';
        c.fillRect(0, 0, 512, 32);
        c.fillStyle = '#9fd3ff';
        c.font = '18px sans-serif';
        c.fillText('EcoSim FAV  ·  L12-5  ·  Vascular', 10, 22);
      }),
      toneMapped: false,
    }),
  );
  info.position.set(0, 0.16, 0.019);
  head.add(info);
  g.add(monitor);
  g.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
  });
  return {
    group: g,
    screenMat,
    screen,
    monitor: head,
    screenCenter(out = new Vector3()) {
      return head.getWorldPosition(out);
    },
    setImageAspect(aspect: number) {
      // aspect = profundidad / ancho
      const h = 0.31;
      const w = Math.min(0.46, h / aspect);
      screen.scale.set(w, -h, 1);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Operador con brazos IK
// ---------------------------------------------------------------------------------------------
export interface Operator {
  group: Group;
  head: Object3D;
  eye(out?: Vector3): Vector3;
  forward(out?: Vector3): Vector3;
  setHands(left: Vector3 | null, right: Vector3 | null): void;
  setSeated(seated: boolean): void;
}

export function buildOperator(): Operator {
  const g = new Group();
  g.name = 'operador';
  const scrubs = new MeshPhysicalMaterial({ color: '#2f8a86', roughness: 0.75, sheen: 0.4, sheenColor: new Color('#9ff2e8') });
  const skin = skinMaterial('II');
  const glove = new MeshPhysicalMaterial({ color: '#8fb7e8', roughness: 0.4, clearcoat: 0.3 });
  const cap = new MeshStandardMaterial({ color: '#4d7ec2', roughness: 0.8 });
  const body = new Group();
  g.add(body);
  const pelvis = new Mesh(new CapsuleGeometry(0.15, 0.12, 6, 16), scrubs);
  pelvis.rotation.z = Math.PI / 2;
  body.add(pelvis);
  const torso = new Mesh(new CapsuleGeometry(0.16, 0.36, 8, 20), scrubs);
  torso.scale.set(1, 1, 0.68);
  body.add(torso);
  const neck = new Mesh(new CylinderGeometry(0.045, 0.05, 0.1, 16), skin);
  body.add(neck);
  const head = new Group();
  const skull = new Mesh(new SphereGeometry(0.1, 32, 24), skin);
  skull.scale.set(0.9, 1.1, 1);
  head.add(skull);
  const hat = new Mesh(new SphereGeometry(0.104, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), cap);
  hat.position.y = 0.02;
  hat.scale.set(0.93, 1.05, 1.03);
  head.add(hat);
  const mask = new Mesh(new SphereGeometry(0.1, 24, 12, -0.9, 1.8, 1.45, 0.65), new MeshStandardMaterial({ color: '#9cc9e0', roughness: 0.9, side: DoubleSide }));
  mask.scale.set(0.93, 1.1, 1.04);
  head.add(mask);
  const eyeMat = new MeshStandardMaterial({ color: '#1a1a1a' });
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.011, 12, 8), eyeMat);
    e.position.set(0.034 * s, 0.018, 0.093);
    head.add(e);
  }
  body.add(head);
  const legs: Mesh[] = [];
  for (const s of [-1, 1]) {
    const th = new Mesh(new CapsuleGeometry(0.075, 0.36, 6, 14), scrubs);
    body.add(th);
    legs.push(th);
    const sh = new Mesh(new CapsuleGeometry(0.058, 0.36, 6, 14), scrubs);
    body.add(sh);
    legs.push(sh);
    const shoe = new Mesh(new RoundedBoxGeometry(0.1, 0.07, 0.26, 3, 0.03), new MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.6 }));
    body.add(shoe);
    legs.push(shoe);
    void s;
  }
  const stool = new Group();
  const seatS = new Mesh(new CylinderGeometry(0.2, 0.2, 0.07, 28), new MeshPhysicalMaterial({ color: '#2d3d4c', roughness: 0.5, clearcoat: 0.3 }));
  stool.add(seatS);
  const stem = new Mesh(new CylinderGeometry(0.025, 0.025, 0.45, 12), new MeshStandardMaterial({ color: '#aab2ba', metalness: 0.8, roughness: 0.3 }));
  stem.position.y = -0.25;
  stool.add(stem);
  const foot = new Mesh(new CylinderGeometry(0.25, 0.25, 0.03, 5), new MeshStandardMaterial({ color: '#2b3138' }));
  foot.position.y = -0.47;
  stool.add(foot);
  g.add(stool);
  // brazos: hombro → codo → mano
  const armParts = [0, 1].map(() => {
    const up = new Mesh(new CapsuleGeometry(0.048, 0.24, 6, 12), scrubs);
    const fo = new Mesh(new CapsuleGeometry(0.04, 0.22, 6, 12), skin);
    const hand = new Mesh(new SphereGeometry(0.045, 16, 12), glove);
    hand.scale.set(0.8, 0.55, 1.2);
    g.add(up, fo, hand);
    return { up, fo, hand };
  });
  let seated = true;
  const layout = () => {
    const hip = seated ? 0.58 : 0.95;
    pelvis.position.set(0, hip, 0);
    torso.position.set(0, hip + 0.3, 0.02);
    torso.rotation.x = seated ? 0.12 : 0.05;
    neck.position.set(0, hip + 0.58, 0.05);
    head.position.set(0, hip + 0.72, 0.07);
    head.rotation.x = 0.35;
    stool.visible = seated;
    stool.position.set(0, 0.49, -0.02);
    let i = 0;
    for (const s of [-1, 1]) {
      const th = legs[i++];
      const sh = legs[i++];
      const shoe = legs[i++];
      if (seated) {
        th.position.set(0.1 * s, hip, 0.2);
        th.rotation.set(Math.PI / 2, 0, 0);
        sh.position.set(0.11 * s, hip - 0.24, 0.42);
        sh.rotation.set(0.1, 0, 0);
        shoe.position.set(0.11 * s, 0.035, 0.47);
      } else {
        th.position.set(0.1 * s, hip - 0.25, 0);
        th.rotation.set(0, 0, 0);
        sh.position.set(0.1 * s, hip - 0.67, 0);
        sh.rotation.set(0, 0, 0);
        shoe.position.set(0.1 * s, 0.035, 0.06);
      }
    }
  };
  layout();
  const shoulderL = new Vector3();
  const shoulderR = new Vector3();
  const place = (parts: { up: Mesh; fo: Mesh; hand: Mesh }, S: Vector3, T: Vector3, side: number) => {
    const L1 = 0.3;
    const L2 = 0.28;
    const d = T.clone().sub(S);
    let dist = d.length();
    dist = Math.min(dist, L1 + L2 - 0.001);
    const dn = d.clone().normalize();
    const Tn = S.clone().addScaledVector(dn, dist);
    // plano del codo: hacia abajo y afuera
    const pole = new Vector3(side * 0.6, -1, -0.2).applyQuaternion(g.quaternion).normalize();
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const perp = pole.addScaledVector(dn, -pole.dot(dn)).normalize();
    const E = S.clone().addScaledVector(dn, a).addScaledVector(perp, h);
    const setSeg = (m: Mesh, A: Vector3, B: Vector3) => {
      const mid = A.clone().add(B).multiplyScalar(0.5);
      g.worldToLocal(mid);
      m.position.copy(mid);
      const dir = B.clone().sub(A).normalize();
      const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
      const gq = g.getWorldQuaternion(new Quaternion()).invert();
      m.quaternion.copy(gq.multiply(q));
    };
    setSeg(parts.up, S, E);
    setSeg(parts.fo, E, Tn);
    const hl = Tn.clone();
    g.worldToLocal(hl);
    parts.hand.position.copy(hl);
  };
  return {
    group: g,
    head,
    eye(out = new Vector3()) {
      return head.localToWorld(out.set(0, 0.02, 0.09));
    },
    forward(out = new Vector3()) {
      return out.set(0, 0, 1).applyQuaternion(g.quaternion).normalize();
    },
    setHands(left: Vector3 | null, right: Vector3 | null) {
      g.updateMatrixWorld(true);
      const hip = seated ? 0.58 : 0.95;
      shoulderL.set(0.19, hip + 0.5, 0.04);
      shoulderR.set(-0.19, hip + 0.5, 0.04);
      g.localToWorld(shoulderL);
      g.localToWorld(shoulderR);
      const rest = (s: number) => g.localToWorld(new Vector3(0.24 * s, hip + 0.12, 0.25));
      place(armParts[0], shoulderL, left ?? rest(1), 1);
      place(armParts[1], shoulderR, right ?? rest(-1), -1);
    },
    setSeated(v: boolean) {
      seated = v;
      layout();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Monitor de hemodiálisis (decorativo)
// ---------------------------------------------------------------------------------------------
function dialysisMachine() {
  const g = new Group();
  g.name = 'monitor-hd';
  const white = new MeshPhysicalMaterial({ color: '#e9edf0', roughness: 0.4, clearcoat: 0.4 });
  const body = new Mesh(new RoundedBoxGeometry(0.42, 1.25, 0.45, 4, 0.04), white);
  body.position.y = 0.72;
  g.add(body);
  const scr = new Mesh(
    new PlaneGeometry(0.34, 0.26),
    new MeshBasicMaterial({
      map: canvasTex(340, 260, (c) => {
        c.fillStyle = '#0c2a3a';
        c.fillRect(0, 0, 340, 260);
        c.fillStyle = '#7fe0ff';
        c.font = 'bold 22px sans-serif';
        c.fillText('HD  en espera', 18, 36);
        c.font = '16px sans-serif';
        c.fillStyle = '#c5e8f5';
        const rows = ['Qb      0 mL/min', 'PA        --- mmHg', 'PV        --- mmHg', 'PTM     --- mmHg', 'UF        0.00 L'];
        rows.forEach((r, i) => c.fillText(r, 18, 74 + i * 30));
      }),
      toneMapped: false,
    }),
  );
  scr.position.set(0, 1.2, 0.228);
  scr.rotation.x = -0.1;
  g.add(scr);
  const pump = new Mesh(new CylinderGeometry(0.07, 0.07, 0.04, 24), new MeshStandardMaterial({ color: '#c8ced4', metalness: 0.4, roughness: 0.3 }));
  pump.rotation.x = Math.PI / 2;
  pump.position.set(-0.08, 0.85, 0.235);
  g.add(pump);
  const filt = new Mesh(new CylinderGeometry(0.025, 0.025, 0.3, 16), new MeshPhysicalMaterial({ color: '#f5f5f5', roughness: 0.2, transparent: true, opacity: 0.8 }));
  filt.position.set(0.15, 0.7, 0.25);
  g.add(filt);
  g.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
  });
  return g;
}

export interface Room {
  group: Group;
  patient: Mesh;
  chair: Group;
  cart: UltrasoundCart;
  operator: Operator;
  rebuildPatient(side: 'left' | 'right', place: ArmPlacement, tone: string): void;
}

export function buildRoom(displayTex: Texture, side: 'left' | 'right', place: ArmPlacement, tone: string): Room {
  const group = new Group();
  group.name = 'sala';
  const floor = new Mesh(new CircleGeometry(6, 64), new MeshStandardMaterial({ map: floorTexture(), roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const wallMat = new MeshStandardMaterial({ color: '#dfe5e8', roughness: 0.95 });
  const wall1 = new Mesh(new PlaneGeometry(10, 3.2), wallMat);
  wall1.position.set(0, 1.6, -1.6);
  wall1.receiveShadow = true;
  group.add(wall1);
  const stripe = new Mesh(new PlaneGeometry(10, 0.12), new MeshStandardMaterial({ color: '#6fa3b5', roughness: 0.9 }));
  stripe.position.set(0, 0.95, -1.595);
  group.add(stripe);
  const wall2 = new Mesh(new PlaneGeometry(10, 3.2), wallMat);
  wall2.position.set(-2.6, 1.6, 1.5);
  wall2.rotation.y = Math.PI / 2;
  group.add(wall2);
  const chair = dialysisChair(side);
  group.add(chair);
  const hd = dialysisMachine();
  hd.position.set(side === 'left' ? -0.75 : 0.75, 0, -0.55);
  hd.rotation.y = side === 'left' ? 0.5 : -0.5;
  group.add(hd);
  const cart = buildUltrasoundCart(displayTex);
  group.add(cart.group);
  const operator = buildOperator();
  group.add(operator.group);
  let patient = patientBody(side, place, tone);
  group.add(patient);
  const room: Room = {
    group,
    patient,
    chair,
    cart,
    operator,
    rebuildPatient(s, pl, t) {
      group.remove(patient);
      patient.geometry.dispose();
      patient = patientBody(s, pl, t);
      room.patient = patient;
      group.add(patient);
      hd.position.set(s === 'left' ? -0.75 : 0.75, 0, -0.55);
      hd.rotation.y = s === 'left' ? 0.5 : -0.5;
    },
  };
  return room;
}

export { BoxGeometry };
