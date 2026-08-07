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
 * v4 — EDU phases 1-6: country/era education model, institutions, admissions.
 * v5 — EDU phase 7: school life, crystallised institutions, boarding.
 * v6 — EDU phase 8: post-secondary, adult education, call-site inversion.
 * v7 — IQ scale, romantic discovery as a scene, non-transition hormone therapy.
 * v8 — Health subsystem (HLT): eleven subtabs, emergent lifestyle, era-gated
 *      vaccination, addiction, disability, allergies, medical history.
 * v9 — People subsystem (PPL): eighteen categories over a derived taxonomy,
 *      favourites, generated colleagues/neighbours/rivals. Stat rounding fix.
 * v10 — Career subtabs, one shared scrollable subtab bar with an affordance,
 *      and rebindable keyboard shortcuts with a settings screen.
 * v11 — EVT P1: procedurally proposed events with a validator. Favourite-star
 *      re-render fix. IQ range widened to 75-180.
 * v12 — Gender expression as its own axis for EVERY life: a derived style, an
 *      era-scaled friction, three events, and a school panel that no longer
 *      offers trans-only options to cisgender pupils. A same-sex partner is
 *      standing evidence of the orientation, so coming out to them cannot
 *      go badly.
 */
const CACHE_NAME = "a-life-cache-v12";
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
