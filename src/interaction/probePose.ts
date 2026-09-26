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

/**
 * Punto de apoyo en la piel cuya normal pasa por un punto interior p: con la sonda ahí (sin
 * inclinar), p queda en el eje del haz, en el centro de la imagen transversal y dentro del plano
 * longitudinal. La proyección polar (skinParamOf) no basta: la sección del brazo es elíptica, su
 * normal se desvía del radio y deja un vaso a 6 mm de profundidad casi 2 mm fuera del plano.
 */
export function skinParamAbove(arm: ArmShape, p: Vector3): { x: number; theta: number } {
  const par = skinParamOf(p);
  const d = new Vector3();
  for (let i = 0; i < 8; i++) {
    const f = arm.skinFrame(par.x, par.theta);
    d.subVectors(p, f.S);
    const offT = d.dot(f.Tt);
    const offX = d.dot(f.Tx);
    if (Math.abs(offT) < 0.01 && Math.abs(offX) < 0.01) break;
    // longitud de piel por grado de theta en este punto
    const mmPerDeg = arm.surfacePoint(par.x, par.theta + 0.5, 'skin').distanceTo(arm.surfacePoint(par.x, par.theta - 0.5, 'skin'));
    par.theta += offT / Math.max(mmPerDeg, 1e-3);
    par.x += offX;
  }
  return par;
}
