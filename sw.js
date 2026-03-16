const CACHE_NAME = "star-paper-shell-v17";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./supabase.js",
  "./app.migrations.js?v=9",
  "./app.actions.js?v=8",
  "./app.todayboard.js?v=1",
  "./app.tasks.js?v=1",
  "./app.js?v=17",
  "./sw.js?v=17",
  "./manifest.json",
  "./manifest.json?v=14",
  "./logo.svg",
  "./logo.svg?v=11",
  "./logo.png",
  "./logo-192.png",
  "./logo-192.png?v=11",
  "./logo-32.png",
  "./logo-32.png?v=11",
  "./apple-touch-icon.png",
  "./apple-touch-icon.png?v=11",
  "./logo-report.png",
  "./logo-report.png?v=11",
  "./book.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const request = event.request;
  const isDocument = request.mode === "navigate";

  if (isDocument) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Stale-while-revalidate: serve cache immediately, update in background
        fetch(request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) return;
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          })
          .catch(() => {});
        return cached;
      }

      // Not in cache — fetch from network and cache for next time
      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) return networkResponse;
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(request));
    })
  );
});
