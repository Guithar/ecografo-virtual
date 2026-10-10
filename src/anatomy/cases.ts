/**
 * Biblioteca de casos clínicos (dificultades habituales en la punción de accesos vasculares).
 * Cada caso define la anatomía (brazo izquierdo canónico), la hemodinámica y los objetivos docentes.
 * Los valores numéricos están justificados en docs/FUNDAMENTOS.md.
 */
import { ArmShape } from './armShape';
import type { CtrlPt, StructDef } from './model';
import { tr } from '../i18n';

export interface CaseDef {
  id: string;
  title: string;
  short: string;
  difficulty: 1 | 2 | 3;
  accessType: string;
  /** por qué está indicada la punción ecoguiada en este caso (Nefrología al día) */
  indication: string;
  description: string;
  objectives: string[];
  /** hallazgos esperables (se muestran en "Solución") */
  findings: string[];
  tips: string[];
  armOpts: { fatScale?: number; fatAdd?: number; sizeScale?: number };
  hr: number;
  build: (arm: ArmShape) => StructDef[];
  access?: {
    veinId: string;
    /** posición x de la anastomosis arterial (mm) */
    anastomosisX?: number;
    /** zona recomendada de punción (x mínima, x máxima) */
    zone: [number, number];
    graft?: boolean;
    /** zonas a evitar */
    avoid?: { x0: number; x1: number; reason: string }[];
    /** calibre/ángulo recomendados */
    angle: number;
  };
  probeStart: { x: number; theta: number; rot: number };
  expected?: { diameter?: number; depth?: number; qa?: number; mature?: boolean; note?: string };
}

type P = CtrlPt;

// ---------------------------------------------------------------------------------------------
// Anatomía de base (brazo izquierdo, supinado)
// ---------------------------------------------------------------------------------------------

function offsetTh(arm: ArmShape, pts: P[], mm: number, dd = 0.3, r = 0.7, reverse = true): P[] {
  const out = pts.map((p) => {
    const s = arm.section(p.x);
    const R = Math.sqrt((s.a + (p.ref === 'skin' ? s.fat + s.skin : 0)) * (s.b + (p.ref === 'skin' ? s.fat + s.skin : 0)));
    const dth = ((mm / Math.max(R - (p.d ?? 0), 8)) * 180) / Math.PI;
    return { ...p, th: (p.th ?? 0) + dth, d: (p.d ?? 0) + dd, r };
  });
  return reverse ? out.reverse() : out;
}

export const BONES = (): StructDef[] => [
  {
    id: 'radio',
    name: tr('Radio', 'Radius'),
    kind: 'bone',
    group: 'hueso',
    pts: [
      { x: -15, y: -2, z: 11, r: 8.5 },
      { x: 10, y: -2.5, z: 11.5, r: 8 },
      { x: 40, y: -3, z: 12, r: 6.8 },
      { x: 100, y: -6, z: 15, r: 6.3 },
      { x: 150, y: -7, z: 15, r: 6.2 },
      { x: 200, y: -8, z: 13, r: 6 },
      { x: 240, y: -8, z: 12, r: 6 },
      { x: 262, y: -9, z: 13, r: 9 },
    ],
  },
  {
    id: 'cubito',
    name: tr('Cúbito', 'Ulna'),
    kind: 'bone',
    group: 'hueso',
    pts: [
      { x: -12, y: -4, z: -17, r: 5.5 },
      { x: 40, y: -6, z: -16, r: 5 },
      { x: 100, y: -11, z: -17, r: 6.2 },
      { x: 150, y: -12, z: -17, r: 7 },
      { x: 200, y: -14, z: -15, r: 8 },
      { x: 245, y: -16, z: -12, r: 10 },
      { x: 275, y: -18, z: -7, r: 11 },
    ],
  },
  {
    id: 'humero_epi',
    name: tr('Húmero (paleta)', 'Humerus (distal end)'),
    short: tr('Húmero', 'Humerus'),
    kind: 'bone',
    group: 'hueso',
    pts: [
      { x: 268, y: -10, z: -27, r: 8 },
      { x: 270, y: -11, z: 0, r: 10 },
      { x: 268, y: -10, z: 24, r: 8 },
    ],
  },
  {
    id: 'humero',
    name: tr('Húmero', 'Humerus'),
    kind: 'bone',
    group: 'hueso',
    pts: [
      { x: 262, y: -10, z: 0, r: 12 },
      { x: 300, y: -10, z: 0, r: 10 },
      { x: 400, y: -8, z: 0, r: 11 },
      { x: 500, y: -6, z: 0, r: 12 },
      { x: 575, y: -5, z: 0, r: 14 },
    ],
  },
];

export const TENDONS = (): StructDef[] => [
  {
    id: 'palmar',
    name: tr('Tendón del palmar largo', 'Palmaris longus tendon'),
    short: tr('T. palmar largo', 'T. palmaris longus'),
    kind: 'tendon',
    group: 'tendon',
    pts: [
      { x: -15, th: 0, d: -0.2, ref: 'fascia', r: 1.3 },
      { x: 40, th: 0, d: 0.3, ref: 'fascia', r: 1.3 },
      { x: 90, th: 2, d: 1.5, ref: 'fascia', r: 1.4 },
    ],
  },
  {
    id: 'fcr',
    name: tr('Tendón del flexor radial del carpo', 'Flexor carpi radialis tendon'),
    short: tr('T. FRC', 'T. FCR'),
    kind: 'tendon',
    group: 'tendon',
    pts: [
      { x: -15, th: 24, d: 1.8, ref: 'fascia', r: 2.0 },
      { x: 40, th: 22, d: 2.5, ref: 'fascia', r: 2.0 },
      { x: 95, th: 18, d: 4.5, ref: 'fascia', r: 2.1 },
    ],
  },
  {
    id: 'fds1',
    name: tr('Tendones flexores superficiales', 'Superficial flexor tendons'),
    short: tr('T. flexores', 'T. flexors'),
    kind: 'tendon',
    group: 'tendon',
    pts: [
      { x: -15, th: -12, d: 5.5, ref: 'fascia', r: 2.5 },
      { x: 30, th: -12, d: 6.5, ref: 'fascia', r: 2.6 },
      { x: 75, th: -10, d: 9, ref: 'fascia', r: 2.8 },
    ],
  },
  {
    id: 'fds2',
    name: tr('Tendones flexores superficiales', 'Superficial flexor tendons'),
    short: '',
    hideLabel: true,
    kind: 'tendon',
    group: 'tendon',
    pts: [
      { x: -15, th: -26, d: 4.8, ref: 'fascia', r: 2.2 },
      { x: 30, th: -26, d: 5.8, ref: 'fascia', r: 2.3 },
      { x: 70, th: -24, d: 8, ref: 'fascia', r: 2.4 },
    ],
  },
  {
    id: 'fcu',
    name: tr('Tendón del flexor cubital del carpo', 'Flexor carpi ulnaris tendon'),
    short: tr('T. FCC', 'T. FCU'),
    kind: 'tendon',
    group: 'tendon',
    pts: [
      { x: -15, th: -64, d: 1.2, ref: 'fascia', r: 2.2 },
      { x: 40, th: -64, d: 2.0, ref: 'fascia', r: 2.3 },
      { x: 85, th: -66, d: 3.5, ref: 'fascia', r: 2.4 },
    ],
  },
  {
    id: 'braquiorradial_t',
    name: tr('Tendón del braquiorradial', 'Brachioradialis tendon'),
    short: tr('T. BR', 'T. BR'),
    kind: 'tendon',
    group: 'tendon',
    pts: [
      { x: -15, th: 78, d: 2.0, ref: 'fascia', r: 1.8 },
      { x: 40, th: 72, d: 2.5, ref: 'fascia', r: 1.9 },
      { x: 95, th: 64, d: 3.5, ref: 'fascia', r: 2.0 },
    ],
  },
  {
    id: 'biceps_t',
    name: tr('Tendón del bíceps', 'Biceps tendon'),
    short: tr('T. bíceps', 'T. biceps'),
    kind: 'tendon',
    group: 'tendon',
    pts: [
      { x: 228, th: 18, d: 16, ref: 'fascia', r: 2.6 },
      { x: 252, th: 6, d: 8, ref: 'fascia', r: 2.8 },
      { x: 285, th: 2, d: 4.5, ref: 'fascia', r: 3.0 },
      { x: 320, th: 0, d: 4.5, ref: 'fascia', r: 3.2 },
    ],
  },
];

export const NERVES = (): StructDef[] => [
  {
    id: 'n_mediano',
    name: tr('Nervio mediano', 'Median nerve'),
    short: tr('N. mediano', 'Median n.'),
    kind: 'nerve',
    group: 'nervio',
    pts: [
      { x: -15, th: -2, d: 1.8, ref: 'fascia', r: 1.9 },
      { x: 30, th: 0, d: 3.5, ref: 'fascia', r: 1.9 },
      { x: 80, th: 0, d: 8, ref: 'fascia', r: 2.0 },
      { x: 150, th: -3, d: 13, ref: 'fascia', r: 2.0 },
      { x: 220, th: -10, d: 12, ref: 'fascia', r: 2.1 },
      { x: 255, th: -20, d: 9, ref: 'fascia', r: 2.2 },
      { x: 320, th: -40, d: 9, ref: 'fascia', r: 2.2 },
      { x: 400, th: -61, d: 8, ref: 'fascia', r: 2.2 },
      { x: 480, th: -73, d: 8, ref: 'fascia', r: 2.3 },
      { x: 575, th: -88, d: 9, ref: 'fascia', r: 2.4 },
    ],
  },
  {
    id: 'n_cubital',
    name: tr('Nervio cubital', 'Ulnar nerve'),
    short: tr('N. cubital', 'Ulnar n.'),
    kind: 'nerve',
    group: 'nervio',
    pts: [
      { x: -15, th: -63, d: 2.6, ref: 'fascia', r: 1.5 },
      { x: 50, th: -61, d: 4.5, ref: 'fascia', r: 1.5 },
      { x: 120, th: -58, d: 9, ref: 'fascia', r: 1.6 },
      { x: 200, th: -75, d: 10, ref: 'fascia', r: 1.7 },
      // túnel cubital: por detrás del epicóndilo medial, sin atravesar el hueso
      { x: 250, th: -112, d: 3, ref: 'fascia', r: 1.8 },
      { x: 275, th: -135, d: 2, ref: 'fascia', r: 1.9 },
      { x: 330, th: -110, d: 6, ref: 'fascia', r: 1.9 },
      { x: 450, th: -95, d: 8, ref: 'fascia', r: 2.0 },
      { x: 575, th: -92, d: 12, ref: 'fascia', r: 2.1 },
    ],
  },
  {
    id: 'n_radial_sup',
    name: tr('Rama superficial del nervio radial', 'Superficial branch of the radial nerve'),
    short: tr('N. radial sup.', 'Sup. radial n.'),
    kind: 'nerve',
    group: 'nervio',
    pts: [
      { x: 235, th: 38, d: 10, ref: 'fascia', r: 1.0 },
      { x: 150, th: 48, d: 6, ref: 'fascia', r: 0.9 },
      { x: 90, th: 57, d: 3, ref: 'fascia', r: 0.9 },
      { x: 60, th: 76, d: 0.5, ref: 'fascia', r: 0.8 },
      { x: 20, th: 96, d: -1.8, ref: 'fascia', r: 0.8 },
      { x: -15, th: 106, d: -1.8, ref: 'fascia', r: 0.7 },
    ],
  },
  {
    id: 'n_radial',
    name: tr('Nervio radial', 'Radial nerve'),
    short: tr('N. radial', 'Radial n.'),
    kind: 'nerve',
    group: 'nervio',
    pts: [
      { x: 360, th: 110, d: 12, ref: 'fascia', r: 1.9 },
      { x: 300, th: 70, d: 11, ref: 'fascia', r: 1.9 },
      { x: 265, th: 48, d: 10, ref: 'fascia', r: 1.8 },
      { x: 240, th: 42, d: 10, ref: 'fascia', r: 1.6 },
      { x: 200, th: 62, d: 15, ref: 'fascia', r: 1.3 },
    ],
  },
];

const BRACHIAL_PTS: P[] = [
  { x: 580, th: -80, d: 8, ref: 'fascia', r: 2.4 },
  { x: 480, th: -65, d: 8, ref: 'fascia', r: 2.4 },
  { x: 400, th: -50, d: 8, ref: 'fascia', r: 2.4 },
  { x: 320, th: -30, d: 9, ref: 'fascia', r: 2.4 },
  { x: 270, th: -12, d: 9, ref: 'fascia', r: 2.35 },
  { x: 250, th: -5, d: 10, ref: 'fascia', r: 2.3 },
  { x: 236, th: 2, d: 10.5, ref: 'fascia', r: 2.2 },
];

const RADIAL_PTS: P[] = [
  { x: 236, th: 4, d: 10.5, ref: 'fascia', r: 1.3 },
  { x: 200, th: 25, d: 8, ref: 'fascia', r: 1.25 },
  { x: 150, th: 38, d: 6, ref: 'fascia', r: 1.2 },
  { x: 100, th: 45, d: 4, ref: 'fascia', r: 1.2 },
  { x: 60, th: 45, d: 2.6, ref: 'fascia', r: 1.2 },
  { x: 30, th: 45, d: 2.2, ref: 'fascia', r: 1.15 },
  { x: 0, th: 48, d: 2.0, ref: 'fascia', r: 1.15 },
  { x: -15, th: 60, d: 2.0, ref: 'fascia', r: 1.1 },
];

const ULNAR_PTS: P[] = [
  { x: 236, th: 0, d: 11, ref: 'fascia', r: 1.35 },
  { x: 200, th: -15, d: 14, ref: 'fascia', r: 1.3 },
  { x: 150, th: -35, d: 12, ref: 'fascia', r: 1.3 },
  { x: 100, th: -45, d: 8, ref: 'fascia', r: 1.25 },
  { x: 50, th: -52, d: 4, ref: 'fascia', r: 1.25 },
  { x: 0, th: -55, d: 2.6, ref: 'fascia', r: 1.2 },
  { x: -15, th: -52, d: 2.6, ref: 'fascia', r: 1.2 },
];

const CEPHALIC_PTS: P[] = [
  { x: -15, th: 86, d: 3.2, ref: 'skin', r: 1.2 },
  { x: 20, th: 72, d: 3.4, ref: 'skin', r: 1.2 },
  { x: 60, th: 60, d: 3.6, ref: 'skin', r: 1.25 },
  { x: 120, th: 52, d: 3.8, ref: 'skin', r: 1.3 },
  { x: 180, th: 48, d: 4.0, ref: 'skin', r: 1.35 },
  { x: 230, th: 50, d: 4.2, ref: 'skin', r: 1.4 },
  { x: 270, th: 55, d: 4.5, ref: 'skin', r: 1.5 },
  { x: 330, th: 70, d: 5, ref: 'skin', r: 1.6 },
  { x: 420, th: 80, d: 5.5, ref: 'skin', r: 1.7 },
  { x: 500, th: 78, d: 6.5, ref: 'skin', r: 1.8 },
  { x: 580, th: 65, d: 8, ref: 'skin', r: 2.0 },
];

const BASILIC_PTS: P[] = [
  { x: -15, th: -80, d: 3, ref: 'skin', r: 1.2 },
  { x: 60, th: -78, d: 3.5, ref: 'skin', r: 1.3 },
  { x: 150, th: -70, d: 4, ref: 'skin', r: 1.4 },
  { x: 230, th: -60, d: 4.2, ref: 'skin', r: 1.5 },
  { x: 285, th: -56, d: 4.6, ref: 'skin', r: 1.7 },
  { x: 340, th: -60, d: 5.5, ref: 'skin', r: 1.8 },
  { x: 385, th: -62, d: 0.5, ref: 'fascia', r: 1.9 },
  { x: 460, th: -70, d: 5, ref: 'fascia', r: 2.1 },
  { x: 580, th: -82, d: 7, ref: 'fascia', r: 2.4 },
];

/** Tramo proximal de la arteria humeral hasta la anastomosis (x final) con radio dilatado. */
function brachialProx(xEnd: number, r: number): P[] {
  return BRACHIAL_PTS.filter((p) => p.x > xEnd + 4)
    .map((p) => ({ ...p, r }))
    .concat([{ x: xEnd, th: -8, d: 9.4, ref: 'fascia', r }]);
}

/** Anatomía vascular nativa (sin FAV). Los caudales corresponden a un brazo en reposo. */
export function nativeVessels(arm: ArmShape, opts: { skipCephalic?: boolean; skipBasilic?: boolean; radial?: Partial<StructDef>; ulnar?: Partial<StructDef>; brachial?: Partial<StructDef> } = {}): StructDef[] {
  const defs: StructDef[] = [
    {
      id: 'a_humeral',
      name: tr('Arteria humeral', 'Brachial artery'),
      short: tr('A. humeral', 'Brachial a.'),
      kind: 'artery',
      group: 'arteria',
      pts: BRACHIAL_PTS,
      flow: { q: 60, wave: 'artery', profile: 2 },
      ...opts.brachial,
    },
    {
      id: 'a_radial',
      name: tr('Arteria radial', 'Radial artery'),
      short: tr('A. radial', 'Radial a.'),
      kind: 'artery',
      group: 'arteria',
      pts: RADIAL_PTS,
      flow: { q: 18, wave: 'artery', profile: 2 },
      ...opts.radial,
    },
    {
      id: 'a_cubital',
      name: tr('Arteria cubital', 'Ulnar artery'),
      short: tr('A. cubital', 'Ulnar a.'),
      kind: 'artery',
      group: 'arteria',
      pts: ULNAR_PTS,
      flow: { q: 24, wave: 'artery', profile: 2 },
      ...opts.ulnar,
    },
    // venas satélites (comitantes)
    {
      id: 'v_radial_1',
      name: tr('Vena radial (satélite)', 'Radial vein (comitant)'),
      short: tr('V. satélite', 'Comitant v.'),
      kind: 'vein',
      group: 'vena',
      pts: offsetTh(arm, RADIAL_PTS.slice(1), 2.4, 0.2, 0.65),
      flow: { q: 6, wave: 'vein' },
      pressure: 7,
    },
    {
      id: 'v_radial_2',
      name: tr('Vena radial (satélite)', 'Radial vein (comitant)'),
      short: tr('V. satélite', 'Comitant v.'),
      hideLabel: true,
      kind: 'vein',
      group: 'vena',
      pts: offsetTh(arm, RADIAL_PTS.slice(1), -2.4, 0.3, 0.6),
      flow: { q: 6, wave: 'vein' },
      pressure: 7,
    },
    {
      id: 'v_cubital_1',
      name: tr('Vena cubital (satélite)', 'Ulnar vein (comitant)'),
      short: tr('V. satélite', 'Comitant v.'),
      hideLabel: true,
      kind: 'vein',
      group: 'vena',
      pts: offsetTh(arm, ULNAR_PTS.slice(1), 2.5, 0.2, 0.65),
      flow: { q: 6, wave: 'vein' },
      pressure: 7,
    },
    {
      id: 'v_cubital_2',
      name: tr('Vena cubital (satélite)', 'Ulnar vein (comitant)'),
      short: tr('V. satélite', 'Comitant v.'),
      hideLabel: true,
      kind: 'vein',
      group: 'vena',
      pts: offsetTh(arm, ULNAR_PTS.slice(1), -2.5, 0.3, 0.6),
      flow: { q: 6, wave: 'vein' },
      pressure: 7,
    },
    {
      id: 'v_humeral_1',
      name: tr('Vena humeral', 'Brachial vein'),
      short: tr('V. humeral', 'Brachial v.'),
      kind: 'vein',
      group: 'vena',
      pts: offsetTh(arm, BRACHIAL_PTS, 4.6, 0.3, 1.45),
      flow: { q: 30, wave: 'vein' },
      pressure: 8,
    },
    {
      id: 'v_humeral_2',
      name: tr('Vena humeral', 'Brachial vein'),
      short: tr('V. humeral', 'Brachial v.'),
      hideLabel: true,
      kind: 'vein',
      group: 'vena',
      pts: offsetTh(arm, BRACHIAL_PTS, -4.4, 0.5, 1.35),
      flow: { q: 30, wave: 'vein' },
      pressure: 8,
    },
    {
      id: 'v_mediana_ab',
      name: tr('Vena mediana antebraquial', 'Median antebrachial vein'),
      short: tr('V. mediana', 'Median v.'),
      kind: 'vein',
      group: 'vena',
      pts: [
        { x: 0, th: 12, d: 2.6, ref: 'skin', r: 0.8 },
        { x: 100, th: 6, d: 3.0, ref: 'skin', r: 0.9 },
        { x: 200, th: 2, d: 3.4, ref: 'skin', r: 1.0 },
        { x: 245, th: 0, d: 3.6, ref: 'skin', r: 1.0 },
      ],
      flow: { q: 8, wave: 'vein' },
      pressure: 7,
    },
    {
      id: 'v_mediana_cubital',
      name: tr('Vena mediana cubital', 'Median cubital vein'),
      short: tr('V. mediana cubital', 'Median cubital v.'),
      kind: 'vein',
      group: 'vena',
      pts: [
        { x: 222, th: 50, d: 4.2, ref: 'skin', r: 1.3 },
        { x: 250, th: 12, d: 4.0, ref: 'skin', r: 1.3 },
        { x: 272, th: -35, d: 4.3, ref: 'skin', r: 1.35 },
        { x: 288, th: -55, d: 4.6, ref: 'skin', r: 1.4 },
      ],
      flow: { q: 18, wave: 'vein' },
      pressure: 7,
    },
  ];
  if (!opts.skipCephalic) {
    defs.push({
      id: 'v_cefalica',
      name: tr('Vena cefálica', 'Cephalic vein'),
      short: tr('V. cefálica', 'Cephalic v.'),
      kind: 'vein',
      group: 'vena',
      pts: CEPHALIC_PTS,
      flow: { q: 25, wave: 'vein' },
      pressure: 7,
    });
  }
  if (!opts.skipBasilic) {
    defs.push({
      id: 'v_basilica',
      name: tr('Vena basílica', 'Basilic vein'),
      short: tr('V. basílica', 'Basilic v.'),
      kind: 'vein',
      group: 'vena',
      pts: BASILIC_PTS,
      flow: { q: 35, wave: 'vein' },
      pressure: 7,
    });
  }
  return defs;
}

function base(arm: ArmShape, opts: Parameters<typeof nativeVessels>[1] = {}): StructDef[] {
  return [...BONES(), ...TENDONS(), ...NERVES(), ...nativeVessels(arm, opts)];
}

/** Vena de FAV radiocefálica madura estándar */
function rcAvfPts(o: { depth?: number; r?: number; depthScale?: number } = {}): P[] {
  const dd = o.depth ?? 6.4;
  const r = o.r ?? 3.25;
  return [
    { x: 27, th: 45, d: 2.2, ref: 'fascia', r: r * 0.55 },
    { x: 36, th: 50, d: dd - 0.4, ref: 'skin', r: r * 0.66 },
    { x: 50, th: 54, d: dd - 0.2, ref: 'skin', r: r * 0.82 },
    { x: 80, th: 55, d: dd - 0.1, ref: 'skin', r: r * 0.93 },
    { x: 130, th: 51, d: dd, ref: 'skin', r: r * 0.98 },
    { x: 180, th: 48, d: dd + 0.2, ref: 'skin', r },
    { x: 230, th: 50, d: dd + 0.4, ref: 'skin', r: r * 1.02 },
    { x: 280, th: 58, d: dd + 0.8, ref: 'skin', r: r * 1.03 },
    { x: 340, th: 72, d: dd + 1.2, ref: 'skin', r: r * 1.0 },
    { x: 420, th: 80, d: dd + 1.8, ref: 'skin', r: r * 0.98 },
    { x: 500, th: 78, d: dd + 2.8, ref: 'skin', r: r * 0.96 },
    { x: 580, th: 65, d: dd + 4.2, ref: 'skin', r: r * 0.96 },
  ];
}

interface RcOpts {
  qa?: number;
  radialQ?: number;
  ulnarQ?: number;
  retroQ?: number;
  veinPts?: P[];
  veinExtra?: Partial<StructDef>;
  radialR?: number;
  calc?: number;
}

/** FAV radiocefálica (Brescia-Cimino) latero-terminal en la muñeca. */
function radiocephalic(arm: ArmShape, o: RcOpts = {}): StructDef[] {
  const radialQ = o.radialQ ?? 650;
  const ulnarQ = o.ulnarQ ?? 180;
  const retroQ = o.retroQ ?? 90;
  const qa = o.qa ?? radialQ + retroQ;
  const rr = o.radialR ?? 1.9;
  const radialFeed: P[] = RADIAL_PTS.filter((p) => p.x >= 27).map((p) => ({ ...p, r: rr * (p.x > 200 ? 0.95 : 1) }));
  radialFeed[radialFeed.length - 1] = { ...radialFeed[radialFeed.length - 1], x: 27 };
  const defs: StructDef[] = [
    ...BONES(),
    ...TENDONS(),
    ...NERVES(),
    ...nativeVessels(arm, {
      skipCephalic: true,
      brachial: { flow: { q: radialQ + ulnarQ, wave: 'feed', profile: 2.4 }, pts: BRACHIAL_PTS.map((p) => ({ ...p, r: p.r * 1.12 })), calc: o.calc ? o.calc * 0.4 : 0 },
      radial: { name: tr('Arteria radial (nutricia)', 'Feeding radial artery'), short: tr('A. radial', 'Radial a.'), pts: radialFeed, flow: { q: radialQ, wave: 'feed', profile: 2.2 }, calc: o.calc ?? 0 },
      ulnar: { flow: { q: ulnarQ, wave: 'mixed', profile: 2 }, calc: o.calc ? o.calc * 0.7 : 0 },
    }),
    {
      id: 'a_radial_distal',
      name: tr('Arteria radial distal (flujo retrógrado)', 'Distal radial artery (retrograde flow)'),
      short: tr('A. radial distal', 'Distal radial a.'),
      kind: 'artery',
      group: 'arteria',
      pts: [
        { x: -15, th: 60, d: 2.0, ref: 'fascia', r: 1.2 },
        { x: 0, th: 48, d: 2.0, ref: 'fascia', r: 1.25 },
        { x: 15, th: 46, d: 2.1, ref: 'fascia', r: 1.3 },
        { x: 27, th: 45, d: 2.2, ref: 'fascia', r: 1.5 },
      ],
      flow: { q: retroQ, wave: 'feed', profile: 2 },
      calc: o.calc ?? 0,
    },
    {
      id: 'fav',
      name: tr('Vena cefálica arterializada (FAV)', 'Arterialized cephalic vein (AVF)'),
      short: tr('FAV (v. cefálica)', 'AVF (cephalic v.)'),
      kind: 'avf',
      group: 'fav',
      isAccess: true,
      pts: o.veinPts ?? rcAvfPts(),
      wall: 0.55,
      flow: { q: qa, wave: 'avf', profile: 3.5, turb: 0.05 },
      lesions: [{ type: 'jet', at: 8, len: 50, sev: 0.75 }],
      pressure: 22,
      ...o.veinExtra,
    },
    // cefálica nativa distal residual (ligada) — pequeño muñón
    {
      id: 'v_cefalica_distal',
      name: tr('Vena cefálica distal (ligada)', 'Distal cephalic vein (ligated)'),
      short: '',
      hideLabel: true,
      kind: 'vein',
      group: 'vena',
      pts: [
        { x: -15, th: 86, d: 3.2, ref: 'skin', r: 1.0 },
        { x: 10, th: 76, d: 3.6, ref: 'skin', r: 1.0 },
        { x: 24, th: 66, d: 4.6, ref: 'skin', r: 0.9 },
      ],
      flow: { q: 3, wave: 'vein' },
      pressure: 7,
    },
  ];
  return defs;
}

// ---------------------------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------------------------

export const CASES: CaseDef[] = [
  {
    id: 'normal',
    title: tr('Brazo sin FAV · anatomía normal y mapeo prequirúrgico', 'Arm without AVF · normal anatomy and preoperative mapping'),
    short: tr('Anatomía normal', 'Normal anatomy'),
    difficulty: 1,
    accessType: tr('Sin acceso', 'No access'),
    indication: tr(
      'No hay acceso que puncionar: la ecografía sirve para el mapeo vascular antes de crear la FAV (calibre y trayecto de arterias y venas).',
      'No access to cannulate: ultrasound is used for vascular mapping before AVF creation (diameter and course of arteries and veins).',
    ),
    description: tr(
      'Brazo izquierdo sin fístula. Úsalo para reconocer la anatomía ecográfica normal: arterias radial, cubital y humeral con sus venas satélites, venas superficiales (cefálica, basílica, mediana), nervios mediano, cubital y radial, tendones y huesos. Sirve también para el mapeo prequirúrgico (diámetros mínimos: arteria ≥ 2 mm, vena ≥ 2,5 mm con compresor) y para practicar la canalización venosa periférica ecoguiada.',
      'Left arm without a fistula. Use it to learn normal ultrasound anatomy: radial, ulnar and brachial arteries with their comitant veins, superficial veins (cephalic, basilic, median), median, ulnar and radial nerves, tendons and bones. Also useful for preoperative mapping (minimum diameters: artery ≥ 2 mm, vein ≥ 2.5 mm with a tourniquet) and for practicing ultrasound-guided peripheral IV cannulation.',
    ),
    objectives: [
      tr(
        'Diferenciar arteria (pulsátil, no colapsable, onda trifásica) de vena (colapsable, flujo fásico).',
        'Differentiate artery (pulsatile, non-compressible, triphasic waveform) from vein (compressible, phasic flow).',
      ),
      tr(
        'Localizar la vena cefálica en la muñeca y en el antebrazo y medir su diámetro con y sin compresor.',
        'Locate the cephalic vein at the wrist and in the forearm and measure its diameter with and without a tourniquet.',
      ),
      tr('Medir el diámetro de la arteria radial en la muñeca.', 'Measure the radial artery diameter at the wrist.'),
      tr(
        'Identificar el nervio mediano (patrón en panal) y los tendones flexores (anisotropía).',
        'Identify the median nerve (honeycomb pattern) and the flexor tendons (anisotropy).',
      ),
    ],
    findings: [
      tr(
        'Arteria radial distal ≈ 2,3 mm, onda trifásica de alta resistencia (IR ≈ 1).',
        'Distal radial artery ≈ 2.3 mm, high-resistance triphasic waveform (RI ≈ 1).',
      ),
      tr(
        'Vena cefálica en antebrazo ≈ 2,4–2,8 mm; se distiende ~20 % con compresor.',
        'Forearm cephalic vein ≈ 2.4–2.8 mm; distends ~20% with a tourniquet.',
      ),
      tr(
        'Venas satélites a ambos lados de la arteria radial: colapsan con presión suave.',
        'Comitant veins on both sides of the radial artery: they collapse with light pressure.',
      ),
    ],
    tips: [
      tr(
        'Presión mínima: las venas superficiales se colapsan con muy poca presión.',
        'Minimal pressure: superficial veins collapse with very little pressure.',
      ),
      tr('Usa el compresor para valorar la distensibilidad venosa.', 'Use the tourniquet to assess venous distensibility.'),
      tr(
        'Inclina la sonda (basculación) para evitar la anisotropía de los tendones.',
        'Tilt the probe to avoid tendon anisotropy.',
      ),
    ],
    armOpts: {},
    hr: 72,
    build: (arm) => base(arm),
    probeStart: { x: 40, theta: 42, rot: 0 },
    expected: { note: tr('Sin acceso vascular', 'No vascular access') },
  },
  {
    id: 'rc_madura',
    title: tr('FAV radiocefálica madura · punción estándar', 'Mature radiocephalic AVF · standard cannulation'),
    short: tr('FAV RC madura', 'Mature RC AVF'),
    difficulty: 1,
    accessType: tr('FAV radiocefálica (Brescia-Cimino)', 'Radiocephalic AVF (Brescia-Cimino)'),
    indication: tr(
      'Primeras punciones de una FAV nueva: es cuando más ayuda la ecografía, porque la vena aún es frágil y un fallo produce hematomas que retrasan su uso.',
      'First cannulations of a new AVF: this is when ultrasound helps most, because the vein is still fragile and a missed cannulation causes hematomas that delay its use.',
    ),
    description: tr(
      'Fístula radiocefálica latero-terminal en la muñeca izquierda, de 8 meses, bien desarrollada. Vena rectilínea, superficial y de buen calibre. Caso de referencia para aprender la punción ecoguiada con abordaje longitudinal (en plano), el preferido, y transversal (fuera de plano).',
      'Well-developed, 8-month-old end-to-side radiocephalic fistula at the left wrist. Straight, superficial vein of good diameter. Reference case for learning ultrasound-guided cannulation with the long-axis (in-plane) approach, the preferred one, and the short-axis (out-of-plane) approach.',
    ),
    objectives: [
      tr(
        'Localizar la anastomosis y recorrer la vena arterializada hacia proximal.',
        'Locate the anastomosis and follow the arterialized vein proximally.',
      ),
      tr(
        'Medir diámetro y profundidad de la vena en la zona de punción (regla de los 6).',
        'Measure vein diameter and depth at the cannulation site (rule of 6s).',
      ),
      tr('Calcular el flujo del acceso (Qa) en la arteria humeral.', 'Calculate access flow (Qa) in the brachial artery.'),
      tr(
        'Puncionar la vena a ≥ 3 cm de la anastomosis con la punta visible en todo momento.',
        'Cannulate the vein ≥ 3 cm from the anastomosis, keeping the tip visible at all times.',
      ),
    ],
    findings: [
      tr(
        'Diámetro de la vena en antebrazo medio ≈ 6,3–6,6 mm; profundidad de la pared anterior ≈ 3 mm.',
        'Vein diameter at mid-forearm ≈ 6.3–6.6 mm; anterior wall depth ≈ 3 mm.',
      ),
      tr(
        'Arteria radial nutricia dilatada (≈ 3,8 mm), onda de baja resistencia (IR ≈ 0,5).',
        'Dilated feeding radial artery (≈ 3.8 mm), low-resistance waveform (RI ≈ 0.5).',
      ),
      tr(
        'Flujo retrógrado fisiológico en la arteria radial distal a la anastomosis.',
        'Physiological retrograde flow in the radial artery distal to the anastomosis.',
      ),
      tr('Qa humeral ≈ 800 mL/min.', 'Brachial Qa ≈ 800 mL/min.'),
    ],
    tips: [
      tr(
        'Coloca la pantalla frente a ti, al otro lado del brazo, en línea con la zona de punción.',
        'Place the screen in front of you, across the arm, in line with the cannulation site.',
      ),
      tr(
        'Con el marcador de la sonda a tu izquierda, izquierda de la pantalla = tu izquierda.',
        'With the probe marker to your left, screen left = your left.',
      ),
      tr('Ángulo 20–35°; al ver el reflujo, baja el ángulo y avanza.', 'Angle 20–35°; on flashback, lower the angle and advance.'),
    ],
    armOpts: {},
    hr: 72,
    build: (arm) => radiocephalic(arm),
    access: {
      veinId: 'fav',
      anastomosisX: 27,
      zone: [60, 230],
      angle: 25,
    },
    probeStart: { x: 110, theta: 50, rot: 0 },
    expected: { diameter: 6.4, depth: 3.0, qa: 830, mature: true },
  },
  {
    id: 'bc_obeso',
    title: tr('FAV humerocefálica profunda · paciente obeso', 'Deep brachiocephalic AVF · obese patient'),
    short: tr('FAV profunda (obesidad)', 'Deep AVF (obesity)'),
    difficulty: 2,
    accessType: tr('FAV humerocefálica', 'Brachiocephalic AVF'),
    indication: tr(
      'Paciente obeso con la vena muy profunda: no se palpa bien y la punción a ciegas falla con frecuencia.',
      'Obese patient with a very deep vein: it is hard to palpate and blind cannulation often fails.',
    ),
    description: tr(
      'Fístula humerocefálica en el codo izquierdo de un paciente con obesidad. La vena cefálica del brazo tiene buen calibre y alto flujo, pero discurre a más de 1 cm de profundidad bajo un tejido celular subcutáneo grueso. La palpación es difícil y la ecografía es de gran ayuda.',
      'Brachiocephalic fistula at the left elbow in a patient with obesity. The upper-arm cephalic vein has a good diameter and high flow, but runs more than 1 cm deep under thick subcutaneous tissue. Palpation is difficult and ultrasound is a great help.',
    ),
    objectives: [
      tr('Ajustar profundidad, foco y ganancia para un vaso profundo.', 'Adjust depth, focus and gain for a deep vessel.'),
      tr('Medir la profundidad de la pared anterior (> 6 mm: FAV profunda).', 'Measure anterior wall depth (> 6 mm: deep AVF).'),
      tr(
        'Planificar el ángulo y la longitud de aguja adecuados (mayor ángulo, aguja de 32 mm).',
        'Plan the right angle and needle length (steeper angle, 32 mm needle).',
      ),
      tr(
        'Evitar la arteria humeral y el nervio mediano, mediales.',
        'Avoid the brachial artery and the median nerve, which lie medially.',
      ),
    ],
    findings: [
      tr('Pared anterior de la vena a ≈ 10–12 mm de la piel (profunda).', 'Vein anterior wall ≈ 10–12 mm from the skin (deep).'),
      tr('Diámetro ≈ 7 mm; Qa humeral ≈ 1300 mL/min.', 'Diameter ≈ 7 mm; brachial Qa ≈ 1300 mL/min.'),
    ],
    tips: [
      tr(
        'Aumenta la profundidad a 3–4 cm y baja el foco al nivel del vaso.',
        'Increase depth to 3–4 cm and move the focus down to the vessel.',
      ),
      tr(
        'Con más profundidad, el punto de entrada en eje corto debe estar más lejos de la sonda.',
        'The deeper the vessel, the farther from the probe the short-axis entry point must be.',
      ),
      tr(
        'Una aguja de 25 mm puede no alcanzar la luz con suficiente recorrido intraluminal.',
        'A 25 mm needle may not reach the lumen with enough intraluminal length.',
      ),
    ],
    armOpts: { fatAdd: 8.5, sizeScale: 1.04 },
    hr: 78,
    build: (arm) => {
      const defs = base(arm, {
        brachial: { flow: { q: 1330, wave: 'feed', profile: 2.5 }, pts: brachialProx(262, 2.9) },
        radial: { flow: { q: 30, wave: 'mixed' } },
        ulnar: { flow: { q: 40, wave: 'mixed' } },
        skipCephalic: true,
      });
      defs.push(
        {
          id: 'a_humeral_distal',
          name: tr('Arteria humeral distal', 'Distal brachial artery'),
          short: tr('A. humeral', 'Brachial a.'),
          kind: 'artery',
          group: 'arteria',
          pts: BRACHIAL_PTS.filter((p) => p.x <= 270).map((p, i) => (i === 0 ? { ...p, x: 262 } : p)),
          flow: { q: 70, wave: 'mixed' },
        },
        {
          id: 'fav',
          name: tr('Vena cefálica arterializada (FAV)', 'Arterialized cephalic vein (AVF)'),
          short: tr('FAV (v. cefálica)', 'AVF (cephalic v.)'),
          kind: 'avf',
          group: 'fav',
          isAccess: true,
          pts: [
            { x: 262, th: -7, d: 9, ref: 'fascia', r: 1.9 },
            { x: 266, th: 6, d: 12, ref: 'skin', r: 2.4 },
            { x: 276, th: 24, d: 14, ref: 'skin', r: 3.1 },
            { x: 295, th: 38, d: 15.5, ref: 'skin', r: 3.5 },
            { x: 335, th: 48, d: 16, ref: 'skin', r: 3.6 },
            { x: 400, th: 52, d: 16.5, ref: 'skin', r: 3.6 },
            { x: 480, th: 52, d: 17.5, ref: 'skin', r: 3.5 },
            { x: 575, th: 48, d: 20, ref: 'skin', r: 3.5 },
          ],
          wall: 0.6,
          flow: { q: 1260, wave: 'avf', profile: 3.5 },
          lesions: [{ type: 'jet', at: 5, len: 45, sev: 0.8 }],
          pressure: 25,
        },
        {
          id: 'v_cefalica_ab',
          name: tr('Vena cefálica del antebrazo', 'Forearm cephalic vein'),
          short: tr('V. cefálica', 'Cephalic v.'),
          kind: 'vein',
          group: 'vena',
          pts: CEPHALIC_PTS.filter((p) => p.x <= 230).concat([{ x: 262, th: 30, d: 12, ref: 'skin', r: 1.6 }]),
          flow: { q: 25, wave: 'vein' },
          pressure: 9,
        },
      );
      return defs;
    },
    access: { veinId: 'fav', anastomosisX: 262, zone: [300, 520], angle: 35 },
    probeStart: { x: 380, theta: 52, rot: 0 },
    expected: { diameter: 7.1, depth: 11, qa: 1300, mature: true, note: tr('FAV madura pero profunda (> 6 mm)', 'Mature but deep AVF (> 6 mm)') },
  },
  {
    id: 'rc_tortuosa',
    title: tr('FAV radiocefálica tortuosa', 'Tortuous radiocephalic AVF'),
    short: tr('FAV tortuosa', 'Tortuous AVF'),
    difficulty: 2,
    accessType: tr('FAV radiocefálica', 'Radiocephalic AVF'),
    indication: tr(
      'FAV tortuosa, difícil de puncionar a ciegas: la ecografía muestra un segmento recto donde alinear la aguja con la vena.',
      'Tortuous AVF, hard to cannulate blind: ultrasound shows a straight segment where the needle can be aligned with the vein.',
    ),
    description: tr(
      'Vena arterializada con trayecto serpenteante y cambios de profundidad. En eje largo es imposible mantener todo el vaso en el plano; hay que elegir un segmento rectilíneo de al menos 2–3 cm para la punción y orientar la aguja según el eje local del vaso.',
      'Arterialized vein with a winding course and changes in depth. In long axis the whole vessel cannot be kept in plane; choose a straight segment of at least 2–3 cm for cannulation and orient the needle along the local vessel axis.',
    ),
    objectives: [
      tr(
        'Cartografiar el trayecto de la vena en eje corto (seguir el vaso deslizando la sonda).',
        'Map the vein course in short axis (follow the vessel by sliding the probe).',
      ),
      tr('Identificar segmentos rectos adecuados para la punción.', 'Identify straight segments suitable for cannulation.'),
      tr(
        'Alinear la aguja con el eje local del vaso para no atravesar la pared lateral.',
        'Align the needle with the local vessel axis to avoid exiting through the side wall.',
      ),
    ],
    findings: [
      tr('Curvas con desplazamientos laterales de ≈ 10–12 mm cada 4–5 cm.', 'Curves with lateral shifts of ≈ 10–12 mm every 4–5 cm.'),
      tr('Diámetro ≈ 6 mm; profundidad 3–5 mm.', 'Diameter ≈ 6 mm; depth 3–5 mm.'),
    ],
    tips: [
      tr(
        'En eje corto, desliza la sonda y observa cómo "baila" la vena lateralmente.',
        'In short axis, slide the probe and watch the vein "dance" from side to side.',
      ),
      tr('Rota la sonda para seguir el eje local en plano.', 'Rotate the probe to follow the local axis in plane.'),
    ],
    armOpts: {},
    hr: 70,
    build: (arm) => {
      const pts: P[] = [
        { x: 27, th: 45, d: 2.2, ref: 'fascia', r: 1.7 },
        { x: 36, th: 50, d: 6.0, ref: 'skin', r: 2.1 },
      ];
      for (let x = 48; x <= 250; x += 9) {
        const ph = ((x - 44) / 46) * 2 * Math.PI;
        pts.push({ x, th: 52 + 14 * Math.sin(ph), d: 6.6 + 1.3 * Math.cos(ph * 0.7), ref: 'skin', r: 3.0 });
      }
      pts.push(...rcAvfPts({ r: 3.1 }).filter((p) => p.x >= 280));
      return radiocephalic(arm, { veinPts: pts, qa: 700 });
    },
    access: { veinId: 'fav', anastomosisX: 27, zone: [60, 240], angle: 25 },
    probeStart: { x: 120, theta: 52, rot: 0 },
    expected: { diameter: 6.0, depth: 3.5, qa: 780, mature: true },
  },
  {
    id: 'rc_estenosis',
    title: tr('Estenosis yuxtaanastomótica', 'Juxta-anastomotic stenosis'),
    short: tr('Estenosis yuxtaanast.', 'Juxta-anast. stenosis'),
    difficulty: 2,
    accessType: tr('FAV radiocefálica disfuncionante', 'Dysfunctional radiocephalic AVF'),
    indication: tr(
      'Estenosis en la vena yuxtaanastomótica: hay que localizarla y puncionar lejos de ella, en vena sana.',
      'Stenosis in the juxta-anastomotic vein: locate it and cannulate away from it, in healthy vein.',
    ),
    description: tr(
      'FAV radiocefálica con estenosis en el segmento de salida (swing segment), a unos 2 cm de la anastomosis, por hiperplasia intimal. La vena distal a la estenosis tiene menor calibre y el flujo del acceso está reducido. En la estenosis hay aliasing en Doppler color y velocidades muy elevadas.',
      'Radiocephalic AVF with a stenosis in the swing segment, about 2 cm from the anastomosis, due to intimal hyperplasia. The vein distal to the stenosis is narrower and access flow is reduced. The stenosis shows color Doppler aliasing and very high velocities.',
    ),
    objectives: [
      tr('Localizar la estenosis con Doppler color (aliasing, mosaico).', 'Locate the stenosis with color Doppler (aliasing, mosaic pattern).'),
      tr(
        'Medir la VPS en la estenosis y 2 cm antes (cociente ≥ 3 en zona anastomótica).',
        'Measure PSV at the stenosis and 2 cm upstream (ratio ≥ 3 in the anastomotic region).',
      ),
      tr(
        'Medir la luz residual (< 2 mm) y el Qa humeral (< 500 mL/min → disfunción).',
        'Measure the residual lumen (< 2 mm) and brachial Qa (< 500 mL/min → dysfunction).',
      ),
      tr('Evitar puncionar sobre la estenosis o inmediatamente después.', 'Avoid cannulating over the stenosis or just downstream of it.'),
    ],
    findings: [
      tr('Luz residual ≈ 1,9 mm con engrosamiento intimal ecogénico.', 'Residual lumen ≈ 1.9 mm with echogenic intimal thickening.'),
      tr('VPS en la estenosis > 400 cm/s; turbulencia postestenótica.', 'PSV at the stenosis > 400 cm/s; post-stenotic turbulence.'),
      tr(
        'Qa humeral ≈ 540 mL/min (≈ 470 corregido): disfunción según GEMAV.',
        'Brachial Qa ≈ 540 mL/min (≈ 470 corrected): dysfunction per GEMAV.',
      ),
    ],
    tips: [
      tr('Sube la escala de velocidad (PRF) para cuantificar el chorro.', 'Raise the velocity scale (PRF) to quantify the jet.'),
      tr('Corrige el ángulo alineando el cursor con el chorro.', 'Correct the angle by aligning the cursor with the jet.'),
    ],
    armOpts: {},
    hr: 74,
    build: (arm) =>
      radiocephalic(arm, {
        radialQ: 380,
        ulnarQ: 160,
        retroQ: 50,
        radialR: 1.7,
        veinPts: rcAvfPts({ r: 2.7, depth: 6.0 }),
        veinExtra: {
          lesions: [
            { type: 'jet', at: 4, len: 16, sev: 0.4 },
            { type: 'stenosis', at: 19, len: 12, sev: 0.56, thick: 0.9 },
          ],
          flow: { q: 430, wave: 'avf', profile: 4, turb: 0.05 },
        },
      }),
    access: {
      veinId: 'fav',
      anastomosisX: 27,
      zone: [80, 230],
      angle: 25,
      avoid: [
        {
          x0: 30,
          x1: 70,
          reason: tr('Estenosis yuxtaanastomótica y turbulencia postestenótica', 'Juxta-anastomotic stenosis and post-stenotic turbulence'),
        },
      ],
    },
    probeStart: { x: 45, theta: 52, rot: 90 },
    expected: {
      diameter: 5.2,
      depth: 3.2,
      qa: 540,
      mature: false,
      note: tr('Disfunción por estenosis: remitir para fistulografía/ATP', 'Stenosis-related dysfunction: refer for fistulography/PTA'),
    },
  },
  {
    id: 'rc_aneurisma',
    title: tr('Aneurisma con trombo mural', 'Aneurysm with mural thrombus'),
    short: tr('Aneurisma + trombo', 'Aneurysm + thrombus'),
    difficulty: 3,
    accessType: tr('FAV radiocefálica evolucionada', 'Long-standing radiocephalic AVF'),
    indication: tr(
      'Aneurisma con trombo mural: la ecografía delimita los segmentos sanos y evita puncionar el trombo o la piel adelgazada.',
      'Aneurysm with mural thrombus: ultrasound maps the healthy segments and avoids cannulating the thrombus or the thinned skin.',
    ),
    description: tr(
      'FAV radiocefálica de 6 años con una dilatación aneurismática en el tercio medio del antebrazo (≈ 15 mm), trombo mural en la pared profunda y piel adelgazada sobre la cúpula. El flujo dentro del saco es lento y turbulento, en remolino. Resultado típico de la punción repetida en área.',
      '6-year-old radiocephalic AVF with an aneurysmal dilatation in the mid-forearm (≈ 15 mm), mural thrombus on the deep wall and thinned skin over the dome. Flow inside the sac is slow, turbulent and swirling. Typical result of repeated area puncture.',
    ),
    objectives: [
      tr(
        'Medir el diámetro máximo del aneurisma y el grosor del tejido que lo cubre.',
        'Measure the maximum aneurysm diameter and the thickness of the overlying tissue.',
      ),
      tr('Identificar el trombo mural y el flujo en remolino.', 'Identify the mural thrombus and the swirling flow.'),
      tr(
        'Planificar la punción en segmentos sanos, fuera del aneurisma (escalera de cuerda).',
        'Plan cannulation in healthy segments, away from the aneurysm (rope ladder).',
      ),
    ],
    findings: [
      tr('Diámetro máximo ≈ 15 mm; tejido sobre la cúpula ≈ 1,5 mm.', 'Maximum diameter ≈ 15 mm; tissue over the dome ≈ 1.5 mm.'),
      tr('Trombo mural ecogénico en la pared profunda (≈ 3,5 mm).', 'Echogenic mural thrombus on the deep wall (≈ 3.5 mm).'),
      tr('Flujo bidireccional en remolino.', 'Bidirectional swirling flow.'),
    ],
    tips: [
      tr(
        'No puncionar la cúpula ni la piel brillante y adelgazada (riesgo de rotura).',
        'Do not cannulate the dome or shiny, thinned skin (risk of rupture).',
      ),
      tr('Elegir segmentos proximales o distales de calibre normal.', 'Choose proximal or distal segments of normal diameter.'),
    ],
    armOpts: {},
    hr: 72,
    build: (arm) => {
      const pts = rcAvfPts({ r: 3.2 });
      const i = pts.findIndex((p) => p.x === 130);
      pts.splice(i, 1, { x: 105, th: 53, d: 7.2, ref: 'skin', r: 3.2 }, { x: 128, th: 51, d: 9.2, ref: 'skin', r: 3.2 }, { x: 150, th: 50, d: 7.0, ref: 'skin', r: 3.2 });
      return radiocephalic(arm, {
        qa: 900,
        radialQ: 800,
        veinPts: pts,
        veinExtra: {
          lesions: [
            { type: 'jet', at: 8, len: 50, sev: 0.75 },
            { type: 'aneurysm', atX: 128, len: 34, sev: 2.35, thick: 3.6, side: 195 },
          ],
        },
      });
    },
    access: {
      veinId: 'fav',
      anastomosisX: 27,
      zone: [60, 230],
      angle: 25,
      avoid: [{ x0: 108, x1: 150, reason: tr('Aneurisma: piel adelgazada y trombo mural', 'Aneurysm: thinned skin and mural thrombus') }],
    },
    probeStart: { x: 128, theta: 51, rot: 0 },
    expected: { diameter: 15, depth: 1.5, qa: 1000, mature: true, note: tr('Evitar el aneurisma', 'Avoid the aneurysm') },
  },
  {
    id: 'rc_inmadura',
    title: tr('FAV inmadura (5 semanas)', 'Immature AVF (5 weeks)'),
    short: tr('FAV inmadura', 'Immature AVF'),
    difficulty: 2,
    accessType: tr('FAV radiocefálica reciente', 'Recent radiocephalic AVF'),
    indication: tr(
      'Escasa maduración y una vena accesoria que roba flujo: la ecografía decide si la FAV se puede puncionar ya, y dónde.',
      'Poor maturation and an accessory vein stealing flow: ultrasound decides whether the AVF can be cannulated yet, and where.',
    ),
    description: tr(
      'Fístula radiocefálica de 5 semanas que no ha madurado: vena de pequeño calibre y pared fina, flujo bajo y una vena accesoria que "roba" parte del flujo. El objetivo es decidir si es apta para la punción.',
      '5-week-old radiocephalic fistula that has not matured: small-diameter, thin-walled vein, low flow and an accessory vein that "steals" part of the flow. The goal is to decide whether it is ready for cannulation.',
    ),
    objectives: [
      tr('Medir diámetro, profundidad y Qa.', 'Measure diameter, depth and Qa.'),
      tr('Aplicar los criterios de maduración (regla de los 6 / GEMAV).', 'Apply the maturation criteria (rule of 6s / GEMAV).'),
      tr('Identificar la vena accesoria competidora.', 'Identify the competing accessory vein.'),
    ],
    findings: [
      tr('Diámetro ≈ 3,2 mm (< 4 mm).', 'Diameter ≈ 3.2 mm (< 4 mm).'),
      tr('Qa humeral ≈ 420 mL/min (< 500).', 'Brachial Qa ≈ 420 mL/min (< 500).'),
      tr(
        'Vena accesoria de ≈ 2,4 mm hacia dorsal a 4 cm de la anastomosis.',
        'Accessory vein of ≈ 2.4 mm running dorsally, 4 cm from the anastomosis.',
      ),
      tr(
        'Conclusión: FAV no apta para punción; valorar causa (accesoria, estenosis).',
        'Conclusion: AVF not ready for cannulation; investigate the cause (accessory vein, stenosis).',
      ),
    ],
    tips: [
      tr('Si hubiera que puncionar, aguja 17G y flujo de bomba bajo.', 'If it must be cannulated, use a 17G needle and a low blood pump speed.'),
      tr(
        'Usa el compresor: la vena se distiende pero sigue siendo pequeña.',
        'Use the tourniquet: the vein distends but remains small.',
      ),
    ],
    armOpts: {},
    hr: 76,
    build: (arm) => {
      const defs = radiocephalic(arm, {
        radialQ: 300,
        ulnarQ: 120,
        retroQ: 40,
        radialR: 1.55,
        veinPts: rcAvfPts({ r: 1.6, depth: 4.8 }),
        veinExtra: { wall: 0.3, flow: { q: 340, wave: 'avf', profile: 3 }, pressure: 16, tourniquet: 0.16 },
      });
      defs.push({
        id: 'v_accesoria',
        name: tr('Vena accesoria', 'Accessory vein'),
        short: tr('V. accesoria', 'Accessory v.'),
        kind: 'vein',
        group: 'fav',
        pts: [
          { x: 66, th: 55, d: 4.8, ref: 'skin', r: 0.9 },
          { x: 76, th: 66, d: 4.2, ref: 'skin', r: 1.15 },
          { x: 100, th: 82, d: 3.8, ref: 'skin', r: 1.2 },
          { x: 150, th: 98, d: 3.6, ref: 'skin', r: 1.2 },
          { x: 210, th: 105, d: 3.8, ref: 'skin', r: 1.2 },
        ],
        flow: { q: 110, wave: 'avf', profile: 3 },
        pressure: 14,
        wall: 0.25,
      });
      return defs;
    },
    access: { veinId: 'fav', anastomosisX: 27, zone: [60, 230], angle: 25 },
    probeStart: { x: 90, theta: 55, rot: 0 },
    expected: { diameter: 3.2, depth: 3.1, qa: 420, mature: false, note: tr('No cumple criterios de maduración', 'Does not meet maturation criteria') },
  },
  {
    id: 'rc_colaterales',
    title: tr('Venas colaterales y bifurcación', 'Collateral veins and bifurcation'),
    short: tr('Colaterales', 'Collaterals'),
    difficulty: 2,
    accessType: tr('FAV radiocefálica', 'Radiocephalic AVF'),
    indication: tr(
      'Venas colaterales no puncionables y un desdoblamiento: la ecografía distingue la vena principal de sus ramas.',
      'Non-cannulable collateral veins and a duplication: ultrasound tells the main vein apart from its branches.',
    ),
    description: tr(
      'FAV radiocefálica madura con una gran rama colateral dorsal y un desdoblamiento de la vena en el tercio proximal del antebrazo. Riesgo de puncionar una rama de menor calibre o de atravesar una bifurcación.',
      'Mature radiocephalic AVF with a large dorsal collateral branch and a vein duplication in the proximal forearm. Risk of cannulating a smaller branch or passing through a bifurcation.',
    ),
    objectives: [
      tr('Seguir el canal principal en eje corto.', 'Follow the main channel in short axis.'),
      tr('Localizar los puntos de bifurcación y evitarlos.', 'Locate the bifurcation points and avoid them.'),
      tr('Elegir un segmento único y rectilíneo para cada aguja.', 'Choose a single, straight segment for each needle.'),
    ],
    findings: [
      tr('Rama colateral dorsal de ≈ 4,4 mm a ≈ 8 cm de la anastomosis.', 'Dorsal collateral branch of ≈ 4.4 mm at ≈ 8 cm from the anastomosis.'),
      tr('Desdoblamiento de la vena entre 17 y 22 cm.', 'Vein duplication between 17 and 22 cm.'),
    ],
    tips: [
      tr(
        'En la bifurcación la imagen transversal muestra dos luces que se separan.',
        'At the bifurcation, the transverse image shows two lumens drifting apart.',
      ),
      tr('Puncionar 1–2 cm antes o después de una confluencia.', 'Cannulate 1–2 cm before or after a confluence.'),
    ],
    armOpts: {},
    hr: 70,
    build: (arm) => {
      const defs = radiocephalic(arm, { qa: 760, radialQ: 690 });
      defs.push(
        {
          id: 'v_colateral',
          name: tr('Vena colateral dorsal', 'Dorsal collateral vein'),
          short: tr('Colateral', 'Collateral'),
          kind: 'avf',
          group: 'fav',
          pts: [
            { x: 102, th: 54, d: 6.4, ref: 'skin', r: 1.7 },
            { x: 112, th: 64, d: 5.4, ref: 'skin', r: 2.1 },
            { x: 130, th: 80, d: 5.0, ref: 'skin', r: 2.2 },
            { x: 170, th: 100, d: 5.0, ref: 'skin', r: 2.1 },
            { x: 230, th: 112, d: 5.4, ref: 'skin', r: 2.0 },
          ],
          flow: { q: 180, wave: 'avf', profile: 3 },
          wall: 0.45,
          pressure: 20,
        },
        {
          id: 'v_desdoble',
          name: tr('Desdoblamiento de la vena', 'Vein duplication'),
          short: tr('Desdoblamiento', 'Duplication'),
          kind: 'avf',
          group: 'fav',
          pts: [
            { x: 168, th: 48.5, d: 6.7, ref: 'skin', r: 1.8 },
            { x: 180, th: 39, d: 6.4, ref: 'skin', r: 2.2 },
            { x: 200, th: 36, d: 6.3, ref: 'skin', r: 2.3 },
            { x: 222, th: 42, d: 6.6, ref: 'skin', r: 2.1 },
            { x: 236, th: 49, d: 6.9, ref: 'skin', r: 1.8 },
          ],
          flow: { q: 220, wave: 'avf', profile: 3 },
          wall: 0.45,
          pressure: 20,
        },
      );
      return defs;
    },
    access: {
      veinId: 'fav',
      anastomosisX: 27,
      zone: [60, 230],
      angle: 25,
      avoid: [
        { x0: 96, x1: 118, reason: tr('Confluencia de la colateral dorsal', 'Dorsal collateral confluence') },
        { x0: 164, x1: 240, reason: tr('Desdoblamiento venoso', 'Vein duplication') },
      ],
    },
    probeStart: { x: 108, theta: 58, rot: 0 },
    expected: { diameter: 6.4, depth: 3.0, qa: 850, mature: true },
  },
  {
    id: 'bb_transpuesta',
    title: tr('FAV humerobasílica transpuesta', 'Transposed brachiobasilic AVF'),
    short: tr('Humerobasílica', 'Brachiobasilic'),
    difficulty: 3,
    accessType: tr('FAV humerobasílica transpuesta', 'Transposed brachiobasilic AVF'),
    indication: tr(
      'Vena transpuesta sobre la arteria humeral y el nervio mediano: una punción demasiado profunda puede alcanzarlos, y la ecografía controla la profundidad.',
      'Vein transposed over the brachial artery and median nerve: too deep a cannulation can reach them, and ultrasound keeps depth under control.',
    ),
    description: tr(
      'Vena basílica transpuesta a un túnel subcutáneo anteromedial del brazo. Es un acceso de alto flujo cuya vena discurre por encima de la arteria humeral y del nervio mediano. Una punción demasiado profunda o con demasiado ángulo puede atravesar la vena y alcanzar la arteria o el nervio.',
      'Basilic vein transposed into an anteromedial subcutaneous tunnel in the upper arm. A high-flow access whose vein runs over the brachial artery and median nerve. Cannulating too deep or too steep can go through the vein and reach the artery or the nerve.',
    ),
    objectives: [
      tr(
        'Identificar la arteria humeral y el nervio mediano profundos a la vena.',
        'Identify the brachial artery and median nerve deep to the vein.',
      ),
      tr('Mantener la punta visible y controlar la profundidad.', 'Keep the tip visible and control depth.'),
      tr('Evitar la transfixión de la pared posterior.', 'Avoid back-wall transfixion.'),
    ],
    findings: [
      tr('Vena ≈ 6,8 mm a ≈ 3,5 mm de la piel.', 'Vein ≈ 6.8 mm, ≈ 3.5 mm below the skin.'),
      tr(
        'Arteria humeral ≈ 8 mm más profunda y algo medial; nervio mediano adyacente.',
        'Brachial artery ≈ 8 mm deeper and slightly medial; median nerve adjacent.',
      ),
      tr('Qa ≈ 1100 mL/min.', 'Qa ≈ 1100 mL/min.'),
    ],
    tips: [
      tr('Usa ángulos bajos (20–25°) y avance controlado.', 'Use shallow angles (20–25°) and advance in a controlled way.'),
      tr(
        'En eje corto, localiza la arteria antes de puncionar: pulsátil y no compresible.',
        'In short axis, locate the artery before cannulating: pulsatile and non-compressible.',
      ),
    ],
    armOpts: { fatAdd: 1.5 },
    hr: 74,
    build: (arm) => {
      const defs = base(arm, {
        brachial: { flow: { q: 1180, wave: 'feed', profile: 2.4 }, pts: brachialProx(263, 2.8) },
        radial: { flow: { q: 30, wave: 'mixed' } },
        ulnar: { flow: { q: 40, wave: 'mixed' } },
        skipBasilic: true,
      });
      defs.push(
        {
          id: 'a_humeral_distal',
          name: tr('Arteria humeral distal', 'Distal brachial artery'),
          short: tr('A. humeral', 'Brachial a.'),
          hideLabel: true,
          kind: 'artery',
          group: 'arteria',
          pts: BRACHIAL_PTS.filter((p) => p.x <= 270).map((p, i) => (i === 0 ? { ...p, x: 262 } : p)),
          flow: { q: 70, wave: 'mixed' },
        },
        {
          id: 'fav',
          name: tr('Vena basílica transpuesta (FAV)', 'Transposed basilic vein (AVF)'),
          short: tr('FAV (v. basílica)', 'AVF (basilic v.)'),
          kind: 'avf',
          group: 'fav',
          isAccess: true,
          pts: [
            { x: 263, th: -10, d: 9, ref: 'fascia', r: 1.9 },
            { x: 272, th: -17, d: 8.5, ref: 'skin', r: 2.6 },
            { x: 300, th: -24, d: 7.4, ref: 'skin', r: 3.3 },
            { x: 360, th: -29, d: 7.0, ref: 'skin', r: 3.4 },
            { x: 440, th: -32, d: 7.2, ref: 'skin', r: 3.4 },
            { x: 520, th: -40, d: 8.5, ref: 'skin', r: 3.3 },
            { x: 575, th: -60, d: 5, ref: 'fascia', r: 3.3 },
          ],
          wall: 0.6,
          flow: { q: 1100, wave: 'avf', profile: 3.5 },
          lesions: [{ type: 'jet', at: 5, len: 40, sev: 0.8 }],
          pressure: 26,
        },
        {
          id: 'v_basilica_ab',
          name: tr('Vena basílica del antebrazo', 'Forearm basilic vein'),
          short: tr('V. basílica', 'Basilic v.'),
          kind: 'vein',
          group: 'vena',
          pts: BASILIC_PTS.filter((p) => p.x <= 285),
          flow: { q: 30, wave: 'vein' },
        },
      );
      return defs;
    },
    access: { veinId: 'fav', anastomosisX: 263, zone: [300, 530], angle: 25 },
    probeStart: { x: 380, theta: -30, rot: 0 },
    expected: { diameter: 6.8, depth: 3.5, qa: 1180, mature: true },
  },
  {
    id: 'ptfe_asa',
    title: tr('Prótesis de PTFE en asa (antebrazo)', 'PTFE loop graft (forearm)'),
    short: tr('Prótesis PTFE', 'PTFE graft'),
    difficulty: 2,
    accessType: tr('Injerto protésico húmero-basílico en asa', 'Brachiobasilic loop AV graft'),
    indication: tr(
      'Prótesis en asa: la ecografía distingue la rama arterial de la venosa y el sentido del flujo, y guía la punción a 45° sin compresor.',
      'Loop graft: ultrasound distinguishes the arterial limb from the venous limb and the flow direction, and guides cannulation at 45° without a tourniquet.',
    ),
    description: tr(
      'Prótesis de PTFE de 6 mm en asa en el antebrazo: rama arterial (desde la arteria humeral) y rama venosa (hacia la vena del codo). La pared protésica produce un doble contorno ecogénico. Se punciona a 45°, sin compresor, siguiendo la dirección del flujo en cada rama.',
      '6 mm PTFE loop graft in the forearm: arterial limb (from the brachial artery) and venous limb (to the elbow vein). The graft wall produces an echogenic double contour. It is cannulated at 45°, without a tourniquet, following the flow direction in each limb.',
    ),
    objectives: [
      tr(
        'Identificar la rama arterial y la venosa por la dirección del flujo en Doppler color.',
        'Identify the arterial and venous limbs by flow direction on color Doppler.',
      ),
      tr('Reconocer la pared protésica (doble línea).', 'Recognize the graft wall (double line).'),
      tr('Puncionar a ≈ 45° con rotación de sitios.', 'Cannulate at ≈ 45° with site rotation.'),
    ],
    findings: [
      tr('Luz uniforme de ≈ 6 mm con doble pared ecogénica.', 'Uniform ≈ 6 mm lumen with an echogenic double wall.'),
      tr(
        'Estenosis leve en la anastomosis venosa (lugar típico de hiperplasia intimal).',
        'Mild stenosis at the venous anastomosis (typical site of intimal hyperplasia).',
      ),
      tr('Qa ≈ 1000 mL/min.', 'Qa ≈ 1000 mL/min.'),
    ],
    tips: [
      tr(
        'La rama arterial (flujo hacia la mano) se punciona con la aguja arterial; la venosa, con la venosa hacia el corazón.',
        'Cannulate the arterial limb (flow toward the hand) with the arterial needle, and the venous limb with the venous needle pointing toward the heart.',
      ),
      tr('No usar compresor en prótesis.', 'Do not use a tourniquet on a graft.'),
    ],
    armOpts: {},
    hr: 72,
    build: (arm) => {
      const defs = base(arm, {
        brachial: { flow: { q: 1070, wave: 'feed', profile: 2.4 }, pts: BRACHIAL_PTS.filter((p) => p.x >= 250).map((p) => ({ ...p, r: 2.7 })) },
        radial: { flow: { q: 25, wave: 'mixed' } },
        ulnar: { flow: { q: 35, wave: 'mixed' } },
        skipCephalic: true,
      });
      defs.push(
        {
          id: 'a_humeral_distal',
          name: tr('Arteria humeral distal', 'Distal brachial artery'),
          short: tr('A. humeral', 'Brachial a.'),
          hideLabel: true,
          kind: 'artery',
          group: 'arteria',
          pts: BRACHIAL_PTS.filter((p) => p.x <= 255).map((p, i) => (i === 0 ? { ...p, x: 251 } : p)),
          flow: { q: 60, wave: 'mixed' },
        },
        {
          id: 'fav',
          name: tr('Prótesis de PTFE', 'PTFE graft'),
          short: tr('Prótesis', 'Graft'),
          kind: 'graft',
          group: 'fav',
          isAccess: true,
          pts: [
            { x: 251, th: -5, d: 10, ref: 'fascia', r: 2.2 },
            { x: 243, th: -13, d: 7.5, ref: 'skin', r: 3.0 },
            { x: 205, th: -20, d: 6.8, ref: 'skin', r: 3.0 },
            { x: 150, th: -21, d: 6.8, ref: 'skin', r: 3.0 },
            { x: 110, th: -14, d: 6.8, ref: 'skin', r: 3.0 },
            { x: 88, th: 0, d: 6.8, ref: 'skin', r: 3.0 },
            { x: 106, th: 16, d: 6.8, ref: 'skin', r: 3.0 },
            { x: 150, th: 23, d: 6.8, ref: 'skin', r: 3.0 },
            { x: 205, th: 24, d: 6.8, ref: 'skin', r: 3.0 },
            { x: 244, th: 30, d: 7.0, ref: 'skin', r: 3.0 },
            { x: 262, th: 42, d: 6.2, ref: 'skin', r: 2.8 },
          ],
          wall: 0.65,
          flow: { q: 1000, wave: 'graft', profile: 3.5 },
          lesions: [{ type: 'jet', at: 3, len: 30, sev: 0.6 }],
          pressure: 60,
        },
        {
          id: 'v_salida',
          name: tr('Vena cefálica de salida', 'Cephalic outflow vein'),
          short: tr('V. de salida', 'Outflow v.'),
          kind: 'avf',
          group: 'fav',
          pts: [
            { x: 258, th: 40, d: 6.4, ref: 'skin', r: 2.6 },
            { x: 275, th: 52, d: 6.0, ref: 'skin', r: 2.8 },
            { x: 330, th: 68, d: 6.4, ref: 'skin', r: 3.0 },
            { x: 420, th: 80, d: 7.0, ref: 'skin', r: 3.0 },
            { x: 500, th: 78, d: 8.0, ref: 'skin', r: 3.0 },
            { x: 580, th: 65, d: 9.5, ref: 'skin', r: 3.0 },
          ],
          wall: 0.55,
          flow: { q: 1000, wave: 'avf', profile: 3.5 },
          lesions: [{ type: 'stenosis', at: 9, len: 12, sev: 0.35, thick: 0.7 }],
          pressure: 30,
        },
        {
          id: 'v_cefalica_ab',
          name: tr('Vena cefálica del antebrazo', 'Forearm cephalic vein'),
          short: tr('V. cefálica', 'Cephalic v.'),
          kind: 'vein',
          group: 'vena',
          pts: CEPHALIC_PTS.filter((p) => p.x <= 180),
          flow: { q: 15, wave: 'vein' },
        },
      );
      return defs;
    },
    access: { veinId: 'fav', anastomosisX: 251, zone: [110, 235], angle: 45, graft: true },
    probeStart: { x: 170, theta: 0, rot: 0 },
    expected: { diameter: 6.0, depth: 3.2, qa: 1070, mature: true, note: tr('Prótesis: 45°, sin compresor', 'Graft: 45°, no tourniquet') },
  },
  {
    id: 'rc_hematoma',
    title: tr('Hematoma tras punción fallida', 'Hematoma after failed cannulation'),
    short: tr('Hematoma', 'Hematoma'),
    difficulty: 3,
    accessType: tr('FAV radiocefálica', 'Radiocephalic AVF'),
    indication: tr(
      'Hematoma de una punción previa: la ecografía lo delimita y busca un segmento sano lejos de él.',
      'Hematoma from a previous cannulation: ultrasound maps its extent and finds a healthy segment away from it.',
    ),
    description: tr(
      'FAV radiocefálica madura con un hematoma perivascular de la sesión anterior (extravasación por punción transfixiante). El hematoma comprime parcialmente la vena y distorsiona la anatomía. Hay que reconocerlo y elegir un sitio de punción alejado.',
      'Mature radiocephalic AVF with a perivascular hematoma from the previous session (extravasation after a back-wall puncture). The hematoma partly compresses the vein and distorts the anatomy. Recognize it and choose a cannulation site away from it.',
    ),
    objectives: [
      tr(
        'Identificar el hematoma (colección heterogénea, sin flujo Doppler).',
        'Identify the hematoma (heterogeneous collection, no Doppler flow).',
      ),
      tr('Medir su extensión.', 'Measure its extent.'),
      tr('Elegir un sitio de punción sano, ≥ 2–3 cm alejado.', 'Choose a healthy cannulation site ≥ 2–3 cm away.'),
    ],
    findings: [
      tr(
        'Colección heterogénea de ≈ 20 × 10 mm en la pared lateral y profunda de la vena.',
        'Heterogeneous ≈ 20 × 10 mm collection along the lateral and deep wall of the vein.',
      ),
      tr('Compresión extrínseca de la vena (luz reducida ~20 %).', 'Extrinsic compression of the vein (lumen reduced by ~20%).'),
    ],
    tips: [
      tr(
        'El hematoma no tiene señal Doppler: diferéncialo de la luz venosa.',
        'The hematoma has no Doppler signal: tell it apart from the venous lumen.',
      ),
      tr(
        'Evita puncionar a través del hematoma (riesgo de infección y nueva extravasación).',
        'Avoid cannulating through the hematoma (risk of infection and further extravasation).',
      ),
    ],
    armOpts: {},
    hr: 76,
    build: (arm) => {
      const defs = radiocephalic(arm, {
        veinExtra: {
          lesions: [
            { type: 'jet', at: 8, len: 50, sev: 0.75 },
            { type: 'stenosis', atX: 126, len: 20, sev: 0.22, thick: 0 },
          ],
        },
      });
      defs.push({
        id: 'hematoma',
        name: tr('Hematoma perivascular', 'Perivascular hematoma'),
        short: tr('Hematoma', 'Hematoma'),
        kind: 'hematoma',
        group: 'hematoma',
        pts: [
          { x: 116, th: 60, d: 8.4, ref: 'skin', r: 4.2 },
          { x: 126, th: 58, d: 9.0, ref: 'skin', r: 5.2 },
          { x: 136, th: 55, d: 8.6, ref: 'skin', r: 4.2 },
        ],
      });
      return defs;
    },
    access: {
      veinId: 'fav',
      anastomosisX: 27,
      zone: [60, 230],
      angle: 25,
      avoid: [{ x0: 108, x1: 145, reason: tr('Hematoma perivascular', 'Perivascular hematoma') }],
    },
    probeStart: { x: 126, theta: 55, rot: 0 },
    expected: { diameter: 6.4, depth: 3.0, qa: 830, mature: true, note: tr('Evitar la zona del hematoma', 'Avoid the hematoma area') },
  },
  {
    id: 'rc_calcificada',
    title: tr('Paciente diabético · arterias calcificadas', 'Diabetic patient · calcified arteries'),
    short: tr('Arterias calcificadas', 'Calcified arteries'),
    difficulty: 2,
    accessType: tr('FAV radiocefálica', 'Radiocephalic AVF'),
    indication: tr(
      'Paciente diabético con arterias calcificadas y la vena algo más profunda: las sombras acústicas confunden, y la ecografía localiza la vena lejos de la arteria.',
      'Diabetic patient with calcified arteries and a slightly deeper vein: acoustic shadows are confusing, and ultrasound locates the vein away from the artery.',
    ),
    description: tr(
      'Paciente diabético con calcificación de la media (Mönckeberg) en las arterias del antebrazo y algo más de tejido subcutáneo. Las arterias muestran paredes muy ecogénicas con sombra acústica, que puede ocultar estructuras profundas. La vena de la FAV es algo más profunda.',
      'Diabetic patient with medial calcification (Mönckeberg) of the forearm arteries and somewhat more subcutaneous tissue. The arteries show highly echogenic walls with acoustic shadowing that can hide deeper structures. The AVF vein is slightly deeper.',
    ),
    objectives: [
      tr('Reconocer la calcificación arterial y la sombra acústica.', 'Recognize arterial calcification and acoustic shadowing.'),
      tr('Diferenciar la arteria de la vena de la FAV.', 'Tell the artery apart from the AVF vein.'),
      tr('Puncionar una vena algo más profunda (≈ 5 mm).', 'Cannulate a slightly deeper vein (≈ 5 mm).'),
    ],
    findings: [
      tr(
        'Paredes arteriales hiperecogénicas en "raíl" con sombra posterior.',
        'Hyperechoic "rail-track" arterial walls with posterior shadowing.',
      ),
      tr('Vena de ≈ 6 mm a ≈ 5 mm de profundidad.', 'Vein of ≈ 6 mm at ≈ 5 mm depth.'),
    ],
    tips: [
      tr(
        'Cambia el ángulo de insonación para "mirar" detrás de la sombra.',
        'Change the angle of insonation to "look" behind the shadow.',
      ),
      tr('El Doppler color ayuda a identificar la luz arterial calcificada.', 'Color Doppler helps identify the calcified arterial lumen.'),
    ],
    armOpts: { fatScale: 1.6, fatAdd: 1 },
    hr: 80,
    build: (arm) => radiocephalic(arm, { calc: 0.85, veinPts: rcAvfPts({ depth: 8.4, r: 3.0 }), qa: 700, radialQ: 620 }),
    access: { veinId: 'fav', anastomosisX: 27, zone: [60, 230], angle: 30 },
    probeStart: { x: 70, theta: 48, rot: 0 },
    expected: { diameter: 6.0, depth: 4.8, qa: 800, mature: true },
  },
];

export function caseById(id: string): CaseDef {
  return CASES.find((c) => c.id === id) ?? CASES[1];
}
