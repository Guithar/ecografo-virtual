/**
 * Propiedades acústicas de los tejidos usadas por el simulador.
 *
 * Valores de referencia (ver docs/FUNDAMENTOS.md para fuentes):
 *  - Velocidad del sonido media asumida por el ecógrafo: 1540 m/s.
 *  - Impedancia acústica Z = ρ·c (MRayl): grasa ≈ 1.38, músculo ≈ 1.70, sangre ≈ 1.61, piel ≈ 1.6–1.7,
 *    hueso cortical ≈ 7.4–7.8, aire ≈ 0.0004, acero ≈ 45.
 *  - Atenuación (dB/cm/MHz): sangre ≈ 0.15–0.2, grasa ≈ 0.5–0.6, músculo ≈ 0.6–1.1, piel ≈ 1–2,
 *    tendón ≈ 1–4 (anisótropo), hueso cortical ≈ 10–20.
 *  - Ecogenicidad: amplitud relativa de retrodispersión (escala arbitraria calibrada visualmente, en la
 *    que el músculo ≈ 0.33). La sangre retrodispersa ~30–40 dB menos que el tejido blando.
 */
export enum T {
  Gel = 0,
  Air = 1,
  Skin = 2,
  Fat = 3,
  Fascia = 4,
  Muscle = 5,
  Tendon = 6,
  Nerve = 7,
  Bone = 8,
  Wall = 9,
  BloodArt = 10,
  BloodVen = 11,
  BloodAvf = 12,
  Thrombus = 13,
  Hematoma = 14,
  Needle = 15,
  Graft = 16,
  Calcium = 17,
}

export interface TissueProps {
  id: T;
  name: string;
  /** impedancia acústica (MRayl) */
  Z: number;
  /** atenuación (dB/cm/MHz) */
  att: number;
  /** amplitud media de retrodispersión (relativa) */
  echo: number;
  /** color en la vista anatómica (sección real) */
  color: string;
}

export const TISSUES: TissueProps[] = [
  { id: T.Gel, name: 'Gel acústico', Z: 1.52, att: 0.05, echo: 0.0, color: '#9ec9e6' },
  { id: T.Air, name: 'Aire', Z: 0.0004, att: 12.0, echo: 0.0, color: '#f4f7fa' },
  { id: T.Skin, name: 'Piel', Z: 1.65, att: 1.4, echo: 0.72, color: '#e6b89c' },
  { id: T.Fat, name: 'Tejido celular subcutáneo', Z: 1.38, att: 0.55, echo: 0.2, color: '#f2d680' },
  { id: T.Fascia, name: 'Fascia', Z: 1.85, att: 1.5, echo: 1.05, color: '#f5f0e6' },
  { id: T.Muscle, name: 'Músculo', Z: 1.7, att: 0.9, echo: 0.3, color: '#b4453c' },
  { id: T.Tendon, name: 'Tendón', Z: 1.8, att: 2.5, echo: 0.9, color: '#ece6da' },
  { id: T.Nerve, name: 'Nervio', Z: 1.62, att: 0.9, echo: 0.42, color: '#f2c33a' },
  { id: T.Bone, name: 'Hueso cortical', Z: 7.6, att: 18.0, echo: 1.2, color: '#efe4c8' },
  { id: T.Wall, name: 'Pared vascular', Z: 1.72, att: 1.2, echo: 0.8, color: '#d9a0a8' },
  { id: T.BloodArt, name: 'Sangre (arteria)', Z: 1.61, att: 0.17, echo: 0.012, color: '#c8202a' },
  { id: T.BloodVen, name: 'Sangre (vena)', Z: 1.61, att: 0.17, echo: 0.014, color: '#2f4fa8' },
  { id: T.BloodAvf, name: 'Sangre (FAV)', Z: 1.61, att: 0.17, echo: 0.013, color: '#7a3fa8' },
  { id: T.Thrombus, name: 'Trombo', Z: 1.64, att: 0.5, echo: 0.28, color: '#6b2a2a' },
  { id: T.Hematoma, name: 'Hematoma', Z: 1.6, att: 0.35, echo: 0.25, color: '#5a1f35' },
  { id: T.Needle, name: 'Aguja (acero)', Z: 45, att: 0, echo: 3.0, color: '#d9dde3' },
  { id: T.Graft, name: 'Prótesis PTFE', Z: 1.9, att: 2.0, echo: 1.1, color: '#e8eef2' },
  { id: T.Calcium, name: 'Calcificación', Z: 5.0, att: 14.0, echo: 1.6, color: '#ffffff' },
];

export function tissueName(id: number): string {
  return TISSUES[id]?.name ?? '—';
}

/** Genera constantes GLSL a partir de la tabla (una sola fuente de verdad). */
export function tissueGLSL(): string {
  const f = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
  const z = TISSUES.map((t) => f(t.Z)).join(', ');
  const a = TISSUES.map((t) => f(t.att)).join(', ');
  const e = TISSUES.map((t) => f(t.echo)).join(', ');
  const n = TISSUES.length;
  return `
const int NTISSUE = ${n};
const float T_Z[${n}] = float[${n}](${z});
const float T_ATT[${n}] = float[${n}](${a});
const float T_ECHO[${n}] = float[${n}](${e});
${TISSUES.map((t) => `const int TI_${T[t.id].toUpperCase()} = ${t.id};`).join('\n')}
`;
}
