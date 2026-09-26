/**
 * Estado manipulable de la sonda y conversión a una pose 3D sobre la piel.
 *
 * Maniobras (terminología PART + balanceo, habitual en punción ecoguiada):
 *   - Deslizamiento / alineación: cambiar (x, theta) sobre la superficie cutánea.
 *   - Rotación: giro alrededor de la normal a la piel (0° = eje corto del brazo, 90° = eje largo).
 *   - Inclinación (tilt/basculación): angular el haz en el plano de elevación (hacia proximal/distal en transversal).
 *   - Balanceo (rocking/heel-toe): angular el haz dentro del plano de imagen.
 *   - Presión: indentación de la piel (colapsa venas, desplaza tejidos).
 */
import { Vector3 } from 'three';
import { ArmShape, ARM_X_MAX, ARM_X_MIN } from '../anatomy/armShape';
import type { ProbePose } from '../sim/UltrasoundSim';

export interface ProbeState {
  x: number;
  theta: number;
  rot: number;
  tilt: number;
  rock: number;
  press: number;
}

export function defaultProbeState(): ProbeState {
  return { x: 110, theta: 50, rot: 0, tilt: 0, rock: 0, press: 0.6 };
}

export function clampProbe(st: ProbeState) {
  st.x = Math.min(ARM_X_MAX - 25, Math.max(ARM_X_MIN + 5, st.x));
  if (st.theta > 180) st.theta -= 360;
  if (st.theta < -180) st.theta += 360;
  st.rot = ((((st.rot + 180) % 360) + 360) % 360) - 180;
  st.tilt = Math.max(-40, Math.min(40, st.tilt));
  st.rock = Math.max(-35, Math.min(35, st.rock));
  st.press = Math.max(0, Math.min(12, st.press));
}

export function computePose(arm: ArmShape, st: ProbeState, pose: ProbePose): ProbePose {
  const { S, N, Tx, Tt } = arm.skinFrame(st.x, st.theta);
  const psi = (st.rot * Math.PI) / 180;
  const L = new Vector3().copy(Tt).multiplyScalar(Math.cos(psi)).addScaledVector(Tx, Math.sin(psi)).normalize();
  let B = N.clone().negate();
  let E = new Vector3().crossVectors(L, B).normalize();
  const a = (st.tilt * Math.PI) / 180;
  const B1 = B.clone().multiplyScalar(Math.cos(a)).addScaledVector(E, Math.sin(a));
  const E1 = E.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, -Math.sin(a));
  B = B1;
  E = E1;
  const b = (st.rock * Math.PI) / 180;
  const B2 = B.clone().multiplyScalar(Math.cos(b)).addScaledVector(L, Math.sin(b));
  const L2 = L.clone().multiplyScalar(Math.cos(b)).addScaledVector(B, -Math.sin(b));
  pose.F.copy(S);
  pose.B.copy(B2).normalize();
  pose.L.copy(L2).normalize();
  pose.E.copy(E).normalize();
  pose.press = st.press;
  return pose;
}

/** Busca el ángulo theta de la piel más cercano a un punto (proyección sobre la superficie). */
export function skinParamOf(p: Vector3): { x: number; theta: number } {
  return { x: p.x, theta: (Math.atan2(p.z, p.y) * 180) / Math.PI };
}
