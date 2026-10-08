/**
 * Pasos de la punción ecoguiada del acceso vascular, en el orden en que se hacen, marcados
 * automáticamente a partir del estado del simulador.
 *
 * Basado en: Moyano Franco MJ, Salgueira Lazo M, Roca-Tey R. Punción ecoguiada del acceso vascular
 * para hemodiálisis (Nefrología al día); GEMAV 2017; procedimientos SEDEN 3.3 y 3.4.
 */
import { tr } from '../i18n';

export interface ChecklistState {
  /** ángulo entre el brazo y el cuerpo del paciente (°) y descenso del brazo desde el hombro (°) */
  armAngle: number;
  armPitch: number;
  /** medidas terminadas con el calibre */
  measures: number;
  /** posición de la sonda a lo largo del brazo (mm desde la muñeca) */
  probeX: number;
  access?: { anastomosisX?: number; zone: [number, number]; avoid?: { x0: number; x1: number }[]; graft?: boolean };
  /** punta de la otra aguja, ya confirmada (mm desde la muñeca) */
  otherTipX: number | null;
  tourniquet: boolean;
  asepsis: boolean;
  placed: boolean;
  /** la aguja activa ha dado reflujo */
  flashed: boolean;
  inLumen: boolean;
  /** ángulo entre la aguja y el eje del vaso (°) */
  angleToVessel: number | null;
  flushes: number;
  confirmed: boolean;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
  /** cómo se hace en el simulador */
  how: string;
}

/** Brazo apoyado en una superficie firme y plana, a unos 45° del cuerpo (Nefrología al día). */
export function armPositionOk(armAngle: number, armPitch: number): boolean {
  return armAngle >= 30 && armAngle <= 60 && armPitch <= 25;
}

/** Zona de punción adecuada en la posición actual de la sonda. */
export function zoneOk(s: Pick<ChecklistState, 'probeX' | 'access' | 'otherTipX'>): boolean {
  const a = s.access;
  if (!a) return false;
  const x = s.probeX;
  if (x < a.zone[0] || x > a.zone[1]) return false;
  if (a.anastomosisX !== undefined && Math.abs(x - a.anastomosisX) < 30) return false;
  if ((a.avoid ?? []).some((z) => x >= z.x0 && x <= z.x1)) return false;
  return s.otherTipX === null || Math.abs(x - s.otherTipX) >= 50;
}

export function procedureChecklist(s: ChecklistState): ChecklistItem[] {
  const graft = !!s.access?.graft;
  return [
    {
      label: tr('Brazo apoyado, a unos 45° del cuerpo', 'Arm supported, about 45° from the body'),
      done: armPositionOk(s.armAngle, s.armPitch),
      how: tr(
        `sobre una superficie firme y plana (ahora ${Math.round(s.armAngle)}°) · Sala y ergonomía`,
        `on a firm, flat surface (now ${Math.round(s.armAngle)}°) · Room &amp; ergonomics`,
      ),
    },
    {
      label: tr('Vena localizada y medida', 'Vein located and measured'),
      done: s.measures >= 2,
      how: tr('en transversal (1), profundidad y diámetro con el calibre (M)', 'in short axis (1), depth and diameter with the caliper (M)'),
    },
    {
      label: tr('Zona de punción adecuada', 'Suitable cannulation site'),
      done: zoneOk(s),
      how: tr(
        `≥ 3 cm de la anastomosis, fuera de zonas a evitar${s.otherTipX !== null ? ' y ≥ 5 cm de la otra aguja' : ''} · pestaña Caso`,
        `≥ 3 cm from the anastomosis, outside areas to avoid${s.otherTipX !== null ? ' and ≥ 5 cm from the other needle' : ''} · Case tab`,
      ),
    },
    graft
      ? { label: tr('Sin compresor (prótesis)', 'No tourniquet (graft)'), done: !s.tourniquet, how: 'K' }
      : { label: tr('Compresor (FAV nativa)', 'Tourniquet (native AVF)'), done: s.tourniquet, how: 'K' },
    {
      label: tr('Asepsia', 'Asepsis'),
      done: s.asepsis,
      how: tr('piel desinfectada, funda y gel estériles · botón Asepsia', 'disinfected skin, sterile cover and gel · Asepsis button'),
    },
    {
      label: tr('Aguja colocada', 'Needle placed'),
      done: s.placed,
      how: tr('sonda en una mano, aguja en la otra · N o «Longitudinal · en plano»', 'probe in one hand, needle in the other · N or “Long axis · in-plane”'),
    },
    { label: tr('Punta en la luz (reflujo)', 'Tip in the lumen (flashback)'), done: s.flashed, how: tr('↑ siguiendo la punta en la pantalla', '↑ following the tip on the screen') },
    {
      label: tr('Aguja alineada y comprobada con suero', 'Needle aligned and checked with saline'),
      done: s.inLumen && s.angleToVessel !== null && s.angleToVessel <= 25 && s.flushes > 0,
      how: tr('≤ 25° con el vaso (AvPág + ↑) y lavado con suero (J)', '≤ 25° to the vessel (PgDn + ↑) and saline flush (J)'),
    },
    { label: tr('Punción confirmada', 'Cannulation confirmed'), done: s.confirmed, how: tr('Intro', 'Enter') },
  ];
}
