// Signed-out page behaviour (landing, How it works, Proof, Testimonials).
// Only toggles attributes and classes; it never writes inline styles.
(function initStarPaperLanding() {
  'use strict';

  var reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function onReady(work) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', work, { once: true });
      return;
    }
    work();
  }

  function markCurrentPage(root) {
    var page = String(window.location.pathname || '').split('/').pop().replace(/\.html$/, '') || 'index';
    root.querySelectorAll('.lp-nav__link, .lp-sheet__link').forEach(function (link) {
      var target = String(link.getAttribute('href') || '').replace(/^\.\//, '').replace(/\.html$/, '');
      if (target && target === page) link.setAttribute('aria-current', 'page');
    });
  }

  function setupHeader(root) {
    var header = root.querySelector('[data-lp-header]');
    if (!header) return;
    var toggle = header.querySelector('[data-lp-menu-toggle]');
    var sheet = toggle ? document.getElementById(toggle.getAttribute('aria-controls')) : null;

    function setOpen(open) {
      if (!toggle || !sheet) return;
      sheet.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      var icon = toggle.querySelector('i');
      if (icon) icon.className = open ? 'ph ph-x' : 'ph ph-list';
      header.classList.toggle('is-open', open);
    }

    if (toggle && sheet) {
      toggle.addEventListener('click', function () {
        setOpen(sheet.hidden);
      });
      sheet.addEventListener('click', function (event) {
        if (event.target.closest('a, button')) setOpen(false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !sheet.hidden) {
          setOpen(false);
          toggle.focus();
        }
      });
      window.addEventListener('resize', function () {
        if (window.innerWidth >= 900) setOpen(false);
      }, { passive: true });
    }

    var ticking = false;
    function syncScrolled() {
      ticking = false;
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(syncScrolled);
    }, { passive: true });
    syncScrolled();
  }

  function setupReveal(root) {
    var items = root.querySelectorAll('[data-lp-reveal]');
    if (!items.length || reduceMotion || !('IntersectionObserver' in window)) return;
    root.classList.add('lp-reveal-ready');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(function (item) { observer.observe(item); });
  }

  // Counts a figure up from zero the first time it scrolls into view. The final
  // value is already in the markup, so no-JS and reduced-motion readers see it.
  function setupCountUp(root) {
    var figures = root.querySelectorAll('[data-lp-count]');
    if (!figures.length || reduceMotion || !('IntersectionObserver' in window)) return;
    var format = new Intl.NumberFormat('en-US');

    function run(el) {
      var target = Number(el.getAttribute('data-lp-count')) || 0;
      var start = performance.now();
      var duration = 1400;
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = format.format(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        run(entry.target);
      });
    }, { threshold: 0.6 });
    figures.forEach(function (el) { observer.observe(el); });
  }

  // Public pages link to ./index.html?auth=signup|login; open that form once the
  // app has settled on the signed-out landing (a signed-in session wins).
  function setupAuthIntent() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (_err) { return; }
    var intent = params.get('auth');
    if (intent !== 'signup' && intent !== 'login') return;
    params.delete('auth');
    var query = params.toString();
    var cleanUrl = window.location.pathname + (query ? '?' + query : '') + window.location.hash;

    var attempts = 0;
    function tryOpen() {
      attempts += 1;
      var landing = document.getElementById('landingScreen');
      var ready = landing && landing.classList.contains('screen-active');
      var open = intent === 'signup' ? window.showSignupForm : window.showLoginForm;
      if (ready && typeof open === 'function') {
        try { window.history.replaceState(null, '', cleanUrl); } catch (_err) {}
        open({ instant: true });
        return;
      }
      if (attempts < 40) setTimeout(tryOpen, 150);
    }
    tryOpen();
  }

  onReady(function mountLanding() {
    var root = document.getElementById('landingScreen');
    if (!root || !root.classList.contains('lp')) return;
    markCurrentPage(root);
    setupHeader(root);
    setupReveal(root);
    setupCountUp(root);
    if (root.getAttribute('data-page') === 'home') setupAuthIntent();
  });
})();
