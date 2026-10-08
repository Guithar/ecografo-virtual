/**
 * Interfaz móvil (pantallas pequeñas y táctiles): el monitor del ecógrafo es el protagonista y el brazo 3D
 * va en miniatura (en vertical) o a la derecha (en horizontal). Debajo, una rueda de ajuste para las
 * maniobras de la sonda, la imagen y la aguja, botones según el modo, una barra de navegación y dos hojas
 * (información y «Más» ajustes). Reutiliza todo el motor: sólo cambia la presentación y los controles.
 */
import { CASES } from '../anatomy/cases';
import type { App, AppMode } from '../app/App';
import { canInstall, installApp, isStandalone } from '../pwa';
import type { CameraPreset } from '../scene/SceneManager';
import { SITE } from '../site';
import { IMAGE_PRESETS } from './console';
import { Bound, button, el, field, selectBox } from './controls';
import { COMPACT_QUERY, forcedCompact } from './device';

type JogGroup = 'needle' | 'probe' | 'image';

/** Un ajuste que se controla con la rueda: continuo (`drag`) o por pasos (`step`). */
interface JogTarget {
  id: string;
  label: string;
  group: JogGroup;
  show(): string;
  /** unidades por píxel arrastrado */
  drag?(px: number): void;
  /** píxeles de arrastre por paso */
  stepPx?: number;
  step?(dir: 1 | -1): void;
  /** teclas que mantienen un movimiento continuo mientras se pulsan − y + */
  keys?: [string, string];
}

type Sheet = 'info' | 'more' | null;

const CAMERAS: [CameraPreset, string][] = [
  ['procedimiento', 'procedimiento'],
  ['superior', 'superior'],
  ['lateral', 'lateral'],
  ['corte', 'perpendicular al corte'],
];

const ICONS: Record<string, string> = {
  explore: '<path d="M8.5 3h7v6.5l2 3.5h-11l2-3.5z"/><path d="M6.5 13h11v3h-11z"/><path d="M12 16v5"/>',
  cannulate: '<path d="M4 20l8.5-8.5"/><path d="M12.5 11.5l5.5-5.5 2 2-5.5 5.5z"/><path d="M15 4l5 5"/>',
  learn: '<path d="M3.5 5.5h6a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 0-2-2h-6.5z"/><path d="M20.5 5.5h-6a2.5 2.5 0 0 0-2.5 2.5v11a2 2 0 0 1 2-2h6.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.6v.4"/>',
  more: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class MobileUI {
  active = false;
  landscape = false;
  /** 3D grande y monitor pequeño */
  swapped = false;
  /** miniatura 3D oculta (en vertical) */
  pipOff = false;
  private pipAutoOff = false;
  private sheet: Sheet = null;
  private targets: JogTarget[] = [];
  private target!: JogTarget;
  private bounds: Bound[] = [];
  private moreBounds: Bound[] = [];
  private modeSig = '';
  private lessonSig = '';
  private lessonCollapsed = false;
  private camIdx = 0;
  private prevPw = false;
  private dock!: HTMLElement;
  private chips!: HTMLElement;
  private jogStrip!: HTMLElement;
  private jogVal!: HTMLElement;
  private jogOffset = 0;
  private rowNeedle!: HTMLElement;
  private rowImage!: HTMLElement;
  private nav!: HTMLElement;
  private lessonBar!: HTMLElement;
  private more!: HTMLElement;
  private installRow!: HTMLElement;

  constructor(private app: App) {
    this.targets = this.buildTargets();
    this.target = this.targets[0];
    this.build();
    const compact = matchMedia(COMPACT_QUERY);
    const land = matchMedia('(orientation: landscape)');
    const sync = () => {
      this.landscape = land.matches;
      this.setActive(forcedCompact() ?? compact.matches);
    };
    compact.addEventListener('change', sync);
    land.addEventListener('change', sync);
    sync();
  }

  setActive(on: boolean) {
    const was = this.active;
    this.active = on;
    const app = this.app;
    app.touchUI = on;
    app.monitor.compact = on;
    if (on && app.mode === 'room') app.setMode('explore');
    if (!on) {
      this.openSheet(null);
      app.monitor.flags.hint = '';
    }
    // en escritorio la ventana flotante pasa al modo enfoque; en el móvil, el enfoque se aparta
    app.focus?.refresh();
    this.applyClasses();
    app.placeToasts();
    if (on !== was) {
      // textos que dependen del dispositivo
      app.panels.renderLessons();
      app.panels.renderMeasures();
      app.panels.renderMetrics();
      this.modeSig = '';
      this.lessonSig = '';
    }
    this.update();
  }

  private applyClasses() {
    const b = document.body.classList;
    const a = this.active;
    b.toggle('mobile', a);
    b.toggle('m-land', a && this.landscape);
    b.toggle('m-swap', a && this.swapped);
    b.toggle('m-pipoff', a && this.pipOff);
    b.toggle('m-sheet-info', a && this.sheet === 'info');
    b.toggle('m-sheet-more', a && this.sheet === 'more');
    // en vertical, la vista pequeña flota en la esquina inferior derecha de la grande
    if (a)
      this.app.pip.set(
        this.landscape ? null : { main: this.swapped ? '3d' : 'us', hidden: this.pipOff && !this.swapped, corner: 'br', size: { w: 0.46, h: this.swapped ? 0.4 : 0.36 } },
      );
  }

  // ------------------------------------------------------------------------------------------
  // Construcción
  // ------------------------------------------------------------------------------------------
  private build() {
    const app = this.app;
    const root = document.getElementById('app')!;

    // barra de lección
    this.lessonBar = el('div', { id: 'mLesson', class: 'm-only' });
    root.appendChild(this.lessonBar);

    // panel inferior: chips de maniobra, rueda y botones
    this.dock = el('div', { id: 'mDock', class: 'm-only' });
    this.chips = el('div', { class: 'm-chips', role: 'tablist', 'aria-label': 'Ajuste de la rueda' });
    this.dock.appendChild(this.chips);
    this.dock.appendChild(this.buildJog());
    const row = (cls = '') => {
      const r = el('div', { class: `m-actions ${cls}` });
      this.dock.appendChild(r);
      return r;
    };
    const add = (parent: HTMLElement, b: Bound) => {
      parent.appendChild(b.el);
      this.bounds.push(b);
      return b;
    };
    const s = () => app.sim.settings;

    // aguja (punción)
    this.rowNeedle = row('m-needle');
    const role = add(
      this.rowNeedle,
      button('Arterial', () => {
        app.activeNeedle = 1 - app.activeNeedle;
        app.toast(`Aguja ${app.needle.role} activa`, 'info');
      }, { title: 'Cambiar entre la aguja arterial y la venosa' }),
    );
    const roleUpd = role.update;
    role.update = () => {
      roleUpd();
      const art = app.activeNeedle === 0;
      role.el.textContent = art ? 'Arterial' : 'Venosa';
      role.el.classList.toggle('m-art', art);
      role.el.classList.toggle('m-ven', !art);
    };
    add(this.rowNeedle, button('Fuera de plano', () => app.placeNeedleAuto('oop'), { title: 'Colocar la aguja fuera de plano (eje corto)' }));
    add(this.rowNeedle, button('En plano', () => app.placeNeedleAuto('ip'), { title: 'Colocar la aguja en plano (eje largo)' }));
    add(this.rowNeedle, button('Suero', () => app.flushNeedle(), { title: 'Lavar con suero para comprobar la posición de la punta' }));
    add(this.rowNeedle, button('Retirar', () => app.withdrawNeedle(), { cls: 'danger' }));
    add(this.rowNeedle, button('Confirmar', () => app.confirmPuncture(), { cls: 'primary', title: 'Evaluar la posición final de la aguja' }));

    // sonda
    const rowProbe = row();
    add(rowProbe, button('Transv.', () => app.setProbeView('trans'), { title: 'Eje corto respecto al vaso' }));
    add(rowProbe, button('Long.', () => app.setProbeView('long'), { title: 'Eje largo respecto al vaso' }));
    add(rowProbe, button('Centrar', () => app.centerOnVessel(), { title: 'Centrar la sonda sobre el vaso de acceso' }));
    add(rowProbe, button('Compresor', () => app.setTourniquet(!app.tourniquet), { active: () => app.tourniquet }));
    const extra = add(
      rowProbe,
      button('Etiquetas', () => {
        if (app.needleMode()) app.setAsepsis(!app.asepsis);
        else app.labels = !app.labels;
      }),
    );
    const extraUpd = extra.update;
    extra.update = () => {
      extraUpd();
      const c = app.needleMode();
      extra.el.textContent = c ? 'Asepsia' : 'Etiquetas';
      extra.el.title = c ? 'Piel desinfectada, funda estéril en la sonda y gel estéril' : 'Nombres de las estructuras sobre la imagen';
      extra.el.classList.toggle('on', c ? app.asepsis : app.labels);
    };

    // imagen (exploración)
    this.rowImage = row();
    add(this.rowImage, button('Color', () => (s().mode = s().mode === 'color' ? 'B' : 'color'), { active: () => s().mode === 'color', title: 'Doppler color' }));
    add(
      this.rowImage,
      button('PW', () => {
        s().pw = !s().pw;
        app.spectral.enabled = s().pw;
        if (s().pw && s().mode === 'B') s().mode = 'color';
        if (s().pw) app.toast('Toca la imagen para situar el volumen de muestra', 'info');
      }, { active: () => s().pw, title: 'Doppler pulsado' }),
    );
    add(this.rowImage, button('Congelar', () => (s().frozen = !s().frozen), { active: () => s().frozen }));
    add(
      this.rowImage,
      button('Medir', () => {
        app.monitor.tool = app.monitor.tool === 'caliper' ? 'none' : 'caliper';
        if (app.monitor.tool === 'caliper') app.toast('Toca dos puntos de la imagen para medir', 'info');
      }, { active: () => app.monitor.tool === 'caliper', title: 'Calibre' }),
    );
    add(
      this.rowImage,
      button('Borrar', () => {
        app.monitor.clearCalipers();
        app.panels.renderMeasures();
      }, { title: 'Borrar las medidas' }),
    );
    root.appendChild(this.dock);

    // navegación inferior
    this.nav = el('nav', { id: 'mNav', class: 'm-only', 'aria-label': 'Secciones' });
    const navBtn = (id: string, label: string, onClick: () => void) => {
      const b = el('button', { 'data-nav': id }, `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg><span>${label}</span>`);
      b.addEventListener('click', onClick);
      this.nav.appendChild(b);
    };
    const go = (m: AppMode) => {
      this.openSheet(null);
      app.setMode(m);
    };
    navBtn('explore', 'Explorar', () => go('explore'));
    navBtn('cannulate', 'Punción', () => go('cannulate'));
    navBtn('learn', 'Lecciones', () => {
      go('learn');
      if (!app.lesson) this.openInfo('lessons');
    });
    navBtn('info', 'Info', () => (this.sheet === 'info' ? this.openSheet(null) : this.openInfo()));
    navBtn('more', 'Más', () => this.openSheet(this.sheet === 'more' ? null : 'more'));
    root.appendChild(this.nav);

    // controles de las vistas (intercambiar, cámara, ocultar la miniatura)
    const ctl = (pane: HTMLElement, acts: [string, string, string][]) => {
      const d = el('div', { class: 'm-panectl m-only' });
      for (const [act, label, title] of acts) {
        const b = el('button', { 'data-act': act, title, 'aria-label': title }, label);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          this.paneAction(act);
        });
        d.appendChild(b);
      }
      pane.appendChild(d);
    };
    ctl(document.getElementById('pane3d')!, [
      ['swap', '⇄', 'Intercambiar el 3D y el monitor'],
      ['cam', 'Vista', 'Cambiar la cámara'],
      ['hide', '–', 'Ocultar el 3D'],
    ]);
    const mon = document.getElementById('paneMonitor')!;
    ctl(mon, [['swap', '⇄', 'Intercambiar el monitor y el 3D']]);
    const show = el('button', { id: 'mPipShow', class: 'm-only' }, 'Ver 3D');
    show.addEventListener('click', () => this.paneAction('show'));
    mon.appendChild(show);

    // hoja de información: el panel de pestañas de escritorio, con botón de cierre
    const close = el('button', { class: 'm-only m-close', 'aria-label': 'Cerrar' }, '✕');
    close.addEventListener('click', () => this.openSheet(null));
    document.getElementById('tabButtons')!.appendChild(close);
    // al elegir una lección se cierra la hoja para ver la imagen
    document.getElementById('tab-lessons')!.addEventListener('click', (e) => {
      if (this.active && (e.target as HTMLElement).closest('[data-lesson]')) this.openSheet(null);
    });

    // hoja «Más»
    this.more = el('div', { id: 'mMore', class: 'm-sheet m-only', role: 'dialog', 'aria-label': 'Más ajustes' });
    const head = el('div', { class: 'm-sheet-head' }, '<span>Más ajustes</span>');
    const x = el('button', { 'aria-label': 'Cerrar' }, '✕');
    x.addEventListener('click', () => this.openSheet(null));
    head.appendChild(x);
    this.more.appendChild(head);
    const body = el('div', { class: 'm-sheet-body' });
    this.more.appendChild(body);
    this.buildMore(body);
    document.body.appendChild(this.more);
    const bd = el('div', { id: 'mBackdrop', class: 'm-only' });
    bd.addEventListener('click', () => this.openSheet(null));
    document.body.appendChild(bd);
  }

  // ------------------------------------------------------------------------------------------
  // Rueda de ajuste
  // ------------------------------------------------------------------------------------------
  private buildTargets(): JogTarget[] {
    const app = this.app;
    const p = () => app.probe;
    const s = () => app.sim.settings;
    const n = () => app.needle;
    // mm sobre la piel → grados alrededor del brazo
    const arcDeg = (mm: number) => {
      const sec = app.arm.section(p().x);
      const R = Math.sqrt((sec.a + sec.fat + sec.skin) * (sec.b + sec.fat + sec.skin));
      return (mm / R) * (180 / Math.PI);
    };
    const deg = (v: number) => `${v.toFixed(0)}°`;
    const needleFree = () => n().placed && !n().confirmed;
    return [
      { id: 'largo', label: 'A lo largo', group: 'probe', show: () => `${(p().x / 10).toFixed(1)} cm`, drag: (px) => (p().x += px * 0.12), keys: ['s', 'w'] },
      {
        id: 'alrededor',
        label: 'Alrededor',
        group: 'probe',
        show: () => deg(p().theta),
        drag: (px) => (p().theta += arcDeg(px * 0.12) * (app.scene.cfg.side === 'left' ? 1 : -1)),
        keys: ['a', 'd'],
      },
      { id: 'girar', label: 'Girar', group: 'probe', show: () => deg(p().rot), drag: (px) => (p().rot += px * 0.3), keys: ['q', 'e'] },
      { id: 'inclinar', label: 'Inclinar', group: 'probe', show: () => deg(p().tilt), drag: (px) => (p().tilt += px * 0.1), keys: ['f', 'r'] },
      { id: 'balanceo', label: 'Balanceo', group: 'probe', show: () => deg(p().rock), drag: (px) => (p().rock += px * 0.1), keys: ['g', 't'] },
      { id: 'presion', label: 'Presión', group: 'probe', show: () => `${p().press.toFixed(1)} mm`, drag: (px) => (p().press += px * 0.02), keys: ['z', 'x'] },
      {
        id: 'prof',
        label: 'Prof.',
        group: 'image',
        show: () => `${(s().depth / 10).toFixed(1)} cm`,
        stepPx: 24,
        step: (d) => {
          s().depth = clamp(s().depth + 5 * d, 15, 60);
          s().focus = Math.min(s().focus, s().depth - 1);
        },
      },
      { id: 'gan', label: 'Ganancia', group: 'image', show: () => String(55 + s().gain), stepPx: 9, step: (d) => (s().gain = clamp(s().gain + d, -25, 25)) },
      { id: 'foco', label: 'Foco', group: 'image', show: () => `${s().focus} mm`, stepPx: 8, step: (d) => (s().focus = clamp(s().focus + d, 2, Math.min(50, s().depth - 1))) },
      {
        id: 'avance',
        label: 'Avance',
        group: 'needle',
        show: () => (n().placed ? `${Math.max(0, n().depth).toFixed(1)} mm` : 'sin colocar'),
        drag: (px) => n().placed && app.advanceNeedle(px * 0.04),
        keys: ['arrowdown', 'arrowup'],
      },
      {
        id: 'angulo',
        label: 'Ángulo',
        group: 'needle',
        show: () => deg(n().angle),
        drag: (px) => needleFree() && (n().angle = clamp(n().angle + px * 0.1, 5, 70)),
        keys: ['pagedown', 'pageup'],
      },
      {
        id: 'rumbo',
        label: 'Rumbo',
        group: 'needle',
        show: () => deg(n().heading),
        drag: (px) => {
          if (!needleFree()) return;
          const h = n().heading + px * 0.3;
          n().heading = h > 180 ? h - 360 : h < -180 ? h + 360 : h;
        },
        keys: ['arrowleft', 'arrowright'],
      },
    ];
  }

  private buildJog(): HTMLElement {
    const app = this.app;
    const wrap = el('div', { class: 'm-jog' });
    const minus = el('button', { 'aria-label': 'Menos' }, '−');
    const plus = el('button', { 'aria-label': 'Más' }, '+');
    this.jogStrip = el('div', { class: 'm-jog-strip', role: 'slider', 'aria-label': 'Rueda de ajuste' });
    this.jogVal = el('span', { class: 'm-jog-val' });
    this.jogStrip.appendChild(this.jogVal);
    wrap.append(minus, this.jogStrip, plus);

    const needsNeedle = () => this.target.group === 'needle' && !app.needle.placed;
    let drag: { x: number; acc: number } | null = null;
    this.jogStrip.addEventListener('pointerdown', (e) => {
      if (needsNeedle()) {
        app.toast('Primero coloca la aguja («Fuera de plano» o «En plano»)', 'warn');
        return;
      }
      drag = { x: e.clientX, acc: 0 };
      this.jogStrip.setPointerCapture(e.pointerId);
      this.jogStrip.classList.add('drag');
    });
    this.jogStrip.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      drag.x = e.clientX;
      this.jogOffset += dx;
      this.jogStrip.style.backgroundPositionX = `${this.jogOffset}px`;
      const t = this.target;
      if (t.drag) t.drag(dx);
      else if (t.step && t.stepPx) {
        drag.acc += dx;
        while (Math.abs(drag.acc) >= t.stepPx) {
          const d = drag.acc > 0 ? 1 : -1;
          drag.acc -= d * t.stepPx;
          t.step(d);
          navigator.vibrate?.(4);
        }
      }
      this.showJog();
    });
    const end = () => {
      drag = null;
      this.jogStrip.classList.remove('drag');
    };
    this.jogStrip.addEventListener('pointerup', end);
    this.jogStrip.addEventListener('pointercancel', end);

    // − y +: pasos sueltos o movimiento continuo mientras se mantienen pulsados
    const hold = (b: HTMLElement, dir: 1 | -1) => {
      let key: string | null = null;
      let timer = 0;
      const stop = () => {
        if (key) app.keys.delete(key);
        key = null;
        clearTimeout(timer);
        clearInterval(timer);
      };
      b.addEventListener('pointerdown', (e) => {
        const t = this.target;
        if (needsNeedle()) {
          app.toast('Primero coloca la aguja («Fuera de plano» o «En plano»)', 'warn');
          return;
        }
        b.setPointerCapture(e.pointerId);
        if (t.keys) {
          key = t.keys[dir > 0 ? 1 : 0];
          app.keys.add(key);
        } else if (t.step) {
          t.step(dir);
          this.showJog();
          timer = window.setTimeout(() => {
            timer = window.setInterval(() => {
              t.step!(dir);
              this.showJog();
            }, 120);
          }, 380);
        }
      });
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointercancel', stop);
      b.addEventListener('lostpointercapture', stop);
    };
    hold(minus, -1);
    hold(plus, 1);
    return wrap;
  }

  private showJog() {
    this.jogVal.innerHTML = `${this.target.label} <b>${this.target.show()}</b>`;
  }

  private setTarget(id: string) {
    const t = this.targets.find((x) => x.id === id);
    if (!t) return;
    this.target = t;
    for (const c of this.chips.querySelectorAll<HTMLElement>('.m-chip')) {
      const on = c.dataset.id === id;
      c.classList.toggle('on', on);
      c.setAttribute('aria-selected', String(on));
      if (on) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    this.showJog();
  }

  private renderChips(cannulating: boolean) {
    const order: JogGroup[] = cannulating ? ['needle', 'probe', 'image'] : ['probe', 'image'];
    const list = order.flatMap((g) => this.targets.filter((t) => t.group === g && !(cannulating && t.id === 'foco')));
    this.chips.innerHTML = '';
    let prev: JogGroup | null = null;
    for (const t of list) {
      if (prev && prev !== t.group) this.chips.appendChild(el('span', { class: 'm-sep' }));
      prev = t.group;
      const c = el('button', { class: `m-chip g-${t.group}`, role: 'tab', 'data-id': t.id }, t.label);
      c.addEventListener('click', () => this.setTarget(t.id));
      this.chips.appendChild(c);
    }
    // al entrar en punción la rueda pasa al avance de la aguja; al salir, a la sonda
    const changed = this.lastCannulating !== cannulating;
    this.lastCannulating = cannulating;
    this.setTarget(!changed && list.includes(this.target) ? this.target.id : cannulating ? 'avance' : 'largo');
  }
  private lastCannulating: boolean | null = null;

  // ------------------------------------------------------------------------------------------
  // Vistas y hojas
  // ------------------------------------------------------------------------------------------
  private paneAction(act: string) {
    const app = this.app;
    if (act === 'swap') {
      this.swapped = !this.swapped;
    } else if (act === 'hide') {
      this.pipOff = true;
      this.pipAutoOff = false;
    } else if (act === 'show') {
      this.pipOff = false;
      this.pipAutoOff = false;
    } else if (act === 'cam') {
      this.camIdx = (this.camIdx + 1) % CAMERAS.length;
      const [preset, name] = CAMERAS[this.camIdx];
      app.scene.setPreset(preset);
      app.toast(`Vista ${name}`, 'info');
    }
    this.applyClasses();
  }

  private openInfo(tab?: string) {
    const app = this.app;
    app.panels.showTab(tab ?? (app.needleMode() ? 'metrics' : app.mode === 'learn' ? 'lessons' : 'case'));
    this.openSheet('info');
  }

  private openSheet(s: Sheet) {
    this.sheet = s;
    this.applyClasses();
    if (s === 'more') {
      this.installRow.classList.toggle('hidden', !canInstall() || isStandalone());
      for (const b of this.moreBounds) b.update();
    }
    this.updateNav();
  }

  /** Tras evaluar una punción se muestra el resultado. */
  onEvaluated() {
    if (this.active) this.openInfo('metrics');
  }

  private updateNav() {
    const m = this.app.mode;
    for (const b of this.nav.querySelectorAll<HTMLElement>('button')) {
      const id = b.dataset.nav!;
      const on = this.sheet ? id === this.sheet : id === m;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
  }

  // ------------------------------------------------------------------------------------------
  // Actualización (5 Hz y tras cada acción)
  // ------------------------------------------------------------------------------------------
  update() {
    if (!this.active) return;
    const app = this.app;
    const cann = app.needleMode();
    const sig = `${app.mode}|${cann}`;
    if (sig !== this.modeSig) {
      this.modeSig = sig;
      this.renderChips(cann);
      this.rowNeedle.classList.toggle('hidden', !cann);
      this.rowImage.classList.toggle('hidden', cann);
      this.updateNav();
    }
    for (const b of this.bounds) b.update();
    if (this.sheet === 'more') for (const b of this.moreBounds) b.update();
    this.showJog();
    this.updateLesson();
    app.monitor.flags.hint = app.statusLine();
    // con el espectrograma PW la imagen se encoge: en una pantalla tan pequeña la miniatura 3D se aparta
    const pw = app.sim.settings.pw;
    if (pw !== this.prevPw) {
      this.prevPw = pw;
      if (pw && app.pip.top() === '3d') {
        this.pipOff = true;
        this.pipAutoOff = true;
        this.applyClasses();
      } else if (!pw && this.pipAutoOff) {
        this.pipOff = false;
        this.pipAutoOff = false;
        this.applyClasses();
      }
    }
  }

  private updateLesson() {
    const app = this.app;
    const L = app.lesson;
    const sig = `${app.mode}|${L?.lesson.id}|${L?.step}|${L?.done.join()}|${this.lessonCollapsed}`;
    if (sig === this.lessonSig) return;
    this.lessonSig = sig;
    const bar = this.lessonBar;
    if (app.mode !== 'learn') {
      bar.innerHTML = '';
      return;
    }
    if (!L) {
      bar.innerHTML = '<div class="m-lhead"><span class="t">Lecciones guiadas</span><button data-l="pick" class="primary">Elegir lección</button></div>';
    } else {
      const step = L.lesson.steps[L.step];
      const last = L.step === L.lesson.steps.length - 1;
      const done = L.done[L.step];
      const status = step.check ? (done ? '<span class="m-lstatus ok">✔ completado</span>' : '<span class="m-lstatus">⏳ se comprueba solo</span>') : '';
      bar.innerHTML = `
        <div class="m-lhead">
          <span class="t">${L.lesson.title} · paso ${L.step + 1}/${L.lesson.steps.length}</span>
          <button data-l="fold" aria-label="${this.lessonCollapsed ? 'Mostrar' : 'Plegar'} el texto">${this.lessonCollapsed ? '▴' : '▾'}</button>
          <button data-l="exit" aria-label="Salir de la lección">✕</button>
        </div>
        <div class="m-ltext ${this.lessonCollapsed ? 'collapsed' : ''}">${app.dt(step.text)}${step.hint && !this.lessonCollapsed ? `<div class="muted m-lhint">${app.dt(step.hint)}</div>` : ''}</div>
        <div class="m-lnav">${status}<span class="grow"></span><button data-l="prev" ${L.step === 0 ? 'disabled' : ''}>◀</button><button data-l="next" class="primary">${last ? 'Finalizar' : 'Siguiente ▶'}</button></div>`;
    }
    bar.querySelectorAll<HTMLButtonElement>('[data-l]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.l;
        const cur = app.lesson;
        if (a === 'pick') this.openInfo('lessons');
        else if (a === 'fold') this.lessonCollapsed = !this.lessonCollapsed;
        else if (a === 'exit') app.lesson = null;
        else if (cur && a === 'prev') cur.step = Math.max(0, cur.step - 1);
        else if (cur && a === 'next') {
          if (cur.step >= cur.lesson.steps.length - 1) {
            app.toast('Lección finalizada', 'ok');
            app.lesson = null;
          } else cur.step++;
        }
        app.panels.renderLessons();
        this.update();
      }),
    );
  }

  // ------------------------------------------------------------------------------------------
  // Hoja «Más»
  // ------------------------------------------------------------------------------------------
  private buildMore(body: HTMLElement) {
    const app = this.app;
    const s = () => app.sim.settings;
    const add = <T extends Bound>(parent: HTMLElement, b: T): T => {
      parent.appendChild(b.el);
      this.moreBounds.push(b);
      return b;
    };
    const sec = (title: string, open = false) => {
      const d = el('details', { class: 'm-sec' });
      d.open = open;
      d.appendChild(el('summary', {}, title));
      const b = el('div', { class: 'm-sec-body' });
      d.appendChild(b);
      body.appendChild(d);
      return b;
    };
    const labeled = (parent: HTMLElement, label: string, b: Bound) => {
      const l = el('label', { class: 'm-lbl' }, `<span>${label}</span>`);
      l.appendChild(b.el);
      parent.appendChild(l);
      this.moreBounds.push(b);
    };
    const btnRow = (parent: HTMLElement) => {
      const r = el('div', { class: 'm-row' });
      parent.appendChild(r);
      return r;
    };
    // controles de escritorio que se reflejan aquí (una sola fuente de verdad)
    const orig = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const fire = (e: HTMLElement, type: string) => e.dispatchEvent(new Event(type));
    const mirrorSelect = (id: string, opts: [string, string][]) => {
      const o = orig<HTMLSelectElement>(id);
      return selectBox(opts, () => o.value, (v) => {
        o.value = v;
        fire(o, 'change');
      });
    };
    const mirrorCheck = (id: string, label: string) => {
      const o = orig<HTMLInputElement>(id);
      return button(label, () => {
        o.checked = !o.checked;
        fire(o, 'change');
      }, { active: () => o.checked });
    };

    // caso y paciente
    const cCase = sec('Caso y paciente', true);
    labeled(cCase, 'Caso', mirrorSelect('caseSelect', CASES.map((c) => [c.id, `${'●'.repeat(c.difficulty)}${'○'.repeat(3 - c.difficulty)} ${c.title}`] as [string, string])));
    labeled(cCase, 'Brazo', mirrorSelect('armSide', [['left', 'Izquierdo'], ['right', 'Derecho']]));
    labeled(cCase, 'Calidad', mirrorSelect('quality', [['alta', 'Alta (60 fps)'], ['media', 'Media'], ['baja', 'Baja']]));

    // imagen
    const cImg = sec('Imagen');
    labeled(
      cImg,
      'Preajuste',
      selectBox(
        Object.keys(IMAGE_PRESETS).map((k) => [k, k] as [string, string]),
        () => s().preset,
        (v) => Object.assign(s(), IMAGE_PRESETS[v], { preset: v }),
      ),
    );
    add(cImg, field('Frecuencia', () => s().freq, (v) => {
      s().freq = v;
      app.lessonFlags.freqChanged = 1;
    }, { min: 6, max: 15, step: 1, fmt: (v) => `${v} MHz` }));
    add(cImg, field('Foco', () => s().focus, (v) => (s().focus = Math.min(v, s().depth - 1)), { min: 2, max: 50, step: 1, fmt: (v) => `${v} mm` }));
    add(cImg, field('Rango din.', () => s().dr, (v) => (s().dr = v), { min: 40, max: 90, step: 5, fmt: (v) => `${v} dB` }));
    add(cImg, field('Persistencia', () => s().persistence, (v) => (s().persistence = v), { min: 0, max: 0.85, step: 0.05, fmt: (v) => String(Math.round(v * 10)) }));
    add(cImg, field('Speckle', () => s().sri, (v) => (s().sri = v), { min: 0, max: 1, step: 0.05, fmt: (v) => String(Math.round(v * 5)), title: 'Reducción de speckle' }));
    add(cImg, field('Fusión', () => s().fusion, (v) => (s().fusion = v), { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)} %`, title: 'Superponer la anatomía real sobre la ecografía' }));
    const ri = btnRow(cImg);
    add(ri, button('Invertir I/D', () => {
      s().flipLR = !s().flipLR;
      if (s().flipLR) app.lessonFlags.flipSeen = 1;
    }, { active: () => s().flipLR }));
    add(ri, button('Ayudas', () => (app.aids = !app.aids), { active: () => app.aids, title: 'Posición real de la punta y tejido bajo el dedo' }));
    add(ri, button('2 focos', () => (s().focusZones = s().focusZones === 2 ? 1 : 2), { active: () => s().focusZones === 2 }));
    add(ri, selectBox([['0', 'Gris'], ['1', 'Sepia'], ['2', 'Azul']], () => String(s().grayMap) as '0', (v) => (s().grayMap = parseInt(v) as 0 | 1 | 2), 'Mapa de color del modo B'));

    // Doppler
    const cDop = sec('Doppler');
    const rd = btnRow(cDop);
    add(rd, button('Modo B', () => {
      s().mode = 'B';
      s().pw = false;
    }, { active: () => s().mode === 'B' && !s().pw }));
    add(rd, button('Color', () => (s().mode = s().mode === 'color' ? 'B' : 'color'), { active: () => s().mode === 'color' }));
    add(rd, button('Power', () => (s().mode = s().mode === 'power' ? 'B' : 'power'), { active: () => s().mode === 'power' }));
    add(rd, button('PW', () => {
      s().pw = !s().pw;
      app.spectral.enabled = s().pw;
      if (s().pw && s().mode === 'B') s().mode = 'color';
    }, { active: () => s().pw }));
    add(cDop, field('Escala', () => (s().pw ? app.spectral.scale : s().scale), (v) => {
      if (s().pw) app.spectral.scale = v;
      else s().scale = v;
    }, { min: 10, max: 600, step: 5, fmt: (v) => `±${v}`, title: 'Escala de velocidad / PRF (cm/s); con PW, la del espectro' }));
    add(cDop, field('Gan. color', () => s().colorGain, (v) => (s().colorGain = v), { min: 0, max: 1, step: 0.02, fmt: (v) => String(Math.round(v * 100)) }));
    add(cDop, field('Filtro pared', () => s().wallFilter, (v) => (s().wallFilter = v), { min: 0, max: 30, step: 1, fmt: (v) => `${v}` }));
    add(cDop, field('Línea base', () => app.spectral.baseline, (v) => {
      app.spectral.baseline = v;
      s().baseline = (v - 0.5) * 2;
    }, { min: 0.1, max: 0.9, step: 0.05, fmt: (v) => `${Math.round((v - 0.5) * 200)}%` }));
    add(cDop, field('Corr. ángulo', () => app.spectral.angleCorr, (v) => (app.spectral.angleCorr = v), { min: 0, max: 80, step: 1, fmt: (v) => `${v}°`, title: 'Alinéala con el eje del vaso (≤ 60°)' }));
    add(cDop, field('Vol. muestra', () => s().pwGate.size, (v) => (s().pwGate.size = v), { min: 0.5, max: 12, step: 0.5, fmt: (v) => `${v} mm` }));
    const rd2 = btnRow(cDop);
    const steer = add(rd2, button('Haz 0°', () => {
      const v = s().steer;
      s().steer = v === 0 ? 20 : v === 20 ? -20 : 0;
    }, { title: 'Angulación del haz Doppler (−20°, 0°, +20°)' }));
    const steerUpd = steer.update;
    steer.update = () => {
      steerUpd();
      steer.el.textContent = `Haz ${s().steer > 0 ? '+' : ''}${s().steer}°`;
    };
    add(rd2, button('Invertir', () => {
      s().invert = !s().invert;
      app.spectral.invert = s().invert;
    }, { active: () => s().invert }));
    add(rd2, button('Audio', async () => {
      if (app.audio.ctx?.state === 'running') app.audio.stop();
      else await app.audio.start();
    }, { active: () => app.audio.ctx?.state === 'running', title: 'Sonido Doppler' }));

    // aguja
    const cNd = sec('Aguja');
    labeled(cNd, 'Calibre', selectBox([['17', '17G'], ['16', '16G'], ['15', '15G'], ['14', '14G']], () => String(app.needle.gauge) as '15', (v) => {
      app.needle.gauge = parseInt(v);
      app.scene.resetNeedles();
    }));
    labeled(cNd, 'Longitud', selectBox([['25', '25 mm'], ['32', '32 mm']], () => String(app.needle.length) as '25', (v) => (app.needle.length = parseInt(v))));
    const rn = btnRow(cNd);
    add(rn, button('Tocar la piel…', () => {
      app.placingNeedle = !app.placingNeedle;
      if (app.placingNeedle) {
        if (!app.needleMode()) app.setMode('cannulate');
        this.openSheet(null);
        if (this.pipOff) this.paneAction('show');
        app.toast('Toca la piel del brazo en 3D para elegir el punto de punción', 'info');
      }
    }, { active: () => app.placingNeedle, title: 'Elegir el punto de punción tocando la piel' }));
    add(rn, button('Invertir dirección', () => {
      const n = app.needle;
      if (n.placed && n.depth > 0) {
        app.toast('Retira la aguja de la piel para invertir su dirección', 'warn');
        return;
      }
      n.heading = n.heading > 0 ? n.heading - 180 : n.heading + 180;
    }, { title: 'Anterógrada / retrógrada, con la aguja fuera de la piel' }));
    add(rn, button('Realce', () => (s().needleEnhance = !s().needleEnhance), { active: () => s().needleEnhance }));

    // vista 3D
    const c3 = sec('Vista 3D');
    const skin = orig<HTMLInputElement>('optSkin');
    add(c3, field('Piel', () => parseFloat(skin.value), (v) => {
      skin.value = String(v);
      fire(skin, 'input');
    }, { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)} %`, title: 'Opacidad de la piel' }));
    labeled(c3, 'Plano', mirrorSelect('optPlane', [['us', 'Ecografía'], ['anat', 'Anatomía'], ['none', 'Oculto']]));
    const r3 = btnRow(c3);
    add(r3, mirrorCheck('optVessels', 'Vasos'));
    add(r3, mirrorCheck('optNerves', 'Nervios'));
    add(r3, mirrorCheck('optBones', 'Huesos'));
    add(r3, mirrorCheck('optTendons', 'Tendones'));
    add(r3, mirrorCheck('optMuscle', 'Músculo'));
    add(r3, mirrorCheck('optFlow', 'Flujo'));
    add(r3, mirrorCheck('optFollow', 'Seguir sonda'));
    add(r3, button('Sala', () => (app.scene.roomVisible = !app.scene.roomVisible), { active: () => app.scene.roomVisible, title: 'Mostrar la sala y el paciente (más lento)' }));
    const rc = btnRow(c3);
    for (const [preset, name] of CAMERAS) add(rc, button(name[0].toUpperCase() + name.slice(1), () => app.scene.setPreset(preset)));

    // sesión
    const cSes = sec('Sesión');
    const rs = btnRow(cSes);
    const closeThen = (f: () => void) => () => {
      this.openSheet(null);
      f();
    };
    add(rs, button('Informe', closeThen(() => app.panels.showReport())));
    add(rs, button('Ayuda', closeThen(() => app.panels.showHelp())));
    add(rs, button('Bienvenida', closeThen(() => app.panels.showWelcome(true))));
    // en el móvil la barra superior no muestra el enlace de apoyo
    rs.appendChild(el('a', { class: 'm-kofi', href: SITE.kofi, target: '_blank', rel: 'noopener' }, 'Apoyar en Ko-fi'));
    this.installRow = btnRow(cSes);
    add(this.installRow, button('Instalar en el móvil', async () => {
      if (await installApp()) app.toast('Aplicación instalada: ábrela desde la pantalla de inicio', 'ok');
      this.installRow.classList.add('hidden');
    }, { cls: 'primary' }));
    const desk = new URL(location.href);
    desk.searchParams.set('movil', '0');
    cSes.appendChild(el('p', { class: 'muted m-note' }, `La <b>sala y ergonomía</b>, la sección anatómica aparte y el TGC por bandas están en la <a href="${desk.search}">versión de escritorio</a>.`));
  }
}
