/**
 * Tipo de dispositivo: interfaz compacta (móvil) y equipos de baja potencia.
 */

/** Pantallas en las que se usa la interfaz móvil: estrechas, bajas (móvil en horizontal) o táctiles medianas. */
export const COMPACT_QUERY = '(max-width: 860px), (max-height: 500px), (pointer: coarse) and (max-width: 1100px)';

/** `?movil=1` fuerza la interfaz móvil y `?movil=0` la de escritorio; si no, se decide por el tamaño de la pantalla. */
export function forcedCompact(search = location.search): boolean | null {
  const v = new URLSearchParams(search).get('movil');
  if (v === null) return null;
  return v !== '0' && v !== 'no' && v !== 'false';
}

export function wantsCompact(): boolean {
  return forcedCompact() ?? matchMedia(COMPACT_QUERY).matches;
}

/** Móviles y tabletas: menos resolución, sin sombras ni sala y 30 fotogramas por segundo. */
export function isLowPower(): boolean {
  if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) return true;
  // iPadOS se presenta como Mac de escritorio: se reconoce por la pantalla táctil sin puntero fino
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
}

/**
 * Textos que dependen del dispositivo: `{{texto de escritorio|texto táctil}}`.
 * Así una lección dice «tecla 1» en el ordenador y «botón Transv.» en el móvil.
 */
export function deviceText(s: string, touch: boolean): string {
  return s.replace(/\{\{([^{}|]*)\|([^{}]*)\}\}/g, (_m, desk: string, tch: string) => (touch ? tch : desk));
}
