// Lets deferred scripts tell "parsing done" (readyState 'interactive') from
// "every deferred script has run" (DOMContentLoaded).
document.addEventListener('DOMContentLoaded', function markDomContentLoaded() {
  window.__spDomContentLoaded = true;
}, { once: true });

(function redirectLegacyNetlifyOrigin() {
  if (window.location.hostname !== 'starpaper.netlify.app') return;
  var canonicalUrl = new URL(window.location.href);
  canonicalUrl.protocol = 'https:';
  canonicalUrl.hostname = 'star-paper.netlify.app';
  var redirected = false;
  function goCanonical() {
    if (redirected) return;
    redirected = true;
    window.location.replace(canonicalUrl.toString());
  }
  var cleanupTasks = [];
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
    cleanupTasks.push(
      navigator.serviceWorker.getRegistrations()
        .then(function(registrations) {
          return Promise.all(registrations.map(function(registration) {
            return registration.unregister().catch(function() {});
          }));
        })
    );
  }
  if (window.caches && caches.keys) {
    cleanupTasks.push(
      caches.keys().then(function(keys) {
        return Promise.all(keys
          .map(function(key) { return caches.delete(key).catch(function() {}); }));
      })
    );
  }
  Promise.race([
    Promise.allSettled(cleanupTasks),
    new Promise(function(resolve) { setTimeout(resolve, 400); })
  ]).then(goCanonical);
})();

(function isolatePublicRouteShells() {
  var publicPages = window.SP_PUBLIC_PAGES;
  if (!publicPages || typeof publicPages.targetForPublicRoute !== 'function') return;
  var pathname = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  var canonicalPath = publicPages.targetForPublicRoute(pathname);
  if (!canonicalPath) return;
  var hash = window.location.hash || '';
  var decodedHash = '';
  try {
    decodedHash = decodeURIComponent(hash.replace(/^#/, '')).trim();
  } catch (_err) {
    decodedHash = hash.replace(/^#/, '').trim();
  }
  var appHashPattern = /^(artists|bookings|calendar|cashflow|crew|dashboard|documents|expenses|financials|global|money|otherIncome|receivables|reports|schedule|settings|tasks)(?:[?&/].*)?$/i;
  var targetHash = appHashPattern.test(decodedHash) ? '' : hash;
  var target = canonicalPath + (window.location.search || '') + targetHash;
  var current = window.location.pathname + (window.location.search || '') + hash;
  if (target !== current) {
    window.location.replace(target);
  }
})();

// On a slow phone the landing page shows long before the app's scripts arrive,
// so "Sign in" and "Start free" used to do nothing for many seconds. Catch
// those taps early, show the button is working, and replay the tap once the
// app is ready.
(function queueEarlyAuthTaps() {
  var pending = null;
  var timer = null;
  function ready() { return Boolean(window.__starPaperMainEventsBound); }
  function replay() {
    if (!ready()) return;
    clearInterval(timer);
    timer = null;
    var btn = pending;
    pending = null;
    if (!btn) return;
    btn.removeAttribute('aria-busy');
    if (document.contains(btn)) btn.click();
  }
  document.addEventListener('click', function (event) {
    if (ready() || !event.target || !event.target.closest) return;
    var btn = event.target.closest('[data-action="showLoginForm"], [data-action="showSignupForm"]');
    if (!btn) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pending && pending !== btn) pending.removeAttribute('aria-busy');
    pending = btn;
    btn.setAttribute('aria-busy', 'true');
    if (!timer) timer = setInterval(replay, 150);
  }, true);
})();
