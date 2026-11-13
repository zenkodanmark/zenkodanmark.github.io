/* App shell only. Notes, build, gallery, diary, images and fund.json stay uncached. */
const CACHE = "lucas-scooter-shell-v4";
const SHELL = [
  "/lucas-scooter/",
  "/lucas-scooter/index.html",
  "/lucas-scooter/manifest.webmanifest",
  "/lucas-scooter/icon-192.png",
  "/lucas-scooter/icon-512.png",
  "/lucas-scooter/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "no-cache" });
            if (response.ok && response.type === "basic") await cache.put(url, response);
          } catch {
            /* Online use still works if a shell file misses the cache. */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  /* Always fresh: notes, gallery, diary and images live on textdb. */
  if (url.hostname === "textdb.dev") return;
  if (url.pathname === "/lucas-scooter/fund.json") {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/lucas-scooter/")) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && fresh.type === "basic" && !fresh.redirected) {
      try {
        await cache.put(request, fresh.clone());
      } catch {
        /* Show the response even if this cache rejects it. */
      }
    }
    return fresh;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await caches.match("/lucas-scooter/index.html");
      if (shell) return shell;
    }
    throw error;
  }
}
