/**
 * Aplicación instalable (PWA): service worker para usarla sin conexión y aviso de instalación
 * («Añadir a pantalla de inicio»), que la abre a pantalla completa sin las barras del navegador.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // se guarda para ofrecerlo desde «Más» en lugar del aviso automático del navegador
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => (deferred = null));
  // sólo en la versión publicada: en desarrollo la caché serviría módulos antiguos
  if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* p. ej. dentro de un marco: la aplicación funciona igual, sin caché */
      });
    });
  }
}

/** El navegador ofrece instalar la aplicación (Chrome/Edge en Android y escritorio). */
export function canInstall(): boolean {
  return deferred !== null;
}

export async function installApp(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  return (await ev.userChoice).outcome === 'accepted';
}

/** Abierta desde la pantalla de inicio. */
export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
