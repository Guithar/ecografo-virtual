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
 *  - Brazo del paciente apoyado en una posición cómoda y relajada (VASBI 2018), en abducción moderada:
 *    los ≈ 45° del cuerpo son un criterio ergonómico del simulador; operador sentado, sin
 *    sobre-extender el hombro.
 */
import { Quaternion, Vector3 } from 'three';
import type { SceneManager } from '../scene/SceneManager';
import { armPositionOk } from './checklist';
import type { UltrasoundSim } from '../sim/UltrasoundSim';
import { tr } from '../i18n';

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
    label: tr('Alineación mirada: punción ↔ pantalla (horizontal)', 'Gaze alignment: site ↔ screen (horizontal)'),
    level: az < 20 ? 'good' : az < 40 ? 'fair' : 'bad',
    value: `${az.toFixed(0)}°`,
    advice:
      az < 20
        ? tr('La pantalla está en línea con el sitio de punción.', 'The screen is in line with the cannulation site.')
        : tr(
            'Coloca el ecógrafo al otro lado del brazo, detrás del sitio de punción, para no girar la cabeza.',
            'Place the scanner on the far side of the arm, behind the cannulation site, so you do not have to turn your head.',
          ),
  });
  const tot = deg(gs.angleTo(gm));
  items.push({
    label: tr('Desplazamiento total de la mirada', 'Total gaze shift'),
    level: tot < 45 ? 'good' : tot < 70 ? 'fair' : 'bad',
    value: `${tot.toFixed(0)}°`,
    advice:
      tot < 45
        ? tr('Basta con mover los ojos (sin girar la cabeza).', 'Moving your eyes is enough (no head turning).')
        : tr(
            'Acerca la pantalla a la línea visual y bájala hacia el campo de trabajo (menos giro de cuello).',
            'Bring the screen closer to your line of sight and lower it toward the work field (less neck rotation).',
          ),
  });
  const dist = gm.length();
  items.push({
    label: tr('Distancia a la pantalla', 'Distance to the screen'),
    level: dist >= 0.5 && dist <= 1.05 ? 'good' : dist >= 0.35 && dist <= 1.5 ? 'fair' : 'bad',
    value: `${(dist * 100).toFixed(0)} cm`,
    advice:
      dist > 1.05
        ? tr('Acerca el ecógrafo: a más de 1 m se pierden detalles finos.', 'Move the scanner closer: beyond 1 m, fine detail is lost.')
        : dist < 0.5
          ? tr('Aleja algo la pantalla.', 'Move the screen a little farther away.')
          : tr('Distancia de lectura adecuada.', 'Appropriate reading distance.'),
  });
  const vert = deg(Math.atan2(gm.y, Math.hypot(gm.x, gm.z)));
  items.push({
    label: tr('Altura de la pantalla (ángulo respecto a los ojos)', 'Screen height (angle relative to the eyes)'),
    level: vert <= 5 && vert >= -35 ? 'good' : vert <= 15 && vert >= -50 ? 'fair' : 'bad',
    value: `${vert > 0 ? '+' : ''}${vert.toFixed(0)}°`,
    advice:
      vert > 5
        ? tr('La pantalla está por encima de los ojos: baja el monitor.', 'The screen is above eye level: lower the monitor.')
        : vert < -35
          ? tr('La pantalla está demasiado baja: súbela.', 'The screen is too low: raise it.')
          : tr(
              'Altura cómoda (a la altura de los ojos o algo por debajo, hacia el campo de trabajo).',
              'Comfortable height (at or slightly below eye level, toward the work field).',
            ),
  });
  // orientación del monitor hacia el operador
  const head = sm.room.cart.monitor;
  const n = new Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new Quaternion()));
  const toEye = eye.clone().sub(screen).normalize();
  const face = deg(Math.acos(Math.max(-1, Math.min(1, n.dot(toEye)))));
  items.push({
    label: tr('Orientación del monitor hacia el operador', 'Monitor facing the operator'),
    level: face < 25 ? 'good' : face < 45 ? 'fair' : 'bad',
    value: `${face.toFixed(0)}°`,
    advice:
      face < 25
        ? tr('La pantalla mira al operador.', 'The screen faces the operator.')
        : tr('Gira el monitor hacia ti para evitar reflejos y distorsión.', 'Turn the monitor toward you to avoid glare and distortion.'),
  });
  // alcance
  const shoulder = eye.clone().add(new Vector3(0, -0.2, 0));
  const reach = new Vector3(site.x - shoulder.x, 0, site.z - shoulder.z).length();
  items.push({
    label: tr('Alcance al sitio de punción', 'Reach to the cannulation site'),
    level: reach < 0.5 ? 'good' : reach < 0.65 ? 'fair' : 'bad',
    value: `${(reach * 100).toFixed(0)} cm`,
    advice:
      reach < 0.5
        ? tr('Brazos cerca del cuerpo, codos apoyables.', 'Arms close to the body, elbows can be supported.')
        : tr('Acércate: evita la abducción y extensión mantenidas del hombro.', 'Move closer: avoid sustained shoulder abduction and extension.'),
  });
  // congruencia de la orientación de la sonda
  const Lw = sm.dirArmToWorld(sim.pose.L);
  const fwd = op.forward();
  const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
  let c = Lw.dot(right);
  if (sim.settings.flipLR) c = -c;
  const trans = Math.abs(Lw.dot(right)) > 0.5;
  items.push({
    label: tr('Orientación sonda ↔ pantalla', 'Probe ↔ screen orientation'),
    level: !trans ? 'info' : c > 0.5 ? 'good' : 'bad',
    value: !trans
      ? tr('sonda alineada con la mirada', 'probe aligned with your gaze')
      : c > 0.5
        ? tr('marcador a tu izquierda', 'marker on your left')
        : tr('imagen invertida', 'image reversed'),
    advice: !trans
      ? tr(
          'En eje largo, orienta el marcador hacia el lado por el que entra la aguja para verla aparecer por ese lado de la pantalla.',
          'In long axis, point the marker toward the side the needle enters from, so the needle appears on that side of the screen.',
        )
      : c > 0.5
        ? tr('Lo que está a tu izquierda aparece a la izquierda de la pantalla.', 'What is on your left appears on the left of the screen.')
        : tr(
            'El marcador está a tu derecha: los movimientos se verán invertidos. Gira la sonda 180° o usa "Invertir I/D".',
            'The marker is on your right: movements will appear reversed. Rotate the probe 180° or use “Flip L/R”.',
          ),
  });
  // brazo apoyado, cómodo y relajado (VASBI 2018); los ≈ 45° del cuerpo son el criterio del simulador
  const roll = sm.cfg.armRoll;
  const armAngle = 90 - sm.cfg.armYaw;
  const pitch = sm.cfg.armPitch;
  const armOk = armPositionOk(armAngle, pitch);
  const armNear = armAngle >= 20 && armAngle <= 70 && pitch <= 35;
  items.push({
    label: tr('Brazo del paciente (≈ 45° del cuerpo, apoyado)', "Patient's arm (≈ 45° from the body, supported)"),
    level: armOk && Math.abs(roll) < 25 ? 'good' : armNear ? 'fair' : 'bad',
    value: tr(
      `${armAngle.toFixed(0)}° con el cuerpo, ${pitch.toFixed(0)}° desc., ${roll.toFixed(0)}° rot.`,
      `${armAngle.toFixed(0)}° from the body, ${pitch.toFixed(0)}° down, ${roll.toFixed(0)}° rot.`,
    ),
    advice: armOk
      ? tr(
          'Brazo apoyado en una superficie firme y plana, a unos 45° del cuerpo, extendido y relajado.',
          'Arm supported on a firm, flat surface, about 45° from the body, extended and relaxed.',
        )
      : armAngle > 60
        ? tr(
            'Acerca el brazo al cuerpo hasta unos 45°: en cruz el hombro se cansa y la zona queda lejos.',
            'Bring the arm closer to the body, to about 45°: fully abducted, the shoulder tires and the site is hard to reach.',
          )
        : armAngle < 30
          ? tr(
              'Separa el brazo del cuerpo hasta unos 45°, apoyado en una superficie firme y plana.',
              'Move the arm away from the body to about 45°, supported on a firm, flat surface.',
            )
          : tr('Apoya el brazo en una superficie firme y plana, sin que cuelgue.', 'Rest the arm on a firm, flat surface so that it does not hang.'),
  });
  items.push({
    label: tr('Postura del operador', 'Operator posture'),
    level: sm.cfg.operator.seated ? 'good' : 'fair',
    value: sm.cfg.operator.seated ? tr('sentado', 'seated') : tr('de pie', 'standing'),
    advice: sm.cfg.operator.seated
      ? tr('Sentado con la espalda recta y los pies apoyados.', 'Seated with a straight back and feet supported.')
      : tr('Para procedimientos prolongados es preferible sentarse a la altura adecuada.', 'For long procedures, sitting at the right height is preferable.'),
  });
  const scored = items.filter((i) => i.level !== 'info');
  const score = Math.round((100 * scored.reduce((a, i) => a + (i.level === 'good' ? 1 : i.level === 'fair' ? 0.5 : 0), 0)) / Math.max(1, scored.length));
  return { items, score, gaze: { eye, site, screen } };
}
