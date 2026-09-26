/**
 * Escena 3D: sala, paciente, brazo con anatomía interna, sonda, agujas y plano de exploración.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AnatomyModel } from '../anatomy/model';
import { buildSkinGeometry, fasciaTube } from './armMesh';
import { AnatomyMeshes, buildAnatomyMeshes, FlowParticles } from './anatomyMeshes';
import { buildNeedle, buildProbe, NeedleMesh, ProbeMesh } from './instruments';
import { armBoard, armMatrix, armPlacement, ArmPlacement, buildRoom, Room, skinMaterial, SKIN_TONES } from './room';
import type { ProbePose } from '../sim/UltrasoundSim';

export interface ViewOptions {
  skinOpacity: number;
  vesselOpacity: number;
  showMuscle: boolean;
  showVessels: boolean;
  showNerves: boolean;
  showBones: boolean;
  showTendons: boolean;
  showFlow: boolean;
  plane: 'us' | 'anat' | 'none';
  planeOpacity: number;
  showRoom: boolean;
}

export function defaultViewOptions(): ViewOptions {
  return {
    skinOpacity: 0.55,
    vesselOpacity: 1,
    showMuscle: false,
    showVessels: true,
    showNerves: true,
    showBones: true,
    showTendons: true,
    showFlow: false,
    plane: 'us',
    planeOpacity: 0.92,
    showRoom: true,
  };
}

export type CameraPreset = 'procedimiento' | 'superior' | 'lateral' | 'corte' | 'operador' | 'sala' | 'mano';

export interface NeedleVisual {
  tip: Vector3;
  dir: Vector3; // dirección de avance (hacia la punta)
  length: number; // longitud de la cánula
  gauge: number;
  role: 'arterial' | 'venosa';
  flash: number;
  arterialBlood: boolean;
  visible: boolean;
}

export interface RoomConfig {
  side: 'left' | 'right';
  armYaw: number;
  armPitch: number;
  armRoll: number;
  tone: string;
  cart: { x: number; z: number; yaw: number; monitorYaw: number; monitorPitch: number; monitorHeight: number };
  operator: { x: number; z: number; yaw: number; seated: boolean };
}

export function defaultRoomConfig(side: 'left' | 'right' = 'left'): RoomConfig {
  const cfg: RoomConfig = {
    side,
    armYaw: 32,
    armPitch: 17,
    armRoll: 0,
    tone: 'III',
    cart: { x: 0, z: 0, yaw: 0, monitorYaw: 0, monitorPitch: -0.12, monitorHeight: 0 },
    operator: { x: 0, z: 0, yaw: 0, seated: true },
  };
  placeDefaults(cfg);
  return cfg;
}

/** Colocación recomendada: operador distal a la mano mirando hacia el hombro; pantalla al otro lado, en línea. */
export function placeDefaults(cfg: RoomConfig) {
  const pl = armPlacement(cfg.side, cfg.armYaw, cfg.armPitch);
  const wrist = pl.shoulder.clone().addScaledVector(pl.dir, 0.578);
  const hd = new Vector3(pl.dir.x, 0, pl.dir.z).normalize();
  const mid = pl.shoulder.clone().addScaledVector(pl.dir, 0.46); // antebrazo medio
  const op = wrist.clone().addScaledVector(hd, 0.42);
  cfg.operator.x = op.x;
  cfg.operator.z = op.z;
  cfg.operator.yaw = Math.atan2(-hd.x, -hd.z);
  // pantalla: más allá del sitio de punción, en la línea de visión, desplazada hacia fuera del cuerpo
  const lateral = new Vector3(-hd.z, 0, hd.x).multiplyScalar(cfg.side === 'left' ? -1 : 1);
  const scr = mid.clone().addScaledVector(hd, -0.62).addScaledVector(lateral, 0.12);
  cfg.cart.x = scr.x;
  cfg.cart.z = scr.z;
  const toOp = new Vector3(op.x - scr.x, 0, op.z - scr.z).normalize();
  cfg.cart.yaw = Math.atan2(toOp.x, toOp.z);
  cfg.cart.monitorYaw = 0;
}

export class SceneManager {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 0.01, 50);
  readonly opCamera = new PerspectiveCamera(60, 1, 0.02, 30);
  controls: OrbitControls;
  useOperatorCam = false;
  readonly armRoot = new Group();
  readonly armGroup = new Group();
  room!: Room;
  skin!: Mesh;
  skinMat: MeshPhysicalMaterial;
  fascia!: Mesh;
  anat!: AnatomyMeshes;
  flow!: FlowParticles;
  probe: ProbeMesh;
  needles: NeedleMesh[] = [];
  needleVis: NeedleVisual[] = [];
  scanPlane: Mesh;
  scanPlaneMat: MeshBasicMaterial;
  scanOutline: LineSegments;
  board: Group;
  opts: ViewOptions = defaultViewOptions();
  cfg: RoomConfig = defaultRoomConfig();
  place: ArmPlacement = armPlacement('left');
  private raycaster = new Raycaster();
  private model!: AnatomyModel;
  armMatrix = new Matrix4();
  armMatrixInv = new Matrix4();

  constructor(
    readonly renderer: WebGLRenderer,
    readonly displayTex: Texture,
    readonly anatomyTex: Texture,
    domForControls: HTMLElement,
  ) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = SRGBColorSpace;
    const pmrem = new PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.background = new Color('#cfd8dd');
    this.scene.fog = new Fog('#cfd8dd', 6, 14);
    this.scene.environmentIntensity = 0.55;

    const hemi = new HemisphereLight('#f4f8ff', '#8a8f86', 0.55);
    this.scene.add(hemi);
    this.scene.add(new AmbientLight('#ffffff', 0.08));
    const sun = new DirectionalLight('#fffaf0', 1.6);
    sun.position.set(1.4, 3.2, 1.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -1.6;
    sun.shadow.camera.right = 1.6;
    sun.shadow.camera.top = 1.6;
    sun.shadow.camera.bottom = -1.6;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 7;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    // lámpara de exploración sobre el brazo
    const spot = new SpotLight('#fff6e8', 14, 3.5, 0.5, 0.6, 1.4);
    spot.position.set(0.7, 2.1, 0.7);
    spot.target.position.set(0.45, 0.8, 0.3);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0003;
    this.scene.add(spot, spot.target);

    this.controls = new OrbitControls(this.camera, domForControls);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.03;
    this.controls.maxDistance = 6;
    this.controls.zoomSpeed = 1.1;

    this.skinMat = skinMaterial('III');
    this.skinMat.transparent = true;

    this.armRoot.add(this.armGroup);
    this.armRoot.matrixAutoUpdate = false;
    this.scene.add(this.armRoot);

    this.probe = buildProbe(38);
    this.armGroup.add(this.probe.group);

    this.scanPlaneMat = new MeshBasicMaterial({ map: displayTex, side: DoubleSide, transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false });
    this.scanPlane = new Mesh(new PlaneGeometry(1, 1), this.scanPlaneMat);
    this.scanPlane.renderOrder = 10;
    this.armGroup.add(this.scanPlane);
    this.scanOutline = new LineSegments(new EdgesGeometry(new PlaneGeometry(1, 1)), new LineBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.9 }));
    this.armGroup.add(this.scanOutline);
    this.board = armBoard();
    this.armGroup.add(this.board);

    this.room = buildRoom(displayTex, 'left', this.place, 'III');
    this.scene.add(this.room.group);
  }

  /** Reconstruye brazo y anatomía para un modelo (caso) nuevo. */
  setModel(model: AnatomyModel) {
    this.model = model;
    if (this.skin) {
      this.armGroup.remove(this.skin);
      this.skin.geometry.dispose();
    }
    const skinGeo = buildSkinGeometry(model.arm, 2.0);
    this.skin = new Mesh(skinGeo, this.skinMat);
    this.skin.name = 'piel';
    this.skin.castShadow = true;
    this.skin.receiveShadow = true;
    this.skin.renderOrder = 20;
    this.armGroup.add(this.skin);
    if (this.fascia) {
      this.armGroup.remove(this.fascia);
      this.fascia.geometry.dispose();
    }
    this.fascia = new Mesh(
      fasciaTube(model.arm),
      new MeshPhysicalMaterial({ color: '#b04a42', roughness: 0.55, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide, sheen: 0.5, sheenColor: new Color('#ff9a8a') }),
    );
    this.fascia.renderOrder = 15;
    this.armGroup.add(this.fascia);
    this.rebuildAnatomy();
    this.applyOptions();
  }

  rebuildAnatomy() {
    const model = this.model;
    if (this.anat) {
      this.armGroup.remove(this.anat.group);
      this.anat.group.traverse((o) => (o as Mesh).geometry?.dispose());
    }
    this.anat = buildAnatomyMeshes(model);
    this.armGroup.add(this.anat.group);
    if (this.flow) {
      this.armGroup.remove(this.flow.points);
      this.flow.dispose();
    }
    this.flow = new FlowParticles(model);
    this.armGroup.add(this.flow.points);
    this.applyOptions();
  }

  setRoomConfig(cfg: RoomConfig, rebuildPatient = false) {
    const sideChanged = cfg.side !== this.cfg.side || cfg.tone !== this.cfg.tone;
    this.cfg = cfg;
    this.place = armPlacement(cfg.side, cfg.armYaw, cfg.armPitch);
    this.armMatrix = armMatrix(cfg.side, this.place, cfg.armRoll);
    this.armRoot.matrix.copy(this.armMatrix);
    this.armRoot.matrixWorldNeedsUpdate = true;
    this.armRoot.updateMatrixWorld(true);
    this.armMatrixInv.copy(this.armMatrix).invert();
    if (rebuildPatient || sideChanged) this.room.rebuildPatient(cfg.side, this.place, cfg.tone);
    this.skinMat.color.set(SKIN_TONES[cfg.tone] ?? SKIN_TONES.III);
    const c = this.room.cart;
    c.group.position.set(cfg.cart.x, 0, cfg.cart.z);
    c.group.rotation.y = cfg.cart.yaw;
    c.monitor.parent!.rotation.y = cfg.cart.monitorYaw;
    c.monitor.rotation.x = cfg.cart.monitorPitch;
    c.monitor.parent!.position.y = 1.02 + cfg.cart.monitorHeight;
    const o = this.room.operator;
    o.group.position.set(cfg.operator.x, 0, cfg.operator.z);
    o.group.rotation.y = cfg.operator.yaw;
    o.setSeated(cfg.operator.seated);
  }

  applyOptions() {
    const o = this.opts;
    if (this.skin) {
      this.skinMat.opacity = o.skinOpacity;
      this.skinMat.transparent = o.skinOpacity < 0.999;
      this.skinMat.depthWrite = o.skinOpacity > 0.6;
      this.skin.visible = o.skinOpacity > 0.01;
    }
    if (this.fascia) this.fascia.visible = o.showMuscle;
    if (this.anat) {
      const bg = this.anat.byGroup;
      const vis = (g: string, v: boolean) => bg[g]?.forEach((m) => (m.visible = v));
      vis('arteria', o.showVessels);
      vis('vena', o.showVessels);
      vis('fav', o.showVessels);
      vis('hematoma', o.showVessels);
      vis('nervio', o.showNerves);
      vis('hueso', o.showBones);
      vis('tendon', o.showTendons);
      for (const m of this.anat.vesselMaterials) {
        m.opacity = o.vesselOpacity;
        m.transparent = o.vesselOpacity < 0.999;
        m.depthWrite = o.vesselOpacity > 0.6;
      }
    }
    if (this.flow) this.flow.points.visible = o.showFlow;
    this.scanPlane.visible = o.plane !== 'none';
    this.scanOutline.visible = o.plane !== 'none';
    this.scanPlaneMat.map = o.plane === 'anat' ? this.anatomyTex : this.displayTex;
    this.scanPlaneMat.opacity = o.planeOpacity;
    this.scanPlaneMat.needsUpdate = true;
    for (const name of ['sillon', 'monitor-hd']) {
      const obj = this.room.group.getObjectByName(name);
      if (obj) obj.visible = o.showRoom;
    }
  }

  /** Coloca la sonda y el plano de imagen según la pose. */
  updateProbe(pose: ProbePose, depth: number) {
    const L = pose.L;
    const Bv = pose.B;
    const X = L.clone();
    const Y = Bv.clone().negate();
    const Z = new Vector3().crossVectors(X, Y);
    const m = new Matrix4().makeBasis(X, Y, Z);
    const pos = pose.F.clone().addScaledVector(Bv, pose.press);
    m.setPosition(pos);
    this.probe.group.matrixAutoUpdate = false;
    this.probe.group.matrix.copy(m);
    this.probe.group.matrixWorldNeedsUpdate = true;
    // plano de imagen
    const W = pose.width;
    const pm = new Matrix4().makeBasis(L.clone().multiplyScalar(W), Bv.clone().multiplyScalar(depth), new Vector3().crossVectors(L, Bv));
    const c = pose.F.clone().addScaledVector(Bv, pose.press + depth / 2);
    pm.setPosition(c);
    this.scanPlane.matrixAutoUpdate = false;
    this.scanPlane.matrix.copy(pm);
    this.scanPlane.matrixWorldNeedsUpdate = true;
    this.scanOutline.matrixAutoUpdate = false;
    this.scanOutline.matrix.copy(pm);
    this.scanOutline.matrixWorldNeedsUpdate = true;
  }

  /** Actualiza las mallas de las agujas. */
  updateNeedles(list: NeedleVisual[]) {
    while (this.needles.length < list.length) {
      const nv = list[this.needles.length];
      const nm = buildNeedle(nv.gauge, 25, nv.role);
      this.needles.push(nm);
      this.armGroup.add(nm.group);
    }
    this.needleVis = list;
    for (let i = 0; i < this.needles.length; i++) {
      const nm = this.needles[i];
      const nv = list[i];
      if (!nv || !nv.visible) {
        nm.group.visible = false;
        continue;
      }
      nm.group.visible = true;
      nm.setLength(nv.length);
      const back = nv.dir.clone().negate();
      // eje local Z → hacia el cono; Y → "arriba" (normal cutánea aproximada)
      const up = new Vector3(0, nv.tip.y, nv.tip.z).normalize();
      const Xa = new Vector3().crossVectors(up, back).normalize();
      if (Xa.lengthSq() < 1e-6) Xa.set(1, 0, 0);
      const Ya = new Vector3().crossVectors(back, Xa).normalize();
      const m = new Matrix4().makeBasis(Xa, Ya, back);
      m.setPosition(nv.tip);
      nm.group.matrixAutoUpdate = false;
      nm.group.matrix.copy(m);
      nm.group.matrixWorldNeedsUpdate = true;
      nm.setFlash(nv.flash, nv.arterialBlood);
    }
  }

  /** Reemplaza una aguja (cambio de calibre o rol). */
  resetNeedles() {
    for (const n of this.needles) this.armGroup.remove(n.group);
    this.needles = [];
  }

  /** Mundo → coordenadas del brazo (mm). */
  worldToArm(p: Vector3, out = new Vector3()) {
    return out.copy(p).applyMatrix4(this.armMatrixInv);
  }
  armToWorld(p: Vector3, out = new Vector3()) {
    return out.copy(p).applyMatrix4(this.armMatrix);
  }
  dirArmToWorld(d: Vector3, out = new Vector3()) {
    const o = this.armToWorld(new Vector3(0, 0, 0));
    return this.armToWorld(d, out).sub(o).normalize();
  }

  /** Rayo desde la vista: intersección con la piel en coordenadas del brazo. */
  pickSkin(ndc: Vector2, cam = this.activeCamera()): { point: Vector3; world: Vector3 } | null {
    if (!this.skin) return null;
    this.raycaster.setFromCamera(ndc, cam);
    const hits = this.raycaster.intersectObject(this.skin, false);
    if (!hits.length) return null;
    const w = hits[0].point.clone();
    return { world: w, point: this.worldToArm(w) };
  }

  pickFloor(ndc: Vector2): Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.activeCamera());
    const r = this.raycaster.ray;
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = -r.origin.y / r.direction.y;
    if (t < 0) return null;
    return r.origin.clone().addScaledVector(r.direction, t);
  }

  pickObject(ndc: Vector2, names: string[]): string | null {
    this.raycaster.setFromCamera(ndc, this.activeCamera());
    const objs = names.map((n) => this.scene.getObjectByName(n)).filter(Boolean) as Group[];
    const hits = this.raycaster.intersectObjects(objs, true);
    if (!hits.length) return null;
    let o: { name: string; parent: unknown } | null = hits[0].object as unknown as { name: string; parent: unknown };
    while (o) {
      if (names.includes(o.name)) return o.name;
      o = o.parent as typeof o;
    }
    return null;
  }

  activeCamera(): PerspectiveCamera {
    return this.useOperatorCam ? this.opCamera : this.camera;
  }

  /** Punto de interés (mundo) = sonda */
  probeWorld(out = new Vector3()) {
    return this.probe.group.getWorldPosition(out);
  }

  setPreset(p: CameraPreset) {
    this.useOperatorCam = p === 'operador';
    const target = this.probeWorld();
    const cam = this.camera;
    const armX = this.dirArmToWorld(new Vector3(1, 0, 0));
    const armY = this.dirArmToWorld(new Vector3(0, 1, 0));
    const armZ = this.dirArmToWorld(new Vector3(0, 0, 1));
    const set = (pos: Vector3, tgt: Vector3) => {
      cam.position.copy(pos);
      this.controls.target.copy(tgt);
      cam.lookAt(tgt);
      this.controls.update();
    };
    switch (p) {
      case 'procedimiento':
        set(target.clone().addScaledVector(armY, 0.3).addScaledVector(armX, -0.3).addScaledVector(armZ, this.cfg.side === 'left' ? -0.16 : 0.16), target.clone().addScaledVector(armY, -0.02));
        break;
      case 'superior':
        set(target.clone().addScaledVector(armY, 0.45).addScaledVector(armX, -0.02), target);
        break;
      case 'lateral':
        set(target.clone().addScaledVector(armZ, 0.36 * (this.cfg.side === 'left' ? 1 : -1)).addScaledVector(armY, 0.08), target);
        break;
      case 'corte': {
        // perpendicular al plano de imagen
        const E = this.dirArmToWorld(this.probeE);
        const c = this.armToWorld(this.planeCenter);
        set(c.clone().addScaledVector(E, 0.14).addScaledVector(armY, 0.02), c);
        break;
      }
      case 'mano':
        set(target.clone().addScaledVector(armY, 0.1).addScaledVector(armX, -0.12).addScaledVector(armZ, -0.1), target);
        break;
      case 'sala':
        set(new Vector3(this.cfg.side === 'left' ? 0.2 : -0.2, 2.25, 2.7), new Vector3(this.cfg.side === 'left' ? 0.35 : -0.35, 0.7, 0.25));
        break;
      default:
        break;
    }
  }

  probeE = new Vector3(1, 0, 0);
  planeCenter = new Vector3();

  /** Actualiza objetos dependientes (manos del operador, cámara del operador...). */
  update(dt: number, pose: ProbePose, depth: number) {
    this.probeE.copy(pose.E);
    this.planeCenter.copy(pose.F).addScaledVector(pose.B, pose.press + depth / 2);
    if (this.flow?.points.visible) this.flow.update(dt);
    const probeHandle = this.armToWorld(pose.F.clone().addScaledVector(pose.B, -70));
    let needleHand: Vector3 | null = null;
    const nv = this.needleVis.find((n) => n.visible);
    if (nv) needleHand = this.armToWorld(nv.tip.clone().addScaledVector(nv.dir, -(nv.length + 12)));
    const op = this.room.operator;
    // el operador sólo se muestra en vistas generales (en primeros planos taparía la sonda)
    const camDist = this.camera.position.distanceTo(this.probeWorld());
    op.group.visible = !this.useOperatorCam && camDist > 0.9;
    // mano izquierda del operador sujeta la sonda; derecha la aguja
    if (op.group.visible) op.setHands(probeHandle, needleHand);
    // cámara del operador
    const eye = op.eye();
    this.opCamera.position.copy(eye);
    const tgt = this.probeWorld();
    this.opCamera.lookAt(tgt.x, tgt.y, tgt.z);
    this.opCamera.updateMatrixWorld();
  }

  render(rect: { x: number; y: number; w: number; h: number }) {
    const r = this.renderer;
    const cam = this.activeCamera();
    cam.aspect = rect.w / Math.max(rect.h, 1);
    cam.updateProjectionMatrix();
    if (!this.useOperatorCam) this.controls.update();
    r.setViewport(rect.x, rect.y, rect.w, rect.h);
    r.setScissor(rect.x, rect.y, rect.w, rect.h);
    r.setScissorTest(true);
    r.render(this.scene, cam);
  }
}

export function lineGeometry(points: Vector3[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3));
  return g;
}

export { Quaternion };
