const CACHE = 'workout-logger-v2';
const ASSETS = [
  './', './index.html', './styles.css',
  './src/main.js', './src/ui.js', './src/store.js',
  './src/storage.js', './src/history.js', './src/timer.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
