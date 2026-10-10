import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';
import { ALL_PAGES, SITE_ORIGIN } from './src/guides/pages';

/** sitemap.xml con todas las páginas y sus versiones en el otro idioma (hreflang), a partir de src/guides/pages.ts. */
function sitemap(): Plugin {
  return {
    name: 'fistulab-sitemap',
    apply: 'build',
    generateBundle() {
      const alt = (p: { es: string; en: string }) =>
        [`es" href="${SITE_ORIGIN}${p.es}`, `en" href="${SITE_ORIGIN}${p.en}`, `x-default" href="${SITE_ORIGIN}${p.es}`]
          .map((a) => `    <xhtml:link rel="alternate" hreflang="${a}" />`)
          .join('\n');
      const urls = ALL_PAGES.flatMap((p) => [p.es, p.en].map((loc) => `  <url>\n    <loc>${SITE_ORIGIN}${loc}</loc>\n${alt(p)}\n  </url>`));
      const source = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source });
    },
  };
}

// `npm run build`        -> dist/ (sitio estático en GitHub Pages: simulador en español (/) e inglés (/en/) y guías)
// `npm run build:single` -> dist-single/index.html autocontenido, en español (abre con doble clic, sin servidor)
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [sitemap()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    // una página por idioma y por guía (el simulador es el mismo código; el idioma sale de <html lang>)
    rolldownOptions:
      mode === 'single' ? {} : { input: Object.fromEntries(ALL_PAGES.flatMap((p) => [p.es, p.en]).map((path) => [path.replace(/\/$/, '').replace(/\//g, '-') || 'main', `${path}index.html`])) },
  },
}));
