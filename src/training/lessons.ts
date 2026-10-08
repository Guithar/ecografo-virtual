/**
 * Lecciones guiadas con comprobación automática de cada paso (aprendizaje práctico).
 */
import type { CaseDef } from '../anatomy/cases';
import type { AnatomyModel, Structure } from '../anatomy/model';
import { tr } from '../i18n';
import type { Needle } from '../interaction/needle';
import type { ProbeState } from '../interaction/probePose';
import type { SpectralDoppler } from '../sim/spectral';
import type { MachineSettings, ProbePose } from '../sim/UltrasoundSim';
import type { Caliper } from '../ui/monitor';

export interface LessonCtx {
  probe: ProbeState;
  settings: MachineSettings;
  pose: ProbePose;
  model: AnatomyModel;
  caseDef: CaseDef;
  access(): Structure | undefined;
  /** posición del vaso (centro) en la imagen si el plano lo corta */
  vesselInImage(id: string): { u: number; w: number; r: number; along: boolean } | null;
  needle(): Needle | null;
  calipers: Caliper[];
  spectral: SpectralDoppler;
  tourniquet: boolean;
  asepsis: boolean;
  labels: boolean;
  collapse(id: string): number;
  events: Set<string>;
  flags: Record<string, number>;
}

export interface LessonStep {
  /** admite `{{escritorio|móvil}}` (ver `deviceText`) */
  text: string;
  hint?: string;
  check?: (c: LessonCtx) => boolean;
  /** acción al comenzar el paso */
  enter?: (c: LessonCtx) => void;
}

export interface Lesson {
  id: string;
  title: string;
  caseId: string;
  mode: 'explore' | 'cannulate';
  summary: string;
  steps: LessonStep[];
}

const nearAccess = (c: LessonCtx) => {
  const a = c.access();
  if (!a) return null;
  return c.vesselInImage(a.def.id);
};

export const LESSONS: Lesson[] = [
  {
    id: 'orientacion',
    title: tr('1. Orientación: sonda, pantalla y paciente', '1. Orientation: probe, screen and patient'),
    caseId: 'rc_madura',
    mode: 'explore',
    summary: tr(
      'Relación entre lo que hacen tus manos y lo que ves en la pantalla. Marcador de la sonda y de la pantalla.',
      'How what your hands do relates to what you see on the screen. Probe and screen orientation markers.',
    ),
    steps: [
      {
        text: tr(
          'Observa la <b>vista 3D</b>: el plano azul es el corte que ve el ecógrafo. La luz verde de la sonda indica el <b>marcador</b>; en la pantalla corresponde al <b>punto</b> de la esquina superior izquierda.',
          'Look at the <b>3D view</b>: the blue plane is the slice the scanner sees. The green light on the probe shows the <b>orientation marker</b>; on the screen it matches the <b>dot</b> in the top-left corner.',
        ),
        hint: tr('Pulsa "Siguiente" cuando lo hayas identificado.', 'Press “Next” once you have identified it.'),
      },
      {
        text: tr(
          'Coloca la sonda en <b>transversal</b> {{(tecla 1)|(botón <b>Transv.</b>)}} y céntrala sobre la vena de la FAV: la vena debe quedar en el centro de la imagen (±4 mm).',
          'Place the probe in <b>short axis</b> {{(key 1)|(<b>Short</b> button)}} and center it over the AVF vein: the vein must sit in the middle of the image (±4 mm).',
        ),
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && Math.abs(v.u) < 4 && Math.abs(((c.probe.rot + 90) % 180) - 90) < 25;
        },
        hint: tr(
          '{{Usa A/D para deslizar alrededor del brazo, W/S a lo largo, o arrastra la sonda sobre la piel.|Toca el brazo en 3D para llevar la sonda y afina con <b>Alrededor</b> y <b>A lo largo</b> en la rueda de ajuste.}}',
          '{{Use A/D to slide around the arm, W/S to slide along it, or drag the probe over the skin.|Tap the arm in the 3D view to move the probe there, then fine-tune with <b>Around</b> and <b>Along</b> on the adjustment wheel.}}',
        ),
      },
      {
        text: tr(
          'Desliza la sonda <b>hacia el lado del marcador</b> (luz verde). Observa hacia qué lado de la pantalla se desplaza la vena: se desplaza hacia el lado <b>opuesto</b> al marcador, porque la sonda se mueve hacia él.',
          'Slide the probe <b>toward the marker side</b> (green light). Watch which way the vein moves on the screen: it shifts to the side <b>opposite</b> the marker, because the probe is moving toward that side.',
        ),
        check: (c) => {
          const v = nearAccess(c);
          return !!v && v.u > 6;
        },
      },
      {
        text: tr(
          'Activa <b>Invertir I/D</b> {{en la consola|en <b>Más → Imagen</b>}}. El marcador pasa a la derecha de la pantalla y los movimientos se ven al revés: por eso es importante comprobar la orientación antes de puncionar. Vuelve a desactivarlo.',
          'Turn on <b>Flip L/R</b> {{on the console|in <b>More → Image</b>}}. The marker moves to the right of the screen and movements appear reversed: that is why you must check orientation before cannulating. Then turn it off again.',
        ),
        check: (c) => (c.flags.flipSeen ?? 0) > 0 && !c.settings.flipLR,
      },
      {
        text: tr(
          'Gira la sonda a <b>longitudinal</b> {{(tecla 2)|(botón <b>Long.</b>)}}: la vena aparece como un tubo horizontal. {{Rota con Q/E|Gira con <b>Girar</b> en la rueda}} hasta ver la vena en toda la anchura de la imagen.',
          'Rotate the probe to <b>long axis</b> {{(key 2)|(<b>Long</b> button)}}: the vein appears as a horizontal tube. {{Rotate with Q/E|Use <b>Rotate</b> on the wheel}} until the vein spans the full width of the image.',
        ),
        check: (c) => {
          const v = nearAccess(c);
          return !!v && v.along;
        },
      },
      {
        text: tr(
          '{{Pasa al modo <b>Sala y ergonomía</b> y comprueba que la pantalla está en tu línea de visión, detrás del sitio de punción.|En la sala, la pantalla debe quedar en tu línea de visión, detrás del sitio de punción. En el ordenador puedes practicarlo en el modo <b>Sala y ergonomía</b>.}} ¡Lección completada!',
          '{{Switch to <b>Room &amp; ergonomics</b> mode and check that the screen is in your line of sight, behind the cannulation site.|In the room, the screen should be in your line of sight, behind the cannulation site. On a computer you can practice this in <b>Room &amp; ergonomics</b> mode.}} Lesson complete!',
        ),
      },
    ],
  },
  {
    id: 'knobologia',
    title: tr('2. Optimizar la imagen (knobología)', '2. Optimizing the image (knobology)'),
    caseId: 'bc_obeso',
    mode: 'explore',
    summary: tr('Profundidad, foco, ganancia, TGC y frecuencia en un vaso profundo.', 'Depth, focus, gain, TGC and frequency on a deep vessel.'),
    steps: [
      {
        text: tr('Centra la vena de la FAV en transversal.', 'Center the AVF vein in short axis.'),
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && Math.abs(v.u) < 5;
        },
      },
      {
        text: tr(
          'Ajusta la <b>profundidad</b> para que el vaso ocupe el centro-superior de la imagen: el borde profundo del vaso debe quedar por encima del 70 % de la profundidad.',
          'Adjust the <b>depth</b> so the vessel sits in the upper-middle part of the image: its deep edge must lie above 70% of the depth.',
        ),
        check: (c) => {
          const v = nearAccess(c);
          return !!v && (v.w + v.r) / c.settings.depth < 0.7 && (v.w + v.r) / c.settings.depth > 0.3;
        },
      },
      {
        text: tr(
          'Sitúa el <b>foco</b> a la altura de la pared posterior del vaso (±3 mm).',
          'Set the <b>focus</b> at the level of the vessel back wall (±3 mm).',
        ),
        check: (c) => {
          const v = nearAccess(c);
          return !!v && Math.abs(c.settings.focus - (v.w + v.r)) < 3;
        },
      },
      {
        text: tr(
          'Prueba la <b>frecuencia</b>{{| (en <b>Más → Imagen</b>)}}: a menor frecuencia más penetración y menos resolución. Déjala entre 10 y 12 MHz para este vaso profundo.',
          'Try the <b>frequency</b>{{| (in <b>More → Image</b>)}}: lower frequency gives more penetration and less resolution. Leave it between 10 and 12 MHz for this deep vessel.',
        ),
        check: (c) => c.settings.freq >= 9.5 && c.settings.freq <= 12.5 && (c.flags.freqChanged ?? 0) > 0,
      },
      {
        text: tr(
          'Ajusta la <b>ganancia</b>: la luz del vaso debe verse negra (anecoica) y el tejido gris medio. Una ganancia excesiva "rellena" la luz de ruido.',
          'Adjust the <b>gain</b>: the vessel lumen should look black (anechoic) and the tissue mid-gray. Excessive gain “fills” the lumen with noise.',
        ),
      },
    ],
  },
  {
    id: 'arteria-vena',
    title: tr('3. ¿Arteria o vena? Compresión y Doppler', '3. Artery or vein? Compression and Doppler'),
    caseId: 'normal',
    mode: 'explore',
    summary: tr(
      'Diferenciar arteria de vena: compresibilidad, pulsatilidad y patrón Doppler.',
      'Telling artery from vein: compressibility, pulsatility and Doppler pattern.',
    ),
    steps: [
      {
        text: tr(
          'Coloca la sonda en transversal en la muñeca sobre la arteria radial (activa las <b>etiquetas</b> si lo necesitas).',
          'Place the probe in short axis at the wrist over the radial artery (turn on <b>labels</b> if needed).',
        ),
        check: (c) => {
          const v = c.vesselInImage('a_radial');
          return !!v && Math.abs(v.u) < 8;
        },
      },
      {
        text: tr(
          'Aumenta la <b>presión</b> {{(tecla X)|(<b>Presión</b> en la rueda)}}. Observa cómo las <b>venas satélites</b> se colapsan mientras la arteria permanece redonda y pulsátil.',
          'Increase the <b>pressure</b> {{(key X)|(<b>Pressure</b> on the wheel)}}. Watch the <b>venae comitantes</b> collapse while the artery stays round and pulsatile.',
        ),
        check: (c) => c.collapse('v_radial_1') > 0.7 || c.collapse('v_radial_2') > 0.7,
      },
      {
        text: tr(
          'Reduce la presión {{(tecla Z)|}} y activa el <b>Doppler color</b>. Con la sonda perpendicular al vaso no hay color (ángulo de 90°): inclina la sonda {{(R/F)|(<b>Inclinar</b>)}} o angula la caja de color.',
          'Release the pressure {{(key Z)|}} and turn on <b>color Doppler</b>. With the probe perpendicular to the vessel there is no color (90° angle): tilt the probe {{(R/F)|(<b>Tilt</b>)}} or steer the color box.',
        ),
        check: (c) => c.settings.mode === 'color' && c.probe.press < 2,
      },
      {
        text: tr(
          'Activa el <b>Doppler pulsado (PW)</b>, sitúa el volumen de muestra dentro de la arteria ({{clic|toca}} sobre la imagen) y observa la onda <b>trifásica de alta resistencia</b> (IR ≈ 1).',
          'Turn on <b>pulsed-wave (PW) Doppler</b>, place the sample volume inside the artery ({{click|tap}} on the image) and observe the <b>triphasic, high-resistance</b> waveform (RI ≈ 1).',
        ),
        check: (c) => c.settings.pw && c.spectral.measures().valid,
      },
      {
        text: tr(
          'Ahora pon el volumen de muestra sobre una vena superficial: flujo continuo, de baja velocidad, que varía con la respiración.',
          'Now place the sample volume over a superficial vein: continuous, low-velocity flow that varies with respiration.',
        ),
      },
    ],
  },
  {
    id: 'madurez',
    title: tr('4. ¿Está madura la FAV? Regla de los 6', '4. Is the AVF mature? Rule of 6s'),
    caseId: 'rc_inmadura',
    mode: 'explore',
    summary: tr(
      'Diámetro, profundidad y flujo del acceso (Qa) con criterios KDOQI/GEMAV.',
      'Diameter, depth and access flow (Qa) against KDOQI/GEMAV criteria.',
    ),
    steps: [
      {
        text: tr(
          'Localiza la vena de la FAV en transversal a unos 8–10 cm de la anastomosis.',
          'Find the AVF vein in short axis about 8–10 cm from the anastomosis.',
        ),
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && c.probe.x > 70 && c.probe.x < 140;
        },
      },
      {
        text: tr(
          'Congela {{(barra espaciadora)|(botón <b>Congelar</b>)}} y mide el <b>diámetro</b> interno con {{el calibre|<b>Medir</b>, tocando dos puntos}} (pared interna a pared interna). Criterio: ≥ 6 mm (KDOQI) o ≥ 4–5 mm (GEMAV).',
          'Freeze {{(spacebar)|(<b>Freeze</b> button)}} and measure the inner <b>diameter</b> with {{the caliper|<b>Measure</b>, tapping two points}} (inner wall to inner wall). Criterion: ≥ 6 mm (KDOQI) or ≥ 4–5 mm (GEMAV).',
        ),
        check: (c) => c.calipers.some((k) => !!k.b),
      },
      {
        text: tr(
          'Mide la <b>profundidad</b>: de la piel a la pared anterior de la vena. Criterio: < 6 mm.',
          'Measure the <b>depth</b>: from the skin to the anterior wall of the vein. Criterion: < 6 mm.',
        ),
        check: (c) => c.calipers.filter((k) => !!k.b).length >= 2,
      },
      {
        text: tr(
          'Descongela. Mide el <b>flujo (Qa)</b> en la arteria humeral: eje largo, PW con el volumen de muestra cubriendo 50–70 % de la luz y corrección de ángulo ≤ 60°{{| (en <b>Más → Doppler</b>)}}. Mide también el diámetro humeral para que el equipo calcule el Qa.',
          'Unfreeze. Measure <b>access flow (Qa)</b> in the brachial artery: long axis, PW with the sample volume covering 50–70% of the lumen and angle correction ≤ 60°{{| (in <b>More → Doppler</b>)}}. Also measure the brachial diameter so the scanner can calculate Qa.',
        ),
        check: (c) => c.settings.pw && c.spectral.measures().valid && c.probe.x > 300,
      },
      {
        text: tr(
          'Conclusión: con diámetro < 4 mm y Qa < 500 mL/min la FAV <b>no es apta</b> para la punción. Valora la vena accesoria competidora.',
          'Conclusion: with a diameter < 4 mm and Qa < 500 mL/min, the AVF is <b>not suitable</b> for cannulation. Assess the competing accessory vein.',
        ),
      },
    ],
  },
  {
    id: 'eje-largo',
    title: tr('5. Abordaje longitudinal (en plano): el preferido', '5. Long-axis (in-plane) approach: the preferred one'),
    caseId: 'rc_madura',
    mode: 'cannulate',
    summary: tr(
      'Toda la aguja visible durante el trayecto. Es el abordaje preferido en la mayoría de las unidades (Nefrología al día).',
      'The whole needle stays visible along its path. The preferred approach in most units (Nefrología al día).',
    ),
    steps: [
      {
        text: tr(
          'Coloca la sonda en <b>longitudinal</b> {{(2)|(botón <b>Long.</b>)}} sobre un segmento recto de la vena, a ≥ 3 cm de la anastomosis. Aplica el <b>compresor</b> {{(K)|(botón <b>Compresor</b>)}}.',
          'Place the probe in <b>long axis</b> {{(2)|(<b>Long</b> button)}} over a straight segment of the vein, ≥ 3 cm from the anastomosis. Apply the <b>tourniquet</b> {{(K)|(<b>Tourniquet</b> button)}}.',
        ),
        check: (c) => {
          const v = nearAccess(c);
          return !!v && v.along && c.tourniquet;
        },
      },
      {
        text: tr(
          'Prepara la <b>asepsia</b>: piel desinfectada, funda estéril en la sonda y gel estéril (botón <b>Asepsia</b>).',
          'Set up <b>asepsis</b>: disinfected skin, sterile probe cover and sterile gel (<b>Asepsis</b> button).',
        ),
        check: (c) => c.asepsis,
      },
      {
        text: tr(
          'Sujeta la sonda con una mano y la aguja con la otra. Pulsa {{<b>N</b> o <b>Longitudinal · en plano</b>|<b>En plano</b>}}: la aguja entra por el extremo de la sonda, alineada con el haz.',
          'Hold the probe in one hand and the needle in the other. Press {{<b>N</b> or <b>Long axis · in-plane</b>|<b>In-plane</b>}}: the needle enters at the end of the probe, aligned with the beam.',
        ),
        check: (c) => !!c.needle()?.placed,
      },
      {
        text: tr(
          'Avanza viendo <b>toda la aguja</b> (línea hiperecogénica con reverberaciones). Si "desaparece", no la busques moviendo la aguja: corrige la sonda (deslizamiento/rotación mínimos).',
          'Advance while seeing the <b>whole needle</b> (a hyperechoic line with reverberations). If it “disappears”, do not hunt for it with the needle: adjust the probe (minimal slide/rotation).',
        ),
        check: (c) => (c.needle()?.depth ?? 0) > 6,
      },
      {
        text: tr(
          'Entra en la luz (reflujo), baja el ángulo y avanza por el centro de la vena.',
          'Enter the lumen (flashback), lower the angle and advance along the center of the vein.',
        ),
        check: (c) => c.needle()?.state === 'luz' && (c.needle()?.angle ?? 90) < 22,
      },
      {
        text: tr(
          'Comprueba la posición con un <b>lavado de suero</b> {{(J o botón <b>Suero</b>)|(botón <b>Suero</b>)}}: las microburbujas deben recorrer la luz aguas abajo de la punta, y en Doppler color aparece un chorro en la punta. Si el suero se acumula alrededor del vaso (halo anecoico), la punta está fuera de la luz: detén el lavado y recoloca.',
          'Check the position with a <b>saline flush</b> {{(J or <b>Saline</b> button)|(<b>Saline</b> button)}}: microbubbles should travel along the lumen downstream of the tip, and color Doppler shows a jet at the tip. If saline pools around the vessel (anechoic halo), the tip is outside the lumen: stop flushing and reposition.',
        ),
        check: (c) => c.events.has('flush'),
      },
      {
        text: tr('Confirma la punción.', 'Confirm the cannulation.'),
        check: (c) => !!c.needle()?.confirmed,
      },
    ],
  },
  {
    id: 'eje-corto',
    title: tr('6. Abordaje transversal (fuera de plano): seguir la punta', '6. Short-axis (out-of-plane) approach: tracking the tip'),
    caseId: 'rc_madura',
    mode: 'cannulate',
    summary: tr(
      'No se ve la entrada en la pared: hay que seguir la punta con posicionamiento dinámico (DNTP). Requiere más experiencia.',
      'Wall entry is not visible: you must track the tip with dynamic needle tip positioning (DNTP). Requires more experience.',
    ),
    steps: [
      {
        text: tr(
          'Centra la vena en <b>transversal</b> {{(1)|(botón <b>Transv.</b>)}} en el antebrazo medio (≥ 3 cm de la anastomosis). Aplica el <b>compresor</b> {{(tecla K)|(botón <b>Compresor</b>)}}.',
          'Center the vein in <b>short axis</b> {{(1)|(<b>Short</b> button)}} in the mid-forearm (≥ 3 cm from the anastomosis). Apply the <b>tourniquet</b> {{(key K)|(<b>Tourniquet</b> button)}}.',
        ),
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && Math.abs(v.u) < 3 && c.tourniquet;
        },
      },
      {
        text: tr(
          'Prepara la <b>asepsia</b>: piel desinfectada, funda estéril en la sonda y gel estéril (botón <b>Asepsia</b>).',
          'Set up <b>asepsis</b>: disinfected skin, sterile probe cover and sterile gel (<b>Asepsis</b> button).',
        ),
        check: (c) => c.asepsis,
      },
      {
        text: tr(
          'Pulsa {{<b>N</b> o <b>Transversal · fuera de plano</b>|<b>Fuera de plano</b>}}: la aguja se sitúa en la línea media de la sonda, a una distancia similar a la profundidad del vaso, con 30–40°.',
          'Press {{<b>N</b> or <b>Short axis · out-of-plane</b>|<b>Out-of-plane</b>}}: the needle is placed at the probe midline, at a distance similar to the vessel depth, at 30–40°.',
        ),
        check: (c) => !!c.needle()?.placed,
      },
      {
        text: tr(
          'Avanza la aguja {{(↑ o rueda)|(<b>Avance</b> en la rueda de ajuste)}} hasta ver aparecer un <b>punto hiperecogénico</b> con cola de cometa. ¿Es la punta o el cuerpo? Desliza la sonda hacia proximal {{(W)|(<b>A lo largo</b>)}} hasta que el punto desaparezca: justo antes de desaparecer está la punta.',
          'Advance the needle {{(↑ or mouse wheel)|(<b>Advance</b> on the adjustment wheel)}} until a <b>hyperechoic dot</b> with a comet tail appears. Is it the tip or the shaft? Slide the probe proximally {{(W)|(<b>Along</b>)}} until the dot disappears: the tip is the last point seen before it disappears.',
        ),
        check: (c) => (c.needle()?.depth ?? 0) > 3,
      },
      {
        text: tr(
          'Repite: avanza la aguja 1–2 mm y desliza la sonda hasta volver a ver la punta. Observa cómo la pared anterior se <b>indenta</b> ("signo de la tienda") antes de ceder: en este abordaje no se ve la entrada en la pared.',
          'Repeat: advance the needle 1–2 mm and slide the probe until you see the tip again. Watch the anterior wall <b>indent</b> (“tenting”) before it gives way: in this approach you do not see the needle enter the wall.',
        ),
        check: (c) => c.events.has('pop') || c.events.has('flash'),
      },
      {
        text: tr(
          'Al ver la punta en la luz y el <b>reflujo</b>, <b>baja el ángulo</b> {{(AvPág)|(<b>Ángulo</b> en la rueda)}} y avanza unos milímetros siguiendo la punta, sin tocar la pared posterior.',
          'Once you see the tip in the lumen and <b>flashback</b>, <b>lower the angle</b> {{(PgDn)|(<b>Angle</b> on the wheel)}} and advance a few millimeters following the tip, without touching the back wall.',
        ),
        check: (c) => (c.needle()?.state === 'luz' && (c.needle()?.angle ?? 90) < 22) || false,
      },
      {
        text: tr(
          'Pulsa <b>{{Confirmar punción|Confirmar}}</b> para evaluar el resultado.',
          'Press <b>{{Confirm cannulation|Confirm}}</b> to assess the result.',
        ),
        check: (c) => !!c.needle()?.confirmed,
      },
    ],
  },
  {
    id: 'artefactos',
    title: tr('7. Artefactos que debes reconocer', '7. Artifacts you must recognize'),
    caseId: 'rc_calcificada',
    mode: 'explore',
    summary: tr(
      'Sombra acústica, refuerzo posterior, sombra de borde, anisotropía y reverberación.',
      'Acoustic shadowing, posterior enhancement, edge shadowing, anisotropy and reverberation.',
    ),
    steps: [
      {
        text: tr(
          '<b>Sombra acústica</b>: busca el radio en transversal. Su cortical es muy ecogénica y debajo no hay señal. Las calcificaciones de la arteria radial producen sombras similares.',
          '<b>Acoustic shadowing</b>: find the radius in short axis. Its cortex is highly echogenic and there is no signal beneath it. Radial artery calcifications cast similar shadows.',
        ),
      },
      {
        text: tr(
          '<b>Refuerzo acústico posterior</b>: bajo la vena de la FAV el tejido se ve más brillante porque la sangre atenúa menos que el tejido.',
          '<b>Posterior acoustic enhancement</b>: beneath the AVF vein the tissue looks brighter because blood attenuates less than tissue.',
        ),
      },
      {
        text: tr(
          '<b>Sombra de borde</b>: finas sombras verticales bajo los bordes laterales de los vasos, por refracción e incidencia rasante.',
          '<b>Edge shadowing</b>: thin vertical shadows beneath the lateral edges of vessels, caused by refraction and grazing incidence.',
        ),
      },
      {
        text: tr(
          '<b>Anisotropía</b>: en la muñeca, inclina la sonda {{(R/F)|(<b>Inclinar</b>)}} sobre los tendones flexores. Con 10–20° se vuelven hipoecoicos y pueden confundirse con otras estructuras.',
          '<b>Anisotropy</b>: at the wrist, tilt the probe {{(R/F)|(<b>Tilt</b>)}} over the flexor tendons. At 10–20° they turn hypoechoic and can be mistaken for other structures.',
        ),
        check: (c) => Math.abs(c.probe.tilt) > 12 && c.probe.x < 60,
      },
      {
        text: tr(
          '<b>Reverberación</b>: en el modo Punción, la aguja genera bajo ella líneas paralelas equiespaciadas, separadas su diámetro interior y cada vez más tenues. Son más visibles con la aguja plana y sobre la luz del vaso. En eje corto forma una "cola de cometa".',
          '<b>Reverberation</b>: in Cannulation mode, the needle produces equally spaced parallel lines beneath it, one inner diameter apart and progressively fainter. They are most visible with a flat needle over the vessel lumen. In short axis it forms a “comet tail”.',
        ),
      },
      {
        text: tr(
          '<b>Grosor de corte (volumen parcial)</b>: por encima del foco de elevación el haz es más grueso; una aguja fuera del plano puede parecer dentro de la luz.',
          '<b>Slice thickness (partial volume)</b>: above the elevation focus the beam is thicker; a needle outside the plane can appear to be inside the lumen.',
        ),
      },
    ],
  },
  {
    id: 'doppler-fav',
    title: tr('8. Doppler en la FAV: estenosis y flujo', '8. AVF Doppler: stenosis and flow'),
    caseId: 'rc_estenosis',
    mode: 'explore',
    summary: tr('Aliasing, cociente de velocidades y medida de la VPS.', 'Aliasing, velocity ratio and PSV measurement.'),
    steps: [
      {
        text: tr(
          'Explora la anastomosis y el segmento de salida en longitudinal con <b>Doppler color</b>. Busca el <b>aliasing</b> (mosaico) en la estenosis.',
          'Scan the anastomosis and the outflow segment in long axis with <b>color Doppler</b>. Look for <b>aliasing</b> (mosaic pattern) at the stenosis.',
        ),
        check: (c) => c.settings.mode === 'color' && (nearAccess(c)?.along ?? false),
      },
      {
        text: tr(
          'Sube la <b>escala</b> (PRF){{| en <b>Más → Doppler</b>}} hasta que desaparezca el aliasing fuera de la estenosis.',
          'Raise the <b>scale</b> (PRF){{| in <b>More → Doppler</b>}} until the aliasing disappears outside the stenosis.',
        ),
        check: (c) => c.settings.scale >= 80,
      },
      {
        text: tr(
          'Con PW, mide la <b>VPS en la estenosis</b> con el cursor de ángulo alineado con el chorro (≤ 60°){{| (<b>Corr. ángulo</b> en <b>Más → Doppler</b>)}}.',
          'With PW, measure the <b>PSV at the stenosis</b> with the angle cursor aligned with the jet (≤ 60°){{| (<b>Angle corr.</b> in <b>More → Doppler</b>)}}.',
        ),
        check: (c) => c.settings.pw && c.spectral.measures().psv > 250,
      },
      {
        text: tr(
          'Mide la VPS 2 cm antes (arteria radial). Un cociente ≥ 3 en la zona anastomótica indica estenosis significativa (≥ 50 %).',
          'Measure the PSV 2 cm upstream (radial artery). A ratio ≥ 3 at the anastomotic region indicates significant stenosis (≥ 50%).',
        ),
      },
    ],
  },
];
