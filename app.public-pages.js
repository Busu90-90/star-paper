(function publishStarPaperPublicPages(global) {
  'use strict';

  const rootHtml = Object.freeze([
    // The landing, its showcase slides and sign-in all live in index.html.
    // The old /how-it-works, /proof and /testimonials URLs 301 to a slide (_redirects).
    Object.freeze({ file: 'index.html', marker: 'app-shell', routes: Object.freeze([]) }),
    // Legal pages stand alone so they open without the app.
    Object.freeze({ file: 'privacy.html', marker: 'public-landing', routes: Object.freeze(['/privacy', '/privacy.html']) }),
    Object.freeze({ file: 'terms.html', marker: 'public-landing', routes: Object.freeze(['/terms', '/terms.html']) }),
    Object.freeze({ file: 'pricing.html', marker: 'public-landing', routes: Object.freeze(['/pricing', '/pricing.html']) })
  ]);

  function landingTarget(file) {
    return '/' + String(file || '').replace(/^\/+/, '');
  }

  function buildPublicLandingRoutes() {
    const routes = [];
    for (let pageIndex = 0; pageIndex < rootHtml.length; pageIndex += 1) {
      const page = rootHtml[pageIndex];
      if (!page || page.marker !== 'public-landing') continue;
      const target = landingTarget(page.file);
      for (let routeIndex = 0; routeIndex < page.routes.length; routeIndex += 1) {
        routes.push(Object.freeze([page.routes[routeIndex], target]));
      }
    }
    return Object.freeze(routes);
  }

  const publicLandingRoutes = buildPublicLandingRoutes();

  function rootHtmlMap() {
    const map = new Map();
    for (let index = 0; index < rootHtml.length; index += 1) {
      const page = rootHtml[index];
      map.set(page.file, page.marker);
    }
    return map;
  }

  function publicLandingRouteMap() {
    return new Map(publicLandingRoutes);
  }

  function normalizePathname(pathname) {
    return (String(pathname || '/') || '/').replace(/\/+$/, '') || '/';
  }

  function targetForPublicRoute(pathname) {
    const normalizedPathname = normalizePathname(pathname);
    for (let index = 0; index < publicLandingRoutes.length; index += 1) {
      const route = publicLandingRoutes[index];
      if (route[0] === normalizedPathname) return route[1];
    }
    return '';
  }

  global.SP_PUBLIC_PAGES = Object.freeze({
    rootHtml,
    publicLandingRoutes,
    rootHtmlMap,
    publicLandingRouteMap,
    targetForPublicRoute
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window));
