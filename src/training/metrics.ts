/**
 * Métricas de competencia en punción ecoguiada y puntuación.
 *
 * Inspiradas en:
 *  - NeedleTrainer (Intelligent Ultrasound): % de tiempo con la punta visible, tiempo total.
 *  - PerkTutor (3D Slicer): recorrido de la aguja en el tejido, tiempo de inserción.
 *  - Sites et al. 2007: avanzar sin ver la punta y movimiento involuntario de la sonda son los
 *    errores más frecuentes del principiante.
 *  - Blaivas & Adhikari 2009: perforación de pared posterior en eje corto.
 *  - Guías de acceso vascular (KDOQI 2019, GEMAV 2017): distancia a la anastomosis, separación entre
 *    agujas, dirección de la aguja venosa, zonas a evitar.
 */
import type { NeedleEvent } from '../interaction/needle';

export interface FinalCheck {
  label: string;
  ok: boolean | null;
  detail: string;
  penalty: number;
}

export interface MetricsSnapshot {
  elapsed: number;
  skinPunctures: number;
  redirections: number;
  pathInTissue: number;
  backWallContacts: number;
  transfixions: number;
  arterialPunctures: number;
  nerveContacts: number;
  boneContacts: number;
  flushes: number;
  infiltrations: number;
  tipVisiblePct: number;
  shaftConfusions: number;
  probeMoveDuringAdvance: number;
  maxCollapse: number;
  timeToFlash: number | null;
  score: number;
  checks: FinalCheck[];
}

export class Metrics {
  startTime = -1;
  now = 0;
  skinPunctures = 0;
  redirections = 0;
  pathInTissue = 0;
  backWallContacts = 0;
  transfixions = 0;
  arterialPunctures = 0;
  nerveContacts = 0;
  boneContacts = 0;
  /** lavados con suero con la punta en la luz (comprobación de posición) */
  flushes = 0;
  /** suero infiltrado en el tejido (punta fuera de la luz) */
  infiltrations = 0;
  advVisible = 0;
  advTotal = 0;
  shaftConfusions = 0;
  private confusionActive = false;
  probeMoveDuringAdvance = 0;
  maxCollapse = 0;
  firstSkin = -1;
  firstFlash = -1;
  checks: FinalCheck[] = [];
  log: NeedleEvent[] = [];

  reset() {
    Object.assign(this, new Metrics());
  }

  start(t: number) {
    if (this.startTime < 0) this.startTime = t;
  }

  onEvent(e: NeedleEvent) {
    this.start(e.t);
    this.log.push(e);
    switch (e.type) {
      case 'skin':
        this.skinPunctures++;
        if (this.firstSkin < 0) this.firstSkin = e.t;
        break;
      case 'flash':
        if (this.firstFlash < 0) this.firstFlash = e.t;
        break;
      case 'backwall':
        this.backWallContacts++;
        break;
      case 'transfix':
        this.transfixions++;
        break;
      case 'artery':
        this.arterialPunctures++;
        break;
      case 'nerve':
        this.nerveContacts++;
        break;
      case 'bone':
        this.boneContacts++;
        break;
      case 'redirect':
        this.redirections++;
        break;
      case 'flush':
        this.flushes++;
        break;
      case 'infiltration':
        this.infiltrations++;
        break;
      default:
        break;
    }
  }

  /**
   * Registro por fotograma durante el avance de la aguja.
   * @param advance mm avanzados en este fotograma (>0 avanzando)
   * @param tipVisible punta dentro del haz (lateral, profundidad y grosor de corte); null si ninguna
   *   técnica permite verla (en plano, antes de entrar en la imagen): ese avance no cuenta
   * @param shaftInBeamTipBeyond el haz corta el cuerpo de la aguja pero la punta está más allá
   * @param probeMove mm de desplazamiento de la sonda en este fotograma
   */
  frame(t: number, advance: number, tipVisible: boolean | null, shaftInBeamTipBeyond: boolean, probeMove: number, collapse: number) {
    this.now = t;
    if (advance > 0.001) {
      this.start(t);
      if (tipVisible !== null) {
        this.advTotal += advance;
        if (tipVisible) this.advVisible += advance;
      }
      if (probeMove > 0.02) this.probeMoveDuringAdvance += probeMove;
      if (shaftInBeamTipBeyond) {
        if (!this.confusionActive) {
          this.shaftConfusions++;
          this.confusionActive = true;
        }
      }
    }
    if (!shaftInBeamTipBeyond) this.confusionActive = false;
    this.maxCollapse = Math.max(this.maxCollapse, collapse);
  }

  tipVisiblePct(): number {
    return this.advTotal > 0.5 ? (100 * this.advVisible) / this.advTotal : 100;
  }

  score(): number {
    let s = 100;
    s -= Math.max(0, this.skinPunctures - 1) * 8;
    s -= this.redirections * 3;
    s -= this.backWallContacts * 6;
    s -= this.transfixions * 18;
    s -= this.arterialPunctures * 30;
    s -= this.nerveContacts * 20;
    s -= this.boneContacts * 6;
    s -= this.infiltrations * 12;
    s -= this.shaftConfusions * 4;
    const tv = this.tipVisiblePct();
    if (tv < 80) s -= (80 - tv) * 0.4;
    if (this.probeMoveDuringAdvance > 8) s -= Math.min(8, (this.probeMoveDuringAdvance - 8) * 0.5);
    if (this.maxCollapse > 0.5) s -= 5;
    for (const c of this.checks) if (c.ok === false) s -= c.penalty;
    return Math.max(0, Math.round(s));
  }

  snapshot(): MetricsSnapshot {
    return {
      elapsed: this.startTime >= 0 ? this.now - this.startTime : 0,
      skinPunctures: this.skinPunctures,
      redirections: this.redirections,
      pathInTissue: this.pathInTissue,
      backWallContacts: this.backWallContacts,
      transfixions: this.transfixions,
      arterialPunctures: this.arterialPunctures,
      nerveContacts: this.nerveContacts,
      boneContacts: this.boneContacts,
      flushes: this.flushes,
      infiltrations: this.infiltrations,
      tipVisiblePct: this.tipVisiblePct(),
      shaftConfusions: this.shaftConfusions,
      probeMoveDuringAdvance: this.probeMoveDuringAdvance,
      maxCollapse: this.maxCollapse,
      timeToFlash: this.firstSkin >= 0 && this.firstFlash >= 0 ? this.firstFlash - this.firstSkin : null,
      score: this.score(),
      checks: this.checks,
    };
  }
}

export function grade(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Excelente', color: '#3ddc97' };
  if (score >= 75) return { label: 'Competente', color: '#8bd450' };
  if (score >= 55) return { label: 'Mejorable', color: '#f2c14e' };
  return { label: 'Insuficiente', color: '#ef5b5b' };
}
