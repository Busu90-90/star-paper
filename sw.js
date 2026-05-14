const LEGACY_NETLIFY_HOST = "starpaper.netlify.app";
const CANONICAL_NETLIFY_ORIGIN = "https://star-paper.netlify.app";
const IS_LEGACY_NETLIFY_WORKER = self.location.hostname === LEGACY_NETLIFY_HOST;

async function clearStarPaperCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

function toCanonicalUrl(urlLike) {
  const url = new URL(urlLike, self.location.href);
  url.protocol = "https:";
  url.hostname = "star-paper.netlify.app";
  return url.toString();
}

async function redirectLegacyClients() {
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  await Promise.all(
    windowClients.map((client) =>
      client.navigate(toCanonicalUrl(client.url)).catch(() => {})
    )
  );
}

if (IS_LEGACY_NETLIFY_WORKER) {
  self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(clearStarPaperCaches());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      await clearStarPaperCaches();
      await self.clients.claim();
      await redirectLegacyClients();
      await self.registration.unregister();
    })());
  });

  self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== self.location.origin) return;
    event.respondWith(Response.redirect(toCanonicalUrl(event.request.url), 302));
  });
} else {
const SHELL_VERSION = "147";
const REPORT_BUNDLE_VERSION = "17";
const APP_BUNDLE_VERSION = "124";
const CACHE_NAME = `star-paper-shell-v${SHELL_VERSION}`;
const REPORT_RUNTIME_ASSETS = new Set(
  [
    `./app.reports.js?v=${REPORT_BUNDLE_VERSION}`,
    `./app.js?v=${APP_BUNDLE_VERSION}`,
  ].map((asset) => {
    const url = new URL(asset, self.location.href);
    return `${url.pathname}${url.search}`;
  })
);
const PUBLIC_LANDING_PAGES = new Map([
  ["/how-it-works", "./how-it-works.html"],
  ["/how-it-works.html", "./how-it-works.html"],
  ["/proof", "./proof.html"],
  ["/proof.html", "./proof.html"],
  ["/testimonials", "./testimonials.html"],
  ["/testimonials.html", "./testimonials.html"],
]);
const APP_SHELL = [
  "./index.html",
  "./how-it-works.html",
  "./proof.html",
  "./testimonials.html",
  "./styles.css?v=53",
  "./styles.premium.css?v=8",
  "./styles.shell.css?v=11",
  "./styles.handcraft.css?v=33",
  "./star-paper-tokens.css?v=21",
  "./supabase.js?v=71",
  "./app.migrations.js?v=10",
  "./app.actions.js?v=8",
  "./app.todayboard.js?v=1",
  "./app.tasks.js?v=4",
  `./app.reports.js?v=${REPORT_BUNDLE_VERSION}`,
  `./app.js?v=${APP_BUNDLE_VERSION}`,
  "./app.handcraft.js?v=18",
  "./app.globe.js?v=6",
  "./app.premium.js?v=4",
  "/assets/landing/notebook-board-desktop.webp?v=3",
  "/assets/landing/notebook-board-mobile.webp?v=3",
  "/manifest.json?v=24",
  "/star_paper_logo_pack/star_paper_32.png?v=3",
  "/star_paper_logo_pack/star_paper_64.png?v=3",
  "/star_paper_logo_pack/star_paper_128.png?v=3",
  "/star_paper_logo_pack/star_paper_256.png?v=3",
  "/star_paper_logo_pack/star_paper_512.png?v=3",
  "/star_paper_logo_pack/star_paper_1024.png?v=3",
  "/star_paper_logo_pack/star_paper_transparent.png?v=3",
  "/star_paper_logo_pack/star_paper_black.png?v=3",
  "/star_paper_logo_pack/star_paper_white.png?v=3",
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

function looksLikeFilePath(pathname) {
  const last = pathname.split("/").pop() || "";
  return last.includes(".");
}

// Treat extension-less same-origin app navigations as SPA routes and serve the app shell.
function isSpaNavigation(url) {
  if (!isSameOrigin(url)) return false;
  const pathname = url.pathname || "/";
  if (getPublicLandingPageShell(url)) return false;
  if (pathname === "/" || pathname.endsWith("/")) return true;
  if (looksLikeFilePath(pathname)) return false;
  return true;
}

function getPublicLandingPageShell(url) {
  if (!isSameOrigin(url)) return null;
  const pathname = (url.pathname || "/").replace(/\/$/, "");
  return PUBLIC_LANDING_PAGES.get(pathname) || null;
}

function freshRequest(request) {
  return new Request(request, { cache: "reload" });
}

function isFreshOnlyReportRuntimeAsset(url) {
  return REPORT_RUNTIME_ASSETS.has(`${url.pathname}${url.search}`);
}

function networkFirstNavigation(request, fallbackShell) {
  const networkRequest = fallbackShell || request;
  return fetch(freshRequest(networkRequest))
    .then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => {
        if (cached || !fallbackShell) return cached || Response.error();
        return caches.match(fallbackShell).then((fallback) => fallback || Response.error());
      })
    );
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
    const publicLandingPageShell = getPublicLandingPageShell(url);
    if (publicLandingPageShell) {
      event.respondWith(networkFirstNavigation(request, publicLandingPageShell));
      return;
    }

    if (!isSpaNavigation(url)) {
      event.respondWith(networkFirstNavigation(request));
      return;
    }

    // HTML owns the report/PDF bundle URLs. Fetch the deployed shell before
    // falling back so old HTML cannot keep loading stale report code.
    event.respondWith(
      fetch(freshRequest(request))
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) =>
              cache.put("./index.html", clone));
          }
          return response;
        })
        .catch(() =>
          caches.match("./index.html").then((cached) => cached || Response.error())
        )
    );
    return;
  }

  if (isFreshOnlyReportRuntimeAsset(url)) {
    event.respondWith(
      fetch(freshRequest(request))
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
    );
    return;
  }

  if (!isCacheableAppShellRequest(request)) {
    return;
  }

  event.respondWith(
    fetch(freshRequest(request))
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
}
