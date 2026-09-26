/**
 * Aguja de punción: geometría, interacción con los tejidos y eventos clínicos.
 *
 * Modelo de interacción:
 *  - Entrada cutánea en un punto de la piel con un ángulo respecto a la superficie y un rumbo.
 *  - Al contactar con la pared anterior de un vaso, la pared se deforma ("tienda") hasta un umbral
 *    que depende del tipo de vaso; al superarlo se produce el "pop" y la punta entra en la luz.
 *  - En la luz aparece el reflujo (flashback), pulsátil en FAV/arteria.
 *  - La pared posterior también se deforma y puede perforarse (transfixión) → extravasación/hematoma.
 *  - Contacto con nervio (parestesia), arteria no diana (punción arterial), hueso (tope).
 */
import { Vector3 } from 'three';
import type { AnatomyModel, QueryResult, Structure } from '../anatomy/model';
import type { ArmShape } from '../anatomy/armShape';
import { GAUGES } from '../scene/instruments';

export type NeedleRole = 'arterial' | 'venosa';
export type NeedleStateName = 'fuera' | 'piel' | 'tejido' | 'tienda' | 'luz' | 'pared-post' | 'transfixión' | 'hueso';

export interface NeedleEvent {
  t: number;
  type:
    | 'skin'
    | 'tent'
    | 'pop'
    | 'flash'
    | 'backwall'
    | 'transfix'
    | 'artery'
    | 'nerve'
    | 'bone'
    | 'tendon'
    | 'thrombus'
    | 'exit'
    | 'withdraw'
    | 'redirect'
    | 'hematoma';
  msg: string;
  severity: 'info' | 'ok' | 'warn' | 'error';
  struct?: string;
}

export interface Puncture {
  st: Structure;
  p: Vector3;
  back: boolean;
  t: number;
}

const TENT_LIMIT: Record<string, number> = { vein: 1.0, avf: 1.7, artery: 2.2, graft: 2.6 };
const BACK_LIMIT: Record<string, number> = { vein: 0.8, avf: 1.2, artery: 1.6, graft: 2.0 };

export class Needle {
  role: NeedleRole;
  gauge = 15;
  length = 25;
  placed = false;
  entry = new Vector3();
  normal = new Vector3(0, 1, 0);
  tx = new Vector3(1, 0, 0);
  tt = new Vector3(0, 0, 1);
  entryX = 0;
  entryTheta = 0;
  /** rumbo (grados) en el plano tangente: 0 = hacia proximal (+x), 90 = hacia +theta */
  heading = 0;
  /** ángulo con la piel (grados) */
  angle = 25;
  /** longitud insertada (mm) desde el punto de entrada; ≤ 0 = fuera */
  depth = -3;
  tip = new Vector3();
  dir = new Vector3();
  state: NeedleStateName = 'fuera';
  /** estructura vascular en la que está la punta (luz) */
  inVessel: Structure | null = null;
  tentStruct: Structure | null = null;
  tentAmount = 0;
  private tentStart = 0;
  private tentBack = false;
  flash = 0;
  flashArterial = false;
  punctures: Puncture[] = [];
  events: NeedleEvent[] = [];
  confirmed = false;
  private lastQ: QueryResult | null = null;
  private prevDepth = -3;
  private prevAngle = 25;
  private prevHeading = 0;
  private inTissueSince = -1;
  firstFlashTime = -1;
  skinTime = -1;
  nerveHit = false;
  arteryHit = false;
  boneHit = false;
  transfixed = false;
  backContacts = 0;
  redirections = 0;
  pathInTissue = 0;
  onEvent: ((e: NeedleEvent) => void) | null = null;

  constructor(role: NeedleRole) {
    this.role = role;
  }

  get radius() {
    return (GAUGES[this.gauge]?.od ?? 1.83) / 2;
  }

  /** Coloca la aguja con la punta apoyada sobre la piel en (x, theta). */
  place(arm: ArmShape, x: number, theta: number, heading: number, angle: number) {
    const f = arm.skinFrame(x, theta);
    this.entry.copy(f.S);
    this.normal.copy(f.N);
    this.tx.copy(f.Tx);
    this.tt.copy(f.Tt);
    this.entryX = x;
    this.entryTheta = theta;
    this.heading = heading;
    this.angle = angle;
    this.depth = -3;
    this.prevDepth = -3;
    this.placed = true;
    this.state = 'fuera';
    this.inVessel = null;
    this.tentAmount = 0;
    this.tentStruct = null;
    this.confirmed = false;
    this.computeGeometry();
  }

  computeGeometry() {
    const h = (this.heading * Math.PI) / 180;
    const a = (this.angle * Math.PI) / 180;
    const along = this.tx.clone().multiplyScalar(Math.cos(h)).addScaledVector(this.tt, Math.sin(h));
    this.dir.copy(along).multiplyScalar(Math.cos(a)).addScaledVector(this.normal, -Math.sin(a)).normalize();
    this.tip.copy(this.entry).addScaledVector(this.dir, this.depth);
  }

  /** Punto de entrada en la piel (o punta si está fuera) → para la GPU */
  backPoint(out = new Vector3()) {
    return out.copy(this.entry).addScaledVector(this.dir, Math.min(0, this.depth) - 0.5);
  }

  private emit(t: number, type: NeedleEvent['type'], msg: string, severity: NeedleEvent['severity'], struct?: string) {
    const e: NeedleEvent = { t, type, msg, severity, struct };
    this.events.push(e);
    this.onEvent?.(e);
  }

  /** Posición de la punta para una profundidad, ángulo y rumbo dados. */
  private tipAt(depth: number, angle: number, heading: number, out = new Vector3()): Vector3 {
    const h = (heading * Math.PI) / 180;
    const a = (angle * Math.PI) / 180;
    const along = tmpV.copy(this.tx).multiplyScalar(Math.cos(h)).addScaledVector(this.tt, Math.sin(h));
    const dir = tmpW.copy(along).multiplyScalar(Math.cos(a)).addScaledVector(this.normal, -Math.sin(a)).normalize();
    return out.copy(this.entry).addScaledVector(dir, depth);
  }

  /**
   * Avanza la simulación física de la aguja tras un cambio de profundidad, ángulo o rumbo.
   * Los cambios se recorren en pasos de ≤ 0,2 mm de desplazamiento de la punta para no saltarse
   * paredes, también cuando la aguja pivota (un barrido lateral empuja el tejido como un avance).
   */
  update(model: AnatomyModel, t: number, accessIds: Set<string>) {
    if (!this.placed) return;
    const d0 = this.prevDepth;
    const a0 = this.prevAngle;
    const h0 = this.prevHeading;
    const d1 = this.depth;
    const a1 = this.angle;
    const h1 = this.heading;
    const move = this.tipAt(d0, a0, h0, tmpA).distanceTo(this.tipAt(d1, a1, h1, tmpB));
    if (move < 1e-5 && d0 === d1) {
      this.computeGeometry();
      return;
    }
    // redirección: pivotar la aguja con la punta dentro del tejido
    if (Math.max(d0, d1) > 2) {
      this.redirAcc += Math.abs(a1 - a0) + Math.abs(h1 - h0);
      if (this.redirAcc > 4) {
        this.redirections++;
        this.redirAcc = 0;
        this.emit(t, 'redirect', 'Redirección de la aguja dentro del tejido', 'warn');
      }
    }
    const withdrawing = d1 < d0 - 1e-6;
    const pivot = a1 !== a0 || h1 !== h0;
    const advancing = d1 > d0 + 1e-6 || (!withdrawing && pivot);
    const steps = Math.max(1, Math.ceil(move / 0.2), Math.ceil(Math.abs(d1 - d0) / 0.2));
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      this.angle = a0 + (a1 - a0) * f;
      this.heading = h0 + (h1 - h0) * f;
      const d = d0 + (d1 - d0) * f;
      const stop = this.step(model, t, d, advancing, accessIds);
      if (stop !== null) {
        this.depth = stop;
        break;
      }
      this.depth = d;
    }
    if (this.depth > 0 || d0 > 0) this.pathInTissue += move;
    this.prevDepth = this.depth;
    this.prevAngle = this.angle;
    this.prevHeading = this.heading;
    this.computeGeometry();
    if (this.state === 'luz' && this.inVessel) this.flashArterial = this.inVessel.def.kind === 'artery';
  }

  private redirAcc = 0;
  private lastStructId: string | null = null;
  /** punto de contacto con la pared (para registrar el orificio) */
  private contact = new Vector3();

  /** ¿Hay un orificio previo en la pared de `st` cerca de `p`? */
  private hasHole(st: Structure, p: Vector3, back?: boolean): boolean {
    return this.punctures.some((h) => h.st === st && (back === undefined || h.back === back) && h.p.distanceTo(p) < 2.5);
  }

  /** Un paso a profundidad d. Devuelve una profundidad de tope si la aguja no puede avanzar. */
  private step(model: AnatomyModel, t: number, d: number, advancing: boolean, access: Set<string>): number | null {
    this.depth = d;
    this.computeGeometry();
    const q = model.query(this.tip, this.lastQ ?? undefined);
    this.lastQ = q;
    const prevState = this.state;
    if (d <= 0) {
      if (prevState !== 'fuera') this.emit(t, 'withdraw', 'Aguja retirada de la piel', 'info');
      this.state = 'fuera';
      this.inVessel = null;
      this.tentAmount = 0;
      this.tentStruct = null;
      this.lastStructId = null;
      return null;
    }
    if (prevState === 'fuera') {
      this.state = 'piel';
      this.skinTime = t;
      this.emit(t, 'skin', 'Punción cutánea', 'info');
    }
    const sid = q.struct?.def.id ?? null;
    const changed = sid !== this.lastStructId;
    this.lastStructId = sid;
    // hueso: tope
    if (q.struct && q.struct.code === 12) {
      if (!this.boneHit) this.emit(t, 'bone', `Contacto óseo (${q.struct.def.name}): la aguja no avanza`, 'error', q.struct.def.id);
      this.boneHit = true;
      this.state = 'hueso';
      this.tentAmount = 0;
      this.tentStruct = null;
      this.inVessel = null;
      return Math.max(0, d - 0.3);
    }
    if (prevState === 'hueso') this.state = 'tejido';
    // nervio
    if (q.struct && q.struct.code === 10 && !this.nerveHit) {
      this.emit(t, 'nerve', `¡Contacto con ${q.struct.def.name}! El paciente refiere parestesia/dolor`, 'error', q.struct.def.id);
      this.nerveHit = true;
    }
    if (q.struct && q.struct.code === 11 && advancing && changed) {
      this.emit(t, 'tendon', `La aguja atraviesa el ${q.struct.def.name.toLowerCase()}`, 'warn', q.struct.def.id);
    }

    // interacción con vasos
    const st = q.struct && q.struct.isVessel ? q.struct : null;
    if (this.state === 'tienda' && this.tentStruct) {
      const lim = this.tentBack ? BACK_LIMIT[this.tentStruct.def.kind] ?? 1 : TENT_LIMIT[this.tentStruct.def.kind] ?? 1.5;
      const amt = d - this.tentStart;
      if (amt < 0 || !advancing) {
        // retroceso: la pared vuelve a su sitio
        this.tentAmount = 0;
        this.state = this.tentBack ? 'luz' : 'tejido';
        this.inVessel = this.tentBack ? this.tentStruct : null;
        this.tentStruct = null;
        return null;
      }
      if (amt < lim) {
        this.tentAmount = amt;
        return null;
      }
      // "pop": la pared cede
      const s = this.tentStruct;
      this.tentAmount = 0;
      this.tentStruct = null;
      this.punctures.push({ st: s, p: this.contact.clone(), back: this.tentBack, t });
      if (!this.tentBack) {
        this.emit(t, 'pop', `Pérdida de resistencia: pared anterior de ${s.def.name} atravesada`, 'info', s.def.id);
        const q2 = model.query(this.tip);
        if (q2.struct === s && q2.inLumen) {
          this.enterLumen(t, s, access);
        } else if (q2.struct === s && q2.inThrombus) {
          this.state = 'tejido';
          this.emit(t, 'thrombus', 'La punta está dentro de un trombo: no hay reflujo', 'warn', s.def.id);
        } else if (this.crossedLumen(model, s)) {
          this.state = 'transfixión';
          this.transfixed = true;
          this.emit(t, 'transfix', `Vaso atravesado de lado a lado (${s.def.name}): riesgo de hematoma`, 'error', s.def.id);
        } else {
          this.state = 'tejido';
          this.emit(t, 'exit', `Punción tangencial: la aguja ha resbalado por la pared de ${s.def.name}`, 'warn', s.def.id);
        }
      } else {
        this.state = 'transfixión';
        this.transfixed = true;
        this.inVessel = null;
        this.emit(t, 'transfix', `Perforación de la pared posterior (${s.def.name}): extravasación`, 'error', s.def.id);
      }
      return null;
    }
    if (this.state === 'luz' && this.inVessel) {
      const v = this.inVessel;
      if (q.struct === v && q.inLumen) return null;
      if (advancing) {
        // orificio posterior previo: la aguja lo atraviesa sin nueva perforación
        if (this.hasHole(v, this.tip, true)) {
          this.state = 'transfixión';
          this.inVessel = null;
          return null;
        }
        this.state = 'tienda';
        this.tentBack = true;
        this.tentStruct = v;
        this.tentStart = d;
        this.tentAmount = 0;
        this.contact.copy(this.tip);
        this.backContacts++;
        this.emit(t, 'backwall', 'La punta contacta con la pared del vaso: detener, bajar el ángulo y alinear', 'warn', v.def.id);
        return null;
      }
      this.state = 'tejido';
      this.inVessel = null;
      this.emit(t, 'exit', 'La punta ha salido de la luz del vaso', 'warn', v.def.id);
      return null;
    }
    if (this.state === 'transfixión') {
      if (st && q.inLumen && !advancing && this.hasHole(st, this.tip)) {
        // al retirar vuelve a la luz a través del orificio posterior
        this.enterLumen(t, st, access, true);
      } else if (st && q.inWall && advancing && !this.hasHole(st, this.tip)) {
        this.contact.copy(this.tip);
        this.beginTent(t, st, d, false);
      }
      return null;
    }
    // en tejido
    if (st) {
      const hole = this.hasHole(st, this.tip);
      if (q.inLumen) {
        if (hole || !advancing) this.enterLumen(t, st, access);
        else {
          this.contact.copy(this.tip);
          this.beginTent(t, st, d, false);
        }
        return null;
      }
      if (q.inWall && advancing && !hole) {
        this.contact.copy(this.tip);
        this.beginTent(t, st, d, false);
        return null;
      }
    }
    this.state = 'tejido';
    return null;
  }

  /** ¿El tramo de aguja entre el contacto con la pared y la punta pasa por la luz del vaso? */
  private crossedLumen(model: AnatomyModel, st: Structure): boolean {
    const p = new Vector3();
    const len = this.contact.distanceTo(this.tip);
    for (let s = 0; s <= len; s += 0.25) {
      p.copy(this.contact).addScaledVector(this.dir, s);
      const q = model.query(p);
      if (q.struct === st && q.inLumen) return true;
    }
    return false;
  }

  private beginTent(t: number, st: Structure, d: number, back: boolean) {
    this.state = 'tienda';
    this.tentBack = back;
    this.tentStruct = st;
    this.tentStart = d;
    this.tentAmount = 0;
    this.emit(t, 'tent', `La punta indenta la pared de ${st.def.name} (signo de la tienda)`, 'info', st.def.id);
  }

  private enterLumen(t: number, st: Structure, access: Set<string>, silent = false) {
    this.state = 'luz';
    this.inVessel = st;
    if (st.def.kind === 'artery' && !access.has(st.def.id)) {
      if (!this.arteryHit) this.emit(t, 'artery', `¡Punción arterial! (${st.def.name}) — reflujo rojo brillante y pulsátil`, 'error', st.def.id);
      this.arteryHit = true;
    } else if (!silent) {
      if (this.firstFlashTime < 0) this.firstFlashTime = t;
      this.emit(t, 'flash', `Reflujo de sangre: punta en la luz de ${st.def.name}`, 'ok', st.def.id);
    }
  }

  /** Longitud (mm) del tramo distal de la aguja que está dentro de la luz del vaso actual. */
  intraluminalLength(model: AnatomyModel): number {
    if (this.state !== 'luz' || !this.inVessel) return 0;
    let len = 0;
    const p = new Vector3();
    for (let s = 0; s < Math.max(0, this.depth); s += 0.5) {
      p.copy(this.tip).addScaledVector(this.dir, -s);
      const q = model.query(p);
      if (q.struct === this.inVessel && q.inLumen) len += 0.5;
      else break;
    }
    return len;
  }

  /** Ángulo (grados) entre la aguja y el eje local del vaso en el que está. */
  angleToVessel(model: AnatomyModel): number | null {
    if (!this.inVessel) return null;
    const { idx } = model.nearestSample(this.inVessel, this.tip);
    const t = this.inVessel.samples[idx].t;
    const c = Math.abs(t.dot(this.dir));
    return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
  }

  /** Distancia de la punta al eje del vaso relativa al radio (0 = centrada, 1 = en la pared). */
  centering(model: AnatomyModel): number | null {
    if (!this.inVessel) return null;
    const q = model.query(this.tip);
    if (q.struct !== this.inVessel) return null;
    return Math.max(0, Math.min(1, (q.sd + q.r) / Math.max(q.r, 1e-3)));
  }

  /** Sentido de la aguja respecto al flujo del vaso: 1 = anterógrada, −1 = retrógrada. */
  flowDirection(model: AnatomyModel, st: Structure): number {
    const { idx } = model.nearestSample(st, this.tip);
    const t = st.samples[idx].t;
    const q = st.def.flow?.q ?? 1;
    return Math.sign(t.dot(this.dir) * q);
  }
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpV = new Vector3();
const tmpW = new Vector3();
