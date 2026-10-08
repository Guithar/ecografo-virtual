/**
 * Geometría de la disposición en pantalla (funciones puras): la ventana flotante en su esquina y el encaje
 * de la imagen ecográfica para que no quede debajo de ella.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export interface FloatSize {
  /** anchura como fracción de la zona */
  w: number;
  /** altura como fracción de la zona; si no se da, se usa la proporción alto/ancho */
  h?: number;
  aspect?: number;
}

/** Separación entre la ventana flotante y el borde de la zona. */
export const FLOAT_GAP = 8;

/** Rectángulo de la ventana flotante dentro de la zona `box`, en su esquina o donde se arrastra. */
export function floatRect(box: Box, corner: Corner, size: FloatSize, drag: { x: number; y: number } | null = null): Box {
  let w = size.w * box.w;
  let h = size.h !== undefined ? size.h * box.h : w * (size.aspect ?? 0.62);
  const hMax = box.h * 0.62;
  if (h > hMax) {
    if (size.h === undefined) w = hMax / (size.aspect ?? 0.62);
    h = hMax;
  }
  w = Math.max(Math.min(w, box.w - 2 * FLOAT_GAP), Math.min(100, box.w));
  h = Math.max(Math.min(h, box.h - 2 * FLOAT_GAP), Math.min(70, box.h));
  let x = corner[1] === 'l' ? box.x + FLOAT_GAP : box.x + box.w - FLOAT_GAP - w;
  let y = corner[0] === 't' ? box.y + FLOAT_GAP : box.y + box.h - FLOAT_GAP - h;
  if (drag) {
    x = Math.max(box.x, Math.min(box.x + box.w - w, drag.x));
    y = Math.max(box.y, Math.min(box.y + box.h - h, drag.y));
  }
  return { x, y, w, h };
}

/** Esquina más cercana al centro de la ventana (al soltarla tras arrastrarla). */
export function nearestCorner(box: Box, r: Box): Corner {
  const v = r.y + r.h / 2 < box.y + box.h / 2 ? 't' : 'b';
  const h = r.x + r.w / 2 < box.x + box.w / 2 ? 'l' : 'r';
  return `${v}${h}` as Corner;
}

export interface ImageFit {
  /** px por mm */
  s: number;
  x: number;
  y: number;
}

/**
 * Coloca una imagen de W × D mm en una vista de vw × vh px con márgenes. Si cae sobre `avoid` (la ventana
 * flotante), prueba a desplazarla al lado libre o por encima/debajo, y lo acepta si conserva al menos el
 * 75 % del tamaño. `padL` y `padR` son la barra de color y la escala de profundidad, que también se apartan.
 */
export function fitImage(
  vw: number,
  vh: number,
  W: number,
  D: number,
  m: { l: number; r: number; t: number; b: number },
  avoid: Box | null,
  padL: number,
  padR: number,
): ImageFit {
  const fit = (x0: number, x1: number, y0: number, y1: number): ImageFit => {
    const s = Math.max(0.5, Math.min((x1 - x0) / W, (y1 - y0) / D));
    return { s, x: x0 + Math.max(0, (x1 - x0 - W * s) / 2), y: y0 };
  };
  const base = fit(m.l, vw - m.r, m.t, vh - m.b);
  const A = avoid;
  if (!A) return base;
  const hits = (f: ImageFit) => f.x - padL < A.x + A.w && f.x + W * f.s + padR > A.x && f.y < A.y + A.h && f.y + D * f.s > A.y;
  if (!hits(base)) return base;
  const right = A.x + A.w / 2 > vw / 2;
  const bottom = A.y + A.h / 2 > vh / 2;
  const alts = [
    right ? fit(m.l, A.x - padR, m.t, vh - m.b) : fit(A.x + A.w + padL, vw - m.r, m.t, vh - m.b),
    bottom ? fit(m.l, vw - m.r, m.t, A.y) : fit(m.l, vw - m.r, A.y + A.h, vh - m.b),
  ]
    .filter((f) => !hits(f))
    .sort((a, b) => b.s - a.s);
  return alts.length && alts[0].s >= 0.75 * base.s ? alts[0] : base;
}
