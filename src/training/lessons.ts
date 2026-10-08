/**
 * Lecciones guiadas con comprobación automática de cada paso (aprendizaje práctico).
 */
import type { CaseDef } from '../anatomy/cases';
import type { AnatomyModel, Structure } from '../anatomy/model';
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
    title: '1. Orientación: sonda, pantalla y paciente',
    caseId: 'rc_madura',
    mode: 'explore',
    summary: 'Relación entre lo que hacen tus manos y lo que ves en la pantalla. Marcador de la sonda y de la pantalla.',
    steps: [
      {
        text: 'Observa la <b>vista 3D</b>: el plano azul es el corte que ve el ecógrafo. La luz verde de la sonda indica el <b>marcador</b>; en la pantalla corresponde al <b>punto</b> de la esquina superior izquierda.',
        hint: 'Pulsa "Siguiente" cuando lo hayas identificado.',
      },
      {
        text: 'Coloca la sonda en <b>transversal</b> {{(tecla 1)|(botón <b>Transv.</b>)}} y céntrala sobre la vena de la FAV: la vena debe quedar en el centro de la imagen (±4 mm).',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && Math.abs(v.u) < 4 && Math.abs(((c.probe.rot + 90) % 180) - 90) < 25;
        },
        hint: '{{Usa A/D para deslizar alrededor del brazo, W/S a lo largo, o arrastra la sonda sobre la piel.|Toca el brazo en 3D para llevar la sonda y afina con <b>Alrededor</b> y <b>A lo largo</b> en la rueda de ajuste.}}',
      },
      {
        text: 'Desliza la sonda <b>hacia el lado del marcador</b> (luz verde). Observa hacia qué lado de la pantalla se desplaza la vena: se desplaza hacia el lado <b>opuesto</b> al marcador, porque la sonda se mueve hacia él.',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && v.u > 6;
        },
      },
      {
        text: 'Activa <b>Invertir I/D</b> {{en la consola|en <b>Más → Imagen</b>}}. El marcador pasa a la derecha de la pantalla y los movimientos se ven al revés: por eso es importante comprobar la orientación antes de puncionar. Vuelve a desactivarlo.',
        check: (c) => (c.flags.flipSeen ?? 0) > 0 && !c.settings.flipLR,
      },
      {
        text: 'Gira la sonda a <b>longitudinal</b> {{(tecla 2)|(botón <b>Long.</b>)}}: la vena aparece como un tubo horizontal. {{Rota con Q/E|Gira con <b>Girar</b> en la rueda}} hasta ver la vena en toda la anchura de la imagen.',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && v.along;
        },
      },
      {
        text: '{{Pasa al modo <b>Sala y ergonomía</b> y comprueba que la pantalla está en tu línea de visión, detrás del sitio de punción.|En la sala, la pantalla debe quedar en tu línea de visión, detrás del sitio de punción. En el ordenador puedes practicarlo en el modo <b>Sala y ergonomía</b>.}} ¡Lección completada!',
      },
    ],
  },
  {
    id: 'knobologia',
    title: '2. Optimizar la imagen (knobología)',
    caseId: 'bc_obeso',
    mode: 'explore',
    summary: 'Profundidad, foco, ganancia, TGC y frecuencia en un vaso profundo.',
    steps: [
      {
        text: 'Centra la vena de la FAV en transversal.',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && Math.abs(v.u) < 5;
        },
      },
      {
        text: 'Ajusta la <b>profundidad</b> para que el vaso ocupe el centro-superior de la imagen: el borde profundo del vaso debe quedar por encima del 70 % de la profundidad.',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && (v.w + v.r) / c.settings.depth < 0.7 && (v.w + v.r) / c.settings.depth > 0.3;
        },
      },
      {
        text: 'Sitúa el <b>foco</b> a la altura de la pared posterior del vaso (±3 mm).',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && Math.abs(c.settings.focus - (v.w + v.r)) < 3;
        },
      },
      {
        text: 'Prueba la <b>frecuencia</b>{{| (en <b>Más → Imagen</b>)}}: a menor frecuencia más penetración y menos resolución. Déjala entre 10 y 12 MHz para este vaso profundo.',
        check: (c) => c.settings.freq >= 9.5 && c.settings.freq <= 12.5 && (c.flags.freqChanged ?? 0) > 0,
      },
      {
        text: 'Ajusta la <b>ganancia</b>: la luz del vaso debe verse negra (anecoica) y el tejido gris medio. Una ganancia excesiva "rellena" la luz de ruido.',
      },
    ],
  },
  {
    id: 'arteria-vena',
    title: '3. ¿Arteria o vena? Compresión y Doppler',
    caseId: 'normal',
    mode: 'explore',
    summary: 'Diferenciar arteria de vena: compresibilidad, pulsatilidad y patrón Doppler.',
    steps: [
      {
        text: 'Coloca la sonda en transversal en la muñeca sobre la arteria radial (activa las <b>etiquetas</b> si lo necesitas).',
        check: (c) => {
          const v = c.vesselInImage('a_radial');
          return !!v && Math.abs(v.u) < 8;
        },
      },
      {
        text: 'Aumenta la <b>presión</b> {{(tecla X)|(<b>Presión</b> en la rueda)}}. Observa cómo las <b>venas satélites</b> se colapsan mientras la arteria permanece redonda y pulsátil.',
        check: (c) => c.collapse('v_radial_1') > 0.7 || c.collapse('v_radial_2') > 0.7,
      },
      {
        text: 'Reduce la presión {{(tecla Z)|}} y activa el <b>Doppler color</b>. Con la sonda perpendicular al vaso no hay color (ángulo de 90°): inclina la sonda {{(R/F)|(<b>Inclinar</b>)}} o angula la caja de color.',
        check: (c) => c.settings.mode === 'color' && c.probe.press < 2,
      },
      {
        text: 'Activa el <b>Doppler pulsado (PW)</b>, sitúa el volumen de muestra dentro de la arteria ({{clic|toca}} sobre la imagen) y observa la onda <b>trifásica de alta resistencia</b> (IR ≈ 1).',
        check: (c) => c.settings.pw && c.spectral.measures().valid,
      },
      {
        text: 'Ahora pon el volumen de muestra sobre una vena superficial: flujo continuo, de baja velocidad, que varía con la respiración.',
      },
    ],
  },
  {
    id: 'madurez',
    title: '4. ¿Está madura la FAV? Regla de los 6',
    caseId: 'rc_inmadura',
    mode: 'explore',
    summary: 'Diámetro, profundidad y flujo del acceso (Qa) con criterios KDOQI/GEMAV.',
    steps: [
      {
        text: 'Localiza la vena de la FAV en transversal a unos 8–10 cm de la anastomosis.',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && c.probe.x > 70 && c.probe.x < 140;
        },
      },
      {
        text: 'Congela {{(barra espaciadora)|(botón <b>Congelar</b>)}} y mide el <b>diámetro</b> interno con {{el calibre|<b>Medir</b>, tocando dos puntos}} (pared interna a pared interna). Criterio: ≥ 6 mm (KDOQI) o ≥ 4–5 mm (GEMAV).',
        check: (c) => c.calipers.some((k) => !!k.b),
      },
      {
        text: 'Mide la <b>profundidad</b>: de la piel a la pared anterior de la vena. Criterio: < 6 mm.',
        check: (c) => c.calipers.filter((k) => !!k.b).length >= 2,
      },
      {
        text: 'Descongela. Mide el <b>flujo (Qa)</b> en la arteria humeral: eje largo, PW con el volumen de muestra cubriendo 50–70 % de la luz y corrección de ángulo ≤ 60°{{| (en <b>Más → Doppler</b>)}}. Mide también el diámetro humeral para que el equipo calcule el Qa.',
        check: (c) => c.settings.pw && c.spectral.measures().valid && c.probe.x > 300,
      },
      {
        text: 'Conclusión: con diámetro < 4 mm y Qa < 500 mL/min la FAV <b>no es apta</b> para la punción. Valora la vena accesoria competidora.',
      },
    ],
  },
  {
    id: 'eje-corto',
    title: '5. Punción en eje corto con posicionamiento dinámico de la punta (DNTP)',
    caseId: 'rc_madura',
    mode: 'cannulate',
    summary: 'Abordaje fuera de plano siguiendo la punta de la aguja.',
    steps: [
      {
        text: 'Centra la vena en transversal en el antebrazo medio (≥ 3 cm de la anastomosis). Aplica el <b>compresor</b> {{(tecla K)|(botón <b>Compresor</b>)}}.',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && Math.abs(v.u) < 3 && c.tourniquet;
        },
      },
      {
        text: 'Pulsa <b>{{Colocar aguja (fuera de plano)|Fuera de plano}}</b>: la aguja se sitúa en la línea media de la sonda, a una distancia similar a la profundidad del vaso, con 30–40°.',
        check: (c) => !!c.needle()?.placed,
      },
      {
        text: 'Avanza la aguja {{(↑ o rueda)|(<b>Avance</b> en la rueda de ajuste)}} hasta ver aparecer un <b>punto hiperecogénico</b> con cola de cometa. ¿Es la punta o el cuerpo? Desliza la sonda hacia proximal {{(W)|(<b>A lo largo</b>)}} hasta que el punto desaparezca: justo antes de desaparecer está la punta.',
        check: (c) => (c.needle()?.depth ?? 0) > 3,
      },
      {
        text: 'Repite: avanza la aguja 1–2 mm y desliza la sonda hasta volver a ver la punta. Observa cómo la pared anterior se <b>indenta</b> ("signo de la tienda") antes de ceder.',
        check: (c) => c.events.has('pop') || c.events.has('flash'),
      },
      {
        text: 'Al ver la punta en la luz y el <b>reflujo</b>, <b>baja el ángulo</b> {{(AvPág)|(<b>Ángulo</b> en la rueda)}} y avanza unos milímetros siguiendo la punta, sin tocar la pared posterior.',
        check: (c) => (c.needle()?.state === 'luz' && (c.needle()?.angle ?? 90) < 22) || false,
      },
      {
        text: 'Pulsa <b>{{Confirmar punción|Confirmar}}</b> para evaluar el resultado.',
        check: (c) => !!c.needle()?.confirmed,
      },
    ],
  },
  {
    id: 'eje-largo',
    title: '6. Punción en eje largo (en plano)',
    caseId: 'rc_madura',
    mode: 'cannulate',
    summary: 'Toda la aguja visible: alineación sonda-aguja.',
    steps: [
      {
        text: 'Coloca la sonda en longitudinal sobre un segmento recto de la vena (≥ 3 cm de la anastomosis).',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && v.along;
        },
      },
      {
        text: 'Pulsa <b>{{Colocar aguja (en plano)|En plano}}</b>: entra por el extremo de la sonda, alineada con el haz.',
        check: (c) => !!c.needle()?.placed,
      },
      {
        text: 'Avanza viendo <b>toda la aguja</b> (línea hiperecogénica con reverberaciones). Si "desaparece", no la busques moviendo la aguja: corrige la sonda (deslizamiento/rotación mínimos).',
        check: (c) => (c.needle()?.depth ?? 0) > 6,
      },
      {
        text: 'Entra en la luz (reflujo), baja el ángulo y avanza por el centro de la vena.',
        check: (c) => c.needle()?.state === 'luz' && (c.needle()?.angle ?? 90) < 22,
      },
      {
        text: 'Confirma la punción.',
        check: (c) => !!c.needle()?.confirmed,
      },
    ],
  },
  {
    id: 'artefactos',
    title: '7. Artefactos que debes reconocer',
    caseId: 'rc_calcificada',
    mode: 'explore',
    summary: 'Sombra acústica, refuerzo posterior, sombra de borde, anisotropía y reverberación.',
    steps: [
      {
        text: '<b>Sombra acústica</b>: busca el radio en transversal. Su cortical es muy ecogénica y debajo no hay señal. Las calcificaciones de la arteria radial producen sombras similares.',
      },
      {
        text: '<b>Refuerzo acústico posterior</b>: bajo la vena de la FAV el tejido se ve más brillante porque la sangre atenúa menos que el tejido.',
      },
      {
        text: '<b>Sombra de borde</b>: finas sombras verticales bajo los bordes laterales de los vasos, por refracción e incidencia rasante.',
      },
      {
        text: '<b>Anisotropía</b>: en la muñeca, inclina la sonda {{(R/F)|(<b>Inclinar</b>)}} sobre los tendones flexores. Con 10–20° se vuelven hipoecoicos y pueden confundirse con otras estructuras.',
        check: (c) => Math.abs(c.probe.tilt) > 12 && c.probe.x < 60,
      },
      {
        text: '<b>Reverberación</b>: en el modo Punción, la aguja genera líneas paralelas equiespaciadas bajo ella (un diámetro de separación) y una "cola de cometa" en eje corto.',
      },
      {
        text: '<b>Grosor de corte (volumen parcial)</b>: por encima del foco de elevación el haz es más grueso; una aguja fuera del plano puede parecer dentro de la luz.',
      },
    ],
  },
  {
    id: 'doppler-fav',
    title: '8. Doppler en la FAV: estenosis y flujo',
    caseId: 'rc_estenosis',
    mode: 'explore',
    summary: 'Aliasing, cociente de velocidades y medida de la VPS.',
    steps: [
      {
        text: 'Explora la anastomosis y el segmento de salida en longitudinal con <b>Doppler color</b>. Busca el <b>aliasing</b> (mosaico) en la estenosis.',
        check: (c) => c.settings.mode === 'color' && (nearAccess(c)?.along ?? false),
      },
      {
        text: 'Sube la <b>escala</b> (PRF){{| en <b>Más → Doppler</b>}} hasta que desaparezca el aliasing fuera de la estenosis.',
        check: (c) => c.settings.scale >= 80,
      },
      {
        text: 'Con PW, mide la <b>VPS en la estenosis</b> con el cursor de ángulo alineado con el chorro (≤ 60°){{| (<b>Corr. ángulo</b> en <b>Más → Doppler</b>)}}.',
        check: (c) => c.settings.pw && c.spectral.measures().psv > 250,
      },
      {
        text: 'Mide la VPS 2 cm antes (arteria radial). Un cociente ≥ 3 en la zona anastomótica indica estenosis significativa (≥ 50 %).',
      },
    ],
  },
];
