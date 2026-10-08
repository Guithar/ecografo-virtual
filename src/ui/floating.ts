/**
 * Ventana flotante: una vista (monitor o 3D) ocupa la zona principal y la otra flota encima, en una
 * esquina. Coloca la flotante, recorta la grande bajo ella (sus textos y su espectrograma no se
 * transparentan, porque todas las vistas se dibujan en un único lienzo por debajo del HTML), indica al
 * monitor de dónde apartar la imagen y decide qué vista se dibuja encima. La usan la interfaz móvil (en
 * vertical) y el modo enfoque de escritorio.
 */
import type { App } from '../app/App';
import { Box, Corner, FLOAT_GAP, floatRect, FloatSize, nearestCorner } from './layoutMath';

export type ViewId = 'us' | '3d';

export interface FloatConfig {
  /** vista grande */
  main: ViewId;
  /** la flotante está oculta (sólo se ve la grande) */
  hidden: boolean;
  corner: Corner;
  size: FloatSize;
}

const other = (v: ViewId): ViewId => (v === 'us' ? '3d' : 'us');
const box = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });
const STYLE_KEYS = ['position', 'left', 'top', 'width', 'height', 'margin', 'clipPath'] as const;

export class FloatingView {
  private cfg: FloatConfig | null = null;
  private sig = '';
  private zone: Box = { x: 0, y: 0, w: 1, h: 1 };
  private rect: Box = { x: 0, y: 0, w: 1, h: 1 };
  /** posición durante un arrastre (px de la ventana del navegador) */
  private dragPos: { x: number; y: number } | null = null;

  constructor(private app: App) {}

  pane(v: ViewId): HTMLElement {
    return document.getElementById(v === 'us' ? 'paneMonitor' : 'pane3d')!;
  }

  set(cfg: FloatConfig | null) {
    this.cfg = cfg;
    this.sig = '';
    this.update();
  }

  /** Vista que se dibuja encima de la otra (la flotante) o null si no hay ninguna. */
  top(): ViewId | null {
    const c = this.cfg;
    return c && !c.hidden ? other(c.main) : null;
  }

  /** Recalcula la colocación (cambios de tamaño, del espectrograma, de la barra de lección…). */
  update() {
    const c = this.cfg;
    const mon = this.app.monitor;
    if (!c) {
      if (this.sig !== 'off') {
        this.sig = 'off';
        for (const v of ['us', '3d'] as ViewId[]) this.reset(this.pane(v));
        mon.avoid = null;
      }
      return;
    }
    const main = this.pane(c.main);
    const fl = this.pane(other(c.main));
    if (c.hidden) {
      if (this.sig !== `hidden|${c.main}`) {
        this.sig = `hidden|${c.main}`;
        this.reset(main);
        this.reset(fl);
        fl.classList.add('pip-hidden');
        mon.avoid = null;
      }
      return;
    }
    // la flotante vive dentro de la imagen del monitor (sin tapar espectrograma ni lecturas) o del 3D
    const app = document.getElementById('app')!.getBoundingClientRect();
    const m = main.getBoundingClientRect();
    this.zone = box((c.main === 'us' ? mon.view : main).getBoundingClientRect());
    const r = floatRect(this.zone, c.corner, c.size, this.dragPos);
    this.rect = r;
    const sig = [c.main, r.x, r.y, r.w, r.h, m.left, m.top, m.width, m.height, app.left, app.top].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    this.reset(main);
    fl.classList.remove('pip-hidden');
    fl.classList.add('pip-float');
    Object.assign(fl.style, { position: 'absolute', margin: '0', left: `${r.x - app.left}px`, top: `${r.y - app.top}px`, width: `${r.w}px`, height: `${r.h}px` });
    // el bloque contenedor no es siempre #app (en una rejilla, un elemento absoluto con área asignada
    // se coloca respecto a esa área): se corrige con la posición real
    const real = fl.getBoundingClientRect();
    const dx = r.x - real.left;
    const dy = r.y - real.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) Object.assign(fl.style, { left: `${r.x - app.left + dx}px`, top: `${r.y - app.top + dy}px` });
    // agujero en la vista grande con la forma de la flotante
    const x0 = Math.max(0, r.x - m.left);
    const y0 = Math.max(0, r.y - m.top);
    const x1 = Math.min(m.width, r.x + r.w - m.left);
    const y1 = Math.min(m.height, r.y + r.h - m.top);
    main.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x0}px ${y0}px, ${x0}px ${y1}px, ${x1}px ${y1}px, ${x1}px ${y0}px, ${x0}px ${y0}px)`;
    // mientras se arrastra, la imagen se queda quieta; se aparta al soltar
    if (!this.dragPos) mon.avoid = c.main === 'us' ? { x: r.x - this.zone.x - FLOAT_GAP, y: r.y - this.zone.y - FLOAT_GAP, w: r.w + 2 * FLOAT_GAP, h: r.h + 2 * FLOAT_GAP } : null;
  }

  /** Arrastre de la ventana: `x`, `y` es su esquina superior izquierda deseada. */
  dragTo(x: number, y: number) {
    this.dragPos = { x, y };
    this.update();
  }

  /** Fin del arrastre: devuelve la esquina en la que encaja. */
  endDrag(): Corner {
    const corner = nearestCorner(this.zone, this.rect);
    this.dragPos = null;
    this.sig = '';
    return corner;
  }

  /** Rectángulo actual de la ventana flotante (px del navegador). */
  floatBox(): Box {
    return this.rect;
  }

  private reset(el: HTMLElement) {
    el.classList.remove('pip-float', 'pip-hidden');
    for (const k of STYLE_KEYS) el.style[k] = '';
  }
}
