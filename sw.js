// Offline cache: every app file is cached on install, then served cache-first.
const VERSION = 'vigil-win-v1.1.0';
const FILES = [
  './', 'index.html', 'privacy.html', 'styles.css', 'manifest.webmanifest', 'js/app.js', 'js/faces.js', 'js/pro.js',
  'fonts/orbitron.ttf', 'fonts/bebasneue.ttf', 'fonts/playfair.ttf', 'fonts/comfortaa.ttf', 'fonts/spacemono.ttf',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
