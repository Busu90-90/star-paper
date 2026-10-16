// Signed-out behaviour: landing header, showcase slides, reveal, count-up,
// and the auth form helpers (password eye, phone tidy-up).
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

  // Hero showcase: a horizontal scroll-snap track of slides. Tabs and arrows
  // scroll it; an IntersectionObserver keeps the active tab in sync with
  // swipes. Auto-advance rides on the active tab bar's CSS animation
  // (animationend), so hover, focus, reduced motion and hidden tabs pause it
  // without timers.
  function setupShow(root) {
    var show = root.querySelector('[data-lp-show]');
    if (!show) return null;
    var track = show.querySelector('[data-lp-track]');
    var slides = Array.prototype.slice.call(show.querySelectorAll('[data-lp-slide]'));
    var tabs = Array.prototype.slice.call(show.querySelectorAll('[data-lp-tab]'));
    if (!track || !slides.length) return null;
    var active = 0;
    var counter = show.querySelector('[data-lp-count-current]');

    function setActive(index) {
      active = index;
      slides.forEach(function (slide, i) {
        slide.toggleAttribute('data-active', i === index);
        slide.setAttribute('aria-hidden', i === index ? 'false' : 'true');
        slide.inert = i !== index;
      });
      tabs.forEach(function (tab, i) {
        tab.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
      if (counter) counter.textContent = String(index + 1);
    }

    function go(index, options) {
      var next = (index + slides.length) % slides.length;
      var smooth = !(options && options.instant) && !reduceMotion;
      track.scrollTo({ left: slides[next].offsetLeft - track.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
      setActive(next);
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { go(i); });
    });
    var prev = show.querySelector('[data-lp-prev]');
    var next = show.querySelector('[data-lp-next]');
    if (prev) prev.addEventListener('click', function () { go(active - 1); });
    if (next) next.addEventListener('click', function () { go(active + 1); });

    show.addEventListener('keydown', function (event) {
      if (event.target.closest && event.target.closest('input, textarea')) return;
      if (event.key === 'ArrowRight') { go(active + 1); event.preventDefault(); }
      if (event.key === 'ArrowLeft') { go(active - 1); event.preventDefault(); }
    });

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            var index = slides.indexOf(entry.target);
            if (index !== active) setActive(index);
          }
        });
      }, { root: track, threshold: [0.6] });
      slides.forEach(function (slide) { observer.observe(slide); });
    }

    if (!reduceMotion) {
      show.setAttribute('data-autoplay', 'on');
      tabs.forEach(function (tab) {
        tab.addEventListener('animationend', function (event) {
          if (event.animationName === 'lp-progress' && tab.getAttribute('aria-current') === 'true') go(active + 1);
        });
      });
      // A touch or swipe hands control to the reader: stop auto-advancing.
      track.addEventListener('pointerdown', function () { show.removeAttribute('data-autoplay'); }, { passive: true });
      document.addEventListener('visibilitychange', function () {
        show.toggleAttribute('data-paused', document.hidden);
      });
    }

    setActive(0);
    return { go: go, indexOf: function (id) { return slides.findIndex(function (s) { return s.id === id; }); } };
  }

  // Header, footer and hero links to #how / #proof / #voices open that slide.
  function setupSlideLinks(root, show) {
    if (!show) return;
    var showEl = root.querySelector('[data-lp-show]');

    function openSlide(id, options) {
      var index = show.indexOf(id);
      if (index < 0) return false;
      show.go(index, options);
      if (showEl && !(options && options.stay)) showEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      return true;
    }

    root.addEventListener('click', function (event) {
      var link = event.target.closest ? event.target.closest('a[href^="#"]') : null;
      if (!link) return;
      var id = link.getAttribute('href').slice(1);
      if (openSlide(id)) {
        event.preventDefault();
        try { window.history.replaceState(null, '', '#' + id); } catch (_err) {}
      }
    });

    // Deep links: #how, or ?slide=how from the retired standalone page URLs.
    var initial = String(window.location.hash || '').replace(/^#/, '');
    try {
      var params = new URLSearchParams(window.location.search);
      var fromQuery = params.get('slide');
      if (fromQuery) {
        initial = fromQuery;
        params.delete('slide');
        var query = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + '#' + fromQuery);
      }
    } catch (_err) {}
    if (initial) openSlide(initial, { instant: true, stay: true });
  }

  function setupHeader(root) {
    var header = root.querySelector('[data-lp-header]');
    if (!header) return;

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

  // Auth form helpers. Delegated, so they work whenever #loginScreen shows.
  function setupAuthHelpers() {
    document.addEventListener('click', function (event) {
      var eye = event.target.closest ? event.target.closest('[data-lp-eye]') : null;
      if (!eye) return;
      event.preventDefault();
      var input = document.getElementById(eye.getAttribute('data-lp-eye'));
      if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', show ? 'true' : 'false');
      eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      var icon = eye.querySelector('i');
      if (icon) icon.className = show ? 'ph ph-eye-slash' : 'ph ph-eye';
    });
    // Postel's law: accept "+256 700-000 000" or "(0700) 000 000", store it clean.
    document.addEventListener('blur', function (event) {
      var target = event.target;
      if (!target || target.id !== 'signupPhone') return;
      var raw = String(target.value || '').trim();
      var cleaned = raw.replace(/(?!^\+)[^\d]/g, '');
      if (cleaned !== raw) target.value = cleaned;
    }, true);
    document.addEventListener('blur', function (event) {
      var target = event.target;
      if (!target || target.type !== 'email' || !target.closest || !target.closest('#loginScreen')) return;
      var trimmed = String(target.value || '').trim();
      if (trimmed !== target.value) target.value = trimmed;
    }, true);
  }

  setupAuthHelpers();

  onReady(function mountLanding() {
    var root = document.getElementById('landingScreen');
    if (!root || !root.classList.contains('lp')) return;
    setupHeader(root);
    setupSlideLinks(root, setupShow(root));
    setupReveal(root);
    setupCountUp(root);
  });
})();
