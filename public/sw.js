/*
 * Service worker: permite abrir el simulador sin conexión tras la primera visita.
 * - Página: primero la red (para recibir versiones nuevas) y, sin conexión, la copia guardada.
 * - Recursos con huella en el nombre (assets/…): primero la caché; nunca cambian.
 * - Resto (iconos, manifiesto, tipografías): la copia guardada al momento y se actualiza en segundo plano.
 */
const CACHE = 'ecofav-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest']).catch(() => {})));
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
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;

  if (req.mode === 'navigate') {
    // sólo la página del simulador (con cualquier parámetro: ?caso=, ?modo=…)
    if (!/\/(index\.html)?$/.test(url.pathname)) return;
    e.respondWith(
      fetch(req)
        .then((res) => put('./', res))
        .catch(() => caches.match('./').then((r) => r || caches.match(req))),
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
