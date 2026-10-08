/**
 * Idioma de la interfaz: español (/) o inglés (/en/).
 * Cada idioma tiene su propia página, con su título, descripción y enlaces hreflang para los buscadores,
 * así que el idioma se fija al cargar según <html lang> y no cambia en caliente: los textos de los módulos
 * (casos, lecciones, nombres de estructuras) se resuelven una vez al importarlos.
 */
export type Lang = 'es' | 'en';

export const LANG: Lang = typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'es';

/** Texto en el idioma de la página: `tr('Sonda', 'Probe')`. Admite `{{escritorio|táctil}}` dentro (ver `deviceText`). */
export function tr(es: string, en: string): string {
  return LANG === 'en' ? en : es;
}

/** Configuración regional de fechas y horas: en inglés, la del navegador si es inglesa (en-GB, en-US…). */
export const LOCALE: string =
  LANG === 'es' ? 'es-ES' : typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language ?? '') ? navigator.language : 'en-US';

/**
 * Dirección de la misma vista en el otro idioma, con sus parámetros (?caso=, ?modo=…).
 * Fuera de fistulab.com (archivo local autocontenido) apunta al sitio publicado.
 */
export function otherLangUrl(site = 'https://fistulab.com/'): string {
  const rest = location.search + location.hash;
  if (location.protocol === 'file:') return (LANG === 'en' ? site : `${site}en/`) + rest;
  return (LANG === 'en' ? '../' : 'en/') + rest;
}

/** Nombre del otro idioma, escrito en ese idioma, para el selector. */
export const OTHER_LANG = LANG === 'en' ? { code: 'es' as Lang, label: 'ES', name: 'Español' } : { code: 'en' as Lang, label: 'EN', name: 'English' };
