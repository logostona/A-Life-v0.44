/* BUMP THIS ON EVERY DEPLOY — it is what actually ships an update.
 *
 * The fetch handler below is cache-first (`return cached || network`), and the
 * activate handler only deletes caches whose name differs from this constant.
 * So if the name does not change, an already-installed PWA serves the OLD
 * bundle from cache on next launch, revalidates in the background, and only
 * shows the new build on the launch after that — while `activate` purges
 * nothing, because the name it is comparing against is its own.
 *
 * Changing the name makes `install` re-fetch every asset under a fresh key and
 * `activate` delete the stale one; with skipWaiting() + clients.claim() already
 * in place below, an existing installation picks the update up on next launch
 * instead of the one after.
 *
 * v2 — UI redesign (dark theme + Compass Advance), HRE Phase 9 upkeep, S11 sale.
 * v3 — five independent identity axes, romantic orientation, intersex variations.
 */
const CACHE_NAME = "a-life-cache-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./storage-polyfill.js",
  "./life-sim.bundle.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
