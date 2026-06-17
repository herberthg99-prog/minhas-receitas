// Service Worker v32 — autodestruição do cache antigo
const CACHE = 'receitas-v32';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() => {
       // Forçar reload em todos os clientes
       return self.clients.matchAll({type:'window'});
     }).then(clients => {
       clients.forEach(c => c.navigate(c.url));
     })
  );
});

// Não cachear nada — sempre buscar da rede
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co') || e.request.url.includes('anthropic.com')) return;
  e.respondWith(fetch(e.request));
});
