const CACHE_NAME = 'damika-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/engine/rules.js',
  './js/render/board.js',
  './js/pdn/parser.js',
  './js/pdn/loader.js',
  './js/pdn/serializer.js',
  './js/pdn/storage.js',
  './js/library-view.js',
  './js/photo-match.js',
  './js/position-editor.js',
  // IA : analyse (Worker) et moteurs V0 / V1b / V2b ; modèles appris (data/models/ = copies de training/models/)
  './js/ai/analysis-controller.js',
  './js/ai/analysis-format.js',
  './js/ai/engines.js',
  './js/ai/eval-learned.js',
  './js/ai/eval-patterns.js',
  './js/ai/eval.js',
  './js/ai/fastboard.js',
  './js/ai/search.js',
  './js/ai/worker.js',
  './data/models/v1b-l0.json',
  './data/models/p17-B-l025.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => cached);
    })
  );
});
