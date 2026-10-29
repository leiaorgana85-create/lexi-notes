// App version: v1.01
const CACHE='lexi-notes-standalone-shell-v38';
const SHELL=['./lifecycle-diagnostics.js?v=1','./','./index.html','./styles.css?v=3','./ui-fixes.css?v=3','./backend-auth-recovery.js?v=1','./write-transport.js?v=2','./sync-guard.js?v=4','./app.js?v=12','./list-position.js?v=2','./ui-fixes.js?v=2','./gestures.js?v=3','./manifest.webmanifest?v=1'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(path => new Request(new URL(path, self.location.href), { cache: 'reload' })))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lexi-notes-standalone-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL('./', self.location.href);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Use this complete installed shell immediately, even on a stalled network.
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    try {
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      if (response.ok || request.mode !== 'navigate') return response;
    } catch (error) {
      if (request.mode !== 'navigate') return Response.error();
    }
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    return Response.error();
  })());
});
