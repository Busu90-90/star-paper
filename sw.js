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
// Versioned shell files never change at the same URL, so they live in one
// cache that survives worker updates; a new deploy only downloads what changed.
const ASSET_CACHE = "star-paper-assets";
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
// Installing must stay light: on mobile data a full precache (about 9 MB of
// images, the 3D globe and map data) competed with sign-in and made the first
// load after every deploy crawl. Images, the globe and map data are cached
// the first time they are used instead.
const HEAVY_SHELL_ASSET = /\.(png|jpe?g|webp|json)(\?|$)|\/three\/|\/world-atlas\//;
const isVersionedAsset = (asset) => /[?&]v=/.test(String(asset));
const CORE_SHELL = APP_SHELL.filter((asset) => isVersionedAsset(asset) && !HEAVY_SHELL_ASSET.test(asset));
const UNVERSIONED_SHELL = APP_SHELL.filter((asset) => !isVersionedAsset(asset));

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

function shouldRedirectNavigationResponse(request, response) {
  if (!response || !response.redirected || !response.url || request.mode !== "navigate") {
    return false;
  }
  const requestUrl = new URL(request.url);
  const responseUrl = new URL(response.url);
  return responseUrl.origin === requestUrl.origin && responseUrl.href !== requestUrl.href;
}

function isFreshOnlyReportRuntimeAsset(url) {
  return REPORT_RUNTIME_ASSETS.has(`${url.pathname}${url.search}`);
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

async function precacheCoreShell() {
  const cache = await caches.open(ASSET_CACHE);
  const missing = [];
  for (const asset of CORE_SHELL) {
    if (!(await cache.match(asset))) missing.push(asset);
  }
  await cache.addAll(missing);
  // Unversioned pages (index.html) are refreshed with every worker version.
  await (await caches.open(CACHE_NAME)).addAll(UNVERSIONED_SHELL);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheCoreShell());
  self.skipWaiting();
});

async function pruneAssetCache() {
  const cache = await caches.open(ASSET_CACHE);
  const requests = await cache.keys();
  await Promise.all(requests
    .filter((req) => {
      const url = new URL(req.url);
      return !APP_SHELL_URLS.has(`${url.pathname}${url.search}`);
    })
    .map((req) => cache.delete(req)));
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(pruneAssetCache)
  );
  self.clients.claim();
});

// Tapping a Star Paper notification opens the app on the thing it is about.
self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || null;
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    let client = windows.find((c) => new URL(c.url).origin === self.location.origin) || null;
    if (client) {
      client = await client.focus().catch(() => client);
    } else {
      client = await self.clients.openWindow("./");
      // A fresh window needs a moment to boot before it can act on the message.
      if (client && data) await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    if (client && data && data.action) {
      client.postMessage({ type: "sp:notification-open", action: data.action, actionId: data.actionId || "" });
    }
  })());
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
    // Revalidate with the server (a cheap 304 when unchanged) instead of
    // downloading the whole bundle again on every load.
    event.respondWith(
      fetch(request)
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

  if (!url.searchParams.has("v")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Cache first: the URL carries the file's version, so a cached copy is
  // always the right one and repeat visits skip the network entirely.
  event.respondWith(
    caches.open(ASSET_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) cache.put(request, response.clone());
          return response;
        });
      })
    ).catch(() =>
      caches.match(request).then((cached) => cached || Response.error())
    )
  );
});
}
