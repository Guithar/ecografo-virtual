import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// `npm run build`        -> dist/ (sitio estático: https://fistulab.com en español y https://fistulab.com/en/ en inglés, en GitHub Pages)
// `npm run build:single` -> dist-single/index.html autocontenido, en español (abre con doble clic, sin servidor)
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    // una página por idioma (mismo código; el idioma sale de <html lang>)
    rolldownOptions: mode === 'single' ? {} : { input: { main: 'index.html', en: 'en/index.html' } },
  },
}));
