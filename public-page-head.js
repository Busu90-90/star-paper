(function publicPageHeadBoot() {
  'use strict';

  var appHashPattern = /^(artists|bookings|calendar|dashboard|expenses|financials|global|money|otherIncome|reports|schedule|settings|tasks)(?:[?&/].*)?$/i;

  function getDecodedHash() {
    try {
      return decodeURIComponent(String(window.location.hash || '').replace(/^#/, '')).trim();
    } catch (_err) {
      return String(window.location.hash || '').replace(/^#/, '').trim();
    }
  }

  function stripIfAppHash() {
    if (appHashPattern.test(getDecodedHash())) {
      window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
    }
  }

  stripIfAppHash();
  window.addEventListener('hashchange', stripIfAppHash);
  window.addEventListener('popstate', stripIfAppHash);

  try {
    if (localStorage.getItem('sp_handcraft_off') === '1' || localStorage.getItem('sp_prem_off') === '1') {
      document.documentElement.classList.add('sp-handcraft-off');
    }
  } catch (_err) {}
})();
