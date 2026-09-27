/**
 * Consola del ecógrafo y controles de sonda, aguja y sala.
 */
import type { App } from '../app/App';
import { placeDefaults } from '../scene/SceneManager';
import { SKIN_TONES } from '../scene/room';
import { Bound, button, el, field, group, knob, selectBox, vslider } from './controls';

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
  const gProbe = group('Sonda · maniobras PART');
  gProbe.root.dataset.grp = 'probe';
  const pad = el('div', { class: 'pad' });
  const padBtn = (l: string, k: string, t: string) => pad.appendChild(hold(l, k, t));
  pad.appendChild(hold('⟲', 'q', 'Rotar (Q)'));
  padBtn('▲', 'w', 'Deslizar hacia proximal (W)');
  pad.appendChild(hold('⟳', 'e', 'Rotar (E)'));
  padBtn('◀', 'a', 'Deslizar alrededor del brazo (A)');
  const ctr = el('button', { title: 'Centrar sobre el vaso de acceso (ayuda)' }, '◎');
  ctr.addEventListener('click', () => app.centerOnVessel());
  pad.appendChild(ctr);
  padBtn('▶', 'd', 'Deslizar alrededor del brazo (D)');
  pad.appendChild(hold('↶', 'f', 'Inclinar (F)'));
  padBtn('▼', 's', 'Deslizar hacia distal (S)');
  pad.appendChild(hold('↷', 'r', 'Inclinar (R)'));
  gProbe.body.appendChild(pad);
  const pc = el('div', { class: 'ccol' });
  pc.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  const rb = el('div', { class: 'crow adv' });
  rb.appendChild(hold('Balanceo ◁', 'g', 'Balanceo talón-punta (G)'));
  rb.appendChild(hold('▷', 't', 'Balanceo talón-punta (T)'));
  pc.appendChild(rb);
  const vb = el('div', { class: 'crow' });
  add(vb, button('Transversal', () => app.setProbeView('trans'), { title: 'Corte transversal del vaso: eje corto (1)' }));
  add(vb, button('Longitudinal', () => app.setProbeView('long'), { title: 'Corte longitudinal del vaso: eje largo (2)' }));
  pc.appendChild(vb);
  const tb = el('div', { class: 'crow' });
  add(tb, button('Compresor', () => app.setTourniquet(!app.tourniquet), { title: 'Aplicar/retirar compresor (K)', active: () => app.tourniquet }));
  add(tb, button('Neutro', () => Object.assign(app.probe, { tilt: 0, rock: 0 }), { title: 'Inclinación y balanceo a 0°' })).el.classList.add('adv');
  pc.appendChild(tb);
  gProbe.body.appendChild(pc);
  add(gProbe.body, vslider('Presión', () => app.probe.press, (v) => (app.probe.press = v), { min: 0, max: 12, step: 0.1, title: 'Presión de la sonda (Z/X): colapsa las venas' }));
  root.appendChild(gProbe.root);

  // ---------------- Imagen ----------------
  const gImg = group('Imagen 2D');
  gImg.root.dataset.grp = 'image';
  const presets: Record<string, Partial<ReturnType<typeof s>>> = {
    FAV: { freq: 12, depth: 25, focus: 8, dr: 60, gain: 0 },
    'Vasc. profundo': { freq: 10, depth: 40, focus: 18, dr: 60, gain: 2 },
    'Venoso periférico': { freq: 13, depth: 20, focus: 6, dr: 55, gain: 0 },
    Nervio: { freq: 14, depth: 30, focus: 12, dr: 55, gain: 1 },
  };
  const prCol = el('div', { class: 'ccol' });
  prCol.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  add(
    prCol,
    selectBox(
      Object.keys(presets).map((k) => [k, k] as [string, string]),
      () => s().preset,
      (v) => {
        Object.assign(s(), presets[v], { preset: v });
      },
      'Preajuste de examen',
    ),
  ).el.classList.add('adv');
  add(prCol, button('Congelar', () => (s().frozen = !s().frozen), { title: 'Congelar imagen (espacio)', active: () => s().frozen }));
  add(prCol, button('Medir', () => (app.monitor.tool = app.monitor.tool === 'caliper' ? 'none' : 'caliper'), { title: 'Calibre (M)', active: () => app.monitor.tool === 'caliper' }));
  add(prCol, button('Etiquetas', () => (app.labels = !app.labels), { title: 'Nombres de estructuras sobre la imagen (L)', active: () => app.labels }));
  add(prCol, button('Ayudas', () => (app.aids = !app.aids), { title: 'Ayudas visuales: posición real de la punta, tejido bajo el cursor', active: () => app.aids }));
  gImg.body.appendChild(prCol);
  add(gImg.body, knob('Ganancia', () => s().gain, (v) => (s().gain = v), { min: -25, max: 25, step: 1, def: 0, fmt: (v) => String(55 + v) }));
  add(gImg.body, knob('Profund.', () => s().depth, (v) => (s().depth = v), { min: 15, max: 60, step: 5, def: 25, fmt: (v) => `${(v / 10).toFixed(1)} cm` }));
  add(gImg.body, knob('Foco', () => s().focus, (v) => (s().focus = Math.min(v, s().depth - 1)), { min: 2, max: 50, step: 1, def: 8, fmt: (v) => `${v} mm` })).el.classList.add('adv');
  add(
    gImg.body,
    knob(
      'Frecuencia',
      () => s().freq,
      (v) => {
        s().freq = v;
        app.lessonFlags.freqChanged = 1;
      },
      { min: 6, max: 15, step: 1, def: 12, fmt: (v) => `${v} MHz`, title: 'Frecuencia: sonda lineal de alta frecuencia (7,5–12,5 MHz para el acceso vascular)' },
    ),
  ).el.classList.add('adv');
  add(gImg.body, knob('Rango din.', () => s().dr, (v) => (s().dr = v), { min: 40, max: 90, step: 5, def: 60, fmt: (v) => `${v} dB` })).el.classList.add('adv');
  const tgc = el('div', { class: 'tgc adv', title: 'Compensación de ganancia en profundidad (TGC)' });
  for (let i = 0; i < 8; i++) add(tgc, vslider(i === 0 ? 'TGC' : '', () => s().tgc[i], (v) => (s().tgc[i] = v), { min: -15, max: 15, step: 1, title: `TGC banda ${i + 1}` }));
  gImg.body.appendChild(tgc);
  const imCol = el('div', { class: 'ccol adv' });
  imCol.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  add(imCol, field('Persist.', () => s().persistence, (v) => (s().persistence = v), { min: 0, max: 0.85, step: 0.05, fmt: (v) => String(Math.round(v * 10)) }));
  add(imCol, field('Speckle', () => s().sri, (v) => (s().sri = v), { min: 0, max: 1, step: 0.05, fmt: (v) => String(Math.round(v * 5)), title: 'Reducción de speckle' }));
  add(imCol, field('Fusión', () => s().fusion, (v) => (s().fusion = v), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)} %`, title: 'Superponer la anatomía real sobre la ecografía' }));
  const r2 = el('div', { class: 'crow' });
  add(r2, button('Invertir I/D', () => {
    s().flipLR = !s().flipLR;
    if (s().flipLR) app.lessonFlags.flipSeen = 1;
  }, { title: 'Invierte la imagen izquierda-derecha (I)', active: () => s().flipLR }));
  add(r2, selectBox([['0', 'Gris'], ['1', 'Sepia'], ['2', 'Azul']], () => String(s().grayMap) as '0', (v) => (s().grayMap = parseInt(v) as 0 | 1 | 2), 'Mapa de color del modo B'));
  add(r2, button('2 focos', () => (s().focusZones = s().focusZones === 2 ? 1 : 2), { active: () => s().focusZones === 2, title: 'Dos zonas focales (menor frecuencia de imagen)' }));
  imCol.appendChild(r2);
  gImg.body.appendChild(imCol);
  root.appendChild(gImg.root);

  // ---------------- Doppler ----------------
  const gDop = group('Doppler');
  gDop.root.dataset.grp = 'doppler';
  gDop.root.classList.add('adv');
  const mCol = el('div', { class: 'ccol' });
  mCol.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  add(mCol, button('Modo B', () => {
    s().mode = 'B';
    s().pw = false;
  }, { active: () => s().mode === 'B' && !s().pw }));
  add(mCol, button('Color', () => (s().mode = s().mode === 'color' ? 'B' : 'color'), { title: 'Doppler color (C)', active: () => s().mode === 'color' }));
  add(mCol, button('Power', () => (s().mode = s().mode === 'power' ? 'B' : 'power'), { title: 'Doppler de potencia', active: () => s().mode === 'power' }));
  add(mCol, button('PW', () => {
    s().pw = !s().pw;
    app.spectral.enabled = s().pw;
    if (s().pw && s().mode === 'B') s().mode = 'color';
  }, { title: 'Doppler pulsado (P)', active: () => s().pw }));
  gDop.body.appendChild(mCol);
  add(
    gDop.body,
    knob(
      'Escala',
      () => (s().pw ? app.spectral.scale : s().scale),
      (v) => {
        if (s().pw) app.spectral.scale = v;
        else s().scale = v;
      },
      { min: 10, max: 600, step: 5, def: 60, fmt: (v) => `±${v}`, title: 'Escala de velocidad / PRF (cm/s). Con PW activo ajusta la escala del espectro' },
    ),
  );
  add(gDop.body, knob('Gan. color', () => s().colorGain, (v) => (s().colorGain = v), { min: 0, max: 1, step: 0.02, def: 0.6, fmt: (v) => String(Math.round(v * 100)) }));
  add(gDop.body, knob('Filtro pared', () => s().wallFilter, (v) => (s().wallFilter = v), { min: 0, max: 30, step: 1, def: 4, fmt: (v) => `${v}` }));
  add(gDop.body, knob('Línea base', () => app.spectral.baseline, (v) => {
    app.spectral.baseline = v;
    s().baseline = (v - 0.5) * 2;
  }, { min: 0.1, max: 0.9, step: 0.05, def: 0.5, fmt: (v) => `${Math.round((v - 0.5) * 200)}%` }));
  const dCol = el('div', { class: 'ccol' });
  dCol.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  const steerB = add(dCol, button('Ángulo 0°', () => {
    const v = s().steer;
    s().steer = v === 0 ? 20 : v === 20 ? -20 : 0;
  }, { title: 'Angulación del haz Doppler (−20°, 0°, +20°)' }));
  const updSteer = steerB.update;
  steerB.update = () => {
    updSteer();
    steerB.el.textContent = `Ángulo ${s().steer > 0 ? '+' : ''}${s().steer}°`;
  };
  add(dCol, button('Invertir', () => {
    s().invert = !s().invert;
    app.spectral.invert = s().invert;
  }, { active: () => s().invert, title: 'Invertir los colores/espectro' }));
  add(dCol, field('VM', () => s().pwGate.size, (v) => (s().pwGate.size = v), { min: 0.5, max: 12, step: 0.5, fmt: (v) => `${v} mm`, title: 'Tamaño del volumen de muestra PW' }));
  add(dCol, field('Corr. áng.', () => app.spectral.angleCorr, (v) => (app.spectral.angleCorr = v), { min: 0, max: 80, step: 1, fmt: (v) => `${v}°`, title: 'Corrección de ángulo (debe alinearse con el eje del vaso; ≤ 60°)' }));
  const au = el('div', { class: 'crow' });
  add(au, button('Audio', async () => {
    if (app.audio.ctx?.state === 'running') app.audio.stop();
    else await app.audio.start();
  }, { active: () => app.audio.ctx?.state === 'running', title: 'Sonido Doppler (estéreo)' }));
  dCol.appendChild(au);
  gDop.body.appendChild(dCol);
  root.appendChild(gDop.root);

  // ---------------- Aguja ----------------
  const gNd = group('Aguja de punción');
  gNd.root.dataset.grp = 'needle';
  const nCol = el('div', { class: 'ccol' });
  nCol.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  const nr = el('div', { class: 'crow' });
  add(nr, button('Arterial', () => (app.activeNeedle = 0), { active: () => app.activeNeedle === 0, title: 'Aguja arterial (aletas rojas)' }));
  add(nr, button('Venosa', () => (app.activeNeedle = 1), { active: () => app.activeNeedle === 1, title: 'Aguja venosa (aletas azules)' }));
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
      'Calibre (FAV nueva: empezar con 17G)',
    ),
  );
  add(
    nr2,
    selectBox(
      [['25', '25 mm'], ['32', '32 mm']],
      () => String(app.needle.length) as '25',
      (v) => (app.needle.length = parseInt(v)),
      'Longitud de la aguja',
    ),
  ).el.classList.add('adv');
  nCol.appendChild(nr2);
  add(nCol, button('Asepsia', () => app.setAsepsis(!app.asepsis), { title: 'Preparación aséptica antes de puncionar: piel desinfectada, funda estéril en la sonda y gel estéril', active: () => app.asepsis }));
  nCol.appendChild(el('div', { class: 'mini' }, 'Colocar la aguja · abordaje'));
  add(nCol, button('Longitudinal · en plano', () => app.placeNeedleAuto('ip'), { title: 'Abordaje longitudinal (en plano), el preferido: la aguja entra por el extremo de la sonda y se ve entera (N con la sonda en longitudinal)' }));
  add(nCol, button('Transversal · fuera de plano', () => app.placeNeedleAuto('oop'), { title: 'Abordaje transversal (fuera de plano): la aguja entra en la línea media de la sonda; no se ve la entrada en la pared, hay que seguir la punta (N con la sonda en transversal)' }));
  add(nCol, button('Clic en la piel…', () => {
    app.placingNeedle = !app.placingNeedle;
    if (app.placingNeedle) app.toast('Haz clic sobre la piel en la vista 3D para elegir el punto de punción', 'info');
  }, { active: () => app.placingNeedle })).el.classList.add('adv');
  gNd.body.appendChild(nCol);
  const nCol2 = el('div', { class: 'ccol' });
  nCol2.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  add(nCol2, field('Ángulo', () => app.needle.angle, (v) => (app.needle.angle = v), { min: 5, max: 70, step: 1, fmt: (v) => `${v.toFixed(0)}°`, title: 'Ángulo de inserción respecto a la piel (FAV 20–35°, prótesis ≈45°)' }));
  add(nCol2, field('Rumbo', () => app.needle.heading, (v) => (app.needle.heading = v), { min: -180, max: 180, step: 1, fmt: (v) => `${v.toFixed(0)}°`, title: 'Dirección de la aguja sobre la piel' })).el.classList.add('adv');
  add(nCol2, field('Insertada', () => Math.max(0, app.needle.depth), (v) => {
    if (app.needle.placed && !app.needle.confirmed) app.needle.depth = v;
  }, { min: 0, max: 30, step: 0.1, fmt: (v) => `${v.toFixed(1)} mm` }));
  const adv = el('div', { class: 'crow' });
  adv.appendChild(hold('▲ Avanzar', 'arrowup', 'Avanzar la aguja (↑)'));
  adv.appendChild(hold('▼ Retirar', 'arrowdown', 'Retirar la aguja (↓)'));
  add(adv, button('⇄', () => {
    const n = app.needle;
    // invertir el rumbo sólo con la aguja fuera de la piel: dentro del tejido sería un barrido de 180°
    if (n.placed && n.depth > 0) {
      app.toast('Retira la aguja de la piel para invertir su dirección', 'warn');
      return;
    }
    n.heading = n.heading > 0 ? n.heading - 180 : n.heading + 180;
  }, { title: 'Invertir la dirección (anterógrada/retrógrada), con la aguja fuera de la piel' })).el.classList.add('adv');
  nCol2.appendChild(adv);
  const cf = el('div', { class: 'crow' });
  add(cf, button('Confirmar punción', () => app.confirmPuncture(), { cls: 'primary', title: 'Evaluar la posición final (Intro)' }));
  add(cf, button('Suero', () => app.flushNeedle(), { title: 'Lavar con 10 mL de suero para comprobar la posición de la punta (J): en la luz se ven microburbujas arrastradas por el flujo; fuera, infiltración' }));
  add(cf, button('Retirar aguja', () => app.withdrawNeedle(), { cls: 'danger' }));
  add(cf, button('Realce', () => (s().needleEnhance = !s().needleEnhance), { active: () => s().needleEnhance, title: 'Realce de aguja (angulación del haz hacia la aguja)' })).el.classList.add('adv');
  nCol2.appendChild(cf);
  gNd.body.appendChild(nCol2);
  root.appendChild(gNd.root);

  // ---------------- Sala ----------------
  const gRoom = group('Sala · paciente · pantalla');
  gRoom.root.dataset.grp = 'room';
  const cfg = () => app.scene.cfg;
  const apply = (rebuild = false) => app.scene.setRoomConfig(cfg(), rebuild);
  const rc1 = el('div', { class: 'ccol' });
  rc1.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  rc1.appendChild(el('div', { class: 'mini' }, 'Brazo del paciente'));
  // armYaw: 0° = brazo en cruz (lateral puro), 90° = hacia delante, junto al cuerpo
  add(rc1, field('Con el cuerpo', () => 90 - cfg().armYaw, (v) => {
    cfg().armYaw = 90 - v;
    apply(true);
  }, { min: 15, max: 90, step: 1, fmt: (v) => `${v}°`, title: 'Ángulo entre el brazo y el cuerpo del paciente: recomendado ≈ 45°, apoyado en una superficie firme y plana' }));
  add(rc1, field('Descenso', () => cfg().armPitch, (v) => {
    cfg().armPitch = v;
    apply(true);
  }, { min: 0, max: 35, step: 1, fmt: (v) => `${v}°` }));
  add(rc1, field('Rotación', () => cfg().armRoll, (v) => {
    cfg().armRoll = v;
    apply();
  }, { min: -60, max: 60, step: 1, fmt: (v) => `${v}°`, title: 'Supinación (0°) / pronación' }));
  add(rc1, selectBox(Object.keys(SKIN_TONES).map((k) => [k, `Fototipo ${k}`] as [string, string]), () => cfg().tone, (v) => {
    cfg().tone = v;
    apply(true);
  }, 'Tono de piel'));
  gRoom.body.appendChild(rc1);
  const rc2 = el('div', { class: 'ccol' });
  rc2.style.cssText = 'display:flex;flex-direction:column;gap:3px';
  rc2.appendChild(el('div', { class: 'mini' }, 'Monitor del ecógrafo'));
  add(rc2, field('Giro', () => cfg().cart.monitorYaw, (v) => {
    cfg().cart.monitorYaw = v;
    apply();
  }, { min: -1.6, max: 1.6, step: 0.02, fmt: (v) => `${Math.round((v * 180) / Math.PI)}°` }));
  add(rc2, field('Inclinación', () => cfg().cart.monitorPitch, (v) => {
    cfg().cart.monitorPitch = v;
    apply();
  }, { min: -0.6, max: 0.4, step: 0.02, fmt: (v) => `${Math.round((v * 180) / Math.PI)}°` }));
  add(rc2, field('Altura', () => cfg().cart.monitorHeight, (v) => {
    cfg().cart.monitorHeight = v;
    apply();
  }, { min: -0.25, max: 0.35, step: 0.01, fmt: (v) => `${Math.round(v * 100)} cm` }));
  gRoom.body.appendChild(rc2);
  const rc3 = el('div', { class: 'ccol' });
  rc3.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  rc3.appendChild(el('div', { class: 'mini' }, 'Operador'));
  add(rc3, button('Sentado', () => {
    cfg().operator.seated = !cfg().operator.seated;
    apply();
  }, { active: () => cfg().operator.seated }));
  add(rc3, button('Vista del operador', () => app.scene.setPreset('operador'), {}));
  add(rc3, button('Vista de sala', () => app.scene.setPreset('sala'), {}));
  add(rc3, button('Disposición recomendada', () => {
    placeDefaults(cfg());
    apply(true);
    app.toast('Operador, paciente y pantalla en la disposición recomendada (en línea)', 'ok');
  }, { cls: 'primary' }));
  rc3.appendChild(el('div', { class: 'mini' }, 'Arrastra el ecógrafo o al operador<br>por el suelo en la vista 3D'));
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
    lvlTitle.innerHTML = `<span>${basic ? 'Modo básico' : 'Modo avanzado'}</span>`;
    lvlBtn.el.textContent = basic ? 'Más controles ▸' : '◂ Menos controles';
    lvlBtn.el.title = basic
      ? 'Mostrar todos los controles: Doppler color y pulsado, foco, frecuencia, TGC, rumbo de la aguja…'
      : 'Volver al modo básico: solo los controles de la punción';
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
