/* Y-COMPS service worker — offline-first for app shell + static assets,
   network-first for pages and everything under /api (to avoid stale data).
   The app handles its own offline mutation queue via IndexedDB, so we don't
   try to queue POST bodies here. */

const SHELL = "ycomps-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        cache.addAll(["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API, auth, or websocket traffic.
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/_next/data") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  const isPage = event.request.mode === "navigate";
  const isStatic =
    url.pathname.startsWith("/_next/static") ||
    /\.(png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?)$/.test(url.pathname);

  if (isStatic) {
    // Cache-first for immutable build assets.
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(SHELL).then((c) => c.put(event.request, clone));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (isPage) {
    // Network-first for pages; fall back to cached shell offline.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(SHELL).then((c) => c.put("/", clone));
          return res;
        })
        .catch(() => caches.match("/").then((c) => c || caches.match(event.request))),
    );
  }
});
