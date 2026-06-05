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
    } catch (_err) {
      window.scrollTo(0, 0);
    }
    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    var landing = document.getElementById('landingScreen');
    if (landing) landing.scrollTop = 0;
  }

  function stripIfPublicHash() {
    var decodedHash = getDecodedHash();
    if (appHashPattern.test(decodedHash) || publicSectionHashPattern.test(decodedHash)) {
      window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
      resetPublicScrollTop();
    }
  }

  try {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  } catch (_err) {}

  stripIfPublicHash();
  resetPublicScrollTop();
  window.addEventListener('hashchange', stripIfPublicHash);
  window.addEventListener('popstate', stripIfPublicHash);
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
