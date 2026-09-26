/**
 * Aplicación principal: orquesta el modelo anatómico, el simulador ecográfico, la escena 3D, la
 * interacción (sonda, aguja, sala) y el entrenamiento (métricas, lecciones, ergonomía).
 */
import { Color, Vector2, Vector3, WebGLRenderer } from 'three';
import { ArmShape } from '../anatomy/armShape';
import { CaseDef, CASES, caseById } from '../anatomy/cases';
import { AnatomyModel, Structure } from '../anatomy/model';
import { Needle, NeedleEvent, NeedleRole } from '../interaction/needle';
import { clampProbe, computePose, defaultProbeState, ProbeState, skinParamOf } from '../interaction/probePose';
import { SceneManager, CameraPreset, defaultRoomConfig, placeDefaults, NeedleVisual } from '../scene/SceneManager';
import { DopplerAudio, SpectralDoppler } from '../sim/spectral';
import { defaultSettings, MachineSettings, Quality, SOFT_LIFT, UltrasoundSim } from '../sim/UltrasoundSim';
import { evaluateErgonomics, ErgoResult } from '../training/ergonomics';
import { LESSONS, Lesson, LessonCtx } from '../training/lessons';
import { FinalCheck, Metrics } from '../training/metrics';
import { elementRect, ImageView } from '../ui/imageView';
import { Monitor } from '../ui/monitor';
import { buildConsole } from '../ui/console';
import { Panels } from '../ui/panels';

export type AppMode = 'explore' | 'cannulate' | 'room' | 'learn';

interface Hematoma {
  st: Structure;
  t0: number;
  rmax: number;
  center: Vector3;
}

export interface SessionRecord {
  date: string;
  caseId: string;
  caseTitle: string;
  approach: string;
  score: number;
  needle: string;
  checks: FinalCheck[];
}

export class App {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  sim!: UltrasoundSim;
  spectral!: SpectralDoppler;
  audio = new DopplerAudio();
  monitor!: Monitor;
  scene!: SceneManager;
  anatView = new ImageView();
  panels!: Panels;
  caseDef: CaseDef = CASES[1];
  arm!: ArmShape;
  model!: AnatomyModel;
  probe: ProbeState = defaultProbeState();
  mode: AppMode = 'explore';
  tourniquet = false;
  needles: Needle[] = [new Needle('arterial'), new Needle('venosa')];
  activeNeedle = 0;
  approach: 'oop' | 'ip' = 'oop';
  metrics = new Metrics();
  aids = true;
  labels = false;
  anatLabels = true;
  hematomas: Hematoma[] = [];
  lesson: { lesson: Lesson; step: number; done: boolean[] } | null = null;
  lessonEvents = new Set<string>();
  lessonFlags: Record<string, number> = {};
  history: SessionRecord[] = [];
  ergo: ErgoResult | null = null;
  keys = new Set<string>();
  time = 0;
  private last = performance.now();
  private uiTimer = 0;
  private lessonTimer = 0;
  private prevF = new Vector3();
  private prevDepth = [0, 0];
  private consoleUpdate: () => void = () => {};
  placingNeedle = false;
  private dragProbe = false;
  private dragRoom: 'ecografo' | 'operador' | null = null;
  private needleFlash = [0, 0];
  toastsEl: HTMLElement;
  quality: Quality = 'media';
  private defaultsSettings: MachineSettings = defaultSettings();

  constructor() {
    this.canvas = document.getElementById('gl') as HTMLCanvasElement;
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.autoClear = false;
    this.toastsEl = document.getElementById('toasts')!;
    try {
      this.history = JSON.parse(localStorage.getItem('ecofav-historial') ?? '[]');
    } catch {
      this.history = [];
    }
  }

  async init() {
    const q = new URLSearchParams(location.search);
    if (q.has('frames')) this.maxFrames = parseInt(q.get('frames')!);
    this.quality = (q.get('calidad') as Quality) || (isMobile() ? 'baja' : 'media');
    (document.getElementById('quality') as HTMLSelectElement).value = this.quality;
    const cd = caseById(q.get('caso') ?? 'rc_madura');
    this.caseDef = cd;
    this.arm = new ArmShape(undefined, cd.armOpts);
    this.model = new AnatomyModel(this.arm, cd.build(this.arm));
    this.sim = new UltrasoundSim(this.renderer, this.model, this.quality);
    this.spectral = new SpectralDoppler(this.sim, this.model);
    this.spectral.audio = this.audio;
    this.monitor = new Monitor(document.getElementById('paneMonitor')!, this.sim, () => this.model, this.spectral);
    this.monitor.onMeasure = (c) => this.onCaliper(c);
    this.scene = new SceneManager(this.renderer, this.sim.displayTexture, this.sim.anatomyTexture, document.getElementById('view3d')!);
    this.scene.setRoomConfig(defaultRoomConfig('left'), true);
    this.panels = new Panels(this);
    this.consoleUpdate = buildConsole(this, document.getElementById('console')!);
    this.loadCase(cd.id);
    this.bindTopbar();
    this.bindInput();
    this.setMode((q.get('modo') as AppMode) ?? 'explore');
    computePose(this.arm, this.probe, this.sim.pose);
    this.scene.updateProbe(this.sim.pose, this.sim.settings.depth);
    this.scene.scene.updateMatrixWorld(true);
    this.scene.setPreset((q.get('camara') as CameraPreset) ?? (this.mode === 'room' ? 'sala' : 'procedimiento'));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    if (!q.has('frames') && !q.has('max')) this.panels.showWelcome();
    requestAnimationFrame(() => this.frame());
  }

  // ------------------------------------------------------------------------------------------
  // Casos y modos
  // ------------------------------------------------------------------------------------------
  loadCase(id: string) {
    const cd = caseById(id);
    this.caseDef = cd;
    this.arm = new ArmShape(undefined, cd.armOpts);
    this.model = new AnatomyModel(this.arm, cd.build(this.arm));
    this.model.hr = cd.hr;
    this.model.tourniquet = this.tourniquet;
    this.sim.setModel(this.model);
    this.spectral.setModel(this.model);
    this.scene.setModel(this.model);
    this.hematomas = [];
    Object.assign(this.probe, { x: cd.probeStart.x, theta: cd.probeStart.theta, rot: cd.probeStart.rot, tilt: 0, rock: 0, press: 0.6 });
    // preajuste de profundidad según el vaso de acceso
    const s = this.sim.settings;
    s.depth = cd.id === 'bc_obeso' ? 35 : 25;
    s.focus = cd.id === 'bc_obeso' ? 16 : 8;
    s.frozen = false;
    this.sim.resetCine();
    this.resetNeedles();
    this.monitor.clearCalipers();
    this.metrics.reset();
    this.lessonEvents.clear();
    (document.getElementById('caseSelect') as HTMLSelectElement).value = cd.id;
    const diff = document.getElementById('caseDiff')!;
    diff.className = `diff d${cd.difficulty}`;
    diff.textContent = ['', 'Básico', 'Intermedio', 'Avanzado'][cd.difficulty];
    document.getElementById('monCase')!.textContent = `${cd.short} · ${this.scene.cfg.side === 'left' ? 'MSI' : 'MSD'}`;
    this.panels.renderCase();
    this.panels.renderMetrics();
    this.panels.renderMeasures();
    this.panels.renderLegend();
    computePose(this.arm, this.probe, this.sim.pose);
    this.prevF.copy(this.sim.pose.F);
  }

  resetNeedles() {
    const role0: NeedleRole = 'arterial';
    const gauge = this.needles[0]?.gauge ?? 15;
    this.needles = [new Needle(role0), new Needle('venosa')];
    for (const n of this.needles) {
      n.gauge = gauge;
      n.onEvent = (e) => this.onNeedleEvent(n, e);
    }
    this.needleFlash = [0, 0];
    this.scene?.resetNeedles();
    this.sim.needles = [];
    this.sim.tent = null;
  }

  setMode(m: AppMode) {
    this.mode = m;
    document.querySelectorAll('#modeTabs button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.mode === m));
    document.body.dataset.mode = m;
    if (m === 'room') {
      this.scene.setPreset('sala');
      this.panels.showTab('ergo');
      this.scene.opts.skinOpacity = 1;
      this.scene.applyOptions();
    } else if (m === 'cannulate') {
      this.panels.showTab('metrics');
      if (this.scene.useOperatorCam) this.scene.setPreset('procedimiento');
    } else if (m === 'learn') {
      this.panels.showTab('lessons');
    } else {
      this.panels.showTab('case');
    }
    if (m !== 'room' && this.scene.opts.skinOpacity > 0.95) {
      this.scene.opts.skinOpacity = 0.7;
      this.scene.applyOptions();
      if (!this.scene.useOperatorCam) this.scene.setPreset('procedimiento');
    }
    document.getElementById('needleHud')!.classList.toggle('hidden', m !== 'cannulate' && !(m === 'learn' && this.lesson?.lesson.mode === 'cannulate'));
    this.consoleUpdate();
  }

  startLesson(id: string) {
    const l = LESSONS.find((x) => x.id === id);
    if (!l) return;
    if (this.caseDef.id !== l.caseId) this.loadCase(l.caseId);
    this.lesson = { lesson: l, step: 0, done: l.steps.map(() => false) };
    this.lessonEvents.clear();
    this.lessonFlags = {};
    if (l.mode === 'cannulate') this.resetNeedles();
    document.getElementById('needleHud')!.classList.toggle('hidden', l.mode !== 'cannulate');
    this.consoleUpdate();
    this.panels.renderLessons();
  }

  // ------------------------------------------------------------------------------------------
  // Sonda
  // ------------------------------------------------------------------------------------------
  setProbeView(kind: 'trans' | 'long') {
    // eje del vaso de acceso para orientar la sonda
    this.probe.tilt = 0;
    this.probe.rock = 0;
    const a = this.accessStruct();
    let base = 0;
    if (a) {
      const p = this.arm.surfacePoint(this.probe.x, this.probe.theta, 'skin');
      const { idx } = this.model.nearestSample(a, p);
      const t = a.samples[idx].t;
      const f = this.arm.skinFrame(this.probe.x, this.probe.theta);
      const ang = (Math.atan2(t.dot(f.Tt), t.dot(f.Tx)) * 180) / Math.PI; // ángulo del vaso respecto a Tx
      // transversal: L ⟂ vaso → L = Tt·cos(rot)+Tx·sin(rot) ⟂ t → rot = ang (L ∥ t para longitudinal: rot = ang + 90)... ver computePose
      base = -ang;
      if (Math.abs(base) > 60) base = 0;
    }
    this.probe.rot = kind === 'trans' ? base : base + 90;
  }

  /** Recalcula la pose de la sonda a partir de su estado (sin esperar al siguiente fotograma). */
  updatePose() {
    clampProbe(this.probe);
    computePose(this.arm, this.probe, this.sim.pose);
  }

  /** Centra la sonda sobre el vaso de acceso (ayuda). */
  centerOnVessel() {
    const a = this.accessStruct();
    if (!a) return;
    const p = this.arm.surfacePoint(this.probe.x, this.probe.theta, 'skin');
    const { idx } = this.model.nearestSample(a, p);
    const c = a.samples[idx].p;
    const par = skinParamOf(c);
    this.probe.theta = par.theta;
    this.probe.x = par.x;
  }

  accessStruct(): Structure | undefined {
    const id = this.caseDef.access?.veinId;
    return id ? this.model.byId(id) : this.model.structures.find((s) => s.def.kind === 'avf' || s.def.kind === 'graft') ?? this.model.byId('v_cefalica');
  }

  // ------------------------------------------------------------------------------------------
  // Aguja
  // ------------------------------------------------------------------------------------------
  get needle(): Needle {
    return this.needles[this.activeNeedle];
  }

  /** Coloca la aguja activa junto a la sonda según el abordaje (fuera de plano / en plano). */
  placeNeedleAuto(approach: 'oop' | 'ip' = this.approach) {
    this.approach = approach;
    const n = this.needle;
    if (n.placed && n.depth > 0) {
      this.toast('Retira primero la aguja actual', 'warn');
      return;
    }
    clampProbe(this.probe);
    computePose(this.arm, this.probe, this.sim.pose);
    const pose = this.sim.pose;
    const a = this.accessStruct();
    let targetDepth = 6;
    if (a) {
      const v = this.vesselInImage(a.def.id);
      if (v) targetDepth = v.w;
    }
    const xArm = new Vector3(1, 0, 0);
    let entry: Vector3;
    let dirH: Vector3;
    let angle: number;
    if (approach === 'oop') {
      // en la línea media de la sonda, fuera de la huella, avanzando hacia el plano
      const towardProx = pose.E.dot(xArm) >= 0 ? 1 : -1;
      const wantProx = n.role === 'venosa' ? 1 : this.caseDef.access?.graft ? 1 : 1;
      const s = towardProx * wantProx; // la aguja avanza en sentido +E·s
      const dist = Math.max(8.5, Math.min(16, targetDepth * 1.1));
      entry = pose.F.clone().addScaledVector(pose.E, -s * dist);
      dirH = pose.E.clone().multiplyScalar(s);
      angle = Math.max(25, Math.min(55, (Math.atan2(targetDepth, dist) * 180) / Math.PI));
    } else {
      const s = pose.L.dot(xArm) >= 0 ? 1 : -1; // entrar por el extremo distal
      entry = pose.F.clone().addScaledVector(pose.L, -s * (pose.width / 2 + 4));
      dirH = pose.L.clone().multiplyScalar(s);
      angle = this.caseDef.access?.graft ? 40 : 25;
    }
    const par = skinParamOf(entry);
    const f = this.arm.skinFrame(par.x, par.theta);
    const heading = (Math.atan2(dirH.dot(f.Tt), dirH.dot(f.Tx)) * 180) / Math.PI;
    n.place(this.arm, par.x, par.theta, heading, Math.round(angle));
    this.toast(`Aguja ${n.role} (${n.gauge}G) colocada: ${approach === 'oop' ? 'fuera de plano' : 'en plano'}, ${Math.round(angle)}°`, 'info');
    this.panels.renderMetrics();
  }

  placeNeedleAt(p: Vector3) {
    const n = this.needle;
    if (n.placed && n.depth > 0) {
      this.toast('Retira primero la aguja actual', 'warn');
      return;
    }
    const par = skinParamOf(p);
    const f = this.arm.skinFrame(par.x, par.theta);
    // rumbo: hacia la sonda si está cerca; si no, hacia proximal
    const toProbe = this.sim.pose.F.clone().sub(f.S);
    let heading = 0;
    if (toProbe.length() < 60) heading = (Math.atan2(toProbe.dot(f.Tt), toProbe.dot(f.Tx)) * 180) / Math.PI;
    n.place(this.arm, par.x, par.theta, heading, this.caseDef.access?.angle ?? 30);
    this.placingNeedle = false;
    this.toast('Aguja colocada en la piel. Avanza con ↑ o la rueda del ratón.', 'info');
  }

  withdrawNeedle() {
    const n = this.needle;
    if (!n.placed) return;
    n.depth = -3;
    n.update(this.model, this.time, this.accessIds());
    n.placed = false;
    this.needleFlash[this.activeNeedle] = 0;
    this.toast('Aguja retirada', 'info');
  }

  advanceNeedle(mm: number) {
    const n = this.needle;
    if (!n.placed) {
      this.toast('Primero coloca la aguja (botón "Colocar" o clic en la piel)', 'warn');
      return;
    }
    if (n.confirmed) return;
    n.depth = Math.max(-5, Math.min(n.length - 2, n.depth + mm));
  }

  accessIds(): Set<string> {
    const ids = new Set<string>();
    for (const s of this.model.structures) if (s.def.group === 'fav' || s.def.isAccess) ids.add(s.def.id);
    return ids;
  }

  private onNeedleEvent(n: Needle, e: NeedleEvent) {
    this.metrics.onEvent(e);
    this.lessonEvents.add(e.type);
    if (e.type !== 'redirect' || this.mode === 'cannulate') this.toast(e.msg, e.severity === 'error' ? 'error' : e.severity === 'warn' ? 'warn' : e.severity === 'ok' ? 'ok' : 'info');
    if (e.type === 'transfix') this.addHematoma(n);
    this.panels.logEvent(e);
  }

  private addHematoma(n: Needle) {
    if (this.hematomas.length >= 4) return;
    const last = n.punctures[n.punctures.length - 1];
    if (!last) return;
    const st0 = last.st;
    const c = n.tip.clone();
    const kind = st0.def.kind;
    const rmax = kind === 'artery' ? 7 : kind === 'avf' || kind === 'graft' ? 5.5 : 3.2;
    const st = this.model.addStructure({
      id: `hematoma_${Date.now()}`,
      name: 'Hematoma (extravasación)',
      short: 'Hematoma',
      kind: 'hematoma',
      group: 'hematoma',
      pts: [{ x: c.x, y: c.y, z: c.z, r: 0.8 }],
    });
    this.hematomas.push({ st, t0: this.time, rmax, center: c });
    this.scene.rebuildAnatomy();
  }

  /** Evalúa la punción actual con los criterios de las guías. */
  confirmPuncture() {
    const n = this.needle;
    if (!n.placed || n.depth <= 0) {
      this.toast('No hay aguja insertada', 'warn');
      return;
    }
    const checks: FinalCheck[] = [];
    const access = this.accessIds();
    const inAccess = n.state === 'luz' && !!n.inVessel && access.has(n.inVessel.def.id);
    checks.push({ label: 'Punta en la luz del acceso vascular', ok: inAccess, detail: inAccess ? `En ${n.inVessel!.def.name}` : `Estado: ${n.state}${n.inVessel ? ' en ' + n.inVessel.def.name : ''}`, penalty: 35 });
    const len = n.intraluminalLength(this.model);
    checks.push({ label: 'Recorrido intraluminal ≥ 5 mm', ok: inAccess ? len >= 5 : null, detail: `${len.toFixed(1)} mm`, penalty: 8 });
    const cen = n.centering(this.model);
    checks.push({ label: 'Punta centrada en la luz', ok: cen === null ? null : cen < 0.65, detail: cen === null ? '—' : `${Math.round(cen * 100)} % del radio desde el eje`, penalty: 5 });
    const av = n.angleToVessel(this.model);
    checks.push({ label: 'Aguja alineada con el vaso (≤ 25° tras bajar el ángulo)', ok: av === null ? null : av <= 25, detail: av === null ? '—' : `${av.toFixed(0)}°`, penalty: 5 });
    const acc = this.caseDef.access;
    if (acc) {
      if (acc.anastomosisX !== undefined) {
        const d = Math.abs(n.tip.x - acc.anastomosisX);
        const ok = n.role === 'venosa' ? d >= 30 : d >= 30;
        checks.push({ label: 'Distancia a la anastomosis ≥ 3 cm', ok, detail: `${(d / 10).toFixed(1)} cm`, penalty: 10 });
      }
      const inZone = n.tip.x >= acc.zone[0] && n.tip.x <= acc.zone[1];
      checks.push({ label: 'Dentro de la zona de punción recomendada', ok: inZone, detail: `${(n.tip.x / 10).toFixed(1)} cm desde la muñeca`, penalty: 5 });
      const bad = acc.avoid?.find((z) => n.tip.x >= z.x0 && n.tip.x <= z.x1);
      checks.push({ label: 'Fuera de zonas a evitar', ok: !bad, detail: bad ? bad.reason : 'Correcto', penalty: 15 });
    }
    if (inAccess && n.inVessel) {
      const fd = n.flowDirection(this.model, n.inVessel);
      if (n.role === 'venosa') checks.push({ label: 'Aguja venosa anterógrada (hacia el corazón)', ok: fd > 0, detail: fd > 0 ? 'Anterógrada' : 'Retrógrada', penalty: 10 });
      else checks.push({ label: 'Dirección de la aguja arterial', ok: null, detail: fd > 0 ? 'Anterógrada' : 'Retrógrada (aceptable según protocolo)', penalty: 0 });
    }
    const other = this.needles[1 - this.activeNeedle];
    if (other.placed && other.confirmed) {
      const d = other.tip.distanceTo(n.tip);
      checks.push({ label: 'Separación entre puntas ≥ 5 cm', ok: d >= 50, detail: `${(d / 10).toFixed(1)} cm`, penalty: 10 });
    }
    checks.push({ label: 'Sin transfixión ni punción arterial/nerviosa', ok: !n.transfixed && !n.arteryHit && !n.nerveHit, detail: [n.transfixed ? 'transfixión' : '', n.arteryHit ? 'arteria' : '', n.nerveHit ? 'nervio' : ''].filter(Boolean).join(', ') || 'Correcto', penalty: 0 });
    const graft = acc?.graft;
    if (graft) checks.push({ label: 'Sin compresor en prótesis', ok: !this.tourniquet, detail: this.tourniquet ? 'Compresor aplicado' : 'Correcto', penalty: 5 });
    else checks.push({ label: 'Compresor aplicado (FAV nativa)', ok: this.tourniquet, detail: this.tourniquet ? 'Sí' : 'No (la vena se distiende menos)', penalty: 2 });
    this.metrics.checks = checks;
    n.confirmed = true;
    const score = this.metrics.score();
    const rec: SessionRecord = {
      date: new Date().toISOString(),
      caseId: this.caseDef.id,
      caseTitle: this.caseDef.short,
      approach: this.approach === 'oop' ? 'Eje corto' : 'Eje largo',
      score,
      needle: `${n.role} ${n.gauge}G`,
      checks,
    };
    this.history.push(rec);
    try {
      localStorage.setItem('ecofav-historial', JSON.stringify(this.history.slice(-100)));
    } catch {
      /* almacenamiento no disponible */
    }
    this.toast(inAccess ? `Punción ${n.role} evaluada: ${score}/100` : 'Punción no válida: la punta no está en la luz', inAccess ? 'ok' : 'error');
    this.panels.renderMetrics();
    this.panels.showTab('metrics');
  }

  // ------------------------------------------------------------------------------------------
  // Medidas
  // ------------------------------------------------------------------------------------------
  onCaliper(c: import('../ui/monitor').Caliper) {
    void c;
    this.panels.renderMeasures();
  }

  /** Diámetro medido más reciente (mm) para el cálculo de Qa. */
  lastDiameter(): number | null {
    const cs = this.monitor.calipers.filter((c) => c.b);
    if (!cs.length) return null;
    const c = cs[cs.length - 1];
    return Math.hypot(c.b!.u - c.a.u, c.b!.w - c.a.w);
  }

  // ------------------------------------------------------------------------------------------
  // Utilidades de consulta
  // ------------------------------------------------------------------------------------------
  vesselInImage(id: string): { u: number; w: number; r: number; along: boolean } | null {
    const st = this.model.byId(id);
    if (!st) return null;
    const pose = this.sim.pose;
    const cr = this.model.planeCrossings(pose.F, pose.L, pose.B, pose.E, pose.width, this.sim.settings.depth).filter((c) => c.st === st);
    if (!cr.length) return null;
    cr.sort((a, b) => Math.abs(a.u) - Math.abs(b.u));
    const c = cr[0];
    const im = this.sim.tissueToImage(this.sim.imageToTissue(c.u, c.w));
    const { idx } = this.model.nearestSample(st, this.sim.imageToTissue(c.u, c.w));
    return { u: c.u, w: im.w, r: st.samples[idx].r * st.dyn.radiusScale, along: c.along };
  }

  collapseOf(id: string): number {
    const st = this.model.byId(id);
    if (!st) return 0;
    const v = this.vesselInImage(id);
    if (!v) return 0;
    const dloc = this.sim.pose.press - this.sim.gapAt(v.u);
    const Ploc = 7 * Math.max(dloc, 0) * Math.exp(-v.w / 14);
    const Pv = st.dyn.pressure;
    return Math.max(0, Math.min(0.94, (Ploc - Pv) / (0.6 * Pv + 8)));
  }

  lessonCtx(): LessonCtx {
    return {
      probe: this.probe,
      settings: this.sim.settings,
      pose: this.sim.pose,
      model: this.model,
      caseDef: this.caseDef,
      access: () => this.accessStruct(),
      vesselInImage: (id) => this.vesselInImage(id),
      needle: () => (this.needle.placed ? this.needle : null),
      calipers: this.monitor.calipers,
      spectral: this.spectral,
      tourniquet: this.tourniquet,
      labels: this.labels,
      collapse: (id) => this.collapseOf(id),
      events: this.lessonEvents,
      flags: this.lessonFlags,
    };
  }

  setTourniquet(on: boolean) {
    this.tourniquet = on;
    this.model.tourniquet = on;
    this.toast(on ? 'Compresor aplicado: la vena se distiende' : 'Compresor retirado', 'info');
  }

  setSide(side: 'left' | 'right') {
    const cfg = { ...this.scene.cfg, side };
    placeDefaults(cfg);
    this.scene.setRoomConfig(cfg, true);
    document.getElementById('monCase')!.textContent = `${this.caseDef.short} · ${side === 'left' ? 'MSI' : 'MSD'}`;
    this.scene.setPreset(this.mode === 'room' ? 'sala' : 'procedimiento');
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.sim.setQuality(q);
  }

  resetMachine() {
    const keep = { mode: this.sim.settings.mode, pw: this.sim.settings.pw };
    Object.assign(this.sim.settings, defaultSettings(), keep);
    this.sim.settings.depth = this.caseDef.id === 'bc_obeso' ? 35 : 25;
    this.sim.settings.focus = this.caseDef.id === 'bc_obeso' ? 16 : 8;
    void this.defaultsSettings;
  }

  toast(msg: string, kind: 'info' | 'ok' | 'warn' | 'error' = 'info') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = msg;
    this.toastsEl.appendChild(d);
    while (this.toastsEl.children.length > 5) this.toastsEl.firstChild!.remove();
    setTimeout(() => d.remove(), kind === 'error' ? 6500 : 4200);
  }

  // ------------------------------------------------------------------------------------------
  // Entrada
  // ------------------------------------------------------------------------------------------
  private bindTopbar() {
    const sel = document.getElementById('caseSelect') as HTMLSelectElement;
    for (const c of CASES) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = `${'●'.repeat(c.difficulty)}${'○'.repeat(3 - c.difficulty)}  ${c.title}`;
      sel.appendChild(o);
    }
    sel.value = this.caseDef.id;
    sel.addEventListener('change', () => {
      this.lesson = null;
      this.loadCase(sel.value);
      this.scene.setPreset(this.mode === 'room' ? 'sala' : 'procedimiento');
    });
    document.querySelectorAll<HTMLButtonElement>('#modeTabs button').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode as AppMode)));
    document.querySelectorAll<HTMLButtonElement>('#camPresets button').forEach((b) => b.addEventListener('click', () => this.scene.setPreset(b.dataset.cam as CameraPreset)));
    const side = document.getElementById('armSide') as HTMLSelectElement;
    side.addEventListener('change', () => this.setSide(side.value as 'left' | 'right'));
    const ql = document.getElementById('quality') as HTMLSelectElement;
    ql.addEventListener('change', () => this.setQuality(ql.value as Quality));
    document.getElementById('btnHelp')!.addEventListener('click', () => this.panels.showHelp());
    document.getElementById('btnReport')!.addEventListener('click', () => this.panels.showReport());
    document.getElementById('modalClose')!.addEventListener('click', () => this.panels.closeModal());
    document.getElementById('modal')!.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.panels.closeModal();
    });
    // opciones de capas 3D
    const o = this.scene.opts;
    const bindChk = (id: string, key: keyof typeof o) => {
      const c = document.getElementById(id) as HTMLInputElement;
      c.checked = o[key] as boolean;
      c.addEventListener('change', () => {
        (o[key] as boolean) = c.checked;
        this.scene.applyOptions();
      });
    };
    bindChk('optVessels', 'showVessels');
    bindChk('optNerves', 'showNerves');
    bindChk('optBones', 'showBones');
    bindChk('optTendons', 'showTendons');
    bindChk('optMuscle', 'showMuscle');
    bindChk('optFlow', 'showFlow');
    const fol = document.getElementById('optFollow') as HTMLInputElement;
    fol.addEventListener('change', () => (this.scene.follow = fol.checked));
    const skin = document.getElementById('optSkin') as HTMLInputElement;
    skin.value = String(o.skinOpacity);
    skin.addEventListener('input', () => {
      o.skinOpacity = parseFloat(skin.value);
      this.scene.applyOptions();
    });
    const plane = document.getElementById('optPlane') as HTMLSelectElement;
    plane.value = o.plane;
    plane.addEventListener('change', () => {
      o.plane = plane.value as typeof o.plane;
      this.scene.applyOptions();
    });
    const al = document.getElementById('anatLabels') as HTMLInputElement;
    al.addEventListener('change', () => (this.anatLabels = al.checked));
    document.querySelectorAll<HTMLButtonElement>('#tabButtons button').forEach((b) => b.addEventListener('click', () => this.panels.showTab(b.dataset.tab!)));
    // bucle cine
    const cs = document.getElementById('cineSlider') as HTMLInputElement;
    const showCine = (k: number) => {
      const n = this.sim.cineFrames;
      const kk = Math.max(0, Math.min(n - 1, k));
      cs.value = String(kk);
      this.sim.showCine(kk);
      document.getElementById('cineTime')!.textContent = `${this.sim.cineTime(kk).toFixed(2)} s`;
    };
    cs.addEventListener('input', () => showCine(parseInt(cs.value)));
    document.getElementById('cinePrev')!.addEventListener('click', () => showCine(parseInt(cs.value) - 1));
    document.getElementById('cineNext')!.addEventListener('click', () => showCine(parseInt(cs.value) + 1));
    this.cineStep = (d: number) => showCine(parseInt(cs.value) + d);
    // maximizar paneles
    const grid = document.getElementById('grid')!;
    const addMax = (paneId: string, cls: string) => {
      const b = document.createElement('button');
      b.className = 'maxbtn';
      b.title = 'Maximizar / restaurar panel';
      b.textContent = '⤢';
      b.addEventListener('click', () => {
        const on = !grid.classList.contains(cls);
        grid.classList.remove('max-3d', 'max-us', 'max-anat');
        if (on) grid.classList.add(cls);
      });
      document.getElementById(paneId)!.appendChild(b);
    };
    addMax('pane3d', 'max-3d');
    addMax('paneMonitor', 'max-us');
    addMax('paneAnat', 'max-anat');
    document.getElementById('mobileInfo')!.addEventListener('click', () => grid.classList.toggle('show-info'));
    const mx = new URLSearchParams(location.search).get('max');
    if (mx) grid.classList.add(`max-${mx}`);
  }

  private bindInput() {
    const isTyping = () => {
      const a = document.activeElement;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA') && (a as HTMLInputElement).type !== 'range' && (a as HTMLInputElement).type !== 'checkbox';
    };
    window.addEventListener('keydown', (e) => {
      if (isTyping()) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (e.shiftKey) this.keys.add('shift');
      const s = this.sim.settings;
      const handled = true;
      switch (k) {
        case '1':
          this.setProbeView('trans');
          break;
        case '2':
          this.setProbeView('long');
          break;
        case ' ':
          s.frozen = !s.frozen;
          e.preventDefault();
          break;
        case ',':
          if (s.frozen) this.cineStep(-1);
          break;
        case '.':
          if (s.frozen) this.cineStep(1);
          break;
        case '+':
        case '=':
          s.depth = Math.min(60, s.depth + 5);
          break;
        case '-':
          s.depth = Math.max(15, s.depth - 5);
          break;
        case ']':
          s.gain = Math.min(25, s.gain + 1);
          break;
        case '[':
          s.gain = Math.max(-25, s.gain - 1);
          break;
        case 'c':
          s.mode = s.mode === 'color' ? 'B' : 'color';
          break;
        case 'p':
          s.pw = !s.pw;
          this.spectral.enabled = s.pw;
          break;
        case 'b':
          s.mode = 'B';
          s.pw = false;
          this.spectral.enabled = false;
          break;
        case 'm':
          this.monitor.tool = this.monitor.tool === 'caliper' ? 'none' : 'caliper';
          break;
        case 'l':
          this.labels = !this.labels;
          break;
        case 'k':
          this.setTourniquet(!this.tourniquet);
          break;
        case 'i':
          s.flipLR = !s.flipLR;
          if (s.flipLR) this.lessonFlags.flipSeen = 1;
          break;
        case 'enter':
          if (this.mode === 'cannulate' || this.lesson?.lesson.mode === 'cannulate') this.confirmPuncture();
          break;
        case 'n':
          if (this.mode === 'cannulate' || this.lesson?.lesson.mode === 'cannulate') this.placeNeedleAuto();
          break;
        case 'v': {
          const order: CameraPreset[] = ['procedimiento', 'superior', 'lateral', 'corte', 'operador', 'sala'];
          const cur = (this as unknown as { _cam?: number })._cam ?? 0;
          const nx = (cur + 1) % order.length;
          (this as unknown as { _cam?: number })._cam = nx;
          this.scene.setPreset(order[nx]);
          break;
        }
        case 'h':
        case 'f1':
          this.panels.showHelp();
          break;
        case 'escape':
          this.panels.closeModal();
          this.placingNeedle = false;
          this.monitor.tool = 'none';
          break;
        default:
          if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown'].includes(k)) e.preventDefault();
          break;
      }
      void handled;
      this.consoleUpdate();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (!e.shiftKey) this.keys.delete('shift');
    });
    window.addEventListener('blur', () => this.keys.clear());

    // ratón en la vista 3D
    const v3 = document.getElementById('view3d')!;
    const ndc = (e: PointerEvent | WheelEvent) => {
      const r = v3.getBoundingClientRect();
      return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    v3.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = ndc(e);
      if (this.mode === 'room') {
        const hit = this.scene.pickObject(p, ['ecografo', 'operador']);
        if (hit) {
          this.dragRoom = hit as 'ecografo' | 'operador';
          this.scene.controls.enabled = false;
          v3.setPointerCapture(e.pointerId);
          return;
        }
      }
      if (this.placingNeedle) {
        const hit = this.scene.pickSkin(p);
        if (hit) {
          this.placeNeedleAt(hit.point);
          return;
        }
      }
      const hitProbe = this.scene.pickObject(p, ['sonda']);
      if (hitProbe) {
        this.dragProbe = true;
        this.scene.controls.enabled = false;
        v3.setPointerCapture(e.pointerId);
      }
    });
    v3.addEventListener('pointermove', (e) => {
      const p = ndc(e);
      if (this.dragProbe) {
        const hit = this.scene.pickSkin(p);
        if (hit && hit.point.x > -12) {
          const par = skinParamOf(hit.point);
          this.probe.x = par.x;
          this.probe.theta = par.theta;
        }
      } else if (this.dragRoom) {
        const f = this.scene.pickFloor(p);
        if (f) {
          const cfg = this.scene.cfg;
          if (this.dragRoom === 'ecografo') {
            cfg.cart.x = f.x;
            cfg.cart.z = f.z;
            // orientar hacia el operador
            const dx = cfg.operator.x - f.x;
            const dz = cfg.operator.z - f.z;
            cfg.cart.yaw = Math.atan2(dx, dz);
          } else {
            cfg.operator.x = f.x;
            cfg.operator.z = f.z;
            const site = this.scene.armToWorld(this.sim.pose.F);
            cfg.operator.yaw = Math.atan2(site.x - f.x, site.z - f.z);
          }
          this.scene.setRoomConfig(cfg);
        }
      }
    });
    const end = (e: PointerEvent) => {
      if (this.dragProbe || this.dragRoom) {
        this.dragProbe = false;
        this.dragRoom = null;
        this.scene.controls.enabled = true;
        try {
          v3.releasePointerCapture(e.pointerId);
        } catch {
          /* */
        }
      }
    };
    v3.addEventListener('pointerup', end);
    v3.addEventListener('pointercancel', end);
    // rueda sobre la imagen ecográfica: avanzar/retirar la aguja en modo punción
    document.getElementById('usView')!.addEventListener(
      'wheel',
      (e) => {
        if (e.shiftKey || e.altKey) return;
        if ((this.mode === 'cannulate' || this.lesson?.lesson.mode === 'cannulate') && this.needle.placed) {
          e.preventDefault();
          this.advanceNeedle(e.deltaY < 0 ? 0.5 : -0.5);
        }
      },
      { passive: false },
    );
  }

  private resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  // ------------------------------------------------------------------------------------------
  // Bucle principal
  // ------------------------------------------------------------------------------------------
  private handleKeys(dt: number) {
    const k = this.keys;
    const fine = k.has('shift') ? 0.25 : 1;
    const p = this.probe;
    const slide = 14 * dt * fine; // mm/s
    const arcDeg = (mm: number) => {
      const s = this.arm.section(p.x);
      const R = Math.sqrt((s.a + s.fat + s.skin) * (s.b + s.fat + s.skin));
      return (mm / R) * (180 / Math.PI);
    };
    if (k.has('w')) p.x += slide;
    if (k.has('s')) p.x -= slide;
    if (k.has('a')) p.theta -= arcDeg(slide) * (this.scene.cfg.side === 'left' ? 1 : -1);
    if (k.has('d')) p.theta += arcDeg(slide) * (this.scene.cfg.side === 'left' ? 1 : -1);
    if (k.has('q')) p.rot -= 40 * dt * fine;
    if (k.has('e')) p.rot += 40 * dt * fine;
    if (k.has('r')) p.tilt += 20 * dt * fine;
    if (k.has('f')) p.tilt -= 20 * dt * fine;
    if (k.has('t')) p.rock += 20 * dt * fine;
    if (k.has('g')) p.rock -= 20 * dt * fine;
    if (k.has('x')) p.press += 3 * dt * fine;
    if (k.has('z')) p.press -= 3 * dt * fine;
    const n = this.needle;
    if (n.placed && (this.mode === 'cannulate' || this.lesson?.lesson.mode === 'cannulate')) {
      if (k.has('arrowup')) this.advanceNeedle(4 * dt * fine);
      if (k.has('arrowdown')) this.advanceNeedle(-4 * dt * fine);
      if (!n.confirmed) {
        if (k.has('arrowleft')) n.heading -= 15 * dt * fine;
        if (k.has('arrowright')) n.heading += 15 * dt * fine;
        if (k.has('pageup')) n.angle = Math.min(70, n.angle + 10 * dt * fine);
        if (k.has('pagedown')) n.angle = Math.max(5, n.angle - 10 * dt * fine);
      }
    }
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.sim.settings.frozen) this.time += dt;
    const t = this.time;
    this.handleKeys(dt);
    clampProbe(this.probe);
    computePose(this.arm, this.probe, this.sim.pose);
    const probeMove = this.sim.pose.F.distanceTo(this.prevF);
    this.prevF.copy(this.sim.pose.F);

    // agujas
    const access = this.accessIds();
    const needleVis: NeedleVisual[] = [];
    const renders = [];
    let tent = null as UltrasoundSim['tent'];
    for (let i = 0; i < this.needles.length; i++) {
      const n = this.needles[i];
      if (!n.placed) {
        needleVis.push({ tip: new Vector3(), dir: new Vector3(1, 0, 0), length: n.length, gauge: n.gauge, role: n.role, flash: 0, arterialBlood: false, visible: false });
        continue;
      }
      n.computeGeometry();
      const before = this.prevDepth[i];
      n.update(this.model, t, access);
      const adv = n.depth - before;
      this.prevDepth[i] = n.depth;
      n.pathInTissue > 0 && (this.metrics.pathInTissue = this.needles.reduce((a, x) => a + x.pathInTissue, 0));
      // reflujo
      if (n.state === 'luz' && n.inVessel) {
        const rate = n.inVessel.def.kind === 'artery' ? 4 : n.inVessel.def.kind === 'vein' ? 0.8 : 2.2;
        this.needleFlash[i] = Math.min(1, this.needleFlash[i] + dt * rate);
      }
      const puls = n.inVessel && n.inVessel.def.kind !== 'vein' ? 0.85 + 0.15 * Math.sin(t * 2 * Math.PI * (this.model.hr / 60)) : 1;
      needleVis.push({ tip: n.tip.clone(), dir: n.dir.clone(), length: n.length, gauge: n.gauge, role: n.role, flash: this.needleFlash[i] * puls, arterialBlood: n.flashArterial, visible: true });
      renders.push({ back: n.backPoint(), tip: n.tip.clone(), radius: n.radius, active: n.depth > -1 });
      if (n.tentStruct && n.tentAmount > 0) tent = { tip: n.tip.clone(), dir: n.dir.clone(), amount: n.tentAmount, structIndex: n.tentStruct.index };
      // métricas de visibilidad de la punta (sólo aguja activa)
      if (i === this.activeNeedle && n.depth > 0) {
        const im = this.sim.tissueToImage(n.tip);
        const W = this.sim.pose.width;
        const inImg = Math.abs(im.u) < W / 2 && im.w > 0 && im.w < this.sim.settings.depth;
        const half = this.sim.sliceThickness(Math.max(0, im.w)) / 2;
        const tipVisible = inImg && Math.abs(im.e) < half;
        const entryIm = this.sim.tissueToImage(n.entry);
        const crosses = Math.sign(entryIm.e) !== Math.sign(im.e) && Math.abs(im.e) > half + 0.8;
        this.metrics.frame(t, Math.max(0, adv), tipVisible, crosses, probeMove, this.accessStruct() ? this.collapseOf(this.accessStruct()!.def.id) : 0);
        this.monitor.flags.tipMarker = { u: im.u, w: im.w, visible: tipVisible, inPlane: Math.abs(im.e) < 3 };
        // trayectoria prevista (línea recta de la aguja más allá de la punta)
        const guide: { u: number; w: number; e: number }[] = [];
        for (let k = 0; k <= 30; k++) {
          const p = n.entry.clone().addScaledVector(n.dir, (k / 30) * (n.length + 6));
          const g = this.sim.tissueToImage(p);
          guide.push({ u: g.u, w: g.w, e: g.e });
        }
        this.monitor.flags.guide = guide;
      }
    }
    if (!this.needle.placed) {
      this.monitor.flags.tipMarker = null;
      if (this.needle.placed === false) this.monitor.flags.guide = null;
    }
    // guía también antes de insertar (aguja colocada sobre la piel)
    if (this.needle.placed && this.needle.depth <= 0) {
      const n = this.needle;
      const guide: { u: number; w: number; e: number }[] = [];
      for (let k = 0; k <= 30; k++) {
        const g = this.sim.tissueToImage(n.entry.clone().addScaledVector(n.dir, (k / 30) * (n.length + 6)));
        guide.push({ u: g.u, w: g.w, e: g.e });
      }
      this.monitor.flags.guide = guide;
    }
    this.sim.needles = renders;
    this.sim.tent = tent;

    // hematomas
    for (const h of this.hematomas) {
      const r = 0.8 + (h.rmax - 0.8) * (1 - Math.exp(-(t - h.t0) / 6));
      this.model.setUniformRadius(h.st, r);
      const mesh = this.scene.anat.meshes.get(h.st);
      if (mesh) {
        const s = r / 0.8;
        mesh.scale.setScalar(s);
        mesh.position.copy(h.center).multiplyScalar(1 - s);
      }
    }

    // simulación
    this.sim.render(t);
    this.spectral.enabled = this.sim.settings.pw;
    this.spectral.update(t);

    // escena
    this.scene.updateProbe(this.sim.pose, this.sim.settings.depth);
    this.scene.updateNeedles(needleVis);
    this.scene.update(dt, this.sim.pose, this.sim.settings.depth);
    this.scene.room.cart.setImageAspect(this.sim.settings.depth / this.sim.pose.width);

    // render de vistas
    const r = this.renderer;
    r.setScissorTest(false);
    r.setRenderTarget(null);
    r.setViewport(0, 0, window.innerWidth, window.innerHeight);
    r.setClearColor(new Color('#0b1117'), 1);
    r.clear();
    const v3 = elementRect(document.getElementById('view3d')!, this.canvas);
    if (v3) this.scene.render(v3);
    this.monitor.render(r, this.canvas);
    const av = document.getElementById('anatView')!;
    const ar = elementRect(av, this.canvas);
    if (ar) this.renderAnatomy(ar, av);
    r.setScissorTest(false);

    // superposiciones
    this.monitor.flags.labels = this.labels;
    this.monitor.flags.aids = this.aids;
    this.monitor.updateOverlay(t);
    this.monitor.drawSpectral();
    this.uiTimer += dt;
    if (this.uiTimer > 0.2) {
      this.uiTimer = 0;
      this.updateHud();
      this.consoleUpdate();
      this.panels.tick();
    }
    this.lessonTimer += dt;
    if (this.lessonTimer > 0.25) {
      this.lessonTimer = 0;
      this.checkLesson();
    }
    this.frameCount++;
    if (this.frameCount < this.maxFrames) requestAnimationFrame(() => this.frame());
  }

  /** depuración: número máximo de fotogramas (?frames=N) */
  maxFrames = Infinity;
  cineStep: (d: number) => void = () => {};
  private wasFrozen = false;
  frameCount = 0;

  private anatLayout = { x: 0, y: 0, w: 1, h: 1 };

  private renderAnatomy(rect: { x: number; y: number; w: number; h: number }, el: HTMLElement) {
    const W = this.sim.pose.width;
    const D = this.sim.settings.depth;
    const s = Math.min((el.clientWidth - 16) / W, (el.clientHeight - 16) / D);
    const w = W * s;
    const h = D * s;
    const img = { x: (el.clientWidth - w) / 2, y: (el.clientHeight - h) / 2, w, h };
    this.anatLayout = img;
    this.anatView.background.set('#0e151c');
    this.anatView.render(this.renderer, rect, img, this.sim.anatomyTexture, this.sim.settings.flipLR);
    // etiquetas
    const svg = document.getElementById('anatSvg')!;
    if (this.uiTimer > 0.19 || !svg.childElementCount) {
      const parts: string[] = [];
      if (this.anatLabels) {
        const pose = this.sim.pose;
        const cr = this.model.planeCrossings(pose.F, pose.L, pose.B, pose.E, W, D);
        const used: [number, number][] = [];
        for (const c of cr) {
          const name = c.st.def.short ?? c.st.def.name;
          if (!name) continue;
          const im = this.sim.tissueToImage(this.sim.imageToTissue(c.u, c.w));
          let fx = (c.u + W / 2) / W;
          if (this.sim.settings.flipLR) fx = 1 - fx;
          const px = img.x + fx * w;
          let py = img.y + (Math.max(0.5, Math.min(D - 0.5, im.w)) / D) * h;
          for (const [ux, uy] of used) if (Math.abs(ux - px) < 70 && Math.abs(uy - py) < 12) py += 13;
          used.push([px, py]);
          parts.push(`<g class="lbl ${c.st.def.kind}"><circle cx="${px}" cy="${py}" r="2"/><text x="${px + 5}" y="${py - 4}">${name}</text></g>`);
        }
      }
      svg.setAttribute('viewBox', `0 0 ${el.clientWidth} ${el.clientHeight}`);
      svg.innerHTML = parts.join('');
    }
  }

  private updateHud() {
    const p = this.probe;
    const s = this.sim.settings;
    const rotN = ((p.rot % 180) + 180) % 180;
    const view = rotN < 25 || rotN > 155 ? 'transversal (eje corto)' : rotN > 65 && rotN < 115 ? 'longitudinal (eje largo)' : 'oblicua';
    const acc = this.caseDef.access;
    const distAn = acc?.anastomosisX !== undefined ? `\nA la anastomosis: <b>${(Math.abs(p.x - acc.anastomosisX) / 10).toFixed(1)} cm</b>` : '';
    document.getElementById('probeHud')!.innerHTML =
      `Sonda: <b>${view}</b>\n` +
      `Posición: ${(p.x / 10).toFixed(1)} cm desde la muñeca${distAn}\n` +
      `Rotación ${p.rot.toFixed(0)}° · Inclinación ${p.tilt.toFixed(0)}° · Balanceo ${p.rock.toFixed(0)}°\n` +
      `Presión ${p.press.toFixed(1)} mm${this.tourniquet ? ' · <b>compresor</b>' : ''}` +
      (s.frozen ? '\n<b>IMAGEN CONGELADA</b>' : '');
    const n = this.needle;
    const nh = document.getElementById('needleHud')!;
    if (!nh.classList.contains('hidden')) {
      if (!n.placed) nh.innerHTML = `Aguja <b>${n.role}</b> ${n.gauge}G\nSin colocar · pulsa <b>N</b> o "Colocar"`;
      else {
        const im = this.sim.tissueToImage(n.tip);
        nh.innerHTML =
          `Aguja <b>${n.role}</b> ${n.gauge}G · ${n.length} mm\n` +
          `Ángulo ${n.angle.toFixed(0)}° · rumbo ${n.heading.toFixed(0)}°\n` +
          `Insertada ${Math.max(0, n.depth).toFixed(1)} mm\n` +
          `Estado: <b>${n.state}</b>${n.inVessel ? ' (' + (n.inVessel.def.short ?? n.inVessel.def.name) + ')' : ''}\n` +
          `Punta: ${im.w.toFixed(1)} mm prof · ${Math.abs(im.e).toFixed(1)} mm del plano`;
      }
    }
    // barra de cine visible al congelar
    const fr = this.sim.settings.frozen;
    if (fr !== this.wasFrozen) {
      this.wasFrozen = fr;
      const bar = document.getElementById('cineBar')!;
      bar.classList.toggle('hidden', !fr);
      if (fr) {
        const cs = document.getElementById('cineSlider') as HTMLInputElement;
        cs.max = String(Math.max(0, this.sim.cineFrames - 1));
        cs.value = cs.max;
        document.getElementById('cineTime')!.textContent = '0.00 s';
      }
    }
    const clk = document.getElementById('monClock')!;
    const d = new Date();
    clk.textContent = `${d.toLocaleDateString('es-ES')} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    if (this.mode === 'room' || this.panels.currentTab === 'ergo') this.ergo = evaluateErgonomics(this.scene, this.sim);
    // PW: medidas
    if (s.pw) {
      const m = this.spectral.measures();
      const dmm = this.lastDiameter();
      const area = dmm ? Math.PI * (dmm / 20) ** 2 : null;
      const qa = area && m.valid ? m.tamv * area * 60 : null;
      this.monitor.setSpecMeasures(
        m.valid
          ? `<span>VPS <b>${m.psv.toFixed(0)}</b> cm/s</span><span>VFD <b>${m.edv.toFixed(0)}</b></span><span>IR <b>${m.ri.toFixed(2)}</b></span><span>IP <b>${m.pi.toFixed(2)}</b></span><span>TAMV <b>${m.tamv.toFixed(0)}</b></span>` +
              (qa !== null ? `<span>Ø ${dmm!.toFixed(1)} mm → Q <b>${qa.toFixed(0)}</b> mL/min</span>` : '<span class="muted">Mide el diámetro para calcular el flujo</span>')
          : '<span class="muted">Coloca el volumen de muestra dentro de un vaso</span>',
      );
    } else this.monitor.setSpecMeasures('');
  }

  private checkLesson() {
    const L = this.lesson;
    if (!L) return;
    const step = L.lesson.steps[L.step];
    if (!step) return;
    if (step.check && !L.done[L.step]) {
      try {
        if (step.check(this.lessonCtx())) {
          L.done[L.step] = true;
          this.toast('✓ Paso completado', 'ok');
          setTimeout(() => {
            if (this.lesson === L && L.step < L.lesson.steps.length - 1) {
              L.step++;
              this.panels.renderLessons();
            } else this.panels.renderLessons();
          }, 900);
          this.panels.renderLessons();
        }
      } catch {
        /* comprobación no aplicable */
      }
    }
  }

  get softLift() {
    return SOFT_LIFT;
  }
}

function isMobile() {
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}
