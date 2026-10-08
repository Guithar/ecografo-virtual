/**
 * Paneles informativos (pestañas), ayuda e informe de sesión.
 */
import { TISSUES } from '../anatomy/tissues';
import type { App } from '../app/App';
import { LOCALE, tr } from '../i18n';
import { roleLabel, type NeedleEvent } from '../interaction/needle';
import { BUILD, SITE } from '../site';
import { procedureChecklist } from '../training/checklist';
import { LESSONS } from '../training/lessons';
import { grade } from '../training/metrics';

const LEVEL_ICON: Record<string, string> = { good: '✔', fair: '◐', bad: '✖', info: 'ℹ' };

export class Panels {
  currentTab = 'case';
  private log: NeedleEvent[] = [];

  constructor(private app: App) {}

  private q(id: string) {
    return document.getElementById(id)!;
  }

  showTab(tab: string) {
    this.currentTab = tab;
    document.querySelectorAll<HTMLButtonElement>('#tabButtons button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    for (const t of ['case', 'metrics', 'measures', 'ergo', 'lessons']) this.q(`tab-${t}`).classList.toggle('hidden', t !== tab);
    if (tab === 'metrics') this.renderMetrics();
    if (tab === 'measures') this.renderMeasures();
    if (tab === 'lessons') this.renderLessons();
    if (tab === 'ergo') this.renderErgo();
  }

  tick() {
    if (this.currentTab === 'metrics') this.renderMetricsLive();
    if (this.currentTab === 'ergo') this.renderErgo();
    if (this.currentTab === 'measures') this.renderMeasuresLive();
  }

  renderCase() {
    const c = this.app.caseDef;
    const exp = c.expected;
    this.q('tab-case').innerHTML = `
      <h3>${c.title}</h3>
      <p class="muted">${c.accessType} · ${tr(`dificultad ${['', 'básica', 'intermedia', 'avanzada'][c.difficulty]}`, `${['', 'basic', 'intermediate', 'advanced'][c.difficulty]} level`)}</p>
      <p>${c.description}</p>
      <div class="indication"><b>${tr('¿Por qué ecoguiada?', 'Why ultrasound guidance?')}</b> ${c.indication}</div>
      <div class="cols">
        <div><h4>${tr('Objetivos', 'Objectives')}</h4><ul>${c.objectives.map((o) => `<li>${o}</li>`).join('')}</ul></div>
        <div><h4>${tr('Consejos', 'Tips')}</h4><ul>${c.tips.map((o) => `<li>${o}</li>`).join('')}</ul></div>
      </div>
      <h4>${tr('Solución (hallazgos esperados)', 'Solution (expected findings)')}</h4>
      <details><summary class="muted">${tr('Mostrar tras explorar el caso', 'Show after exploring the case')}</summary>
        <ul>${c.findings.map((o) => `<li>${o}</li>`).join('')}</ul>
        ${exp ? `<div class="kv">${exp.diameter ? `<span>${tr('Diámetro', 'Diameter')}</span><span>≈ ${exp.diameter} mm</span>` : ''}${exp.depth ? `<span>${tr('Profundidad (pared anterior)', 'Depth (anterior wall)')}</span><span>≈ ${exp.depth} mm</span>` : ''}${exp.qa ? `<span>${tr('Qa (humeral)', 'Qa (brachial)')}</span><span>≈ ${exp.qa} mL/min</span>` : ''}${exp.mature !== undefined ? `<span>${tr('¿Madura?', 'Mature?')}</span><span>${exp.mature ? tr('Sí', 'Yes') : 'No'}</span>` : ''}${exp.note ? `<span>${tr('Nota', 'Note')}</span><span>${exp.note}</span>` : ''}</div>` : ''}
      </details>
      ${c.access ? `<h4>${tr('Acceso', 'Access')}</h4><div class="kv"><span>${tr('Zona recomendada', 'Recommended zone')}</span><span>${(c.access.zone[0] / 10).toFixed(0)}–${(c.access.zone[1] / 10).toFixed(0)} ${tr('cm desde la muñeca', 'cm from the wrist')}</span><span>${tr('Ángulo recomendado', 'Recommended angle')}</span><span>${c.access.angle}°</span>${c.access.anastomosisX !== undefined ? `<span>Anastomosis</span><span>${(c.access.anastomosisX / 10).toFixed(1)} cm</span>` : ''}${(c.access.avoid ?? []).map((a) => `<span>${tr('Evitar', 'Avoid')} ${(a.x0 / 10).toFixed(0)}–${(a.x1 / 10).toFixed(0)} cm</span><span>${a.reason}</span>`).join('')}</div>` : ''}
      <p class="muted" style="margin-top:10px">${tr('Herramienta educativa. No utilizar para decisiones clínicas.', 'Educational tool. Not for clinical decision-making.')}</p>`;
  }

  logEvent(e: NeedleEvent) {
    this.log.push(e);
    if (this.log.length > 200) this.log.shift();
    if (this.currentTab === 'metrics') this.renderMetrics();
  }

  renderMetrics() {
    const app = this.app;
    const n = app.needle;
    const snap = app.metrics.snapshot();
    const g = grade(snap.score);
    const checks = snap.checks;
    this.q('tab-metrics').innerHTML = `
      <div class="score"><div class="big" style="color:${g.color}" id="mScore">${snap.score}</div><div><b id="mGrade">${g.label}</b><br><span class="muted">${tr('Puntuación (100 = sin errores)', 'Score (100 = no errors)')}</span></div>
        <span class="grow"></span>
        <button id="mReset">${tr('Reiniciar intento', 'Reset attempt')}</button></div>
      <h4>${tr('Pasos de la punción', 'Cannulation steps')}</h4>
      <ul class="steps" id="mSteps"></ul>
      <div class="metric-grid" id="mGrid"></div>
      ${checks.length ? `<h4>${tr('Evaluación de la punción', 'Cannulation assessment')} (${roleLabel(n.role)})</h4><ul class="checklist">${checks
        .map((c) => `<li class="lv-${c.ok === null ? 'info' : c.ok ? 'good' : 'bad'}"><span class="ic">${c.ok === null ? 'ℹ' : c.ok ? '✔' : '✖'}</span><span>${c.label} <span class="muted">— ${c.detail}</span></span></li>`)
        .join('')}</ul>` : app.dt(tr('<p class="muted">Pulsa <b>{{Confirmar punción</b> (Intro)|Confirmar</b>}} cuando la aguja esté en posición para evaluarla según las guías.</p>', '<p class="muted">Press <b>{{Confirm cannulation</b> (Enter)|Confirm</b>}} when the needle is in position to have it assessed against the guidelines.</p>'))}
      <h4>${tr('Registro de eventos', 'Event log')}</h4>
      <div class="eventlog" id="mLog">${this.log
        .slice(-60)
        .map((e) => `<div class="${e.severity}">${e.t.toFixed(1).padStart(6)} s · ${e.msg}</div>`)
        .join('') || tr('<span class="muted">Sin eventos</span>', '<span class="muted">No events</span>')}</div>`;
    this.q('mReset').addEventListener('click', () => {
      app.metrics.reset();
      app.resetNeedles();
      this.log = [];
      this.renderMetrics();
    });
    this.renderMetricsLive();
    const lg = document.getElementById('mLog');
    if (lg) lg.scrollTop = lg.scrollHeight;
  }

  renderMetricsLive() {
    const grid = document.getElementById('mGrid');
    if (!grid) return;
    const steps = document.getElementById('mSteps');
    if (steps) {
      const items = procedureChecklist(this.app.checklistState());
      const next = items.findIndex((i) => !i.done);
      steps.innerHTML = items
        .map((it, k) => `<li class="${it.done ? 'done' : k === next ? 'next' : ''}" title="${it.how}"><span class="ic">${it.done ? '✔' : k + 1}</span><span><span class="lbl">${it.label}</span>${k === next ? ` <span class="how">· ${it.how}</span>` : ''}</span></li>`)
        .join('');
    }
    const s = this.app.metrics.snapshot();
    const m = (v: string, l: string, cls = '') => `<div class="metric ${cls}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
    grid.innerHTML = [
      m(`${s.elapsed.toFixed(0)} s`, tr('Tiempo total', 'Total time')),
      m(s.timeToFlash !== null ? `${s.timeToFlash.toFixed(1)} s` : '—', tr('Piel → reflujo', 'Skin → flashback')),
      m(String(s.skinPunctures), tr('Punciones cutáneas', 'Skin punctures'), s.skinPunctures > 1 ? 'warn' : ''),
      m(String(s.redirections), tr('Redirecciones', 'Redirections'), s.redirections > 2 ? 'warn' : ''),
      m(`${s.tipVisiblePct.toFixed(0)} %`, tr('Avance con punta visible', 'Advance with tip visible'), s.tipVisiblePct < 60 ? 'bad' : s.tipVisiblePct < 80 ? 'warn' : 'good'),
      m(String(s.shaftConfusions), tr('Cuerpo tomado por punta', 'Shaft mistaken for tip'), s.shaftConfusions ? 'warn' : ''),
      m(String(s.backWallContacts), tr('Contactos pared posterior', 'Back-wall contacts'), s.backWallContacts ? 'warn' : ''),
      m(String(s.transfixions), tr('Transfixiones', 'Transfixions'), s.transfixions ? 'bad' : ''),
      m(String(s.arterialPunctures), tr('Punciones arteriales', 'Arterial punctures'), s.arterialPunctures ? 'bad' : ''),
      m(String(s.nerveContacts), tr('Contactos nerviosos', 'Nerve contacts'), s.nerveContacts ? 'bad' : ''),
      m(`${s.flushes} / ${s.infiltrations}`, tr('Lavados con suero / infiltraciones', 'Saline flushes / infiltrations'), s.infiltrations ? 'bad' : ''),
      m(`${s.probeMoveDuringAdvance.toFixed(0)} mm`, tr('Movimiento de sonda al avanzar', 'Probe movement while advancing'), s.probeMoveDuringAdvance > 8 ? 'warn' : ''),
      m(`${this.app.metrics.pathInTissue.toFixed(0)} mm`, tr('Recorrido en tejido', 'Path in tissue')),
      m(`${Math.round(s.maxCollapse * 100)} %`, tr('Colapso máx. del vaso', 'Max. vessel collapse'), s.maxCollapse > 0.5 ? 'warn' : ''),
    ].join('');
    const sc = document.getElementById('mScore');
    if (sc) {
      const g = grade(s.score);
      sc.textContent = String(s.score);
      sc.style.color = g.color;
      const gl = document.getElementById('mGrade');
      if (gl) gl.textContent = g.label;
    }
  }

  renderMeasures() {
    const app = this.app;
    this.q('tab-measures').innerHTML = app.dt(`
      <div class="crow wrap" style="margin-bottom:6px">
        <button id="msCal" class="${app.monitor.tool === 'caliper' ? 'on' : ''}">${tr('{{Calibre (M)|Medir}}', '{{Caliper (M)|Measure}}')}</button>
        <button id="msClr">${tr('Borrar medidas', 'Clear measurements')}</button>
        <button id="msFreeze">${app.sim.settings.frozen ? tr('Descongelar', 'Unfreeze') : tr('Congelar', 'Freeze')}${tr('{{ (espacio)|}}', '{{ (Space)|}}')}</button>
      </div>
      <div id="msBody"></div>`);
    this.q('msCal').addEventListener('click', () => {
      app.monitor.tool = app.monitor.tool === 'caliper' ? 'none' : 'caliper';
      this.renderMeasures();
    });
    this.q('msClr').addEventListener('click', () => {
      app.monitor.clearCalipers();
      this.renderMeasures();
    });
    this.q('msFreeze').addEventListener('click', () => {
      app.sim.settings.frozen = !app.sim.settings.frozen;
      this.renderMeasures();
    });
    this.renderMeasuresLive();
  }

  renderMeasuresLive() {
    const body = document.getElementById('msBody');
    if (!body) return;
    const app = this.app;
    const cs = app.monitor.calipers.filter((c) => c.b);
    const rows = cs.map((c, i) => `<tr><td>${i + 1}</td><td>${c.label}</td><td class="muted">${Math.abs(c.b!.w - c.a.w) > Math.abs(c.b!.u - c.a.u) ? 'vertical' : 'horizontal'}</td></tr>`).join('');
    const m = app.spectral.measures();
    const d = app.lastDiameter();
    const qa = d && m.valid ? m.tamv * Math.PI * (d / 20) ** 2 * 60 : null;
    // regla de los 6 (con medidas del usuario)
    const vert = cs.map((c) => ({ c, dz: Math.abs(c.b!.w - c.a.w), top: Math.min(c.a.w, c.b!.w) }));
    const diam = vert.length ? vert[vert.length - 1].dz : null;
    const depth = vert.length > 1 ? vert[vert.length - 2] : null;
    const r6 = (ok: boolean | null, label: string, val: string) => `<li class="lv-${ok === null ? 'info' : ok ? 'good' : 'bad'}"><span class="ic">${ok === null ? '·' : ok ? '✔' : '✖'}</span><span>${label}: <b>${val}</b></span></li>`;
    body.innerHTML = app.dt(`
      <table class="tbl"><tr><th>#</th><th>${tr('Distancia', 'Distance')}</th><th>${tr('Orientación', 'Orientation')}</th></tr>${rows || tr('<tr><td colspan="3" class="muted">Sin medidas: activa {{el calibre y haz clic|<b>Medir</b> y toca}} en dos puntos de la imagen</td></tr>', '<tr><td colspan="3" class="muted">No measurements: {{turn on the caliper and click|turn on <b>Measure</b> and tap}} two points on the image</td></tr>')}</table>
      <h4>${tr('Doppler pulsado', 'Pulsed-wave Doppler')}</h4>
      ${m.valid ? `<div class="kv"><span>${tr('VPS', 'PSV')}</span><span>${m.psv.toFixed(0)} cm/s</span><span>${tr('VFD', 'EDV')}</span><span>${m.edv.toFixed(0)} cm/s</span><span>${tr('IR', 'RI')}</span><span>${m.ri.toFixed(2)}</span><span>${tr('IP', 'PI')}</span><span>${m.pi.toFixed(2)}</span><span>TAMV</span><span>${m.tamv.toFixed(0)} cm/s</span><span>${tr('Flujo (Q = TAMV·área·60)', 'Flow (Q = TAMV·area·60)')}</span><span>${qa !== null ? qa.toFixed(0) + ' mL/min' : tr('mide el diámetro', 'measure the diameter')}</span></div>` : tr('<p class="muted">Activa PW {{(tecla P)|}} y sitúa el volumen de muestra en un vaso.</p>', '<p class="muted">Turn on PW {{(P key)|}} and place the sample volume in a vessel.</p>')}
      <h4>${tr('Criterios de maduración (con tus medidas)', 'Maturation criteria (from your measurements)')}</h4>
      <ul class="checklist">
        ${r6(diam === null ? null : diam >= 6, tr('Diámetro (último calibre) ≥ 6 mm (KDOQI) / ≥ 4–5 mm (GEMAV)', 'Diameter (last caliper) ≥ 6 mm (KDOQI) / ≥ 4–5 mm (GEMAV)'), diam === null ? '—' : diam.toFixed(1) + ' mm')}
        ${r6(depth === null ? null : depth.dz < 6, tr('Profundidad (penúltimo calibre) < 6 mm', 'Depth (second-to-last caliper) < 6 mm'), depth === null ? '—' : depth.dz.toFixed(1) + ' mm')}
        ${r6(qa === null ? null : qa > 600, tr('Flujo > 600 mL/min (KDOQI) / > 500 (GEMAV)', 'Flow > 600 mL/min (KDOQI) / > 500 (GEMAV)'), qa === null ? '—' : qa.toFixed(0) + ' mL/min')}
      </ul>
      <p class="muted">${tr('Convención: mide primero la profundidad (piel → pared anterior) y después el diámetro (pared interna a pared interna). El flujo del acceso se mide en la arteria humeral.', 'Convention: measure the depth first (skin → anterior wall), then the diameter (inner wall to inner wall). Access flow is measured in the brachial artery.')}</p>`);
  }

  renderErgo() {
    const e = this.app.ergo;
    const el = this.q('tab-ergo');
    const cfg = this.app.scene.cfg;
    if (!e) {
      el.innerHTML = tr('<p class="muted">Calculando…</p>', '<p class="muted">Calculating…</p>');
      return;
    }
    const col = e.score >= 80 ? 'var(--ok)' : e.score >= 55 ? 'var(--warn)' : 'var(--bad)';
    el.innerHTML = `
      <div class="score"><div class="big" style="color:${col}">${e.score}</div><div><b>${tr('Ergonomía de la disposición', 'Layout ergonomics')}</b><br><span class="muted">${tr('Operador · paciente · pantalla', 'Operator · patient · screen')}</span></div></div>
      <ul class="checklist">${e.items.map((i) => `<li class="lv-${i.level}"><span class="ic">${LEVEL_ICON[i.level]}</span><span><b>${i.label}</b>: ${i.value}<br><span class="muted">${i.advice}</span></span></li>`).join('')}</ul>
      <h4>${tr('Cómo usar', 'How to use')}</h4>
      <p class="muted">${tr('En el modo <b>Sala y ergonomía</b> arrastra el <b>ecógrafo</b> o al <b>operador</b> por el suelo. Ajusta el brazo del paciente y la pantalla en la consola. Pulsa la vista <b>Operador</b> para ver la escena con sus ojos.', "In <b>Room &amp; ergonomics</b> mode, drag the <b>ultrasound machine</b> or the <b>operator</b> across the floor. Adjust the patient's arm and the screen in the console. Click the <b>Operator</b> view to see the scene through their eyes.")}</p>
      <p class="muted">${tr(`Brazo ${cfg.side === 'left' ? 'izquierdo' : 'derecho'} · operador ${cfg.operator.seated ? 'sentado' : 'de pie'}.`, `${cfg.side === 'left' ? 'Left' : 'Right'} arm · operator ${cfg.operator.seated ? 'seated' : 'standing'}.`)}</p>`;
  }

  renderLessons() {
    const app = this.app;
    const el = this.q('tab-lessons');
    const L = app.lesson;
    if (!L) {
      el.innerHTML = `<h3>${tr('Lecciones guiadas', 'Guided lessons')}</h3><p class="muted">${tr('Cada lección carga su caso y comprueba automáticamente cada paso.', 'Each lesson loads its case and checks every step automatically.')}</p>
        <div class="lesson-list">${LESSONS.map((l) => `<button data-lesson="${l.id}"><b>${l.title}</b><br><span class="muted">${l.summary}</span></button>`).join('')}</div>`;
      el.querySelectorAll<HTMLButtonElement>('[data-lesson]').forEach((b) => b.addEventListener('click', () => app.startLesson(b.dataset.lesson!)));
      return;
    }
    const step = L.lesson.steps[L.step];
    const pct = (100 * L.done.filter(Boolean).length) / L.lesson.steps.length;
    el.innerHTML = `
      <div class="crow"><h3 style="flex:1">${L.lesson.title}</h3><button id="lsExit">${tr('Salir', 'Exit')}</button></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="muted">${tr(`Paso ${L.step + 1} de ${L.lesson.steps.length}`, `Step ${L.step + 1} of ${L.lesson.steps.length}`)}</div>
      <div class="lesson-step ${L.done[L.step] ? 'done' : ''}">${app.dt(step.text)}${step.hint ? `<div class="muted" style="margin-top:6px">${app.dt(step.hint)}</div>` : ''}${step.check ? `<div class="mini" style="margin-top:6px">${L.done[L.step] ? tr('✔ completado', '✔ completed') : tr('⏳ se comprueba automáticamente', '⏳ checked automatically')}</div>` : ''}</div>
      <div class="crow"><button id="lsPrev" ${L.step === 0 ? 'disabled' : ''}>${tr('◀ Anterior', '◀ Previous')}</button><button id="lsNext" class="primary">${L.step === L.lesson.steps.length - 1 ? tr('Finalizar', 'Finish') : tr('Siguiente ▶', 'Next ▶')}</button></div>`;
    this.q('lsExit').addEventListener('click', () => {
      app.lesson = null;
      this.renderLessons();
    });
    this.q('lsPrev').addEventListener('click', () => {
      L.step = Math.max(0, L.step - 1);
      this.renderLessons();
    });
    this.q('lsNext').addEventListener('click', () => {
      if (L.step >= L.lesson.steps.length - 1) {
        app.toast(tr('Lección finalizada', 'Lesson complete'), 'ok');
        app.lesson = null;
      } else L.step++;
      this.renderLessons();
    });
  }

  renderLegend() {
    const shown = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16];
    this.q('anatLegend').innerHTML = shown.map((i) => `<span><i style="background:${TISSUES[i].color}"></i>${TISSUES[i].name}</span>`).join('');
  }

  // ---------------------------------------------------------------------------------------
  // Modales
  // ---------------------------------------------------------------------------------------
  openModal(html: string) {
    this.q('modalBody').innerHTML = html;
    this.q('modal').classList.remove('hidden');
  }

  closeModal() {
    this.q('modal').classList.add('hidden');
  }

  /** Bienvenida para la primera visita. */
  showWelcome(force = false) {
    let seen = false;
    try {
      seen = localStorage.getItem('ecofav-bienvenida') === '1';
    } catch {
      /* sin almacenamiento */
    }
    if (seen && !force) return;
    if (this.app.touchUI) this.openModal(WELCOME_TOUCH);
    else
      this.openModal(tr(`
      <h2>Fistu<span class="accent">lab</span></h2>
      <p>Simulador de <b>punción ecoguiada de la fístula arteriovenosa (FAV) para hemodiálisis</b>, nativa y protésica, para practicar sin equipo físico. La imagen ecográfica se calcula en tiempo real a partir de la anatomía que ves en 3D.</p>
      <div class="cols">
        <div>
          <h4>La pantalla</h4>
          <ul>
            <li><b>Arriba a la izquierda</b>: la realidad física. Brazo, anatomía interna, sonda y plano de corte (azul).</li>
            <li><b>Arriba a la derecha</b>: el monitor del ecógrafo.</li>
            <li><b>Abajo a la derecha</b>: la anatomía real del plano que exploras.</li>
            <li><b>Abajo</b>: la consola (sonda, aguja, imagen y Doppler) y las pestañas de caso, métricas y lecciones.</li>
          </ul>
        </div>
        <div>
          <h4>Primeros pasos</h4>
          <ol>
            <li>Arrastra la <b>sonda</b> sobre la piel o usa <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>. Gira con <kbd>Q</kbd>/<kbd>E</kbd> y presiona con <kbd>X</kbd>.</li>
            <li>Pulsa <kbd>1</kbd> para localizar la vena en transversal y <kbd>2</kbd> para verla en longitudinal.</li>
            <li>En el modo <b>Punción</b>, sigue la lista de <b>pasos</b>: se marca sola. Coloca la aguja con <kbd>N</kbd> (en plano si la sonda está en longitudinal, el abordaje preferido), avanza con <kbd>↑</kbd> viendo la punta y confirma con <kbd>Intro</kbd>.</li>
            <li>En <b>Aprendizaje</b> tienes 8 lecciones guiadas que se corrigen solas.</li>
          </ol>
          <p class="muted">Empiezas en <b>modo básico</b>, con los controles de la punción. El botón <b>Más controles</b>, a la derecha de la consola, muestra todos (Doppler, PW, ajustes de imagen).</p>
        </div>
      </div>
      <p class="muted">Herramienta educativa: no sustituye la formación práctica supervisada. Pulsa <kbd>H</kbd> para ver todos los atajos.</p>
      <div class="crow" style="margin-top:12px"><button class="primary" id="wlStart">Empezar</button><button id="wlLesson">Ir a la lección 1</button></div>
      <p class="site-foot">${SITE.name} es gratuito, sin publicidad y de código abierto · <a href="${SITE.url}" target="_blank" rel="noopener">${SITE.host}</a> · <a class="kofi-link" href="${SITE.kofi}" target="_blank" rel="noopener">Apóyalo en Ko-fi</a></p>`, `
      <h2>Fistu<span class="accent">lab</span></h2>
      <p>A simulator for <b>ultrasound-guided cannulation of the arteriovenous fistula (AVF) for hemodialysis</b>, native AVFs and grafts, to practice without physical equipment. The ultrasound image is computed in real time from the anatomy you see in 3D.</p>
      <div class="cols">
        <div>
          <h4>The screen</h4>
          <ul>
            <li><b>Top left</b>: the physical reality. Arm, internal anatomy, probe and scan plane (blue).</li>
            <li><b>Top right</b>: the ultrasound monitor.</li>
            <li><b>Bottom right</b>: the true anatomy of the plane you are scanning.</li>
            <li><b>Bottom</b>: the console (probe, needle, image and Doppler) and the case, metrics and lessons tabs.</li>
          </ul>
        </div>
        <div>
          <h4>First steps</h4>
          <ol>
            <li>Drag the <b>probe</b> over the skin or use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>. Rotate with <kbd>Q</kbd>/<kbd>E</kbd> and apply pressure with <kbd>X</kbd>.</li>
            <li>Press <kbd>1</kbd> to find the vein in short axis and <kbd>2</kbd> to view it in long axis.</li>
            <li>In <b>Cannulation</b> mode, follow the list of <b>steps</b>: it checks itself off. Place the needle with <kbd>N</kbd> (in-plane if the probe is in long axis, the preferred approach), advance with <kbd>↑</kbd> while watching the tip, and confirm with <kbd>Enter</kbd>.</li>
            <li>In <b>Learn</b> you will find 8 guided lessons that are checked automatically.</li>
          </ol>
          <p class="muted">You start in <b>basic mode</b>, with the cannulation controls. The <b>More controls</b> button, on the right of the console, shows them all (Doppler, PW, image settings).</p>
        </div>
      </div>
      <p class="muted">Educational tool: it does not replace supervised hands-on training. Press <kbd>H</kbd> to see all keyboard shortcuts.</p>
      <div class="crow" style="margin-top:12px"><button class="primary" id="wlStart">Start</button><button id="wlLesson">Go to lesson 1</button></div>
      <p class="site-foot">${SITE.name} is free, ad-free and open source · <a href="${SITE.url}" target="_blank" rel="noopener">${SITE.host}</a> · <a class="kofi-link" href="${SITE.kofi}" target="_blank" rel="noopener">Support it on Ko-fi</a></p>`));
    const done = () => {
      try {
        localStorage.setItem('ecofav-bienvenida', '1');
      } catch {
        /* */
      }
      this.closeModal();
    };
    this.q('wlStart').addEventListener('click', done);
    this.q('wlLesson').addEventListener('click', () => {
      done();
      this.app.setMode('learn');
      this.app.startLesson('orientacion');
    });
  }

  showHelp() {
    if (this.app.touchUI) {
      this.openModal(HELP_TOUCH + this.aboutHtml());
      return;
    }
    this.openModal(tr(`
      <h2>Ayuda de Fistu<span class="accent">lab</span></h2>
      <p>Simulador de <b>punción ecoguiada de la fístula arteriovenosa (FAV) para hemodiálisis</b>, nativa y protésica. A la izquierda ves la <b>realidad física</b> (brazo, anatomía interna, sonda, aguja y plano de corte); a la derecha, la <b>pantalla del ecógrafo</b> y la <b>anatomía real</b> del plano que estás explorando.</p>
      <div class="cols">
        <div>
          <h4>Sonda (maniobras PART)</h4>
          <table class="tbl">
            <tr><td><kbd>W</kbd>/<kbd>S</kbd></td><td>Deslizar a lo largo del brazo (proximal/distal)</td></tr>
            <tr><td><kbd>A</kbd>/<kbd>D</kbd></td><td>Deslizar alrededor del brazo</td></tr>
            <tr><td><kbd>Q</kbd>/<kbd>E</kbd></td><td>Rotación</td></tr>
            <tr><td><kbd>R</kbd>/<kbd>F</kbd></td><td>Inclinación (basculación / abanico)</td></tr>
            <tr><td><kbd>T</kbd>/<kbd>G</kbd></td><td>Balanceo (talón-punta)</td></tr>
            <tr><td><kbd>X</kbd>/<kbd>Z</kbd></td><td>Más / menos presión</td></tr>
            <tr><td><kbd>1</kbd>/<kbd>2</kbd></td><td>Transversal / longitudinal respecto al vaso</td></tr>
            <tr><td><kbd>Mayús</kbd></td><td>Movimiento fino</td></tr>
            <tr><td>Ratón</td><td>Arrastra la sonda sobre la piel en la vista 3D</td></tr>
          </table>
          <h4>Aguja (modo Punción)</h4>
          <table class="tbl">
            <tr><td><kbd>N</kbd></td><td>Colocar la aguja junto a la sonda (pasa al modo Punción): con la sonda en longitudinal, abordaje longitudinal (en plano, el preferido); en transversal, abordaje transversal (fuera de plano)</td></tr>
            <tr><td>Botón <b>Asepsia</b></td><td>Piel desinfectada, funda y gel estériles antes de puncionar</td></tr>
            <tr><td><kbd>↑</kbd>/<kbd>↓</kbd> o rueda sobre la imagen</td><td>Avanzar / retirar</td></tr>
            <tr><td><kbd>J</kbd></td><td>Lavar con suero: en la luz se ven microburbujas arrastradas por el flujo (y un chorro en Doppler color); fuera, infiltración</td></tr>
            <tr><td><kbd>←</kbd>/<kbd>→</kbd></td><td>Rumbo (dirección)</td></tr>
            <tr><td><kbd>RePág</kbd>/<kbd>AvPág</kbd></td><td>Ángulo de inserción</td></tr>
            <tr><td><kbd>Intro</kbd></td><td>Confirmar la punción (evaluación)</td></tr>
            <tr><td><kbd>K</kbd></td><td>Compresor on/off</td></tr>
          </table>
        </div>
        <div>
          <h4>Ecógrafo</h4>
          <table class="tbl">
            <tr><td><kbd>+</kbd>/<kbd>−</kbd></td><td>Profundidad</td></tr>
            <tr><td><kbd>[</kbd>/<kbd>]</kbd></td><td>Ganancia</td></tr>
            <tr><td><kbd>C</kbd> · <kbd>P</kbd> · <kbd>B</kbd></td><td>Doppler color · Doppler pulsado · Modo B</td></tr>
            <tr><td><kbd>Espacio</kbd></td><td>Congelar</td></tr>
            <tr><td><kbd>M</kbd></td><td>Calibre (medir)</td></tr>
            <tr><td><kbd>L</kbd></td><td>Etiquetas anatómicas</td></tr>
            <tr><td><kbd>I</kbd></td><td>Invertir izquierda/derecha</td></tr>
            <tr><td>Clic/arrastre en la imagen</td><td>Mover la caja de color / el volumen de muestra</td></tr>
            <tr><td><kbd>Mayús</kbd>+rueda</td><td>Tamaño del volumen de muestra</td></tr>
            <tr><td><kbd>Alt</kbd>+rueda</td><td>Tamaño de la caja de color</td></tr>
          </table>
          <h4>Vistas</h4>
          <table class="tbl"><tr><td><kbd>V</kbd></td><td>Alternar vistas de cámara</td></tr><tr><td><kbd>O</kbd></td><td>Modo enfoque: monitor grande y 3D en una ventana flotante (⠿ la mueve de esquina, ◱ cambia su tamaño, ⇄ intercambia, – la oculta)</td></tr><tr><td><kbd>H</kbd></td><td>Esta ayuda</td></tr></table>
          <h4>Modos</h4>
          <ul>
            <li><b>Exploración</b>: libre, con ayudas visuales y etiquetas.</li>
            <li><b>Punción</b>: agujas arterial y venosa, métricas y evaluación.</li>
            <li><b>Sala y ergonomía</b>: coloca paciente, operador y pantalla.</li>
            <li><b>Aprendizaje</b>: lecciones guiadas paso a paso.</li>
          </ul>
          <p class="muted"><b>Modo básico / avanzado</b>: el botón <b>Más controles</b> / <b>Menos controles</b>, a la derecha de la consola, muestra u oculta el Doppler, el PW y los ajustes finos de imagen. Los atajos de teclado funcionan en los dos modos.</p>
        </div>
      </div>
      <p class="muted">En el móvil y en pantallas pequeñas se abre una versión táctil; puedes forzarla con <a href="?movil=1">?movil=1</a> o volver a esta con <code>?movil=0</code>.</p>
      <p class="muted">Los <a href="${SITE.docs}FUNDAMENTOS.md" target="_blank" rel="noopener">fundamentos médicos y físicos</a>, con referencias, siguen <i>Punción ecoguiada del acceso vascular para hemodiálisis</i> (Moyano Franco, Salgueira Lazo, Roca-Tey; <i>Nefrología al día</i>), GEMAV 2017, KDOQI 2019 y ESVS 2018. Para docentes hay una <a href="${SITE.docs}GUIA_DOCENTE.md" target="_blank" rel="noopener">guía con itinerario y rúbrica</a>.</p>
      ${this.aboutHtml()}`, `
      <h2>Fistu<span class="accent">lab</span> help</h2>
      <p>A simulator for <b>ultrasound-guided cannulation of the arteriovenous fistula (AVF) for hemodialysis</b>, native AVFs and grafts. On the left you see the <b>physical reality</b> (arm, internal anatomy, probe, needle and scan plane); on the right, the <b>ultrasound screen</b> and the <b>true anatomy</b> of the plane you are scanning.</p>
      <div class="cols">
        <div>
          <h4>Probe (PART maneuvers)</h4>
          <table class="tbl">
            <tr><td><kbd>W</kbd>/<kbd>S</kbd></td><td>Slide along the arm (proximal/distal)</td></tr>
            <tr><td><kbd>A</kbd>/<kbd>D</kbd></td><td>Slide around the arm</td></tr>
            <tr><td><kbd>Q</kbd>/<kbd>E</kbd></td><td>Rotation</td></tr>
            <tr><td><kbd>R</kbd>/<kbd>F</kbd></td><td>Tilt (fanning)</td></tr>
            <tr><td><kbd>T</kbd>/<kbd>G</kbd></td><td>Rock (heel-toe)</td></tr>
            <tr><td><kbd>X</kbd>/<kbd>Z</kbd></td><td>More / less pressure</td></tr>
            <tr><td><kbd>1</kbd>/<kbd>2</kbd></td><td>Short / long axis to the vessel</td></tr>
            <tr><td><kbd>Shift</kbd></td><td>Fine movement</td></tr>
            <tr><td>Mouse</td><td>Drag the probe over the skin in the 3D view</td></tr>
          </table>
          <h4>Needle (Cannulation mode)</h4>
          <table class="tbl">
            <tr><td><kbd>N</kbd></td><td>Place the needle next to the probe (switches to Cannulation mode): with the probe in long axis, long-axis approach (in-plane, the preferred one); in short axis, short-axis approach (out-of-plane)</td></tr>
            <tr><td><b>Asepsis</b> button</td><td>Disinfected skin, sterile probe cover and gel before cannulation</td></tr>
            <tr><td><kbd>↑</kbd>/<kbd>↓</kbd> or wheel over the image</td><td>Advance / withdraw</td></tr>
            <tr><td><kbd>J</kbd></td><td>Saline flush: in the lumen, microbubbles are swept along by the flow (and a jet on color Doppler); outside it, infiltration</td></tr>
            <tr><td><kbd>←</kbd>/<kbd>→</kbd></td><td>Heading (direction)</td></tr>
            <tr><td><kbd>PgUp</kbd>/<kbd>PgDn</kbd></td><td>Insertion angle</td></tr>
            <tr><td><kbd>Enter</kbd></td><td>Confirm cannulation (assessment)</td></tr>
            <tr><td><kbd>K</kbd></td><td>Tourniquet on/off</td></tr>
          </table>
        </div>
        <div>
          <h4>Ultrasound machine</h4>
          <table class="tbl">
            <tr><td><kbd>+</kbd>/<kbd>−</kbd></td><td>Depth</td></tr>
            <tr><td><kbd>[</kbd>/<kbd>]</kbd></td><td>Gain</td></tr>
            <tr><td><kbd>C</kbd> · <kbd>P</kbd> · <kbd>B</kbd></td><td>Color Doppler · Pulsed-wave Doppler · B-mode</td></tr>
            <tr><td><kbd>Space</kbd></td><td>Freeze</td></tr>
            <tr><td><kbd>M</kbd></td><td>Caliper (measure)</td></tr>
            <tr><td><kbd>L</kbd></td><td>Anatomical labels</td></tr>
            <tr><td><kbd>I</kbd></td><td>Flip left/right</td></tr>
            <tr><td>Click/drag on the image</td><td>Move the color box / sample volume</td></tr>
            <tr><td><kbd>Shift</kbd>+wheel</td><td>Sample volume size</td></tr>
            <tr><td><kbd>Alt</kbd>+wheel</td><td>Color box size</td></tr>
          </table>
          <h4>Views</h4>
          <table class="tbl"><tr><td><kbd>V</kbd></td><td>Cycle camera views</td></tr><tr><td><kbd>O</kbd></td><td>Focus mode: large monitor and 3D in a floating window (⠿ moves it to another corner, ◱ resizes it, ⇄ swaps, – hides it)</td></tr><tr><td><kbd>H</kbd></td><td>This help</td></tr></table>
          <h4>Modes</h4>
          <ul>
            <li><b>Explore</b>: free scanning, with visual aids and labels.</li>
            <li><b>Cannulation</b>: arterial and venous needles, metrics and assessment.</li>
            <li><b>Room &amp; ergonomics</b>: position the patient, operator and screen.</li>
            <li><b>Learn</b>: step-by-step guided lessons.</li>
          </ul>
          <p class="muted"><b>Basic / advanced mode</b>: the <b>More controls</b> / <b>Fewer controls</b> button, on the right of the console, shows or hides Doppler, PW and the fine image settings. Keyboard shortcuts work in both modes.</p>
        </div>
      </div>
      <p class="muted">On phones and small screens a touch version opens; you can force it with <a href="?movil=1">?movil=1</a> or return to this one with <code>?movil=0</code>.</p>
      <p class="muted">The <a href="${SITE.docs}en/FUNDAMENTALS.md" target="_blank" rel="noopener">medical and physical fundamentals</a>, with references, follow <i>Punción ecoguiada del acceso vascular para hemodiálisis</i> (Moyano Franco, Salgueira Lazo, Roca-Tey; <i>Nefrología al día</i>, in Spanish), GEMAV 2017, KDOQI 2019 and ESVS 2018. For teachers there is a <a href="${SITE.docs}en/TEACHING_GUIDE.md" target="_blank" rel="noopener">guide with a learning pathway and a rubric</a>.</p>
      ${this.aboutHtml()}`));
  }

  /** Acerca de: versión, código, privacidad, aviso y apoyo. */
  private aboutHtml() {
    const link = (href: string, text: string, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${href}" target="_blank" rel="noopener">${text}</a>`;
    const commit = BUILD.commit ? ` · ${link(`${SITE.repo}/commit/${BUILD.commit}`, BUILD.commit)}` : '';
    return tr(`
      <h4>Acerca de ${SITE.name}</h4>
      <div class="about">
        <p><b>${SITE.name}</b> · versión ${BUILD.version} · ${BUILD.date}${commit} · ${link(SITE.url, SITE.host)}<br>
          Código abierto con licencia MIT en ${link(SITE.repo, 'GitHub')}. Contacto: <a href="mailto:${SITE.email}">${SITE.email}</a>. Sugerencias, casos nuevos y errores: ${link(`${SITE.repo}/issues`, 'GitHub Issues')}.</p>
        <p><b>Privacidad.</b> Sin cookies, sin analítica y sin publicidad. Todo se calcula en tu navegador y no se envía nada a ningún servidor. El historial y las preferencias se guardan solo en este navegador (el historial se borra desde el Informe). El alojamiento, GitHub Pages, puede registrar la dirección IP de las visitas por seguridad.</p>
        <p><b>Aviso.</b> Herramienta educativa. No es un producto sanitario, no sirve para diagnosticar ni para decidir tratamientos y no sustituye la formación práctica supervisada. Las cifras (diámetros, flujos, velocidades) son valores didácticos.</p>
        <p><b>Apoya el proyecto.</b> ${SITE.name} es gratuito. Si te resulta útil, puedes apoyarlo con un café en ${link(SITE.kofi, 'Ko-fi', 'kofi-link')}: ayuda a mantenerlo y a añadir casos y lecciones.</p>
      </div>`, `
      <h4>About ${SITE.name}</h4>
      <div class="about">
        <p><b>${SITE.name}</b> · version ${BUILD.version} · ${BUILD.date}${commit} · ${link(SITE.url, SITE.host)}<br>
          Open source under the MIT license on ${link(SITE.repo, 'GitHub')}. Contact: <a href="mailto:${SITE.email}">${SITE.email}</a>. Suggestions, new cases and bug reports: ${link(`${SITE.repo}/issues`, 'GitHub Issues')}.</p>
        <p><b>Privacy.</b> No cookies, no analytics and no ads. Everything is computed in your browser and nothing is sent to any server. Your history and preferences are stored only in this browser (the history can be cleared from the Report). The host, GitHub Pages, may log visitors' IP addresses for security purposes.</p>
        <p><b>Disclaimer.</b> Educational tool. It is not a medical device, it must not be used for diagnosis or treatment decisions, and it does not replace supervised hands-on training. The figures (diameters, flow rates, velocities) are teaching values.</p>
        <p><b>Support the project.</b> ${SITE.name} is free. If you find it useful, you can support it with a coffee on ${link(SITE.kofi, 'Ko-fi', 'kofi-link')}: it helps keep it running and add new cases and lessons.</p>
      </div>`);
  }

  showReport() {
    const app = this.app;
    const s = app.metrics.snapshot();
    const g = grade(s.score);
    const hist = app.history.slice(-15).reverse();
    this.openModal(`
      <h2>${tr('Informe de la sesión', 'Session report')} <span class="muted report-brand">· ${SITE.name}</span></h2>
      <p><b>${tr('Caso:', 'Case:')}</b> ${app.caseDef.title}<br><b>${tr('Fecha:', 'Date:')}</b> ${new Date().toLocaleString(LOCALE)}</p>
      <h4>${tr('Punción actual', 'Current cannulation')}</h4>
      ${s.skinPunctures === 0 ? tr('<p class="muted">Todavía no hay ninguna punción: en el modo <b>Punción</b>, coloca la aguja con <kbd>N</kbd> y avanza con <kbd>↑</kbd>.</p>', '<p class="muted">No cannulation yet: in <b>Cannulation</b> mode, place the needle with <kbd>N</kbd> and advance with <kbd>↑</kbd>.</p>') : `<p>${tr('Puntuación:', 'Score:')} <b style="color:${g.color}">${s.score}/100 (${g.label})</b></p>
      <table class="tbl">
        <tr><td>${tr('Tiempo total', 'Total time')}</td><td>${s.elapsed.toFixed(0)} s</td><td>${tr('Piel → reflujo', 'Skin → flashback')}</td><td>${s.timeToFlash !== null ? s.timeToFlash.toFixed(1) + ' s' : '—'}</td></tr>
        <tr><td>${tr('Punciones cutáneas', 'Skin punctures')}</td><td>${s.skinPunctures}</td><td>${tr('Redirecciones', 'Redirections')}</td><td>${s.redirections}</td></tr>
        <tr><td>${tr('Avance con punta visible', 'Advance with tip visible')}</td><td>${s.tipVisiblePct.toFixed(0)} %</td><td>${tr('Cuerpo tomado por punta', 'Shaft mistaken for tip')}</td><td>${s.shaftConfusions}</td></tr>
        <tr><td>${tr('Contactos pared posterior', 'Back-wall contacts')}</td><td>${s.backWallContacts}</td><td>${tr('Transfixiones', 'Transfixions')}</td><td>${s.transfixions}</td></tr>
        <tr><td>${tr('Punciones arteriales', 'Arterial punctures')}</td><td>${s.arterialPunctures}</td><td>${tr('Contactos nerviosos', 'Nerve contacts')}</td><td>${s.nerveContacts}</td></tr>
        <tr><td>${tr('Lavados con suero', 'Saline flushes')}</td><td>${s.flushes}</td><td>${tr('Infiltraciones', 'Infiltrations')}</td><td>${s.infiltrations}</td></tr>
        <tr><td>${tr('Movimiento de sonda al avanzar', 'Probe movement while advancing')}</td><td>${s.probeMoveDuringAdvance.toFixed(0)} mm</td><td>${tr('Colapso máx. del vaso', 'Max. vessel collapse')}</td><td>${Math.round(s.maxCollapse * 100)} %</td></tr>
      </table>`}
      ${s.checks.length ? `<h4>${tr('Criterios', 'Criteria')}</h4><ul>${s.checks.map((c) => `<li>${c.ok === null ? 'ℹ' : c.ok ? '✔' : '✖'} ${c.label} — ${c.detail}</li>`).join('')}</ul>` : ''}
      <h4>${tr('Historial (este navegador)', 'History (this browser)')}</h4>
      ${hist.length ? `<table class="tbl"><tr>${tr('<th>Fecha</th><th>Caso</th><th>Abordaje</th><th>Aguja</th><th>Puntuación</th>', '<th>Date</th><th>Case</th><th>Approach</th><th>Needle</th><th>Score</th>')}</tr>${hist.map((h) => `<tr><td>${new Date(h.date).toLocaleString(LOCALE)}</td><td>${h.caseTitle}</td><td>${h.approach}</td><td>${h.needle}</td><td>${h.score}</td></tr>`).join('')}</table>` : tr('<p class="muted">Sin punciones evaluadas todavía.</p>', '<p class="muted">No assessed cannulations yet.</p>')}
      <div class="crow no-print" style="margin-top:14px">${embedded ? '' : tr('<button class="primary" id="rpPrint">Imprimir / PDF</button><button id="rpJson">Exportar JSON</button><button id="rpCsv">Exportar CSV</button>', '<button class="primary" id="rpPrint">Print / PDF</button><button id="rpJson">Export JSON</button><button id="rpCsv">Export CSV</button>')}${tr('<button id="rpCopyJson">Copiar JSON</button><button id="rpCopyCsv">Copiar CSV</button><button class="danger" id="rpClear">Borrar historial</button>', '<button id="rpCopyJson">Copy JSON</button><button id="rpCopyCsv">Copy CSV</button><button class="danger" id="rpClear">Clear history</button>')}</div>
      <textarea id="rpText" class="hidden" readonly rows="6" style="width:100%;margin-top:8px;background:#0d141a;color:#cfe;border:1px solid #243240;font:11px var(--mono)"></textarea>
      <p class="site-foot">${tr(`Generado con ${SITE.name} ${BUILD.version} · ${SITE.host} · herramienta educativa`, `Generated with ${SITE.name} ${BUILD.version} · ${SITE.host} · educational tool`)}</p>`);
    const json = () => JSON.stringify({ app: { nombre: SITE.name, version: BUILD.version, url: SITE.url }, caso: app.caseDef.id, metricas: s, eventos: app.metrics.log, historial: app.history }, null, 2);
    const csv = () => ['fecha;caso;abordaje;aguja;puntuacion'].concat(app.history.map((h) => `${h.date};${h.caseId};${h.approach};${h.needle};${h.score}`)).join('\n');
    if (!embedded) {
      this.q('rpPrint').addEventListener('click', () => window.print());
      this.q('rpJson').addEventListener('click', () => download(tr('sesion-fistulab.json', 'fistulab-session.json'), json(), 'application/json'));
      this.q('rpCsv').addEventListener('click', () => download(tr('historial-fistulab.csv', 'fistulab-history.csv'), csv(), 'text/csv'));
    }
    const copy = (txt: string) => {
      const ta = this.q('rpText') as HTMLTextAreaElement;
      navigator.clipboard
        .writeText(txt)
        .then(() => app.toast(tr('Copiado al portapapeles', 'Copied to clipboard'), 'ok'))
        .catch(() => {
          ta.classList.remove('hidden');
          ta.value = txt;
          ta.select();
          app.toast(tr('Selecciona y copia el texto (Ctrl+C)', 'Select and copy the text (Ctrl+C)'), 'info');
        });
    };
    this.q('rpCopyJson').addEventListener('click', () => copy(json()));
    this.q('rpCopyCsv').addEventListener('click', () => copy(csv()));
    this.q('rpClear').addEventListener('click', () => {
      app.history = [];
      try {
        localStorage.removeItem('ecofav-historial');
      } catch {
        /* */
      }
      this.showReport();
    });
  }
}

const WELCOME_TOUCH = tr(`
  <h2>Fistu<span class="accent">lab</span></h2>
  <p>Simulador de <b>punción ecoguiada de la fístula arteriovenosa (FAV) para hemodiálisis</b>. La imagen ecográfica se calcula en tiempo real a partir de la anatomía del brazo en 3D.</p>
  <h4>La pantalla</h4>
  <ul>
    <li>Arriba, el <b>monitor del ecógrafo</b>. En la esquina, el <b>brazo en 3D</b>: <b>⇄</b> intercambia las dos vistas y <b>–</b> oculta el 3D.</li>
    <li>Abajo, la <b>rueda de ajuste</b>: elige una maniobra (A lo largo, Girar, Inclinar, Presión…) y arrástrala con el pulgar.</li>
  </ul>
  <h4>Primeros pasos</h4>
  <ol>
    <li><b>Toca el brazo</b> en 3D para llevar la sonda a ese punto. Con <b>dos dedos</b> giras y acercas la cámara.</li>
    <li><b>Transv.</b> y <b>Long.</b> orientan la sonda respecto al vaso; <b>Centrar</b> la lleva sobre él.</li>
    <li>En <b>Punción</b>, coloca la aguja con <b>Fuera de plano</b> o <b>En plano</b>, avanza con la rueda y pulsa <b>Confirmar</b>.</li>
    <li>En <b>Lecciones</b> tienes 8 lecciones guiadas que se corrigen solas.</li>
  </ol>
  <p class="muted">Añade la página a la pantalla de inicio para usarla a pantalla completa. Herramienta educativa: no sustituye la formación práctica supervisada.</p>
  <div class="crow" style="margin-top:12px"><button class="primary" id="wlStart">Empezar</button><button id="wlLesson">Ir a la lección 1</button></div>`, `
  <h2>Fistu<span class="accent">lab</span></h2>
  <p>A simulator for <b>ultrasound-guided cannulation of the arteriovenous fistula (AVF) for hemodialysis</b>. The ultrasound image is computed in real time from the 3D anatomy of the arm.</p>
  <h4>The screen</h4>
  <ul>
    <li>At the top, the <b>ultrasound monitor</b>. In the corner, the <b>3D arm</b>: <b>⇄</b> swaps the two views and <b>–</b> hides the 3D view.</li>
    <li>At the bottom, the <b>adjustment wheel</b>: choose a maneuver (Along, Rotate, Tilt, Pressure…) and drag it with your thumb.</li>
  </ul>
  <h4>First steps</h4>
  <ol>
    <li><b>Tap the arm</b> in 3D to move the probe to that point. Use <b>two fingers</b> to rotate and zoom the camera.</li>
    <li><b>Short</b> and <b>Long</b> orient the probe to the vessel; <b>Center</b> brings it over the vessel.</li>
    <li>In <b>Cannulate</b>, place the needle with <b>Out-of-plane</b> or <b>In-plane</b>, advance with the wheel and tap <b>Confirm</b>.</li>
    <li>In <b>Lessons</b> you will find 8 guided lessons that are checked automatically.</li>
  </ol>
  <p class="muted">Add the page to your home screen to use it full screen. Educational tool: it does not replace supervised hands-on training.</p>
  <div class="crow" style="margin-top:12px"><button class="primary" id="wlStart">Start</button><button id="wlLesson">Go to lesson 1</button></div>`);

const HELP_TOUCH = tr(`
  <h2>Ayuda de Fistu<span class="accent">lab</span></h2>
  <h4>Gestos</h4>
  <table class="tbl">
    <tr><td>Un dedo sobre el brazo (3D)</td><td>Lleva la sonda a ese punto y la arrastra</td></tr>
    <tr><td>Un dedo fuera del brazo</td><td>Gira la cámara</td></tr>
    <tr><td>Dos dedos</td><td>Acercan, alejan y giran la cámara</td></tr>
    <tr><td>Tocar la imagen</td><td>Mueve el volumen de muestra (PW) o la caja de color; con <b>Medir</b>, marca los dos puntos</td></tr>
    <tr><td>Arrastrar sobre la imagen</td><td>Muestra la profundidad y el tejido bajo el dedo</td></tr>
  </table>
  <h4>Rueda de ajuste</h4>
  <p>Elige la maniobra o el ajuste y arrastra la rueda a izquierda o derecha. Los botones − y + hacen pasos pequeños; mantenlos pulsados para un movimiento continuo.</p>
  <table class="tbl">
    <tr><td>A lo largo · Alrededor</td><td>Deslizar la sonda (proximal/distal · alrededor del brazo)</td></tr>
    <tr><td>Girar · Inclinar · Balanceo</td><td>Rotación, inclinación en abanico y balanceo talón-punta</td></tr>
    <tr><td>Presión</td><td>Comprime el tejido: las venas se colapsan y las arterias no</td></tr>
    <tr><td>Prof. · Ganancia · Foco</td><td>Ajustes de la imagen</td></tr>
    <tr><td>Avance · Ángulo · Rumbo</td><td>Aguja (modo Punción)</td></tr>
  </table>
  <h4>Vistas</h4>
  <p><b>⇄</b> intercambia el monitor y el 3D, <b>Vista</b> cambia la cámara y <b>–</b> oculta el 3D. En horizontal, el monitor queda en el centro y el 3D a la derecha.</p>
  <h4>Más ajustes</h4>
  <p>En <b>Más</b>: caso, brazo, calidad, frecuencia, Doppler (escala, PW, corrección de ángulo), aguja, capas del 3D, informe y paso a la versión de escritorio. La <b>sala y ergonomía</b> sólo están en la versión de escritorio.</p>
  <p class="muted">Los <a href="${SITE.docs}FUNDAMENTOS.md" target="_blank" rel="noopener">fundamentos médicos y físicos</a>, con sus referencias, y la <a href="${SITE.docs}GUIA_DOCENTE.md" target="_blank" rel="noopener">guía docente</a> están en GitHub.</p>`, `
  <h2>Fistu<span class="accent">lab</span> help</h2>
  <h4>Gestures</h4>
  <table class="tbl">
    <tr><td>One finger on the arm (3D)</td><td>Moves the probe to that point and drags it</td></tr>
    <tr><td>One finger off the arm</td><td>Rotates the camera</td></tr>
    <tr><td>Two fingers</td><td>Zoom in, zoom out and rotate the camera</td></tr>
    <tr><td>Tap the image</td><td>Moves the sample volume (PW) or the color box; with <b>Measure</b>, marks the two points</td></tr>
    <tr><td>Drag on the image</td><td>Shows the depth and the tissue under your finger</td></tr>
  </table>
  <h4>Adjustment wheel</h4>
  <p>Choose the maneuver or setting and drag the wheel left or right. The − and + buttons make small steps; hold them down for continuous movement.</p>
  <table class="tbl">
    <tr><td>Along · Around</td><td>Slide the probe (proximal/distal · around the arm)</td></tr>
    <tr><td>Rotate · Tilt · Rock</td><td>Rotation, fanning tilt and heel-toe rock</td></tr>
    <tr><td>Pressure</td><td>Compresses the tissue: veins collapse, arteries do not</td></tr>
    <tr><td>Depth · Gain · Focus</td><td>Image settings</td></tr>
    <tr><td>Advance · Angle · Heading</td><td>Needle (Cannulation mode)</td></tr>
  </table>
  <h4>Views</h4>
  <p><b>⇄</b> swaps the monitor and the 3D view, <b>View</b> changes the camera and <b>–</b> hides the 3D view. In landscape, the monitor sits in the center and the 3D view on the right.</p>
  <h4>More settings</h4>
  <p>Under <b>More</b>: case, arm, quality, frequency, Doppler (scale, PW, angle correction), needle, 3D layers, report and switching to the desktop version. <b>Room &amp; ergonomics</b> is only available in the desktop version.</p>
  <p class="muted">The <a href="${SITE.docs}en/FUNDAMENTALS.md" target="_blank" rel="noopener">medical and physical fundamentals</a>, with their references, and the <a href="${SITE.docs}en/TEACHING_GUIDE.md" target="_blank" rel="noopener">teaching guide</a> are on GitHub.</p>`);

/** Dentro de un marco (p. ej. un artefacto publicado) las descargas y la impresión están bloqueadas. */
const embedded = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

function download(name: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
