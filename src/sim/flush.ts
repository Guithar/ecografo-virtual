/**
 * Lavado con suero a través de la aguja («prueba del suero»).
 *
 * Con la punta en la luz, el suero sale del bisel como un chorro y el flujo del acceso lo arrastra
 * aguas abajo. Las microburbujas que lleva (aire disuelto o atrapado en la jeringa) son dispersores
 * muy potentes: en modo B aparece un penacho de ecos brillantes que se mueven con la sangre y, en
 * Doppler color, un mosaico de alta velocidad (aliasing y turbulencia) junto a la punta. Con la punta
 * fuera de la luz el suero no fluye: se acumula en el tejido (infiltración) como una colección
 * anecoica que crece alrededor de la punta.
 */

/** volumen y duración típicos del lavado: 10 mL en ~2,5 s (≈ 4 mL/s) */
export const FLUSH_ML = 10;
export const FLUSH_INJECT_S = 2.5;
/** decaimiento del chorro libre dentro del vaso (mm, ≈ 3–5 diámetros internos) */
export const JET_LEN_MM = 4;

export interface FlushState {
  /** inicio (s, tiempo de simulación) */
  t0: number;
  /** índice de la estructura en cuya luz se inyecta */
  sidx: number;
  /** velocidad media de la sangre en el punto de inyección (mm/s) */
  vmean: number;
  /** caudal del vaso (mL/s, valor absoluto) */
  qVessel: number;
  /** velocidad del chorro a la salida de la aguja (cm/s) */
  jetVel: number;
}

export interface FlushParams {
  active: boolean;
  /** concentración relativa de microburbujas en el penacho (0–1) */
  intensity: number;
  /** inicio del penacho, mm aguas abajo de la punta (se despega al acabar la inyección) */
  tail: number;
  /** frente del penacho, mm aguas abajo de la punta */
  front: number;
  /** intensidad del chorro en la punta (0–1) */
  jet: number;
}

/** Diámetro interno aproximado de una aguja de fístula de pared fina (mm). */
export function innerDiameter(odMm: number): number {
  return Math.max(0.6, odMm - 0.3);
}

/** Velocidad del chorro a la salida (cm/s) = caudal inyectado / área interna. */
export function jetVelocity(innerDiamMm: number, mlPerS = FLUSH_ML / FLUSH_INJECT_S): number {
  const area = Math.PI * (innerDiamMm / 2) ** 2; // mm²
  return (mlPerS * 1000) / area / 10;
}

/** Estado del penacho y del chorro en el instante t. */
export function flushParams(f: FlushState, t: number): FlushParams {
  const tau = t - f.t0;
  if (tau < 0) return { active: false, intensity: 0, tail: 0, front: 0, jet: 0 };
  const T = FLUSH_INJECT_S;
  const post = Math.max(0, tau - T);
  // el chorro propio mezcla y empuja el suero aunque el vaso tenga poco flujo
  const v = Math.max(f.vmean, 6);
  const front = Math.min(4 + v * tau, 200);
  const tail = post > 0 ? v * post : 0;
  // dilución: caudal inyectado frente al del vaso (con mínimo visible)
  const qi = FLUSH_ML / T;
  const dil = Math.min(1, Math.max(0.3, (4 * qi) / (qi + f.qVessel)));
  const ramp = Math.min(1, tau / 0.25);
  // tras la inyección las burbujas se disuelven y el penacho sale del campo
  const fade = Math.exp(-post / 1.5);
  const intensity = dil * ramp * fade;
  const jet = tau <= T ? Math.min(1, tau / 0.15) : Math.exp(-post / 0.15);
  const active = (intensity > 0.02 || jet > 0.02) && tail < 200;
  return { active, intensity, tail, front, jet };
}
