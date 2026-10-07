/**
 * Datos públicos del sitio: nombre, dominio, apoyo (Ko-fi) y código fuente.
 * La versión y la fecha las inyecta Vite al compilar (vite.config.ts); el commit, el flujo de publicación (VITE_COMMIT).
 */
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const SITE = {
  name: 'Fistulab',
  tagline: 'Punción ecoguiada de la FAV',
  url: 'https://fistulab.com/',
  host: 'fistulab.com',
  kofi: 'https://ko-fi.com/fistulab',
  repo: 'https://github.com/Guithar/ecografo-virtual',
  docs: 'https://github.com/Guithar/ecografo-virtual/blob/main/docs/',
} as const;

export const BUILD = {
  version: __APP_VERSION__,
  date: __BUILD_DATE__,
  commit: String(import.meta.env.VITE_COMMIT ?? '').slice(0, 7),
};
