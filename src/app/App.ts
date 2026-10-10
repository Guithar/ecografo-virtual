/**
 * Aplicación principal: orquesta el modelo anatómico, el simulador ecográfico, la escena 3D, la
 * interacción (sonda, aguja, sala) y el entrenamiento (métricas, lecciones, ergonomía).
 */
import { Color, Matrix4, TOUCH, Vector2, Vector3, WebGLRenderer } from 'three';
import { ArmShape } from '../anatomy/armShape';
import { CaseDef, CASES, caseById } from '../anatomy/cases';
import { AnatomyModel, Structure } from '../anatomy/model';
import { Needle, NeedleEvent, NeedleRole, roleLabel, stateLabel } from '../interaction/needle';
import { clampProbe, computePose, defaultProbeState, ProbeState, skinParamAbove, skinParamOf } from '../interaction/probePose';
import { SceneManager, CameraPreset, defaultRoomConfig, placeDefaults, NeedleVisual } from '../scene/SceneManager';
import { DopplerAudio, SpectralDoppler } from '../sim/spectral';
import { FLUSH_INJECT_S, FlushState, flushParams, innerDiameter, JET_LEN_MM, jetVelocity } from '../sim/flush';
import { GAUGES } from '../scene/instruments';
import { defaultSettings, MachineSettings, Quality, SOFT_LIFT, UltrasoundSim } from '../sim/UltrasoundSim';
import type { ChecklistState } from '../training/checklist';
import { evaluateErgonomics, ErgoResult } from '../training/ergonomics';
import { LESSONS, Lesson, LessonCtx } from '../training/lessons';
import { FinalCheck, Metrics } from '../training/metrics';
import { elementRect, ImageView } from '../ui/imageView';
import { Monitor } from '../ui/monitor';
import { buildConsole } from '../ui/console';
import { deviceText, isLowPower } from '../ui/device';
import { FloatingView } from '../ui/floating';
import { FocusMode } from '../ui/focus';
import { MobileUI } from '../ui/mobile';
import { Panels } from '../ui/panels';
import { LOCALE, tr } from '../i18n';

export type AppMode = 'explore' | 'cannulate' | 'room' | 'learn';

const CLEAR_COLOR = new Color('#0b1117');

/** Primera letra en mayúscula (textos en inglés que empiezan por el nombre de la aguja). */
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Matriz que escala una malla alrededor de un centro: uniforme (colección esférica) o sólo
 * perpendicular a un eje (colección alargada que crece en grosor, no en longitud).
 */
function scaleAbout(center: Vector3, s: number, axis: Vector3 | null, out: Matrix4): Matrix4 {
  if (!axis) out.makeScale(s, s, s);
  else {
    const t = axis;
    const k = 1 - s;
    out.set(s + k * t.x * t.x, k * t.x * t.y, k * t.x * t.z, 0, k * t.y * t.x, s + k * t.y * t.y, k * t.y * t.z, 0, k * t.z * t.x, k * t.z * t.y, s + k * t.z * t.z, 0, 0, 0, 0, 1);
  }
  const sc = center.clone().applyMatrix4(out);
  return out.setPosition(center.x - sc.x, center.y - sc.y, center.z - sc.z);
}

/** Colección que crece en el tejido: hematoma (sangre extravasada) o infiltración de suero. */
interface Hematoma {
  st: Structure;
  t0: number;
  /** radio inicial y final (mm) */
  r0: number;
  rmax: number;
  center: Vector3;
  /** constante de tiempo del crecimiento (s) */
  tau: number;
  /** eje de una colección alargada (crece sólo en grosor); null = esférica */
  axis?: Vector3 | null;
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
  /** preparación aséptica: piel desinfectada, funda y gel estériles */
  asepsis = false;
  /** interfaz básica (solo los controles de la punción) o avanzada (todos) */
  uiLevel: 'basico' | 'avanzado' = 'basico';
  needles: Needle[] = [new Needle('arterial'), new Needle('venosa')];
  activeNeedle = 0;
  approach: 'oop' | 'ip' = 'oop';
  metrics = new Metrics();
  aids = true;
  labels = false;
  anatLabels = true;
  hematomas: Hematoma[] = [];
  /** lavado con suero en curso (aguja activa al pulsar) */
  flush: (FlushState & { flowDir: Vector3; needle: number }) | null = null;
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
  /** móvil o tableta: menos resolución, sin sombras ni sala y 30 fps */
  readonly lowPower = isLowPower();
  /** interfaz móvil activa (la gestiona MobileUI) */
  touchUI = false;
  mobile: MobileUI | null = null;
  /** modo enfoque de escritorio */
  focus: FocusMode | null = null;
  /** ventana flotante (móvil en vertical y modo enfoque) */
  pip!: FloatingView;
  private lastDraw = 0;

  constructor() {
    this.canvas = document.getElementById('gl') as HTMLCanvasElement;
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: !this.lowPower, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lowPower ? 1.5 : 2));
    // tamaño CSS explícito: en el móvil 100vh no coincide con la zona visible cuando aparecen las barras del navegador
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;
    this.toastsEl = document.getElementById('toasts')!;
    try {
      this.history = JSON.parse(localStorage.getItem('ecofav-historial') ?? '[]');
    } catch {
      this.history = [];
    }
    try {
      if (localStorage.getItem('ecofav-nivel') === 'avanzado') this.uiLevel = 'avanzado';
    } catch {
      /* sin almacenamiento: interfaz básica */
    }
  }

  async init() {
    const q = new URLSearchParams(location.search);
    if (q.has('frames')) this.maxFrames = parseInt(q.get('frames')!);
    this.quality = (q.get('calidad') as Quality) || (this.lowPower ? 'baja' : 'media');
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
    this.scene = new SceneManager(this.renderer, this.sim.displayTexture, this.sim.anatomyTexture, document.getElementById('view3d')!, this.lowPower);
    this.scene.setRoomConfig(defaultRoomConfig('left'), true);
    this.panels = new Panels(this);
    this.consoleUpdate = buildConsole(this, document.getElementById('console')!);
    this.pip = new FloatingView(this);
    this.focus = new FocusMode(this);
    this.mobile = new MobileUI(this);
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
    // ?leccion=<id>: abre esa lección guiada (enlaces desde las guías); sin bienvenida, que la taparía
    const lessonId = q.get('leccion');
    if (lessonId && LESSONS.some((l) => l.id === lessonId)) {
      this.setMode('learn');
      this.startLesson(lessonId);
    } else if (!q.has('frames') && !q.has('max')) this.panels.showWelcome();
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
    this.asepsis = false;
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
    diff.textContent = ['', tr('Básico', 'Basic'), tr('Intermedio', 'Intermediate'), tr('Avanzado', 'Advanced')][cd.difficulty];
    document.getElementById('monCase')!.textContent = `${cd.short} · ${this.scene.cfg.side === 'left' ? tr('MSI', 'L arm') : tr('MSD', 'R arm')}`;
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
    this.flush = null;
    this.sim.flush = null;
  }

  setMode(m: AppMode) {
    // la sala y la ergonomía sólo están en la versión de escritorio
    if (m === 'room' && this.touchUI) m = 'explore';
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
    document.getElementById('needleHud')!.classList.toggle('hidden', !this.needleMode());
    this.consoleUpdate();
    this.focus?.refresh();
    this.mobile?.update();
  }

  /** Línea de estado bajo la imagen cuando el 3D no está a la vista: la sonda al explorar y la aguja al puncionar. */
  statusLine(): string {
    if (this.needleMode()) {
      const n = this.needle;
      if (!n.placed)
        return this.dt(
          tr(
            `Aguja ${roleLabel(n.role)} ${n.gauge}G sin colocar: {{pulsa N para colocarla|pulsa «Fuera de plano» o «En plano»}}`,
            `${cap(roleLabel(n.role))} needle ${n.gauge}G not placed: {{press N to place it|tap "Out-of-plane" or "In-plane"}}`,
          ),
        );
      const where = n.inVessel ? ` (${n.inVessel.def.short ?? n.inVessel.def.name})` : '';
      return `${tr(`Aguja ${roleLabel(n.role)}`, `${cap(roleLabel(n.role))} needle`)} ${n.gauge}G · ${n.angle.toFixed(0)}° · ${Math.max(0, n.depth).toFixed(1)} mm · ${stateLabel(n.state)}${where}${n.confirmed ? tr(' · evaluada', ' · evaluated') : ''}`;
    }
    const p = this.probe;
    const rotN = ((p.rot % 180) + 180) % 180;
    const view = rotN < 25 || rotN > 155 ? tr('transversal', 'short axis') : rotN > 65 && rotN < 115 ? tr('longitudinal', 'long axis') : tr('oblicua', 'oblique');
    return (
      tr(`Sonda ${view} · ${(p.x / 10).toFixed(1)} cm de la muñeca · presión ${p.press.toFixed(1)} mm`, `Probe: ${view} · ${(p.x / 10).toFixed(1)} cm from wrist · pressure ${p.press.toFixed(1)} mm`) +
      (this.tourniquet ? tr(' · compresor', ' · tourniquet') : '')
    );
  }

  /** Los avisos van en la vista grande (en el móvil, sobre toda la pantalla). */
  placeToasts() {
    const target = this.touchUI ? document.body : document.getElementById(this.focus?.on && this.focus.main === 'us' ? 'paneMonitor' : 'pane3d')!;
    if (this.toastsEl.parentElement !== target) target.appendChild(this.toastsEl);
  }

  /** Texto según el dispositivo (ver `deviceText`). */
  dt(s: string): string {
    return deviceText(s, this.touchUI);
  }

  /** La aguja está disponible: modo Punción o lección de punción en curso. */
  needleMode(): boolean {
    return this.mode === 'cannulate' || (this.mode === 'learn' && this.lesson?.lesson.mode === 'cannulate');
  }

  /**
   * Pasa al modo Punción si hace falta para usar la aguja (la N funciona desde cualquier modo).
   * Dentro de una lección que no es de punción no cambia de modo, para no perder la lección, y avisa.
   */
  ensureNeedleMode(): boolean {
    if (this.needleMode()) return true;
    if (this.mode === 'learn' && this.lesson) {
      this.toast(tr('Esta lección no usa la aguja. Para puncionar, pasa al modo Punción.', 'This lesson does not use the needle. To cannulate, switch to Cannulation mode.'), 'warn');
      return false;
    }
    this.setMode('cannulate');
    this.toast(tr('Modo Punción activado', 'Cannulation mode on'), 'info');
    return true;
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
      // el sentido del vaso es indiferente para orientar la sonda: reducir a [−90°, 90°]
      base = ((((-ang + 90) % 180) + 180) % 180) - 90;
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
    const par = skinParamAbove(this.arm, c);
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

  /**
   * Abordaje que corresponde a la vista actual: con la sonda en longitudinal sobre el acceso, en plano;
   * en transversal, fuera de plano. Sin el acceso en la imagen, el último usado.
   */
  viewApproach(): 'oop' | 'ip' {
    const a = this.accessStruct();
    const v = a ? this.vesselInImage(a.def.id) : null;
    return v ? (v.along ? 'ip' : 'oop') : this.approach;
  }

  /** Coloca la aguja activa junto a la sonda según el abordaje (fuera de plano / en plano). */
  placeNeedleAuto(approach: 'oop' | 'ip' = this.viewApproach()) {
    this.approach = approach;
    const n = this.needle;
    if (n.placed && n.depth > 0) {
      this.toast(tr('Retira primero la aguja actual', 'Withdraw the current needle first'), 'warn');
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
    const ap = approach === 'oop' ? tr('transversal (fuera de plano)', 'short-axis (out-of-plane)') : tr('longitudinal (en plano)', 'long-axis (in-plane)');
    this.toast(tr(`Aguja ${roleLabel(n.role)} (${n.gauge}G): abordaje ${ap}, ${Math.round(angle)}°`, `${cap(roleLabel(n.role))} needle (${n.gauge}G): ${ap} approach, ${Math.round(angle)}°`), 'info');
    this.remindAsepsis();
    this.panels.renderMetrics();
  }

  private remindAsepsis() {
    if (!this.asepsis)
      this.toast(
        tr('Sin asepsia: desinfecta la piel y pon funda y gel estériles antes de puncionar (botón Asepsia)', 'No asepsis: disinfect the skin and use a sterile probe cover and gel before cannulating (Asepsis button)'),
        'warn',
      );
  }

  setAsepsis(on: boolean) {
    this.asepsis = on;
    this.toast(on ? tr('Asepsia: piel desinfectada, funda estéril en la sonda y gel estéril', 'Asepsis: skin disinfected, sterile probe cover and sterile gel') : tr('Asepsia retirada', 'Asepsis off'), on ? 'ok' : 'info');
  }

  setUiLevel(level: 'basico' | 'avanzado') {
    this.uiLevel = level;
    document.body.classList.toggle('basic', level === 'basico');
    this.consoleUpdate();
    try {
      localStorage.setItem('ecofav-nivel', level);
    } catch {
      /* sin almacenamiento */
    }
  }

  placeNeedleAt(p: Vector3) {
    const n = this.needle;
    if (n.placed && n.depth > 0) {
      this.toast(tr('Retira primero la aguja actual', 'Withdraw the current needle first'), 'warn');
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
    this.toast(
      this.dt(tr('Aguja colocada en la piel. {{Avanza con ↑ o la rueda del ratón.|Avanza con «Avance» en la rueda de ajuste.}}', 'Needle placed on the skin. {{Advance with ↑ or the mouse wheel.|Advance with "Advance" on the adjustment dial.}}')),
      'info',
    );
    this.remindAsepsis();
  }

  withdrawNeedle() {
    const n = this.needle;
    if (!n.placed) return;
    n.depth = -3;
    n.update(this.model, this.time, this.accessIds());
    n.placed = false;
    this.needleFlash[this.activeNeedle] = 0;
    this.toast(tr('Aguja retirada', 'Needle withdrawn'), 'info');
  }

  advanceNeedle(mm: number) {
    const n = this.needle;
    if (!n.placed) {
      this.toast(
        this.dt(tr('Primero coloca la aguja {{(tecla N o botones de abordaje de la consola)|(«Fuera de plano» o «En plano»)}}', 'Place the needle first {{(N key or the approach buttons on the console)|("Out-of-plane" or "In-plane")}}')),
        'warn',
      );
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
      name: tr('Hematoma (extravasación)', 'Hematoma (extravasation)'),
      short: 'Hematoma',
      kind: 'hematoma',
      group: 'hematoma',
      pts: [{ x: c.x, y: c.y, z: c.z, r: 0.8 }],
    });
    this.hematomas.push({ st, t0: this.time, r0: 0.8, rmax, center: c, tau: 6 });
    this.scene.rebuildAnatomy();
  }

  /**
   * Lava la aguja activa con 10 mL de suero para comprobar la posición de la punta.
   * En la luz: fluye sin resistencia (penacho de microburbujas y chorro en Doppler color).
   * Fuera de la luz: infiltración (colección anecoica que crece alrededor de la punta).
   */
  flushNeedle() {
    const n = this.needle;
    if (!n.placed || n.depth <= 0) {
      this.toast(this.dt(tr('Primero introduce la aguja; después lava con suero {{(J)|(«Suero»)}} para comprobar la posición', 'Insert the needle first, then flush with saline {{(J)|("Saline")}} to check its position')), 'warn');
      return;
    }
    if (this.flush && this.time - this.flush.t0 < FLUSH_INJECT_S) return;
    const ev = (type: NeedleEvent['type'], msg: string, severity: NeedleEvent['severity'], struct?: string) =>
      this.onNeedleEvent(n, { t: this.time, type, msg, severity, struct });
    if (n.state === 'luz' && n.inVessel) {
      const st = n.inVessel;
      const smp = st.samples[this.model.nearestSample(st, n.tip).idx];
      const r = smp.r * st.dyn.radiusScale;
      const q = Math.abs(st.dyn.qNow);
      const od = GAUGES[n.gauge]?.od ?? 1.8;
      this.flush = {
        t0: this.time,
        sidx: st.index,
        vmean: (q * 1000) / (Math.PI * r * r),
        qVessel: q,
        jetVel: jetVelocity(innerDiameter(od)),
        flowDir: smp.t.clone().multiplyScalar(st.dyn.qNow >= 0 ? 1 : -1),
        needle: this.activeNeedle,
      };
      const name = st.def.short ?? st.def.name;
      ev(
        'flush',
        tr(`Lavado con suero: entra sin resistencia y las microburbujas recorren la luz (${name}): punta intraluminal`, `Saline flush: flows without resistance and microbubbles travel along the lumen (${name}): tip intraluminal`),
        'ok',
        st.def.id,
      );
    } else {
      this.addInfiltration(n);
      ev('infiltration', tr('Infiltración: el suero se acumula en el tejido y no en la luz. Detén el lavado y recoloca la aguja.', 'Infiltration: saline is pooling in the tissue, not in the lumen. Stop the flush and reposition the needle.'), 'error');
    }
  }

  /**
   * Suero extravasado. Junto a un vaso no puede entrar en la luz: diseca el plano perivascular y forma
   * un halo anecoico alrededor del vaso a lo largo de un tramo (manguito coaxial que crece desde la
   * pared; el vaso, con más prioridad, tapa la parte interior). Lejos de un vaso, colección esférica.
   */
  private addInfiltration(n: Needle) {
    if (this.hematomas.length >= 4) return;
    const tip = n.tip.clone();
    const near = n.tentStruct ?? n.punctures[n.punctures.length - 1]?.st ?? this.accessStruct() ?? null;
    let a = tip.clone();
    let b = tip.clone();
    let center = tip.clone();
    let axis: Vector3 | null = null;
    let r0 = 0.8;
    let rmax = 4;
    if (near && near.isVessel) {
      const smp = near.samples[this.model.nearestSample(near, tip).idx];
      const rel = tip.clone().sub(smp.p);
      const dist = rel.addScaledVector(smp.t, -rel.dot(smp.t)).length();
      const rv = smp.r * near.dyn.radiusScale + smp.w;
      if (dist < rv + 6) {
        r0 = rv + 0.2;
        rmax = rv + 3.2;
        center = smp.p.clone();
        axis = smp.t.clone().normalize();
        a = center.clone().addScaledVector(axis, -6);
        b = center.clone().addScaledVector(axis, 6);
      }
    }
    const st = this.model.addStructure({
      id: `infiltrado_${Date.now()}`,
      name: tr('Infiltración de suero', 'Saline infiltration'),
      short: tr('Suero', 'Saline'),
      kind: 'infiltrado',
      group: 'hematoma',
      pts: axis ? [{ x: a.x, y: a.y, z: a.z, r: r0 }, { x: b.x, y: b.y, z: b.z, r: r0 }] : [{ x: a.x, y: a.y, z: a.z, r: r0 }],
    });
    this.hematomas.push({ st, t0: this.time, r0, rmax, center, tau: 1.2, axis });
    this.scene.rebuildAnatomy();
  }

  /** Evalúa la punción actual con los criterios de las guías. */
  confirmPuncture() {
    const n = this.needle;
    if (!n.placed || n.depth <= 0) {
      this.toast(tr('No hay aguja insertada', 'No needle inserted'), 'warn');
      return;
    }
    if (n.confirmed) {
      this.toast(tr('Esta punción ya está evaluada. Retira la aguja para repetir.', 'This cannulation has already been evaluated. Withdraw the needle to repeat it.'), 'info');
      return;
    }
    const checks: FinalCheck[] = [];
    const access = this.accessIds();
    const inAccess = n.state === 'luz' && !!n.inVessel && access.has(n.inVessel.def.id);
    const OK = tr('Correcto', 'OK');
    const YES = tr('Sí', 'Yes');
    checks.push({
      label: tr('Punta en la luz del acceso vascular', 'Tip in the lumen of the vascular access'),
      ok: inAccess,
      detail: inAccess ? tr(`En ${n.inVessel!.def.name}`, `In ${n.inVessel!.def.name}`) : tr('Estado: ', 'Status: ') + `${stateLabel(n.state)}${n.inVessel ? tr(' en ', ' in ') + n.inVessel.def.name : ''}`,
      penalty: 35,
    });
    const len = n.intraluminalLength(this.model);
    checks.push({ label: tr('Recorrido intraluminal ≥ 5 mm', 'Intraluminal path ≥ 5 mm'), ok: inAccess ? len >= 5 : null, detail: `${len.toFixed(1)} mm`, penalty: 8 });
    // cada criterio se decide sobre el valor redondeado que se muestra (nunca «25°» con ✗ en «≤ 25°»)
    const cen = n.centering(this.model);
    const cenPct = cen === null ? null : Math.round(cen * 100);
    checks.push({ label: tr('Punta centrada en la luz', 'Tip centered in the lumen'), ok: cenPct === null ? null : cenPct < 65, detail: cenPct === null ? '—' : tr(`${cenPct} % del radio desde el eje`, `${cenPct}% of the radius off-axis`), penalty: 5 });
    const av = n.angleToVessel(this.model);
    const avR = av === null ? null : Math.round(av * 10) / 10;
    checks.push({ label: tr('Aguja alineada con el vaso (≤ 25° tras bajar el ángulo)', 'Needle aligned with the vessel (≤ 25° after lowering the angle)'), ok: avR === null ? null : avR <= 25, detail: avR === null ? '—' : `${avR.toFixed(1)}°`, penalty: 5 });
    const acc = this.caseDef.access;
    if (acc) {
      if (acc.anastomosisX !== undefined) {
        const d = Math.round(Math.abs(n.tip.x - acc.anastomosisX));
        checks.push({ label: tr('Distancia a la anastomosis ≥ 3 cm', 'Distance from the anastomosis ≥ 3 cm'), ok: d >= 30, detail: `${(d / 10).toFixed(1)} cm`, penalty: 10 });
      }
      const inZone = n.tip.x >= acc.zone[0] && n.tip.x <= acc.zone[1];
      checks.push({ label: tr('Dentro de la zona de punción recomendada', 'Within the recommended cannulation zone'), ok: inZone, detail: tr(`${(n.tip.x / 10).toFixed(1)} cm desde la muñeca`, `${(n.tip.x / 10).toFixed(1)} cm from the wrist`), penalty: 5 });
      const bad = acc.avoid?.find((z) => n.tip.x >= z.x0 && n.tip.x <= z.x1);
      checks.push({ label: tr('Fuera de zonas a evitar', 'Outside zones to avoid'), ok: !bad, detail: bad ? bad.reason : OK, penalty: 15 });
    }
    if (inAccess && n.inVessel) {
      const fd = n.flowDirection(this.model, n.inVessel);
      if (n.role === 'venosa')
        checks.push({ label: tr('Aguja venosa anterógrada (hacia el corazón)', 'Venous needle antegrade (toward the heart)'), ok: fd > 0, detail: fd > 0 ? tr('Anterógrada', 'Antegrade') : tr('Retrógrada', 'Retrograde'), penalty: 10 });
      else
        checks.push({
          label: tr('Dirección de la aguja arterial', 'Arterial needle direction'),
          ok: null,
          detail: fd > 0 ? tr('Anterógrada', 'Antegrade') : tr('Retrógrada (aceptable según protocolo)', 'Retrograde (acceptable per protocol)'),
          penalty: 0,
        });
    }
    const other = this.needles[1 - this.activeNeedle];
    if (other.placed && other.confirmed) {
      const d = Math.round(other.tip.distanceTo(n.tip));
      checks.push({ label: tr('Separación entre puntas ≥ 5 cm', 'Tip-to-tip distance ≥ 5 cm'), ok: d >= 50, detail: `${(d / 10).toFixed(1)} cm`, penalty: 10 });
    }
    checks.push({
      label: tr('Sin transfixión ni punción arterial/nerviosa', 'No transfixion, arterial or nerve puncture'),
      ok: !n.transfixed && !n.arteryHit && !n.nerveHit,
      detail: [n.transfixed ? tr('transfixión', 'transfixion') : '', n.arteryHit ? tr('arteria', 'artery') : '', n.nerveHit ? tr('nervio', 'nerve') : ''].filter(Boolean).join(', ') || OK,
      penalty: 0,
    });
    checks.push({ label: tr('Técnica aséptica (piel desinfectada, funda y gel estériles)', 'Aseptic technique (skin disinfected, sterile cover and gel)'), ok: this.asepsis, detail: this.asepsis ? YES : 'No', penalty: 5 });
    const graft = acc?.graft;
    if (graft) checks.push({ label: tr('Sin compresor en prótesis', 'No tourniquet on a graft'), ok: !this.tourniquet, detail: this.tourniquet ? tr('Compresor aplicado', 'Tourniquet applied') : OK, penalty: 5 });
    else checks.push({ label: tr('Compresor aplicado (FAV nativa)', 'Tourniquet applied (native AVF)'), ok: this.tourniquet, detail: this.tourniquet ? YES : tr('No (la vena se distiende menos)', 'No (the vein distends less)'), penalty: 2 });
    this.metrics.checks = checks;
    n.confirmed = true;
    const score = this.metrics.score();
    const rec: SessionRecord = {
      date: new Date().toISOString(),
      caseId: this.caseDef.id,
      caseTitle: this.caseDef.short,
      approach: this.approach === 'oop' ? tr('Transversal (fuera de plano)', 'Short-axis (out-of-plane)') : tr('Longitudinal (en plano)', 'Long-axis (in-plane)'),
      score,
      needle: `${roleLabel(n.role)} ${n.gauge}G`,
      checks,
    };
    this.history.push(rec);
    try {
      localStorage.setItem('ecofav-historial', JSON.stringify(this.history.slice(-100)));
    } catch {
      /* almacenamiento no disponible */
    }
    this.toast(
      inAccess
        ? tr(`Punción ${roleLabel(n.role)} evaluada: ${score}/100`, `${cap(roleLabel(n.role))} cannulation evaluated: ${score}/100`)
        : tr('Punción no válida: la punta no está en la luz', 'Invalid cannulation: the tip is not in the lumen'),
      inAccess ? 'ok' : 'error',
    );
    this.panels.renderMetrics();
    this.panels.showTab('metrics');
    this.focus?.onEvaluated();
    this.mobile?.onEvaluated();
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
    const cr = this.model.planeCrossings(pose.F, pose.L, pose.B, pose.E, pose.width, this.sim.settings.depth + pose.press, true).filter((c) => c.st === st);
    if (!cr.length) return null;
    cr.sort((a, b) => Math.abs(a.u) - Math.abs(b.u));
    const c = cr[0];
    const im = this.sim.planeToImage(c.u, c.w);
    const p = pose.F.clone().addScaledVector(pose.L, c.u).addScaledVector(pose.B, c.w);
    const { idx } = this.model.nearestSample(st, p);
    return { u: im.u, w: im.w, r: st.samples[idx].r * st.dyn.radiusScale, along: c.along };
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
      asepsis: this.asepsis,
      labels: this.labels,
      collapse: (id) => this.collapseOf(id),
      events: this.lessonEvents,
      flags: this.lessonFlags,
    };
  }

  /** Estado para la lista de pasos de la punción. */
  checklistState(): ChecklistState {
    const n = this.needle;
    const other = this.needles[1 - this.activeNeedle];
    const cfg = this.scene.cfg;
    return {
      armAngle: 90 - cfg.armYaw,
      armPitch: cfg.armPitch,
      measures: this.monitor.calipers.filter((c) => c.b).length,
      probeX: this.probe.x,
      access: this.caseDef.access,
      otherTipX: other.placed && other.confirmed ? other.tip.x : null,
      tourniquet: this.tourniquet,
      asepsis: this.asepsis,
      placed: n.placed,
      flashed: n.firstFlashTime >= 0,
      inLumen: n.state === 'luz',
      angleToVessel: n.placed ? n.angleToVessel(this.model) : null,
      flushes: this.metrics.flushes,
      confirmed: n.confirmed,
    };
  }

  setTourniquet(on: boolean) {
    this.tourniquet = on;
    this.model.tourniquet = on;
    this.toast(on ? tr('Compresor aplicado: la vena se distiende', 'Tourniquet applied: the vein distends') : tr('Compresor retirado', 'Tourniquet released'), 'info');
  }

  setSide(side: 'left' | 'right') {
    const cfg = { ...this.scene.cfg, side };
    placeDefaults(cfg);
    this.scene.setRoomConfig(cfg, true);
    document.getElementById('monCase')!.textContent = `${this.caseDef.short} · ${side === 'left' ? tr('MSI', 'L arm') : tr('MSD', 'R arm')}`;
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
    this.setUiLevel(this.uiLevel);
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
      b.title = tr('Maximizar / restaurar panel', 'Maximize / restore panel');
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
    // los desplegables de la barra superior y de las capas sueltan el foco tras elegir
    for (const s of document.querySelectorAll<HTMLSelectElement>('#topbar select, #pane3d select')) s.addEventListener('change', () => s.blur());
  }

  private bindInput() {
    const isTyping = () => {
      const a = document.activeElement;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA') && (a as HTMLInputElement).type !== 'range' && (a as HTMLInputElement).type !== 'checkbox';
    };
    // teclas que pueden repetirse al mantenerlas pulsadas; el resto son conmutadores (una vez por pulsación)
    const repeatable = new Set(['+', '=', '-', '[', ']', ',', '.']);
    const held = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 't', 'g', 'z', 'x', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown']);
    window.addEventListener('keydown', (e) => {
      if (isTyping()) return;
      // no interferir con atajos del navegador o del sistema (Ctrl+C, Cmd+R…)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      // un deslizador con el foco (navegación con Tab) usa las flechas: no mover además sonda o aguja
      const act = document.activeElement as HTMLInputElement | null;
      if (act?.tagName === 'INPUT' && act.type === 'range' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown', 'home', 'end'].includes(k)) return;
      if (held.has(k)) this.keys.add(k);
      if (e.shiftKey) this.keys.add('shift');
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown', ' '].includes(k)) e.preventDefault();
      if (e.repeat && !repeatable.has(k)) return;
      const s = this.sim.settings;
      switch (k) {
        case '1':
          this.setProbeView('trans');
          break;
        case '2':
          this.setProbeView('long');
          break;
        case ' ':
          s.frozen = !s.frozen;
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
          if (this.needleMode()) this.confirmPuncture();
          break;
        case 'n':
          if (this.ensureNeedleMode()) this.placeNeedleAuto();
          break;
        case 'j':
          this.flushNeedle();
          break;
        case 'v': {
          const order: CameraPreset[] = ['procedimiento', 'superior', 'lateral', 'corte', 'operador', 'sala'];
          const cur = (this as unknown as { _cam?: number })._cam ?? 0;
          const nx = (cur + 1) % order.length;
          (this as unknown as { _cam?: number })._cam = nx;
          this.scene.setPreset(order[nx]);
          break;
        }
        case 'o':
          this.focus?.toggle();
          break;
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
          break;
      }
      this.consoleUpdate();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (!e.shiftKey) this.keys.delete('shift');
    });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => this.keys.clear());
    // un botón pulsado con el ratón suelta el foco: si no, Intro o Espacio (confirmar, congelar)
    // también lo volverían a «pulsar» (p. ej. recentrar la sonda o abrir el informe).
    // Con el teclado (pointerType vacío) se conserva el foco para la navegación accesible.
    document.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement | null)?.closest?.('button');
      if (b && (e as PointerEvent).pointerType) b.blur();
    });
    // lo mismo con los deslizadores movidos con el ratón: las flechas vuelven a la sonda y la aguja
    document.addEventListener('pointerup', (e) => {
      const r = (e.target as HTMLElement | null)?.closest?.('input[type=range]') as HTMLInputElement | null;
      if (r) setTimeout(() => r.blur(), 0);
    });

    // ratón en la vista 3D
    const v3 = document.getElementById('view3d')!;
    const ndc = (e: PointerEvent | WheelEvent) => {
      const r = v3.getBoundingClientRect();
      return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const moveProbeTo = (p: Vector3) => {
      const par = skinParamOf(p);
      this.probe.x = par.x;
      this.probe.theta = par.theta;
    };
    // táctil: un dedo sobre el brazo lleva la sonda a ese punto y la arrastra; fuera del brazo gira la cámara;
    // con dos dedos se acerca y se gira. Se decide en la fase de captura, antes de que actúe OrbitControls.
    const touchIds = new Set<number>();
    let touchProbe = false;
    document.getElementById('pane3d')!.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'mouse' || e.target !== v3) return;
        touchIds.add(e.pointerId);
        const ctl = this.scene.controls;
        if (touchIds.size > 1) {
          // segundo dedo: cámara
          touchProbe = false;
          this.dragProbe = false;
          return;
        }
        ctl.touches.ONE = TOUCH.ROTATE;
        if (this.mode === 'room' || this.placingNeedle) return;
        const hit = this.scene.pickSkin(ndc(e));
        if (hit && hit.point.x > -12) {
          ctl.touches.ONE = null;
          touchProbe = true;
          moveProbeTo(hit.point);
        }
      },
      { capture: true },
    );
    const touchEnd = (e: PointerEvent) => {
      if (!touchIds.delete(e.pointerId) || touchIds.size) return;
      touchProbe = false;
      this.scene.controls.touches.ONE = TOUCH.ROTATE;
    };
    window.addEventListener('pointerup', touchEnd);
    window.addEventListener('pointercancel', touchEnd);
    v3.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = ndc(e);
      if (e.pointerType !== 'mouse' && this.mode !== 'room' && !this.placingNeedle) {
        if (touchProbe) this.dragProbe = true;
        return;
      }
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
        if (hit && hit.point.x > -12) moveProbeTo(hit.point);
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
        if (this.needleMode() && this.needle.placed) {
          e.preventDefault();
          this.advanceNeedle(e.deltaY < 0 ? 0.5 : -0.5);
        }
      },
      { passive: false },
    );
  }

  private resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.pip?.update();
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
    if (n.placed && this.needleMode()) {
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
    // móviles: 30 fps (la mitad de GPU y batería); el lienzo conserva el último fotograma dibujado
    if (this.lowPower && this.quality !== 'alta' && now - this.lastDraw < 1000 / 30 - 3) {
      requestAnimationFrame(() => this.frame());
      return;
    }
    this.lastDraw = now;
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
        // en plano, la punta aún bajo el extremo de la sonda (fuera del campo, del lado de la entrada):
        // no se puede ver con ninguna técnica, así que ese avance no cuenta para el % de punta visible
        const beforeField = Math.abs(im.e) < half && Math.abs(im.u) >= W / 2 && Math.sign(im.u) === Math.sign(entryIm.u);
        this.metrics.frame(t, Math.max(0, adv), beforeField ? null : tipVisible, crosses, probeMove, this.accessCollapse);
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
      this.monitor.flags.tipMarker = null;
      const guide: { u: number; w: number; e: number }[] = [];
      for (let k = 0; k <= 30; k++) {
        const g = this.sim.tissueToImage(n.entry.clone().addScaledVector(n.dir, (k / 30) * (n.length + 6)));
        guide.push({ u: g.u, w: g.w, e: g.e });
      }
      this.monitor.flags.guide = guide;
    }
    this.sim.needles = renders;
    this.sim.tent = tent;

    // lavado con suero: penacho y chorro desde la punta de la aguja que lo inyecta
    const fl = this.flush;
    const nf = fl ? this.needles[fl.needle] : null;
    const fp = fl ? flushParams(fl, t) : null;
    if (fl && nf && nf.placed && fp && fp.active) {
      this.sim.flush = { tip: nf.tip.clone(), dir: nf.dir.clone(), flowDir: fl.flowDir, sidx: fl.sidx, intensity: fp.intensity, tail: fp.tail, front: fp.front, jet: fp.jet, jetVel: fl.jetVel, jetLen: JET_LEN_MM };
    } else {
      this.flush = null;
      this.sim.flush = null;
    }

    // hematomas
    for (const h of this.hematomas) {
      const r = h.r0 + (h.rmax - h.r0) * (1 - Math.exp(-(t - h.t0) / h.tau));
      this.model.setUniformRadius(h.st, r);
      const mesh = this.scene.anat.meshes.get(h.st);
      if (mesh) {
        const s = r / ((mesh.userData.baseR as number) || 0.8);
        scaleAbout(h.center, s, h.axis ?? null, mesh.matrix);
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldNeedsUpdate = true;
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
    r.setClearColor(CLEAR_COLOR, 1);
    r.clear();
    const v3 = elementRect(document.getElementById('view3d')!, this.canvas);
    // la vista flotante se dibuja la última, encima de la grande
    if (this.pip.top() === '3d') {
      this.monitor.render(r, this.canvas);
      if (v3) this.scene.render(v3);
    } else {
      if (v3) this.scene.render(v3);
      this.monitor.render(r, this.canvas);
    }
    const av = document.getElementById('anatView')!;
    const ar = elementRect(av, this.canvas);
    if (ar) this.renderAnatomy(ar, av);
    r.setScissorTest(false);

    // superposiciones
    this.monitor.flags.labels = this.labels;
    this.monitor.flags.aids = this.aids;
    this.monitor.updateOverlay();
    this.monitor.drawSpectral();
    this.uiTimer += dt;
    if (this.uiTimer > 0.2) {
      this.uiTimer = 0;
      // colapso del vaso de acceso (métricas): recalculado a 5 Hz, no en cada fotograma
      const acc = this.accessStruct();
      this.accessCollapse = acc ? this.collapseOf(acc.def.id) : 0;
      this.updateHud();
      this.consoleUpdate();
      this.panels.tick();
      this.pip.update();
      this.focus?.update();
      this.mobile?.update();
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
  private anatLabelTime = 0;
  private accessCollapse = 0;

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
    const now = performance.now();
    if (now - this.anatLabelTime > 200 || !svg.childElementCount) {
      this.anatLabelTime = now;
      const parts: string[] = [];
      if (this.anatLabels) {
        const pose = this.sim.pose;
        const cr = this.model.planeCrossings(pose.F, pose.L, pose.B, pose.E, W, D + pose.press);
        const used: [number, number][] = [];
        for (const c of cr) {
          const name = c.st.def.short ?? c.st.def.name;
          if (!name) continue;
          const im = this.sim.planeToImage(c.u, c.w);
          let fx = (im.u + W / 2) / W;
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
    const view = rotN < 25 || rotN > 155 ? tr('transversal (eje corto)', 'short axis (transverse)') : rotN > 65 && rotN < 115 ? tr('longitudinal (eje largo)', 'long axis (longitudinal)') : tr('oblicua', 'oblique');
    const acc = this.caseDef.access;
    const distAn = acc?.anastomosisX !== undefined ? tr('\nA la anastomosis: ', '\nTo anastomosis: ') + `<b>${(Math.abs(p.x - acc.anastomosisX) / 10).toFixed(1)} cm</b>` : '';
    document.getElementById('probeHud')!.innerHTML =
      tr(`Sonda: <b>${view}</b>\n`, `Probe: <b>${view}</b>\n`) +
      tr(`Posición: ${(p.x / 10).toFixed(1)} cm desde la muñeca`, `Position: ${(p.x / 10).toFixed(1)} cm from the wrist`) +
      `${distAn}\n` +
      tr(`Rotación ${p.rot.toFixed(0)}° · Inclinación ${p.tilt.toFixed(0)}° · Balanceo ${p.rock.toFixed(0)}°\n`, `Rotation ${p.rot.toFixed(0)}° · Tilt ${p.tilt.toFixed(0)}° · Rock ${p.rock.toFixed(0)}°\n`) +
      tr(`Presión ${p.press.toFixed(1)} mm`, `Pressure ${p.press.toFixed(1)} mm`) +
      `${this.tourniquet ? tr(' · <b>compresor</b>', ' · <b>tourniquet</b>') : ''}${this.asepsis ? tr(' · <b>asepsia</b>', ' · <b>asepsis</b>') : ''}` +
      (s.frozen ? tr('\n<b>IMAGEN CONGELADA</b>', '\n<b>IMAGE FROZEN</b>') : '');
    const n = this.needle;
    const nh = document.getElementById('needleHud')!;
    if (!nh.classList.contains('hidden')) {
      const role = roleLabel(n.role);
      if (!n.placed) nh.innerHTML = tr(`Aguja <b>${role}</b> ${n.gauge}G\nSin colocar · pulsa <b>N</b> o "Colocar"`, `<b>${cap(role)}</b> needle ${n.gauge}G\nNot placed · press <b>N</b> or "Place"`);
      else {
        const im = this.sim.tissueToImage(n.tip);
        nh.innerHTML =
          tr(`Aguja <b>${role}</b> ${n.gauge}G · ${n.length} mm\n`, `<b>${cap(role)}</b> needle ${n.gauge}G · ${n.length} mm\n`) +
          tr(`Ángulo ${n.angle.toFixed(0)}° · rumbo ${n.heading.toFixed(0)}°\n`, `Angle ${n.angle.toFixed(0)}° · heading ${n.heading.toFixed(0)}°\n`) +
          tr(`Insertada ${Math.max(0, n.depth).toFixed(1)} mm\n`, `Inserted ${Math.max(0, n.depth).toFixed(1)} mm\n`) +
          tr('Estado: ', 'Status: ') +
          `<b>${stateLabel(n.state)}</b>${n.inVessel ? ' (' + (n.inVessel.def.short ?? n.inVessel.def.name) + ')' : ''}\n` +
          tr(`Punta: ${im.w.toFixed(1)} mm prof · ${Math.abs(im.e).toFixed(1)} mm del plano`, `Tip: ${im.w.toFixed(1)} mm deep · ${Math.abs(im.e).toFixed(1)} mm from plane`);
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
    clk.textContent = `${d.toLocaleDateString(LOCALE)} ${d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`;
    if (this.mode === 'room' || this.panels.currentTab === 'ergo') this.ergo = evaluateErgonomics(this.scene, this.sim);
    // PW: medidas
    if (s.pw) {
      const m = this.spectral.measures();
      const dmm = this.lastDiameter();
      const area = dmm ? Math.PI * (dmm / 20) ** 2 : null;
      const qa = area && m.valid ? m.tamv * area * 60 : null;
      this.monitor.setSpecMeasures(
        m.valid
          ? `<span>${tr('VPS', 'PSV')} <b>${m.psv.toFixed(0)}</b> cm/s</span><span>${tr('VFD', 'EDV')} <b>${m.edv.toFixed(0)}</b></span><span>${tr('IR', 'RI')} <b>${m.ri.toFixed(2)}</b></span><span>${tr('IP', 'PI')} <b>${m.pi.toFixed(2)}</b></span><span>TAMV <b>${m.tamv.toFixed(0)}</b></span>` +
              (qa !== null
                ? `<span>Ø ${dmm!.toFixed(1)} mm → Q <b>${qa.toFixed(0)}</b> mL/min</span>`
                : tr('<span class="muted">Mide el diámetro para calcular el flujo</span>', '<span class="muted">Measure the diameter to calculate flow</span>'))
          : tr('<span class="muted">Coloca el volumen de muestra dentro de un vaso</span>', '<span class="muted">Place the sample volume inside a vessel</span>'),
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
          this.toast(tr('✓ Paso completado', '✓ Step completed'), 'ok');
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
