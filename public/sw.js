/*
 * Service worker: permite abrir el simulador sin conexión tras la primera visita.
 * - Páginas (/ en español y /en/ en inglés): primero la red (para recibir versiones nuevas) y, sin conexión, la copia guardada.
 * - Recursos con huella en el nombre (assets/…): primero la caché; nunca cambian.
 * - Resto (iconos, manifiestos): la copia guardada al momento y se actualiza en segundo plano.
 * Las tipografías van dentro de assets/: todo es del propio sitio.
 */
const CACHE = 'fistulab-v2';
const PAGES = ['./', './en/'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([...PAGES, './manifest.webmanifest', './en/manifest.webmanifest']).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (req, res) => {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // sólo las páginas del simulador (con cualquier parámetro: ?caso=, ?modo=…), cada idioma con su copia
    const m = url.pathname.match(/\/(en\/)?(index\.html)?$/);
    if (!m) return;
    const page = m[1] ? './en/' : './';
    e.respondWith(
      fetch(req)
        .then((res) => put(page, res))
        .catch(() => caches.match(page).then((r) => r || caches.match(req))),
    );
    return;
  }
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => put(req, res))
        .catch(() => hit);
      return hit || net;
    }),
  );
});
