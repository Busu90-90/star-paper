(function applyStoredThemeBeforePaint() {
  try {
    document.body.classList.toggle('light-theme', localStorage.getItem('starPaperTheme') === 'light');
  } catch (_err) {}
})();

(function forceBootForAuthOrAppRoutes() {
  try {
    var key = 'sp_boot_context';
    var marker = sessionStorage.getItem(key) || '';
    var url = new URL(window.location.href);
    var hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
    var hasAuthCallback = Boolean(
      hashParams.get('access_token') ||
      hashParams.get('refresh_token') ||
      url.searchParams.get('access_token') ||
      url.searchParams.get('refresh_token') ||
      url.searchParams.get('code') ||
      url.searchParams.get('error') ||
      url.searchParams.get('error_code') ||
      url.searchParams.get('error_description')
    );
    var routePath = (url.pathname || '/').replace(/\/+$/, '') || '/';
    var hashToken = decodeURIComponent((url.hash || '').replace(/^#/, '')).trim().split(/[?&/]/)[0].toLowerCase();
    var isAppShellPath = routePath === '/' || routePath === '/index.html';
    var hasAppHash = isAppShellPath && /^(artists|bookings|calendar|cashflow|crew|dashboard|documents|expenses|financials|global|money|otherincome|receivables|reports|schedule|settings|tasks)$/.test(hashToken);
    // A signed-in visitor reloading goes straight to the app loader instead
    // of flashing the landing first (app.js drops this if the session fails).
    var hasStoredSession = false;
    if (localStorage.getItem('sp_logged_out') !== '1') {
      hasStoredSession = Boolean(localStorage.getItem('sp-starpaper-auth-v1'));
      for (var i = 0; !hasStoredSession && i < localStorage.length; i += 1) {
        var storedKey = localStorage.key(i) || '';
        hasStoredSession = storedKey.indexOf('sb-fxcyocdwvjiyatqnaahg-auth-token') === 0 || storedKey.indexOf('sp-starpaper-auth-v1.') === 0;
      }
    }
    if (hasAuthCallback || hasAppHash || hasStoredSession || marker === 'auth-return') {
      document.documentElement.classList.add('sp-force-boot');
    }
  } catch (_err) {}
})();
