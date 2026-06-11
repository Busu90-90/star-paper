(function publicPageHeadBoot() {
  'use strict';

  var appHashPattern = /^(artists|bookings|calendar|dashboard|expenses|financials|global|money|otherIncome|reports|schedule|settings|tasks)(?:[?&/].*)?$/i;
  var publicSectionHashPattern = /^(landing-features|landingFinalCta|landing-testimonials|landing-proof|proof|testimonials|features)$/i;

  function getDecodedHash() {
    try {
      return decodeURIComponent(String(window.location.hash || '').replace(/^#/, '')).trim();
    } catch (_err) {
      return String(window.location.hash || '').replace(/^#/, '').trim();
    }
  }

  function resetPublicScrollTop() {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch (_err1) {
      window.scrollTo(0, 0);
    }

    var doc = document.documentElement;
    if (doc) doc.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    var landing = document.getElementById('landingScreen');
    if (landing) landing.scrollTop = 0;
  }

  function stripIfPublicHash() {
    var hash = getDecodedHash();
    if (appHashPattern.test(hash) || publicSectionHashPattern.test(hash)) {
      window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
      resetPublicScrollTop();
    }
  }

  try {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  } catch (_err2) {}

  stripIfPublicHash();
  resetPublicScrollTop();
  window.addEventListener('hashchange', stripIfPublicHash);
  window.addEventListener('popstate', function onPublicPopState() {
    stripIfPublicHash();
    resetPublicScrollTop();
  });
  window.addEventListener('pageshow', resetPublicScrollTop);
  window.addEventListener('load', resetPublicScrollTop);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', resetPublicScrollTop, { once: true });
  } else {
    resetPublicScrollTop();
  }

  try {
    if (localStorage.getItem('sp_handcraft_off') === '1' || localStorage.getItem('sp_prem_off') === '1') {
      document.documentElement.classList.add('sp-handcraft-off');
    }
  } catch (_err) {}
})();
