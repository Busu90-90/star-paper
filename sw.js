const CACHE_NAME = "star-paper-shell-v38";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./supabase.js?v=19",
  "./app.migrations.js?v=9",
  "./app.actions.js?v=8",
  "./app.todayboard.js?v=1",
  "./app.tasks.js?v=2",
  "./app.reports.js?v=10",
  "./app.js?v=37",
  "./sw.js?v=38",
  "./manifest.json",
  "./manifest.json?v=14",
  "./logo.svg",
  "./logo.svg?v=12",
  "./logo.png",
  "./logo-192.png",
  "./logo-192.png?v=12",
  "./logo-32.png",
  "./logo-32.png?v=12",
  "./apple-touch-icon.png",
  "./apple-touch-icon.png?v=12",
  "./logo-report.png",
  "./logo-report.png?v=12",
  "./favicon.ico?v=12",
];

const APP_SHELL_URLS = new Set(
  APP_SHELL.map((asset) => {
    const url = new URL(asset, self.location.href);
    return `${url.pathname}${url.search}`;
  })
);

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isCacheableAppShellRequest(request) {
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return false;
  if (request.headers.has("authorization")) return false;
  if (url.searchParams.has("access_token") || url.searchParams.has("refresh_token") || url.searchParams.has("code")) {
    return false;
  }
  return APP_SHELL_URLS.has(`${url.pathname}${url.search}`);
}

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
  const url = new URL(request.url);

  if (!isSameOrigin(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", clone));
          }
          return response;
        })
        .catch(() =>
          caches.match("./index.html").then((cached) => cached || Response.error())
        )
    );
    return;
  }

  if (!isCacheableAppShellRequest(request)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
