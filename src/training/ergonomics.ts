/**
 * Evaluación ergonómica de la disposición operador–paciente–pantalla.
 *
 * Principios:
 *  - Alineación "en línea": el eje visual del operador, el sitio de punción y la pantalla en línea para
 *    minimizar los giros de cabeza (Tsuchiya 2016: éxito 100 % vs 70 %; 28 s vs 68 s).
 *  - Pantalla a la altura de los ojos o algo por debajo, a una distancia de lectura de 50–100 cm
 *    (SDMS: estándares para la prevención de lesiones musculoesqueléticas en ecografía).
 *  - Orientación coherente: marcador de la sonda a la izquierda del operador ↔ indicador a la izquierda
 *    de la pantalla (ASRA/ESRA, NYSORA): lo que se mueve a la izquierda de las manos se ve a la izquierda.
 *  - Brazo del paciente apoyado, extendido y relajado; operador sentado, sin sobre-extender el hombro.
 */
import { Quaternion, Vector3 } from 'three';
import type { SceneManager } from '../scene/SceneManager';
import type { UltrasoundSim } from '../sim/UltrasoundSim';

export type Level = 'good' | 'fair' | 'bad' | 'info';

export interface ErgoItem {
  label: string;
  level: Level;
  value: string;
  advice: string;
}

export interface ErgoResult {
  items: ErgoItem[];
  score: number;
  gaze: { eye: Vector3; site: Vector3; screen: Vector3 };
}

const deg = (r: number) => (r * 180) / Math.PI;

export function evaluateErgonomics(sm: SceneManager, sim: UltrasoundSim): ErgoResult {
  const op = sm.room.operator;
  op.group.updateMatrixWorld(true);
  const eye = op.eye();
  const site = sm.armToWorld(sim.pose.F);
  const screen = sm.room.cart.screenCenter();
  const items: ErgoItem[] = [];
  const gs = site.clone().sub(eye);
  const gm = screen.clone().sub(eye);
  const hs = new Vector3(gs.x, 0, gs.z).normalize();
  const hm = new Vector3(gm.x, 0, gm.z).normalize();
  const az = deg(Math.acos(Math.max(-1, Math.min(1, hs.dot(hm)))));
  items.push({
    label: 'Alineación mirada: punción ↔ pantalla (horizontal)',
    level: az < 20 ? 'good' : az < 40 ? 'fair' : 'bad',
    value: `${az.toFixed(0)}°`,
    advice: az < 20 ? 'La pantalla está en línea con el sitio de punción.' : 'Coloca el ecógrafo al otro lado del brazo, detrás del sitio de punción, para no girar la cabeza.',
  });
  const tot = deg(gs.angleTo(gm));
  items.push({
    label: 'Desplazamiento total de la mirada',
    level: tot < 35 ? 'good' : tot < 60 ? 'fair' : 'bad',
    value: `${tot.toFixed(0)}°`,
    advice: tot < 35 ? 'Basta con mover los ojos.' : 'Acerca la pantalla a la línea visual (menos giro de cuello).',
  });
  const dist = gm.length();
  items.push({
    label: 'Distancia a la pantalla',
    level: dist >= 0.5 && dist <= 1.05 ? 'good' : dist >= 0.35 && dist <= 1.5 ? 'fair' : 'bad',
    value: `${(dist * 100).toFixed(0)} cm`,
    advice: dist > 1.05 ? 'Acerca el ecógrafo: a más de 1 m se pierden detalles finos.' : dist < 0.5 ? 'Aleja algo la pantalla.' : 'Distancia de lectura adecuada.',
  });
  const vert = deg(Math.atan2(gm.y, Math.hypot(gm.x, gm.z)));
  items.push({
    label: 'Altura de la pantalla (ángulo respecto a los ojos)',
    level: vert <= 5 && vert >= -30 ? 'good' : vert <= 15 && vert >= -45 ? 'fair' : 'bad',
    value: `${vert > 0 ? '+' : ''}${vert.toFixed(0)}°`,
    advice: vert > 5 ? 'La pantalla está por encima de los ojos: baja el monitor.' : vert < -30 ? 'La pantalla está demasiado baja: súbela.' : 'Altura cómoda (a la altura de los ojos o ligeramente por debajo).',
  });
  // orientación del monitor hacia el operador
  const head = sm.room.cart.monitor;
  const n = new Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new Quaternion()));
  const toEye = eye.clone().sub(screen).normalize();
  const face = deg(Math.acos(Math.max(-1, Math.min(1, n.dot(toEye)))));
  items.push({
    label: 'Orientación del monitor hacia el operador',
    level: face < 25 ? 'good' : face < 45 ? 'fair' : 'bad',
    value: `${face.toFixed(0)}°`,
    advice: face < 25 ? 'La pantalla mira al operador.' : 'Gira el monitor hacia ti para evitar reflejos y distorsión.',
  });
  // alcance
  const shoulder = eye.clone().add(new Vector3(0, -0.2, 0));
  const reach = new Vector3(site.x - shoulder.x, 0, site.z - shoulder.z).length();
  items.push({
    label: 'Alcance al sitio de punción',
    level: reach < 0.5 ? 'good' : reach < 0.65 ? 'fair' : 'bad',
    value: `${(reach * 100).toFixed(0)} cm`,
    advice: reach < 0.5 ? 'Brazos cerca del cuerpo, codos apoyables.' : 'Acércate: evita la abducción y extensión mantenidas del hombro.',
  });
  // congruencia de la orientación de la sonda
  const Lw = sm.dirArmToWorld(sim.pose.L);
  const fwd = op.forward();
  const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
  let c = Lw.dot(right);
  if (sim.settings.flipLR) c = -c;
  const trans = Math.abs(Lw.dot(right)) > 0.5;
  items.push({
    label: 'Orientación sonda ↔ pantalla',
    level: !trans ? 'info' : c > 0.5 ? 'good' : 'bad',
    value: !trans ? 'sonda alineada con la mirada' : c > 0.5 ? 'marcador a tu izquierda' : 'imagen invertida',
    advice: !trans
      ? 'En eje largo, orienta el marcador hacia el lado por el que entra la aguja para verla aparecer por ese lado de la pantalla.'
      : c > 0.5
        ? 'Lo que está a tu izquierda aparece a la izquierda de la pantalla.'
        : 'El marcador está a tu derecha: los movimientos se verán invertidos. Gira la sonda 180° o usa "Invertir I/D".',
  });
  const roll = sm.cfg.armRoll;
  items.push({
    label: 'Brazo del paciente',
    level: Math.abs(roll) < 25 ? 'good' : 'fair',
    value: `${sm.cfg.armPitch.toFixed(0)}° desc., ${roll.toFixed(0)}° rot.`,
    advice: 'Brazo apoyado en el soporte, extendido, relajado y con la zona de punción accesible.',
  });
  items.push({
    label: 'Postura del operador',
    level: sm.cfg.operator.seated ? 'good' : 'fair',
    value: sm.cfg.operator.seated ? 'sentado' : 'de pie',
    advice: sm.cfg.operator.seated ? 'Sentado con la espalda recta y los pies apoyados.' : 'Para procedimientos prolongados es preferible sentarse a la altura adecuada.',
  });
  const scored = items.filter((i) => i.level !== 'info');
  const score = Math.round((100 * scored.reduce((a, i) => a + (i.level === 'good' ? 1 : i.level === 'fair' ? 0.5 : 0), 0)) / Math.max(1, scored.length));
  return { items, score, gaze: { eye, site, screen } };
}
