(function applyStoredThemeBeforePaint() {
  try {
    document.body.classList.toggle('light-theme', localStorage.getItem('starPaperTheme') === 'light');
    document.body.classList.toggle('sp-shell-refined', document.documentElement.classList.contains('sp-shell-refined'));
    document.body.classList.toggle('sp-shell-off', document.documentElement.classList.contains('sp-shell-off'));
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
    var hasAppHash = isAppShellPath && /^(artists|bookings|calendar|dashboard|expenses|financials|global|money|otherincome|reports|schedule|settings|tasks)$/.test(hashToken);
    if (hasAuthCallback || hasAppHash || marker === 'auth-return') {
      document.documentElement.classList.add('sp-force-boot');
    }
  } catch (_err) {}
})();
