const CACHE = 'workout-logger-v6';
const ASSETS = [
  './', './index.html', './styles.css',
  './src/main.js', './src/ui.js', './src/store.js',
  './src/storage.js', './src/history.js', './src/timer.js',
  './src/presets.js', './src/calendar.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting(); // 새 SW 바로 활성화(업데이트 즉시 적용)
});
// 옛 버전 캐시 삭제 — 안 지우면 caches.match가 stale 파일 반환
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
