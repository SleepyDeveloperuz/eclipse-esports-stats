/* Only the public offline shell is cached. Never cache team pages or API data. */
const CACHE = 'eclipse-pwa-shell-2.30.0';
const SHELL = [
  '/offline.html', '/css/pwa.css?v=2.30.0', '/js/offline.js?v=2.30.0',
  '/assets/eclipse-app-192.png', '/assets/eclipse-app-512.png', '/assets/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  // Wait for old tabs to close. Never interrupt an in-progress match upload.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('eclipse-pwa-shell-') && key !== CACHE)
    .map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization') ||
      url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await caches.open(CACHE).then(cache => cache.match('/offline.html'));
      return cached || new Response('Internet aloqasi yo‘q. Ulanib, qayta oching.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }));
    return;
  }
  if (SHELL.includes(url.pathname + url.search)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request)));
  }
});
