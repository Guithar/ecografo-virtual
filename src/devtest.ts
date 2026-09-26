/**
 * Arnés de prueba del simulador ecográfico (no forma parte de la aplicación).
 * Parámetros URL: case, x, th, rot, tilt, rock, press, depth, mode, needle=1
 */
import { Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, Vector3, WebGLRenderer } from 'three';
import { ArmShape } from './anatomy/armShape';
import { caseById } from './anatomy/cases';
import { AnatomyModel } from './anatomy/model';
import { UltrasoundSim } from './sim/UltrasoundSim';
import { computePose, defaultProbeState } from './interaction/probePose';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? parseFloat(q.get(k)!) : d);
const cd = caseById(q.get('case') ?? 'rc_madura');
const arm = new ArmShape(undefined, cd.armOpts);
const model = new AnatomyModel(arm, cd.build(arm));
model.hr = cd.hr;

const W = 1200;
const H = 700;
const renderer = new WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);

const sim = new UltrasoundSim(renderer, model, (q.get('q') as 'alta' | 'media' | 'baja') ?? 'media');
const st = defaultProbeState();
st.x = num('x', cd.probeStart.x);
st.theta = num('th', cd.probeStart.theta);
st.rot = num('rot', cd.probeStart.rot);
st.tilt = num('tilt', 0);
st.rock = num('rock', 0);
st.press = num('press', 0.6);
computePose(arm, st, sim.pose);
sim.settings.depth = num('depth', 30);
sim.settings.focus = num('focus', 10);
sim.settings.mode = (q.get('mode') as 'B' | 'color' | 'power') ?? 'B';
sim.settings.steer = num('steer', 0);
sim.settings.scale = num('scale', 60);
sim.settings.gain = num('gain', 0);
if (q.get('needle') === '1') {
  // aguja fuera de plano desde proximal hacia distal, entrando a 30°
  const { S, N, Tx } = arm.skinFrame(st.x + num('nd', 12), st.theta);
  const ang = (num('nang', 30) * Math.PI) / 180;
  const dir = Tx.clone().multiplyScalar(-Math.cos(ang)).addScaledVector(N, -Math.sin(ang)).normalize();
  const len = num('nlen', 14);
  const tip = S.clone().addScaledVector(dir, len);
  const back = S.clone().addScaledVector(dir, -30);
  sim.needles = [{ back: S.clone(), tip, radius: 0.82, active: true }];
  void back;
}
if (q.get('needleip') === '1') {
  // aguja en plano (sonda longitudinal)
  const pose = sim.pose;
  const ang = (num('nang', 25) * Math.PI) / 180;
  const start = pose.F.clone().addScaledVector(pose.L, -pose.width / 2 - 4);
  const dir = pose.L.clone().multiplyScalar(Math.cos(ang)).addScaledVector(pose.B, Math.sin(ang)).normalize();
  const tip = start.clone().addScaledVector(dir, num('nlen', 22));
  sim.needles = [{ back: start.clone(), tip, radius: 0.82, active: true }];
}

const scene = new Scene();
const cam = new OrthographicCamera(0, W, H, 0, -1, 1);
const aspect = sim.settings.depth / sim.pose.width;
const ih = H - 20;
const iw = ih / aspect;
const quad = new Mesh(new PlaneGeometry(iw, ih), new MeshBasicMaterial({ map: sim.displayTexture }));
quad.position.set(10 + iw / 2, H / 2, 0);
quad.scale.y = -1;
scene.add(quad);
const quad2 = new Mesh(new PlaneGeometry(iw, ih), new MeshBasicMaterial({ map: sim.anatomyTexture }));
quad2.position.set(30 + iw * 1.5, H / 2, 0);
quad2.scale.y = -1;
scene.add(quad2);

let frames = 0;
const t0 = performance.now();
function loop() {
  const t = (performance.now() - t0) / 1000;
  sim.render(t);
  renderer.setRenderTarget(null);
  renderer.render(scene, cam);
  frames++;
  const info = document.getElementById('info')!;
  info.textContent = `segs ${sim.model.segCount}  fps ${(frames / Math.max(t, 0.001)).toFixed(1)}  cull ${sim.lastCull.toFixed(2)}ms`;
  (window as unknown as { __frames: number }).__frames = frames;
  const maxF = q.has('frames') ? parseInt(q.get('frames')!) : 1e9;
  if (frames < maxF) requestAnimationFrame(loop);
}
loop();
const _v = new Vector3();
void _v;
