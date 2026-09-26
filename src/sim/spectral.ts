/**
 * Doppler pulsado (PW): espectrograma desplazable, medidas automáticas y audio Doppler.
 *
 * Para cada columna temporal se muestrea el volumen de muestra (gate) en el modelo anatómico, se
 * proyectan las velocidades sobre la dirección del haz Doppler, se construye el histograma de
 * velocidades con ensanchamiento espectral (tránsito, geometría del haz, turbulencia), aliasing
 * cuando se supera el límite de Nyquist y ruido de tipo speckle espectral.
 */
import { Vector3 } from 'three';
import type { AnatomyModel } from '../anatomy/model';
import type { UltrasoundSim } from './UltrasoundSim';

export const SPEC_BINS = 160;
export const SPEC_COLS = 560;

export interface SpectralMeasures {
  psv: number;
  edv: number;
  tamax: number;
  tamv: number;
  ri: number;
  pi: number;
  hr: number;
  valid: boolean;
}

export class SpectralDoppler {
  /** columnas × bins, intensidad 0..1 */
  readonly data = new Float32Array(SPEC_COLS * SPEC_BINS);
  readonly envelope = new Float32Array(SPEC_COLS);
  readonly meanV = new Float32Array(SPEC_COLS);
  readonly colTime = new Float64Array(SPEC_COLS);
  col = 0;
  /** columnas por segundo (velocidad de barrido) */
  sweep = 150;
  private acc = 0;
  lastT = 0;
  scale = 150; // cm/s (velocidad corregida máxima mostrada)
  baseline = 0.5; // fracción del rango bajo la línea base
  gain = 0.5;
  invert = false;
  angleCorr = 60; // grados entre haz y flujo
  enabled = false;
  private hist = new Float32Array(SPEC_BINS);
  audio: DopplerAudio | null = null;

  constructor(
    private sim: UltrasoundSim,
    private model: AnatomyModel,
  ) {}

  setModel(m: AnatomyModel) {
    this.model = m;
    this.clear();
  }

  clear() {
    this.data.fill(0);
    this.envelope.fill(0);
    this.meanV.fill(0);
    this.colTime.fill(0);
    this.col = 0;
  }

  /** Rango de velocidades mostrado (cm/s, corregidas): amplitud total 2·escala; la línea base
   * queda a `baseline` (fracción) desde abajo. */
  vRange(): [number, number] {
    const span = 2 * this.scale;
    const lo = -span * this.baseline;
    return [lo, lo + span];
  }

  update(t: number) {
    if (!this.enabled) {
      this.lastT = t;
      return;
    }
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    this.acc += dt * this.sweep;
    let n = Math.floor(this.acc);
    this.acc -= n;
    n = Math.min(n, 30);
    for (let i = 0; i < n; i++) this.addColumn(t - ((n - 1 - i) / this.sweep));
  }

  private addColumn(t: number) {
    const sim = this.sim;
    const s = sim.settings;
    const model = this.model;
    model.updateDynamics(t);
    const D = sim.dopplerDir(tmpD);
    const gate = s.pwGate;
    const cosC = Math.cos((this.angleCorr * Math.PI) / 180);
    const [lo, hi] = this.vRange();
    const span = hi - lo;
    const vNyqBeam = (span / 2) * Math.max(cosC, 0.05); // Nyquist en velocidad proyectada
    const hist = this.hist;
    hist.fill(0);
    // muestras dentro del volumen de muestra (a lo largo del haz, lateral y elevación)
    const sa = (s.steer * Math.PI) / 180;
    let power = 0;
    let turbAcc = 0;
    const NS = 7;
    for (let a = 0; a < NS; a++) {
      const along = ((a + 0.5) / NS - 0.5) * gate.size;
      for (let b = -1; b <= 1; b++) {
        for (let c = -1; c <= 1; c++) {
          const u = gate.u + along * Math.sin(sa) + b * 0.25;
          const w = gate.w + along * Math.cos(sa);
          const p = sim.imageToTissue(u, w, c * 0.35, tmpP);
          const q = model.query(p, qbuf);
          if (!q.inLumen || !q.struct) continue;
          const vproj = -q.vel.dot(D); // hacia la sonda positivo
          const turb = q.struct.samples[Math.max(0, q.sampleIdx)]?.turb ?? 0;
          turbAcc += turb;
          power += 1;
          // ensanchamiento: tránsito + geometría (≈ ±6 %) + turbulencia
          const sig = 1.5 + 0.06 * Math.abs(vproj) + turb * (18 + 0.35 * Math.abs(vproj));
          addGauss(hist, vproj / cosC, sig / cosC, lo, span, 1, vNyqBeam / cosC);
        }
      }
    }
    const col = this.col % SPEC_COLS;
    const off = col * SPEC_BINS;
    // ruido espectral y compresión
    let envBin = -1;
    let meanNum = 0;
    let meanDen = 0;
    const g = Math.pow(10, (this.gain - 0.5) * 2.2);
    for (let i = 0; i < SPEC_BINS; i++) {
      const sp = hist[i] > 0 ? hist[i] * -Math.log(Math.max(1e-6, Math.random())) : 0;
      const noise = 0.004 * -Math.log(Math.max(1e-6, Math.random()));
      const v = (sp / Math.max(power, 1)) * 18 * g + noise * g;
      const disp = Math.min(1, Math.max(0, (Math.log10(v + 1e-4) + 2.6) / 2.4));
      this.data[off + i] = disp;
      const vel = lo + ((i + 0.5) / SPEC_BINS) * span;
      if (hist[i] > 0) {
        meanNum += hist[i] * vel;
        meanDen += hist[i];
      }
    }
    // envolvente (velocidad máxima): bin más alejado de la línea base con señal suficiente
    const zeroBin = Math.floor(((0 - lo) / span) * SPEC_BINS);
    const thr = 0.02 * Math.max(power, 1);
    let maxAbs = 0;
    for (let i = 0; i < SPEC_BINS; i++) {
      if (hist[i] > thr) {
        const d = Math.abs(i - zeroBin);
        if (d > maxAbs) {
          maxAbs = d;
          envBin = i;
        }
      }
    }
    this.envelope[col] = envBin >= 0 ? lo + ((envBin + 0.5) / SPEC_BINS) * span : 0;
    this.meanV[col] = meanDen > 0 ? meanNum / meanDen : 0;
    this.colTime[col] = t;
    this.col++;
    if (this.audio) this.audio.push(hist, lo, span, power, turbAcc / Math.max(power, 1), s.dopplerFreq, cosC);
  }

  /** Medidas automáticas sobre los últimos ~2 ciclos cardiacos. */
  measures(): SpectralMeasures {
    const hr = this.model.hr;
    const period = 60 / hr;
    const nCols = Math.min(SPEC_COLS - 1, Math.floor(period * 2 * this.sweep));
    if (this.col < nCols + 2) return { psv: 0, edv: 0, tamax: 0, tamv: 0, ri: 0, pi: 0, hr, valid: false };
    let sgn = 0;
    const start = this.col - nCols;
    for (let k = start; k < this.col; k++) sgn += this.envelope[k % SPEC_COLS];
    sgn = sgn >= 0 ? 1 : -1;
    let psv = 0;
    let edv = Infinity;
    let tamax = 0;
    let tamv = 0;
    for (let k = start; k < this.col; k++) {
      const e = this.envelope[k % SPEC_COLS] * sgn;
      psv = Math.max(psv, e);
      edv = Math.min(edv, e);
      tamax += e;
      tamv += this.meanV[k % SPEC_COLS] * sgn;
    }
    tamax /= nCols;
    tamv /= nCols;
    if (edv === Infinity) edv = 0;
    const ri = psv > 1 ? (psv - edv) / psv : 0;
    const pi = tamax > 1 ? (psv - edv) / tamax : 0;
    return { psv, edv, tamax, tamv, ri, pi, hr, valid: psv > 2 };
  }
}

function addGauss(h: Float32Array, v: number, sig: number, lo: number, span: number, w: number, nyq: number) {
  // aliasing: plegar al rango mostrado (ventana de 2·Nyquist centrada según línea base)
  const width = 2 * nyq;
  let vv = v;
  if (width > 0) {
    while (vv > lo + span) vv -= width;
    while (vv < lo) vv += width;
  }
  const n = h.length;
  const center = ((vv - lo) / span) * n;
  const sb = Math.max(0.6, (sig / span) * n);
  const r = Math.ceil(sb * 3);
  for (let i = Math.floor(center - r); i <= Math.ceil(center + r); i++) {
    let j = i;
    if (j < 0) j += n;
    if (j >= n) j -= n;
    if (j < 0 || j >= n) continue;
    const x = (i + 0.5 - center) / sb;
    h[j] += w * Math.exp(-0.5 * x * x);
  }
}

// ---------------------------------------------------------------------------------------------
// Audio Doppler (estéreo: flujo hacia la sonda a la izquierda, alejándose a la derecha)
// ---------------------------------------------------------------------------------------------
export class DopplerAudio {
  ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextTime = 0;
  private chunk = 0.04;
  volume = 0.5;
  private phase = new Float32Array(48);

  async start() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.ctx.destination);
    }
    await this.ctx.resume();
    this.nextTime = this.ctx.currentTime + 0.05;
  }

  stop() {
    this.ctx?.suspend();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.gainNode) this.gainNode.gain.value = v;
  }

  /** Sintetiza un fragmento de audio a partir del histograma de velocidades. */
  push(hist: Float32Array, lo: number, span: number, power: number, turb: number, f0MHz: number, cosC: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.gainNode) return;
    const now = ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now + 0.02;
    if (this.nextTime > now + 0.25) return; // demasiado adelantado
    const sr = ctx.sampleRate;
    const len = Math.floor(this.chunk * 2 * sr);
    const buf = ctx.createBuffer(2, len, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const n = hist.length;
    const step = Math.ceil(n / this.phase.length);
    let k = 0;
    for (let i = 0; i < n; i += step, k++) {
      let p = 0;
      for (let j = i; j < Math.min(n, i + step); j++) p += hist[j];
      if (p <= 0) continue;
      const v = lo + ((i + step / 2) / n) * span; // cm/s corregida
      const vBeam = v * cosC;
      const fd = (2 * f0MHz * 1e6 * (vBeam / 100)) / 1540;
      const f = Math.abs(fd);
      if (f < 60 || f > sr / 2.2) continue;
      const amp = (Math.sqrt(p / Math.max(power, 1)) * 0.25) / Math.sqrt(this.phase.length) * (1 + turb);
      const ch = fd >= 0 ? L : R;
      let ph = Math.random() * Math.PI * 2;
      const w = (2 * Math.PI * f) / sr;
      for (let s = 0; s < len; s++) {
        ch[s] += amp * Math.sin(ph);
        ph += w;
      }
      this.phase[k] = ph;
    }
    // ventana de Hann para solapar fragmentos
    for (let s = 0; s < len; s++) {
      const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * s) / (len - 1));
      L[s] *= h;
      R[s] *= h;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gainNode);
    src.start(this.nextTime);
    this.nextTime += this.chunk;
  }
}

const tmpD = new Vector3();
const tmpP = new Vector3();
const qbuf = {
  struct: null,
  sd: 0,
  sampleIdx: -1,
  r: 0,
  inLumen: false,
  inWall: false,
  inThrombus: false,
  vel: new Vector3(),
  layer: 'muscle' as const,
  skinDepth: 0,
} as unknown as import('../anatomy/model').QueryResult;
