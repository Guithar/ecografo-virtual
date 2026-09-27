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
  asepsis: boolean;
  labels: boolean;
  collapse(id: string): number;
  events: Set<string>;
  flags: Record<string, number>;
}

export interface LessonStep {
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
        text: 'Coloca la sonda en <b>transversal</b> (tecla 1) y céntrala sobre la vena de la FAV: la vena debe quedar en el centro de la imagen (±4 mm).',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && Math.abs(v.u) < 4 && Math.abs(((c.probe.rot + 90) % 180) - 90) < 25;
        },
        hint: 'Usa A/D para deslizar alrededor del brazo, W/S a lo largo, o arrastra la sonda sobre la piel.',
      },
      {
        text: 'Desliza la sonda <b>hacia el lado del marcador</b> (luz verde). Observa hacia qué lado de la pantalla se desplaza la vena: se desplaza hacia el lado <b>opuesto</b> al marcador, porque la sonda se mueve hacia él.',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && v.u > 6;
        },
      },
      {
        text: 'Activa <b>Invertir I/D</b> en la consola. El marcador pasa a la derecha de la pantalla y los movimientos se ven al revés: por eso es importante comprobar la orientación antes de puncionar. Vuelve a desactivarlo.',
        check: (c) => (c.flags.flipSeen ?? 0) > 0 && !c.settings.flipLR,
      },
      {
        text: 'Gira la sonda a <b>longitudinal</b> (tecla 2): la vena aparece como un tubo horizontal. Rota con Q/E hasta ver la vena en toda la anchura de la imagen.',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && v.along;
        },
      },
      {
        text: 'Pasa al modo <b>Sala y ergonomía</b> y comprueba que la pantalla está en tu línea de visión, detrás del sitio de punción. ¡Lección completada!',
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
        text: 'Prueba la <b>frecuencia</b>: a menor frecuencia más penetración y menos resolución. Déjala entre 10 y 12 MHz para este vaso profundo.',
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
        text: 'Aumenta la <b>presión</b> (tecla X). Observa cómo las <b>venas satélites</b> se colapsan mientras la arteria permanece redonda y pulsátil.',
        check: (c) => c.collapse('v_radial_1') > 0.7 || c.collapse('v_radial_2') > 0.7,
      },
      {
        text: 'Reduce la presión (tecla Z) y activa el <b>Doppler color</b>. Con la sonda perpendicular al vaso no hay color (ángulo de 90°): inclina la sonda (R/F) o angula la caja de color.',
        check: (c) => c.settings.mode === 'color' && c.probe.press < 2,
      },
      {
        text: 'Activa el <b>Doppler pulsado (PW)</b>, sitúa el volumen de muestra dentro de la arteria (clic sobre la imagen) y observa la onda <b>trifásica de alta resistencia</b> (IR ≈ 1).',
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
        text: 'Congela (barra espaciadora) y mide el <b>diámetro</b> interno con el calibre (pared interna a pared interna). Criterio: ≥ 6 mm (KDOQI) o ≥ 4–5 mm (GEMAV).',
        check: (c) => c.calipers.some((k) => !!k.b),
      },
      {
        text: 'Mide la <b>profundidad</b>: de la piel a la pared anterior de la vena. Criterio: < 6 mm.',
        check: (c) => c.calipers.filter((k) => !!k.b).length >= 2,
      },
      {
        text: 'Descongela. Mide el <b>flujo (Qa)</b> en la arteria humeral: eje largo, PW con el volumen de muestra cubriendo 50–70 % de la luz y corrección de ángulo ≤ 60°. Mide también el diámetro humeral para que el equipo calcule el Qa.',
        check: (c) => c.settings.pw && c.spectral.measures().valid && c.probe.x > 300,
      },
      {
        text: 'Conclusión: con diámetro < 4 mm y Qa < 500 mL/min la FAV <b>no es apta</b> para la punción. Valora la vena accesoria competidora.',
      },
    ],
  },
  {
    id: 'eje-largo',
    title: '5. Abordaje longitudinal (en plano): el preferido',
    caseId: 'rc_madura',
    mode: 'cannulate',
    summary: 'Toda la aguja visible durante el trayecto. Es el abordaje preferido en la mayoría de las unidades (Nefrología al día).',
    steps: [
      {
        text: 'Coloca la sonda en <b>longitudinal</b> (2) sobre un segmento recto de la vena, a ≥ 3 cm de la anastomosis. Aplica el <b>compresor</b> (K).',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && v.along && c.tourniquet;
        },
      },
      {
        text: 'Prepara la <b>asepsia</b>: piel desinfectada, funda estéril en la sonda y gel estéril (botón <b>Asepsia</b>).',
        check: (c) => c.asepsis,
      },
      {
        text: 'Sujeta la sonda con una mano y la aguja con la otra. Pulsa <b>N</b> o <b>Longitudinal · en plano</b>: la aguja entra por el extremo de la sonda, alineada con el haz.',
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
        text: 'Comprueba la posición con un <b>lavado de suero</b> (J o botón <b>Suero</b>): las microburbujas deben recorrer la luz aguas abajo de la punta, y en Doppler color aparece un chorro en la punta. Si el suero se acumula alrededor del vaso (halo anecoico), la punta está fuera de la luz: detén el lavado y recoloca.',
        check: (c) => c.events.has('flush'),
      },
      {
        text: 'Confirma la punción.',
        check: (c) => !!c.needle()?.confirmed,
      },
    ],
  },
  {
    id: 'eje-corto',
    title: '6. Abordaje transversal (fuera de plano): seguir la punta',
    caseId: 'rc_madura',
    mode: 'cannulate',
    summary: 'No se ve la entrada en la pared: hay que seguir la punta con posicionamiento dinámico (DNTP). Requiere más experiencia.',
    steps: [
      {
        text: 'Centra la vena en <b>transversal</b> (1) en el antebrazo medio (≥ 3 cm de la anastomosis). Aplica el <b>compresor</b> (tecla K).',
        check: (c) => {
          const v = nearAccess(c);
          return !!v && !v.along && Math.abs(v.u) < 3 && c.tourniquet;
        },
      },
      {
        text: 'Prepara la <b>asepsia</b>: piel desinfectada, funda estéril en la sonda y gel estéril (botón <b>Asepsia</b>).',
        check: (c) => c.asepsis,
      },
      {
        text: 'Pulsa <b>N</b> o <b>Transversal · fuera de plano</b>: la aguja se sitúa en la línea media de la sonda, a una distancia similar a la profundidad del vaso, con 30–40°.',
        check: (c) => !!c.needle()?.placed,
      },
      {
        text: 'Avanza la aguja (↑ o rueda) hasta ver aparecer un <b>punto hiperecogénico</b> con cola de cometa. ¿Es la punta o el cuerpo? Desliza la sonda hacia proximal (W) hasta que el punto desaparezca: justo antes de desaparecer está la punta.',
        check: (c) => (c.needle()?.depth ?? 0) > 3,
      },
      {
        text: 'Repite: avanza la aguja 1–2 mm y desliza la sonda hasta volver a ver la punta. Observa cómo la pared anterior se <b>indenta</b> ("signo de la tienda") antes de ceder: en este abordaje no se ve la entrada en la pared.',
        check: (c) => c.events.has('pop') || c.events.has('flash'),
      },
      {
        text: 'Al ver la punta en la luz y el <b>reflujo</b>, <b>baja el ángulo</b> (PgDn) y avanza unos milímetros siguiendo la punta, sin tocar la pared posterior.',
        check: (c) => (c.needle()?.state === 'luz' && (c.needle()?.angle ?? 90) < 22) || false,
      },
      {
        text: 'Pulsa <b>Confirmar punción</b> para evaluar el resultado.',
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
        text: '<b>Anisotropía</b>: en la muñeca, inclina la sonda (R/F) sobre los tendones flexores. Con 10–20° se vuelven hipoecoicos y pueden confundirse con otras estructuras.',
        check: (c) => Math.abs(c.probe.tilt) > 12 && c.probe.x < 60,
      },
      {
        text: '<b>Reverberación</b>: en el modo Punción, la aguja genera bajo ella líneas paralelas equiespaciadas, separadas su diámetro interior y cada vez más tenues. Son más visibles con la aguja plana y sobre la luz del vaso. En eje corto forma una "cola de cometa".',
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
        text: 'Sube la <b>escala</b> (PRF) hasta que desaparezca el aliasing fuera de la estenosis.',
        check: (c) => c.settings.scale >= 80,
      },
      {
        text: 'Con PW, mide la <b>VPS en la estenosis</b> con el cursor de ángulo alineado con el chorro (≤ 60°).',
        check: (c) => c.settings.pw && c.spectral.measures().psv > 250,
      },
      {
        text: 'Mide la VPS 2 cm antes (arteria radial). Un cociente ≥ 3 en la zona anastomótica indica estenosis significativa (≥ 50 %).',
      },
    ],
  },
];
