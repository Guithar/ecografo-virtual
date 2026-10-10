/**
 * Páginas del sitio y sus traducciones: de aquí salen las entradas de la compilación (vite.config.ts),
 * el sitemap y las comprobaciones de las pruebas (hreflang, enlaces y metadatos).
 * Rutas relativas a la raíz del sitio, terminadas en «/»; cada página es <ruta>index.html.
 */
export interface PagePair {
  es: string;
  en: string;
}

/** Simulador. */
export const APP_PAGES: PagePair = { es: '', en: 'en/' };

/** Índice de guías. */
export const GUIDE_INDEX: PagePair = { es: 'guias/', en: 'en/guides/' };

/** Guías de punción y ecografía de la FAV (en el orden en que aparecen en el índice). */
export const GUIDES: PagePair[] = [
  { es: 'guias/tecnica-puncion-fav/', en: 'en/guides/avf-cannulation-technique/' },
  { es: 'guias/puncion-ecoguiada-fav/', en: 'en/guides/ultrasound-guided-fistula-cannulation/' },
  { es: 'guias/angulo-agujas-puncion-fav/', en: 'en/guides/avf-needle-angle-and-gauge/' },
  { es: 'guias/regla-de-los-6-maduracion-fav/', en: 'en/guides/rule-of-6s-fistula-maturation/' },
  { es: 'guias/ecografia-doppler-fav/', en: 'en/guides/av-fistula-doppler-ultrasound/' },
  { es: 'guias/puncion-escalera-area-ojal/', en: 'en/guides/rope-ladder-buttonhole-cannulation/' },
  { es: 'guias/infiltracion-fav/', en: 'en/guides/fistula-infiltration/' },
  { es: 'guias/aneurisma-fav/', en: 'en/guides/av-fistula-aneurysm/' },
];

export const ALL_PAGES: PagePair[] = [APP_PAGES, GUIDE_INDEX, ...GUIDES];

export const SITE_ORIGIN = 'https://fistulab.com/';
