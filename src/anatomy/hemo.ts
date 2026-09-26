/**
 * Hemodinámica: formas de onda de flujo normalizadas (media = 1 a lo largo del ciclo cardiaco).
 *
 * El caudal instantáneo de cada vaso es Q(t) = Qmedio · w(fase). La velocidad media local se obtiene por
 * continuidad (v = Q / área), de modo que una estenosis acelera el flujo y un aneurisma lo enlentece de
 * forma físicamente coherente.
 *
 * Objetivos de forma (ver docs/FUNDAMENTOS.md §2.2):
 *  - 'feed'  arteria nutricia de FAV: monofásica, baja resistencia, IR ≈ 0.45–0.55.
 *  - 'avf'   vena arterializada: pulsátil con flujo diastólico alto, IR ≈ 0.35–0.45.
 *  - 'artery' arteria periférica en reposo: trifásica, IR ≈ 1.0 (reflujo protodiastólico).
 *  - 'mixed' arteria cubital en FAV radiocefálica: resistencia intermedia (IR ≈ 0.65).
 *  - 'vein'  vena nativa: flujo fásico con la respiración, sin pulsatilidad cardiaca apreciable.
 *  - 'graft' prótesis: similar a FAV algo más pulsátil.
 */
export type WaveKind = 'feed' | 'avf' | 'artery' | 'mixed' | 'vein' | 'graft' | 'none';

const g = (x: number, mu: number, s: number) => Math.exp(-(((x - mu) / s) ** 2));

const RAW: Record<Exclude<WaveKind, 'vein' | 'none'>, (p: number) => number> = {
  feed: (p) => 0.55 - 0.08 * p + 0.4 * g(p, 0.13, 0.065) + 0.06 * g(p, 0.34, 0.06),
  avf: (p) => 0.62 - 0.08 * p + 0.3 * g(p, 0.15, 0.08) + 0.04 * g(p, 0.36, 0.07),
  graft: (p) => 0.58 - 0.08 * p + 0.42 * g(p, 0.14, 0.07) + 0.05 * g(p, 0.35, 0.06),
  artery: (p) => 0.03 + 1.0 * g(p, 0.12, 0.042) - 0.26 * g(p, 0.245, 0.045) + 0.1 * g(p, 0.37, 0.055),
  mixed: (p) => 0.38 - 0.08 * p + 0.62 * g(p, 0.125, 0.05) - 0.04 * g(p, 0.24, 0.04) + 0.07 * g(p, 0.35, 0.06),
};

const N = 512;
const TABLES = new Map<WaveKind, Float32Array>();
const STATS = new Map<WaveKind, { max: number; min: number; ri: number }>();

function build(kind: Exclude<WaveKind, 'vein' | 'none'>) {
  const f = RAW[kind];
  const arr = new Float32Array(N);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    arr[i] = f(i / N);
    sum += arr[i];
  }
  const mean = sum / N;
  let mx = -Infinity;
  let mn = Infinity;
  for (let i = 0; i < N; i++) {
    arr[i] /= mean;
    mx = Math.max(mx, arr[i]);
    mn = Math.min(mn, arr[i]);
  }
  // IR = (VPS - VFD)/VPS ; VFD = valor al final de la diástole (fase ~0.98)
  const edv = arr[Math.floor(0.97 * N)];
  TABLES.set(kind, arr);
  STATS.set(kind, { max: mx, min: mn, ri: (mx - edv) / mx });
}
(['feed', 'avf', 'graft', 'artery', 'mixed'] as const).forEach(build);

export function waveStats(kind: WaveKind) {
  return STATS.get(kind) ?? { max: 1, min: 1, ri: 0 };
}

/**
 * Factor de caudal instantáneo (media 1).
 * @param t tiempo absoluto (s)
 * @param hr frecuencia cardiaca (lpm)
 */
export function waveFactor(kind: WaveKind, t: number, hr: number): number {
  if (kind === 'none') return 0;
  if (kind === 'vein') {
    // fasicidad respiratoria (~15 rpm) + mínima transmisión cardiaca
    const resp = Math.sin((2 * Math.PI * t) / 4.2);
    const card = Math.sin(2 * Math.PI * t * (hr / 60));
    return 1 + 0.35 * resp + 0.06 * card;
  }
  const tab = TABLES.get(kind)!;
  const period = 60 / hr;
  let ph = (t % period) / period;
  if (ph < 0) ph += 1;
  const x = ph * N;
  const i = Math.floor(x);
  const f = x - i;
  return tab[i % N] * (1 - f) + tab[(i + 1) % N] * f;
}

/** Fase cardiaca 0..1 */
export function cardiacPhase(t: number, hr: number): number {
  const period = 60 / hr;
  const ph = (t % period) / period;
  return ph < 0 ? ph + 1 : ph;
}

/** Pulso normalizado 0..1 (para pulsatilidad de la pared) */
export function pulse01(kind: WaveKind, t: number, hr: number): number {
  if (kind === 'vein' || kind === 'none') return 0;
  const s = waveStats(kind);
  const w = waveFactor(kind, t, hr);
  return (w - s.min) / Math.max(1e-6, s.max - s.min);
}

/**
 * Relación velocidad máxima (centro) / velocidad media en la sección para un perfil
 * v(ρ) = vmax·(1 − ρⁿ): vmedia = vmax·n/(n+2). n = 2 → parabólico (laminar), n grande → plano.
 */
export function profilePeakFactor(n: number): number {
  return (n + 2) / n;
}
