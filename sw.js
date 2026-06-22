// Service Worker v33 — sem cache, sem auto-navegação (evita travamentos)
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Não cachear nada — sempre buscar da rede
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co') || e.request.url.includes('anthropic.com')) return;
  e.respondWith(fetch(e.request));
});
