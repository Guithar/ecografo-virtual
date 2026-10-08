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

setupPwa();

async function main() {
  const loading = document.getElementById('loading')!;
  const txt = document.getElementById('loadingText')!;
  try {
    const test = document.createElement('canvas').getContext('webgl2');
    if (!test) throw new Error('Este navegador no admite WebGL2. Usa una versión reciente de Chrome, Edge, Firefox o Safari.');
    txt.textContent = 'Generando anatomía y paciente…';
    await new Promise((r) => setTimeout(r, 30));
    const app = new App();
    (window as unknown as { app: App }).app = app;
    await app.init();
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 600);
  } catch (e) {
    console.error(e);
    txt.innerHTML = `<b>No se pudo iniciar el simulador.</b><br>${(e as Error).message}`;
  }
}
main();
