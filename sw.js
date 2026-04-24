const CACHE_NAME = "star-paper-shell-v71";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=27",
  "./styles.premium.css?v=7",
  "./styles.shell.css?v=2",
  "./star-paper-tokens.css?v=21",
  "./supabase.js?v=27",
  "./app.migrations.js?v=9",
  "./app.actions.js?v=8",
  "./app.todayboard.js?v=1",
  "./app.tasks.js?v=3",
  "./app.reports.js?v=11",
  "./app.js?v=61",
  "./app.premium.js?v=4",
  "./sw.js?v=70",
  "./manifest.json",
  "./manifest.json?v=21",
  "./logo.svg",
  "./logo.svg?v=13",
  "./logo-ui.png",
  "./logo-ui.png?v=21",
  "./logo.png",
  "./logo.png?v=21",
  "./logo-192.png",
  "./logo-192.png?v=21",
  "./logo-32.png",
  "./logo-32.png?v=21",
  "./apple-touch-icon.png",
  "./apple-touch-icon.png?v=21",
  "./logo-report.png",
  "./logo-report.png?v=21",
  "./favicon.ico?v=21",
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
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || Response.error())
      )
  );
});
