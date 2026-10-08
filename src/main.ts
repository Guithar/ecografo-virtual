// Fuentes alojadas en el propio sitio: sin peticiones a Google Fonts (privacidad).
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './styles.css';
import './mobile.css';
import { App } from './app/App';
import { setupPwa } from './pwa';
import { tr } from './i18n';
import { setupLangLinks, suggestOtherLanguage } from './ui/lang';

setupPwa();
setupLangLinks();

async function main() {
  const loading = document.getElementById('loading')!;
  const txt = document.getElementById('loadingText')!;
  try {
    const test = document.createElement('canvas').getContext('webgl2');
    if (!test) throw new Error(tr('Este navegador no admite WebGL2. Usa una versión reciente de Chrome, Edge, Firefox o Safari.', 'This browser does not support WebGL2. Use a recent version of Chrome, Edge, Firefox or Safari.'));
    txt.textContent = tr('Generando anatomía y paciente…', 'Generating anatomy and patient…');
    await new Promise((r) => setTimeout(r, 30));
    const app = new App();
    (window as unknown as { app: App }).app = app;
    await app.init();
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 600);
    suggestOtherLanguage(document.getElementById('toasts')!);
  } catch (e) {
    console.error(e);
    txt.innerHTML = `<b>${tr('No se pudo iniciar el simulador.', 'The simulator could not start.')}</b><br>${(e as Error).message}`;
  }
}
main();
