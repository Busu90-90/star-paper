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
importScripts("./app.browser-assets.js");
importScripts("./app.public-pages.js");

const SP_ASSET_MANIFEST = self.SP_BROWSER_ASSETS;
const SP_PUBLIC_PAGES = self.SP_PUBLIC_PAGES;
const SHELL_VERSION = SP_ASSET_MANIFEST.version("sw.js");
const REPORT_BUNDLE_VERSION = SP_ASSET_MANIFEST.version("app.reports.js");
const APP_BUNDLE_VERSION = SP_ASSET_MANIFEST.version("app.js");
const CACHE_NAME = `star-paper-shell-v${SHELL_VERSION}`;
const REPORT_RUNTIME_ASSETS = new Set(
  [
    SP_ASSET_MANIFEST.url("./app.reports.js"),
    SP_ASSET_MANIFEST.url("./app.js"),
  ].map((asset) => {
    const url = new URL(asset, self.location.href);
    return `${url.pathname}${url.search}`;
  })
);
const PUBLIC_LANDING_PAGES = SP_PUBLIC_PAGES.publicLandingRouteMap();
const APP_SHELL = SP_ASSET_MANIFEST.appShell;

const APP_SHELL_URLS = new Set(
  APP_SHELL.map((asset) => {
    const url = new URL(asset, self.location.href);
    return `${url.pathname}${url.search}`;
  })
);
const AUTH_CALLBACK_CACHE_BYPASS_PARAMS = new Set([
  "access_token",
  "refresh_token",
  "code",
  "state",
  "type",
  "token_type",
  "expires_in",
  "error",
  "error_code",
  "error_description",
]);

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

function requestTarget(request) {
  if (typeof request !== "string") return request;
  return new URL(request, self.location.href).toString();
}

function freshRequest(request) {
  return new Request(requestTarget(request), { cache: "reload" });
}

function hasAuthCallbackCacheBypassParam(url) {
  for (const param of AUTH_CALLBACK_CACHE_BYPASS_PARAMS) {
    if (url.searchParams.has(param)) return true;
  }
  return false;
}

function isFreshOnlyReportRuntimeAsset(url) {
  return REPORT_RUNTIME_ASSETS.has(`${url.pathname}${url.search}`);
}

function shouldRedirectNavigationResponse(request, response) {
  if (!response || !response.redirected || !response.url || request.mode !== "navigate") return false;
  const requestUrl = new URL(request.url);
  const responseUrl = new URL(response.url);
  return responseUrl.origin === requestUrl.origin && responseUrl.href !== requestUrl.href;
}

function networkFirstNavigation(request, fallbackShell) {
  const requestUrl = new URL(request.url);
  const canCacheRequestUrl = !hasAuthCallbackCacheBypassParam(requestUrl);
  return fetch(freshRequest(request))
    .then((response) => {
      if ((response && response.ok) || !fallbackShell) return response;
      return fetch(freshRequest(fallbackShell));
    })
    .then((response) => {
      if (shouldRedirectNavigationResponse(request, response)) {
        return Response.redirect(response.url, 302);
      }
      if (response && response.ok && canCacheRequestUrl) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => {
      if (!canCacheRequestUrl) {
        if (!fallbackShell) return Response.error();
        return caches.match(fallbackShell).then((fallback) => fallback || Response.error());
      }
      return caches.match(request).then((cached) => {
        if (cached || !fallbackShell) return cached || Response.error();
        return caches.match(fallbackShell).then((fallback) => fallback || Response.error());
      });
    });
}

function isCacheableAppShellRequest(request) {
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return false;
  if (request.headers.has("authorization")) return false;
  if (url.searchParams.has("access_token") || url.searchParams.has("refresh_token") || url.searchParams.has("code")) {
    return false;
  }
  if (hasAuthCallbackCacheBypassParam(url)) return false;
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
      if (looksLikeFilePath(url.pathname)) {
        return;
      }
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
