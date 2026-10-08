/**
 * Cambio de idioma entre la versión española (/) y la inglesa (/en/).
 * El enlace ES/EN de la barra superior conserva la vista (?caso=, ?modo=…) y, la primera vez,
 * se sugiere la otra versión si el navegador está configurado en otro idioma.
 */
import { LANG, OTHER_LANG, otherLangUrl } from '../i18n';

const SUGGESTED_KEY = 'fistulab-idioma-sugerido';

/** Los enlaces `[data-lang-switch]` del HTML apuntan a la misma vista en el otro idioma. */
export function setupLangLinks() {
  document.querySelectorAll<HTMLAnchorElement>('a[data-lang-switch]').forEach((a) => (a.href = otherLangUrl()));
}

/**
 * Aviso discreto, una sola vez por navegador: en la versión española si el navegador no tiene el español
 * entre sus idiomas, y en la inglesa si su idioma principal es el español. Va escrito en el otro idioma.
 */
export function suggestOtherLanguage(container: HTMLElement) {
  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language ?? '']).map((l) => l.toLowerCase());
  const wants = LANG === 'es' ? !langs.some((l) => l.startsWith('es')) : langs[0]?.startsWith('es');
  if (!wants) return;
  try {
    if (localStorage.getItem(SUGGESTED_KEY)) return;
    localStorage.setItem(SUGGESTED_KEY, '1');
  } catch {
    return; // sin almacenamiento se repetiría en cada visita
  }
  const d = document.createElement('div');
  d.className = 'toast lang-hint';
  d.lang = OTHER_LANG.code;
  const [msg, action] = LANG === 'es' ? ['Fistulab is also available in English.', 'Switch to English'] : ['Fistulab también está en español.', 'Ver en español'];
  d.innerHTML = `<span>${msg}</span> <a href="${otherLangUrl()}" hreflang="${OTHER_LANG.code}">${action}</a><button type="button" aria-label="${LANG === 'es' ? 'Close' : 'Cerrar'}">✕</button>`;
  d.querySelector('button')!.addEventListener('click', () => d.remove());
  afterModal(() => {
    container.appendChild(d);
    setTimeout(() => d.remove(), 15000);
  });
}

/** Espera a que se cierre la ventana abierta (la bienvenida de la primera visita), que taparía el aviso. */
function afterModal(fn: () => void) {
  const modal = document.getElementById('modal');
  if (!modal || modal.classList.contains('hidden')) return fn();
  const obs = new MutationObserver(() => {
    if (!modal.classList.contains('hidden')) return;
    obs.disconnect();
    fn();
  });
  obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
}
