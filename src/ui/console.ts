/**
 * Consola del ecógrafo y controles de sonda, aguja y sala.
 */
import type { App } from '../app/App';
import { tr } from '../i18n';
import { placeDefaults } from '../scene/SceneManager';
import { SKIN_TONES } from '../scene/room';
import type { MachineSettings } from '../sim/UltrasoundSim';
import { Bound, button, el, field, group, knob, selectBox, vslider } from './controls';

/** Preajustes de examen (también en la interfaz móvil). */
export const IMAGE_PRESETS: Record<string, Partial<MachineSettings>> = {
  FAV: { freq: 12, depth: 25, focus: 8, dr: 60, gain: 0 },
  'Vasc. profundo': { freq: 10, depth: 40, focus: 18, dr: 60, gain: 2 },
  'Venoso periférico': { freq: 13, depth: 20, focus: 6, dr: 55, gain: 0 },
  Nervio: { freq: 14, depth: 30, focus: 12, dr: 55, gain: 1 },
};

/** Nombre visible de un preajuste: la clave (en español) es la que se guarda en los ajustes. */
const PRESET_EN: Record<string, string> = { FAV: 'AVF', 'Vasc. profundo': 'Deep vasc.', 'Venoso periférico': 'Peripheral vein', Nervio: 'Nerve' };
export function presetLabel(key: string): string {
  return tr(key, PRESET_EN[key] ?? key);
}

export function buildConsole(app: App, root: HTMLElement): () => void {
  const bounds: Bound[] = [];
  const add = <T extends Bound>(parent: HTMLElement, b: T): T => {
    parent.appendChild(b.el);
    bounds.push(b);
    return b;
  };
  const s = () => app.sim.settings;

  // botón que mantiene una "tecla" pulsada mientras se presiona
  const hold = (label: string, key: string, title: string) => {
    const b = el('button', { title }, label);
    const down = (e: PointerEvent) => {
      app.keys.add(key);
      b.setPointerCapture(e.pointerId);
    };
    const up = () => app.keys.delete(key);
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    return b;
  };

  // ---------------- Sonda ----------------
  const gProbe = group(tr('Sonda · maniobras PART', 'Probe · PART maneuvers'));
  gProbe.root.dataset.grp = 'probe';
  const pad = el('div', { class: 'pad' });
  const padBtn = (l: string, k: string, t: string) => pad.appendChild(hold(l, k, t));
  pad.appendChild(hold('⟲', 'q', tr('Rotar (Q)', 'Rotate (Q)')));
  padBtn('▲', 'w', tr('Deslizar hacia proximal (W)', 'Slide proximally (W)'));
  pad.appendChild(hold('⟳', 'e', tr('Rotar (E)', 'Rotate (E)')));
  padBtn('◀', 'a', tr('Deslizar alrededor del brazo (A)', 'Slide around the arm (A)'));
  const ctr = el('button', { title: tr('Centrar sobre el vaso de acceso (ayuda)', 'Center over the access vessel (aid)') }, '◎');
  ctr.addEventListener('click', () => app.centerOnVessel());
  pad.appendChild(ctr);
  padBtn('▶', 'd', tr('Deslizar alrededor del brazo (D)', 'Slide around the arm (D)'));
  pad.appendChild(hold('↶', 'f', tr('Inclinar (F)', 'Tilt (F)')));
  padBtn('▼', 's', tr('Deslizar hacia distal (S)', 'Slide distally (S)'));
  pad.appendChild(hold('↷', 'r', tr('Inclinar (R)', 'Tilt (R)')));
  gProbe.body.appendChild(pad);
  const pc = el('div', { class: 'ccol' });
  pc.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  const rb = el('div', { class: 'crow adv' });
  rb.appendChild(hold(tr('Balanceo ◁', 'Rock ◁'), 'g', tr('Balanceo talón-punta (G)', 'Heel-toe rock (G)')));
  rb.appendChild(hold('▷', 't', tr('Balanceo talón-punta (T)', 'Heel-toe rock (T)')));
  pc.appendChild(rb);
  const vb = el('div', { class: 'crow' });
  add(vb, button(tr('Transversal', 'Short axis'), () => app.setProbeView('trans'), { title: tr('Corte transversal del vaso: eje corto (1)', 'Transverse view of the vessel: short axis (1)') }));
  add(vb, button(tr('Longitudinal', 'Long axis'), () => app.setProbeView('long'), { title: tr('Corte longitudinal del vaso: eje largo (2)', 'Longitudinal view of the vessel: long axis (2)') }));
  pc.appendChild(vb);
  const tb = el('div', { class: 'crow' });
  add(tb, button(tr('Compresor', 'Tourniquet'), () => app.setTourniquet(!app.tourniquet), { title: tr('Aplicar/retirar compresor (K)', 'Apply/release tourniquet (K)'), active: () => app.tourniquet }));
  add(tb, button(tr('Neutro', 'Neutral'), () => Object.assign(app.probe, { tilt: 0, rock: 0 }), { title: tr('Inclinación y balanceo a 0°', 'Tilt and rock to 0°') })).el.classList.add('adv');
  pc.appendChild(tb);
  gProbe.body.appendChild(pc);
  add(gProbe.body, vslider(tr('Presión', 'Pressure'), () => app.probe.press, (v) => (app.probe.press = v), { min: 0, max: 12, step: 0.1, title: tr('Presión de la sonda (Z/X): colapsa las venas', 'Probe pressure (Z/X): collapses the veins') }));
  root.appendChild(gProbe.root);

  // ---------------- Imagen ----------------
  const gImg = group(tr('Imagen 2D', '2D image'));
  gImg.root.dataset.grp = 'image';
  const presets = IMAGE_PRESETS;
  const prCol = el('div', { class: 'ccol' });
  prCol.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  add(
    prCol,
    selectBox(
      Object.keys(presets).map((k) => [k, presetLabel(k)] as [string, string]),
      () => s().preset,
      (v) => {
        Object.assign(s(), presets[v], { preset: v });
      },
      tr('Preajuste de examen', 'Exam preset'),
    ),
  ).el.classList.add('adv');
  add(prCol, button(tr('Congelar', 'Freeze'), () => (s().frozen = !s().frozen), { title: tr('Congelar imagen (espacio)', 'Freeze image (Space)'), active: () => s().frozen }));
  add(prCol, button(tr('Medir', 'Measure'), () => (app.monitor.tool = app.monitor.tool === 'caliper' ? 'none' : 'caliper'), { title: tr('Calibre (M)', 'Caliper (M)'), active: () => app.monitor.tool === 'caliper' }));
  add(prCol, button(tr('Etiquetas', 'Labels'), () => (app.labels = !app.labels), { title: tr('Nombres de estructuras sobre la imagen (L)', 'Structure names on the image (L)'), active: () => app.labels }));
  add(prCol, button(tr('Ayudas', 'Aids'), () => (app.aids = !app.aids), { title: tr('Ayudas visuales: posición real de la punta, tejido bajo el cursor', 'Visual aids: true tip position, tissue under the cursor'), active: () => app.aids }));
  gImg.body.appendChild(prCol);
  add(gImg.body, knob(tr('Ganancia', 'Gain'), () => s().gain, (v) => (s().gain = v), { min: -25, max: 25, step: 1, def: 0, fmt: (v) => String(55 + v) }));
  add(gImg.body, knob(tr('Profund.', 'Depth'), () => s().depth, (v) => (s().depth = v), { min: 15, max: 60, step: 5, def: 25, fmt: (v) => `${(v / 10).toFixed(1)} cm` }));
  add(gImg.body, knob(tr('Foco', 'Focus'), () => s().focus, (v) => (s().focus = Math.min(v, s().depth - 1)), { min: 2, max: 50, step: 1, def: 8, fmt: (v) => `${v} mm` })).el.classList.add('adv');
  add(
    gImg.body,
    knob(
      tr('Frecuencia', 'Frequency'),
      () => s().freq,
      (v) => {
        s().freq = v;
        app.lessonFlags.freqChanged = 1;
      },
      { min: 6, max: 15, step: 1, def: 12, fmt: (v) => `${v} MHz`, title: tr('Frecuencia: sonda lineal de alta frecuencia (7,5–12,5 MHz para el acceso vascular)', 'Frequency: high-frequency linear probe (7.5–12.5 MHz for vascular access)') },
    ),
  ).el.classList.add('adv');
  add(gImg.body, knob(tr('Rango din.', 'Dyn. range'), () => s().dr, (v) => (s().dr = v), { min: 40, max: 90, step: 5, def: 60, fmt: (v) => `${v} dB` })).el.classList.add('adv');
  const tgc = el('div', { class: 'tgc adv', title: tr('Compensación de ganancia en profundidad (TGC)', 'Time gain compensation (TGC)') });
  for (let i = 0; i < 8; i++) add(tgc, vslider(i === 0 ? 'TGC' : '', () => s().tgc[i], (v) => (s().tgc[i] = v), { min: -15, max: 15, step: 1, title: tr(`TGC banda ${i + 1}`, `TGC band ${i + 1}`) }));
  gImg.body.appendChild(tgc);
  const imCol = el('div', { class: 'ccol adv' });
  imCol.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  add(imCol, field('Persist.', () => s().persistence, (v) => (s().persistence = v), { min: 0, max: 0.85, step: 0.05, fmt: (v) => String(Math.round(v * 10)) }));
  add(imCol, field('Speckle', () => s().sri, (v) => (s().sri = v), { min: 0, max: 1, step: 0.05, fmt: (v) => String(Math.round(v * 5)), title: tr('Reducción de speckle', 'Speckle reduction') }));
  add(imCol, field(tr('Fusión', 'Fusion'), () => s().fusion, (v) => (s().fusion = v), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)} %`, title: tr('Superponer la anatomía real sobre la ecografía', 'Overlay the true anatomy on the ultrasound image') }));
  const r2 = el('div', { class: 'crow' });
  add(r2, button(tr('Invertir I/D', 'Flip L/R'), () => {
    s().flipLR = !s().flipLR;
    if (s().flipLR) app.lessonFlags.flipSeen = 1;
  }, { title: tr('Invierte la imagen izquierda-derecha (I)', 'Flips the image left/right (I)'), active: () => s().flipLR }));
  add(r2, selectBox([['0', tr('Gris', 'Gray')], ['1', 'Sepia'], ['2', tr('Azul', 'Blue')]], () => String(s().grayMap) as '0', (v) => (s().grayMap = parseInt(v) as 0 | 1 | 2), tr('Mapa de color del modo B', 'B-mode color map')));
  add(r2, button(tr('2 focos', '2 foci'), () => (s().focusZones = s().focusZones === 2 ? 1 : 2), { active: () => s().focusZones === 2, title: tr('Dos zonas focales (menor frecuencia de imagen)', 'Two focal zones (lower frame rate)') }));
  imCol.appendChild(r2);
  gImg.body.appendChild(imCol);
  root.appendChild(gImg.root);

  // ---------------- Doppler ----------------
  const gDop = group('Doppler');
  gDop.root.dataset.grp = 'doppler';
  gDop.root.classList.add('adv');
  const mCol = el('div', { class: 'ccol' });
  mCol.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  add(mCol, button(tr('Modo B', 'B-mode'), () => {
    s().mode = 'B';
    s().pw = false;
  }, { active: () => s().mode === 'B' && !s().pw }));
  add(mCol, button('Color', () => (s().mode = s().mode === 'color' ? 'B' : 'color'), { title: tr('Doppler color (C)', 'Color Doppler (C)'), active: () => s().mode === 'color' }));
  add(mCol, button('Power', () => (s().mode = s().mode === 'power' ? 'B' : 'power'), { title: tr('Doppler de potencia', 'Power Doppler'), active: () => s().mode === 'power' }));
  add(mCol, button('PW', () => {
    s().pw = !s().pw;
    app.spectral.enabled = s().pw;
    if (s().pw && s().mode === 'B') s().mode = 'color';
  }, { title: tr('Doppler pulsado (P)', 'Pulsed-wave Doppler (P)'), active: () => s().pw }));
  gDop.body.appendChild(mCol);
  add(
    gDop.body,
    knob(
      tr('Escala', 'Scale'),
      () => (s().pw ? app.spectral.scale : s().scale),
      (v) => {
        if (s().pw) app.spectral.scale = v;
        else s().scale = v;
      },
      { min: 10, max: 600, step: 5, def: 60, fmt: (v) => `±${v}`, title: tr('Escala de velocidad / PRF (cm/s). Con PW activo ajusta la escala del espectro', 'Velocity scale / PRF (cm/s). With PW on, it sets the spectrum scale') },
    ),
  );
  add(gDop.body, knob(tr('Gan. color', 'Color gain'), () => s().colorGain, (v) => (s().colorGain = v), { min: 0, max: 1, step: 0.02, def: 0.6, fmt: (v) => String(Math.round(v * 100)) }));
  add(gDop.body, knob(tr('Filtro pared', 'Wall filter'), () => s().wallFilter, (v) => (s().wallFilter = v), { min: 0, max: 30, step: 1, def: 4, fmt: (v) => `${v}` }));
  add(gDop.body, knob(tr('Línea base', 'Baseline'), () => app.spectral.baseline, (v) => {
    app.spectral.baseline = v;
    s().baseline = (v - 0.5) * 2;
  }, { min: 0.1, max: 0.9, step: 0.05, def: 0.5, fmt: (v) => `${Math.round((v - 0.5) * 200)}%` }));
  const dCol = el('div', { class: 'ccol' });
  dCol.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  const steerB = add(dCol, button(tr('Ángulo 0°', 'Steer 0°'), () => {
    const v = s().steer;
    s().steer = v === 0 ? 20 : v === 20 ? -20 : 0;
  }, { title: tr('Angulación del haz Doppler (−20°, 0°, +20°)', 'Doppler beam steering (−20°, 0°, +20°)') }));
  const updSteer = steerB.update;
  steerB.update = () => {
    updSteer();
    steerB.el.textContent = `${tr('Ángulo', 'Steer')} ${s().steer > 0 ? '+' : ''}${s().steer}°`;
  };
  add(dCol, button(tr('Invertir', 'Invert'), () => {
    s().invert = !s().invert;
    app.spectral.invert = s().invert;
  }, { active: () => s().invert, title: tr('Invertir los colores/espectro', 'Invert colors/spectrum') }));
  add(dCol, field(tr('VM', 'SV'), () => s().pwGate.size, (v) => (s().pwGate.size = v), { min: 0.5, max: 12, step: 0.5, fmt: (v) => `${v} mm`, title: tr('Tamaño del volumen de muestra PW', 'PW sample volume size') }));
  add(dCol, field(tr('Corr. áng.', 'Angle corr.'), () => app.spectral.angleCorr, (v) => (app.spectral.angleCorr = v), { min: 0, max: 80, step: 1, fmt: (v) => `${v}°`, title: tr('Corrección de ángulo (debe alinearse con el eje del vaso; ≤ 60°)', 'Angle correction (align it with the vessel axis; ≤ 60°)') }));
  const au = el('div', { class: 'crow' });
  add(au, button('Audio', async () => {
    if (app.audio.ctx?.state === 'running') app.audio.stop();
    else await app.audio.start();
  }, { active: () => app.audio.ctx?.state === 'running', title: tr('Sonido Doppler (estéreo)', 'Doppler sound (stereo)') }));
  dCol.appendChild(au);
  gDop.body.appendChild(dCol);
  root.appendChild(gDop.root);

  // ---------------- Aguja ----------------
  const gNd = group(tr('Aguja de punción', 'Cannulation needle'));
  gNd.root.dataset.grp = 'needle';
  const nCol = el('div', { class: 'ccol' });
  nCol.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  const nr = el('div', { class: 'crow' });
  add(nr, button('Arterial', () => (app.activeNeedle = 0), { active: () => app.activeNeedle === 0, title: tr('Aguja arterial (aletas rojas)', 'Arterial needle (red wings)') }));
  add(nr, button(tr('Venosa', 'Venous'), () => (app.activeNeedle = 1), { active: () => app.activeNeedle === 1, title: tr('Aguja venosa (aletas azules)', 'Venous needle (blue wings)') }));
  nCol.appendChild(nr);
  const nr2 = el('div', { class: 'crow' });
  add(
    nr2,
    selectBox(
      [['17', '17G'], ['16', '16G'], ['15', '15G'], ['14', '14G']],
      () => String(app.needle.gauge) as '15',
      (v) => {
        app.needle.gauge = parseInt(v);
        app.scene.resetNeedles();
      },
      tr('Calibre (FAV nueva: empezar con 17G)', 'Gauge (new AVF: start with 17G)'),
    ),
  );
  add(
    nr2,
    selectBox(
      [['25', '25 mm'], ['32', '32 mm']],
      () => String(app.needle.length) as '25',
      (v) => (app.needle.length = parseInt(v)),
      tr('Longitud de la aguja', 'Needle length'),
    ),
  ).el.classList.add('adv');
  nCol.appendChild(nr2);
  add(nCol, button(tr('Asepsia', 'Asepsis'), () => app.setAsepsis(!app.asepsis), { title: tr('Preparación aséptica antes de puncionar: piel desinfectada, funda estéril en la sonda y gel estéril', 'Aseptic preparation before cannulation: disinfected skin, sterile probe cover and sterile gel'), active: () => app.asepsis }));
  nCol.appendChild(el('div', { class: 'mini' }, tr('Colocar la aguja · abordaje', 'Place the needle · approach')));
  add(nCol, button(tr('Longitudinal · en plano', 'Long axis · in-plane'), () => app.placeNeedleAuto('ip'), { title: tr('Abordaje longitudinal (en plano), el preferido: la aguja entra por el extremo de la sonda y se ve entera (N con la sonda en longitudinal)', 'Long-axis (in-plane) approach, the preferred one: the needle enters at the end of the probe and is seen along its whole length (N with the probe in long axis)') }));
  add(nCol, button(tr('Transversal · fuera de plano', 'Short axis · out-of-plane'), () => app.placeNeedleAuto('oop'), { title: tr('Abordaje transversal (fuera de plano): la aguja entra en la línea media de la sonda; no se ve la entrada en la pared, hay que seguir la punta (N con la sonda en transversal)', 'Short-axis (out-of-plane) approach: the needle enters at the probe midline; wall entry is not seen, so you must track the tip (N with the probe in short axis)') }));
  add(nCol, button(tr('Clic en la piel…', 'Click on skin…'), () => {
    app.placingNeedle = !app.placingNeedle;
    if (app.placingNeedle) app.toast(tr('Haz clic sobre la piel en la vista 3D para elegir el punto de punción', 'Click on the skin in the 3D view to choose the insertion site'), 'info');
  }, { active: () => app.placingNeedle })).el.classList.add('adv');
  gNd.body.appendChild(nCol);
  const nCol2 = el('div', { class: 'ccol' });
  nCol2.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  add(nCol2, field(tr('Ángulo', 'Angle'), () => app.needle.angle, (v) => (app.needle.angle = v), { min: 5, max: 70, step: 1, fmt: (v) => `${v.toFixed(0)}°`, title: tr('Ángulo de inserción respecto a la piel (FAV 20–35°, prótesis ≈45°)', 'Insertion angle to the skin (AVF 20–35°, graft ≈45°)') }));
  add(nCol2, field(tr('Rumbo', 'Heading'), () => app.needle.heading, (v) => (app.needle.heading = v), { min: -180, max: 180, step: 1, fmt: (v) => `${v.toFixed(0)}°`, title: tr('Dirección de la aguja sobre la piel', 'Needle direction over the skin') })).el.classList.add('adv');
  add(nCol2, field(tr('Insertada', 'Inserted'), () => Math.max(0, app.needle.depth), (v) => {
    if (app.needle.placed && !app.needle.confirmed) app.needle.depth = v;
  }, { min: 0, max: 30, step: 0.1, fmt: (v) => `${v.toFixed(1)} mm` }));
  const adv = el('div', { class: 'crow' });
  adv.appendChild(hold(tr('▲ Avanzar', '▲ Advance'), 'arrowup', tr('Avanzar la aguja (↑)', 'Advance the needle (↑)')));
  adv.appendChild(hold(tr('▼ Retirar', '▼ Withdraw'), 'arrowdown', tr('Retirar la aguja (↓)', 'Withdraw the needle (↓)')));
  add(adv, button('⇄', () => {
    const n = app.needle;
    // invertir el rumbo sólo con la aguja fuera de la piel: dentro del tejido sería un barrido de 180°
    if (n.placed && n.depth > 0) {
      app.toast(tr('Retira la aguja de la piel para invertir su dirección', 'Withdraw the needle from the skin to reverse its direction'), 'warn');
      return;
    }
    n.heading = n.heading > 0 ? n.heading - 180 : n.heading + 180;
  }, { title: tr('Invertir la dirección (anterógrada/retrógrada), con la aguja fuera de la piel', 'Reverse the direction (antegrade/retrograde), with the needle out of the skin') })).el.classList.add('adv');
  nCol2.appendChild(adv);
  const cf = el('div', { class: 'crow' });
  add(cf, button(tr('Confirmar punción', 'Confirm cannulation'), () => app.confirmPuncture(), { cls: 'primary', title: tr('Evaluar la posición final (Intro)', 'Assess the final position (Enter)') }));
  add(cf, button(tr('Suero', 'Saline'), () => app.flushNeedle(), { title: tr('Lavar con 10 mL de suero para comprobar la posición de la punta (J): en la luz se ven microburbujas arrastradas por el flujo; fuera, infiltración', 'Flush with 10 mL of saline to check the tip position (J): in the lumen, microbubbles are swept along by the flow; outside it, infiltration') }));
  add(cf, button(tr('Retirar aguja', 'Remove needle'), () => app.withdrawNeedle(), { cls: 'danger' }));
  add(cf, button(tr('Realce', 'Enhance'), () => (s().needleEnhance = !s().needleEnhance), { active: () => s().needleEnhance, title: tr('Realce de aguja (angulación del haz hacia la aguja)', 'Needle enhancement (beam steered toward the needle)') })).el.classList.add('adv');
  nCol2.appendChild(cf);
  gNd.body.appendChild(nCol2);
  root.appendChild(gNd.root);

  // ---------------- Sala ----------------
  const gRoom = group(tr('Sala · paciente · pantalla', 'Room · patient · screen'));
  gRoom.root.dataset.grp = 'room';
  const cfg = () => app.scene.cfg;
  const apply = (rebuild = false) => app.scene.setRoomConfig(cfg(), rebuild);
  const rc1 = el('div', { class: 'ccol' });
  rc1.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  rc1.appendChild(el('div', { class: 'mini' }, tr('Brazo del paciente', "Patient's arm")));
  // armYaw: 0° = brazo en cruz (lateral puro), 90° = hacia delante, junto al cuerpo
  add(rc1, field(tr('Con el cuerpo', 'From body'), () => 90 - cfg().armYaw, (v) => {
    cfg().armYaw = 90 - v;
    apply(true);
  }, { min: 15, max: 90, step: 1, fmt: (v) => `${v}°`, title: tr('Ángulo entre el brazo y el cuerpo del paciente: recomendado ≈ 45°, apoyado en una superficie firme y plana', "Angle between the arm and the patient's body: ≈ 45° recommended, resting on a firm, flat surface") }));
  add(rc1, field(tr('Descenso', 'Drop'), () => cfg().armPitch, (v) => {
    cfg().armPitch = v;
    apply(true);
  }, { min: 0, max: 35, step: 1, fmt: (v) => `${v}°` }));
  add(rc1, field(tr('Rotación', 'Rotation'), () => cfg().armRoll, (v) => {
    cfg().armRoll = v;
    apply();
  }, { min: -60, max: 60, step: 1, fmt: (v) => `${v}°`, title: tr('Supinación (0°) / pronación', 'Supination (0°) / pronation') }));
  add(rc1, selectBox(Object.keys(SKIN_TONES).map((k) => [k, tr(`Fototipo ${k}`, `Skin type ${k}`)] as [string, string]), () => cfg().tone, (v) => {
    cfg().tone = v;
    apply(true);
  }, tr('Tono de piel', 'Skin tone')));
  gRoom.body.appendChild(rc1);
  const rc2 = el('div', { class: 'ccol' });
  rc2.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  rc2.appendChild(el('div', { class: 'mini' }, tr('Monitor del ecógrafo', 'Ultrasound monitor')));
  add(rc2, field(tr('Giro', 'Swivel'), () => cfg().cart.monitorYaw, (v) => {
    cfg().cart.monitorYaw = v;
    apply();
  }, { min: -1.6, max: 1.6, step: 0.02, fmt: (v) => `${Math.round((v * 180) / Math.PI)}°` }));
  add(rc2, field(tr('Inclinación', 'Tilt'), () => cfg().cart.monitorPitch, (v) => {
    cfg().cart.monitorPitch = v;
    apply();
  }, { min: -0.6, max: 0.4, step: 0.02, fmt: (v) => `${Math.round((v * 180) / Math.PI)}°` }));
  add(rc2, field(tr('Altura', 'Height'), () => cfg().cart.monitorHeight, (v) => {
    cfg().cart.monitorHeight = v;
    apply();
  }, { min: -0.25, max: 0.35, step: 0.01, fmt: (v) => `${Math.round(v * 100)} cm` }));
  gRoom.body.appendChild(rc2);
  const rc3 = el('div', { class: 'ccol' });
  rc3.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  rc3.appendChild(el('div', { class: 'mini' }, tr('Operador', 'Operator')));
  add(rc3, button(tr('Sentado', 'Seated'), () => {
    cfg().operator.seated = !cfg().operator.seated;
    apply();
  }, { active: () => cfg().operator.seated }));
  add(rc3, button(tr('Vista del operador', "Operator's view"), () => app.scene.setPreset('operador'), {}));
  add(rc3, button(tr('Vista de sala', 'Room view'), () => app.scene.setPreset('sala'), {}));
  add(rc3, button(tr('Disposición recomendada', 'Recommended layout'), () => {
    placeDefaults(cfg());
    apply(true);
    app.toast(tr('Operador, paciente y pantalla en la disposición recomendada (en línea)', 'Operator, patient and screen in the recommended layout (in line)'), 'ok');
  }, { cls: 'primary' }));
  rc3.appendChild(el('div', { class: 'mini' }, tr('Arrastra el ecógrafo o al operador<br>por el suelo en la vista 3D', 'Drag the ultrasound machine or the operator<br>across the floor in the 3D view')));
  gRoom.body.appendChild(rc3);
  root.appendChild(gRoom.root);

  // ---------------- Modo básico / avanzado ----------------
  // siempre visible en el borde derecho de la consola (también cuando esta se desplaza)
  const gLvl = el('div', { class: 'cgroup level-toggle' });
  const lvlTitle = el('h5', {}, '');
  gLvl.appendChild(lvlTitle);
  const lvlBtn = add(gLvl, button('', () => app.setUiLevel(app.uiLevel === 'basico' ? 'avanzado' : 'basico')));
  const lvlUpd = lvlBtn.update;
  lvlBtn.update = () => {
    lvlUpd();
    const basic = app.uiLevel === 'basico';
    lvlTitle.innerHTML = `<span>${basic ? tr('Modo básico', 'Basic mode') : tr('Modo avanzado', 'Advanced mode')}</span>`;
    lvlBtn.el.textContent = basic ? tr('Más controles ▸', 'More controls ▸') : tr('◂ Menos controles', '◂ Fewer controls');
    lvlBtn.el.title = basic
      ? tr('Mostrar todos los controles: Doppler color y pulsado, foco, frecuencia, TGC, rumbo de la aguja…', 'Show all controls: color and pulsed-wave Doppler, focus, frequency, TGC, needle heading…')
      : tr('Volver al modo básico: solo los controles de la punción', 'Back to basic mode: cannulation controls only');
  };
  root.appendChild(gLvl);

  // orden: sonda, aguja, imagen, Doppler, sala (la aguja justo tras la sonda para verla sin desplazar)
  root.insertBefore(gNd.root, gImg.root);
  const update = () => {
    const m = app.mode;
    gNd.root.classList.toggle('hidden', !app.needleMode());
    gRoom.root.classList.toggle('hidden', m !== 'room');
    gDop.root.classList.toggle('hidden', m === 'room');
    gImg.root.classList.toggle('hidden', m === 'room');
    for (const b of bounds) b.update();
  };
  update();
  return update;
}
