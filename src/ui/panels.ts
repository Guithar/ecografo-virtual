/**
 * Paneles informativos (pestañas), ayuda e informe de sesión.
 */
import { TISSUES } from '../anatomy/tissues';
import type { App } from '../app/App';
import type { NeedleEvent } from '../interaction/needle';
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
      <p class="muted">${c.accessType} · dificultad ${['', 'básica', 'intermedia', 'avanzada'][c.difficulty]}</p>
      <p>${c.description}</p>
      <div class="indication"><b>¿Por qué ecoguiada?</b> ${c.indication}</div>
      <div class="cols">
        <div><h4>Objetivos</h4><ul>${c.objectives.map((o) => `<li>${o}</li>`).join('')}</ul></div>
        <div><h4>Consejos</h4><ul>${c.tips.map((o) => `<li>${o}</li>`).join('')}</ul></div>
      </div>
      <h4>Solución (hallazgos esperados)</h4>
      <details><summary class="muted">Mostrar tras explorar el caso</summary>
        <ul>${c.findings.map((o) => `<li>${o}</li>`).join('')}</ul>
        ${exp ? `<div class="kv">${exp.diameter ? `<span>Diámetro</span><span>≈ ${exp.diameter} mm</span>` : ''}${exp.depth ? `<span>Profundidad (pared anterior)</span><span>≈ ${exp.depth} mm</span>` : ''}${exp.qa ? `<span>Qa (humeral)</span><span>≈ ${exp.qa} mL/min</span>` : ''}${exp.mature !== undefined ? `<span>¿Madura?</span><span>${exp.mature ? 'Sí' : 'No'}</span>` : ''}${exp.note ? `<span>Nota</span><span>${exp.note}</span>` : ''}</div>` : ''}
      </details>
      ${c.access ? `<h4>Acceso</h4><div class="kv"><span>Zona recomendada</span><span>${(c.access.zone[0] / 10).toFixed(0)}–${(c.access.zone[1] / 10).toFixed(0)} cm desde la muñeca</span><span>Ángulo recomendado</span><span>${c.access.angle}°</span>${c.access.anastomosisX !== undefined ? `<span>Anastomosis</span><span>${(c.access.anastomosisX / 10).toFixed(1)} cm</span>` : ''}${(c.access.avoid ?? []).map((a) => `<span>Evitar ${(a.x0 / 10).toFixed(0)}–${(a.x1 / 10).toFixed(0)} cm</span><span>${a.reason}</span>`).join('')}</div>` : ''}
      <p class="muted" style="margin-top:10px">Herramienta educativa. No utilizar para decisiones clínicas.</p>`;
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
      <div class="score"><div class="big" style="color:${g.color}" id="mScore">${snap.score}</div><div><b id="mGrade">${g.label}</b><br><span class="muted">Puntuación (100 = sin errores)</span></div>
        <span class="grow"></span>
        <button id="mReset">Reiniciar intento</button></div>
      <h4>Pasos de la punción</h4>
      <ul class="steps" id="mSteps"></ul>
      <div class="metric-grid" id="mGrid"></div>
      ${checks.length ? `<h4>Evaluación de la punción (${n.role})</h4><ul class="checklist">${checks
        .map((c) => `<li class="lv-${c.ok === null ? 'info' : c.ok ? 'good' : 'bad'}"><span class="ic">${c.ok === null ? 'ℹ' : c.ok ? '✔' : '✖'}</span><span>${c.label} <span class="muted">— ${c.detail}</span></span></li>`)
        .join('')}</ul>` : '<p class="muted">Pulsa <b>Confirmar punción</b> (Intro) cuando la aguja esté en posición para evaluarla según las guías.</p>'}
      <h4>Registro de eventos</h4>
      <div class="eventlog" id="mLog">${this.log
        .slice(-60)
        .map((e) => `<div class="${e.severity}">${e.t.toFixed(1).padStart(6)} s · ${e.msg}</div>`)
        .join('') || '<span class="muted">Sin eventos</span>'}</div>`;
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
      m(`${s.elapsed.toFixed(0)} s`, 'Tiempo total'),
      m(s.timeToFlash !== null ? `${s.timeToFlash.toFixed(1)} s` : '—', 'Piel → reflujo'),
      m(String(s.skinPunctures), 'Punciones cutáneas', s.skinPunctures > 1 ? 'warn' : ''),
      m(String(s.redirections), 'Redirecciones', s.redirections > 2 ? 'warn' : ''),
      m(`${s.tipVisiblePct.toFixed(0)} %`, 'Avance con punta visible', s.tipVisiblePct < 60 ? 'bad' : s.tipVisiblePct < 80 ? 'warn' : 'good'),
      m(String(s.shaftConfusions), 'Cuerpo tomado por punta', s.shaftConfusions ? 'warn' : ''),
      m(String(s.backWallContacts), 'Contactos pared posterior', s.backWallContacts ? 'warn' : ''),
      m(String(s.transfixions), 'Transfixiones', s.transfixions ? 'bad' : ''),
      m(String(s.arterialPunctures), 'Punciones arteriales', s.arterialPunctures ? 'bad' : ''),
      m(String(s.nerveContacts), 'Contactos nerviosos', s.nerveContacts ? 'bad' : ''),
      m(`${s.flushes} / ${s.infiltrations}`, 'Lavados con suero / infiltraciones', s.infiltrations ? 'bad' : ''),
      m(`${s.probeMoveDuringAdvance.toFixed(0)} mm`, 'Movimiento de sonda al avanzar', s.probeMoveDuringAdvance > 8 ? 'warn' : ''),
      m(`${this.app.metrics.pathInTissue.toFixed(0)} mm`, 'Recorrido en tejido'),
      m(`${Math.round(s.maxCollapse * 100)} %`, 'Colapso máx. del vaso', s.maxCollapse > 0.5 ? 'warn' : ''),
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
    this.q('tab-measures').innerHTML = `
      <div class="crow wrap" style="margin-bottom:6px">
        <button id="msCal" class="${app.monitor.tool === 'caliper' ? 'on' : ''}">Calibre (M)</button>
        <button id="msClr">Borrar medidas</button>
        <button id="msFreeze">${app.sim.settings.frozen ? 'Descongelar' : 'Congelar'} (espacio)</button>
      </div>
      <div id="msBody"></div>`;
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
    body.innerHTML = `
      <table class="tbl"><tr><th>#</th><th>Distancia</th><th>Orientación</th></tr>${rows || '<tr><td colspan="3" class="muted">Sin medidas: activa el calibre y haz clic en dos puntos de la imagen</td></tr>'}</table>
      <h4>Doppler pulsado</h4>
      ${m.valid ? `<div class="kv"><span>VPS</span><span>${m.psv.toFixed(0)} cm/s</span><span>VFD</span><span>${m.edv.toFixed(0)} cm/s</span><span>IR</span><span>${m.ri.toFixed(2)}</span><span>IP</span><span>${m.pi.toFixed(2)}</span><span>TAMV</span><span>${m.tamv.toFixed(0)} cm/s</span><span>Flujo (Q = TAMV·área·60)</span><span>${qa !== null ? qa.toFixed(0) + ' mL/min' : 'mide el diámetro'}</span></div>` : '<p class="muted">Activa PW (tecla P) y sitúa el volumen de muestra en un vaso.</p>'}
      <h4>Criterios de maduración (con tus medidas)</h4>
      <ul class="checklist">
        ${r6(diam === null ? null : diam >= 6, 'Diámetro (último calibre) ≥ 6 mm (KDOQI) / ≥ 4–5 mm (GEMAV)', diam === null ? '—' : diam.toFixed(1) + ' mm')}
        ${r6(depth === null ? null : depth.dz < 6, 'Profundidad (penúltimo calibre) < 6 mm', depth === null ? '—' : depth.dz.toFixed(1) + ' mm')}
        ${r6(qa === null ? null : qa > 600, 'Flujo > 600 mL/min (KDOQI) / > 500 (GEMAV)', qa === null ? '—' : qa.toFixed(0) + ' mL/min')}
      </ul>
      <p class="muted">Convención: mide primero la profundidad (piel → pared anterior) y después el diámetro (pared interna a pared interna). El flujo del acceso se mide en la arteria humeral.</p>`;
  }

  renderErgo() {
    const e = this.app.ergo;
    const el = this.q('tab-ergo');
    const cfg = this.app.scene.cfg;
    if (!e) {
      el.innerHTML = '<p class="muted">Calculando…</p>';
      return;
    }
    const col = e.score >= 80 ? 'var(--ok)' : e.score >= 55 ? 'var(--warn)' : 'var(--bad)';
    el.innerHTML = `
      <div class="score"><div class="big" style="color:${col}">${e.score}</div><div><b>Ergonomía de la disposición</b><br><span class="muted">Operador · paciente · pantalla</span></div></div>
      <ul class="checklist">${e.items.map((i) => `<li class="lv-${i.level}"><span class="ic">${LEVEL_ICON[i.level]}</span><span><b>${i.label}</b>: ${i.value}<br><span class="muted">${i.advice}</span></span></li>`).join('')}</ul>
      <h4>Cómo usar</h4>
      <p class="muted">En el modo <b>Sala y ergonomía</b> arrastra el <b>ecógrafo</b> o al <b>operador</b> por el suelo. Ajusta el brazo del paciente y la pantalla en la consola. Pulsa la vista <b>Operador</b> para ver la escena con sus ojos.</p>
      <p class="muted">Brazo ${cfg.side === 'left' ? 'izquierdo' : 'derecho'} · operador ${cfg.operator.seated ? 'sentado' : 'de pie'}.</p>`;
  }

  renderLessons() {
    const app = this.app;
    const el = this.q('tab-lessons');
    const L = app.lesson;
    if (!L) {
      el.innerHTML = `<h3>Lecciones guiadas</h3><p class="muted">Cada lección carga su caso y comprueba automáticamente cada paso.</p>
        <div class="lesson-list">${LESSONS.map((l) => `<button data-lesson="${l.id}"><b>${l.title}</b><br><span class="muted">${l.summary}</span></button>`).join('')}</div>`;
      el.querySelectorAll<HTMLButtonElement>('[data-lesson]').forEach((b) => b.addEventListener('click', () => app.startLesson(b.dataset.lesson!)));
      return;
    }
    const step = L.lesson.steps[L.step];
    const pct = (100 * L.done.filter(Boolean).length) / L.lesson.steps.length;
    el.innerHTML = `
      <div class="crow"><h3 style="flex:1">${L.lesson.title}</h3><button id="lsExit">Salir</button></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="muted">Paso ${L.step + 1} de ${L.lesson.steps.length}</div>
      <div class="lesson-step ${L.done[L.step] ? 'done' : ''}">${step.text}${step.hint ? `<div class="muted" style="margin-top:6px">${step.hint}</div>` : ''}${step.check ? `<div class="mini" style="margin-top:6px">${L.done[L.step] ? '✔ completado' : '⏳ se comprueba automáticamente'}</div>` : ''}</div>
      <div class="crow"><button id="lsPrev" ${L.step === 0 ? 'disabled' : ''}>◀ Anterior</button><button id="lsNext" class="primary">${L.step === L.lesson.steps.length - 1 ? 'Finalizar' : 'Siguiente ▶'}</button></div>`;
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
        app.toast('Lección finalizada', 'ok');
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
    this.openModal(`
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
      <p class="site-foot">${SITE.name} es gratuito, sin publicidad y de código abierto · <a href="${SITE.url}" target="_blank" rel="noopener">${SITE.host}</a> · <a class="kofi-link" href="${SITE.kofi}" target="_blank" rel="noopener">Apóyalo en Ko-fi</a></p>`);
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
    this.openModal(`
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
          <table class="tbl"><tr><td><kbd>V</kbd></td><td>Alternar vistas de cámara</td></tr><tr><td><kbd>H</kbd></td><td>Esta ayuda</td></tr></table>
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
      <p class="muted">Los <a href="${SITE.docs}FUNDAMENTOS.md" target="_blank" rel="noopener">fundamentos médicos y físicos</a>, con referencias, siguen <i>Punción ecoguiada del acceso vascular para hemodiálisis</i> (Moyano Franco, Salgueira Lazo, Roca-Tey; <i>Nefrología al día</i>), GEMAV 2017, KDOQI 2019 y ESVS 2018. Para docentes hay una <a href="${SITE.docs}GUIA_DOCENTE.md" target="_blank" rel="noopener">guía con itinerario y rúbrica</a>.</p>
      ${this.aboutHtml()}`);
  }

  /** Acerca de: versión, código, privacidad, aviso y apoyo. */
  private aboutHtml() {
    const link = (href: string, text: string, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${href}" target="_blank" rel="noopener">${text}</a>`;
    const commit = BUILD.commit ? ` · ${link(`${SITE.repo}/commit/${BUILD.commit}`, BUILD.commit)}` : '';
    return `
      <h4>Acerca de ${SITE.name}</h4>
      <div class="about">
        <p><b>${SITE.name}</b> · versión ${BUILD.version} · ${BUILD.date}${commit} · ${link(SITE.url, SITE.host)}<br>
          Código abierto con licencia MIT en ${link(SITE.repo, 'GitHub')}. Sugerencias, casos nuevos y errores: ${link(`${SITE.repo}/issues`, 'GitHub Issues')}.</p>
        <p><b>Privacidad.</b> Sin cookies, sin analítica y sin publicidad. Todo se calcula en tu navegador y no se envía nada a ningún servidor. El historial y las preferencias se guardan solo en este navegador (el historial se borra desde el Informe). El alojamiento, GitHub Pages, puede registrar la dirección IP de las visitas por seguridad.</p>
        <p><b>Aviso.</b> Herramienta educativa. No es un producto sanitario, no sirve para diagnosticar ni para decidir tratamientos y no sustituye la formación práctica supervisada. Las cifras (diámetros, flujos, velocidades) son valores didácticos.</p>
        <p><b>Apoya el proyecto.</b> ${SITE.name} es gratuito. Si te resulta útil, puedes apoyarlo con un café en ${link(SITE.kofi, 'Ko-fi', 'kofi-link')}: ayuda a mantenerlo y a añadir casos y lecciones.</p>
      </div>`;
  }

  showReport() {
    const app = this.app;
    const s = app.metrics.snapshot();
    const g = grade(s.score);
    const hist = app.history.slice(-15).reverse();
    this.openModal(`
      <h2>Informe de la sesión <span class="muted report-brand">· ${SITE.name}</span></h2>
      <p><b>Caso:</b> ${app.caseDef.title}<br><b>Fecha:</b> ${new Date().toLocaleString('es-ES')}</p>
      <h4>Punción actual</h4>
      ${s.skinPunctures === 0 ? '<p class="muted">Todavía no hay ninguna punción: en el modo <b>Punción</b>, coloca la aguja con <kbd>N</kbd> y avanza con <kbd>↑</kbd>.</p>' : `<p>Puntuación: <b style="color:${g.color}">${s.score}/100 (${g.label})</b></p>
      <table class="tbl">
        <tr><td>Tiempo total</td><td>${s.elapsed.toFixed(0)} s</td><td>Piel → reflujo</td><td>${s.timeToFlash !== null ? s.timeToFlash.toFixed(1) + ' s' : '—'}</td></tr>
        <tr><td>Punciones cutáneas</td><td>${s.skinPunctures}</td><td>Redirecciones</td><td>${s.redirections}</td></tr>
        <tr><td>Avance con punta visible</td><td>${s.tipVisiblePct.toFixed(0)} %</td><td>Cuerpo tomado por punta</td><td>${s.shaftConfusions}</td></tr>
        <tr><td>Contactos pared posterior</td><td>${s.backWallContacts}</td><td>Transfixiones</td><td>${s.transfixions}</td></tr>
        <tr><td>Punciones arteriales</td><td>${s.arterialPunctures}</td><td>Contactos nerviosos</td><td>${s.nerveContacts}</td></tr>
        <tr><td>Lavados con suero</td><td>${s.flushes}</td><td>Infiltraciones</td><td>${s.infiltrations}</td></tr>
        <tr><td>Movimiento de sonda al avanzar</td><td>${s.probeMoveDuringAdvance.toFixed(0)} mm</td><td>Colapso máx. del vaso</td><td>${Math.round(s.maxCollapse * 100)} %</td></tr>
      </table>`}
      ${s.checks.length ? `<h4>Criterios</h4><ul>${s.checks.map((c) => `<li>${c.ok === null ? 'ℹ' : c.ok ? '✔' : '✖'} ${c.label} — ${c.detail}</li>`).join('')}</ul>` : ''}
      <h4>Historial (este navegador)</h4>
      ${hist.length ? `<table class="tbl"><tr><th>Fecha</th><th>Caso</th><th>Abordaje</th><th>Aguja</th><th>Puntuación</th></tr>${hist.map((h) => `<tr><td>${new Date(h.date).toLocaleString('es-ES')}</td><td>${h.caseTitle}</td><td>${h.approach}</td><td>${h.needle}</td><td>${h.score}</td></tr>`).join('')}</table>` : '<p class="muted">Sin punciones evaluadas todavía.</p>'}
      <div class="crow no-print" style="margin-top:14px">${embedded ? '' : '<button class="primary" id="rpPrint">Imprimir / PDF</button><button id="rpJson">Exportar JSON</button><button id="rpCsv">Exportar CSV</button>'}<button id="rpCopyJson">Copiar JSON</button><button id="rpCopyCsv">Copiar CSV</button><button class="danger" id="rpClear">Borrar historial</button></div>
      <textarea id="rpText" class="hidden" readonly rows="6" style="width:100%;margin-top:8px;background:#0d141a;color:#cfe;border:1px solid #243240;font:11px var(--mono)"></textarea>
      <p class="site-foot">Generado con ${SITE.name} ${BUILD.version} · ${SITE.host} · herramienta educativa</p>`);
    const json = () => JSON.stringify({ app: { nombre: SITE.name, version: BUILD.version, url: SITE.url }, caso: app.caseDef.id, metricas: s, eventos: app.metrics.log, historial: app.history }, null, 2);
    const csv = () => ['fecha;caso;abordaje;aguja;puntuacion'].concat(app.history.map((h) => `${h.date};${h.caseId};${h.approach};${h.needle};${h.score}`)).join('\n');
    if (!embedded) {
      this.q('rpPrint').addEventListener('click', () => window.print());
      this.q('rpJson').addEventListener('click', () => download('sesion-fistulab.json', json(), 'application/json'));
      this.q('rpCsv').addEventListener('click', () => download('historial-fistulab.csv', csv(), 'text/csv'));
    }
    const copy = (txt: string) => {
      const ta = this.q('rpText') as HTMLTextAreaElement;
      navigator.clipboard
        .writeText(txt)
        .then(() => app.toast('Copiado al portapapeles', 'ok'))
        .catch(() => {
          ta.classList.remove('hidden');
          ta.value = txt;
          ta.select();
          app.toast('Selecciona y copia el texto (Ctrl+C)', 'info');
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
