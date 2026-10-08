/**
 * Modo enfoque (escritorio): una vista grande —el monitor o, en la sala, el 3D— y la otra en una ventana
 * flotante que se arrastra a cualquier esquina, cambia de tamaño, se intercambia o se oculta. La sección
 * anatómica y las pestañas pasan a una columna lateral plegable. Se activa con el botón «Enfoque» o la
 * tecla O y se recuerda para cada modo (por defecto, en Punción).
 */
import type { App, AppMode } from '../app/App';
import type { CameraPreset } from '../scene/SceneManager';
import type { ViewId } from './floating';
import type { Corner } from './layoutMath';
import { el } from './controls';

type Size = 's' | 'm' | 'l';

export interface FocusPrefs {
  byMode: Record<AppMode, boolean>;
  mainByMode: Record<AppMode, ViewId>;
  corner: Corner;
  size: Size;
  hidden: boolean;
  /** columna lateral (anatomía y pestañas) desplegada */
  side: boolean;
}

const KEY = 'ecofav-enfoque';
/** anchura de la ventana flotante (fracción de la vista grande) */
const SIZES: Record<Size, number> = { s: 0.24, m: 0.32, l: 0.42 };
const SIZE_NAMES: Record<Size, string> = { s: 'pequeña', m: 'mediana', l: 'grande' };
const CAMERAS: [CameraPreset, string][] = [
  ['procedimiento', 'procedimiento'],
  ['superior', 'superior'],
  ['lateral', 'lateral'],
  ['corte', 'perpendicular al corte'],
  ['operador', 'del operador'],
  ['sala', 'de la sala'],
];

export function defaultFocusPrefs(): FocusPrefs {
  return {
    byMode: { explore: false, cannulate: true, learn: false, room: false },
    mainByMode: { explore: 'us', cannulate: 'us', learn: 'us', room: '3d' },
    corner: 'br',
    size: 'm',
    hidden: false,
    side: true,
  };
}

/** Preferencias guardadas, completadas con los valores por defecto (y descartando valores no válidos). */
export function loadFocusPrefs(raw: string | null): FocusPrefs {
  const d = defaultFocusPrefs();
  let p: Partial<FocusPrefs> = {};
  try {
    p = raw ? JSON.parse(raw) : {};
  } catch {
    p = {};
  }
  if (!p || typeof p !== 'object') return d;
  const modes = Object.keys(d.byMode) as AppMode[];
  for (const m of modes) {
    if (typeof p.byMode?.[m] === 'boolean') d.byMode[m] = p.byMode[m];
    const v = p.mainByMode?.[m];
    if (v === 'us' || v === '3d') d.mainByMode[m] = v;
  }
  if (p.corner && ['tl', 'tr', 'bl', 'br'].includes(p.corner)) d.corner = p.corner;
  if (p.size && p.size in SIZES) d.size = p.size;
  if (typeof p.hidden === 'boolean') d.hidden = p.hidden;
  if (typeof p.side === 'boolean') d.side = p.side;
  return d;
}

export class FocusMode {
  on = false;
  prefs: FocusPrefs;
  /** `?vista=enfoque` o `?vista=cuadricula` fijan la disposición en todos los modos (hasta pulsar O) */
  private forced: boolean | null;
  private camIdx = 0;
  private btn: HTMLElement;

  constructor(private app: App) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      /* sin almacenamiento */
    }
    this.prefs = loadFocusPrefs(raw);
    const v = new URLSearchParams(location.search).get('vista');
    this.forced = v === 'enfoque' ? true : v === 'cuadricula' || v === 'cuadrícula' ? false : null;
    this.btn = document.getElementById('btnFocus')!;
    this.btn.addEventListener('click', () => {
      this.toggle();
      this.btn.blur();
    });
    this.build();
  }

  /** Vista grande en el modo actual. */
  get main(): ViewId {
    return this.prefs.mainByMode[this.app.mode];
  }

  toggle() {
    if (this.app.touchUI) return;
    const next = !this.on;
    this.forced = null;
    this.prefs.byMode[this.app.mode] = next;
    this.save();
    this.refresh();
    this.app.toast(next ? 'Modo enfoque: vista grande y ventana flotante (O para volver a la cuadrícula)' : 'Vista en cuadrícula', 'info');
  }

  /** Aplica la disposición del modo actual (también al cambiar de modo o entre móvil y escritorio). */
  refresh() {
    const app = this.app;
    const p = this.prefs;
    const on = !app.touchUI && (this.forced ?? p.byMode[app.mode]);
    const wasOn = this.on;
    this.on = on;
    const b = document.body.classList;
    b.toggle('focus', on);
    b.toggle('f-main-us', on && this.main === 'us');
    b.toggle('f-main-3d', on && this.main === '3d');
    b.toggle('f-pipoff', on && p.hidden);
    b.toggle('f-side-off', on && !p.side);
    this.btn.classList.toggle('on', on);
    this.btn.setAttribute('aria-pressed', String(on));
    if (app.touchUI) return; // en el móvil la ventana flotante la gestiona MobileUI
    if (on) {
      document.getElementById('grid')!.classList.remove('max-3d', 'max-us', 'max-anat');
      app.pip.set({ main: this.main, hidden: p.hidden, corner: p.corner, size: { w: SIZES[p.size], aspect: this.main === 'us' ? 0.62 : 0.85 } });
    } else {
      app.pip.set(null);
      if (wasOn) app.monitor.flags.hint = '';
    }
    app.placeToasts();
  }

  /** 5 Hz: con el 3D en la ventana flotante, la sonda y la aguja se resumen bajo la imagen. */
  update() {
    if (!this.on) return;
    this.app.monitor.flags.hint = this.main === 'us' ? this.app.statusLine() : '';
  }

  /** Tras evaluar una punción se despliega la columna con el resultado. */
  onEvaluated() {
    if (this.on && !this.prefs.side) this.setPref({ side: true });
  }

  private setPref(p: Partial<FocusPrefs>) {
    Object.assign(this.prefs, p);
    this.save();
    this.refresh();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {
      /* sin almacenamiento */
    }
  }

  // ------------------------------------------------------------------------------------------
  // Controles
  // ------------------------------------------------------------------------------------------
  private build() {
    const panes: [ViewId, HTMLElement][] = [
      ['us', document.getElementById('paneMonitor')!],
      ['3d', document.getElementById('pane3d')!],
    ];
    for (const [id, pane] of panes) {
      // barra de la ventana flotante
      const bar = el('div', { class: 'f-ctl' });
      const btn = (f: string, label: string, title: string) => {
        const b = el('button', { 'data-f': f, title, 'aria-label': title }, label);
        bar.appendChild(b);
        return b;
      };
      const drag = btn('drag', '⠿', 'Arrastra para mover la ventana a otra esquina');
      btn('swap', '⇄', 'Intercambiar: esta vista en grande');
      if (id === '3d') btn('cam', 'Vista', 'Cambiar la cámara (V)');
      btn('size', '◱', 'Tamaño de la ventana');
      btn('hide', '–', 'Ocultar la ventana');
      bar.addEventListener('click', (e) => {
        const f = (e.target as HTMLElement).closest<HTMLElement>('[data-f]')?.dataset.f;
        if (!f || f === 'drag') return;
        e.stopPropagation();
        this.action(f);
      });
      this.bindDrag(drag, pane);
      pane.appendChild(bar);
      // botón para recuperar la ventana oculta, en la vista grande
      const show = el('button', { class: 'f-show', title: 'Mostrar la ventana flotante' }, id === 'us' ? 'Ver 3D' : 'Ver monitor');
      show.addEventListener('click', () => this.setPref({ hidden: false }));
      pane.appendChild(show);
    }
    // columna lateral plegable
    const open = el('button', { class: 'f-side-open', title: 'Mostrar la anatomía y las pestañas' }, '◂<span>Panel</span>');
    open.addEventListener('click', () => this.setPref({ side: true }));
    document.getElementById('grid')!.appendChild(open);
    const close = el('button', { class: 'f-side-close', title: 'Plegar el panel lateral', 'aria-label': 'Plegar el panel lateral' }, '▸');
    close.addEventListener('click', () => this.setPref({ side: false }));
    document.getElementById('tabButtons')!.appendChild(close);
  }

  private action(f: string) {
    const app = this.app;
    const p = this.prefs;
    if (f === 'swap') {
      p.mainByMode[app.mode] = this.main === 'us' ? '3d' : 'us';
      this.setPref({});
    } else if (f === 'hide') {
      this.setPref({ hidden: true });
    } else if (f === 'size') {
      const order: Size[] = ['s', 'm', 'l'];
      const size = order[(order.indexOf(p.size) + 1) % order.length];
      this.setPref({ size });
      app.toast(`Ventana ${SIZE_NAMES[size]}`, 'info');
    } else if (f === 'cam') {
      this.camIdx = (this.camIdx + 1) % CAMERAS.length;
      const [preset, name] = CAMERAS[this.camIdx];
      app.scene.setPreset(preset);
      app.toast(`Vista ${name}`, 'info');
    }
  }

  /** Arrastrar el asa mueve la ventana; al soltarla encaja en la esquina más cercana. */
  private bindDrag(handle: HTMLElement, pane: HTMLElement) {
    const pip = this.app.pip;
    let off: { x: number; y: number } | null = null;
    handle.addEventListener('pointerdown', (e) => {
      if (!pane.classList.contains('pip-float')) return;
      const r = pip.floatBox();
      off = { x: e.clientX - r.x, y: e.clientY - r.y };
      pane.classList.add('dragging');
      e.preventDefault();
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* puntero ya liberado */
      }
    });
    handle.addEventListener('pointermove', (e) => {
      if (off) pip.dragTo(e.clientX - off.x, e.clientY - off.y);
    });
    const end = () => {
      if (!off) return;
      off = null;
      pane.classList.remove('dragging');
      this.setPref({ corner: pip.endDrag() });
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
